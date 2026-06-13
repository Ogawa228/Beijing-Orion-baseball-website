const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');

const targetFilters = [
  { label: '全部对象', value: '' },
  { label: '⚾ 比赛', value: 'game' },
  { label: '👤 用户', value: 'user' },
  { label: '👥 球员', value: 'player' },
  { label: '📅 接龙', value: 'event' },
  { label: '🏆 赛事', value: 'tournament' },
  { label: '✨ 系统设置', value: 'site_setting' },
  { label: '🔗 绑定申请', value: 'bind_request' },
  { label: '🏛 名人堂', value: 'hall_of_fame' },
  { label: '🔔 通知', value: 'notification' },
];

const actionFilters = [
  { label: '全部动作', value: '' },
  { label: '修订比赛', value: 'revise_game_data' },
  { label: '更新比赛', value: 'update_game' },
  { label: '删除比赛', value: 'delete_game' },
  { label: '创建接龙', value: 'event_create' },
  { label: '更新接龙', value: 'event_update' },
  { label: '删除接龙', value: 'event_delete' },
  { label: '编辑球员', value: 'player_update' },
  { label: '批量导入球员', value: 'player_batch_import' },
  { label: '删除球员', value: 'player_delete' },
  { label: '创建赛事', value: 'tournament_create' },
  { label: '更新赛事', value: 'tournament_update' },
  { label: '删除赛事', value: 'tournament_delete' },
  { label: '发布系统设置', value: 'site_setting_publish' },
  { label: '绑定审批', value: 'approve_bind_request' },
  { label: '生成绑定码', value: 'create_bind_code' },
  { label: '作废绑定码', value: 'delete_bind_code' },
  { label: '权限调整', value: 'admin_permission_update' },
  { label: '积分调整', value: 'points_adjust' },
  { label: '删除积分调整', value: 'points_adjust_delete' },
  { label: '补录签到', value: 'attendance_create' },
  { label: '删除签到', value: 'attendance_delete' },
  { label: '发送通知', value: 'send_notification' },
  { label: '高危删除', value: 'delete_user' },
];

const actionLabels = {
  update_game: '更新比赛',
  revise_game_data: '修订比赛',
  delete_game: '删除比赛',
  event_create: '创建接龙',
  event_update: '更新接龙',
  event_delete: '删除接龙',
  player_update: '编辑球员',
  player_create: '新增球员',
  player_batch_import: '批量导入球员',
  player_upgrade: '升级球员',
  player_merge: '合并球员',
  player_delete: '删除球员',
  tournament_create: '创建赛事',
  tournament_update: '更新赛事',
  tournament_delete: '删除赛事',
  site_setting_publish: '发布系统设置',
  approve_bind_request: '批准绑定',
  reject_bind_request: '驳回绑定',
  send_bind_invitation: '绑定邀请',
  create_bind_code: '生成绑定码',
  delete_bind_code: '作废绑定码',
  admin_permission_update: '权限调整',
  manual_point_adjustment: '积分调整',
  points_adjust: '积分调整',
  points_adjust_delete: '删除积分调整',
  attendance_create: '补录签到',
  attendance_delete: '删除签到',
  hall_of_fame_create: '名人堂授予',
  hall_of_fame_delete: '名人堂移出',
  send_notification: '发送通知',
  reset_password: '重置密码',
  user_bind_player: '直接绑定',
  bind_user_player: '直接绑定',
  user_unbind_player: '解除绑定',
  unbind_user_player: '解除绑定',
  create_app_connect_code: '网页关联码',
  delete_user: '删除账号',
  delete_tournament: '删除赛事',
};

