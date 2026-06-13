const api = require('../../../utils/request');
const { showError } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');
const { playerIdentity } = require('../../../utils/player-identity');

const DEFAULT_COVER = '/assets/logo.jpg';
const PLAYER_LINK_QUERY_LIMIT = 5;
const PLAYER_LINK_NAME_QUERY_CAP = 120;

const SORT_OPTIONS = [
  { label: 'OPS', value: 'OPS', direction: 'desc' },
  { label: 'AVG', value: 'AVG', direction: 'desc' },
  { label: 'HR', value: 'HR', direction: 'desc' },
  { label: 'RBI', value: 'RBI', direction: 'desc' },
  { label: 'H', value: 'H', direction: 'desc' },
  { label: 'GP', value: 'GP', direction: 'desc' },
];

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtAvg(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '.000';
  return n.toFixed(3).replace(/^0/, '');
}

function fmtRate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function buildPlayerIndexes(players) {
  const byId = {};
  const byName = {};
  (players || []).forEach(player => {
    if (!player || !player.id) return;
    byId[player.id] = player;
    [player.name, player.publicDisplayName].concat(player.aliases || []).forEach(name => {
      const key = norm(name);
      if (key && !byName[key]) byName[key] = player;
    });
  });
  return { byId, byName };
}

function addUnique(set, value) {
  const raw = String(value || '').trim();
  if (raw) set.add(raw);
}

function collectTournamentPlayerRefs(games) {
  const ids = new Set();
  const names = new Set();
  chooseStatGames(games || []).forEach(game => {
    (game.batting || []).concat(game.pitching || []).forEach(row => {
      addUnique(ids, row.playerId);
      addUnique(names, row.name);
    });
  });
  return {
    ids: Array.from(ids),
    names: Array.from(names).slice(0, PLAYER_LINK_NAME_QUERY_CAP),
  };
}

function playerMatchesName(player, name) {
  const key = norm(name);
  if (!key || !player) return false;
  return [player.name, player.publicDisplayName].concat(player.aliases || []).some(alias => norm(alias) === key);
}

