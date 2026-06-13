const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');

const LEGAL_URL = 'https://www.猎户座棒垒球.cn/legal.html';
const LEGAL_PAGE_URL = `/pages/legal/legal?url=${encodeURIComponent(LEGAL_URL)}`;
const LEGAL_VERSION = 'orion-legal-2026-05-21';
const LOGIN_PREFS_KEY = 'orionLoginPrefs';

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
}

Page({
  data: {
    displayName: '',
    loading: false,
    legalUrl: LEGAL_URL,
    legalPageUrl: LEGAL_PAGE_URL,
    consents: [],
    allConsented: false,
    returning: false,
  },

  onLoad() {
    // 记住上次的昵称和协议确认:二次进入直接预填,点一下即可一键登录,无需重新输入/勾选
    let prefs = null;
    try { prefs = wx.getStorageSync(LOGIN_PREFS_KEY); } catch (err) { /* 忽略 */ }
    if (prefs && prefs.displayName) {
      this.setData({
        displayName: prefs.displayName,
        consents: prefs.consented ? ['terms', 'personal-info', 'guardian'] : [],
        allConsented: !!prefs.consented,
        returning: !!(prefs.consented && prefs.displayName),
      });
    }
  },

  onNameInput(e) {
    this.setData({ displayName: e.detail.value });
  },

  onConsentChange(e) {
    const consents = e.detail.value || [];
    this.setData({
      consents,
      allConsented: ['terms', 'personal-info', 'guardian'].every(key => consents.includes(key)),
    });
  },

  // 老用户想换昵称或重看协议时,切回完整表单
  editAgain() {
    this.setData({ returning: false });
  },

  async login() {
    const displayName = String(this.data.displayName || '').trim();
    if (!displayName) {
      toast('请先填写昵称');
      return;
    }
    if (!this.data.allConsented) {
      toast('请先勾选协议确认');
      return;
    }
    this.setData({ loading: true });
    try {
      const loginRes = await wxLogin();
      if (!loginRes.code) throw new Error('微信登录没有返回 code');
      const data = await api.post('/auth/wx-login', {
        code: loginRes.code,
        displayName,
        legalAccepted: this.data.consents.includes('terms'),
        personalInfoAccepted: this.data.consents.includes('personal-info'),
        guardianConfirmed: this.data.consents.includes('guardian'),
        legalUrl: LEGAL_URL,
        legalVersion: LEGAL_VERSION,
        legalAcceptedAt: new Date().toISOString(),
      });
      getApp().setIdentity(data);
      try { wx.setStorageSync(LOGIN_PREFS_KEY, { displayName, consented: true }); } catch (err) { /* 忽略 */ }
      const needsBind = !data.player || data.player.level !== 'verified';
      toast(needsBind ? '已登录，去申请绑定' : '已登录');
      setTimeout(() => {
        wx.reLaunch({ url: needsBind ? '/pages/bind/bind' : '/pages/home/home' });
      }, 350);
    } catch (err) {
      showError(err, '登录失败');
    } finally {
      this.setData({ loading: false });
    }
  },
});
