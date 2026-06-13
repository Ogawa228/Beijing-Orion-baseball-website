const api = require('../../../utils/request');
const { showError } = require('../../../utils/format');
const { playerIdentity } = require('../../../utils/player-identity');

const PLAYER_PAGE_LIMIT = 40;

function normalizePlayer(player, pointsById, index, viewer) {
  const titles = Array.isArray(player.titles) ? player.titles.filter(Boolean) : [];
  const identity = playerIdentity(player, viewer);
  const searchable = [
    identity.displayName,
    player.number,
    player.position,
    player.joinYear,
    titles.join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
  const points = pointsById[player.id];
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
    joinText: player.joinYear ? `${player.joinYear} 加入` : '',
    titles: titles.slice(0, 3),
    rank: points ? points.rank : 0,
    total: points ? points.total : 0,
    sortIndex: index,
    searchable,
  };
}

Page({
  data: {
    keyword: '',
    loading: true,
    loadingMore: false,
    players: [],
    visiblePlayers: [],
    playerCount: 0,
    positionCount: 0,
    topPlayer: null,
    hasMore: false,
    nextOffset: 0,
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({
      loading: true,
      loadingMore: false,
      players: [],
      visiblePlayers: [],
      hasMore: false,
      nextOffset: 0,
    });
    try {
      const [playersRes, topLeaderboardRes, meRes] = await Promise.all([
        api.get('/players', playerPageParams(0)),
        api.get('/leaderboard', { limit: 1 }).catch(() => ({ leaderboard: [] })),
        api.get('/auth/me').catch(() => ({ user: null, player: null })),
      ]);
      if (getApp().setIdentity) getApp().setIdentity(meRes);
      const viewer = { user: meRes.user || null, player: meRes.player || null };
      const leaderboardRes = await fetchLeaderboardForPlayers(playersRes.players || []);
      const pointsById = buildPointsById(leaderboardRes.leaderboard || []);
      const players = (playersRes.players || []).map((player, index) => normalizePlayer(player, pointsById, index, viewer));
      this.pointsById = pointsById;
      this.viewer = viewer;
      this.setData({
        players,
        loading: false,
        playerCount: Number(playersRes.total || players.length),
        positionCount: Number(playersRes.positionCount || loadedPositionCount(players)),
        topPlayer: formatTopPlayer((topLeaderboardRes.leaderboard || [])[0], viewer),
        hasMore: !!playersRes.hasMore,
        nextOffset: normalizeNextOffset(playersRes.nextOffset, players.length),
      });
      this.applyFilter();
    } catch (err) {
      this.setData({ loading: false });
      showError(err, '球员加载失败');
    }
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    try {
      const offset = this.data.nextOffset || (this.data.players || []).length;
      const playersRes = await api.get('/players', playerPageParams(offset));
      const pagePoints = buildPointsById((await fetchLeaderboardForPlayers(playersRes.players || [])).leaderboard || []);
      this.pointsById = { ...(this.pointsById || {}), ...pagePoints };
      const incoming = (playersRes.players || []).map((player, index) => (
        normalizePlayer(player, this.pointsById || {}, offset + index, this.viewer || {})
      ));
      const players = mergePlayersById(this.data.players || [], incoming);
      this.setData({
        players,
        loadingMore: false,
        playerCount: Number(playersRes.total || this.data.playerCount || players.length),
        positionCount: Number(playersRes.positionCount || this.data.positionCount || loadedPositionCount(players)),
        hasMore: !!playersRes.hasMore,
        nextOffset: normalizeNextOffset(playersRes.nextOffset, offset + incoming.length),
      });
      this.applyFilter();
    } catch (err) {
      this.setData({ loadingMore: false });
      showError(err, '更多球员加载失败');
    }
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  applyFilter() {
    const key = String(this.data.keyword || '').trim().toLowerCase();
    const players = key
      ? this.data.players.filter(player => player.searchable.includes(key))
      : this.data.players;
    this.setData({ visiblePlayers: players });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },
});

function playerPageParams(offset) {
  return {
    limit: PLAYER_PAGE_LIMIT,
    offset,
    includeTotal: 'true',
    includePositionCount: 'true',
  };
}

function leaderboardPageParams(players) {
  const ids = (players || []).map(player => player.id).filter(Boolean);
  return {
    playerIds: ids.join(','),
    limit: Math.max(ids.length, 1),
  };
}

function fetchLeaderboardForPlayers(players) {
  const ids = (players || []).map(player => player.id).filter(Boolean);
  if (!ids.length) return Promise.resolve({ leaderboard: [] });
  return api.get('/leaderboard', leaderboardPageParams(players)).catch(() => ({ leaderboard: [] }));
}

function buildPointsById(leaderboard) {
  const pointsById = {};
  (leaderboard || []).forEach((row, index) => {
    if (!row.player || !row.player.id) return;
    pointsById[row.player.id] = {
      rank: Number(row.rank || index + 1),
      total: row.total || 0,
    };
  });
  return pointsById;
}

function formatTopPlayer(row, viewer) {
  if (!row || !row.player) return null;
  const identity = playerIdentity(row.player, viewer);
  return {
    ...row.player,
    displayName: identity.displayName,
    nameClass: identity.nameClass,
    avatarClass: identity.avatarClass,
    isFrostedName: identity.isFrostedName,
    isFrostedAvatar: identity.isFrostedAvatar,
    total: row.total || 0,
  };
}

function loadedPositionCount(players) {
  return new Set((players || []).map(p => p.positionText).filter(v => v && v !== '位置待定')).size;
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function mergePlayersById(existing, incoming) {
  const map = new Map();
  (existing || []).concat(incoming || []).forEach(player => {
    if (player && player.id) map.set(player.id, player);
  });
  return Array.from(map.values()).sort((a, b) => Number(a.sortIndex || 0) - Number(b.sortIndex || 0));
}
