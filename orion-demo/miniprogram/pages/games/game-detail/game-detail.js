const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');
const { playerIdentity } = require('../../../utils/player-identity');

const HIGHLIGHT_PAGE_LIMIT = 30;
const PLAYER_LINK_QUERY_LIMIT = 5;
const PLAYER_LINK_NAME_QUERY_CAP = 60;

const BAT_SORT_OPTIONS = [
  { key: 'H', label: '安打' },
  { key: 'RBI', label: '打点' },
  { key: 'AVG', label: '打率' },
  { key: 'OPS', label: 'OPS' },
  { key: 'BB', label: '保送' },
  { key: 'SO', label: '三振' },
];

const PITCH_SORT_OPTIONS = [
  { key: 'IP', label: '局数' },
  { key: 'SO', label: '三振' },
  { key: 'ERA', label: 'ERA', lowerBetter: true },
  { key: 'WHIP', label: 'WHIP', lowerBetter: true },
  { key: 'BB', label: '保送', lowerBetter: true },
  { key: 'H', label: '被安', lowerBetter: true },
];

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtRate(value) {
  if (!Number.isFinite(value)) return '.000';
  return value.toFixed(3).replace(/^0/, '');
}

function fmtNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function totalBases(row) {
  if (row.TB !== undefined) return num(row.TB);
  const doubles = num(row._2B);
  const triples = num(row._3B);
  const homers = num(row.HR);
  const singles = row._1B !== undefined
    ? num(row._1B)
    : Math.max(num(row.H) - doubles - triples - homers, 0);
  return singles + doubles * 2 + triples * 3 + homers * 4;
}

function battingMetric(row, key) {
  const AB = num(row.AB);
  const H = num(row.H);
  const BB = num(row.BB);
  const HBP = num(row.HBP);
  const SF = num(row.SF);
  if (key === 'AVG') return AB ? H / AB : 0;
  if (key === 'OBP') {
    const denom = AB + BB + HBP + SF;
    return denom ? (H + BB + HBP) / denom : 0;
  }
  if (key === 'SLG') return AB ? totalBases(row) / AB : 0;
  if (key === 'OPS') return battingMetric(row, 'OBP') + battingMetric(row, 'SLG');
  if (key === 'OB') return H + BB + HBP;
  if (key === 'NET') return H - num(row.SO);
  return num(row[key]);
}

function parseIp(value) {
  const raw = String(value || '0').trim();
  if (!raw) return 0;
  const [whole, frac = '0'] = raw.split('.');
  const innings = num(whole);
  const outs = Math.max(0, Math.min(num(frac), 2));
  return innings + outs / 3;
}

function pitchingMetric(row, key) {
  const ip = parseIp(row.IP);
  if (key === 'IP') return ip;
  if (key === 'ERA') return ip ? (num(row.ER) * 9) / ip : 0;
  if (key === 'WHIP') return ip ? (num(row.H) + num(row.BB)) / ip : 0;
  return num(row[key]);
}

function metricValue(row, key, kind) {
  return kind === 'pitching' ? pitchingMetric(row, key) : battingMetric(row, key);
}

function metricText(row, key, kind) {
  if (kind === 'pitching') {
    if (key === 'IP') return row.IP || '0.0';
    if (key === 'ERA' || key === 'WHIP') return fmtNumber(pitchingMetric(row, key));
    return String(num(row[key]));
  }
  if (key === 'AVG' || key === 'OBP' || key === 'SLG' || key === 'OPS') return fmtRate(battingMetric(row, key));
  return String(num(row[key]));
}

function metricLabel(options, key) {
  const option = options.find(item => item.key === key);
  return option ? option.label : key;
}

function sortRows(rows, options, key, direction, kind) {
  const option = options.find(item => item.key === key) || options[0];
  const sortKey = option.key;
  const dir = direction || (option.lowerBetter ? 'asc' : 'desc');
  return (rows || []).slice().sort((a, b) => {
    const av = metricValue(a, sortKey, kind);
    const bv = metricValue(b, sortKey, kind);
    if (av === bv) return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''));
    return dir === 'asc' ? av - bv : bv - av;
  });
}

function decorateBattingRows(rows, options, key, direction) {
  return sortRows(rows, options, key, direction, 'batting').map(row => ({
    ...row,
    avgText: metricText(row, 'AVG', 'batting'),
    opsText: metricText(row, 'OPS', 'batting'),
  }));
}

function decoratePitchingRows(rows, options, key, direction) {
  return sortRows(rows, options, key, direction, 'pitching').map(row => ({
    ...row,
    eraText: metricText(row, 'ERA', 'pitching'),
    whipText: metricText(row, 'WHIP', 'pitching'),
  }));
}

