const api = require('../../../utils/request');
const { POSITIONS } = require('../../../utils/baseball');
const { showError, toast } = require('../../../utils/format');

const sports = [
  { label: '🥎 慢垒', value: 'softball' },
  { label: '⚾ 棒球', value: 'baseball' },
];

const venues = [
  { label: '猎户主场', value: 'Home' },
  { label: '猎户客场', value: 'Away' },
];

const rosterSources = [
  { label: '管理员手动添加', value: 'manual' },
  { label: '从活动接龙导入', value: 'relay' },
];

const EVENT_PAGE_LIMIT = 60;
const TOURNAMENT_PAGE_LIMIT = 30;
const PLAYER_PAGE_LIMIT = 50;

const FIELD_POSITIONS = [
  { slot: 'P', label: '投手', className: 'pos-p' },
  { slot: 'C', label: '捕手', className: 'pos-c' },
  { slot: '1B', label: '一垒', className: 'pos-1b' },
  { slot: '2B', label: '二垒', className: 'pos-2b' },
  { slot: '3B', label: '三垒', className: 'pos-3b' },
  { slot: 'SS', label: '游击', className: 'pos-ss' },
  { slot: 'LF', label: '左外', className: 'pos-lf' },
  { slot: 'CF', label: '中外', className: 'pos-cf' },
  { slot: 'RF', label: '右外', className: 'pos-rf' },
  { slot: 'SF', label: '自由人', className: 'pos-sf' },
];

const FIELD_POSITION_POINTS = {
  P: { x: 50, y: 48 },
  C: { x: 50, y: 78 },
  '1B': { x: 72, y: 54 },
  '2B': { x: 60, y: 34 },
  '3B': { x: 28, y: 54 },
  SS: { x: 40, y: 34 },
  LF: { x: 20, y: 16 },
  CF: { x: 50, y: 12 },
  RF: { x: 80, y: 16 },
  SF: { x: 50, y: 25 },
};

function buildFieldSlots(lineup) {
  return FIELD_POSITIONS.map(pos => {
    const player = (lineup || []).find(p => p.slot === pos.slot);
    return {
      ...pos,
      name: player ? player.name : '未安排',
      number: player ? player.number : '',
      stateClass: player ? '' : 'is-empty',
    };
  });
}

function buildBenchSlots(lineup) {
  return (lineup || [])
    .filter(p => !FIELD_POSITIONS.some(pos => pos.slot === p.slot))
    .map(p => ({
      id: p.id,
      name: p.name,
      number: p.number,
      slot: p.slot || 'BN',
    }));
}

function buildPositionWarnings(lineup) {
  const fieldSlotSet = new Set(FIELD_POSITIONS.map(pos => pos.slot));
  const counts = {};
  (lineup || []).forEach(p => {
    if (!fieldSlotSet.has(p.slot)) return;
    counts[p.slot] = (counts[p.slot] || 0) + 1;
  });
  return Object.keys(counts)
    .filter(slot => counts[slot] > 1)
    .map(slot => `${slot} 已安排 ${counts[slot]} 人`);
}

