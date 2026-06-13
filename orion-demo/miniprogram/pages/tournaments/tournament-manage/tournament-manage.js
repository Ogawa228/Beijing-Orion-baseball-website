const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');
const upload = require('../../../utils/upload');

const GAME_PAGE_LIMIT = 60;

const tournamentTypeOptions = [
  { label: '🏆 杯赛', value: 'cup' },
  { label: '🏅 联赛', value: 'league' },
  { label: '🏋️ 训练赛', value: 'training' },
  { label: '🤝 友谊赛', value: 'friendly' },
];

const tournamentSportOptions = [
  { label: '🥎 慢垒', value: 'softball' },
  { label: '⚾ 棒球', value: 'baseball' },
  { label: '⚾🥎 综合', value: 'mixed' },
];

const gameFilterOptions = [
  { label: '未关联比赛', value: 'unassigned' },
  { label: '当前赛事', value: 'current' },
  { label: '全部比赛', value: 'all' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

Page({
  data: {
    id: '',
    editing: false,
    loading: true,
    permissionChecked: false,
    canManageTournaments: false,
    canMoveGames: false,
    canDeleteTournaments: false,
    pageTitle: '新建赛事',
    pageSubtle: '赛事是杯赛、联赛或训练赛容器，不等于单场比赛。',
    submitLabel: '保存赛事',
    tournamentTypeOptions,
    tournamentTypeIndex: 0,
    tournamentTypeLabel: tournamentTypeOptions[0].label,
    tournamentSportOptions,
    tournamentSportIndex: 0,
    tournamentSportLabel: tournamentSportOptions[0].label,
    name: '',
    shortName: '',
    season: '',
    startDate: today(),
    endDate: today(),
    location: '',
    locationLatitude: null,
    locationLongitude: null,
    locationMetaText: '',
    cover: '',
    coverUploadText: '',
    uploadingCover: false,
    description: '',
    deleteConfirmText: '',
    games: [],
    visibleGames: [],
    gameFilterOptions,
    gameFilterIndex: 0,
    gameFilterLabel: gameFilterOptions[0].label,
    selectedGameIds: [],
    selectedGameCount: 0,
    gamesHasMore: false,
    gamesNextOffset: 0,
    loadingMoreGames: false,
    saving: false,
    deleting: false,
  },

  onLoad(options = {}) {
    this.setData({
      id: options.id || '',
      editing: !!options.id,
      pageTitle: options.id ? '编辑赛事' : '新建赛事',
      pageSubtle: options.id ? '维护赛事信息，并把历史比赛归属整理到这个赛事。' : '创建赛事容器后，可以继续整理比赛归属。',
    });
    return this.prepare();
  },

  async prepare() {
    const allowed = await this.ensurePermission();
    if (!allowed) return;
    if (this.data.id) {
      await this.loadTournament();
      await this.loadGames({ reset: true });
    } else {
      this.setData({ loading: false });
    }
  },

  async ensurePermission() {
    const app = getApp();
    try {
      const me = await api.get('/auth/me');
      if (app.setIdentity) app.setIdentity(me);
      const user = me.user || null;
      if (!user) {
        this.setData({ permissionChecked: true, loading: false });
        wx.navigateTo({ url: '/pages/login/login' });
        return false;
      }
      const canManageTournaments = hasPermission(user, 'tournaments:write');
      const canMoveGames = hasPermission(user, 'games:revise');
      const canDeleteTournaments = canManageTournaments && hasPermission(user, 'destructive:delete');
      this.setData({
        permissionChecked: true,
        canManageTournaments,
        canMoveGames,
        canDeleteTournaments,
      });
      if (!canManageTournaments) {
        toast('需要赛事管理权限');
        setTimeout(() => wx.switchTab({ url: '/pages/events/event-list/event-list' }), 350);
        return false;
      }
      return true;
    } catch (err) {
      this.setData({ permissionChecked: true, loading: false });
      showError(err, '权限校验失败');
      return false;
    }
  },

  backToEventHub() {
    wx.switchTab({ url: '/pages/events/event-list/event-list' });
  },

  async loadTournament() {
    try {
      const res = await api.get(`/tournaments/${this.data.id}`);
      const tournament = res.tournament || {};
      const typeIndex = pickOptionIndex(tournamentTypeOptions, tournament.type);
      const sportIndex = pickOptionIndex(tournamentSportOptions, tournament.sport);
      this.setData({
        tournamentTypeIndex: typeIndex,
        tournamentTypeLabel: tournamentTypeOptions[typeIndex].label,
        tournamentSportIndex: sportIndex,
        tournamentSportLabel: tournamentSportOptions[sportIndex].label,
        name: tournament.name || '',
        shortName: tournament.shortName || '',
        season: tournament.season || '',
        startDate: tournament.startDate || today(),
        endDate: tournament.endDate || tournament.startDate || today(),
        location: tournament.location || '',
        cover: tournament.cover || '',
        description: tournament.description || '',
      });
    } catch (err) {
      showError(err, '赛事加载失败');
    }
  },

  gameQueryParams(offset) {
    return {
      includeAggregate: false,
      limit: GAME_PAGE_LIMIT,
      offset,
    };
  },

  async loadGames({ reset = false } = {}) {
    if (!this.data.canMoveGames || !this.data.id) {
      this.setData({ loading: false });
      return;
    }
    const offset = reset ? 0 : (this.data.gamesNextOffset || (this.data.games || []).length);
    this.setData(reset
      ? { loading: true, games: [], visibleGames: [], gamesNextOffset: 0, gamesHasMore: false, selectedGameIds: [], selectedGameCount: 0 }
      : { loadingMoreGames: true });
    try {
      const res = await api.get('/games', this.gameQueryParams(offset));
      const incoming = res.games || [];
      const games = reset ? incoming : mergeGamesById(this.data.games || [], incoming);
      this.setData({
        games,
        gamesHasMore: !!res.hasMore,
        gamesNextOffset: normalizeNextOffset(res.nextOffset, offset + incoming.length),
        ...buildGameSelectionState({
          games,
          tournamentId: this.data.id,
          filter: currentGameFilter(this.data),
          selectedGameIds: this.data.selectedGameIds,
        }),
      });
    } catch (err) {
      showError(err, '比赛候选加载失败');
    } finally {
      this.setData({ loading: false, loadingMoreGames: false });
    }
  },

  loadMoreGames() {
    if (!this.data.gamesHasMore || this.data.loadingMoreGames) return Promise.resolve();
    return this.loadGames({ reset: false });
  },

  onTournamentTypeChange(e) {
    const tournamentTypeIndex = Number(e.detail.value) || 0;
    const option = tournamentTypeOptions[tournamentTypeIndex] || tournamentTypeOptions[0];
    this.setData({ tournamentTypeIndex, tournamentTypeLabel: option.label });
  },

  onTournamentSportChange(e) {
    const tournamentSportIndex = Number(e.detail.value) || 0;
    const option = tournamentSportOptions[tournamentSportIndex] || tournamentSportOptions[0];
    this.setData({ tournamentSportIndex, tournamentSportLabel: option.label });
  },

  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onShortNameInput(e) { this.setData({ shortName: e.detail.value }); },
  onSeasonInput(e) { this.setData({ season: e.detail.value }); },
  onStartDateChange(e) {
    const startDate = e.detail.value || today();
    const endDate = this.data.endDate && this.data.endDate >= startDate ? this.data.endDate : startDate;
    this.setData({ startDate, endDate });
  },
  onEndDateChange(e) { this.setData({ endDate: e.detail.value || this.data.startDate || today() }); },
  // 赛事地点只走地图选点,与活动接龙一致;赛事不签到,坐标仅用于回填地点名和下次选点定位
  chooseTournamentLocation() {
    if (!wx.chooseLocation) {
      toast('当前微信版本不支持地图选点');
      return;
    }
    const options = {
      success: res => {
        const name = String(res.name || res.address || this.data.location || '').trim();
        const latitude = Number(res.latitude);
        const longitude = Number(res.longitude);
        this.setData({
          location: name,
          locationLatitude: Number.isFinite(latitude) ? latitude : null,
          locationLongitude: Number.isFinite(longitude) ? longitude : null,
          locationMetaText: String(res.address || '').trim(),
        });
        toast('已选择地点');
      },
      fail: err => {
        const raw = String((err && (err.errMsg || err.message)) || '');
        if (!/cancel/.test(raw)) showError(new Error('地图选点失败，请确认已授权位置'), '选择地点失败');
      },
    };
    const latitude = Number(this.data.locationLatitude);
    const longitude = Number(this.data.locationLongitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      options.latitude = latitude;
      options.longitude = longitude;
    }
    wx.chooseLocation(options);
  },
  onCoverInput(e) { this.setData({ cover: e.detail.value }); },
  onDescriptionInput(e) { this.setData({ description: e.detail.value }); },
  onDeleteConfirmInput(e) { this.setData({ deleteConfirmText: e.detail.value }); },

  onGameFilterChange(e) {
    const gameFilterIndex = Number(e.detail.value) || 0;
    const option = gameFilterOptions[gameFilterIndex] || gameFilterOptions[0];
    this.setData({
      gameFilterIndex,
      gameFilterLabel: option.label,
      ...buildGameSelectionState({
        games: this.data.games,
        tournamentId: this.data.id,
        filter: option.value,
        selectedGameIds: this.data.selectedGameIds,
      }),
    });
  },

  onGameSelectionChange(e) {
    const visibleIds = new Set((this.data.visibleGames || []).map(game => game.id));
    const checked = new Set(e.detail.value || []);
    const next = (this.data.selectedGameIds || []).filter(id => !visibleIds.has(id));
    checked.forEach(id => next.push(id));
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournamentId: this.data.id,
      filter: currentGameFilter(this.data),
      selectedGameIds: next,
    }));
  },

  selectAllVisibleGames() {
    const next = new Set(this.data.selectedGameIds || []);
    (this.data.visibleGames || []).forEach(game => next.add(game.id));
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournamentId: this.data.id,
      filter: currentGameFilter(this.data),
      selectedGameIds: Array.from(next),
    }));
  },

  clearGameSelection() {
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournamentId: this.data.id,
      filter: currentGameFilter(this.data),
      selectedGameIds: [],
    }));
  },

  async chooseCoverImage() {
    if (this.data.uploadingCover) return;
    this.setData({ uploadingCover: true, coverUploadText: '选择赛事封面中...' });
    try {
      const file = await chooseImageFile();
      if (!file) {
        this.setData({ coverUploadText: '' });
        return;
      }
      this.setData({ coverUploadText: '上传 COS 中...' });
      const res = await uploadImageFile(file, 'tournament', 'tournament-cover');
      this.setData({
        cover: res.url || '',
        coverUploadText: '已上传赛事封面',
      });
      toast('赛事封面已上传');
    } catch (err) {
      showError(err, '赛事封面上传失败');
      this.setData({ coverUploadText: '上传失败，可稍后重试' });
    } finally {
      this.setData({ uploadingCover: false });
    }
  },

  clearCover() {
    this.setData({ cover: '', coverUploadText: '' });
  },

  async submit() {
    if (!this.data.canManageTournaments || this.data.saving) return;
    const name = String(this.data.name || '').trim();
    if (!name) {
      toast('请填写赛事全称');
      return;
    }
    const startDate = this.data.startDate || today();
    const payload = {
      type: (tournamentTypeOptions[this.data.tournamentTypeIndex] || tournamentTypeOptions[0]).value,
      sport: (tournamentSportOptions[this.data.tournamentSportIndex] || tournamentSportOptions[0]).value,
      name,
      shortName: String(this.data.shortName || '').trim(),
      season: String(this.data.season || '').trim(),
      startDate,
      endDate: this.data.endDate || startDate,
      location: String(this.data.location || '').trim(),
      cover: String(this.data.cover || '').trim() || null,
      description: String(this.data.description || '').trim() || null,
    };
    this.setData({ saving: true });
    try {
      const res = this.data.id
        ? await api.patch(`/tournaments/${this.data.id}`, payload)
        : await api.post('/tournaments', payload);
      const tournament = res.tournament || {};
      // 标记赛事活动列表需要刷新,返回后能看到新建/编辑的赛事
      try { wx.setStorageSync('orionEventHubDirty', true); } catch (e) { /* 忽略 */ }
      toast(this.data.id ? '赛事已保存' : '赛事已创建');
      if (!this.data.id && tournament.id) {
        this.setData({
          id: tournament.id,
          editing: true,
          pageTitle: '编辑赛事',
          pageSubtle: '维护赛事信息，并把历史比赛归属整理到这个赛事。',
        });
        await this.loadGames({ reset: true });
      }
    } catch (err) {
      showError(err, '赛事保存失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async moveSelectedGames() {
    if (!this.data.canMoveGames || !this.data.id || this.data.saving) return;
    const gameIds = this.data.selectedGameIds || [];
    if (!gameIds.length) {
      toast('请选择要整理的比赛');
      return;
    }
    this.setData({ saving: true });
    try {
      const res = await api.patch('/games/batch-reassign', {
        gameIds,
        tournamentId: this.data.id,
      });
      toast(`已移动 ${res.moved || gameIds.length} 场比赛`);
      this.setData({ selectedGameIds: [], selectedGameCount: 0 });
      await this.loadGames({ reset: true });
    } catch (err) {
      showError(err, '比赛归属整理失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteTournament() {
    if (!this.data.canDeleteTournaments || !this.data.id || this.data.deleting) return;
    if (String(this.data.deleteConfirmText || '').trim() !== '删除赛事') {
      toast('请输入“删除赛事”确认');
      return;
    }
    const ok = await confirmDelete();
    if (!ok) return;
    this.setData({ deleting: true });
    try {
      await api.del(`/tournaments/${this.data.id}`);
      try { wx.setStorageSync('orionEventHubDirty', true); } catch (e) { /* 忽略 */ }
      toast('赛事已删除');
      wx.switchTab({ url: '/pages/events/event-list/event-list' });
    } catch (err) {
      showError(err, '删除赛事失败');
    } finally {
      this.setData({ deleting: false });
    }
  },
});

function hasPermission(user, permission) {
  const permissions = user?.permissions || [];
  return permissions.includes(permission) || (user?.role === 'admin' && !permissions.length);
}

function pickOptionIndex(options, value) {
  const key = String(value || '').trim();
  const index = (options || []).findIndex(option => option.value === key || option.label === key);
  return index >= 0 ? index : 0;
}

function currentGameFilter(data) {
  return (data.gameFilterOptions[data.gameFilterIndex] || gameFilterOptions[0]).value;
}

function buildGameSelectionState({ games, tournamentId, filter, selectedGameIds }) {
  const gameIdSet = new Set((games || []).map(game => game.id));
  const selectedIds = Array.from(new Set(selectedGameIds || [])).filter(id => gameIdSet.has(id));
  const selectedSet = new Set(selectedIds);
  return {
    selectedGameIds: selectedIds,
    selectedGameCount: selectedIds.length,
    visibleGames: buildVisibleGames(games, tournamentId, filter, selectedSet),
  };
}

function buildVisibleGames(games, tournamentId, filter, selectedSet) {
  return (games || [])
    .filter(game => {
      if (filter === 'current') return game.tournamentId === tournamentId;
      if (filter === 'all') return true;
      return !game.tournamentId;
    })
    .map(game => {
      const score = game.awayScore !== null && game.awayScore !== undefined && game.homeScore !== null && game.homeScore !== undefined
        ? `${game.awayScore}:${game.homeScore}`
        : 'vs';
      return {
        id: game.id,
        selected: selectedSet.has(game.id),
        title: `${game.away || '客队'} ${score} ${game.home || '主队'}`,
        meta: [game.date || '日期未设', sportLabel(game.sport), game.seasonName || game.season || '未设赛季', game.venue || '场地未设'].filter(Boolean).join(' · '),
        statusText: game.tournamentId === tournamentId ? '当前赛事' : (game.tournamentId ? '其他赛事' : '未关联赛事'),
      };
    });
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeGamesById(existing, incoming) {
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

function chooseImageFile() {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          resolve((res.tempFiles || [])[0] || null);
        },
        fail: reject,
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const filePath = (res.tempFilePaths || [])[0] || '';
        resolve(filePath ? {
          tempFilePath: filePath,
          size: (res.tempFiles || [])[0]?.size,
          name: filePath.split('/').pop() || '',
        } : null);
      },
      fail: reject,
    });
  });
}

// 统一走高可用上传工具(压缩 + uploadFile 直传 + callContainer 兜底)
function uploadImageFile(file, kind, fallbackPrefix) {
  return upload.uploadImage(file, kind, fallbackPrefix);
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(res.data || '');
      },
      fail: reject,
    });
  });
}

function inferImageContentType(fileName, filePath) {
  const name = String(fileName || filePath || '').toLowerCase();
  if (/\.png(?:\?|$)/.test(name)) return 'image/png';
  if (/\.gif(?:\?|$)/.test(name)) return 'image/gif';
  if (/\.webp(?:\?|$)/.test(name)) return 'image/webp';
  if (/\.svg(?:\?|$)/.test(name)) return 'image/svg+xml';
  return 'image/jpeg';
}

function confirmDelete() {
  return new Promise(resolve => {
    wx.showModal({
      title: '删除赛事',
      content: '只删除赛事容器，不删除已记录比赛。已关联比赛会保留在比赛中心。',
      confirmText: '删除',
      confirmColor: '#ff8a8a',
      success(res) {
        resolve(!!res.confirm);
      },
      fail() {
        resolve(false);
      },
    });
  });
}
