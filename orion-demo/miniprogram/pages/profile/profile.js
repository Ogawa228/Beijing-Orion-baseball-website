const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');
const nav = require('../../utils/nav');

Page({
  data: {
    user: null,
    player: null,
    loading: true,
    avatarSrc: '/assets/orion-default-player-avatar.png',
    identityLabel: '未绑定球员档案',
    signups: [],
    bindRequests: [],
    showBindCta: false,
    bindCtaTitle: '申请绑定正式球员档案',
    bindCtaText: '选择你的正式球员档案，管理员审核通过后自动合并签到和积分。',
    canAdmin: false,
    canEditPublicProfile: false,
    accountNameInput: '',
    accountAvatarInput: '',
    publicNameInput: '',
    publicAvatarInput: '',
    publicPreviewName: '猎户成员',
    publicPreviewAvatar: '/assets/orion-default-player-avatar.png',
    uploadingAccountAvatar: false,
    uploadingPublicAvatar: false,
    accountAvatarUploadText: '',
    publicAvatarUploadText: '',
    profileSaving: false,
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
    // 节流:5 秒内从其他 tab 切回不重新全量加载,避免整页 loading→数据 抖动频闪
    if (!this._lastLoadAt || Date.now() - this._lastLoadAt > 5000) {
      this.load();
    }
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    this._lastLoadAt = Date.now();
    try {
      const me = await api.get('/auth/me');
      getApp().setIdentity(me);
      let signups = [];
      let bindRequests = [];
      if (me.user) {
        const [s, b] = await Promise.all([
          api.get('/event-signups/mine').catch(() => ({ signups: [] })),
          api.get('/bind-requests/mine').catch(() => ({ requests: [] })),
        ]);
        signups = (s.signups || []).map(formatSignup);
        bindRequests = (b.requests || []).map(formatBindRequest);
      }
      const avatarSrc = (me.player && me.player.photo) || (me.user && me.user.avatar) || '/assets/orion-default-player-avatar.png';
      const identityLabel = me.player
        ? (me.player.level === 'verified' ? '正式球员' : '试训队员')
        : '未绑定球员档案';
      const latestBindRequest = bindRequests[0] || null;
      const showBindCta = !!(me.user && (!me.player || me.player.level !== 'verified'));
      const bindCtaTitle = latestBindRequest && latestBindRequest.status === 'pending'
        ? '绑定申请审核中'
        : '申请绑定正式球员档案';
      const bindCtaText = latestBindRequest && latestBindRequest.status === 'pending'
        ? `${latestBindRequest.title} · 管理员处理后会同步站内通知。`
        : '选择你的正式球员档案，管理员审核通过后自动合并签到和积分。';
      const canAdmin = canUseAdmin(me.user);
      const canEditPublicProfile = !!(me.user && me.player && me.player.level === 'verified');
      this.setData({
        user: me.user,
        player: me.player,
        avatarSrc,
        identityLabel,
        signups,
        bindRequests,
        showBindCta,
        bindCtaTitle,
        bindCtaText,
        canAdmin,
        canEditPublicProfile,
        accountNameInput: me.user?.displayName || '',
        accountAvatarInput: me.user?.avatar || '',
        publicNameInput: me.player?.publicDisplayName || '',
        publicAvatarInput: me.player?.publicAvatar || '',
        publicPreviewName: me.player?.publicDisplayName || me.player?.name || me.user?.displayName || '猎户成员',
        publicPreviewAvatar: me.player?.publicAvatar || me.player?.photo || '/assets/orion-default-player-avatar.png',
      });
    } catch (err) {
      showError(err, '个人面板加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  go(e) {
    nav.go(e.currentTarget.dataset.url);
  },

  onAccountNameInput(e) {
    this.setData({ accountNameInput: e.detail.value });
  },

  onAccountAvatarInput(e) {
    this.setData({ accountAvatarInput: e.detail.value });
  },

  async chooseAccountAvatar() {
    if (!this.data.user || this.data.uploadingAccountAvatar) return;
    this.setData({ uploadingAccountAvatar: true, accountAvatarUploadText: '选择图片中...' });
    try {
      const uploaded = await chooseAndUploadImage('avatar', 'account-avatar', text => {
        this.setData({ accountAvatarUploadText: text });
      });
      if (!uploaded) {
        this.setData({ accountAvatarUploadText: '' });
        return;
      }
      this.setData({
        accountAvatarInput: uploaded.url || '',
        accountAvatarUploadText: '已上传到 COS，保存后生效',
      });
      toast('账号头像已上传');
    } catch (err) {
      showError(err, '账号头像上传失败');
      this.setData({ accountAvatarUploadText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploadingAccountAvatar: false });
    }
  },

  clearAccountAvatar() {
    if (!this.data.user || this.data.uploadingAccountAvatar) return;
    this.setData({ accountAvatarInput: '', accountAvatarUploadText: '保存后清空账号头像' });
  },

  onPublicNameInput(e) {
    this.setData({ publicNameInput: e.detail.value });
  },

  onPublicAvatarInput(e) {
    this.setData({ publicAvatarInput: e.detail.value });
  },

  async choosePublicAvatar() {
    if (!this.data.canEditPublicProfile || this.data.uploadingPublicAvatar) return;
    this.setData({ uploadingPublicAvatar: true, publicAvatarUploadText: '选择图片中...' });
    try {
      const uploaded = await chooseAndUploadImage('avatar', 'public-avatar', text => {
        this.setData({ publicAvatarUploadText: text });
      });
      if (!uploaded) {
        this.setData({ publicAvatarUploadText: '' });
        return;
      }
      this.setData({
        publicAvatarInput: uploaded.url || '',
        publicPreviewAvatar: uploaded.url || this.data.publicPreviewAvatar,
        publicAvatarUploadText: '已上传到 COS，保存后生效',
      });
      toast('公开头像已上传');
    } catch (err) {
      showError(err, '公开头像上传失败');
      this.setData({ publicAvatarUploadText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploadingPublicAvatar: false });
    }
  },

  clearPublicAvatar() {
    if (!this.data.canEditPublicProfile || this.data.uploadingPublicAvatar) return;
    this.setData({ publicAvatarInput: '', publicAvatarUploadText: '保存后清空公开头像' });
  },

  async saveAccountProfile() {
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const displayName = String(this.data.accountNameInput || '').trim();
    if (!displayName) return toast('请填写昵称');
    this.setData({ profileSaving: true });
    try {
      await api.patch('/auth/me', {
        displayName,
        avatar: String(this.data.accountAvatarInput || '').trim(),
      });
      toast('账号资料已保存');
      await this.load();
    } catch (err) {
      showError(err, '保存失败');
    } finally {
      this.setData({ profileSaving: false });
    }
  },

  async savePublicProfile() {
    const player = this.data.player;
    if (!this.data.canEditPublicProfile || !player?.id) {
      toast('正式球员可维护');
      return;
    }
    this.setData({ profileSaving: true });
    try {
      await api.patch(`/players/${player.id}/public-profile`, {
        publicDisplayName: String(this.data.publicNameInput || '').trim(),
        publicAvatar: String(this.data.publicAvatarInput || '').trim(),
      });
      toast('公开展示已保存');
      await this.load();
    } catch (err) {
      showError(err, '公开展示保存失败');
    } finally {
      this.setData({ profileSaving: false });
    }
  },
});

function formatSignup(signup) {
  const statusMap = {
    going: '已报名',
    tentative: '待定',
    cancelled: '已取消',
  };
  const title = signup.eventTitle || signup.eventId || '未命名活动';
  const meta = [signup.eventDate, signup.eventLocation].filter(Boolean).join(' · ');
  return {
    ...signup,
    title,
    meta,
    statusLabel: statusMap[signup.status] || signup.status || '未知',
    statusClass: signup.status || 'unknown',
  };
}

function formatBindRequest(request) {
  const statusMap = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  };
  const title = request.requestedPlayerName
    ? `#${request.requestedPlayerNumber || '-'} ${request.requestedPlayerName}`
    : '目标球员档案';
  const meta = [
    request.requestedPlayerPosition,
    request.reviewerName ? `审核人 ${request.reviewerName}` : '',
    request.reviewNote,
  ].filter(Boolean).join(' · ');
  return {
    ...request,
    title,
    meta,
    statusLabel: statusMap[request.status] || request.status || '未知',
    statusClass: request.status || 'unknown',
  };
}

function canUseAdmin(user) {
  const permissions = user?.permissions || [];
  return user?.role === 'admin' || [
    'bind_requests:review',
    'points:write',
    'attendances:write',
    'events:write',
    'players:write',
    'players:display_write',
    'games:write',
    'hof:write',
    'highlights:write',
  ].some(permission => permissions.includes(permission));
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

async function chooseAndUploadImage(kind, fallbackPrefix, onStatus) {
  const file = await chooseImageFile();
  if (!file) return null;
  const filePath = file.tempFilePath || file.path || '';
  const fileName = file.name || filePath.split('/').pop() || `${fallbackPrefix}-${Date.now()}.jpg`;
  const fileBase64 = await readFileBase64(filePath);
  if (onStatus) onStatus('上传 COS 中...');
  return api.post('/upload/base64', {
    kind,
    fileName,
    contentType: inferImageContentType(fileName, filePath),
    fileBase64,
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