function statusLabel(status) {
  if (status === 'tentative') return '待定';
  if (status === 'going') return '报名';
  return '已取消';
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

function buildRosterEventOptions(events) {
  return [{ id: '', title: '请选择接龙活动' }].concat(events || []);
}

function buildTournamentOptions(tournaments) {
  return [{ id: '', name: '不关联赛事' }].concat(tournaments || []);
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

function playerQueryParams(query, offset) {
  const keyword = String(query || '').trim();
  const params = { include: 'all', limit: PLAYER_PAGE_LIMIT, offset };
  if (keyword) params.keyword = keyword;
  return params;
}

function decoratePlayers(players, selectedMap) {
  return (players || []).map(player => ({ ...player, checked: !!selectedMap[player.id] }));
}

function nearestFieldSlot(xPercent, yPercent) {
  let best = FIELD_POSITIONS[0].slot;
  let bestDistance = Infinity;
  FIELD_POSITIONS.forEach(pos => {
    const point = FIELD_POSITION_POINTS[pos.slot];
    const distance = Math.hypot(point.x - xPercent, point.y - yPercent);
    if (distance < bestDistance) {
      best = pos.slot;
      bestDistance = distance;
    }
  });
  return best;
}

Page({
  data: {
    sports,
    venues,
    rosterSources,
    positions: POSITIONS,
    sportIndex: 0,
    sportLabel: sports[0].label,
    venueIndex: 0,
    venueLabel: venues[0].label,
    rosterSourceIndex: 0,
    rosterSource: rosterSources[0].value,
    rosterSourceLabel: rosterSources[0].label,
    relayMode: false,
    rosterEventOptions: [{ id: '', title: '请选择接龙活动' }],
    rosterEventIndex: 0,
    rosterEventLabel: '请选择接龙活动',
    rosterEventsHasMore: false,
    rosterEventsNextOffset: 0,
    loadingMoreRosterEvents: false,
    relaySignups: [],
    relaySummary: '选择活动后，可把接龙中已绑定球员导入出场名单。',
    relayUnmatchedNames: [],
    selectedLineupIndex: -1,
    selectedLineupName: '',
    dragIndex: -1,
    dragStartY: 0,
    draggingId: '',
    opponent: '',
    date: new Date().toISOString().slice(0, 10),
    tournamentOptions: [{ id: '', name: '不关联赛事' }],
    tournamentIndex: 0,
    tournamentLabel: '不关联赛事',
    tournamentHasMore: false,
    tournamentNextOffset: 0,
    loadingMoreTournaments: false,
    launchEventId: '',
    players: [],
    playerQuery: '',
    playersHasMore: false,
    playersNextOffset: 0,
    loadingPlayers: false,
    loadingMorePlayers: false,
    selectedMap: {},
    lineup: [],
    fieldSlots: buildFieldSlots([]),
    benchSlots: [],
    positionWarnings: [],
  },

  onLoad(options = {}) {
    const launchEventId = String(options.eventId || '').trim();
    this.setData({ launchEventId });
    return this.load(launchEventId);
  },

  async load(prefillEventId = '') {
    try {
      const [playersRes, tournamentsRes, eventsRes] = await Promise.all([
        api.get('/players', playerQueryParams('', 0)),
        api.get('/tournaments', { limit: TOURNAMENT_PAGE_LIMIT, offset: 0 }),
        api.get('/events', { limit: EVENT_PAGE_LIMIT, offset: 0 }).catch(() => ({ events: [], hasMore: false, nextOffset: 0 })),
      ]);
      const firstPageEvents = eventsRes.events || [];
      let rosterEvents = firstPageEvents;
      if (prefillEventId && !firstPageEvents.some(event => event.id === prefillEventId)) {
        const detailRes = await api.get(`/events/${prefillEventId}`).catch(() => ({ event: null }));
        if (detailRes.event) rosterEvents = mergeEventsById([detailRes.event], firstPageEvents);
      }
      const rosterEventOptions = buildRosterEventOptions(rosterEvents);
      const prefillIndex = prefillEventId
        ? rosterEventOptions.findIndex(event => event.id === prefillEventId)
        : -1;
      const patch = {
        players: decoratePlayers(playersRes.players || [], this.data.selectedMap || {}),
        playersHasMore: !!playersRes.hasMore,
        playersNextOffset: normalizeNextOffset(playersRes.nextOffset, (playersRes.players || []).length),
        tournamentOptions: buildTournamentOptions(tournamentsRes.tournaments || []),
        tournamentLabel: '不关联赛事',
        tournamentHasMore: !!tournamentsRes.hasMore,
        tournamentNextOffset: normalizeNextOffset(tournamentsRes.nextOffset, (tournamentsRes.tournaments || []).length),
        rosterEventOptions,
        rosterEventsHasMore: !!eventsRes.hasMore,
        rosterEventsNextOffset: normalizeNextOffset(eventsRes.nextOffset, firstPageEvents.length),
      };
      if (prefillIndex > 0) {
        const event = rosterEventOptions[prefillIndex];
        patch.rosterSourceIndex = 1;
        patch.rosterSource = 'relay';
        patch.rosterSourceLabel = rosterSources[1].label;
        patch.relayMode = true;
        patch.rosterEventIndex = prefillIndex;
        patch.rosterEventLabel = event.title;
        if (event.date) patch.date = String(event.date).slice(0, 10);
      }
      this.setData(patch);
      if (prefillIndex > 0) {
        await this.loadRelaySignups(prefillEventId);
      }
    } catch (err) {
      showError(err, '数据加载失败');
    }
  },

  onSportChange(e) {
    const sportIndex = Number(e.detail.value);
    this.setData({ sportIndex, sportLabel: sports[sportIndex].label });
  },
  onVenueChange(e) {
    const venueIndex = Number(e.detail.value);
    this.setData({ venueIndex, venueLabel: venues[venueIndex].label });
  },
  onTournamentChange(e) {
    const tournamentIndex = Number(e.detail.value);
    const option = this.data.tournamentOptions[tournamentIndex] || this.data.tournamentOptions[0];
    this.setData({ tournamentIndex, tournamentLabel: option.name });
  },
  async loadMoreTournaments() {
    if (!this.data.tournamentHasMore || this.data.loadingMoreTournaments) return;
    const selected = this.data.tournamentOptions[this.data.tournamentIndex] || {};
    const selectedId = selected.id || '';
    const offset = this.data.tournamentNextOffset || Math.max(0, (this.data.tournamentOptions || []).length - 1);
    this.setData({ loadingMoreTournaments: true });
    try {
      const res = await api.get('/tournaments', { limit: TOURNAMENT_PAGE_LIMIT, offset });
      const tournaments = mergeTournamentsById((this.data.tournamentOptions || []).slice(1), res.tournaments || []);
      const tournamentOptions = buildTournamentOptions(tournaments);
      const selectedIndex = selectedId
        ? tournamentOptions.findIndex(tournament => tournament.id === selectedId)
        : this.data.tournamentIndex;
      const tournamentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const option = tournamentOptions[tournamentIndex] || tournamentOptions[0];
      this.setData({
        tournamentOptions,
        tournamentIndex,
        tournamentLabel: option.name,
        tournamentHasMore: !!res.hasMore,
        tournamentNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.tournaments || []).length),
      });
    } catch (err) {
      showError(err, '加载更多赛事失败');
    } finally {
      this.setData({ loadingMoreTournaments: false });
    }
  },
  onRosterSourceChange(e) {
    const rosterSourceIndex = Number(e.detail.value);
    const option = rosterSources[rosterSourceIndex] || rosterSources[0];
    this.setData({
      rosterSourceIndex,
      rosterSource: option.value,
      rosterSourceLabel: option.label,
      relayMode: option.value === 'relay',
    });
    if (option.value === 'relay') {
      this.loadRelaySignups();
    }
  },
  async onRosterEventChange(e) {
    const rosterEventIndex = Number(e.detail.value);
    const option = this.data.rosterEventOptions[rosterEventIndex] || this.data.rosterEventOptions[0];
    this.setData({ rosterEventIndex, rosterEventLabel: option.title });
    await this.loadRelaySignups(option.id);
  },

  async loadMoreRosterEvents() {
    if (!this.data.rosterEventsHasMore || this.data.loadingMoreRosterEvents) return;
    const selected = this.data.rosterEventOptions[this.data.rosterEventIndex] || {};
    const selectedId = selected.id || '';
    const offset = this.data.rosterEventsNextOffset || Math.max(0, (this.data.rosterEventOptions || []).length - 1);
    this.setData({ loadingMoreRosterEvents: true });
    try {
      const res = await api.get('/events', { limit: EVENT_PAGE_LIMIT, offset });
      const incoming = res.events || [];
      const events = mergeEventsById((this.data.rosterEventOptions || []).slice(1), incoming);
      const rosterEventOptions = buildRosterEventOptions(events);
      const selectedIndex = selectedId
        ? rosterEventOptions.findIndex(event => event.id === selectedId)
        : 0;
      const rosterEventIndex = selectedIndex > 0 ? selectedIndex : 0;
      const option = rosterEventOptions[rosterEventIndex] || rosterEventOptions[0];
      this.setData({
        rosterEventOptions,
        rosterEventIndex,
        rosterEventLabel: option.title,
        rosterEventsHasMore: !!res.hasMore,
        rosterEventsNextOffset: normalizeNextOffset(res.nextOffset, offset + incoming.length),
      });
    } catch (err) {
      showError(err, '加载更多接龙失败');
    } finally {
      this.setData({ loadingMoreRosterEvents: false });
    }
  },

  onOpponentInput(e) { this.setData({ opponent: e.detail.value }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },

  onRosterChange(e) {
    this.setLineupFromVisibleSelection(e.detail.value || []);
  },

  onPlayerSearchInput(e) {
    this.setData({ playerQuery: e.detail.value });
  },

  async searchPlayers() {
    if (this.data.loadingPlayers) return;
    this.setData({ loadingPlayers: true });
    try {
      const res = await api.get('/players', playerQueryParams(this.data.playerQuery, 0));
      const players = decoratePlayers(res.players || [], this.data.selectedMap || {});
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, players.length),
      });
    } catch (err) {
      showError(err, '球员候选搜索失败');
    } finally {
      this.setData({ loadingPlayers: false });
    }
  },

  async clearPlayerSearch() {
    this.setData({ playerQuery: '' });
    return this.searchPlayers();
  },

  async loadMorePlayers() {
    if (!this.data.playersHasMore || this.data.loadingMorePlayers) return;
    const offset = this.data.playersNextOffset || (this.data.players || []).length;
    this.setData({ loadingMorePlayers: true });
    try {
      const res = await api.get('/players', playerQueryParams(this.data.playerQuery, offset));
      const players = decoratePlayers(
        mergePlayersById(this.data.players || [], res.players || []),
        this.data.selectedMap || {}
      );
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.players || []).length),
      });
    } catch (err) {
      showError(err, '加载更多球员失败');
    } finally {
      this.setData({ loadingMorePlayers: false });
    }
  },

  async ensurePlayersLoaded(ids) {
    const wanted = Array.from(new Set((ids || []).filter(Boolean)));
    if (!wanted.length) return;
    const loadedIds = new Set((this.data.players || []).map(player => player.id));
    const missingIds = wanted.filter(id => !loadedIds.has(id));
    if (!missingIds.length) return;
    const detailPlayers = await Promise.all(missingIds.map(id => (
      api.get(`/players/${id}`).then(res => res.player).catch(() => null)
    )));
    const players = decoratePlayers(
      mergePlayersById(this.data.players || [], detailPlayers.filter(Boolean)),
      this.data.selectedMap || {}
    );
    this.setData({ players });
  },

  setLineupFromIds(ids) {
    const validIds = new Set([].concat(this.data.players || [], this.data.lineup || []).map(p => p.id));
    const uniqueIds = [];
    (ids || []).forEach(id => {
      if (validIds.has(id) && !uniqueIds.includes(id)) uniqueIds.push(id);
    });
    const selectedMap = uniqueIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
    const players = decoratePlayers(this.data.players || [], selectedMap);
    const lineup = uniqueIds.map((id, index) => {
      const old = this.data.lineup.find(p => p.id === id);
      const player = players.find(p => p.id === id) || old || {};
      const slotIndex = old ? old.slotIndex : Math.min(index, POSITIONS.length - 1);
      return {
        ...player,
        slotIndex,
        slot: POSITIONS[slotIndex],
      };
    });
    this.setData({
      selectedMap,
      players,
      lineup,
      fieldSlots: buildFieldSlots(lineup),
      benchSlots: buildBenchSlots(lineup),
      positionWarnings: buildPositionWarnings(lineup),
    });
  },

  setLineupFromVisibleSelection(visibleSelectedIds) {
    const visibleIds = new Set((this.data.players || []).map(player => player.id));
    const selectedVisibleIds = new Set(visibleSelectedIds || []);
    const selectedMap = { ...(this.data.selectedMap || {}) };
    visibleIds.forEach(id => {
      if (selectedVisibleIds.has(id)) selectedMap[id] = true;
      else delete selectedMap[id];
    });
    const orderedIds = [];
    (this.data.lineup || []).forEach(player => {
      if (selectedMap[player.id] && !orderedIds.includes(player.id)) orderedIds.push(player.id);
    });
    (this.data.players || []).forEach(player => {
      if (selectedMap[player.id] && !orderedIds.includes(player.id)) orderedIds.push(player.id);
    });
    this.setLineupFromIds(orderedIds);
  },

  async loadRelaySignups(eventId = null) {
    const option = eventId
      ? { id: eventId }
      : (this.data.rosterEventOptions[this.data.rosterEventIndex] || {});
    if (!option.id) {
      this.setData({
        relaySignups: [],
        relaySummary: '选择活动后，可把接龙中已绑定球员导入出场名单。',
        relayUnmatchedNames: [],
      });
      return;
    }
    try {
      const res = await api.get('/event-signups', { eventId: option.id });
      const active = (res.signups || []).filter(s => s.status !== 'cancelled');
      const allActivePlayerIds = active.map(s => s.playerId).filter(Boolean);
      await this.ensurePlayersLoaded(allActivePlayerIds);
      const playerIds = new Set((this.data.players || []).map(p => p.id));
      const matchedIds = active
        .map(s => s.playerId)
        .filter(id => id && playerIds.has(id));
      const unmatchedNames = active
        .filter(s => !s.playerId || !playerIds.has(s.playerId))
        .map(s => s.playerName || s.manualName || s.userDisplayName || '未绑定队员');
      const relaySignups = active.map(s => ({
        ...s,
        displayName: s.playerName || s.manualName || s.userDisplayName || '未绑定队员',
        statusLabel: statusLabel(s.status),
        bindState: s.playerId && playerIds.has(s.playerId) ? '已绑定档案' : '需手动添加',
        bindClass: s.playerId && playerIds.has(s.playerId) ? 'bound' : 'missing',
      }));
      this.setData({
        relaySignups,
        relayUnmatchedNames: unmatchedNames,
        relaySummary: `${active.length} 人接龙，${matchedIds.length} 人可直接进出场名单`,
      });
      this.setLineupFromIds(matchedIds);
      if (!matchedIds.length) toast('接龙中没有已绑定球员');
    } catch (err) {
      showError(err, '接龙名单加载失败');
    }
  },

  refreshRelayRoster() {
    return this.loadRelaySignups();
  },

  onSlotChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const slotIndex = Number(e.detail.value);
    this.assignPlayerSlot(index, POSITIONS[slotIndex]);
  },

  commitLineup(lineup, extra = {}) {
    this.setData({
      lineup,
      fieldSlots: buildFieldSlots(lineup),
      benchSlots: buildBenchSlots(lineup),
      positionWarnings: buildPositionWarnings(lineup),
      ...extra,
    });
  },

  assignPlayerSlot(index, slot) {
    const slotIndex = POSITIONS.indexOf(slot);
    if (index < 0 || index >= this.data.lineup.length || slotIndex < 0) return;
    const lineup = this.data.lineup.slice();
    lineup[index] = { ...lineup[index], slotIndex, slot };
    this.commitLineup(lineup, {
      selectedLineupIndex: index,
      selectedLineupName: lineup[index].name || '',
    });
  },

  onLineupTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const player = this.data.lineup[index];
    this.setData({
      selectedLineupIndex: index,
      selectedLineupName: player ? player.name : '',
    });
  },

  onLineupTouchStart(e) {
    const index = Number(e.currentTarget.dataset.index);
    const touch = (e.touches || [])[0] || {};
    const player = this.data.lineup[index];
    this.setData({
      selectedLineupIndex: index,
      selectedLineupName: player ? player.name : '',
      dragIndex: index,
      dragStartY: Number(touch.clientY || 0),
      draggingId: player ? player.id : '',
    });
  },

  onLineupTouchMove(e) {
    const index = this.data.dragIndex;
    if (index < 0) return;
    const touch = (e.touches || [])[0] || {};
    const currentY = Number(touch.clientY || 0);
    const diff = currentY - Number(this.data.dragStartY || 0);
    if (Math.abs(diff) < 44) return;
    const nextIndex = diff > 0
      ? Math.min(index + 1, this.data.lineup.length - 1)
      : Math.max(index - 1, 0);
    if (nextIndex === index) return;
    const lineup = this.data.lineup.slice();
    const [moved] = lineup.splice(index, 1);
    lineup.splice(nextIndex, 0, moved);
    this.commitLineup(lineup, {
      selectedLineupIndex: nextIndex,
      selectedLineupName: moved.name || '',
      dragIndex: nextIndex,
      dragStartY: currentY,
    });
  },

  onLineupTouchEnd(e) {
    const index = this.data.dragIndex;
    const touch = (e.changedTouches || [])[0];
    const query = this.createSelectorQuery
      ? this.createSelectorQuery()
      : (wx.createSelectorQuery ? wx.createSelectorQuery() : null);
    if (index < 0 || !touch || !query) {
      this.clearDragState();
      return;
    }
    const scopedQuery = query.in ? query.in(this) : query;
    scopedQuery
      .select('.field-board')
      .boundingClientRect(rect => {
        if (rect && touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          const xPercent = ((touch.clientX - rect.left) / rect.width) * 100;
          const yPercent = ((touch.clientY - rect.top) / rect.height) * 100;
          const slot = nearestFieldSlot(xPercent, yPercent);
          this.assignPlayerSlot(this.data.dragIndex, slot);
          toast(`已安排到 ${slot}`);
        }
        this.clearDragState();
      })
      .exec();
  },

  clearDragState() {
    this.setData({ dragIndex: -1, dragStartY: 0, draggingId: '' });
  },

  onFieldMarkerTap(e) {
    const slot = e.currentTarget.dataset.slot;
    if (this.data.selectedLineupIndex < 0) {
      toast('先选择一个球员块');
      return;
    }
    this.assignPlayerSlot(this.data.selectedLineupIndex, slot);
  },

  moveLineupPlayer(index, direction) {
    if (index < 0 || index >= this.data.lineup.length) return;
    const nextIndex = direction < 0
      ? Math.max(index - 1, 0)
      : Math.min(index + 1, this.data.lineup.length - 1);
    if (nextIndex === index) return;
    const lineup = this.data.lineup.slice();
    const [moved] = lineup.splice(index, 1);
    lineup.splice(nextIndex, 0, moved);
    this.commitLineup(lineup, {
      selectedLineupIndex: nextIndex,
      selectedLineupName: moved.name || '',
    });
  },

  moveLineupUp(e) {
    this.moveLineupPlayer(Number(e.currentTarget.dataset.index), -1);
  },

  moveLineupDown(e) {
    this.moveLineupPlayer(Number(e.currentTarget.dataset.index), 1);
  },

  startGame() {
    const opponent = String(this.data.opponent || '').trim();
    if (!opponent) return toast('请填写对手');
    if (!this.data.lineup.length) return toast('请选择出场球员');
    if (this.data.positionWarnings.length) return toast('请先处理重复守位');
    const draft = {
      sport: sports[this.data.sportIndex].value,
      venue: venues[this.data.venueIndex].value,
      opponent,
      date: this.data.date,
      tournamentId: this.data.tournamentOptions[this.data.tournamentIndex].id || '',
      tournamentName: this.data.tournamentOptions[this.data.tournamentIndex].name || '',
      rosterSource: this.data.rosterSource,
      rosterEventId: this.data.rosterSource === 'relay'
        ? (this.data.rosterEventOptions[this.data.rosterEventIndex].id || '')
        : '',
      rosterEventTitle: this.data.rosterSource === 'relay'
        ? (this.data.rosterEventOptions[this.data.rosterEventIndex].title || '')
        : '',
      relaySignupCount: this.data.relaySignups.length,
      lineup: this.data.lineup,
    };
    wx.setStorageSync('orionGameDraft', draft);
    wx.navigateTo({ url: '/pages/score/live/live' });
  },
});
