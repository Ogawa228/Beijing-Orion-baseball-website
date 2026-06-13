const api = require('../../utils/request');
const { showError } = require('../../utils/format');
const { playerIdentity } = require('../../utils/player-identity');
const nav = require('../../utils/nav');

const LEADERBOARD_PAGE_LIMIT = 50;
const SEASON_FALLBACK_PAGE_LIMIT = 100;

Page({
  data: {
    loading: true,
    loadError: false,
    leaderboard: [],
    leaderboardHasMore: false,
    leaderboardNextOffset: 0,
    loadingMoreLeaderboard: false,
    mine: null,
    seasonOptions: [{ label: '全部赛季', value: '' }],
    seasonIndex: 0,
    seasonLabel: '全部赛季',
    timelineAll: [],
    timeline: [],
    timelineFilter: 'all',
    timelineFilterOptions: [{ label: '全部', value: 'all', count: 0, activeClass: 'active' }],
    rules: null,
    rulesCards: [],
  },

  onLoad() {
    this.load();
  },

  onShow() {
    nav.syncTabBar(this);
  },

  async load() {
    this.setData({ loading: true, loadError: false });
    try {
      const app = getApp();
      const selectedSeason = currentSeasonValue(this.data);
      const seasonOptions = await loadSeasonOptions(selectedSeason);
      const seasonIndex = Math.max(seasonOptions.findIndex(option => option.value === selectedSeason), 0);
      const season = seasonOptions[seasonIndex].value;
      const pointParams = season ? { season } : undefined;
      const [lb, me] = await Promise.all([
        api.get('/leaderboard', leaderboardParams(season, 0)),
        api.get('/auth/me').catch(() => ({ user: null, player: null })),
      ]);
      app.setIdentity(me);
      let mine = null;
      let timelineAll = [];
      if (me.player) {
        const p = await api.get(`/players/${me.player.id}/points`, pointParams);
        mine = p;
        timelineAll = (p.timeline || []).map(formatTimelineItem);
      }
      const timelineFilter = normalizeTimelineFilter(this.data.timelineFilter, timelineAll);
      this.setData({
        seasonOptions,
        seasonIndex,
        seasonLabel: seasonOptions[seasonIndex].label,
        leaderboard: (lb.leaderboard || []).map((row, index) => formatRankRow(row, index, { user: me.user || null, player: me.player || null })),
        leaderboardHasMore: !!lb.hasMore,
        leaderboardNextOffset: normalizeNextOffset(lb.nextOffset, (lb.leaderboard || []).length),
        loadingMoreLeaderboard: false,
        mine,
        timelineAll,
        timeline: filterTimeline(timelineAll, timelineFilter).slice(0, 12),
        timelineFilter,
        timelineFilterOptions: buildTimelineFilterOptions(timelineAll, timelineFilter),
        rules: lb.rules || null,
        rulesCards: buildRulesCards(lb.rules || {}),
      });
    } catch (err) {
      this.setData({ loadError: true });
      showError(err, '积分加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() {
    this.load();
  },

  async loadMoreLeaderboard() {
    if (this.data.loadingMoreLeaderboard || !this.data.leaderboardHasMore) return;
    this.setData({ loadingMoreLeaderboard: true });
    try {
      const app = getApp();
      const season = currentSeasonValue(this.data);
      const offset = this.data.leaderboardNextOffset || (this.data.leaderboard || []).length;
      const lb = await api.get('/leaderboard', leaderboardParams(season, offset));
      const incoming = (lb.leaderboard || []).map((row, index) => formatRankRow(row, offset + index, {
        user: app.globalData.user || null,
        player: app.globalData.player || null,
      }));
      this.setData({
        leaderboard: (this.data.leaderboard || []).concat(incoming),
        leaderboardHasMore: !!lb.hasMore,
        leaderboardNextOffset: normalizeNextOffset(lb.nextOffset, offset + incoming.length),
        loadingMoreLeaderboard: false,
      });
    } catch (err) {
      this.setData({ loadingMoreLeaderboard: false });
      showError(err, '更多排行加载失败');
    }
  },

  onSeasonChange(e) {
    const seasonIndex = Number(e.detail.value || 0);
    const option = this.data.seasonOptions[seasonIndex] || this.data.seasonOptions[0];
    this.setData({
      seasonIndex,
      seasonLabel: option.label,
      timelineFilter: 'all',
    });
    return this.load();
  },

  setTimelineFilter(e) {
    const source = e.currentTarget.dataset.source || 'all';
    const timelineFilter = normalizeTimelineFilter(source, this.data.timelineAll);
    this.setData({
      timelineFilter,
      timeline: filterTimeline(this.data.timelineAll, timelineFilter).slice(0, 12),
      timelineFilterOptions: buildTimelineFilterOptions(this.data.timelineAll, timelineFilter),
    });
  },

  openPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },

  openTimelineItem(e) {
    const { targetType, targetId } = e.currentTarget.dataset;
    if (!targetId) return;
    if (targetType === 'game') {
      wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${targetId}` });
    } else if (targetType === 'event') {
      wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${targetId}` });
    }
  },
});

