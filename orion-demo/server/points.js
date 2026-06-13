// 积分计算（后端）—— 与前端 db.js 的 getPlayerPoints 同语义
// 公式来源：DB.POINTS_RULES / DESIGN_BRIEF §11
const db = require('./db');
const { canonicalNameKey, playerNameKeys, isOrionTeam } = require('./name-utils');

const RULES = {
  training:           5,
  friendlyOrTraining: 10,
  leagueOrCup:        15,
  event:              5,
  mvp:                10,
  hr:                 10,
  triple:             3,
  double:             2,
  single:             1,
  rbi:                2,
  so:                 3,
  bb_pitcher:        -3,
  error:             -3,
  seasonMvp:          100,
  goldGlove:          50,
  silverBat:          50,
  hallOfFame:         200,
};

// 一次性把数据库的 players + games + tournaments + events + attendances + adjustments + hof 全拉出来
// 数据量小（53 球员 / 10 场以内），全表扫不慢
async function loadAll() {
  const [players, games, tournaments, events, attendances, adjustments, hof] = await Promise.all([
    db.q('SELECT * FROM players'),
    db.q('SELECT * FROM games'),
    db.q('SELECT * FROM tournaments'),
    db.q('SELECT id, title FROM events'),
    db.q('SELECT * FROM attendances'),
    db.q('SELECT * FROM points_adjustments'),
    db.q('SELECT * FROM hall_of_fame'),
  ]);
  return { players, games, tournaments, events, attendances, adjustments, hof };
}

function getEventTitle(events, refId) {
  const e = events?.find(x => x.id === refId);
  return e?.title || '';
}

function rowMatchesPlayer(row, player, nameKeys) {
  if (!row) return false;
  if (row.playerId && row.playerId === player.id) return true;
  if (row.player_id && row.player_id === player.id) return true;
  return nameKeys.has(canonicalNameKey(row.name || row.playerName));
}

function normalizeSeasonFilter(options) {
  if (!options) return '';
  if (typeof options === 'string') return options.trim();
  return String(options.season || '').trim();
}

function itemMatchesSeason(item, season) {
  if (!season) return true;
  const date = String(item.date || '');
  const detailSeason = String(item.detail?.season || '');
  return date.startsWith(season) || detailSeason === season;
}

function rebuildBreakdownFromTimeline(timeline) {
  return (timeline || []).reduce((acc, item) => {
    const delta = Number(item.delta || 0);
    const detail = item.detail || {};
    if (item.source === 'game') {
      const appearance = Number(detail.appearance || 0);
      const performance = Number(
        detail.performance !== undefined ? detail.performance : delta - appearance
      );
      acc.base += appearance;
      acc.performance += performance;
    } else if (item.source === 'training' || item.source === 'event') {
      acc.base += delta;
    } else if (item.source === 'award' || item.source === 'hof') {
      acc.awards += delta;
    } else if (item.source === 'manual') {
      acc.manual += delta;
    }
    return acc;
  }, { base: 0, performance: 0, awards: 0, manual: 0 });
}

function applySeasonFilter(result, season) {
  if (!season) return result;
  const timeline = (result.timeline || []).filter(item => itemMatchesSeason(item, season));
  const breakdown = rebuildBreakdownFromTimeline(timeline);
  return {
    total: breakdown.base + breakdown.performance + breakdown.awards + breakdown.manual,
    breakdown,
    timeline,
  };
}

