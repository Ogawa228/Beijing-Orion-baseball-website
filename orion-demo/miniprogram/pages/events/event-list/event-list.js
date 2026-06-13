const api = require('../../../utils/request');
const { showError } = require('../../../utils/format');
const { eventTagLabel } = require('../../../utils/labels');
const nav = require('../../../utils/nav');

const EVENT_PAGE_LIMIT = 30;

function normalizeImages(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try { return normalizeImages(JSON.parse(value)); } catch (_) { return value.trim() ? [value.trim()] : []; }
  }
  return [];
}

function readServerSignupCount(ev) {
  const keys = ['signupCount', 'goingSignupCount', 'signup_count'];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(ev, key)) {
      const count = Number(ev[key]);
      return Number.isFinite(count) ? count : 0;
    }
  }
  return null;
}

async function loadLegacySignupCounts(events) {
  const signupPairs = await Promise.all(events.map(async ev => {
    try {
      const res = await api.get('/event-signups', { eventId: ev.id, status: 'going' });
      return [ev.id, (res.signups || []).length];
    } catch (_) {
      return [ev.id, 0];
    }
  }));
  return signupPairs.reduce((acc, [id, count]) => {
    acc[id] = count;
    return acc;
  }, {});
}

Page({
  data: {
    events: [],
    signupCountMap: {},
    user: null,
    canCreateEvent: false,
    hasMore: false,
    nextOffset: 0,
    loading: true,
    loadingMore: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    nav.syncTabBar(this);
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load(reset = true) {
    if (reset) {
      this.setData({ loading: true, hasMore: false, nextOffset: 0 });
    }
    try {
      const app = getApp();
      const offset = reset ? 0 : (this.data.nextOffset || this.data.events.length);
      const [me, eventsRes] = await Promise.all([
        api.get('/auth/me').catch(() => ({ user: app.globalData.user || null, player: app.globalData.player || null })),
        api.get('/events', { limit: EVENT_PAGE_LIMIT, offset }),
      ]);
      if (app.setIdentity) app.setIdentity(me);
      const user = me.user || null;
      const events = eventsRes.events || [];
      const signupCountMap = {};
      const legacyCountEvents = [];
      events.forEach(ev => {
        const count = readServerSignupCount(ev);
        if (count === null) {
          legacyCountEvents.push(ev);
        } else {
          signupCountMap[ev.id] = count;
        }
      });
      if (legacyCountEvents.length) {
        Object.assign(signupCountMap, await loadLegacySignupCounts(legacyCountEvents));
      }
      const mappedEvents = events.map(ev => {
        const images = normalizeImages(ev.images);
        return {
          ...ev,
          images,
          previewCover: ev.cover || images[0] || '',
          tagLabel: eventTagLabel(ev.tag),
          signupCount: signupCountMap[ev.id] || 0,
        };
      });
      this.setData({
        user,
        canCreateEvent: canCreateEvents(user),
        events: reset ? mappedEvents : mergeEventsById(this.data.events, mappedEvents),
        signupCountMap: reset ? signupCountMap : { ...this.data.signupCountMap, ...signupCountMap },
        hasMore: !!eventsRes.hasMore,
        nextOffset: normalizeNextOffset(eventsRes.nextOffset, offset + mappedEvents.length),
      });
    } catch (err) {
      showError(err, '活动加载失败');
    } finally {
      if (reset) this.setData({ loading: false });
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      await this.load(false);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  open(e) {
    wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${e.currentTarget.dataset.id}` });
  },

  create() {
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.canCreateEvent) {
      wx.showToast({ title: '需要运营组权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/events/event-create/event-create' });
  },
});

function canCreateEvents(user) {
  return (user?.permissions || []).includes('events:write');
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
