const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');

const TARGET_OPTIONS = [
  { label: '全队成员', scope: 'all' },
  { label: '正式球员', scope: 'verified' },
  { label: '试训队员', scope: 'trial' },
  { label: '管理员', scope: 'admins' },
  { label: '指定球员', scope: 'player' },
];
const NOTIFICATION_PAGE_LIMIT = 30;
const NOTIFICATION_PLAYER_LIMIT = 50;

Page({
  data: {
    user: null,
    isSender: false,
    loading: true,
    notifications: [],
    unreadCount: 0,
    notificationsHasMore: false,
    notificationsNextOffset: 0,
    loadingMoreNotifications: false,
    targetOptions: TARGET_OPTIONS,
    targetIndex: 0,
    targetLabel: TARGET_OPTIONS[0].label,
    targetScope: TARGET_OPTIONS[0].scope,
    players: [],
    playerOptions: [{ id: '', label: '请选择球员' }],
    playerIndex: 0,
    playerLabel: '请选择球员',
    playerHasMore: false,
    playerNextOffset: 0,
    loadingMorePlayers: false,
    noticeTitle: '',
    noticeBody: '',
    saving: false,
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const me = await api.get('/auth/me').catch(() => ({ user: null, player: null }));
      if (getApp().setIdentity) getApp().setIdentity(me);
      const user = me.user || null;
      const isSender = canSendNotification(user);
      const shouldLoadPlayers = isSender && this.data.targetScope === 'player';
      const [res, playersRes] = await Promise.all([
        fetchNotificationPage(0),
        shouldLoadPlayers ? fetchPlayerOptionsPage(0) : Promise.resolve({ players: this.data.players || [], hasMore: this.data.playerHasMore, nextOffset: this.data.playerNextOffset }),
      ]);
      const players = playersRes.players || [];
      const playerOptions = buildPlayerOptions(players);
      const playerIndex = clampPlayerIndex(this.data.playerIndex, playerOptions);
      this.setData({
        user,
        isSender,
        notifications: (res.notifications || []).map(formatNotification),
        unreadCount: Number.isFinite(Number(res.unreadCount))
          ? Number(res.unreadCount)
          : (res.notifications || []).filter(item => !item.readAt).length,
        notificationsHasMore: !!res.hasMore,
        notificationsNextOffset: normalizeNextOffset(res.nextOffset, (res.notifications || []).length),
        players,
        playerOptions,
        playerIndex,
        playerLabel: (playerOptions[playerIndex] || playerOptions[0]).label,
        playerHasMore: !!playersRes.hasMore,
        playerNextOffset: normalizeNextOffset(playersRes.nextOffset, players.length),
      });
    } catch (err) {
      showError(err, '通知加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async markRead(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const existing = (this.data.notifications || []).find(item => item.id === id);
      const res = await api.post(`/notifications/${id}/read`, {});
      const notification = formatNotification(res.notification || { ...existing, readAt: new Date().toISOString() });
      const notifications = (this.data.notifications || []).map(item => item.id === id ? notification : item);
      this.setData({
        notifications,
        unreadCount: existing && !existing.readAt ? Math.max(0, (this.data.unreadCount || 0) - 1) : this.data.unreadCount,
      });
    } catch (err) {
      showError(err, '标记失败');
    }
  },

  async loadMoreNotifications() {
    if (this.data.loadingMoreNotifications || !this.data.notificationsHasMore) return;
    const offset = this.data.notificationsNextOffset || (this.data.notifications || []).length;
    this.setData({ loadingMoreNotifications: true });
    try {
      const res = await fetchNotificationPage(offset);
      const notifications = mergeNotificationsById(
        this.data.notifications || [],
        (res.notifications || []).map(formatNotification)
      );
      this.setData({
        notifications,
        unreadCount: Number.isFinite(Number(res.unreadCount)) ? Number(res.unreadCount) : this.data.unreadCount,
        notificationsHasMore: !!res.hasMore,
        notificationsNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.notifications || []).length),
      });
    } catch (err) {
      showError(err, '通知加载失败');
    } finally {
      this.setData({ loadingMoreNotifications: false });
    }
  },

  async onTargetChange(e) {
    const targetIndex = Number(e.detail.value);
    const option = TARGET_OPTIONS[targetIndex] || TARGET_OPTIONS[0];
    this.setData({ targetIndex, targetLabel: option.label, targetScope: option.scope });
    if (option.scope === 'player' && !(this.data.players || []).length) {
      await this.loadPlayerOptions(true);
    }
  },

  onPlayerChange(e) {
    const playerIndex = Number(e.detail.value);
    const option = this.data.playerOptions[playerIndex] || this.data.playerOptions[0];
    this.setData({ playerIndex, playerLabel: option.label });
  },

  onNoticeTitleInput(e) {
    this.setData({ noticeTitle: e.detail.value });
  },

  onNoticeBodyInput(e) {
    this.setData({ noticeBody: e.detail.value });
  },

  loadMorePlayers() {
    return this.loadPlayerOptions(false);
  },

  async loadPlayerOptions(reset = false) {
    if (!this.data.isSender || this.data.loadingMorePlayers) return;
    const offset = reset ? 0 : (this.data.playerNextOffset || (this.data.players || []).length);
    this.setData({ loadingMorePlayers: true });
    try {
      const res = await fetchPlayerOptionsPage(offset);
      const players = reset ? (res.players || []) : mergePlayersById(this.data.players || [], res.players || []);
      const playerOptions = buildPlayerOptions(players);
      const playerIndex = reset ? 0 : clampPlayerIndex(this.data.playerIndex, playerOptions);
      this.setData({
        players,
        playerOptions,
        playerIndex,
        playerLabel: (playerOptions[playerIndex] || playerOptions[0]).label,
        playerHasMore: !!res.hasMore,
        playerNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.players || []).length),
      });
    } catch (err) {
      showError(err, '球员候选加载失败');
    } finally {
      this.setData({ loadingMorePlayers: false });
    }
  },

  async submitNotice() {
    if (!this.data.isSender || this.data.saving) return;
    const target = TARGET_OPTIONS[this.data.targetIndex] || TARGET_OPTIONS[0];
    const title = String(this.data.noticeTitle || '').trim();
    const body = String(this.data.noticeBody || '').trim();
    if (!title) return toast('请填写通知标题');
    if (!body) return toast('请填写通知内容');
    const payload = { scope: target.scope, title, body };
    if (target.scope === 'player') {
      const player = selectedPlayer(this.data);
      if (!player) return toast('请选择球员');
      payload.playerId = player.id;
    }
    this.setData({ saving: true });
    try {
      const res = await api.post('/notifications', payload);
      toast(`已发送 ${res.count || 0} 人`);
      this.setData({ noticeTitle: '', noticeBody: '' });
      await this.load();
    } catch (err) {
      showError(err, '发送通知失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function canSendNotification(user) {
  const permissions = user?.permissions || [];
  return permissions.includes('notifications:write');
}

function fetchPlayerOptionsPage(offset) {
  return api.get('/players', { include: 'all', limit: NOTIFICATION_PLAYER_LIMIT, offset }).catch(() => ({ players: [], hasMore: false, nextOffset: offset }));
}

function buildPlayerOptions(players) {
  return [{ id: '', label: '请选择球员' }].concat((players || []).map(player => ({
    id: player.id,
    label: `#${player.number || '-'} ${player.publicDisplayName || player.name} · ${player.level === 'verified' ? '正式' : '试训'}`,
  })));
}

function clampPlayerIndex(index, playerOptions) {
  return Math.min(Math.max(Number(index) || 0, 0), Math.max((playerOptions || []).length - 1, 0));
}

function selectedPlayer(data) {
  const option = data.playerOptions[data.playerIndex] || {};
  if (!option.id) return null;
  return (data.players || []).find(player => player.id === option.id) || null;
}

function formatNotification(note) {
  return {
    ...note,
    readClass: note.readAt ? 'read' : 'unread',
    statusText: note.readAt ? '已读' : '未读',
    timeText: note.createdAt ? String(note.createdAt).slice(0, 16).replace('T', ' ') : '',
  };
}

function fetchNotificationPage(offset) {
  return api.get('/notifications', {
    limit: NOTIFICATION_PAGE_LIMIT,
    offset,
  });
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeNotificationsById(existing, incoming) {
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

function mergePlayersById(existing, incoming) {
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
