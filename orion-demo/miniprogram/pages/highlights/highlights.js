const api = require('../../utils/request');
const upload = require('../../utils/upload');
const { showError, toast, scoreText } = require('../../utils/format');
const { playerIdentity } = require('../../utils/player-identity');

const HIGHLIGHT_LIMIT = 60;
const GAME_OPTION_LIMIT = 50;
const HIGHLIGHT_PLAYER_OPTION_LIMIT = 50;

Page({
  data: {
    user: null,
    isReviewer: false,
    highlights: [],
    highlightHasMore: false,
    highlightNextOffset: 0,
    loadingMoreHighlights: false,
    imageUrls: [],
    players: [],
    games: [],
    initialPlayerId: '',
    playerOptions: [{ id: '', label: '不关联球员' }],
    playerIndex: 0,
    playerLabel: '不关联球员',
    playerOptionHasMore: false,
    playerOptionNextOffset: 0,
    loadingMorePlayers: false,
    gameOptions: [{ id: '', label: '不关联比赛' }],
    gameIndex: 0,
    gameLabel: '不关联比赛',
    gameOptionHasMore: false,
    gameOptionNextOffset: 0,
    loadingMoreGames: false,
    titleInput: '',
    imageInput: '',
    bilibiliInput: '',
    uploadFileName: '',
    uploadStatusText: '',
    loading: true,
    saving: false,
    uploading: false,
  },

  onLoad(options = {}) {
    this.setData({ initialPlayerId: String(options.playerId || '').trim() });
    return this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const me = await api.get('/auth/me').catch(() => ({ user: null, player: null }));
      getApp().setIdentity(me);
      const user = me.user || null;
      const isReviewer = canReviewHighlights(me.user);
      const [highlightsRes, playersRes, gamesRes] = await Promise.all([
        fetchHighlightsPage(isReviewer, 0),
        user ? fetchPlayerOptionsPage(0, this.data.initialPlayerId) : Promise.resolve({ players: [], hasMore: false, nextOffset: 0 }),
        user ? fetchGameOptionsPage(0) : Promise.resolve({ games: [], hasMore: false, nextOffset: 0 }),
      ]);
      const players = playersRes.players || [];
      const games = gamesRes.games || [];
      const viewer = { user: me.user || null, player: me.player || null };
      const playersByName = buildPlayerNameIndex(players);
      const highlights = (highlightsRes.highlights || [])
        .map(highlight => formatHighlight(highlight, games, playersByName, viewer))
        .filter(highlight => isReviewer || highlight.isPublic);
      const imageUrls = highlights.map(item => item.image).filter(Boolean);
      const playerOptions = buildPlayerOptions(players, viewer);
      const gameOptions = buildGameOptions(games);
      const playerIndex = resolvePlayerIndex(playerOptions, this.data.initialPlayerId);
      this.setData({
        user,
        isReviewer,
        highlights,
        highlightHasMore: !!highlightsRes.hasMore,
        highlightNextOffset: Number(highlightsRes.nextOffset || highlights.length),
        imageUrls,
        players,
        games,
        playerOptions,
        gameOptions,
        playerIndex,
        playerLabel: playerOptions[playerIndex].label,
        playerOptionHasMore: !!playersRes.hasMore,
        playerOptionNextOffset: Number(playersRes.nextOffset || players.length),
        gameIndex: 0,
        gameLabel: gameOptions[0].label,
        gameOptionHasMore: !!gamesRes.hasMore,
        gameOptionNextOffset: Number(gamesRes.nextOffset || games.length),
      });
    } catch (err) {
      showError(err, '精彩时刻加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  onTitleInput(e) {
    this.setData({ titleInput: e.detail.value });
  },

  onImageInput(e) {
    this.setData({ imageInput: e.detail.value, uploadStatusText: '' });
  },

  onBilibiliInput(e) {
    this.setData({ bilibiliInput: e.detail.value });
  },

  onPlayerChange(e) {
    const playerIndex = Number(e.detail.value);
    const option = this.data.playerOptions[playerIndex] || this.data.playerOptions[0];
    this.setData({ playerIndex, playerLabel: option.label });
  },

  onGameChange(e) {
    const gameIndex = Number(e.detail.value);
    const option = this.data.gameOptions[gameIndex] || this.data.gameOptions[0];
    this.setData({ gameIndex, gameLabel: option.label });
  },

  async loadMoreHighlights() {
    if (this.data.loadingMoreHighlights || !this.data.highlightHasMore) return;
    this.setData({ loadingMoreHighlights: true });
    try {
      const res = await fetchHighlightsPage(this.data.isReviewer, this.data.highlightNextOffset || 0);
      const viewer = { user: this.data.user || null, player: getApp().globalData?.player || null };
      const playersByName = buildPlayerNameIndex(this.data.players || []);
      const incoming = (res.highlights || [])
        .map(highlight => formatHighlight(highlight, this.data.games || [], playersByName, viewer))
        .filter(highlight => this.data.isReviewer || highlight.isPublic);
      const highlights = mergeHighlights(this.data.highlights || [], incoming);
      this.setData({
        highlights,
        imageUrls: highlights.map(item => item.image).filter(Boolean),
        highlightHasMore: !!res.hasMore,
        highlightNextOffset: Number(res.nextOffset || (this.data.highlightNextOffset + incoming.length)),
      });
    } catch (err) {
      showError(err, '加载更多精彩时刻失败');
    } finally {
      this.setData({ loadingMoreHighlights: false });
    }
  },

  async loadMorePlayerOptions() {
    if (this.data.loadingMorePlayers || !this.data.playerOptionHasMore) return;
    this.setData({ loadingMorePlayers: true });
    try {
      const currentPlayerId = (this.data.playerOptions[this.data.playerIndex] || {}).id || '';
      const res = await fetchPlayerOptionsPage(this.data.playerOptionNextOffset || 0);
      const players = mergePlayers(this.data.players || [], res.players || []);
      const viewer = { user: this.data.user || null, player: getApp().globalData?.player || null };
      const playerOptions = buildPlayerOptions(players, viewer);
      const playerIndex = resolvePlayerIndex(playerOptions, currentPlayerId);
      this.setData({
        players,
        playerOptions,
        playerIndex,
        playerLabel: (playerOptions[playerIndex] || playerOptions[0]).label,
        playerOptionHasMore: !!res.hasMore,
        playerOptionNextOffset: Number(res.nextOffset || (this.data.playerOptionNextOffset + (res.players || []).length)),
      });
    } catch (err) {
      showError(err, '加载更多球员候选失败');
    } finally {
      this.setData({ loadingMorePlayers: false });
    }
  },

  async loadMoreGameOptions() {
    if (this.data.loadingMoreGames || !this.data.gameOptionHasMore) return;
    this.setData({ loadingMoreGames: true });
    try {
      const res = await fetchGameOptionsPage(this.data.gameOptionNextOffset || 0);
      const games = mergeGames(this.data.games || [], res.games || []);
      const gameOptions = buildGameOptions(games);
      const currentGameId = (this.data.gameOptions[this.data.gameIndex] || {}).id || '';
      const gameIndex = currentGameId ? Math.max(0, gameOptions.findIndex(option => option.id === currentGameId)) : 0;
      this.setData({
        games,
        gameOptions,
        gameIndex,
        gameLabel: (gameOptions[gameIndex] || gameOptions[0]).label,
        gameOptionHasMore: !!res.hasMore,
        gameOptionNextOffset: Number(res.nextOffset || (this.data.gameOptionNextOffset + (res.games || []).length)),
      });
    } catch (err) {
      showError(err, '加载更多比赛候选失败');
    } finally {
      this.setData({ loadingMoreGames: false });
    }
  },

  async submitHighlight() {
    if (this.data.saving) return;
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const title = String(this.data.titleInput || '').trim();
    const image = String(this.data.imageInput || '').trim();
    const bilibiliUrl = normalizeBilibiliUrl(this.data.bilibiliInput);
    if (!title) return toast('请填写图片标题');
    if (!image) return toast('请填写图片地址');
    const player = selectedPlayer(this.data);
    const game = selectedGame(this.data);
    this.setData({ saving: true });
    try {
      await api.post('/highlights', {
        title,
        cover: image,
        url: bilibiliUrl,
        playerName: player?.name || '',
        gameId: game?.id || '',
      });
      toast(this.data.isReviewer ? '精彩时刻已发布' : '已提交审核');
      this.setData({
        titleInput: '',
        imageInput: '',
        bilibiliInput: '',
        uploadFileName: '',
        uploadStatusText: '',
        gameIndex: 0,
        gameLabel: this.data.gameOptions[0].label,
      });
      await this.load();
    } catch (err) {
      showError(err, '提交失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async chooseAndUploadImage() {
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (this.data.uploading) return;
    this.setData({ uploading: true, uploadStatusText: '选择图片中...' });
    try {
      const file = await chooseImageFile();
      if (!file) {
        this.setData({ uploadStatusText: '' });
        return;
      }
      const fileName = file.name || `highlight-${Date.now()}.jpg`;
      this.setData({ uploadFileName: fileName, uploadStatusText: '上传中...' });
      const res = await upload.uploadImage(file, 'highlight', 'highlight');
      this.setData({
        imageInput: res.url || '',
        uploadStatusText: '已上传到 COS',
      });
      toast('图片已上传');
    } catch (err) {
      showError(err, '图片上传失败');
      this.setData({ uploadStatusText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.image;
    if (!current) return toast('暂无图片');
    wx.previewImage({
      current,
      urls: this.data.imageUrls.length ? this.data.imageUrls : [current],
    });
  },

  copyBilibili(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return toast('没有B站链接');
    wx.setClipboardData({
      data: url,
      success: () => toast('B站链接已复制'),
      fail: err => showError(err, '复制失败'),
    });
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },

  openGame(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${id}` });
  },

  publishHighlight(e) {
    return this.reviewHighlight(e.currentTarget.dataset.id, 'published');
  },

  rejectHighlight(e) {
    return this.reviewHighlight(e.currentTarget.dataset.id, 'rejected');
  },

  unpublishHighlight(e) {
    return this.reviewHighlight(e.currentTarget.dataset.id, 'rejected', '已下架');
  },

  restoreHighlight(e) {
    return this.reviewHighlight(e.currentTarget.dataset.id, 'approved', '已恢复发布');
  },

  async reviewHighlight(id, status, successText = '') {
    if (!id || !this.data.isReviewer || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.patch(`/highlights/${id}`, { status });
      toast(successText || (status === 'published' || status === 'approved' ? '图片已发布' : '已退回'));
      await this.load();
    } catch (err) {
      showError(err, '审核失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteHighlight(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.isReviewer || this.data.saving) return;
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除精彩时刻',
        content: '删除后图片记录不再出现在精彩时刻，COS 原图不会被自动删除。',
        confirmText: '删除',
        success(res) {
          resolve(!!res.confirm);
        },
        fail() {
          resolve(false);
        },
      });
    });
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      await api.del(`/highlights/${id}`);
      toast('精彩时刻已删除');
      await this.load();
    } catch (err) {
      showError(err, '删除精彩时刻失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function fetchHighlightsPage(isReviewer, offset = 0) {
  const params = { limit: HIGHLIGHT_LIMIT, offset, includePlayer: 'true', includeGame: 'true' };
  if (!isReviewer) params.public = 'true';
  return api.get('/highlights', params).then(res => ({
    ...res,
    highlights: isReviewer ? (res.highlights || []) : (res.highlights || []).filter(isPublicHighlight),
  })).catch(() => ({ highlights: [], hasMore: false, nextOffset: offset }));
}

function fetchPlayerOptionsPage(offset = 0, initialPlayerId = '') {
  return api.get('/players', { include: 'all', limit: HIGHLIGHT_PLAYER_OPTION_LIMIT, offset }).then(async res => {
    let players = res.players || [];
    const targetId = String(initialPlayerId || '').trim();
    if (targetId && offset === 0 && !players.some(player => player.id === targetId)) {
      const detail = await api.get(`/players/${targetId}`).catch(() => null);
      if (detail?.player) players = mergePlayers([detail.player], players);
    }
    return { ...res, players };
  }).catch(() => ({ players: [], hasMore: false, nextOffset: offset }));
}

function fetchGameOptionsPage(offset = 0) {
  return api.get('/games', {
    includeAggregate: 'false',
    limit: GAME_OPTION_LIMIT,
    offset,
  }).catch(() => ({ games: [], hasMore: false, nextOffset: offset }));
}

function isPublicHighlight(item) {
  return item && (item.status === 'published' || item.status === 'approved');
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function buildPlayerNameIndex(players) {
  const byName = {};
  (players || []).forEach(player => {
    [player.name, player.publicDisplayName].concat(player.aliases || []).forEach(name => {
      const key = norm(name);
      if (key && !byName[key]) byName[key] = player;
    });
  });
  return byName;
}

function formatHighlight(highlight, games, playersByName, viewer) {
  const game = highlight.game || (games || []).find(item => item.id === highlight.gameId);
  const player = highlight.player || (playersByName ? playersByName[norm(highlight.playerName)] : null);
  const identity = player ? playerIdentity(player, viewer) : null;
  const image = String(highlight.cover || '').trim();
  const status = highlight.status || 'pending';
  return {
    ...highlight,
    image,
    bilibiliUrl: normalizeBilibiliUrl(highlight.url),
    statusLabel: statusLabel(status),
    statusClass: statusClass(status),
    isPublic: status === 'published' || status === 'approved',
    isPending: status === 'pending',
    isRejected: status === 'rejected',
    playerId: player ? player.id : '',
    gameId: game ? game.id : (highlight.gameId || ''),
    meta: [
      identity ? identity.displayName : (highlight.playerName || ''),
      game ? scoreText(game) : '',
    ].filter(Boolean).join(' · '),
    metaClass: identity ? identity.nameClass : '',
  };
}

function buildPlayerOptions(players, viewer) {
  return [{ id: '', label: '不关联球员' }].concat((players || []).map(player => ({
    id: player.id,
    label: `#${player.number || '-'} ${playerIdentity(player, viewer).displayName}`,
  })));
}

function resolvePlayerIndex(playerOptions, playerId) {
  if (!playerId) return 0;
  const index = (playerOptions || []).findIndex(option => option.id === playerId);
  return index > 0 ? index : 0;
}

function buildGameOptions(games) {
  return [{ id: '', label: '不关联比赛' }].concat((games || []).map(game => ({
    id: game.id,
    label: [game.date, scoreText(game)].filter(Boolean).join(' · '),
  })));
}

function mergeHighlights(existing, incoming) {
  const seen = new Set();
  return (existing || []).concat(incoming || []).filter(item => {
    const key = item && item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeGames(existing, incoming) {
  const seen = new Set();
  return (existing || []).concat(incoming || []).filter(item => {
    const key = item && item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergePlayers(existing, incoming) {
  const seen = new Set();
  return (existing || []).concat(incoming || []).filter(item => {
    const key = item && item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedPlayer(data) {
  const option = data.playerOptions[data.playerIndex] || {};
  if (!option.id) return null;
  return (data.players || []).find(player => player.id === option.id) || null;
}

function selectedGame(data) {
  const option = data.gameOptions[data.gameIndex] || {};
  return option.id ? option : null;
}

function normalizeBilibiliUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return /bilibili\.com|b23\.tv/i.test(url) ? url : '';
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
        resolve({ tempFilePath: (res.tempFilePaths || [])[0] || '', size: (res.tempFiles || [])[0]?.size });
      },
      fail: reject,
    });
  });
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

function statusLabel(status) {
  const map = {
    published: '已发布',
    approved: '已发布',
    pending: '待审核',
    rejected: '已下架',
  };
  return map[status] || '待审核';
}

function statusClass(status) {
  if (status === 'published' || status === 'approved') return 'published';
  return status || 'pending';
}

function canReviewHighlights(user) {
  const permissions = user?.permissions || [];
  return user?.role === 'admin' || permissions.includes('highlights:write');
}
