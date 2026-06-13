const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');
const { eventTagLabel } = require('../../utils/labels');
const nav = require('../../utils/nav');

const LOCATION_SCOPE = 'scope.userLocation';
const EVENT_PAGE_LIMIT = 60;
const PENDING_CHECKIN_EVENT_KEY = 'orionPendingCheckinEventId';

function normalizeLocationError(err, label = '定位') {
  const raw = String((err && (err.errMsg || err.message)) || '');
  if (raw.includes('-80424') || raw.includes('is not authorized')) {
    return new Error(`${label}接口未开通`);
  }
  if (raw.includes('auth deny') || raw.includes('authorize:fail')) {
    return new Error(`请允许${label}后签到`);
  }
  return new Error(raw || '定位失败');
}

function authorizeLocationScope(scope, label) {
  return new Promise((resolve, reject) => {
    if (!wx.authorize) {
      resolve();
      return;
    }
    wx.authorize({
      scope,
      success: resolve,
      fail: err => reject(normalizeLocationError(err, label)),
    });
  });
}

async function getPreciseLocation() {
  if (!wx.getLocation) {
    throw new Error('当前微信版本不支持定位');
  }
  await authorizeLocationScope(LOCATION_SCOPE, '定位');
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        try { resolve(normalizeWxLocation(res, 'precise', 'wx.getLocation')); } catch (err) { reject(err); }
      },
      fail: err => reject(normalizeLocationError(err, '定位')),
    });
  });
}

async function getBestLocation() {
  return getPreciseLocation();
}

function normalizeWxLocation(res = {}, type, source) {
  const latitude = Number(res.latitude);
  const longitude = Number(res.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('定位结果无效');
  }
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(res.accuracy)) ? Number(res.accuracy) : null,
    type,
    source,
    capturedAt: new Date().toISOString(),
  };
}

// 后台已开通 wx.getLocation，签到坐标按精确定位保存；显示时保留 5 位小数便于核验。
function formatLocationText(location = {}) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '未定位';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function relayKind(event = {}) {
  const text = [event.tag, event.tagLabel, event.title, event.body].filter(Boolean).join(' ');
  return /训练|试训/.test(text) ? 'training' : 'event';
}

function relayTypeLabel(event = {}) {
  const text = [event.tag, event.tagLabel, event.title, event.body].filter(Boolean).join(' ');
  if (/训练|试训/.test(text)) return '🏋️ 训练接龙';
  if (/比赛|队内赛|棒球|慢垒/.test(text)) return '⚾ 比赛接龙';
  return '📅 活动接龙';
}

function relayMeta(event = {}) {
  return [event.date, event.location].filter(Boolean).join(' · ');
}

