const { ORION_CONFIG } = require('./utils/config');
const session = require('./utils/session');
const api = require('./utils/request');

App({
  globalData: {
    user: null,
    player: null,
    ready: false,
  },

  onLaunch() {
    const shouldInitDefaultCloud = !ORION_CONFIG.cloudResourceAppid || ORION_CONFIG.cloudInitEnv;
    if (wx.cloud && shouldInitDefaultCloud) {
      const initOptions = { traceUser: true };
      if (ORION_CONFIG.cloudInitEnv) initOptions.env = ORION_CONFIG.cloudInitEnv;
      wx.cloud.init(initOptions);
    }
    const saved = session.getSession();
    if (saved) {
      this.refreshMe().catch(() => {
        session.clearSession();
      });
    }
  },

  async refreshMe() {
    const data = await api.get('/auth/me');
    this.globalData.user = data.user || null;
    this.globalData.player = data.player || null;
    this.globalData.ready = true;
    return data;
  },

  setIdentity({ user, player }) {
    this.globalData.user = user || null;
    this.globalData.player = player || null;
    this.globalData.ready = true;
  },
});
