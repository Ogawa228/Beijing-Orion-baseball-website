const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');
const upload = require('../../../utils/upload');

function today() {
  return new Date().toISOString().slice(0, 10);
}

Page({
  data: {
    id: '',
    editing: false,
    pageTitle: '发起队内接龙',
    pageSubtle: '训练、比赛和活动都从这里发起，名单和签到挂在同一条接龙下。',
    submitLabel: '发布接龙',
    title: '',
    tagOptions: [
      { label: '🏋️ 训练', value: '🏋️ 训练' },
      { label: '⚾ 比赛', value: '⚾ 比赛' },
      { label: '🧢 队内赛', value: '🧢 队内赛' },
      { label: '🌟 试训', value: '🌟 试训' },
      { label: '🤝 团队活动', value: '🤝 团队活动' },
    ],
    tagIndex: 0,
    date: today(),
    eventDate: today(),
    eventTime: '',
    location: '奥体中心棒垒球场',
    locationAddress: '',
    locationLatitude: null,
    locationLongitude: null,
    locationSource: 'manual',
    locationMetaText: '',
    eventMetadata: {},
    cover: '',
    coverUploadText: '',
    uploadingCover: false,
    images: [],
    galleryUploadText: '',
    uploadingGallery: false,
    sourceLink: '',
    body: '',
    permissionChecked: false,
    canCreateEvent: false,
    saving: false,
  },

  onLoad(options) {
    this.prepare(options || {});
  },

  async prepare(options) {
    const allowed = await this.ensureEventWritePermission();
    if (!allowed) return;
    if (options && options.id) {
      this.setData({
        id: options.id,
        editing: true,
        pageTitle: '编辑队内接龙',
        pageSubtle: '修订后仍使用同一条接龙，报名、签到和比赛名单来源不变。',
        submitLabel: '保存接龙',
      });
      this.loadEvent();
    }
  },

  async ensureEventWritePermission() {
    const app = getApp();
    try {
      const me = await api.get('/auth/me');
      if (app.setIdentity) app.setIdentity(me);
      const user = me.user || null;
      const allowed = canCreateEvents(user);
      this.setData({ permissionChecked: true, canCreateEvent: allowed });
      if (!user) {
        wx.navigateTo({ url: '/pages/login/login' });
        return false;
      }
      if (!allowed) {
        toast('需要运营组权限');
        setTimeout(() => {
          wx.switchTab({ url: '/pages/events/event-list/event-list' });
        }, 350);
        return false;
      }
      return true;
    } catch (err) {
      this.setData({ permissionChecked: true, canCreateEvent: false });
      showError(err, '权限校验失败');
      return false;
    }
  },

  async loadEvent() {
    try {
      const res = await api.get(`/events/${this.data.id}`);
      const event = res.event || {};
      const tagIndex = pickTagIndex(this.data.tagOptions, event.tag);
      const locationMeta = extractLocationMetadata(event);
      const dateParts = parseEventDate(event.date);
      this.setData({
        title: event.title || '',
        tagIndex,
        date: buildEventDate(dateParts.eventDate, dateParts.eventTime),
        eventDate: dateParts.eventDate,
        eventTime: dateParts.eventTime,
        location: event.location || '',
        ...locationMeta,
        eventMetadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        cover: event.cover || '',
        images: normalizeImages(event.images),
        sourceLink: event.sourceLink || '',
        body: event.body || '',
      });
    } catch (err) {
      showError(err, '接龙加载失败');
    }
  },

  backToEventList() {
    wx.switchTab({ url: '/pages/events/event-list/event-list' });
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onTagChange(e) { this.setData({ tagIndex: Number(e.detail.value) || 0 }); },
  onEventDateChange(e) {
    const eventDate = e.detail.value || today();
    this.setData({
      eventDate,
      date: buildEventDate(eventDate, this.data.eventTime),
    });
  },
  onEventTimeChange(e) {
    const eventTime = e.detail.value || '';
    this.setData({
      eventTime,
      date: buildEventDate(this.data.eventDate, eventTime),
    });
  },
  clearEventTime() {
    this.setData({
      eventTime: '',
      date: buildEventDate(this.data.eventDate, ''),
    });
  },
  onLocationInput(e) {
    this.setData({
      location: e.detail.value,
      locationAddress: '',
      locationLatitude: null,
      locationLongitude: null,
      locationSource: 'manual',
      locationMetaText: '',
    });
  },
  onCoverInput(e) { this.setData({ cover: e.detail.value }); },
  onSourceLinkInput(e) { this.setData({ sourceLink: e.detail.value }); },
  onBodyInput(e) { this.setData({ body: e.detail.value }); },

  chooseEventLocation() {
    if (!wx.chooseLocation) {
      toast('当前微信版本不支持地图选点');
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      const options = {
        success: res => {
          const nextLocation = normalizeChosenLocation(res, this.data.location);
          this.setData(nextLocation);
          toast('已选择地点');
          resolve(res);
        },
        fail: err => {
          const raw = String((err && (err.errMsg || err.message)) || '');
          if (!/cancel/.test(raw)) showError(normalizeLocationPickerError(err), '选择地点失败');
          resolve(null);
        },
      };
      const latitude = Number(this.data.locationLatitude);
      const longitude = Number(this.data.locationLongitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        options.latitude = latitude;
        options.longitude = longitude;
      }
      wx.chooseLocation(options);
    });
  },

  async chooseCoverImage() {
    if (this.data.uploadingCover) return;
    this.setData({ uploadingCover: true, coverUploadText: '选择封面图中...' });
    try {
      const file = await chooseImageFile();
      if (!file) {
        this.setData({ coverUploadText: '' });
        return;
      }
      this.setData({ coverUploadText: '上传中...' });
      const res = await upload.uploadImage(file, 'event', 'event-cover');
      this.setData({
        cover: res.url || '',
        coverUploadText: '已上传封面图',
      });
      toast('封面已上传');
    } catch (err) {
      showError(err, '封面上传失败');
      this.setData({ coverUploadText: '上传失败，可稍后重试' });
    } finally {
      this.setData({ uploadingCover: false });
    }
  },

  async chooseGalleryImages() {
    if (this.data.uploadingGallery) return;
    const existing = normalizeImages(this.data.images);
    const remaining = Math.max(0, 9 - existing.length);
    if (!remaining) {
      toast('最多上传 9 张配图');
      return;
    }
    this.setData({ uploadingGallery: true, galleryUploadText: '选择配图中...' });
    try {
      const files = await chooseImageFiles(remaining);
      if (!files.length) {
        this.setData({ galleryUploadText: '' });
        return;
      }
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        this.setData({ galleryUploadText: `上传配图 ${index + 1}/${files.length}...` });
        const res = await upload.uploadImage(file, 'event', `event-image-${index + 1}`);
        if (res.url) uploaded.push(res.url);
      }
      this.setData({
        images: existing.concat(uploaded).slice(0, 9),
        galleryUploadText: uploaded.length ? `已上传 ${uploaded.length} 张配图` : '',
      });
      if (uploaded.length) toast('配图已上传');
    } catch (err) {
      showError(err, '配图上传失败');
      this.setData({ galleryUploadText: '上传失败，可稍后重试' });
    } finally {
      this.setData({ uploadingGallery: false });
    }
  },

  removeGalleryImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = normalizeImages(this.data.images);
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1);
    this.setData({ images, galleryUploadText: images.length ? `剩余 ${images.length} 张配图` : '' });
  },

  previewGalleryImage(e) {
    const images = normalizeImages(this.data.images);
    const index = Number(e.currentTarget.dataset.index || 0);
    if (!images.length) return;
    wx.previewImage({
      urls: images,
      current: images[index] || images[0],
    });
  },

  async submit() {
    if (this.data.saving) return;
    const title = String(this.data.title || '').trim();
    if (!getApp().globalData.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.canCreateEvent) {
      toast('需要运营组权限');
      return;
    }
    if (!title) {
      toast('请填写标题');
      return;
    }
    this.setData({ saving: true });
    try {
      const tagOption = this.data.tagOptions[this.data.tagIndex] || this.data.tagOptions[0];
      const payload = {
        title,
        tag: tagOption.value,
        date: buildEventDate(this.data.eventDate, this.data.eventTime),
        location: this.data.location,
        cover: String(this.data.cover || '').trim(),
        body: this.data.body,
        images: normalizeImages(this.data.images),
        sourceLink: String(this.data.sourceLink || '').trim() || (this.data.editing ? '' : 'orion-miniprogram'),
        metadata: {
          ...(this.data.eventMetadata || {}),
          location: buildLocationMetadata(this.data),
        },
      };
      const res = this.data.editing
        ? await api.patch(`/events/${this.data.id}`, payload)
        : await api.post('/events', payload);
      try { wx.setStorageSync('orionEventHubDirty', true); } catch (e) { /* 忽略 */ }
      toast(this.data.editing ? '已保存' : '已发布');
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/events/event-detail/event-detail?id=${res.event.id}` });
      }, 350);
    } catch (err) {
      showError(err, '发布失败，可能需要权限');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function canCreateEvents(user) {
  return (user?.permissions || []).includes('events:write');
}

function pickTagIndex(options, value) {
  const key = String(value || '').trim();
  if (!key) return 0;
  const found = (options || []).findIndex(option => option.value === key || option.label === key);
  return found >= 0 ? found : 0;
}

function parseEventDate(value) {
  const raw = String(value || '').trim();
  const dateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const timeMatch = raw.match(/(?:\s|T)(\d{2}:\d{2})/);
  return {
    eventDate: dateMatch ? dateMatch[1] : today(),
    eventTime: timeMatch ? timeMatch[1] : '',
  };
}

function buildEventDate(eventDate, eventTime) {
  const date = eventDate || today();
  const time = String(eventTime || '').trim();
  return time ? `${date} ${time}` : date;
}

function chooseImageFile() {
  return chooseImageFiles(1).then(files => files[0] || null);
}

function chooseImageFiles(count = 1) {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          resolve((res.tempFiles || []).slice(0, count));
        },
        fail: reject,
      });
      return;
    }
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const paths = res.tempFilePaths || [];
        const tempFiles = res.tempFiles || [];
        resolve(paths.slice(0, count).map((filePath, index) => ({
          tempFilePath: filePath,
          size: tempFiles[index]?.size,
          name: filePath.split('/').pop() || '',
        })));
      },
      fail: reject,
    });
  });
}

function normalizeImages(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try { return normalizeImages(JSON.parse(value)); } catch (_) { return value.trim() ? [value.trim()] : []; }
  }
  return [];
}

function normalizeChosenLocation(res = {}, currentName = '') {
  const name = String(res.name || res.address || currentName || '').trim();
  const address = String(res.address || '').trim();
  const latitude = Number(res.latitude);
  const longitude = Number(res.longitude);
  const next = {
    location: name,
    locationAddress: address,
    locationLatitude: Number.isFinite(latitude) ? latitude : null,
    locationLongitude: Number.isFinite(longitude) ? longitude : null,
    locationSource: 'wx.chooseLocation',
  };
  next.locationMetaText = formatLocationMetaText(next);
  return next;
}

function extractLocationMetadata(event = {}) {
  const raw = event.metadata && typeof event.metadata === 'object' ? event.metadata.location : null;
  if (!raw || typeof raw !== 'object') {
    return {
      locationAddress: '',
      locationLatitude: null,
      locationLongitude: null,
      locationSource: 'manual',
      locationMetaText: '',
    };
  }
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const next = {
    locationAddress: String(raw.address || '').trim(),
    locationLatitude: Number.isFinite(latitude) ? latitude : null,
    locationLongitude: Number.isFinite(longitude) ? longitude : null,
    locationSource: String(raw.source || 'manual').trim() || 'manual',
  };
  next.locationMetaText = formatLocationMetaText(next);
  return next;
}

function buildLocationMetadata(data = {}) {
  const latitude = Number(data.locationLatitude);
  const longitude = Number(data.locationLongitude);
  const location = {
    name: String(data.location || '').trim(),
    address: String(data.locationAddress || '').trim(),
    source: String(data.locationSource || 'manual').trim() || 'manual',
  };
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    location.latitude = latitude;
    location.longitude = longitude;
  }
  return location;
}

function formatLocationMetaText(data = {}) {
  const parts = [];
  if (data.locationAddress) parts.push(data.locationAddress);
  const latitude = Number(data.locationLatitude);
  const longitude = Number(data.locationLongitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    parts.push(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
  }
  return parts.join(' · ');
}

function normalizeLocationPickerError(err) {
  const raw = String((err && (err.errMsg || err.message)) || '');
  if (raw.includes('-80424') || raw.includes('is not authorized')) {
    return new Error('地图选点接口未开通');
  }
  if (raw.includes('auth deny') || raw.includes('authorize:fail')) {
    return new Error('请允许位置权限后选点');
  }
  return new Error(raw || '地图选点失败');
}

// 云托管 callContainer 请求体有大小限制,原图 base64 过大会上传失败,读取前先压缩
function compressForUpload(src) {
  return new Promise(resolve => {
    if (!src || !wx.compressImage) {
      resolve(src);
      return;
    }
    wx.compressImage({
      src,
      quality: 65,
      compressedWidth: 1280,
      success: res => resolve((res && res.tempFilePath) || src),
      fail: () => {
        wx.compressImage({
          src,
          quality: 65,
          success: r => resolve((r && r.tempFilePath) || src),
          fail: () => resolve(src),
        });
      },
    });
  });
}

function readFileBase64(filePath) {
  return compressForUpload(filePath).then(compressed => new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: compressed,
      encoding: 'base64',
      success(res) {
        resolve(res.data || '');
      },
      fail: reject,
    });
  }));
}

function inferImageContentType(fileName, filePath) {
  const name = String(fileName || filePath || '').toLowerCase();
  if (/\.png(?:\?|$)/.test(name)) return 'image/png';
  if (/\.gif(?:\?|$)/.test(name)) return 'image/gif';
  if (/\.webp(?:\?|$)/.test(name)) return 'image/webp';
  if (/\.svg(?:\?|$)/.test(name)) return 'image/svg+xml';
  return 'image/jpeg';
}
