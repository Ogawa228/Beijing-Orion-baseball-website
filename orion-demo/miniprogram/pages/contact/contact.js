const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');

const LEGAL_URL = 'https://www.猎户座棒垒球.cn/legal.html';
const CONTACT_PLAYER_LIMIT = 5;

const FALLBACK_TEAM_INFO = [
  { icon: '📍', label: '主场', value: '北京 · 奥体中心棒垒球场', copyValue: '北京 奥体中心棒垒球场' },
  { icon: '🗓', label: '训练时间', value: '每周三、周五、周日 20:00 - 22:00（具体看群）', copyValue: '每周三、周五、周日 20:00 - 22:00（具体看群）' },
  { icon: '⭐', label: '成立时间', value: '2013 年 9 月', copyValue: '2013 年 9 月' },
  { icon: '📕', label: '官方小红书', value: '@北京猎户座棒垒球俱乐部', copyValue: '@北京猎户座棒垒球俱乐部' },
  { icon: '✉', label: '邮箱', value: 'orion@beijing-orion.com', copyValue: 'orion@beijing-orion.com' },
];

const CONTACTS = [
  { name: '曹山', role: '联络人', playerName: '曹山', initial: '曹', handles: [{ label: '微信', value: 'qwecaoshan' }, { label: '小红书', value: '@山子贼拉酷' }] },
  { name: '王斌', role: '联络人 · #110 · 外野', playerName: '王斌', initial: '王', handles: [{ label: '邮箱', value: '478753480@qq.com' }, { label: '小红书', value: '609655049' }] },
  { name: '李斯然', role: '队长', playerName: '李斯然', initial: '李', handles: [{ label: '微信', value: 'Alan__1110' }] },
  { name: '黄强', role: '队长', playerName: '黄强', initial: '黄', handles: [{ label: '微信', value: 'Deco_E' }] },
  { name: '洁哥', role: '球队经理', initial: '洁', handles: [] },
];

Page({
  data: {
    teamInfo: FALLBACK_TEAM_INFO,
    contacts: CONTACTS.map(contact => formatContact(contact, null)),
    joinName: '',
    joinContact: '',
    joinMessage: '',
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const [meRes, teamInfoRes, playersByName] = await Promise.all([
        api.get('/auth/me').catch(() => ({ user: null, player: null })),
        loadTeamInfo().catch(() => ({ teamInfo: FALLBACK_TEAM_INFO })),
        loadContactPlayers().catch(() => new Map()),
      ]);
      if (getApp().setIdentity) getApp().setIdentity(meRes);
      this.setData({
        teamInfo: normalizeTeamInfo(teamInfoRes.teamInfo),
        contacts: CONTACTS.map(contact => formatContact(contact, playersByName.get(contact.playerName))),
      });
    } catch (err) {
      showError(err, '联系方式加载失败');
    }
  },

  copyInfo(e) {
    const { value, label } = e.currentTarget.dataset;
    copyText(value, `${label || '信息'}已复制`);
  },

  copyHandle(e) {
    const { value, label } = e.currentTarget.dataset;
    copyText(value, `${label || '联系方式'}已复制`);
  },

  onNameInput(e) {
    this.setData({ joinName: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ joinContact: e.detail.value });
  },

  onMessageInput(e) {
    this.setData({ joinMessage: e.detail.value });
  },

  copyJoinMessage() {
    const lines = [
      '你好，我想了解北京猎户座棒垒球试训信息。',
      this.data.joinName ? `姓名：${this.data.joinName}` : '',
      this.data.joinContact ? `联系方式：${this.data.joinContact}` : '',
      this.data.joinMessage ? `补充：${this.data.joinMessage}` : '',
    ].filter(Boolean);
    copyText(lines.join('\n'), '咨询内容已复制');
  },

  goEvents() {
    wx.switchTab({ url: '/pages/events/event-list/event-list' });
  },

  goLegal() {
    wx.navigateTo({ url: `/pages/legal/legal?url=${encodeURIComponent(LEGAL_URL)}` });
  },
});

function formatContact(contact, player) {
  const avatar = player?.publicAvatar || player?.photo || '';
  return {
    ...contact,
    avatar,
    meta: avatar ? '来自球队公开资料' : contact.handles?.length ? '复制联系方式了解试训' : '球队日常事务负责人',
  };
}

function copyText(value, title) {
  const text = String(value || '').trim();
  if (!text) return;
  wx.setClipboardData({
    data: text,
    success: () => toast(title || '已复制'),
  });
}

async function loadTeamInfo() {
  return api.get('/team-info');
}

function normalizeTeamInfo(items) {
  if (!Array.isArray(items) || !items.length) return FALLBACK_TEAM_INFO;
  return items
    .filter(item => item && item.label && item.value)
    .map(item => ({
      icon: item.icon || 'ℹ️',
      label: String(item.label),
      value: String(item.value),
      copyValue: String(item.copyValue || item.value),
    }));
}

async function loadContactPlayers() {
  const pairs = await Promise.all(CONTACTS.filter(contact => contact.playerName).map(async contact => {
    const res = await api.get('/players', { keyword: contact.playerName, limit: CONTACT_PLAYER_LIMIT, offset: 0 });
    const player = (res.players || []).find(item => item.name === contact.playerName) || (res.players || [])[0] || null;
    return [contact.playerName, player];
  }));
  return pairs.reduce((map, [name, player]) => {
    if (player) map.set(name, player);
    return map;
  }, new Map());
}
