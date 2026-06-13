const api = require('../../../utils/request');
const { showError } = require('../../../utils/format');
const { eventTagLabel, sportLabel } = require('../../../utils/labels');
const nav = require('../../../utils/nav');

const EVENT_PAGE_LIMIT = 30;
const GAME_PAGE_LIMIT = 3;
const TOURNAMENT_PAGE_LIMIT = 6;

const sectionTabs = [
  { key: 'relay', label: '接龙' },
  { key: 'tournament', label: '赛事' },
  { key: 'game', label: '比赛' },
];

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
    tournaments: [],
    recentGames: [],
    sectionTabs,
    activeSection: 'relay',
    signupCountMap: {},
    user: null,
    canCreateEvent: false,
    canRecordGame: false,
    canManageTournaments: false,
    canImport: false,
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
    // 新建/编辑/删除赛事或接龙后回到列表时刷新一次;平时不刷新以避免切 tab 频闪
    let dirty = false;
    try { dirty = wx.getStorageSync('orionEventHubDirty'); } catch (err) { /* 忽略 */ }
    if (dirty) {
      try { wx.removeStorageSync('orionEventHubDirty'); } catch (err) { /* 忽略 */ }
      this.load();
    }
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
      const [me, eventsRes, tournamentsRes, gamesRes] = await Promise.all([
        api.get('/auth/me').catch(() => ({ user: app.globalData.user || null, player: app.globalData.player || null })),
        api.get('/events', { limit: EVENT_PAGE_LIMIT, offset }),
        api.get('/tournaments', { includeGameCount: 'true', limit: TOURNAMENT_PAGE_LIMIT, offset: 0 }).catch(() => ({ tournaments: [] })),
        api.get('/games', { includeAggregate: 'false', limit: GAME_PAGE_LIMIT, offset: 0 }).catch(() => ({ games: [] })),
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
        canRecordGame: canRecordGames(user),
        canManageTournaments: canManageTournaments(user),
        canImport: canImportGames(user),
        events: reset ? mappedEvents : mergeEventsById(this.data.events, mappedEvents),
        tournaments: reset ? (tournamentsRes.tournaments || []).map(formatTournamentCard) : this.data.tournaments,
        recentGames: reset ? (gamesRes.games || []).map(formatRecentGame) : this.data.recentGames,
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

  openGames() {
    wx.navigateTo({ url: '/pages/games/game-list/game-list' });
  },

  openGame(e) {
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${e.currentTarget.dataset.id}` });
  },

  openTournament(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/tournaments/tournament-detail/tournament-detail?id=${id}` });
  },

  editTournament(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/tournaments/tournament-manage/tournament-manage?id=${id}` });
  },

  startRecord() {
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.canRecordGame) {
      wx.showToast({ title: '需要运营或记录权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/score/create/create' });
  },

  createTournament() {
    if (!this.data.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.canManageTournaments) {
      wx.showToast({ title: '需要赛事管理权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/tournaments/tournament-manage/tournament-manage' });
  },

  openImport() {
    if (!this.data.canImport) {
      wx.showToast({ title: '需要数据导入权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/games/game-import/game-import' });
  },

  switchSection(e) {
    const key = e.currentTarget.dataset.key || 'relay';
    this.setData({ activeSection: key });
  },
});

function canCreateEvents(user) {
  return (user?.permissions || []).includes('events:write');
}

function canRecordGames(user) {
  if (!user) return false;
  const permissions = user.permissions || [];
  if (permissions.includes('events:write')) return true;
  if (permissions.includes('games:draft') || permissions.includes('games:confirm')) return true;
  return user.role === 'admin' && !permissions.length;
}

function canManageTournaments(user) {
  if (!user) return false;
  const permissions = user.permissions || [];
  return permissions.includes('tournaments:write') || (user.role === 'admin' && !permissions.length);
}

function canImportGames(user) {
  if (!user) return false;
  const permissions = user.permissions || [];
  return permissions.includes('games:draft') || (user.role === 'admin' && !permissions.length);
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

function formatRecentGame(game) {
  return {
    ...game,
    sportLabel: sportLabel(game.sport),
    title: `${game.away || '客队'} vs ${game.home || '主队'}`,
    scoreText: `${Number(game.awayScore || 0)} : ${Number(game.homeScore || 0)}`,
    metaText: [game.date, game.seasonName || game.season, sportLabel(game.sport)].filter(Boolean).join(' · '),
  };
}

function formatTournamentCard(tournament) {
  const dateText = [tournament.startDate, tournament.endDate && tournament.endDate !== tournament.startDate ? tournament.endDate : '']
    .filter(Boolean)
    .join(' 至 ') || '日期待定';
  return {
    ...tournament,
    displayName: tournament.shortName || tournament.name || '未命名赛事',
    typeLabel: tournamentTypeLabel(tournament.type),
    sportLabel: sportLabel(tournament.sport),
    dateText,
    countText: `${Number(tournament.gameCount || 0)} 场`,
    metaText: [tournamentTypeLabel(tournament.type), sportLabel(tournament.sport), tournament.season || '未设赛季'].filter(Boolean).join(' · '),
    locationText: tournament.location || '地点待补',
  };
}

function tournamentTypeLabel(type) {
  const key = String(type || '').trim();
  if (key === 'cup') return '杯赛';
  if (key === 'league') return '联赛';
  if (key === 'training') return '训练赛';
  if (key === 'friendly') return '友谊赛';
  return '赛事';
}