// 计算单球员积分：返回 { total, breakdown, timeline }
function computePlayerPoints(playerId, all, options = {}) {
  const season = normalizeSeasonFilter(options);
  const player = all.players.find(p => p.id === playerId);
  if (!player) return { total: 0, breakdown:{base:0,performance:0,awards:0,manual:0}, timeline: [] };
  const R = RULES;
  const nameKeys = playerNameKeys(player);
  const tournamentMap = new Map((all.tournaments || []).map(t => [t.id, t]));
  const eventMap = new Map((all.events || []).map(e => [e.id, e]));
  const timeline = [];
  let base = 0, performance = 0, awards = 0, manual = 0;

  // 1. 比赛积分（出场 + 表现）
  for (const g of all.games) {
    if (g.is_aggregate) continue;
    const tType = tournamentMap.get(g.tournament_id)?.type || 'friendly';
    const isLeagueOrCup = (tType === 'league' || tType === 'cup');
    const battingArr  = g.batting  || [];
    const pitchingArr = g.pitching || [];
    const battingLine  = battingArr.find(b => rowMatchesPlayer(b, player, nameKeys));
    const pitchingLine = pitchingArr.find(p => rowMatchesPlayer(p, player, nameKeys));
    if (!battingLine && !pitchingLine) continue;

    const apperancePts = isLeagueOrCup ? R.leagueOrCup : R.friendlyOrTraining;
    base += apperancePts;
    const oppName = isOrionTeam(g.home) ? g.away : g.home;
    const perfPieces = [];

    let mvpBonus = 0;
    if (
      (g.mvp_player_id && g.mvp_player_id === player.id) ||
      (!g.mvp_player_id && g.mvp_player_name && nameKeys.has(canonicalNameKey(g.mvp_player_name)))
    ) {
      mvpBonus = R.mvp; perfPieces.push(`MVP +${R.mvp}`);
    }

    let battingBonus = 0;
    if (battingLine) {
      const _1B = battingLine._1B || 0;
      const _2B = battingLine._2B || 0;
      const _3B = battingLine._3B || 0;
      const HR  = battingLine.HR  || 0;
      const hasGraded = (_1B + _2B + _3B + HR) > 0;
      if (hasGraded) {
        if (_1B) { battingBonus += _1B * R.single; perfPieces.push(`1B×${_1B} +${_1B*R.single}`); }
        if (_2B) { battingBonus += _2B * R.double; perfPieces.push(`2B×${_2B} +${_2B*R.double}`); }
        if (_3B) { battingBonus += _3B * R.triple; perfPieces.push(`3B×${_3B} +${_3B*R.triple}`); }
        if (HR)  { battingBonus += HR  * R.hr;     perfPieces.push(`HR×${HR} +${HR*R.hr}`); }
      } else {
        const H = battingLine.H || 0;
        if (H) { battingBonus += H * R.single; perfPieces.push(`H×${H} +${H*R.single}`); }
      }
      const RBI = battingLine.RBI || 0;
      if (RBI) { battingBonus += RBI * R.rbi; perfPieces.push(`RBI×${RBI} +${RBI*R.rbi}`); }
      const E = battingLine.E || 0;
      if (E) { battingBonus += E * R.error; perfPieces.push(`E×${E} ${E*R.error}`); }
    }

    let pitchingBonus = 0;
    if (pitchingLine) {
      const SO = pitchingLine.SO || 0;
      const BB = pitchingLine.BB || 0;
      if (SO) { pitchingBonus += SO * R.so;        perfPieces.push(`SO×${SO} +${SO*R.so}`); }
      if (BB) { pitchingBonus += BB * R.bb_pitcher; perfPieces.push(`BB×${BB} ${BB*R.bb_pitcher}`); }
    }

    const perfTotal = mvpBonus + battingBonus + pitchingBonus;
    performance += perfTotal;
    const gameDelta = apperancePts + perfTotal;
    const t = tournamentMap.get(g.tournament_id);
    const gameDate = g.date ? new Date(g.date).toISOString().slice(0,10) : null;
    timeline.push({
      date: gameDate,
      source: 'game', refId: g.id,
      label: `${isLeagueOrCup ? '🏆' : '⚾'} vs ${oppName||'对手'} · ${isLeagueOrCup ? '联赛·杯赛' : '友谊·训练赛'}`,
      delta: gameDelta,
      detail: {
        appearance: apperancePts,
        performance: perfTotal,
        pieces: perfPieces,
        tournamentName: t?.short_name || t?.name || '',
        tournamentId: t?.id || g.tournament_id || null,
        gameId: g.id,
        season: t?.season || (gameDate ? gameDate.slice(0,4) : ''),
      }
    });
  }

  // 2. 训练 / 活动签到
  for (const a of all.attendances) {
    if (a.player_id !== playerId) continue;
    const delta = (a.kind === 'training') ? R.training : R.event;
    base += delta;
    const event = a.ref_id ? eventMap.get(a.ref_id) : null;
    const eventTitle = event?.title || getEventTitle(all.events, a.ref_id);
    let label = a.kind === 'training' ? '🏋 训练签到' : `🎉 活动出席`;
    if (eventTitle) label += ` · ${eventTitle}`;
    const attendDate = a.date ? new Date(a.date).toISOString().slice(0,10) : null;
    timeline.push({
      date: attendDate,
      source: a.kind, refId: a.ref_id, label, delta,
      detail: { note: a.note || '', eventId: event?.id || a.ref_id || null, eventTitle, season: attendDate ? attendDate.slice(0,4) : '' }
    });
  }

  // 3. 赛季奖项（从 player.titles[] 字符串识别）
  const titles = Array.isArray(player.titles) ? player.titles : [];
  for (const t of titles) {
    if (!t) continue;
    const s = String(t);
    let delta = 0, label = '';
    if (/赛季\s*MVP|赛季最佳/.test(s))      { delta = R.seasonMvp;  label = `★ 赛季奖项 · ${t}`; }
    else if (/金手套/.test(s))              { delta = R.goldGlove; label = `🥇 金手套 · ${t}`; }
    else if (/银棒/.test(s))                { delta = R.silverBat; label = `🥈 银棒奖 · ${t}`; }
    else if (/最佳投手/.test(s))            { delta = R.goldGlove; label = `🏅 最佳投手 · ${t}`; }
    if (delta && !/名人堂/.test(s)) {
      awards += delta;
      timeline.push({ date: '', source:'award', refId: null, label, delta, detail:{ title: t } });
    }
  }

  // 4. 名人堂
  const hofEntry = all.hof.find(h => h.player_id === playerId);
  if (hofEntry) {
    awards += R.hallOfFame;
    timeline.push({
      date: hofEntry.inducted_year ? `${hofEntry.inducted_year}-01-01` : '',
      source: 'hof', refId: null, label: `🌟 入选名人堂`, delta: R.hallOfFame,
      detail: { reason: hofEntry.reason || '', year: hofEntry.inducted_year, season: hofEntry.inducted_year ? String(hofEntry.inducted_year) : '' }
    });
  }

  // 5. 管理员手动调整
  for (const a of all.adjustments) {
    if (a.player_id !== playerId) continue;
    manual += a.delta;
    timeline.push({
      date: a.created_at ? new Date(a.created_at).toISOString().slice(0,10) : '',
      source: 'manual', refId: a.id,
      label: `⚙ 管理员调整${a.reason ? ' · ' + a.reason : ''}`,
      delta: a.delta,
      detail: { reason: a.reason || '', createdAt: a.created_at, gameId: a.game_id || null, season: a.created_at ? new Date(a.created_at).toISOString().slice(0,4) : '' }
    });
  }

  timeline.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const result = {
    total: base + performance + awards + manual,
    breakdown: { base, performance, awards, manual },
    timeline,
  };
  return applySeasonFilter(result, season);
}

// 排行榜
async function leaderboard(options = {}) {
  const season = normalizeSeasonFilter(options);
  const all = await loadAll();
  return all.players.map(p => {
    const pts = computePlayerPoints(p.id, all, { season });
    const gamesCount = pts.timeline.filter(t => t.source === 'game').length;
    return {
      player: { id: p.id, name: p.name, number: p.number, position: p.position, photo: p.photo, publicDisplayName: p.public_display_name || p.publicDisplayName || '', publicAvatar: p.public_avatar || p.publicAvatar || '', level: p.level },
      total: pts.total,
      breakdown: pts.breakdown,
      gamesCount,
    };
  }).filter(r => r.total !== 0 || r.gamesCount > 0).sort((a,b) => b.total - a.total);
}

async function getPlayerPoints(playerId, options = {}) {
  const all = await loadAll();
  return computePlayerPoints(playerId, all, options);
}

module.exports = { RULES, leaderboard, getPlayerPoints, loadAll, computePlayerPoints };
