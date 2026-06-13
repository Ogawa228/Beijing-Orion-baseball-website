const api = require('../../utils/request');
const { showError } = require('../../utils/format');
const { sportLabel, eventTagLabel } = require('../../utils/labels');
const { playerIdentity } = require('../../utils/player-identity');
const nav = require('../../utils/nav');

const HOME_GAME_LIMIT = 3;

Page({
  data: {
    user: null,
    loading: true,
    nextEvent: null,
    leaders: [],
    games: [],
  },

  onLoad() {
    this.load();
  },

  onShow() {
    nav.syncTabBar(this);
    const app = getApp();
    if (this.data.user !== app.globalData.user) {
      this.setData({ user: app.globalData.user });
    }
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    const app = getApp();
    this.setData({ user: app.globalData.user, loading: true });
    try {
      const [me, events, leaderboard, games] = await Promise.all([
        api.get('/auth/me').catch(() => ({ user: null, player: null })),
        api.get('/events', { limit: 1 }),
        api.get('/leaderboard', { limit: 3 }),
        api.get('/games', { includeAggregate: 'false', limit: HOME_GAME_LIMIT }),
      ]);
      app.setIdentity(me);
      const nextEvent = (events.events || [])[0] || null;
      const viewer = { user: me.user || null, player: me.player || null };
      this.setData({
        user: me.user,
        nextEvent: nextEvent ? { ...nextEvent, tagLabel: eventTagLabel(nextEvent.tag) } : null,
        leaders: (leaderboard.leaderboard || []).slice(0, 3).map((row, index) => formatLeaderRow(row, index, viewer)),
        games: (games.games || []).slice(0, 3).map(game => ({
          ...game,
          sportLabel: sportLabel(game.sport),
        })),
      });
    } catch (err) {
      showError(err, '首页加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  openEvent(e) {
    wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${e.currentTarget.dataset.id}` });
  },

  openGame(e) {
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${e.currentTarget.dataset.id}` });
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },
});

function formatLeaderRow(row, index, viewer) {
  const player = row.player || {};
  const identity = playerIdentity(player, viewer);
  return {
    ...row,
    rank: index + 1,
    playerId: player.id || '',
    displayName: identity.displayName,
    nameClass: identity.nameClass,
  };
}
