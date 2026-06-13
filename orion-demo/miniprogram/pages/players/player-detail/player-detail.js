const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');
const { playerIdentity } = require('../../../utils/player-identity');

const PLAYER_GAME_PAGE_LIMIT = 30;

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function num(value) {
  return Number(value || 0);
}

function formatDelta(item) {
  const delta = num(item.delta);
  const target = timelineTarget(item);
  return {
    ...item,
    deltaText: delta > 0 ? `+${delta}` : String(delta),
    deltaClass: delta >= 0 ? 'positive' : 'negative',
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    rowClass: target.id ? 'is-link' : '',
    detailText: timelineDetailText(item),
  };
}

function timelineTarget(item) {
  const detail = item.detail || {};
  const source = item.source || '';
  const gameId = detail.gameId || (source === 'game' ? item.refId : '');
  if (gameId) return { type: 'game', id: gameId, label: '查看比赛' };
  const eventId = detail.eventId || ((source === 'training' || source === 'event') ? item.refId : '');
  if (eventId) return { type: 'event', id: eventId, label: '查看接龙' };
  return { type: '', id: '', label: '' };
}

function timelineDetailText(item) {
  const detail = item.detail || {};
  const pieces = [];
  if (detail.tournamentName) pieces.push(detail.tournamentName);
  if (detail.note) pieces.push(detail.note);
  if (item.source === 'manual' && detail.reason) pieces.push(`备注：${detail.reason}`);
  if (item.source === 'hof' && detail.reason) pieces.push(`入选事由：${detail.reason}`);
  if (detail.title) pieces.push(detail.title);
  return pieces.filter(Boolean).join(' · ');
}

function playerKeys(player) {
  const keys = new Set([norm(player.id), norm(player.name), norm(player.publicDisplayName)]);
  (player.aliases || []).forEach(alias => keys.add(norm(alias)));
  keys.delete('');
  return keys;
}

function rowMatches(row, player, keys) {
  if (!row) return false;
  if (row.playerId && row.playerId === player.id) return true;
  return keys.has(norm(row.name));
}

function compactStats(parts) {
  return parts.filter(Boolean).join(' · ') || '有出场记录';
}

function fmtAvg(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '.000';
  return n.toFixed(3).replace(/^0/, '');
}

function fmtPct(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(1)}%`;
}

function battingSummary(row) {
  if (!row) return '';
  return compactStats([
    `打击 ${num(row.H)}H/${num(row.AB)}AB`,
    num(row.RBI) ? `${num(row.RBI)} RBI` : '',
    num(row.R) ? `${num(row.R)} R` : '',
    num(row.HR) ? `${num(row.HR)} HR` : '',
    row.pos || '',
  ]);
}

function pitchingSummary(row) {
  if (!row) return '';
  return compactStats([
    '投手',
    row.IP ? `${row.IP} IP` : '',
    row.SO ? `${num(row.SO)} SO` : '',
    row.BB ? `${num(row.BB)} BB` : '',
    row.ER ? `${num(row.ER)} ER` : '',
  ]);
}

function normalizeBilibiliUrl(value) {
  const url = String(value || '').trim();
  return /bilibili\.com|b23\.tv/i.test(url) ? url : '';
}

function playerHighlightNames(player) {
  const seen = new Set();
  return [player.name, player.publicDisplayName].concat(player.aliases || [])
    .map(name => String(name || '').trim())
    .filter(name => {
      const key = norm(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchPlayerPublicHighlights(player) {
  const names = playerHighlightNames(player);
  if (!names.length) return [];
  const batches = await Promise.all(names.map(playerName => (
    api.get('/highlights', { public: 'true', playerName, limit: 24 }).catch(() => ({ highlights: [] }))
  )));
  const byId = {};
  batches.forEach(res => {
    (res.highlights || []).filter(isPublicHighlight).forEach(highlight => {
      if (highlight && highlight.id && !byId[highlight.id]) byId[highlight.id] = highlight;
    });
  });
  return Object.values(byId);
}

function isPublicHighlight(item) {
  return item && (item.status === 'published' || item.status === 'approved');
}

function highlightMatchesPlayer(highlight, player) {
  const keys = playerKeys(player);
  return keys.has(norm(highlight.playerName));
}

function formatPlayerHighlight(highlight, games, player) {
  const game = (games || []).find(item => item.id === highlight.gameId);
  const image = String(highlight.cover || '').trim();
  return {
    ...highlight,
    image,
    title: highlight.title || '球员精彩时刻',
    bilibiliUrl: normalizeBilibiliUrl(highlight.url),
    meta: [
      player.displayName || highlight.playerName || '',
      game ? [game.date, `${game.away || '-'} vs ${game.home || '-'}`].filter(Boolean).join(' · ') : '',
    ].filter(Boolean).join(' · '),
    metaClass: player.nameClass || '',
  };
}

function playerHighlights(highlights, player, games) {
  return (highlights || [])
    .filter(highlight => highlightMatchesPlayer(highlight, player))
    .map(highlight => formatPlayerHighlight(highlight, games, player))
    .filter(highlight => highlight.image)
    .slice(0, 9);
}

function normalizePlayer(player, viewer = {}) {
  const titles = Array.isArray(player.titles) ? player.titles.filter(Boolean) : [];
  const identity = playerIdentity(player, viewer);
  return {
    ...player,
    displayName: identity.displayName,
    avatar: identity.avatar,
    nameClass: identity.nameClass,
    avatarClass: identity.avatarClass,
    isFrostedName: identity.isFrostedName,
    isFrostedAvatar: identity.isFrostedAvatar,
    numberText: player.number ? `#${player.number}` : '未编号',
    positionText: player.position || '位置待定',
    handText: [player.bats ? `打 ${player.bats}` : '', player.throws ? `投 ${player.throws}` : ''].filter(Boolean).join(' / '),
    joinText: player.joinYear ? `${player.joinYear} 加入` : '',
    titles,
  };
}

