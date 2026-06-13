const api = require('../../utils/request');
const { showError } = require('../../utils/format');
const { playerIdentity } = require('../../utils/player-identity');

const HOF_PAGE_LIMIT = 30;

Page({
  data: {
    entries: [],
    hasMore: false,
    nextOffset: 0,
    loading: true,
    loadingMore: false,
    viewer: null,
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load(reset = true) {
    if (reset) this.setData({ loading: true, hasMore: false, nextOffset: 0 });
    try {
      const offset = reset ? 0 : (this.data.nextOffset || this.data.entries.length);
      const [hofRes, meRes] = await Promise.all([
        api.get('/hall-of-fame', { includePlayer: 'true', limit: HOF_PAGE_LIMIT, offset }),
        reset || !this.data.viewer
          ? api.get('/auth/me').catch(() => ({ user: null, player: null }))
          : Promise.resolve(this.data.viewer),
      ]);
      if (getApp().setIdentity) getApp().setIdentity(meRes);
      const viewer = { user: meRes.user || null, player: meRes.player || null };
      const incoming = (hofRes.hallOfFame || []).map((entry, index) => formatEntry(entry, entry.player, offset + index, viewer));
      this.setData({
        entries: reset ? incoming : mergeEntriesByPlayerId(this.data.entries, incoming),
        hasMore: !!hofRes.hasMore,
        nextOffset: normalizeNextOffset(hofRes.nextOffset, offset + incoming.length),
        viewer,
        loading: false,
      });
    } catch (err) {
      if (reset) this.setData({ loading: false });
      showError(err, '名人堂加载失败');
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      await this.load(false);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },
});

function formatEntry(entry, player, index, viewer) {
  const identity = playerIdentity(player, viewer);
  return {
    ...entry,
    rank: index + 1,
    displayName: identity.displayName || '猎户成员',
    avatar: identity.avatar,
    nameClass: identity.nameClass,
    avatarClass: identity.avatarClass,
    numberText: player?.number ? `#${player.number}` : '猎户座',
    positionText: player?.position || '荣誉成员',
    yearText: entry.inductedYear ? `${entry.inductedYear}` : '年度待定',
    reasonText: entry.reason || '为北京猎户座留下关键贡献。',
  };
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeEntriesByPlayerId(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(entry => {
      const id = entry && entry.playerId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}
