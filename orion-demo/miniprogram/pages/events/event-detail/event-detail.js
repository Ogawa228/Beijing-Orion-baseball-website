const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');
const { eventTagLabel, sportLabel } = require('../../../utils/labels');

const LINKED_GAME_PAGE_LIMIT = 20;
const MANUAL_PLAYER_PAGE_LIMIT = 50;

const manualStatusOptions = [
  { label: '报名', value: 'going' },
  { label: '待定', value: 'tentative' },
  { label: '取消', value: 'cancelled' },
];

function statusLabel(status) {
  if (status === 'tentative') return '待定';
  if (status === 'cancelled') return '已取消';
  return '报名';
}

function buildManualPlayerOptions(players) {
  return [{ id: '', label: '手动输入姓名' }].concat((players || []).map(player => ({
    id: player.id,
    label: `#${player.number || '-'} ${player.name} · ${player.level === 'verified' ? '正式' : '试训'}`,
  })));
}

function manualPlayerParams(query, offset) {
  const keyword = String(query || '').trim();
  const params = { include: 'all', limit: MANUAL_PLAYER_PAGE_LIMIT, offset };
  if (keyword) params.keyword = keyword;
  return params;
}

function selectedManualPlayer(data) {
  const option = data.manualPlayerOptions[data.manualPlayerIndex] || {};
  if (!option.id) return null;
  return (data.players || []).find(player => player.id === option.id) || null;
}

function normalizeImages(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try { return normalizeImages(JSON.parse(value)); } catch (_) { return value.trim() ? [value.trim()] : []; }
  }
  return [];
}

function hasPermission(user, permission) {
  return (user?.permissions || []).includes(permission) || (user?.role === 'admin' && !(user?.permissions || []).length);
}

function canStartScorebook(user) {
  return hasPermission(user, 'games:draft') || hasPermission(user, 'games:confirm');
}