function chartRows(rows, options, key, direction, kind) {
  const sorted = sortRows(rows, options, key, direction, kind).slice(0, 6);
  const values = sorted.map(row => metricValue(row, key, kind));
  const max = Math.max(...values, 1);
  return sorted.map(row => {
    const value = metricValue(row, key, kind);
    return {
      id: row.playerId || row.name || row.displayName,
      name: row.displayName || row.name || '球员',
      nameClass: row.nameClass || '',
      valueText: metricText(row, key, kind),
      barStyle: `width: ${Math.max(8, Math.round((value / max) * 100))}%`,
    };
  });
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeHighlightsById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(item => {
      const id = item && item.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function unlinkedRows(rows) {
  return (rows || []).map(row => ({
    ...row,
    displayName: row.name || '对手',
    linked: false,
  }));
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

function collectGamePlayerRefs(game) {
  const ids = new Set();
  const names = new Set();
  function addRef(playerId, name) {
    addUnique(ids, playerId);
    addUnique(names, name);
  }
  (game.batting || []).forEach(row => addRef(row.playerId, row.name));
  (game.pitching || []).forEach(row => addRef(row.playerId, row.name));
  addRef(game.mvpPlayerId, game.mvpPlayerName);
  (game.gameLog || []).forEach(row => {
    addRef(row.playerId, row.playerName);
    (row.scoredRunners || []).forEach(runner => addRef(runner.playerId, runner.playerName));
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

async function loadPlayersForGame(game) {
  const refs = collectGamePlayerRefs(game || {});
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

function linkRows(rows, indexes, viewer) {
  return (rows || []).map(row => {
    const player = (row.playerId && indexes.byId[row.playerId]) || indexes.byName[norm(row.name)];
    if (!player) return { ...row, displayName: row.name || '队员', linked: false };
    const identity = playerIdentity(player, viewer);
    return {
      ...row,
      playerId: player.id,
      displayName: identity.displayName || row.name || '队员',
      nameClass: identity.nameClass,
      linked: true,
    };
  });
}

function displayPlayer(player, fallback, viewer) {
  if (!player) return fallback || '队员';
  return playerIdentity(player, viewer).displayName || fallback || '队员';
}

function playerNameClass(player, viewer) {
  return player ? playerIdentity(player, viewer).nameClass : '';
}

function displayLogLabel(row, player, viewer) {
  const label = row.label || row.actionLabel || row.actionKey || '比赛记录';
  if (!player || !row.playerName) return label;
  return String(label).replace(String(row.playerName), displayPlayer(player, row.playerName, viewer));
}

function formatCountMeta(value) {
  if (!value) return '';
  if (value.text) return value.text;
  if (value.balls !== undefined && value.strikes !== undefined) return `${value.balls}-${value.strikes}`;
  return '';
}

function logCountText(row) {
  const before = formatCountMeta(row.countBefore);
  const after = formatCountMeta(row.countAfter);
  if (before && after) return `${before} -> ${after}`;
  return row.pitchCount || before || after || '';
}

function gameScoreRules(game) {
  const rules = (game.metadata || {}).scoreRules;
  if (!rules) return null;
  const initial = `${Number(rules.initialBalls || 0)}-${Number(rules.initialStrikes || 0)}`;
  return {
    ...rules,
    initial,
    title: rules.name ? `${rules.name}规则` : '记分规则',
    description: rules.description || `初始球数 ${initial}`,
  };
}

function linkGameLog(rows, indexes, viewer) {
  return (rows || []).map(row => {
    const player = (row.playerId && indexes.byId[row.playerId]) || indexes.byName[norm(row.playerName)];
    const scoredRunners = (row.scoredRunners || []).map(runner => {
      const runnerPlayer = (runner.playerId && indexes.byId[runner.playerId]) || indexes.byName[norm(runner.playerName)];
      return {
        playerId: runnerPlayer ? runnerPlayer.id : (runner.playerId || ''),
        displayName: displayPlayer(runnerPlayer, runner.playerName || '跑者', viewer),
        nameClass: playerNameClass(runnerPlayer, viewer),
        linked: !!runnerPlayer,
      };
    });
    return {
      ...row,
      playerId: player ? player.id : (row.playerId || ''),
      playerName: displayPlayer(player, row.playerName, viewer),
      nameClass: playerNameClass(player, viewer),
      label: displayLogLabel(row, player, viewer),
      countText: logCountText(row),
      baseMoveText: row.baseBefore && row.baseAfter ? `${row.baseBefore} -> ${row.baseAfter}` : '',
      scoredRunners,
      scoredRunnerNames: scoredRunners.map(runner => runner.displayName).filter(Boolean).join('、'),
    };
  });
}

function linkMvp(game, indexes, viewer) {
  if (!game || (!game.mvpPlayerId && !game.mvpPlayerName)) return null;
  const player = (game.mvpPlayerId && indexes.byId[game.mvpPlayerId]) || indexes.byName[norm(game.mvpPlayerName)];
  return {
    playerId: player ? player.id : (game.mvpPlayerId || ''),
    displayName: displayPlayer(player, game.mvpPlayerName || '本场最佳', viewer),
    nameClass: playerNameClass(player, viewer),
    linked: !!player,
  };
}

function gameOrigin(game) {
  const metadata = game.metadata || {};
  const eventId = game.eventId || metadata.rosterEventId || metadata.relatedEventId || '';
  if (!eventId && !metadata.rosterEventTitle) return null;
  return {
    eventId,
    title: metadata.rosterEventTitle || '接龙活动',
    countText: metadata.relaySignupCount ? `${metadata.relaySignupCount} 人接龙` : '',
    sourceText: metadata.rosterSource === 'relay' ? '接龙出场名单' : '出场名单',
  };
}

Page({
  data: {
    id: '',
    loading: true,
    loadError: false,
    game: null,
    origin: null,
    mvp: null,
    lineHome: [],
    lineAway: [],
    batting: [],
    pitching: [],
    oppBatting: [],
    homeTotals: {},
    awayTotals: {},
    gameLog: [],
    scoreRules: null,
    highlights: [],
    highlightImages: [],
    highlightsHasMore: false,
    highlightsNextOffset: 0,
    loadingMoreHighlights: false,
    highlightCountText: '0 张',
    highlightIndexes: { byId: {}, byName: {} },
    highlightViewer: { user: null, player: null },
    highlightUser: null,
    battingSource: [],
    pitchingSource: [],
    oppBattingSource: [],
    oppPitching: [],
    oppPitchingSource: [],
    battingSortOptions: BAT_SORT_OPTIONS,
    pitchingSortOptions: PITCH_SORT_OPTIONS,
    oppBattingSortOptions: BAT_SORT_OPTIONS,
    oppPitchingSortOptions: PITCH_SORT_OPTIONS,
    battingSortKey: 'H',
    battingSortLabel: '安打',
    battingSortArrow: ' ↓',
    pitchingSortKey: 'SO',
    pitchingSortLabel: '三振',
    pitchingSortArrow: ' ↓',
    oppBattingSortKey: 'H',
    oppBattingSortLabel: '安打',
    oppBattingSortArrow: ' ↓',
    oppPitchingSortKey: 'SO',
    oppPitchingSortLabel: '三振',
    oppPitchingSortArrow: ' ↓',
    battingChart: [],
    pitchingChart: [],
    oppBattingChart: [],
    oppPitchingChart: [],
    canEditGame: false,
    exportingPdf: false,
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: false });
    try {
      const [res, meRes] = await Promise.all([
        api.get(`/games/${this.data.id}`),
        api.get('/auth/me').catch(() => ({ user: null })),
      ]);
      const game = res.game ? { ...res.game, sportLabel: sportLabel(res.game.sport) } : {};
      const players = await loadPlayersForGame(game);
      const indexes = buildPlayerIndexes(players);
      const user = meRes.user || null;
      const viewer = { user, player: meRes.player || null };
      const highlightsRes = await fetchGameHighlights(this.data.id, user, 0);
      const highlights = (highlightsRes.highlights || []).map(highlight => formatHighlight(highlight, indexes, viewer)).filter(item => item.image);
      const battingSource = linkRows(game.batting || [], indexes, viewer);
      const pitchingSource = linkRows(game.pitching || [], indexes, viewer);
      const oppBattingSource = unlinkedRows(game.oppBatting || []);
      const oppPitchingSource = unlinkedRows(game.oppPitching || []);
      this.setData({
        game,
        canEditGame: hasPermission(user, 'games:revise'),
        scoreRules: gameScoreRules(game),
        origin: gameOrigin(game),
        mvp: linkMvp(game, indexes, viewer),
        lineHome: (game.linescore && game.linescore.home) || [],
        lineAway: (game.linescore && game.linescore.away) || [],
        battingSource,
        pitchingSource,
        oppBattingSource,
        oppPitchingSource,
        batting: decorateBattingRows(battingSource, BAT_SORT_OPTIONS, this.data.battingSortKey, 'desc'),
        pitching: decoratePitchingRows(pitchingSource, PITCH_SORT_OPTIONS, this.data.pitchingSortKey, 'desc'),
        oppBatting: decorateBattingRows(oppBattingSource, BAT_SORT_OPTIONS, this.data.oppBattingSortKey, 'desc'),
        oppPitching: decoratePitchingRows(oppPitchingSource, PITCH_SORT_OPTIONS, this.data.oppPitchingSortKey, 'desc'),
        battingChart: chartRows(battingSource, BAT_SORT_OPTIONS, this.data.battingSortKey, 'desc', 'batting'),
        pitchingChart: chartRows(pitchingSource, PITCH_SORT_OPTIONS, this.data.pitchingSortKey, 'desc', 'pitching'),
        oppBattingChart: chartRows(oppBattingSource, BAT_SORT_OPTIONS, this.data.oppBattingSortKey, 'desc', 'batting'),
        oppPitchingChart: chartRows(oppPitchingSource, PITCH_SORT_OPTIONS, this.data.oppPitchingSortKey, 'desc', 'pitching'),
        homeTotals: game.homeTotals || {},
        awayTotals: game.awayTotals || {},
        gameLog: linkGameLog(game.gameLog || [], indexes, viewer),
        highlights,
        highlightImages: highlights.map(item => item.image).filter(Boolean),
        highlightsHasMore: !!highlightsRes.hasMore,
        highlightsNextOffset: normalizeNextOffset(highlightsRes.nextOffset, (highlightsRes.highlights || []).length),
        highlightCountText: highlights.length ? `${highlights.length} 张` : '暂无图片',
        highlightIndexes: indexes,
        highlightViewer: viewer,
        highlightUser: user,
      });
    } catch (err) {
      this.setData({ loadError: true });
      showError(err, '比赛详情加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() {
    this.load();
  },

  sortBatting(e) {
    this.applyTableSort('batting', e.currentTarget.dataset.key);
  },

  sortPitching(e) {
    this.applyTableSort('pitching', e.currentTarget.dataset.key);
  },

  sortOppBatting(e) {
    this.applyTableSort('oppBatting', e.currentTarget.dataset.key);
  },

  sortOppPitching(e) {
    this.applyTableSort('oppPitching', e.currentTarget.dataset.key);
  },

  applyTableSort(table, key) {
    const configs = {
      batting: {
        rowsKey: 'batting',
        sourceKey: 'battingSource',
        chartKey: 'battingChart',
        sortKey: 'battingSortKey',
        labelKey: 'battingSortLabel',
        arrowKey: 'battingSortArrow',
        options: BAT_SORT_OPTIONS,
        kind: 'batting',
      },
      pitching: {
        rowsKey: 'pitching',
        sourceKey: 'pitchingSource',
        chartKey: 'pitchingChart',
        sortKey: 'pitchingSortKey',
        labelKey: 'pitchingSortLabel',
        arrowKey: 'pitchingSortArrow',
        options: PITCH_SORT_OPTIONS,
        kind: 'pitching',
      },
      oppBatting: {
        rowsKey: 'oppBatting',
        sourceKey: 'oppBattingSource',
        chartKey: 'oppBattingChart',
        sortKey: 'oppBattingSortKey',
        labelKey: 'oppBattingSortLabel',
        arrowKey: 'oppBattingSortArrow',
        options: BAT_SORT_OPTIONS,
        kind: 'batting',
      },
      oppPitching: {
        rowsKey: 'oppPitching',
        sourceKey: 'oppPitchingSource',
        chartKey: 'oppPitchingChart',
        sortKey: 'oppPitchingSortKey',
        labelKey: 'oppPitchingSortLabel',
        arrowKey: 'oppPitchingSortArrow',
        options: PITCH_SORT_OPTIONS,
        kind: 'pitching',
      },
    };
    const config = configs[table];
    if (!config || !key) return;
    const option = config.options.find(item => item.key === key) || config.options[0];
    const currentKey = this.data[config.sortKey];
    const currentArrow = this.data[config.arrowKey];
    const nextDir = currentKey === option.key
      ? (currentArrow === ' ↓' ? 'asc' : 'desc')
      : (option.lowerBetter ? 'asc' : 'desc');
    const source = this.data[config.sourceKey] || [];
    const rows = config.kind === 'pitching'
      ? decoratePitchingRows(source, config.options, option.key, nextDir)
      : decorateBattingRows(source, config.options, option.key, nextDir);
    this.setData({
      [config.rowsKey]: rows,
      [config.chartKey]: chartRows(source, config.options, option.key, nextDir, config.kind),
      [config.sortKey]: option.key,
      [config.labelKey]: option.label,
      [config.arrowKey]: nextDir === 'asc' ? ' ↑' : ' ↓',
    });
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.playerId;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },

  openEvent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${id}` });
  },

  editGame() {
    if (!this.data.id) return;
    wx.navigateTo({ url: `/pages/games/game-edit/game-edit?id=${this.data.id}` });
  },

  async exportGamePdf() {
    if (!this.data.id || this.data.exportingPdf) return;
    this.setData({ exportingPdf: true });
    try {
      const res = await api.get(`/games/${this.data.id}/export-pdf`);
      const base64 = String(res.pdfBase64 || '').trim();
      if (!base64) throw new Error('导出文件为空');
      const fileName = safePdfFileName(res.filename || `orion-game-${this.data.id}.pdf`);
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      await writeBase64File(filePath, base64);
      await openPdfDocument(filePath);
    } catch (err) {
      showError(err, 'PDF 导出失败');
    } finally {
      this.setData({ exportingPdf: false });
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

  async loadMoreGameHighlights() {
    if (!this.data.id || !this.data.highlightsHasMore || this.data.loadingMoreHighlights) return;
    const offset = this.data.highlightsNextOffset || (this.data.highlights || []).length;
    this.setData({ loadingMoreHighlights: true });
    try {
      const res = await fetchGameHighlights(this.data.id, this.data.highlightUser, offset);
      const incoming = (res.highlights || [])
        .map(highlight => formatHighlight(highlight, this.data.highlightIndexes, this.data.highlightViewer))
        .filter(item => item.image);
      const highlights = mergeHighlightsById(this.data.highlights || [], incoming);
      this.setData({
        highlights,
        highlightImages: highlights.map(item => item.image).filter(Boolean),
        highlightsHasMore: !!res.hasMore,
        highlightsNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.highlights || []).length),
        highlightCountText: highlights.length ? `${highlights.length} 张` : '暂无图片',
      });
    } catch (err) {
      showError(err, '加载更多精彩时刻失败');
    } finally {
      this.setData({ loadingMoreHighlights: false });
    }
  },

  copyHighlightLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({ data: url });
  },
});

function hasPermission(user, permission) {
  return user?.role === 'admin' || (user?.permissions || []).includes(permission);
}

function safePdfFileName(name) {
  const safeName = String(name || '')
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 90);
  return safeName.endsWith('.pdf') ? safeName : `${safeName || 'orion-game'}.pdf`;
}

function writeBase64File(filePath, data) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      encoding: 'base64',
      success: resolve,
      fail: reject,
    });
  });
}

function openPdfDocument(filePath) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      fileType: 'pdf',
      success: () => {
        toast('PDF 已生成');
        resolve();
      },
      fail: reject,
    });
  });
}

function canReviewHighlights(user) {
  return hasPermission(user, 'highlights:write');
}

async function fetchGameHighlights(gameId, user, offset = 0) {
  const params = { gameId, limit: HIGHLIGHT_PAGE_LIMIT, offset, includePlayer: 'true' };
  if (canReviewHighlights(user)) {
    return api.get('/highlights', params).catch(() => ({ highlights: [], hasMore: false, nextOffset: offset }));
  }
  const res = await api.get('/highlights', { ...params, public: 'true' }).catch(() => ({ highlights: [], hasMore: false, nextOffset: offset }));
  return {
    highlights: (res.highlights || []).filter(isPublicHighlight),
    hasMore: !!res.hasMore,
    nextOffset: res.nextOffset,
  };
}

function isPublicHighlight(item) {
  return item && (item.status === 'published' || item.status === 'approved');
}

function normalizeBilibiliUrl(value) {
  const url = String(value || '').trim();
  return /bilibili\.com|b23\.tv/i.test(url) ? url : '';
}

function formatHighlight(highlight, indexes, viewer) {
  const image = String(highlight.cover || '').trim();
  const player = highlight.player || (indexes?.byName ? indexes.byName[norm(highlight.playerName)] : null);
  const identity = player ? playerIdentity(player, viewer) : null;
  return {
    ...highlight,
    image,
    title: highlight.title || '本场精彩时刻',
    bilibiliUrl: normalizeBilibiliUrl(highlight.url),
    meta: [identity ? identity.displayName : (highlight.playerName || ''), highlight.status === 'pending' ? '待审核' : '', highlight.status === 'rejected' ? '已下架' : ''].filter(Boolean).join(' · '),
    metaClass: identity ? identity.nameClass : '',
  };
}