Page({
  data: {
    user: null,
    canReadAudit: false,
    targetFilters,
    actionFilters,
    targetIndex: 0,
    targetLabel: targetFilters[0].label,
    actionIndex: 0,
    actionLabel: actionFilters[0].label,
    keyword: '',
    logs: [],
    selectedLog: null,
    detailOpen: false,
    scopeText: '',
    resultText: '',
    offset: 0,
    limit: 30,
    hasMore: false,
    loading: true,
    loadingMore: false,
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(reset = true) {
    if (reset) {
      this.setData({ loading: true, offset: 0, logs: [], detailOpen: false, selectedLog: null });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const me = await api.get('/auth/me');
      getApp().setIdentity(me);
      const user = me.user || null;
      const canReadAudit = hasPermission(user, 'audit:read') || hasPermission(user, 'audit:game_read');
      if (!user) {
        wx.navigateTo({ url: '/pages/login/login' });
        return;
      }
      if (!canReadAudit) {
        this.setData({ user, canReadAudit: false, loading: false, loadingMore: false });
        return;
      }
      const params = buildQuery(this.data, reset);
      const res = await api.get('/admin/audit-logs', params);
      const incoming = (res.logs || []).map(formatAuditLog);
      const logs = reset ? incoming : this.data.logs.concat(incoming);
      this.setData({
        user,
        canReadAudit,
        logs,
        offset: Number(res.nextOffset || params.offset + incoming.length),
        hasMore: !!res.hasMore,
        scopeText: res.scope === 'game' ? '当前权限仅显示比赛审计' : '当前显示全部授权审计',
        resultText: logs.length ? `已加载 ${logs.length} 条` : '暂无匹配记录',
      });
    } catch (err) {
      showError(err, '审计日志加载失败');
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onTargetChange(e) {
    const targetIndex = Number(e.detail.value);
    const option = targetFilters[targetIndex] || targetFilters[0];
    this.setData({ targetIndex, targetLabel: option.label });
    return this.load(true);
  },

  onActionChange(e) {
    const actionIndex = Number(e.detail.value);
    const option = actionFilters[actionIndex] || actionFilters[0];
    this.setData({ actionIndex, actionLabel: option.label });
    return this.load(true);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  search() {
    return this.load(true);
  },

  clearFilters() {
    this.setData({
      targetIndex: 0,
      targetLabel: targetFilters[0].label,
      actionIndex: 0,
      actionLabel: actionFilters[0].label,
      keyword: '',
    });
    return this.load(true);
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    return this.load(false);
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    const selectedLog = (this.data.logs || []).find(log => log.id === id);
    if (!selectedLog) return;
    this.setData({ selectedLog, detailOpen: true });
  },

  closeDetail() {
    this.setData({ selectedLog: null, detailOpen: false });
  },

  noop() {},

  copyDetail() {
    if (!this.data.selectedLog) return;
    const text = this.data.selectedLog.metadataText || '';
    if (!text) return toast('没有可复制的详情');
    wx.setClipboardData({ data: text });
  },
});

function hasPermission(user, permission) {
  return (user?.permissions || []).includes(permission);
}

function buildQuery(data, reset) {
  const target = targetFilters[data.targetIndex] || targetFilters[0];
  const action = actionFilters[data.actionIndex] || actionFilters[0];
  const keyword = String(data.keyword || '').trim();
  const params = {
    limit: data.limit,
    offset: reset ? 0 : data.offset,
  };
  if (target.value) params.targetType = target.value;
  if (action.value) params.action = action.value;
  if (keyword) params.q = keyword;
  return params;
}

function formatAuditLog(log) {
  const metadata = log.metadata || {};
  const metadataText = formatMetadata(metadata);
  const target = [targetLabel(log.targetType), log.targetId].filter(Boolean).join(' · ');
  const timeText = log.createdAt ? String(log.createdAt).slice(0, 16).replace('T', ' ') : '';
  return {
    ...log,
    title: log.summary || actionLabel(log.action),
    actionText: actionLabel(log.action),
    targetText: target || '未标记对象',
    actorText: log.actorName ? `操作人：${log.actorName}` : (log.actorUserId ? `操作人：${log.actorUserId}` : '系统记录'),
    timeText,
    metadataText,
    hasMetadata: metadataText !== '无详情',
  };
}

function actionLabel(action) {
  return actionLabels[action] || action || '审计记录';
}

function targetLabel(targetType) {
  const labels = {
    game: '比赛',
    user: '用户',
    player: '球员',
    event: '接龙',
    tournament: '赛事',
    site_setting: '系统设置',
    bind_request: '绑定申请',
    hall_of_fame: '名人堂',
    notification: '通知',
  };
  return labels[targetType] || targetType || '';
}

function formatMetadata(metadata) {
  if (!metadata || !Object.keys(metadata).length) return '无详情';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch (_) {
    return String(metadata);
  }
}