function formatLinkedGame(game) {
  const away = game.away || '-';
  const home = game.home || '-';
  return {
    ...game,
    title: `${away} vs ${home}`,
    scoreText: `${game.awayScore ?? '-'} : ${game.homeScore ?? '-'}`,
    meta: [game.date, sportLabel(game.sport), game.seasonName || game.season].filter(Boolean).join(' · '),
  };
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeLinkedGamesById(existing, incoming) {
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

function mergePlayersById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(player => {
      const id = player && player.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

Page({
  data: {
    id: '',
    event: null,
    signups: [],
    activeSignups: [],
    linkedGames: [],
    linkedGamesHasMore: false,
    linkedGamesNextOffset: 0,
    loadingMoreLinkedGames: false,
    mine: null,
    players: [],
    note: '',
    manualPlayerOptions: [{ id: '', label: '手动输入姓名' }],
    manualPlayerIndex: 0,
    manualPlayerLabel: '手动输入姓名',
    manualPlayerQuery: '',
    manualPlayersHasMore: false,
    manualPlayersNextOffset: 0,
    loadingManualPlayers: false,
    loadingMoreManualPlayers: false,
    manualName: '',
    manualStatusOptions,
    manualStatusIndex: 0,
    manualStatusLabel: manualStatusOptions[0].label,
    manualNote: '',
    importText: '',
    importSummary: '',
    canImportSignups: false,
    canManageSignups: false,
    canEditEvent: false,
    canStartGame: false,
    deleteConfirmText: '',
    saving: false,
    importing: false,
    deleting: false,
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  onShareAppMessage() {
    const event = this.data.event || {};
    return {
      title: event.title ? `猎户接龙：${event.title}` : '北京猎户座接龙',
      path: `/pages/events/event-detail/event-detail?id=${this.data.id}`,
    };
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (!this.data.id) return;
    try {
      const user = getApp().globalData.user;
      const permissions = user?.permissions || [];
      const canManageSignups = user?.role === 'admin' || permissions.includes('events:write');
      const [eventRes, signupRes, gamesRes, playersRes] = await Promise.all([
        api.get(`/events/${this.data.id}`),
        api.get('/event-signups', { eventId: this.data.id }),
        api.get('/games', {
          includeAggregate: 'false',
          eventId: this.data.id,
          limit: LINKED_GAME_PAGE_LIMIT,
          offset: 0,
        }).catch(() => ({ games: [], hasMore: false, nextOffset: 0 })),
        canManageSignups
          ? api.get('/players', manualPlayerParams(this.data.manualPlayerQuery, 0)).catch(() => ({ players: [], hasMore: false, nextOffset: 0 }))
          : Promise.resolve({ players: [], hasMore: false, nextOffset: 0 }),
      ]);
      const signups = signupRes.signups || [];
      const mine = user ? signups.find(s => s.userId === user.id) : null;
      const event = eventRes.event || null;
      const eventImages = normalizeImages(event?.images);
      const players = playersRes.players || [];
      const manualPlayerOptions = buildManualPlayerOptions(players);
      const linkedGames = (gamesRes.games || []).map(formatLinkedGame);
      this.setData({
        event: event ? {
          ...event,
          tagLabel: eventTagLabel(event.tag),
          images: eventImages,
          heroCover: event.cover || eventImages[0] || '',
        } : null,
        signups,
        activeSignups: signups
          .filter(s => s.status !== 'cancelled')
          .map(s => ({ ...s, statusLabel: statusLabel(s.status) })),
        linkedGames,
        linkedGamesHasMore: !!gamesRes.hasMore,
        linkedGamesNextOffset: normalizeNextOffset(gamesRes.nextOffset, linkedGames.length),
        mine: mine || null,
        players,
        manualPlayerOptions,
        manualPlayerIndex: 0,
        manualPlayerLabel: manualPlayerOptions[0].label,
        manualPlayersHasMore: !!playersRes.hasMore,
        manualPlayersNextOffset: normalizeNextOffset(playersRes.nextOffset, players.length),
        note: mine ? mine.note : this.data.note,
        canImportSignups: canManageSignups,
        canManageSignups,
        canEditEvent: canManageSignups,
        canStartGame: canStartScorebook(user),
      });
    } catch (err) {
      showError(err, '活动详情加载失败');
    }
  },

  async reloadManualPlayers() {
    if (!this.data.canManageSignups || this.data.loadingManualPlayers) return;
    this.setData({ loadingManualPlayers: true });
    try {
      const res = await api.get('/players', manualPlayerParams(this.data.manualPlayerQuery, 0));
      const players = res.players || [];
      const manualPlayerOptions = buildManualPlayerOptions(players);
      this.setData({
        players,
        manualPlayerOptions,
        manualPlayerIndex: 0,
        manualPlayerLabel: manualPlayerOptions[0].label,
        manualPlayersHasMore: !!res.hasMore,
        manualPlayersNextOffset: normalizeNextOffset(res.nextOffset, players.length),
      });
    } catch (err) {
      showError(err, '球员候选加载失败');
    } finally {
      this.setData({ loadingManualPlayers: false });
    }
  },

  async loadMoreManualPlayers() {
    if (!this.data.canManageSignups || !this.data.manualPlayersHasMore || this.data.loadingMoreManualPlayers) return;
    const offset = this.data.manualPlayersNextOffset || (this.data.players || []).length;
    this.setData({ loadingMoreManualPlayers: true });
    try {
      const res = await api.get('/players', manualPlayerParams(this.data.manualPlayerQuery, offset));
      const incoming = res.players || [];
      const players = mergePlayersById(this.data.players || [], incoming);
      this.setData({
        players,
        manualPlayerOptions: buildManualPlayerOptions(players),
        manualPlayersHasMore: !!res.hasMore,
        manualPlayersNextOffset: normalizeNextOffset(res.nextOffset, offset + incoming.length),
      });
    } catch (err) {
      showError(err, '更多球员加载失败');
    } finally {
      this.setData({ loadingMoreManualPlayers: false });
    }
  },

  async loadMoreLinkedGames() {
    if (!this.data.linkedGamesHasMore || this.data.loadingMoreLinkedGames) return;
    const offset = this.data.linkedGamesNextOffset || (this.data.linkedGames || []).length;
    this.setData({ loadingMoreLinkedGames: true });
    try {
      const res = await api.get('/games', {
        includeAggregate: 'false',
        eventId: this.data.id,
        limit: LINKED_GAME_PAGE_LIMIT,
        offset,
      });
      const incoming = (res.games || []).map(formatLinkedGame);
      const linkedGames = mergeLinkedGamesById(this.data.linkedGames || [], incoming);
      this.setData({
        linkedGames,
        linkedGamesHasMore: !!res.hasMore,
        linkedGamesNextOffset: normalizeNextOffset(res.nextOffset, offset + incoming.length),
      });
    } catch (err) {
      showError(err, '关联比赛加载失败');
    } finally {
      this.setData({ loadingMoreLinkedGames: false });
    }
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },

  onManualPlayerChange(e) {
    const manualPlayerIndex = Number(e.detail.value);
    const option = this.data.manualPlayerOptions[manualPlayerIndex] || this.data.manualPlayerOptions[0];
    this.setData({ manualPlayerIndex, manualPlayerLabel: option.label });
  },

  onManualPlayerQueryInput(e) {
    this.setData({ manualPlayerQuery: e.detail.value });
  },

  searchManualPlayers() {
    return this.reloadManualPlayers();
  },

  clearManualPlayerQuery() {
    this.setData({ manualPlayerQuery: '' });
    return this.reloadManualPlayers();
  },

  onManualNameInput(e) {
    this.setData({ manualName: e.detail.value });
  },

  onManualStatusChange(e) {
    const manualStatusIndex = Number(e.detail.value);
    const option = manualStatusOptions[manualStatusIndex] || manualStatusOptions[0];
    this.setData({ manualStatusIndex, manualStatusLabel: option.label });
  },

  onManualNoteInput(e) {
    this.setData({ manualNote: e.detail.value });
  },

  onDeleteConfirmInput(e) {
    this.setData({ deleteConfirmText: e.detail.value });
  },

  ensureLogin() {
    if (getApp().globalData.user) return true;
    wx.navigateTo({ url: '/pages/login/login' });
    return false;
  },

  async submitSignup(status) {
    if (!this.ensureLogin()) return;
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post('/event-signups', {
        eventId: this.data.id,
        note: this.data.note,
        status,
        source: 'mini',
      });
      toast(status === 'tentative' ? '已标记待定' : '已报名');
      await this.load();
    } catch (err) {
      showError(err, '报名失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  signup() {
    return this.submitSignup('going');
  },

  tentative() {
    return this.submitSignup('tentative');
  },

  async adminUpsertSignup() {
    if (!this.ensureLogin()) return;
    if (!this.data.canManageSignups) {
      toast('需要管理员权限');
      return;
    }
    const player = selectedManualPlayer(this.data);
    const manualName = String(this.data.manualName || '').trim();
    if (!player && !manualName) {
      toast('请选择球员或填写姓名');
      return;
    }
    const status = (this.data.manualStatusOptions[this.data.manualStatusIndex] || manualStatusOptions[0]).value;
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post('/event-signups/admin-upsert', {
        eventId: this.data.id,
        playerId: player ? player.id : '',
        manualName: player ? '' : manualName,
        status,
        note: this.data.manualNote,
        source: 'mini_admin_manual',
      });
      toast('名单已更新');
      this.setData({
        manualPlayerIndex: 0,
        manualPlayerLabel: this.data.manualPlayerOptions[0].label,
        manualName: '',
        manualNote: '',
      });
      await this.load();
    } catch (err) {
      showError(err, '手动更新名单失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async updateSignupStatus(e) {
    if (!this.ensureLogin()) return;
    if (!this.data.canManageSignups) {
      toast('需要管理员权限');
      return;
    }
    const { id, status } = e.currentTarget.dataset || {};
    if (!id || !status) return;
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.patch(`/event-signups/${id}`, { status });
      toast(status === 'cancelled' ? '已移出名单' : '名单状态已更新');
      await this.load();
    } catch (err) {
      showError(err, '名单状态更新失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async cancelMine() {
    if (!this.ensureLogin()) return;
    const mine = this.data.mine;
    if (!mine) {
      toast('你还没有报名');
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post(`/event-signups/${mine.id}/cancel`, {});
      toast('已取消');
      await this.load();
    } catch (err) {
      showError(err, '取消失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  editEvent() {
    if (!this.data.canEditEvent) {
      toast('需要管理员权限');
      return;
    }
    wx.navigateTo({ url: `/pages/events/event-create/event-create?id=${this.data.id}` });
  },

  startScoreFromEvent() {
    if (!this.data.canStartGame) {
      toast('需要比赛记录权限');
      return;
    }
    wx.navigateTo({ url: `/pages/score/create/create?eventId=${this.data.id}` });
  },

  openGame(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${id}` });
  },

  copySourceLink() {
    const link = String(this.data.event?.sourceLink || '').trim();
    if (!link || link === 'orion-miniprogram') {
      toast('暂无原帖链接');
      return;
    }
    wx.setClipboardData({
      data: link,
      success() {
        toast('链接已复制');
      },
    });
  },

  previewEventImage(e) {
    const images = normalizeImages(this.data.event?.images);
    const index = Number(e.currentTarget.dataset.index || 0);
    if (!images.length) return;
    wx.previewImage({
      urls: images,
      current: images[index] || images[0],
    });
  },

  async deleteEvent() {
    if (!this.ensureLogin()) return;
    if (!this.data.canEditEvent) {
      toast('需要管理员权限');
      return;
    }
    if (String(this.data.deleteConfirmText || '').trim() !== '删除接龙') {
      toast('请输入“删除接龙”确认');
      return;
    }
    this.setData({ deleting: true });
    try {
      await new Promise((resolve, reject) => {
        wx.showModal({
          title: '删除接龙',
          content: '删除后活动详情不再显示，已有报名和签到流水不会自动改写。',
          confirmText: '删除',
          success(res) {
            if (res.confirm) resolve();
            else reject(new Error('cancelled'));
          },
          fail: reject,
        });
      });
      await api.del(`/events/${this.data.id}`);
      toast('接龙已删除');
      wx.reLaunch({ url: '/pages/events/event-list/event-list' });
    } catch (err) {
      if (err && err.message === 'cancelled') return;
      showError(err, '删除接龙失败');
    } finally {
      this.setData({ deleting: false });
    }
  },

  async pasteAndImportRelay() {
    if (!this.ensureLogin()) return;
    if (!this.data.canImportSignups) {
      toast('需要管理员权限');
      return;
    }
    try {
      const res = await new Promise((resolve, reject) => {
        wx.getClipboardData({
          success: resolve,
          fail: reject,
        });
      });
      const text = String(res.data || '').trim();
      if (!text) {
        toast('剪贴板没有接龙内容');
        return;
      }
      this.setData({ importText: text });
      await this.importRelayPaste(text);
    } catch (err) {
      showError(err, '剪贴板读取失败');
    }
  },

  async importRelayPaste(textOverride) {
    if (!this.ensureLogin()) return;
    if (!this.data.canImportSignups) {
      toast('需要管理员权限');
      return;
    }
    const text = String(typeof textOverride === 'string' ? textOverride : this.data.importText || '').trim();
    if (!text) {
      toast('请先粘贴接龙内容');
      return;
    }
    if (this.data.importing) return;
    this.setData({ importing: true, importSummary: '' });
    try {
      const res = await api.post('/event-signups/import', {
        eventId: this.data.id,
        text,
        source: 'mini_relay_paste',
      });
      const imported = res.imported || [];
      this.setData({
        importSummary: `已识别 ${imported.length} 人，匹配球员 ${res.matchedCount || 0} 人，待人工确认 ${res.unmatchedCount || 0} 人。`,
        importText: '',
      });
      toast('已导入接龙');
      await this.load();
    } catch (err) {
      showError(err, '导入失败，可能需要管理员权限');
    } finally {
      this.setData({ importing: false });
    }
  },

  goCheckin() {
    // 签到页是 tabBar 页,switchTab 不能带参,目标接龙用 storage 暂存
    try { wx.setStorageSync('orionPendingCheckinEventId', this.data.id); } catch (err) { /* 忽略 */ }
    wx.switchTab({ url: '/pages/checkin/checkin' });
  },
});