function leaderboardParams(season, offset = 0) {
  const params = {
    limit: LEADERBOARD_PAGE_LIMIT,
    offset,
  };
  if (season) params.season = season;
  return params;
}

function currentSeasonValue(data) {
  const option = (data.seasonOptions || [])[data.seasonIndex || 0];
  return option ? option.value : '';
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function buildSeasonOptions(games, selectedSeason = '') {
  const years = new Set();
  (games || []).forEach(game => {
    const dateYear = String(game.date || '').slice(0, 4);
    if (/^\d{4}$/.test(dateYear)) years.add(dateYear);
  });
  if (selectedSeason) years.add(selectedSeason);
  return [{ label: '全部赛季', value: '' }]
    .concat(Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => ({
      label: `${year} 赛季`,
      value: year,
    })));
}

async function loadSeasonOptions(selectedSeason = '') {
  try {
    const res = await api.get('/games/seasons');
    return buildSeasonOptionsFromValues(res.seasons || [], selectedSeason);
  } catch (_) {
    const games = await loadSeasonGamesFallback();
    return buildSeasonOptions(games, selectedSeason);
  }
}

async function loadSeasonGamesFallback() {
  const games = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const res = await api.get('/games', {
      includeAggregate: 'false',
      limit: SEASON_FALLBACK_PAGE_LIMIT,
      offset,
    }).catch(() => ({ games: [], hasMore: false, nextOffset: offset }));
    const pageGames = res.games || [];
    games.push(...pageGames);
    if (!res.hasMore) break;
    const nextOffset = normalizeNextOffset(res.nextOffset, offset + pageGames.length);
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }
  return games;
}

function buildSeasonOptionsFromValues(seasons, selectedSeason = '') {
  const years = new Set();
  (seasons || []).forEach(item => {
    const value = typeof item === 'object' ? (item.value || item.year || item.season) : item;
    const year = String(value || '').trim();
    if (/^\d{4}$/.test(year)) years.add(year);
  });
  if (selectedSeason) years.add(selectedSeason);
  return [{ label: '全部赛季', value: '' }]
    .concat(Array.from(years).sort((a, b) => b.localeCompare(a)).map(year => ({
      label: `${year} 赛季`,
      value: year,
    })));
}

function formatRankRow(row, index, viewer) {
  const player = row.player || {};
  const identity = playerIdentity(player, viewer);
  return {
    ...row,
    rank: index + 1,
    playerId: player.id || '',
    displayName: identity.displayName,
    nameClass: identity.nameClass,
    meta: [player.number ? `#${player.number}` : '', player.position].filter(Boolean).join(' · '),
  };
}

function sourceMeta(source) {
  const map = {
    game: '⚾ 比赛',
    training: '🏋️ 训练',
    event: '📅 活动',
    award: '🏆 奖项',
    hof: '🌟 名人堂',
    manual: '⚙️ 调整',
  };
  return map[source] || '其他';
}

