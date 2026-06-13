const api = require('../../../utils/request');
const { showError } = require('../../../utils/format');
const { sportLabel: formatSportLabel } = require('../../../utils/labels');

const PAGE_LIMIT = 30;
const TOURNAMENT_PAGE_LIMIT = 30;

Page({
  data: {
    games: [],
    tournaments: [],
    visibleGames: [],
    sport: 'all',
    activeTournamentId: '',
    allActive: 'active',
    softballActive: '',
    baseballActive: '',
    canRecordGame: false,
    canImport: false,
    loading: true,
    loadingMore: false,
    loadingMoreTournaments: false,
    pageLimit: PAGE_LIMIT,
    nextOffset: 0,
    hasMore: false,
    tournamentHasMore: false,
    tournamentNextOffset: 0,
    tournamentTotalGameCount: 0,
    emptyText: '暂无比赛',
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    return this.loadMore();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [tournamentsRes, meRes] = await Promise.all([
        this.fetchTournamentPage(0).catch(() => ({ tournaments: [], totalGameCount: 0, hasMore: false, nextOffset: 0 })),
        api.get('/auth/me').catch(() => ({ user: null })),
      ]);
      const tournaments = this.buildTournamentFilters(tournamentsRes.tournaments || [], tournamentsRes.totalGameCount);
      this.setData({
        tournaments,
        canRecordGame: canRecordGames(meRes.user),
        canImport: canImportGames(meRes.user),
        tournamentHasMore: !!tournamentsRes.hasMore,
        tournamentNextOffset: normalizeNextOffset(tournamentsRes.nextOffset, (tournamentsRes.tournaments || []).length),
        tournamentTotalGameCount: safeCount(tournamentsRes.totalGameCount),
      });
      await this.loadGames({ reset: true });
    } catch (err) {
      this.setData({ loading: false });
      showError(err, '比赛加载失败');
    }
  },

  fetchTournamentPage(offset) {
    return api.get('/tournaments', {
      includeGameCount: 'true',
      limit: TOURNAMENT_PAGE_LIMIT,
      offset,
    });
  },

  buildTournamentFilters(tournaments, totalGameCount) {
    const items = (tournaments || []).map(t => {
      const count = safeCount(t.gameCount);
      return {
        ...t,
        displayName: t.shortName || t.name || '未命名赛事',
        meta: [this.sportLabel(t.sport), t.season, t.location].filter(Boolean).join(' · '),
        count,
        countText: `${count} 场`,
        active: false,
      };
    });
    const total = Number.isFinite(Number(totalGameCount))
      ? Number(totalGameCount)
      : items.reduce((sum, item) => sum + safeCount(item.count), 0);
    return [
      { id: '', name: '全部赛事', shortName: '全部', displayName: '全部', meta: '全部 ⚾🥎 比赛', count: total, countText: `${total} 场`, active: true },
    ].concat(items);
  },

  sportLabel(sport) {
    return formatSportLabel(sport);
  },

  gameInTournament(game, tournament) {
    if (!tournament || !tournament.id) return true;
    if (game.tournamentId && game.tournamentId === tournament.id) return true;
    return !game.tournamentId && tournament.season && game.season === tournament.season;
  },

  setSport(e) {
    const sport = e.currentTarget.dataset.sport || 'all';
    if (sport === this.data.sport) return Promise.resolve();
    this.setData({ sport });
    return this.loadGames({ reset: true });
  },

  setTournament(e) {
    const activeTournamentId = e.currentTarget.dataset.id || '';
    if (activeTournamentId === this.data.activeTournamentId) return Promise.resolve();
    this.setData({ activeTournamentId });
    return this.loadGames({ reset: true });
  },

  async loadMoreTournaments() {
    if (!this.data.tournamentHasMore || this.data.loadingMoreTournaments) return;
    const offset = this.data.tournamentNextOffset || Math.max(0, (this.data.tournaments || []).length - 1);
    this.setData({ loadingMoreTournaments: true });
    try {
      const res = await this.fetchTournamentPage(offset);
      const existing = (this.data.tournaments || []).filter(t => t.id);
      const merged = mergeTournamentsById(existing, res.tournaments || []);
      const totalGameCount = Number.isFinite(Number(res.totalGameCount))
        ? Number(res.totalGameCount)
        : this.data.tournamentTotalGameCount;
      this.setData({
        tournaments: this.markActiveTournament(this.buildTournamentFilters(merged, totalGameCount)),
        tournamentHasMore: !!res.hasMore,
        tournamentNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.tournaments || []).length),
        tournamentTotalGameCount: safeCount(totalGameCount),
      });
      this.applyFilter();
    } catch (err) {
      showError(err, '赛事加载失败');
    } finally {
      this.setData({ loadingMoreTournaments: false });
    }
  },

  applyFilter() {
    const visibleGames = this.buildVisibleGames(this.data.games || []);
    const filterTournaments = this.markActiveTournament(this.data.tournaments || []);
    const { sport, activeTournamentId } = this.data;
    this.setData({
      tournaments: filterTournaments,
      visibleGames,
      allActive: sport === 'all' ? 'active' : '',
      softballActive: sport === 'softball' ? 'active' : '',
      baseballActive: sport === 'baseball' ? 'active' : '',
      emptyText: activeTournamentId ? '该赛事暂时没有比赛' : (sport === 'all' ? '暂无比赛' : '暂无该类型比赛'),
    });
  },

  buildVisibleGames(games) {
    const { tournaments, sport, activeTournamentId } = this.data;
    const activeTournament = tournaments.find(t => t.id === activeTournamentId) || tournaments[0] || null;
    return (games || []).filter(game => {
      const sportMatched = sport === 'all' || game.sport === sport;
      return sportMatched && this.gameInTournament(game, activeTournament);
    }).map(game => ({
      ...game,
      sportLabel: this.sportLabel(game.sport),
      tournamentLabel: this.gameTournamentLabel(game),
      coverClass: game.cover ? 'has-cover' : 'no-cover',
    }));
  },

  markActiveTournament(tournaments) {
    const { activeTournamentId } = this.data;
    return (tournaments || []).map(t => ({
      ...t,
      active: (t.id || '') === (activeTournamentId || ''),
    }));
  },

  gameQueryParams(offset) {
    const params = {
      includeAggregate: 'false',
      limit: this.data.pageLimit || PAGE_LIMIT,
      offset,
    };
    if (this.data.sport && this.data.sport !== 'all') params.sport = this.data.sport;
    if (this.data.activeTournamentId) {
      params.tournamentId = this.data.activeTournamentId;
      params.includeSeasonFallback = 'true';
    }
    return params;
  },

  async loadGames({ reset = false } = {}) {
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const offset = reset ? 0 : this.data.nextOffset;
    this.setData(reset
      ? { loading: true, loadingMore: false, games: [], visibleGames: [], nextOffset: 0, hasMore: false }
      : { loadingMore: true });
    try {
      const res = await api.get('/games', this.gameQueryParams(offset));
      const incoming = res.games || [];
      const games = reset ? incoming : (this.data.games || []).concat(incoming);
      const nextOffset = Number.isFinite(Number(res.nextOffset)) ? Number(res.nextOffset) : offset + incoming.length;
      this.setData({
        games,
        visibleGames: this.buildVisibleGames(games),
        tournaments: this.markActiveTournament(this.data.tournaments || []),
        nextOffset,
        hasMore: !!res.hasMore,
        allActive: this.data.sport === 'all' ? 'active' : '',
        softballActive: this.data.sport === 'softball' ? 'active' : '',
        baseballActive: this.data.sport === 'baseball' ? 'active' : '',
        emptyText: this.data.activeTournamentId ? '该赛事暂时没有比赛' : (this.data.sport === 'all' ? '暂无比赛' : '暂无该类型比赛'),
      });
    } catch (err) {
      showError(err, '比赛加载失败');
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return Promise.resolve();
    return this.loadGames({ reset: false });
  },

  gameTournamentLabel(game) {
    const found = (this.data.tournaments || []).find(t => t.id && this.gameInTournament(game, t));
    return found ? (found.shortName || found.name || found.season) : (game.seasonName || game.season || '');
  },

  open(e) {
    wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${e.currentTarget.dataset.id}` });
  },

  openTournament(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/tournaments/tournament-detail/tournament-detail?id=${id}` });
  },

  create() {
    wx.navigateTo({ url: '/pages/score/create/create' });
  },

  importPdf() {
    wx.navigateTo({ url: '/pages/games/game-import/game-import' });
  },
});

function safeCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeTournamentsById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(tournament => {
      const id = tournament && tournament.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function canImportGames(user) {
  if (!user) return false;
  const permissions = user.permissions || [];
  if (permissions.includes('games:draft') && permissions.includes('games:confirm')) return true;
  return user.role === 'admin' && !permissions.length;
}

function canRecordGames(user) {
  if (!user) return false;
  const permissions = user.permissions || [];
  if (permissions.includes('events:write')) return true;
  if (permissions.includes('games:draft') || permissions.includes('games:confirm')) return true;
  return user.role === 'admin' && !permissions.length;
}