Page({
  data: {
    relays: [{ id: '', title: '请选择接龙', typeLabel: '📌 接龙', meta: '' }],
    relayIndex: 0,
    relayLabel: '请选择接龙',
    relayTypeLabel: '📌 接龙',
    relayMeta: '',
    relaysHasMore: false,
    relaysNextOffset: 0,
    loadingMoreRelays: false,
    note: '',
    loading: false,
    locationText: '未定位',
    result: null,
    resultKindLabel: '',
    resultTitle: '',
    pointDeltaText: '',
    totalPointsText: '',
    upgradeText: '',
    trialProgressText: '',
    initialEventId: '',
  },

  onLoad(options) {
    if (options.eventId) {
      this.setData({ initialEventId: options.eventId });
    }
    this.loadRelays();
  },

  onShow() {
    nav.syncTabBar(this);
    // 签到页已是 tabBar 页,switchTab 不能带参;接龙详情"去签到"用 storage 暂存目标接龙
    let pendingEventId = '';
    try { pendingEventId = wx.getStorageSync(PENDING_CHECKIN_EVENT_KEY) || ''; } catch (err) { /* 忽略 */ }
    if (!pendingEventId) return;
    try { wx.removeStorageSync(PENDING_CHECKIN_EVENT_KEY); } catch (err) { /* 忽略 */ }
    if (pendingEventId !== this.data.initialEventId) {
      this.setData({ initialEventId: pendingEventId });
      this.loadRelays();
    }
  },

  async loadRelays() {
    try {
      const res = await fetchEventPage(0);
      const firstPageEvents = res.events || [];
      let events = firstPageEvents;
      const initialEventId = this.data.initialEventId || '';
      if (initialEventId && !firstPageEvents.some(event => event.id === initialEventId)) {
        const detailRes = await api.get(`/events/${initialEventId}`).catch(() => ({ event: null }));
        if (detailRes.event) events = mergeEventsById([detailRes.event], firstPageEvents);
      }
      const relays = buildRelayOptions(events);
      const relayIndex = this.data.initialEventId
        ? Math.max(relays.findIndex(e => e.id === this.data.initialEventId), 0)
        : 0;
      this.setRelaySelection(relayIndex, relays);
      this.setData({
        relaysHasMore: !!res.hasMore,
        relaysNextOffset: normalizeNextOffset(res.nextOffset, firstPageEvents.length),
      });
    } catch (err) {
      const relays = [{ id: '', title: '请选择接龙', typeLabel: '📌 接龙', meta: '' }];
      this.setRelaySelection(0, relays);
      this.setData({ relaysHasMore: false, relaysNextOffset: 0, relaysLoadFailed: true });
      showError(err, '接龙加载失败');
    }
  },

  retryLoadRelays() {
    this.setData({ relaysLoadFailed: false });
    this.loadRelays();
  },

  setRelaySelection(relayIndex, relays = this.data.relays) {
    const relay = relays[relayIndex] || relays[0];
    this.setData({
      relays,
      relayIndex,
      relayLabel: relay.title,
      relayTypeLabel: relay.typeLabel || '📌 接龙',
      relayMeta: relay.meta || '',
    });
  },

  onRelayChange(e) {
    this.setRelaySelection(Number(e.detail.value) || 0);
  },

  async loadMoreRelays() {
    if (this.data.loadingMoreRelays || !this.data.relaysHasMore) return;
    const selected = this.data.relays[this.data.relayIndex] || {};
    const selectedId = selected.id || '';
    const offset = this.data.relaysNextOffset || Math.max(0, (this.data.relays || []).length - 1);
    this.setData({ loadingMoreRelays: true });
    try {
      const res = await fetchEventPage(offset);
      const currentEvents = (this.data.relays || []).filter(item => item.id);
      const events = mergeEventsById(currentEvents, res.events || []);
      const relays = buildRelayOptions(events);
      const selectedIndex = selectedId ? relays.findIndex(item => item.id === selectedId) : this.data.relayIndex;
      this.setRelaySelection(selectedIndex >= 0 ? selectedIndex : 0, relays);
      this.setData({
        relaysHasMore: !!res.hasMore,
        relaysNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.events || []).length),
      });
    } catch (err) {
      showError(err, '接龙加载失败');
    } finally {
      this.setData({ loadingMoreRelays: false });
    }
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async checkin() {
    if (this.data.loading) return;
    if (!getApp().globalData.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const relay = this.data.relays[this.data.relayIndex] || {};
    if (!relay.id) {
      toast('请选择接龙');
      return;
    }
    const kind = relay.kind || relayKind(relay);
    this.setData({ loading: true, result: null });
    try {
      const location = await getBestLocation();
      const locationText = formatLocationText(location);
      this.setData({ locationText });
      const result = await api.post('/checkins/direct', {
        kind,
        refId: relay.id,
        note: this.data.note || relay.title,
        source: 'mini_program_relay',
        relay: {
          id: relay.id,
          title: relay.title,
          typeLabel: relay.typeLabel,
          date: relay.date,
          location: relay.location,
          targetLocation: relay.metadata && relay.metadata.location ? relay.metadata.location : null,
        },
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          type: location.type,
          source: location.source,
          capturedAt: location.capturedAt,
        },
      });
      this.setData({
        result,
        resultKindLabel: relay.typeLabel || (kind === 'training' ? '🏋️ 训练接龙' : '📅 活动接龙'),
        resultTitle: result.duplicated ? '已签到过' : '签到成功',
        pointDeltaText: result.duplicated ? '本次不重复加分' : `积分 +${result.pointDelta || 0}`,
        totalPointsText: result.points ? `当前总积分 ${result.points.total || 0}` : '',
        upgradeText: result.triggeredUpgrade
          ? '已满足训练次数，自动升级为正式球员'
          : (result.nameConflict ? '已达到升级次数，请走正式球员绑定审批' : ''),
        trialProgressText: formatTrialProgress(result.trialProgress, kind),
      });
      toast(result.duplicated ? '已签到过' : '签到成功');
    } catch (err) {
      if (err && err.message) {
        this.setData({ locationText: err.message });
      }
      showError(err, '签到失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  goPoints() {
    nav.go('/pages/points/points');
  },
});

function formatTrialProgress(progress, kind) {
  if (kind !== 'training' || !progress) return '';
  if (progress.level === 'verified') return '当前身份：正式球员';
  if (!progress.remainingTrainingCount) return '训练次数已达标，等待系统升级或绑定审批';
  return `试训进度：训练签到 ${progress.trainingCount}/${progress.requiredTrainingCount}，还差 ${progress.remainingTrainingCount} 次可自动升级`;
}

function fetchEventPage(offset) {
  return api.get('/events', {
    limit: EVENT_PAGE_LIMIT,
    offset,
  });
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeEventsById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(event => {
      const id = event && event.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function buildRelayOptions(events) {
  return [{ id: '', title: '请选择接龙', typeLabel: '📌 接龙', meta: '' }]
    .concat((events || []).map(ev => {
      const event = { ...ev, tagLabel: eventTagLabel(ev.tag) };
      return {
        ...event,
        kind: relayKind(event),
        typeLabel: relayTypeLabel(event),
        meta: relayMeta(event),
      };
    }));
}