function normalizeTimelineFilter(source, timeline) {
  if (!source || source === 'all') return 'all';
  return (timeline || []).some(item => item.source === source) ? source : 'all';
}

function filterTimeline(timeline, source) {
  if (!source || source === 'all') return timeline || [];
  return (timeline || []).filter(item => item.source === source);
}

function buildTimelineFilterOptions(timeline, activeSource) {
  const counts = (timeline || []).reduce((acc, item) => {
    const source = item.source || 'other';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const options = [{ label: '全部', value: 'all', count: (timeline || []).length }]
    .concat(['game', 'training', 'event', 'award', 'hof', 'manual']
      .filter(source => counts[source])
      .map(source => ({ label: sourceMeta(source), value: source, count: counts[source] })));
  return options.map(option => ({
    ...option,
    text: `${option.label} (${option.count})`,
    activeClass: option.value === activeSource ? 'active' : '',
  }));
}

function formatTimelineItem(item) {
  const delta = Number(item.delta || 0);
  const target = timelineTarget(item);
  return {
    ...item,
    deltaText: delta > 0 ? `+${delta}` : String(delta),
    deltaClass: delta >= 0 ? 'positive' : 'negative',
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    rowClass: target.id ? 'is-link' : '',
    detailText: timelineDetailText(item),
  };
}

function timelineTarget(item) {
  const detail = item.detail || {};
  const source = item.source || '';
  const gameId = detail.gameId || (source === 'game' ? item.refId : '');
  if (gameId) return { type: 'game', id: gameId, label: '查看比赛' };
  const eventId = detail.eventId || ((source === 'training' || source === 'event') ? item.refId : '');
  if (eventId) return { type: 'event', id: eventId, label: '查看接龙' };
  return { type: '', id: '', label: '' };
}

function timelineDetailText(item) {
  const detail = item.detail || {};
  const pieces = [];
  if (detail.tournamentName) pieces.push(detail.tournamentName);
  if (detail.note) pieces.push(detail.note);
  if (item.source === 'manual' && detail.reason) pieces.push(`备注：${detail.reason}`);
  if (item.source === 'hof' && detail.reason) pieces.push(`入选事由：${detail.reason}`);
  if (detail.title) pieces.push(detail.title);
  return pieces.filter(Boolean).join(' · ');
}

function buildRulesCards(rules) {
  const groups = [
    {
      title: '⚾ 出场积分',
      items: [
        ['training', '训练签到'],
        ['friendlyOrTraining', '友谊/训练赛'],
        ['leagueOrCup', '联赛/杯赛'],
        ['event', '活动出席'],
      ],
    },
    {
      title: '🎯 比赛表现',
      items: [
        ['mvp', '单场 MVP'],
        ['single', '一垒安打'],
        ['double', '二垒安打'],
        ['triple', '三垒安打'],
        ['hr', '本垒打'],
        ['rbi', '打点'],
      ],
    },
    {
      title: '🥎 投手/防守',
      items: [
        ['so', '投手三振'],
        ['bb_pitcher', '投手保送'],
        ['error', '守备失误'],
      ],
    },
    {
      title: '🏆 荣誉',
      items: [
        ['seasonMvp', '赛季 MVP'],
        ['goldGlove', '金手套'],
        ['silverBat', '银棒'],
        ['hallOfFame', '名人堂'],
      ],
    },
  ];
  return groups
    .map(group => ({
      ...group,
      items: group.items
        .filter(([key]) => Object.prototype.hasOwnProperty.call(rules, key))
        .map(([key, label]) => {
          const value = Number(rules[key] || 0);
          return {
            key,
            label,
            value: fmtRuleDelta(value),
            deltaClass: value >= 0 ? 'positive' : 'negative',
          };
        }),
    }))
    .filter(group => group.items.length);
}

function fmtRuleDelta(value) {
  const delta = Number(value || 0);
  return delta > 0 ? `+${delta}` : String(delta);
}
