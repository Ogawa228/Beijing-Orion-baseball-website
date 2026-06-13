const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');

const PLAYER_PAGE_LIMIT = 50;

Page({
  data: {
    players: [],
    visiblePlayers: [],
    playersHasMore: false,
    playersNextOffset: 0,
    loadingPlayers: false,
    loadingMorePlayers: false,
    selected: null,
    query: '',
    nickname: '',
    contactTail: '',
    note: '',
    requests: [],
    latestRequest: null,
    submitLabel: '提交绑定申请',
    submitDisabled: false,
    saving: false,
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loadingPlayers: true });
    try {
      const [res, requestRes] = await Promise.all([
        api.get('/players', playerQueryParams(this.data.query, 0)),
        api.get('/bind-requests/mine').catch(() => ({ requests: [] })),
      ]);
      const requests = (requestRes.requests || []).map(formatBindRequest);
      const latestRequest = requests[0] || null;
      const players = res.players || [];
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, players.length),
      });
      this.setRequestState(requests, latestRequest);
      this.applyFilter();
    } catch (err) {
      showError(err, '球员加载失败');
    } finally {
      this.setData({ loadingPlayers: false });
    }
  },

  setRequestState(requests, latestRequest) {
    const isApproved = latestRequest && latestRequest.status === 'approved';
    const isPending = latestRequest && latestRequest.status === 'pending';
    this.setData({
      requests,
      latestRequest,
      submitLabel: isPending ? '更新待审申请' : '提交绑定申请',
      submitDisabled: !!isApproved,
    });
  },

  onQueryInput(e) {
    this.setData({ query: e.detail.value });
    this.applyFilter();
  },

  async searchPlayers() {
    this.setData({ loadingPlayers: true, playersHasMore: false, playersNextOffset: 0 });
    try {
      const res = await api.get('/players', playerQueryParams(this.data.query, 0));
      const players = res.players || [];
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, players.length),
      });
      this.applyFilter();
    } catch (err) {
      showError(err, '球员搜索失败');
    } finally {
      this.setData({ loadingPlayers: false });
    }
  },

  async loadMorePlayers() {
    if (!this.data.playersHasMore || this.data.loadingMorePlayers) return;
    const offset = this.data.playersNextOffset || (this.data.players || []).length;
    this.setData({ loadingMorePlayers: true });
    try {
      const res = await api.get('/players', playerQueryParams(this.data.query, offset));
      const incoming = res.players || [];
      const players = mergePlayersById(this.data.players, incoming);
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, offset + incoming.length),
      });
      this.applyFilter();
    } catch (err) {
      showError(err, '球员加载失败');
    } finally {
      this.setData({ loadingMorePlayers: false });
    }
  },

  applyFilter() {
    const q = String(this.data.query || '').trim().toLowerCase();
    const selectedId = this.data.selected ? this.data.selected.id : '';
    const visiblePlayers = (this.data.players || []).filter(p => {
      if (!q) return true;
      return [p.name, p.number, p.position].join(' ').toLowerCase().includes(q);
    }).map(p => ({ ...p, activeClass: p.id === selectedId ? 'active' : '' }));
    this.setData({ visiblePlayers });
  },

  select(e) {
    const selected = this.data.players.find(p => p.id === e.currentTarget.dataset.id);
    this.setData({ selected: selected || null });
    this.applyFilter();
  },

  onNicknameInput(e) { this.setData({ nickname: e.detail.value }); },
  onContactInput(e) { this.setData({ contactTail: e.detail.value }); },
  onNoteInput(e) { this.setData({ note: e.detail.value }); },

  async submit() {
    if (this.data.saving) return;
    if (!getApp().globalData.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (this.data.submitDisabled) {
      toast('绑定申请已通过');
      return;
    }
    const selected = this.data.selected;
    if (!selected) return toast('请选择球员');
    this.setData({ saving: true });
    try {
      await api.post('/bind-requests', {
        requestedPlayerId: selected.id,
        realName: selected.name,
        jerseyNumber: selected.number || '',
        nickname: this.data.nickname,
        contactTail: this.data.contactTail,
        note: this.data.note,
        source: 'mini',
      });
      toast('申请已提交');
      await this.load();
    } catch (err) {
      showError(err, '提交失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function formatBindRequest(request) {
  const statusMap = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  };
  const target = request.requestedPlayerName
    ? `#${request.requestedPlayerNumber || '-'} ${request.requestedPlayerName}`
    : '目标球员档案';
  const meta = [
    request.requestedPlayerPosition,
    request.reviewNote,
    request.reviewerName ? `审核人 ${request.reviewerName}` : '',
  ].filter(Boolean).join(' · ');
  return {
    ...request,
    target,
    meta,
    statusLabel: statusMap[request.status] || request.status || '未知',
    statusClass: request.status || 'unknown',
  };
}

function playerQueryParams(query, offset) {
  const params = { limit: PLAYER_PAGE_LIMIT, offset };
  const keyword = String(query || '').trim();
  if (keyword) params.keyword = keyword;
  return params;
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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