function mergePlayersById(...groups) {
  const seen = new Set();
  return groups.flat().filter(player => {
    const id = player && player.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function loadPlayersForTournament(games) {
  const refs = collectTournamentPlayerRefs(games || []);
  const byIdPlayers = await Promise.all(refs.ids.map(id => (
    api.get(`/players/${id}`).then(res => res.player).catch(() => null)
  )));
  const knownPlayers = byIdPlayers.filter(Boolean);
  const queryNames = refs.names.filter(name => !knownPlayers.some(player => playerMatchesName(player, name)));
  const namePlayerGroups = await Promise.all(queryNames.map(name => (
    api.get('/players', { include: 'all', keyword: name, limit: PLAYER_LINK_QUERY_LIMIT, offset: 0 })
      .then(res => res.players || [])
      .catch(() => [])
  )));
  return mergePlayersById(knownPlayers, ...namePlayerGroups);
}

function linkedPlayer(row, indexes) {
  return (row.playerId && indexes.byId[row.playerId]) || indexes.byName[norm(row.name)] || null;
}

function playerBucket(row, indexes, viewer) {
  const player = linkedPlayer(row, indexes);
  if (player) {
    const identity = playerIdentity(player, viewer);
    return {
      key: player.id,
      playerId: player.id,
      name: identity.displayName || row.name || '队员',
      nameClass: identity.nameClass,
      linked: true,
    };
  }
  const key = norm(row.name);
  return {
    key,
    playerId: '',
    name: row.name || '队员',
    linked: false,
  };
}

function gameInTournament(game, tournament) {
  if (!game || !tournament) return false;
  if (game.tournamentId && game.tournamentId === tournament.id) return true;
  return !game.tournamentId && tournament.season && game.season === tournament.season;
}

function isOrionTeam(name) {
  return /猎户|orion/i.test(String(name || ''));
}

function orionScore(game) {
  const homeIsOrion = isOrionTeam(game.home);
  const awayIsOrion = isOrionTeam(game.away);
  if (homeIsOrion) {
    return { ours: num(game.homeScore), theirs: num(game.awayScore) };
  }
  if (awayIsOrion) {
    return { ours: num(game.awayScore), theirs: num(game.homeScore) };
  }
  return { ours: num(game.homeScore), theirs: num(game.awayScore) };
}

function displayRange(tournament) {
  const start = tournament.startDate || '';
  const end = tournament.endDate || '';
  if (start && end && start !== end) return `${start} 至 ${end}`;
  return start || end || '日期待定';
}

function inningsText(game) {
  return game.innings ? `${game.innings} 局` : '';
}

function gameTitle(game) {
  return `${game.away || '-'} vs ${game.home || '-'}`;
}

function gameScore(game) {
  const away = game.awayScore ?? '-';
  const home = game.homeScore ?? '-';
  return `${away}:${home}`;
}

function chooseStatGames(games) {
  const regular = (games || []).filter(game => !game.isAggregate);
  return regular.length ? regular : (games || []);
}

function buildSummary(tournament, games) {
  const regular = (games || []).filter(game => !game.isAggregate);
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let runsFor = 0;
  let runsAgainst = 0;
  regular.forEach(game => {
    const score = orionScore(game);
    runsFor += score.ours;
    runsAgainst += score.theirs;
    if (score.ours > score.theirs) wins += 1;
    else if (score.ours < score.theirs) losses += 1;
    else ties += 1;
  });
  const diff = runsFor - runsAgainst;
  return {
    title: tournament.name || '赛事详情',
    shortName: tournament.shortName || tournament.name || '赛事',
    cover: tournament.cover || DEFAULT_COVER,
    sportText: sportLabel(tournament.sport),
    typeText: tournament.type === 'league' ? '联赛' : (tournament.type === 'tournament' ? '杯赛' : '赛事'),
    dateRange: displayRange(tournament),
    location: tournament.location || '地点待补',
    description: tournament.description || '',
    recordText: regular.length ? `${wins} 胜 ${losses} 败${ties ? ` ${ties} 平` : ''}` : '暂无战绩',
    gamesText: `${regular.length || games.length} 场`,
    runsText: regular.length ? `${runsFor}:${runsAgainst}` : '-',
    diffText: diff > 0 ? `+${diff}` : String(diff),
  };
}

function buildGameCards(games, tournament) {
  return (games || [])
    .filter(game => !game.isAggregate || !(games || []).some(item => !item.isAggregate))
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(game => ({
      ...game,
      title: gameTitle(game),
      scoreText: gameScore(game),
      meta: [game.date, sportLabel(game.sport), inningsText(game), game.isAggregate ? '赛季汇总' : ''].filter(Boolean).join(' · '),
      coverClass: game.cover ? 'has-cover' : 'no-cover',
      fallback: sportLabel(game.sport || tournament.sport),
    }));
}

function buildBattingLeaderboard(games, indexes, sortKey, viewer) {
  const buckets = {};
  chooseStatGames(games).forEach(game => {
    (game.batting || []).forEach(row => {
      const bucket = playerBucket(row, indexes, viewer);
      if (!bucket.key) return;
      if (!buckets[bucket.key]) {
        buckets[bucket.key] = {
          ...bucket,
          GP: 0, AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0, HR: 0, _1B: 0, _2B: 0, _3B: 0,
        };
      }
      const p = buckets[bucket.key];
      p.GP += num(row.gp) || 1;
      p.AB += num(row.AB);
      p.R += num(row.R);
      p.H += num(row.H);
      p.RBI += num(row.RBI);
      p.BB += num(row.BB);
      p.SO += num(row.SO);
      p.HR += num(row.HR);
      p._1B += num(row._1B);
      p._2B += num(row._2B);
      p._3B += num(row._3B);
    });
  });
  const rows = Object.values(buckets).map(row => {
    const hasExtras = row._1B + row._2B + row._3B + row.HR > 0;
    const singles = hasExtras ? (row._1B || Math.max(0, row.H - row._2B - row._3B - row.HR)) : 0;
    const totalBases = hasExtras ? singles + row._2B * 2 + row._3B * 3 + row.HR * 4 : row.H * 1.5;
    const AVG = row.AB ? row.H / row.AB : 0;
    const OBP = (row.AB + row.BB) ? (row.H + row.BB) / (row.AB + row.BB) : 0;
    const SLG = row.AB ? totalBases / row.AB : 0;
    const OPS = OBP + SLG;
    return {
      ...row,
      AVG, OBP, SLG, OPS,
      AVGText: fmtAvg(AVG),
      OBPText: fmtAvg(OBP),
      SLGText: fmtAvg(SLG),
      OPSText: fmtAvg(OPS),
      linkedClass: row.linked ? 'is-link' : '',
    };
  });
  const option = SORT_OPTIONS.find(item => item.value === sortKey) || SORT_OPTIONS[0];
  rows.sort((a, b) => option.direction === 'asc' ? num(a[option.value]) - num(b[option.value]) : num(b[option.value]) - num(a[option.value]));
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    statLine: `${row.H}H/${row.AB}AB · ${row.RBI} RBI · ${row.R} R`,
  }));
}