function hasPermission(user, permission) {
  return (user?.permissions || []).includes(permission);
}

function editFields(player) {
  return {
    editName: player.name || '',
    editNumber: player.number || '',
    editPosition: player.position || '',
    editBats: player.bats || '',
    editThrows: player.throws || '',
    editJoinYear: player.joinYear ? String(player.joinYear) : '',
    editPhoto: player.photo || '',
    editSlogan: player.slogan || '',
    editTitles: (player.titles || []).join('、'),
    editAliases: (player.aliases || []).join('、'),
    editPublicDisplayName: player.publicDisplayName || '',
    editPublicAvatar: player.publicAvatar || '',
  };
}

function splitList(value) {
  return String(value || '')
    .split(/[,\n，、]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function playerGameParams(playerId, offset = 0) {
  return {
    includeAggregate: 'true',
    playerId,
    limit: PLAYER_GAME_PAGE_LIMIT,
    offset,
  };
}

function relatedGames(games, player) {
  const keys = playerKeys(player);
  return relatedSourceGames(games, player)
    .slice()
    .sort(compareGameDateDesc)
    .map(game => {
      const batting = (game.batting || []).find(row => rowMatches(row, player, keys));
      const pitching = (game.pitching || []).find(row => rowMatches(row, player, keys));
      if (!batting && !pitching) return null;
      return {
        id: game.id,
        title: `${game.away || '-'} vs ${game.home || '-'}`,
        meta: [game.date, game.seasonName || game.season, sportLabel(game.sport), game.isAggregate ? '赛季汇总' : ''].filter(Boolean).join(' · '),
        score: `${game.awayScore ?? '-'}:${game.homeScore ?? '-'}`,
        battingText: battingSummary(batting),
        pitchingText: pitchingSummary(pitching),
      };
    })
    .filter(Boolean);
}

function compareGameDateDesc(a, b) {
  return String(b?.date || '').localeCompare(String(a?.date || ''));
}

function compareGameDateAsc(a, b) {
  return String(a?.date || '').localeCompare(String(b?.date || ''));
}

function statGroupKey(game) {
  return [
    game?.tournamentId || '',
    game?.season || String(game?.date || '').slice(0, 4) || '',
    game?.sport || '',
  ].join('|');
}

function playerHasBatting(game, player, keys) {
  return (game?.batting || []).some(row => rowMatches(row, player, keys));
}

function playerHasAnyGameLine(game, player, keys) {
  return playerHasBatting(game, player, keys)
    || (game?.pitching || []).some(row => rowMatches(row, player, keys));
}

function relatedSourceGames(games, player) {
  const keys = playerKeys(player);
  const regularGroups = new Set();
  (games || []).forEach(game => {
    if (!game?.isAggregate && playerHasAnyGameLine(game, player, keys)) {
      regularGroups.add(statGroupKey(game));
    }
  });
  return (games || []).filter(game => {
    if (!playerHasAnyGameLine(game, player, keys)) return false;
    if (!game?.isAggregate) return true;
    return !regularGroups.has(statGroupKey(game));
  });
}

function statSourceGames(games, player) {
  const keys = playerKeys(player);
  const regularGroups = new Set();
  (games || []).forEach(game => {
    if (!game?.isAggregate && playerHasBatting(game, player, keys)) {
      regularGroups.add(statGroupKey(game));
    }
  });
  return (games || []).filter(game => {
    if (!playerHasBatting(game, player, keys)) return false;
    if (!game?.isAggregate) return true;
    return !regularGroups.has(statGroupKey(game));
  });
}

function aggregateBattingStats(games, player) {
  const keys = playerKeys(player);
  let AB = 0, H = 0, R = 0, RBI = 0, BB = 0, SO = 0, HBP = 0, SF = 0, HR = 0, GP = 0;
  let _1B = 0, _2B = 0, _3B = 0;
  const rows = [];
  statSourceGames(games, player).slice().sort(compareGameDateAsc).forEach(game => {
    const batting = (game.batting || []).find(row => rowMatches(row, player, keys));
    if (!batting) return;
    const rowAB = num(batting.AB);
    const rowH = num(batting.H);
    const rowBB = num(batting.BB);
    const rowHBP = num(batting.HBP);
    const rowSF = num(batting.SF);
    AB += rowAB;
    H += rowH;
    R += num(batting.R);
    RBI += num(batting.RBI);
    BB += rowBB;
    SO += num(batting.SO);
    HBP += rowHBP;
    SF += rowSF;
    HR += num(batting.HR);
    _1B += num(batting._1B);
    _2B += num(batting._2B);
    _3B += num(batting._3B);
    GP += num(batting.gp) || 1;
    rows.push({
      id: game.id,
      date: game.date || '',
      sport: game.sport,
      H: rowH,
      AB: rowAB,
      R: num(batting.R),
      RBI: num(batting.RBI),
      singleAvg: rowAB ? rowH / rowAB : 0,
      isAggregate: !!game.isAggregate,
    });
  });
  const PA = AB + BB + HBP + SF;
  const AVG = AB ? H / AB : 0;
  const OBP = PA ? (H + BB + HBP) / PA : 0;
  const hasExtras = (_1B + _2B + _3B + HR) > 0;
  const singles = hasExtras ? (_1B || Math.max(0, H - _2B - _3B - HR)) : 0;
  const totalBases = hasExtras ? singles + 2 * _2B + 3 * _3B + 4 * HR : H * 1.5;
  const SLG = AB ? totalBases / AB : 0;
  const OPS = OBP + SLG;
  let runningH = 0;
  let runningAB = 0;
  const trend = rows.map(row => {
    runningH += row.H;
    runningAB += row.AB;
    return {
      ...row,
      label: `${row.H}H/${row.AB}AB`,
      meta: [row.date, sportLabel(row.sport), row.isAggregate ? '赛季汇总' : ''].filter(Boolean).join(' · '),
      singleAvgText: fmtAvg(row.singleAvg),
      rollingAvgText: fmtAvg(runningAB ? runningH / runningAB : 0),
      barWidth: Math.max(8, Math.min(100, Math.round((row.singleAvg || 0) * 125))),
    };
  });
  return { AB, H, R, RBI, BB, SO, HBP, SF, HR, GP, PA, AVG, OBP, SLG, OPS, _1B: singles, _2B, _3B, hasExtras, trend };
}

function percentileText(values, current) {
  const usable = values.filter(value => Number.isFinite(value) && value > 0);
  if (usable.length < 2 || !current) return 'P--';
  const below = usable.filter(value => value < current).length;
  const equal = usable.filter(value => value === current).length;
  return `P${Math.round((below + equal * 0.5) / usable.length * 100)}`;
}

function axisRow({ label, code, value, pct }) {
  const width = Number(String(pct || '').replace('P', '')) || 0;
  return { label, code, value, pct, width: Math.max(4, Math.min(100, width)) };
}

function capabilityProfile(games, player, roster) {
  const stats = aggregateBattingStats(games, player);
  const rosterStats = (roster || []).map(item => aggregateBattingStats(games, item));
  const runsPerGame = stats.GP ? stats.R / stats.GP : 0;
  const rbiPerGame = stats.GP ? stats.RBI / stats.GP : 0;
  const ISO = Math.max(0, stats.SLG - stats.AVG);
  const BB_PCT = stats.PA ? stats.BB / stats.PA : 0;
  const K_PCT = stats.PA ? stats.SO / stats.PA : 0;
  const BBvsK = stats.SO ? stats.BB / stats.SO : (stats.BB ? stats.BB : 0);
  return {
    games: stats.GP,
    atBats: stats.AB,
    slash: `${fmtAvg(stats.AVG)} / ${fmtAvg(stats.OBP)} / ${fmtAvg(stats.SLG)}`,
    OPS: fmtAvg(stats.OPS),
    hasStats: stats.trend.length > 0,
    rateCards: [
      { label: 'AVG · 打击率', value: fmtAvg(stats.AVG), sub: `${stats.H} H / ${stats.AB} AB` },
      { label: 'OBP · 上垒率', value: fmtAvg(stats.OBP), sub: `BB ${stats.BB}${stats.HBP ? ` · HBP ${stats.HBP}` : ''}` },
      { label: 'SLG · 长打率', value: fmtAvg(stats.SLG), sub: stats.hasExtras ? `${stats._1B}/${stats._2B}/${stats._3B}/${stats.HR}` : '无分级时按估算' },
      { label: 'OPS · 综合攻击', value: fmtAvg(stats.OPS), sub: 'OBP + SLG' },
    ],
    metrics: [
      { label: '安打', value: stats.H, sub: `${stats.AB} AB` },
      { label: '得分', value: stats.R, sub: `${runsPerGame.toFixed(1)} / 场` },
      { label: '打点', value: stats.RBI, sub: `${rbiPerGame.toFixed(1)} / 场` },
      { label: '全垒打', value: stats.HR, sub: stats.hasExtras ? '长打已拆分' : '等待安打分级' },
    ],
    advanced: [
      { label: 'ISO', value: fmtAvg(ISO), sub: '独立长打力' },
      { label: 'BB%', value: fmtPct(BB_PCT), sub: '保送率' },
      { label: 'K%', value: fmtPct(K_PCT), sub: '三振率' },
      { label: 'BB/K', value: BBvsK.toFixed(2), sub: `${stats.BB}:${stats.SO}` },
    ],
    axes: [
      axisRow({ label: '打击', code: 'AVG', value: fmtAvg(stats.AVG), pct: percentileText(rosterStats.map(item => item.AVG), stats.AVG) }),
      axisRow({ label: '力量', code: 'SLG', value: fmtAvg(stats.SLG), pct: percentileText(rosterStats.map(item => item.SLG), stats.SLG) }),
      axisRow({ label: '上垒', code: 'OBP', value: fmtAvg(stats.OBP), pct: percentileText(rosterStats.map(item => item.OBP), stats.OBP) }),
      axisRow({ label: '跑垒', code: 'R/G', value: runsPerGame.toFixed(2), pct: percentileText(rosterStats.map(item => item.GP ? item.R / item.GP : 0), runsPerGame) }),
      { label: '守备', code: 'FPCT', value: '—', pct: '待补', width: 0, pending: true },
    ],
    trend: stats.trend.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5),
  };
}

function capabilityRosterFromGames(games, player) {
  const currentKeys = playerKeys(player);
  const seen = new Set(['current']);
  const roster = [player];
  (games || []).forEach(game => {
    (game.batting || []).forEach(row => {
      if (!row || rowMatches(row, player, currentKeys)) return;
      const key = norm(row.playerId) || `name:${norm(row.name)}`;
      if (!key || key === 'name:' || seen.has(key)) return;
      seen.add(key);
      roster.push({
        id: row.playerId || key,
        name: row.name || '未命名球员',
        aliases: [],
      });
    });
  });
  return roster;
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeGamesById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(game => {
      const id = game && game.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

// 返回值只含 WXML 实际渲染的派生字段;原始 gameRecords 由页面实例属性持有,不进 setData
function buildGameState(gameRecords, player, roster, publicHighlights, pageMeta = {}) {
  const games = relatedGames(gameRecords || [], player);
  const highlights = playerHighlights(publicHighlights || [], player, gameRecords || []);
  const hasMore = !!pageMeta.hasMore;
  const capabilityRoster = (roster && roster.length) ? roster : capabilityRosterFromGames(gameRecords || [], player);
  return {
    games,
    capability: capabilityProfile(gameRecords || [], player, capabilityRoster),
    highlights,
    highlightImages: highlights.map(item => item.image).filter(Boolean),
    gamesHasMore: hasMore,
    gamesNextOffset: normalizeNextOffset(pageMeta.nextOffset, (gameRecords || []).length),
    gameLoadedSummary: hasMore
      ? `已加载最近 ${games.length} 场，可继续加载历史比赛`
      : `已加载 ${games.length} 场相关比赛`,
  };
}

Page({
  data: {
    id: '',
    loading: true,
    player: null,
    points: null,
    breakdown: [],
    timeline: [],
    games: [],
    gamesHasMore: false,
    gamesNextOffset: 0,
    loadingMoreGames: false,
    gameLoadedSummary: '',
    capability: null,
    highlights: [],
    highlightImages: [],
    canEditPlayer: false,
    canEditDisplay: false,
    canUpgradePlayer: false,
    canDeletePlayer: false,
    savingProfile: false,
    deleteConfirmText: '',
    editName: '',
    editNumber: '',
    editPosition: '',
    editBats: '',
    editThrows: '',
    editJoinYear: '',
    editPhoto: '',
    editSlogan: '',
    editTitles: '',
    editAliases: '',
    editPublicDisplayName: '',
    editPublicAvatar: '',
    playerPhotoUploadText: '',
    uploadingPlayerPhoto: false,
    displayAvatarUploadText: '',
    uploadingDisplayAvatar: false,
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    try {
      const [playerRes, pointsRes, gamesRes, meRes] = await Promise.all([
        api.get(`/players/${this.data.id}`),
        api.get(`/players/${this.data.id}/points`).catch(() => null),
        api.get('/games', playerGameParams(this.data.id, 0)).catch(() => ({ games: [], hasMore: false, nextOffset: 0 })),
        api.get('/auth/me').catch(() => ({ user: null })),
      ]);
      if (getApp().setIdentity) getApp().setIdentity(meRes);
      const user = meRes.user || null;
      const player = normalizePlayer(playerRes.player || {}, { user, player: meRes.player || null });
      const publicHighlights = await fetchPlayerPublicHighlights(player);
      const playerPool = capabilityRosterFromGames(gamesRes.games || [], player);
      const canEditPlayer = hasPermission(user, 'players:write');
      const canEditDisplay = canEditPlayer || hasPermission(user, 'players:display_write');
      const canDeletePlayer = canEditPlayer && hasPermission(user, 'destructive:delete');
      const breakdown = pointsRes && pointsRes.breakdown ? [
        { label: '基础', value: num(pointsRes.breakdown.base) },
        { label: '表现', value: num(pointsRes.breakdown.performance) },
        { label: '荣誉', value: num(pointsRes.breakdown.awards) },
        { label: '调整', value: num(pointsRes.breakdown.manual) },
      ] : [];
      // 原始比赛 JSON / 参考球员池 / 公开高光只供 JS 端重算,不进 setData 渲染层
      this._gameRecords = gamesRes.games || [];
      this._playerPool = playerPool;
      this._publicHighlights = publicHighlights;
      this.setData({
        loading: false,
        player,
        points: pointsRes ? { total: num(pointsRes.total), breakdown: pointsRes.breakdown || {} } : null,
        breakdown,
        timeline: pointsRes ? (pointsRes.timeline || []).slice(0, 8).map(formatDelta) : [],
        ...buildGameState(gamesRes.games || [], player, playerPool, publicHighlights, {
          hasMore: gamesRes.hasMore,
          nextOffset: gamesRes.nextOffset,
        }),
        canEditPlayer,
        canEditDisplay,
        canUpgradePlayer: canEditPlayer && player.level !== 'verified',
        canDeletePlayer,
        deleteConfirmText: '',
        ...editFields(player),
      });
    } catch (err) {
      this.setData({ loading: false });
      showError(err, '球员详情加载失败');
    }
  },

  openGame(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${id}` });
  },

  async loadMorePlayerGames() {
    if (!this.data.id || !this.data.gamesHasMore || this.data.loadingMoreGames) return;
    const offset = this.data.gamesNextOffset || (this._gameRecords || []).length;
    this.setData({ loadingMoreGames: true });
    try {
      const res = await api.get('/games', playerGameParams(this.data.id, offset));
      const gameRecords = mergeGamesById(this._gameRecords || [], res.games || []);
      const playerPool = capabilityRosterFromGames(gameRecords, this.data.player);
      this._gameRecords = gameRecords;
      this._playerPool = playerPool;
      this.setData({
        ...buildGameState(gameRecords, this.data.player, playerPool, this._publicHighlights, {
          hasMore: res.hasMore,
          nextOffset: res.nextOffset,
        }),
      });
    } catch (err) {
      showError(err, '加载更多相关比赛失败');
    } finally {
      this.setData({ loadingMoreGames: false });
    }
  },

  previewHighlight(e) {
    const current = e.currentTarget.dataset.image;
    if (!current) return;
    wx.previewImage({
      current,
      urls: this.data.highlightImages.length ? this.data.highlightImages : [current],
    });
  },

  copyHighlightLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => toast('B站链接已复制'),
      fail: err => showError(err, '复制失败'),
    });
  },

  submitPlayerHighlight() {
    if (!this.data.id) return;
    wx.navigateTo({ url: `/pages/highlights/highlights?playerId=${this.data.id}` });
  },

  openTimelineItem(e) {
    const { targetType, targetId } = e.currentTarget.dataset;
    if (!targetId) return;
    if (targetType === 'game') {
      wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${targetId}` });
    } else if (targetType === 'event') {
      wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${targetId}` });
    }
  },

  onEditNameInput(e) { this.setData({ editName: e.detail.value }); },
  onEditNumberInput(e) { this.setData({ editNumber: e.detail.value }); },
  onEditPositionInput(e) { this.setData({ editPosition: e.detail.value }); },
  onEditBatsInput(e) { this.setData({ editBats: e.detail.value }); },
  onEditThrowsInput(e) { this.setData({ editThrows: e.detail.value }); },
  onEditJoinYearInput(e) { this.setData({ editJoinYear: e.detail.value }); },
  onEditPhotoInput(e) { this.setData({ editPhoto: e.detail.value }); },
  onEditSloganInput(e) { this.setData({ editSlogan: e.detail.value }); },
  onEditTitlesInput(e) { this.setData({ editTitles: e.detail.value }); },
  onEditAliasesInput(e) { this.setData({ editAliases: e.detail.value }); },
  onEditPublicDisplayNameInput(e) { this.setData({ editPublicDisplayName: e.detail.value }); },
  onEditPublicAvatarInput(e) { this.setData({ editPublicAvatar: e.detail.value }); },
  onDeleteConfirmInput(e) { this.setData({ deleteConfirmText: e.detail.value }); },

  async choosePlayerPhoto() {
    if (!this.data.canEditDisplay || this.data.uploadingPlayerPhoto) return;
    this.setData({ uploadingPlayerPhoto: true, playerPhotoUploadText: '选择图片中...' });
    try {
      const uploaded = await chooseAndUploadImage('player', 'player-photo', text => {
        this.setData({ playerPhotoUploadText: text });
      });
      if (!uploaded) {
        this.setData({ playerPhotoUploadText: '' });
        return;
      }
      this.setData({
        editPhoto: uploaded.url || '',
        playerPhotoUploadText: '已上传到 COS',
      });
      toast('真实照片已上传');
    } catch (err) {
      showError(err, '真实照片上传失败');
      this.setData({ playerPhotoUploadText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploadingPlayerPhoto: false });
    }
  },

  clearPlayerPhoto() {
    if (!this.data.canEditDisplay || this.data.uploadingPlayerPhoto) return;
    this.setData({ editPhoto: '', playerPhotoUploadText: '保存后清空真实球员照片' });
  },

  async choosePublicAvatar() {
    if (!this.data.canEditDisplay || this.data.uploadingDisplayAvatar) return;
    this.setData({ uploadingDisplayAvatar: true, displayAvatarUploadText: '选择图片中...' });
    try {
      const uploaded = await chooseAndUploadImage('avatar', 'player-avatar', text => {
        this.setData({ displayAvatarUploadText: text });
      });
      if (!uploaded) {
        this.setData({ displayAvatarUploadText: '' });
        return;
      }
      this.setData({
        editPublicAvatar: uploaded.url || '',
        displayAvatarUploadText: '已上传到 COS',
      });
      toast('公开头像已上传');
    } catch (err) {
      showError(err, '公开头像上传失败');
      this.setData({ displayAvatarUploadText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploadingDisplayAvatar: false });
    }
  },

  async savePlayerProfile() {
    if (!this.data.canEditDisplay || this.data.savingProfile) return;
    const payload = { slogan: String(this.data.editSlogan || '').trim() };
    if (this.data.canEditDisplay) {
      payload.photo = String(this.data.editPhoto || '').trim();
    }
    if (this.data.canEditPlayer) {
      payload.name = String(this.data.editName || '').trim();
      payload.number = String(this.data.editNumber || '').trim();
      payload.position = String(this.data.editPosition || '').trim();
      payload.bats = String(this.data.editBats || '').trim().toUpperCase();
      payload.throws = String(this.data.editThrows || '').trim().toUpperCase();
      payload.joinYear = this.data.editJoinYear ? Number(this.data.editJoinYear) : null;
      payload.titles = splitList(this.data.editTitles);
      payload.aliases = splitList(this.data.editAliases);
    }
    if (payload.joinYear !== undefined && payload.joinYear !== null && !Number.isFinite(payload.joinYear)) {
      return toast('入队年份格式不对');
    }
    this.setData({ savingProfile: true });
    try {
      let res = await api.patch(`/players/${this.data.id}`, payload);
      if (this.data.canEditDisplay) {
        res = await api.patch(`/players/${this.data.id}/public-profile`, {
          publicDisplayName: String(this.data.editPublicDisplayName || '').trim(),
          publicAvatar: String(this.data.editPublicAvatar || '').trim(),
        });
      }
      const player = normalizePlayer(res.player || {});
      this.setData({
        player,
        canUpgradePlayer: this.data.canEditPlayer && player.level !== 'verified',
        ...editFields(player),
      });
      toast('球员档案已保存');
    } catch (err) {
      showError(err, '保存球员档案失败');
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  async upgradePlayer() {
    if (!this.data.canEditPlayer || this.data.savingProfile) return;
    this.setData({ savingProfile: true });
    try {
      const res = await api.post(`/players/${this.data.id}/upgrade`, {});
      const player = normalizePlayer(res.player || {});
      this.setData({
        player,
        canUpgradePlayer: this.data.canEditPlayer && player.level !== 'verified',
        ...editFields(player),
      });
      toast(res.already ? '已是正式球员' : '已升级正式球员');
    } catch (err) {
      showError(err, '升级失败，可能存在同名正式球员');
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  async deletePlayer() {
    if (!this.data.canDeletePlayer || this.data.savingProfile) return;
    if (String(this.data.deleteConfirmText || '').trim() !== '删除球员') {
      toast('请输入“删除球员”确认');
      return;
    }
    const playerName = this.data.player?.name || this.data.player?.displayName || '该球员';
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '删除球员',
      content: `确认删除「${playerName}」？重复档案请优先使用管理台合并球员。`,
      confirmText: '删除',
      confirmColor: '#ff8a8a',
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ savingProfile: true });
    try {
      await api.del(`/players/${this.data.id}`);
      toast('球员已删除');
      wx.redirectTo({ url: '/pages/players/player-list/player-list' });
    } catch (err) {
      showError(err, '删除球员失败');
    } finally {
      this.setData({ savingProfile: false });
    }
  },
});

function chooseImageFile() {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          resolve((res.tempFiles || [])[0] || null);
        },
        fail: reject,
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        resolve({ tempFilePath: (res.tempFilePaths || [])[0] || '', size: (res.tempFiles || [])[0]?.size });
      },
      fail: reject,
    });
  });
}

async function chooseAndUploadImage(kind, fallbackPrefix, onStatus) {
  const file = await chooseImageFile();
  if (!file) return null;
  const filePath = file.tempFilePath || file.path || '';
  const fileName = file.name || filePath.split('/').pop() || `${fallbackPrefix}-${Date.now()}.jpg`;
  const fileBase64 = await readFileBase64(filePath);
  if (onStatus) onStatus('上传 COS 中...');
  return api.post('/upload/base64', {
    kind,
    fileName,
    contentType: inferImageContentType(fileName, filePath),
    fileBase64,
  });
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(res.data || '');
      },
      fail: reject,
    });
  });
}

function inferImageContentType(fileName, filePath) {
  const name = String(fileName || filePath || '').toLowerCase();
  if (/\.png(?:\?|$)/.test(name)) return 'image/png';
  if (/\.gif(?:\?|$)/.test(name)) return 'image/gif';
  if (/\.webp(?:\?|$)/.test(name)) return 'image/webp';
  if (/\.svg(?:\?|$)/.test(name)) return 'image/svg+xml';
  return 'image/jpeg';
}