function ipToOuts(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const [whole, frac = '0'] = text.split('.');
  return num(whole) * 3 + Math.min(num(frac), 2);
}

function outsToIp(outs) {
  const safe = Math.max(0, Number(outs || 0));
  return `${Math.floor(safe / 3)}.${safe % 3}`;
}

function buildPitchingLeaderboard(games, indexes, viewer) {
  const buckets = {};
  chooseStatGames(games).forEach(game => {
    (game.pitching || []).forEach(row => {
      const bucket = playerBucket(row, indexes, viewer);
      if (!bucket.key) return;
      if (!buckets[bucket.key]) {
        buckets[bucket.key] = {
          ...bucket,
          outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, W: 0, L: 0,
        };
      }
      const p = buckets[bucket.key];
      p.outs += row.outs ? num(row.outs) : ipToOuts(row.IP);
      p.H += num(row.H);
      p.R += num(row.R);
      p.ER += num(row.ER);
      p.BB += num(row.BB);
      p.SO += num(row.SO);
      p.HR += num(row.HR);
      if (row.decision === 'W') p.W += 1;
      if (row.decision === 'L') p.L += 1;
    });
  });
  return Object.values(buckets).map(row => {
    const ERA = row.outs ? row.ER * 27 / row.outs : 0;
    const WHIP = row.outs ? (row.BB + row.H) * 3 / row.outs : 0;
    return {
      ...row,
      IPText: outsToIp(row.outs),
      ERA, WHIP,
      ERAText: fmtRate(ERA),
      WHIPText: fmtRate(WHIP),
      linkedClass: row.linked ? 'is-link' : '',
      recordText: `${row.W}-${row.L}`,
    };
  }).sort((a, b) => {
    if (b.outs !== a.outs) return b.outs - a.outs;
    return a.ERA - b.ERA;
  }).map((row, index) => ({ ...row, rank: index + 1 }));
}

Page({
  data: {
    id: '',
    loading: true,
    loadError: false,
    tournament: null,
    summary: null,
    games: [],
    batting: [],
    pitching: [],
    sortOptions: SORT_OPTIONS,
    sortIndex: 0,
    sortLabel: SORT_OPTIONS[0].label,
  },

  onLoad(options = {}) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  retryLoad() {
    this.load();
  },

  async load() {
    if (!this.data.id) return;
    this.setData({ loading: true, loadError: false });
    try {
      const [tournamentRes, gamesRes, meRes] = await Promise.all([
        api.get(`/tournaments/${this.data.id}`),
        api.get('/games', {
          includeAggregate: 'true',
          tournamentId: this.data.id,
          includeSeasonFallback: 'true',
        }),
        api.get('/auth/me').catch(() => ({ user: null, player: null })),
      ]);
      if (getApp().setIdentity) getApp().setIdentity(meRes);
      const viewer = { user: meRes.user || null, player: meRes.player || null };
      const tournament = tournamentRes.tournament || {};
      const allGames = gamesRes.games || [];
      const relatedGames = allGames.filter(game => gameInTournament(game, tournament));
      const players = await loadPlayersForTournament(relatedGames);
      const indexes = buildPlayerIndexes(players);
      // 原始比赛/球员数组只供 onSortChange 在 JS 端重算,不进 setData 渲染层
      this._sourceGames = relatedGames;
      this._players = players;
      this._viewer = viewer;
      this.setData({
        loading: false,
        tournament,
        summary: buildSummary(tournament, relatedGames),
        games: buildGameCards(relatedGames, tournament),
        batting: buildBattingLeaderboard(relatedGames, indexes, this.data.sortOptions[this.data.sortIndex].value, viewer),
        pitching: buildPitchingLeaderboard(relatedGames, indexes, viewer),
      });
    } catch (err) {
      this.setData({ loading: false, loadError: true });
      showError(err, '赛事详情加载失败');
    }
  },

  onSortChange(e) {
    const sortIndex = Number(e.detail.value || 0);
    const option = this.data.sortOptions[sortIndex] || SORT_OPTIONS[0];
    const indexes = buildPlayerIndexes(this._players || []);
    this.setData({
      sortIndex,
      sortLabel: option.label,
      batting: buildBattingLeaderboard(this._sourceGames || [], indexes, option.value, this._viewer || {}),
    });
  },

  openGame(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${id}` });
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.playerId;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },
});
