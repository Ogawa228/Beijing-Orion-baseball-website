const api = require('../../utils/request');
const { showError, toast } = require('../../utils/format');
const nav = require('../../utils/nav');

const ADMIN_GAME_PAGE_LIMIT = 80;
const POINT_GAME_SEARCH_LIMIT = 40;
const ADMIN_EVENT_PAGE_LIMIT = 60;
const ADMIN_TOURNAMENT_PAGE_LIMIT = 30;
const ADMIN_USER_PAGE_LIMIT = 50;
const ADMIN_PLAYER_PAGE_LIMIT = 50;
const ADMIN_INVITE_USER_PAGE_LIMIT = 50;
const ADMIN_BIND_CODE_PAGE_LIMIT = 50;
const ADMIN_RECORD_PAGE_LIMIT = 8;

const permissionLabels = {
  'bind_requests:review': '绑定审批',
  'players:write': '球员档案',
  'players:display_write': '展示资料',
  'games:write': '比赛数据',
  'games:draft': '比赛草稿',
  'games:confirm': '比赛入库',
  'games:revise': '比赛修订',
  'games:cover_write': '比赛封面',
  'events:write': '队内接龙',
  'tournaments:write': '赛事管理',
  'attendances:write': '补录签到',
  'points:write': '积分调整',
  'hof:write': '名人堂',
  'highlights:write': '精彩时刻',
  'notifications:write': '站内通知',
  'bind_codes:manage': '绑定邀请',
  'users:read': '账号列表',
  'users:grant_admin': '权限管理',
  'users:password_reset': '密码重置',
  'users:app_connect_code': '网页关联码',
  'users:bind_direct': '直接绑定',
  'audit:read': '审计日志',
  'audit:game_read': '比赛审计',
  'destructive:delete': '高危删除',
  'system:settings': '系统设置',
};

const attendanceKinds = [
  { label: '🏋️ 训练签到', value: 'training' },
  { label: '📅 活动出席', value: 'event' },
];

const eventTagFilterOptions = [
  { label: '全部接龙', value: '' },
  { label: '🏋️ 训练', value: 'training' },
  { label: '⚾ 比赛', value: 'game' },
  { label: '🏆 杯赛/联赛', value: 'tournament' },
  { label: '📅 活动', value: 'event' },
];

const adminLevelOptions = [
  { label: '普通队员', value: '' },
  { label: 'C 组员级', value: 'C' },
  { label: 'B 队长级', value: 'B' },
  { label: 'A 全站级', value: 'A' },
];

const adminIdentityFilterOptions = [
  { label: '全部身份', value: '' },
  { label: '管理员', value: 'admin' },
  { label: 'A 级', value: 'A' },
  { label: 'B 级', value: 'B' },
  { label: 'C 级', value: 'C' },
  { label: '普通队员', value: 'normal' },
];

const adminGroupFilterOptions = [
  { label: '全部权限组', value: '' },
  { label: '数据组', value: 'data' },
  { label: '运营组', value: 'ops' },
  { label: '数据+运营', value: 'data_ops' },
  { label: '无权限组', value: 'none' },
];

const adminPositionFilterOptions = [
  { label: '全部位置', value: '' },
  { label: '投手', value: 'pitcher' },
  { label: '捕手', value: 'catcher' },
  { label: '内野手', value: 'infield' },
  { label: '外野手', value: 'outfield' },
  { label: '未设位置', value: 'unset' },
];

const adminBindFilterOptions = [
  { label: '全部绑定', value: '' },
  { label: '已绑定球员', value: 'bound' },
  { label: '未绑定账号', value: 'unbound' },
];

const adminUserSortOptions = [
  { label: '最近活跃 ↓', value: 'recent' },
  { label: '最早注册 ↑', value: 'created' },
  { label: '昵称 A-Z', value: 'name' },
];

const tournamentTypeOptions = [
  { label: '🏆 杯赛', value: 'cup' },
  { label: '🏅 联赛', value: 'league' },
  { label: '🏋️ 训练赛', value: 'training' },
  { label: '🤝 友谊赛', value: 'friendly' },
];

const tournamentSportOptions = [
  { label: '🥎 慢垒', value: 'softball' },
  { label: '⚾ 棒球', value: 'baseball' },
  { label: '⚾🥎 综合', value: 'mixed' },
];

const playerCreateLevelOptions = [
  { label: '试训队员', value: 'casual' },
  { label: '正式球员', value: 'verified' },
];

const playerPoolLevelOptions = [
  { label: '全部球员', value: '' },
  { label: '正式球员', value: 'verified' },
  { label: '试训队员', value: 'casual' },
];

const bindRequestStatusOptions = [
  { label: '待审核', value: 'pending', emptyText: '暂无待审绑定申请' },
  { label: '全部申请', value: '', emptyText: '暂无绑定申请' },
  { label: '已通过', value: 'approved', emptyText: '暂无已通过申请' },
  { label: '已驳回', value: 'rejected', emptyText: '暂无已驳回申请' },
];

const starfieldDefaults = {
  formation: 'scatter',
  path: 'or',
  year: '2026',
  yearLimit: 84,
  particleMode: 'auto',
  particleDensity: 1,
  particleBrightness: 1,
  particleRadius: 1,
  particleStrength: 1,
  particleReturn: 1,
  pathDuration: 13.6,
  breatheDuration: 10.8,
  sway: 1,
  spread: 1,
  randomSeed: 17,
};

const starfieldPresetOptions = [
  { label: '自定义设置', value: 'custom' },
  { label: 'OR 灯阵', value: 'slow-or', settings: { formation: 'scatter', path: 'or', pathDuration: 13.6, breatheDuration: 10.8, sway: 1, spread: 1, randomSeed: 17 } },
  { label: '星河散列', value: 'nebula', settings: { formation: 'scatter', path: 'wave', pathDuration: 16.2, breatheDuration: 12.6, sway: .7, spread: 1.08, randomSeed: 31 } },
  { label: '螺旋升空', value: 'spiral', settings: { formation: 'spiral', path: 'spiral', pathDuration: 9.4, breatheDuration: 8.6, sway: 1.35, spread: 1, randomSeed: 43 } },
  { label: '环形巡航', value: 'orbit', settings: { formation: 'orbit', path: 'orbit', pathDuration: 11.2, breatheDuration: 12, sway: .9, spread: .96, randomSeed: 59 } },
  { label: '斜翼队列', value: 'wing', settings: { formation: 'vline', path: 'wave', pathDuration: 7.8, breatheDuration: 9.2, sway: 1.18, spread: 1.02, randomSeed: 71 } },
  { label: '年份 2026', value: 'year-2026', settings: { formation: 'year', year: '2026', yearLimit: 84, path: 'wave', pathDuration: 12.4, breatheDuration: 11.2, sway: .82, spread: .98, randomSeed: 86 } },
  { label: '棒球场钻石', value: 'baseball-diamond', settings: { formation: 'diamond', path: 'wave', pathDuration: 10.6, breatheDuration: 10.4, sway: .86, spread: 1, randomSeed: 29 } },
];

const starfieldFormationOptions = [
  { label: '✨ 星河散列', value: 'scatter' },
  { label: '🌌 猎户星座', value: 'orion' },
  { label: '🌀 螺旋升空', value: 'spiral' },
  { label: '🪐 环形巡航', value: 'orbit' },
  { label: '💎 棒球钻石', value: 'diamond' },
  { label: '📐 斜翼队列', value: 'vline' },
  { label: '🔢 年份队形', value: 'year' },
  { label: '🎲 随机队形', value: 'random' },
];

const starfieldPathOptions = [
  { label: 'OR 路径', value: 'or' },
  { label: '波浪路径', value: 'wave' },
  { label: '环形路径', value: 'orbit' },
  { label: '螺旋路径', value: 'spiral' },
  { label: '随机路径', value: 'random' },
  { label: '静态停靠', value: 'none' },
];

const starfieldParticleModeOptions = [
  { label: '自动适配', value: 'auto' },
  { label: '网页 WebGL', value: 'webgl' },
  { label: '网页 CSS', value: 'css' },
  { label: '关闭粒子', value: 'off' },
];

Page({
  data: {
    user: null,
    isAdmin: false,
    permissionChips: [],
    canManageUsers: false,
    canCreateAppConnectCode: false,
    canResetPassword: false,
    canBindDirect: false,
    canDeleteUsers: false,
    canWritePlayers: false,
    canManageEvents: false,
    canManageSiteSettings: false,
    canDeleteTournaments: false,
    starfieldSetting: null,
    starfieldUpdatedText: '未读取',
    starfieldPresetOptions,
    starfieldPresetIndex: 0,
    starfieldPresetLabel: starfieldPresetOptions[0].label,
    starfieldFormationOptions,
    starfieldFormationIndex: 0,
    starfieldFormationLabel: starfieldFormationOptions[0].label,
    starfieldPathOptions,
    starfieldPathIndex: 0,
    starfieldPathLabel: starfieldPathOptions[0].label,
    starfieldParticleModeOptions,
    starfieldParticleModeIndex: 0,
    starfieldParticleModeLabel: starfieldParticleModeOptions[0].label,
    starfieldYear: starfieldDefaults.year,
    starfieldYearLimit: starfieldDefaults.yearLimit,
    starfieldPathDuration: starfieldDefaults.pathDuration,
    starfieldBreatheDuration: starfieldDefaults.breatheDuration,
    starfieldSway: starfieldDefaults.sway,
    starfieldSpread: starfieldDefaults.spread,
    starfieldRandomSeed: starfieldDefaults.randomSeed,
    starfieldParticleDensity: starfieldDefaults.particleDensity,
    starfieldParticleBrightness: starfieldDefaults.particleBrightness,
    starfieldParticleRadius: starfieldDefaults.particleRadius,
    starfieldParticleStrength: starfieldDefaults.particleStrength,
    starfieldParticleReturn: starfieldDefaults.particleReturn,
    events: [],
    eventSearch: '',
    eventTagFilterOptions,
    eventTagFilterIndex: 0,
    eventTagFilterLabel: eventTagFilterOptions[0].label,
    visibleBatchEvents: [],
    selectedEventIds: [],
    selectedEventCount: 0,
    eventsHasMore: false,
    eventsNextOffset: 0,
    loadingMoreEvents: false,
    eventDeleteConfirmText: '',
    adminUsers: [],
    adminUsersHasMore: false,
    adminUsersNextOffset: 0,
    loadingMoreAdminUsers: false,
    adminIdentityFilterOptions,
    adminIdentityFilterIndex: 0,
    adminIdentityFilterLabel: adminIdentityFilterOptions[0].label,
    adminGroupFilterOptions,
    adminGroupFilterIndex: 0,
    adminGroupFilterLabel: adminGroupFilterOptions[0].label,
    adminPositionFilterOptions,
    adminPositionFilterIndex: 0,
    adminPositionFilterLabel: adminPositionFilterOptions[0].label,
    adminBindFilterOptions,
    adminBindFilterIndex: 0,
    adminBindFilterLabel: adminBindFilterOptions[0].label,
    adminUserSortOptions,
    adminUserSortIndex: 0,
    adminUserSortLabel: adminUserSortOptions[0].label,
    adminUserSearch: '',
    adminUserFilterSummary: '0/0 个账号',
    adminUserOptions: [{ id: '', label: '请选择账号' }],
    adminUserIndex: 0,
    adminUserLabel: '请选择账号',
    adminUserMeta: '',
    appConnectCode: '',
    resetPasswordValue: '',
    deleteConfirmText: '',
    directBindPlayerOptions: [{ id: '', label: '请选择正式球员' }],
    directBindPlayerIndex: 0,
    directBindPlayerLabel: '请选择正式球员',
    adminLevelOptions,
    adminLevelIndex: 0,
    adminLevelLabel: adminLevelOptions[0].label,
    adminGroupOptions: buildAdminGroupOptions([]),
    adminGroupValues: [],
    canManageTournaments: false,
    canDeleteGames: false,
    tournaments: [],
    tournamentOptions: [{ id: '', label: '新建赛事' }],
    tournamentIndex: 0,
    tournamentLabel: '新建赛事',
    tournamentHasMore: false,
    tournamentNextOffset: 0,
    loadingMoreTournaments: false,
    tournamentTypeOptions,
    tournamentTypeIndex: 0,
    tournamentTypeLabel: tournamentTypeOptions[0].label,
    tournamentSportOptions,
    tournamentSportIndex: 0,
    tournamentSportLabel: tournamentSportOptions[0].label,
    tournamentName: '',
    tournamentShortName: '',
    tournamentSeason: '',
    tournamentLocation: '',
    tournamentStartDate: '',
    tournamentEndDate: '',
    tournamentCover: '',
    tournamentCoverUploadText: '',
    uploadingTournamentCover: false,
    tournamentDescription: '',
    tournamentDeleteConfirmText: '',
    canMoveGames: false,
    games: [],
    gameMoveTournamentOptions: [{ id: '', label: '请选择目标赛事' }],
    gameMoveTournamentIndex: 0,
    gameMoveTournamentLabel: '请选择目标赛事',
    gameFilterOptions: [{ id: '', label: '全部比赛' }],
    gameFilterIndex: 0,
    gameFilterLabel: '全部比赛',
    visibleBatchGames: [],
    selectedGameIds: [],
    selectedGameCount: 0,
    gamesHasMore: false,
    gamesNextOffset: 0,
    loadingMoreGames: false,
    gameDeleteConfirmText: '',
    players: [],
    playersHasMore: false,
    playersNextOffset: 0,
    loadingMorePlayers: false,
    playerOptions: [],
    playerIndex: 0,
    playerLabel: '请选择球员',
    playerPoolLevelOptions,
    playerPoolLevelIndex: 0,
    playerPoolLevelLabel: playerPoolLevelOptions[0].label,
    playerPoolSearch: '',
    visiblePlayerPool: [],
    playerPoolSummary: '0/0 名球员',
    playerCreateLevelOptions,
    createPlayerLevelIndex: 0,
    createPlayerLevelLabel: playerCreateLevelOptions[0].label,
    createPlayerName: '',
    createPlayerNumber: '',
    createPlayerPosition: '',
    createPlayerBats: '',
    createPlayerThrows: '',
    createPlayerJoinYear: '',
    createPlayerSlogan: '',
    createPlayerTitles: '',
    createPlayerAliases: '',
    createPlayerPhoto: '',
    createPlayerPhotoUploadText: '',
    uploadingCreatePlayerPhoto: false,
    createPlayerResultText: '',
    batchPlayerLevelIndex: 0,
    batchPlayerLevelLabel: playerCreateLevelOptions[0].label,
    batchPlayerText: '',
    batchPlayerPhotos: {},
    batchPlayerPhotoCount: 0,
    batchPlayerPhotoText: '',
    uploadingBatchPlayerPhotos: false,
    batchPlayerResultText: '',
    mergeSourceOptions: [{ id: '', label: '请选择要并入的球员' }],
    mergeSourceIndex: 0,
    mergeSourceLabel: '请选择要并入的球员',
    mergeTargetOptions: [{ id: '', label: '请选择保留的球员档案' }],
    mergeTargetIndex: 0,
    mergeTargetLabel: '请选择保留的球员档案',
    mergeKeepAliasValues: ['keep'],
    mergePreviewText: '选择源球员和目标球员后，会显示合并影响。',
    mergeResultText: '',
    stats: [
      { label: '待审绑定', value: 0 },
      { label: '正式球员', value: 0 },
      { label: '试训队员', value: 0 },
      { label: '近期接龙', value: 0 },
      { label: '待审时刻', value: 0 },
    ],
    pendingRequests: [],
    bindRequestStatusOptions,
    bindRequestStatusIndex: 0,
    bindRequestStatusLabel: bindRequestStatusOptions[0].label,
    bindRequestEmptyText: bindRequestStatusOptions[0].emptyText,
    reviewNote: '',
    canReadAudit: false,
    canWritePoints: false,
    canWriteAttendances: false,
    canViewPointsOverview: false,
    auditLogs: [],
    pointAdjustments: [],
    attendanceRecords: [],
    leaderboardOverview: [],
    canBindInvite: false,
    canManageBindCodes: false,
    inviteUsers: [],
    inviteUsersHasMore: false,
    inviteUsersNextOffset: 0,
    loadingMoreInviteUsers: false,
    inviteUserOptions: [{ id: '', label: '请选择用户' }],
    inviteUserIndex: 0,
    inviteUserLabel: '请选择用户',
    invitePlayerOptions: [{ id: '', label: '请选择正式球员' }],
    invitePlayerIndex: 0,
    invitePlayerLabel: '请选择正式球员',
    inviteMessage: '',
    inviteCode: '',
    bindCodes: [],
    bindCodesHasMore: false,
    bindCodesNextOffset: 0,
    loadingMoreBindCodes: false,
    visibleBindCodes: [],
    bindCodeSearch: '',
    bindCodePlayerOptions: [{ id: '', label: '请选择正式球员' }],
    bindCodePlayerIndex: 0,
    bindCodePlayerLabel: '请选择正式球员',
	    generatedBindCode: '',
	    pointDelta: '',
	    pointReason: '',
	    pointGameSearch: '',
	    pointGameCandidateGames: [],
	    pointGameOptions: [{ id: '', label: '不关联具体比赛' }],
	    pointGameIndex: 0,
	    pointGameId: '',
	    pointGameLabel: '不关联具体比赛',
	    pointGameMeta: '该调整不会出现在某场比赛链接中',
	    attendanceKinds,
	    attendanceKindIndex: 0,
	    attendanceKindLabel: attendanceKinds[0].label,
	    attendanceDate: new Date().toISOString().slice(0, 10),
	    attendanceNote: '',
	    attendancePlayerSearch: '',
	    selectedAttendancePlayerIds: [],
	    visibleAttendancePlayers: [],
	    attendanceSelectedCount: 0,
	    attendanceSelectionSummary: '未勾选时使用上方选中球员',
	    attendanceSubmitLabel: '补录上方选中球员',
	    hofYear: String(new Date().getFullYear()),
    hofReason: '',
    loading: true,
    saving: false,
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const me = await api.get('/auth/me');
      getApp().setIdentity(me);
      const user = me.user || null;
      const isAdmin = canUseAdmin(user);
      if (!user) {
        this.setData({ user: null, isAdmin: false, loading: false });
        wx.navigateTo({ url: '/pages/login/login' });
        return;
      }
      if (!isAdmin) {
        this.setData({ user, isAdmin: false, loading: false });
        return;
      }
      const canBindInvite = hasPermission(user, 'bind_codes:manage');
      const canReadAudit = hasPermission(user, 'audit:read') || hasPermission(user, 'audit:game_read');
      const canWritePoints = hasPermission(user, 'points:write');
      const canWriteAttendances = hasPermission(user, 'attendances:write');
      const canViewPointsOverview = canWritePoints || canWriteAttendances;
      const canManageUsers = hasPermission(user, 'users:read') && hasPermission(user, 'users:grant_admin');
      const canCreateAppConnectCode = hasPermission(user, 'users:read') && hasPermission(user, 'users:app_connect_code');
      const canResetPassword = hasPermission(user, 'users:read') && hasPermission(user, 'users:password_reset');
      const canBindDirect = hasPermission(user, 'users:read') && hasPermission(user, 'users:bind_direct');
      const canDeleteUsers = hasPermission(user, 'users:read') && hasPermission(user, 'destructive:delete');
      const canWritePlayers = hasPermission(user, 'players:write');
      const canManageEvents = hasPermission(user, 'events:write');
      const canManageSiteSettings = hasPermission(user, 'system:settings');
      const selectedMergeSourceId = (this.data.mergeSourceOptions[this.data.mergeSourceIndex] || {}).id || '';
      const selectedMergeTargetId = (this.data.mergeTargetOptions[this.data.mergeTargetIndex] || {}).id || '';
      const selectedAdminUserId = (this.data.adminUserOptions[this.data.adminUserIndex] || {}).id || '';
      const canManageTournaments = hasPermission(user, 'tournaments:write');
      const canMoveGames = hasPermission(user, 'games:revise');
      const canDeleteGames = canMoveGames && hasPermission(user, 'destructive:delete');
      const canDeleteTournaments = canManageTournaments && hasPermission(user, 'destructive:delete');
      const selectedTournamentId = (this.data.tournamentOptions[this.data.tournamentIndex] || {}).id || '';
      const selectedGameTargetId = (this.data.gameMoveTournamentOptions[this.data.gameMoveTournamentIndex] || {}).id || '';
      const selectedGameFilterId = (this.data.gameFilterOptions[this.data.gameFilterIndex] || {}).id || '';
	      const selectedBindCodePlayerId = (this.data.bindCodePlayerOptions[this.data.bindCodePlayerIndex] || {}).id || '';
	      const selectedPlayerId = currentPlayerId(this.data);
	      const playerPoolLevel = (this.data.playerPoolLevelOptions[this.data.playerPoolLevelIndex] || playerPoolLevelOptions[0]).value;
	      const selectedPointGameId = this.data.pointGameId || '';

      const bindRequestStatus = currentBindRequestStatus(this.data);
      const bindRequestParams = bindRequestStatus
        ? { status: bindRequestStatus, limit: 30 }
        : { limit: 60 };
      const [bindRes, pendingBindRes, playersRes, eventsRes, highlightsRes, inviteRes, bindCodesRes, auditRes, usersRes, tournamentsRes, gamesRes, siteSettingRes, leaderboardRes] = await Promise.all([
        api.get('/admin/bind-requests', bindRequestParams).catch(() => ({ requests: [] })),
        bindRequestStatus === 'pending'
          ? Promise.resolve(null)
          : api.get('/admin/bind-requests', { status: 'pending', limit: 30 }).catch(() => ({ requests: [] })),
        api.get('/players', adminPlayerParams(0)).catch(() => ({ players: [], hasMore: false, nextOffset: 0 })),
        canManageEvents
          ? api.get('/events', { limit: ADMIN_EVENT_PAGE_LIMIT, offset: 0 }).catch(() => ({ events: [], hasMore: false, nextOffset: 0 }))
          : Promise.resolve({ events: [] }),
        api.get('/highlights', { status: 'pending', limit: 1, includeTotal: 'true' }).catch(() => ({ highlights: [], total: 0 })),
        canBindInvite
          ? api.get('/admin/bind-invitation-options', { limit: ADMIN_INVITE_USER_PAGE_LIMIT, offset: 0, includePlayers: 'false' }).catch(() => ({ users: [], players: [] }))
          : Promise.resolve({ users: [], players: [] }),
        canBindInvite
          ? api.get('/bind-codes', { limit: ADMIN_BIND_CODE_PAGE_LIMIT, offset: 0 }).catch(() => ({ bindCodes: [] }))
          : Promise.resolve({ bindCodes: [] }),
        canReadAudit
          ? api.get('/admin/audit-logs', { limit: 20 }).catch(() => ({ logs: [] }))
          : Promise.resolve({ logs: [] }),
        canManageUsers || canCreateAppConnectCode || canResetPassword || canBindDirect || canDeleteUsers
          ? api.get('/admin/users', { limit: ADMIN_USER_PAGE_LIMIT, offset: 0 }).catch(() => ({ users: [], hasMore: false, nextOffset: 0 }))
          : Promise.resolve({ users: [], hasMore: false, nextOffset: 0 }),
	        canManageTournaments || canMoveGames || canWritePoints
	          ? api.get('/tournaments', { limit: ADMIN_TOURNAMENT_PAGE_LIMIT, offset: 0 }).catch(() => ({ tournaments: [], hasMore: false, nextOffset: 0 }))
	          : Promise.resolve({ tournaments: [] }),
	        canMoveGames || canWritePoints
	          ? api.get('/games', { includeAggregate: false, limit: ADMIN_GAME_PAGE_LIMIT, offset: 0 }).catch(() => ({ games: [], hasMore: false, nextOffset: 0 }))
	          : Promise.resolve({ games: [] }),
        canManageSiteSettings
          ? api.get('/site-settings/players-starfield').catch(() => ({ setting: null }))
          : Promise.resolve({ setting: null }),
        canViewPointsOverview
          ? api.get('/leaderboard', { limit: 3 }).catch(() => ({ leaderboard: [] }))
          : Promise.resolve({ leaderboard: [] }),
      ]);
      const players = playersRes.players || [];
      const playerOptions = buildPlayerOptions(players);
      let playerIndex = pickBlankableOptionIndex(playerOptions, selectedPlayerId);
      if (!selectedPlayerId && playerOptions.length > 1) playerIndex = 1;
      const activePlayer = selectedPlayerFromOptions(players, playerOptions, playerIndex);
      const [adjustmentsRes, attendanceRes] = await Promise.all([
        canWritePoints && activePlayer
          ? api.get('/points-adjustments', { playerId: activePlayer.id, limit: ADMIN_RECORD_PAGE_LIMIT }).catch(() => ({ adjustments: [] }))
          : Promise.resolve({ adjustments: [] }),
        canWriteAttendances && activePlayer
          ? api.get('/attendances', { playerId: activePlayer.id, limit: ADMIN_RECORD_PAGE_LIMIT }).catch(() => ({ attendances: [] }))
          : Promise.resolve({ attendances: [] }),
      ]);
      const mergeState = buildMergeState({
        players,
        sourceId: selectedMergeSourceId,
        targetId: selectedMergeTargetId,
        keepAlias: (this.data.mergeKeepAliasValues || []).includes('keep'),
      });
      const directBindPlayerOptions = buildInvitePlayerOptions(players.filter(player => player.level === 'verified'));
      const adminUsers = usersRes.users || [];
      const adminFilters = currentAdminUserFilters(this.data);
      const adminUserOptions = buildAdminUserOptions(adminUsers, adminFilters);
      const adminUserIndex = pickOptionIndex(adminUserOptions, selectedAdminUserId);
      const selectedAdminUser = selectedAdminUserFromOptions(adminUsers, adminUserOptions, adminUserIndex);
      const adminState = buildAdminPermissionState(selectedAdminUser, adminUserIndex, adminUserOptions[adminUserIndex]?.label);
      const directBindState = buildDirectBindState(selectedAdminUser, directBindPlayerOptions);
      const firstPageTournaments = tournamentsRes.tournaments || [];
      let tournaments = firstPageTournaments;
      const selectedTournamentIds = [
        selectedTournamentId,
        selectedGameTargetId,
        selectedGameFilterId && selectedGameFilterId !== '__unassigned' ? selectedGameFilterId : '',
      ].filter(Boolean);
      const missingTournamentIds = selectedTournamentIds.filter(id => !firstPageTournaments.some(tournament => tournament.id === id));
      if (missingTournamentIds.length) {
        const detailResults = await Promise.all(missingTournamentIds.map(id => (
          api.get(`/tournaments/${id}`).catch(() => ({ tournament: null }))
        )));
        const detailTournaments = detailResults.map(item => item.tournament).filter(Boolean);
        tournaments = mergeTournamentsById(detailTournaments, firstPageTournaments);
      }
      const tournamentOptions = buildTournamentOptions(tournaments);
      const tournamentIndex = pickOptionIndex(tournamentOptions, selectedTournamentId);
      const selectedTournament = selectedTournamentFromOptions(tournaments, tournamentOptions, tournamentIndex);
      const tournamentState = buildTournamentState(selectedTournament, tournamentIndex, tournamentOptions[tournamentIndex]?.label);
	      const games = gamesRes.games || [];
	      const gameBatchState = buildGameBatchState({
	        games,
	        tournaments,
	        selectedGameIds: this.data.selectedGameIds,
	        targetId: selectedGameTargetId,
	        filterId: selectedGameFilterId,
	      });
	      const pointGameState = buildPointGameState({
	        games: mergeGamesById(games, this.data.pointGameCandidateGames || []),
	        tournaments,
	        selectedId: selectedPointGameId,
	        query: this.data.pointGameSearch,
	      });
      const inviteUserOptions = buildInviteUserOptions(inviteRes.users || []);
      const invitePlayerOptions = buildInvitePlayerOptions((inviteRes.players || []).length
        ? inviteRes.players
        : players.filter(player => player.level === 'verified'));
      const inviteUserIndex = inviteUserOptions.length > 1 ? 1 : 0;
      const invitePlayerIndex = invitePlayerOptions.length > 1 ? 1 : 0;
      const bindCodes = bindCodesRes.bindCodes || [];
      const bindCodePlayerOptions = buildBindCodePlayerOptions(players);
      const bindCodePlayerIndex = pickBlankableOptionIndex(bindCodePlayerOptions, selectedBindCodePlayerId);
      const events = eventsRes.events || [];
      const eventBatchState = buildEventBatchState({
        events,
        selectedEventIds: this.data.selectedEventIds,
        query: this.data.eventSearch,
        tag: currentEventTagFilter(this.data),
      });
      const starfieldState = buildStarfieldState(siteSettingRes.setting);
      this.setData({
        user,
        isAdmin,
        canBindInvite,
        canManageBindCodes: canBindInvite,
        canReadAudit,
        canManageUsers,
        canCreateAppConnectCode,
        canResetPassword,
        canBindDirect,
        canDeleteUsers,
        canWritePlayers,
        canManageEvents,
        canManageSiteSettings,
        ...starfieldState,
        canWritePoints,
        canWriteAttendances,
        canViewPointsOverview,
        canManageTournaments,
        canMoveGames,
        canDeleteGames,
        canDeleteTournaments,
        adminUsers,
        adminUsersHasMore: !!usersRes.hasMore,
        adminUsersNextOffset: normalizeNextOffset(usersRes.nextOffset, adminUsers.length),
        adminUserOptions,
        adminUserFilterSummary: adminUserFilterSummary(adminUserOptions, adminUsers, !!usersRes.hasMore),
        ...adminState,
        appConnectCode: '',
        resetPasswordValue: '',
        deleteConfirmText: '',
        directBindPlayerOptions,
        ...directBindState,
        tournaments,
        tournamentHasMore: !!tournamentsRes.hasMore,
        tournamentNextOffset: normalizeNextOffset(tournamentsRes.nextOffset, firstPageTournaments.length),
        tournamentOptions,
        ...tournamentState,
	        games,
	        gamesHasMore: !!gamesRes.hasMore,
	        gamesNextOffset: normalizeNextOffset(gamesRes.nextOffset, games.length),
	        ...gameBatchState,
	        ...pointGameState,
	        gameDeleteConfirmText: '',
        auditLogs: (auditRes.logs || []).map(formatAuditLog),
        permissionChips: permissionChips(user),
	        players,
	        playersHasMore: !!playersRes.hasMore,
	        playersNextOffset: normalizeNextOffset(playersRes.nextOffset, players.length),
	        playerOptions,
	        visiblePlayerPool: buildVisiblePlayerPool(players, this.data.playerPoolSearch, playerPoolLevel),
	        playerPoolSummary: playerPoolSummary(players, this.data.playerPoolSearch, playerPoolLevel, !!playersRes.hasMore),
	        ...buildAttendanceSelectionState({
	          players,
	          selectedAttendancePlayerIds: this.data.selectedAttendancePlayerIds,
	          query: this.data.attendancePlayerSearch,
	        }),
	        ...mergeState,
        playerIndex,
        playerLabel: (playerOptions[playerIndex] || playerOptions[0] || {}).label || '请选择球员',
        leaderboardOverview: formatLeaderboardOverview(leaderboardRes.leaderboard || []),
        pointAdjustments: formatPointAdjustments(adjustmentsRes.adjustments || []),
        attendanceRecords: formatAttendanceRecords(attendanceRes.attendances || []),
        inviteUsers: inviteRes.users || [],
        inviteUsersHasMore: !!inviteRes.usersHasMore,
        inviteUsersNextOffset: normalizeNextOffset(inviteRes.usersNextOffset, (inviteRes.users || []).length),
        inviteUserOptions,
        inviteUserIndex,
        inviteUserLabel: inviteUserOptions[inviteUserIndex].label,
        invitePlayerOptions,
        invitePlayerIndex,
        invitePlayerLabel: invitePlayerOptions[invitePlayerIndex].label,
        bindCodes,
        bindCodesHasMore: !!bindCodesRes.hasMore,
        bindCodesNextOffset: normalizeNextOffset(bindCodesRes.nextOffset, bindCodes.length),
        events,
        eventsHasMore: !!eventsRes.hasMore,
        eventsNextOffset: normalizeNextOffset(eventsRes.nextOffset, events.length),
        ...eventBatchState,
        eventDeleteConfirmText: '',
        bindCodePlayerOptions,
        bindCodePlayerIndex,
        bindCodePlayerLabel: (bindCodePlayerOptions[bindCodePlayerIndex] || bindCodePlayerOptions[0]).label,
        visibleBindCodes: buildVisibleBindCodes(bindCodes, players, this.data.bindCodeSearch),
        pendingRequests: (bindRes.requests || []).map(formatBindRequest),
        bindRequestStatusLabel: optionLabel(bindRequestStatusOptions, this.data.bindRequestStatusIndex),
        bindRequestEmptyText: (bindRequestStatusOptions[this.data.bindRequestStatusIndex] || bindRequestStatusOptions[0]).emptyText,
        stats: buildStats(
          pendingBindRes ? (pendingBindRes.requests || []) : (bindRes.requests || []),
          players,
          eventsRes.events || [],
          highlightsRes.highlights || [],
          highlightsRes.total
        ),
      });
    } catch (err) {
      showError(err, '管理台加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  go(e) {
    nav.go(e.currentTarget.dataset.url);
  },

  onReviewNoteInput(e) {
    this.setData({ reviewNote: e.detail.value });
  },

  async onBindRequestStatusChange(e) {
    const bindRequestStatusIndex = Number(e.detail.value || 0);
    const option = bindRequestStatusOptions[bindRequestStatusIndex] || bindRequestStatusOptions[0];
    this.setData({
      bindRequestStatusIndex,
      bindRequestStatusLabel: option.label,
      bindRequestEmptyText: option.emptyText,
    });
    await this.load();
  },

  onAdminUserChange(e) {
    const adminUserIndex = Number(e.detail.value);
    const user = selectedAdminUserFromOptions(this.data.adminUsers, this.data.adminUserOptions, adminUserIndex);
    this.setData({
      ...buildAdminPermissionState(
        user,
        adminUserIndex,
        (this.data.adminUserOptions[adminUserIndex] || this.data.adminUserOptions[0]).label
      ),
      appConnectCode: '',
      resetPasswordValue: '',
      deleteConfirmText: '',
      ...buildDirectBindState(user, this.data.directBindPlayerOptions),
    });
  },

  onAdminIdentityFilterChange(e) {
    this.updateAdminUserFilters({
      adminIdentityFilterIndex: Number(e.detail.value),
    });
  },

  onAdminGroupFilterChange(e) {
    this.updateAdminUserFilters({
      adminGroupFilterIndex: Number(e.detail.value),
    });
  },

  onAdminPositionFilterChange(e) {
    this.updateAdminUserFilters({
      adminPositionFilterIndex: Number(e.detail.value),
    });
  },

  onAdminBindFilterChange(e) {
    this.updateAdminUserFilters({
      adminBindFilterIndex: Number(e.detail.value),
    });
  },

  onAdminUserSortChange(e) {
    this.updateAdminUserFilters({
      adminUserSortIndex: Number(e.detail.value),
    });
  },

  onAdminUserSearchInput(e) {
    this.updateAdminUserFilters({
      adminUserSearch: e.detail.value,
    });
  },

  updateAdminUserFilters(patch = {}) {
    const nextData = { ...this.data, ...patch };
    const currentId = selectedAdminUser(this.data)?.id || '';
    const adminUserOptions = buildAdminUserOptions(nextData.adminUsers, currentAdminUserFilters(nextData));
    const adminUserIndex = pickOptionIndex(adminUserOptions, currentId);
    const user = selectedAdminUserFromOptions(nextData.adminUsers, adminUserOptions, adminUserIndex);
    this.setData({
      ...patch,
      adminIdentityFilterLabel: optionLabel(adminIdentityFilterOptions, nextData.adminIdentityFilterIndex),
      adminGroupFilterLabel: optionLabel(adminGroupFilterOptions, nextData.adminGroupFilterIndex),
      adminPositionFilterLabel: optionLabel(adminPositionFilterOptions, nextData.adminPositionFilterIndex),
      adminBindFilterLabel: optionLabel(adminBindFilterOptions, nextData.adminBindFilterIndex),
      adminUserSortLabel: optionLabel(adminUserSortOptions, nextData.adminUserSortIndex),
      adminUserOptions,
      adminUserFilterSummary: adminUserFilterSummary(adminUserOptions, nextData.adminUsers, nextData.adminUsersHasMore),
      ...buildAdminPermissionState(
        user,
        adminUserIndex,
        (adminUserOptions[adminUserIndex] || adminUserOptions[0] || {}).label
      ),
      appConnectCode: '',
      resetPasswordValue: '',
      deleteConfirmText: '',
      ...buildDirectBindState(user, nextData.directBindPlayerOptions),
    });
  },

  async loadMoreAdminUsers() {
    if (!this.data.adminUsersHasMore || this.data.loadingMoreAdminUsers) return;
    const currentId = selectedAdminUser(this.data)?.id || '';
    const offset = this.data.adminUsersNextOffset || Math.max(0, (this.data.adminUsers || []).length);
    this.setData({ loadingMoreAdminUsers: true });
    try {
      const res = await api.get('/admin/users', { limit: ADMIN_USER_PAGE_LIMIT, offset });
      const adminUsers = mergeAdminUsersById(this.data.adminUsers || [], res.users || []);
      const adminUserOptions = buildAdminUserOptions(adminUsers, currentAdminUserFilters(this.data));
      const adminUserIndex = pickOptionIndex(adminUserOptions, currentId);
      const user = selectedAdminUserFromOptions(adminUsers, adminUserOptions, adminUserIndex);
      this.setData({
        adminUsers,
        adminUsersHasMore: !!res.hasMore,
        adminUsersNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.users || []).length),
        adminUserOptions,
        adminUserFilterSummary: adminUserFilterSummary(adminUserOptions, adminUsers, !!res.hasMore),
        ...buildAdminPermissionState(
          user,
          adminUserIndex,
          (adminUserOptions[adminUserIndex] || adminUserOptions[0] || {}).label
        ),
        appConnectCode: '',
        resetPasswordValue: '',
        deleteConfirmText: '',
        ...buildDirectBindState(user, this.data.directBindPlayerOptions),
      });
    } catch (err) {
      showError(err, '加载更多账号失败');
    } finally {
      this.setData({ loadingMoreAdminUsers: false });
    }
  },

  onAdminLevelChange(e) {
    const adminLevelIndex = Number(e.detail.value);
    const option = adminLevelOptions[adminLevelIndex] || adminLevelOptions[0];
    let adminGroupValues = this.data.adminGroupValues || [];
    if (option.value === 'A' || option.value === 'B') {
      adminGroupValues = ['data', 'ops'];
    } else if (!option.value) {
      adminGroupValues = [];
    }
    this.setData({
      adminLevelIndex,
      adminLevelLabel: option.label,
      adminGroupValues,
      adminGroupOptions: buildAdminGroupOptions(adminGroupValues),
    });
  },

  onAdminGroupChange(e) {
    const adminGroupValues = e.detail.value || [];
    this.setData({
      adminGroupValues,
      adminGroupOptions: buildAdminGroupOptions(adminGroupValues),
    });
  },

  async saveAdminPermission() {
    if (!this.data.canManageUsers || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    const option = this.data.adminLevelOptions[this.data.adminLevelIndex] || adminLevelOptions[0];
    const adminLevel = option.value || null;
    const adminPermissionGroups = this.data.adminGroupValues || [];
    if (adminLevel === 'C' && !adminPermissionGroups.length) {
      return toast('C 组员级至少选择一个权限组');
    }
    this.setData({ saving: true });
    try {
      await api.patch(`/admin/users/${target.id}/admin-level`, {
        adminLevel,
        adminPermissionGroups,
      });
      toast('权限已更新');
      await this.load();
    } catch (err) {
      showError(err, '权限更新失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async createAdminAppConnectCode() {
    if (!this.data.canCreateAppConnectCode || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    this.setData({ saving: true, appConnectCode: '' });
    try {
      const res = await api.post(`/admin/users/${target.id}/app-connect-code`, {});
      const code = res.code || '';
      this.setData({ appConnectCode: code });
      if (code && wx.setClipboardData) {
        wx.setClipboardData({ data: code });
      }
      toast('网页关联码已生成');
    } catch (err) {
      showError(err, '生成网页关联码失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onResetPasswordInput(e) {
    this.setData({ resetPasswordValue: e.detail.value });
  },

  onDeleteConfirmInput(e) {
    this.setData({ deleteConfirmText: e.detail.value });
  },

  async resetAdminPassword() {
    if (!this.data.canResetPassword || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    const newPassword = String(this.data.resetPasswordValue || '').trim();
    if (newPassword.length < 6) return toast('密码至少 6 位');
    this.setData({ saving: true });
    try {
      await api.post(`/admin/users/${target.id}/reset-password`, { newPassword });
      toast('密码已重置');
      this.setData({ resetPasswordValue: '' });
    } catch (err) {
      showError(err, '重置密码失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onDirectBindPlayerChange(e) {
    const directBindPlayerIndex = Number(e.detail.value);
    const option = this.data.directBindPlayerOptions[directBindPlayerIndex] || this.data.directBindPlayerOptions[0];
    this.setData({ directBindPlayerIndex, directBindPlayerLabel: option.label });
  },

  async bindAdminUserToPlayer() {
    if (!this.data.canBindDirect || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    const player = selectedDirectBindPlayer(this.data);
    if (!player) return toast('请选择正式球员');
    this.setData({ saving: true });
    try {
      await api.post(`/admin/users/${target.id}/bind-player`, { playerId: player.id });
      toast('球员档案已绑定');
      await this.load();
    } catch (err) {
      showError(err, '绑定球员失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async unbindAdminUserFromPlayer() {
    if (!this.data.canBindDirect || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    this.setData({ saving: true });
    try {
      await api.post(`/admin/users/${target.id}/unbind-player`, {});
      toast('已解除绑定');
      await this.load();
    } catch (err) {
      showError(err, '解绑球员失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteAdminUser() {
    if (!this.data.canDeleteUsers || this.data.saving) return;
    const target = selectedAdminUser(this.data);
    if (!target) return toast('请选择账号');
    if (target.id === this.data.user?.id) return toast('不能删除当前账号');
    if (target.isOwner || target.email === 'admin@orion.cn') return toast('不能删除所有者账号');
    if (String(this.data.deleteConfirmText || '').trim() !== '删除账号') {
      return toast('请输入“删除账号”确认');
    }
    this.setData({ saving: true });
    try {
      await api.del(`/admin/users/${target.id}`);
      toast('账号已删除');
      this.setData({ deleteConfirmText: '', appConnectCode: '', resetPasswordValue: '' });
      await this.load();
    } catch (err) {
      showError(err, '删除账号失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onTournamentChange(e) {
    const tournamentIndex = Number(e.detail.value);
    const tournament = selectedTournamentFromOptions(this.data.tournaments, this.data.tournamentOptions, tournamentIndex);
    this.setData({
      ...buildTournamentState(
        tournament,
        tournamentIndex,
        (this.data.tournamentOptions[tournamentIndex] || this.data.tournamentOptions[0]).label
      ),
      tournamentDeleteConfirmText: '',
      tournamentCoverUploadText: '',
      uploadingTournamentCover: false,
    });
  },

  async loadMoreAdminTournaments() {
    if ((!this.data.canManageTournaments && !this.data.canMoveGames && !this.data.canWritePoints) || !this.data.tournamentHasMore || this.data.loadingMoreTournaments) return;
    const selectedTournamentId = (this.data.tournamentOptions[this.data.tournamentIndex] || {}).id || '';
    const targetId = currentGameMoveTournamentId(this.data);
    const filterId = currentGameFilterId(this.data);
    const offset = this.data.tournamentNextOffset || Math.max(0, (this.data.tournaments || []).length);
    this.setData({ loadingMoreTournaments: true });
    try {
      const res = await api.get('/tournaments', { limit: ADMIN_TOURNAMENT_PAGE_LIMIT, offset });
      const tournaments = mergeTournamentsById(this.data.tournaments || [], res.tournaments || []);
      const tournamentOptions = buildTournamentOptions(tournaments);
      const tournamentIndex = pickOptionIndex(tournamentOptions, selectedTournamentId);
      const tournamentLabel = (tournamentOptions[tournamentIndex] || tournamentOptions[0]).label;
      this.setData({
        tournaments,
        tournamentOptions,
        tournamentIndex,
        tournamentLabel,
        tournamentHasMore: !!res.hasMore,
        tournamentNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.tournaments || []).length),
        ...buildGameBatchState({
          games: this.data.games,
          tournaments,
          selectedGameIds: this.data.selectedGameIds,
          targetId,
          filterId,
        }),
	        ...buildPointGameState({
	          games: pointGameSourceGames(this.data),
	          tournaments,
          selectedId: this.data.pointGameId,
          query: this.data.pointGameSearch,
        }),
      });
    } catch (err) {
      showError(err, '加载更多赛事失败');
    } finally {
      this.setData({ loadingMoreTournaments: false });
    }
  },

  onTournamentTypeChange(e) {
    const tournamentTypeIndex = Number(e.detail.value);
    const option = tournamentTypeOptions[tournamentTypeIndex] || tournamentTypeOptions[0];
    this.setData({ tournamentTypeIndex, tournamentTypeLabel: option.label });
  },

  onTournamentSportChange(e) {
    const tournamentSportIndex = Number(e.detail.value);
    const option = tournamentSportOptions[tournamentSportIndex] || tournamentSportOptions[0];
    this.setData({ tournamentSportIndex, tournamentSportLabel: option.label });
  },

  onTournamentNameInput(e) { this.setData({ tournamentName: e.detail.value }); },
  onTournamentShortNameInput(e) { this.setData({ tournamentShortName: e.detail.value }); },
  onTournamentSeasonInput(e) { this.setData({ tournamentSeason: e.detail.value }); },
  onTournamentLocationInput(e) { this.setData({ tournamentLocation: e.detail.value }); },
  onTournamentStartDateChange(e) { this.setData({ tournamentStartDate: e.detail.value }); },
  onTournamentEndDateChange(e) { this.setData({ tournamentEndDate: e.detail.value }); },
  onTournamentCoverInput(e) { this.setData({ tournamentCover: e.detail.value }); },
  onTournamentDescriptionInput(e) { this.setData({ tournamentDescription: e.detail.value }); },
  onTournamentDeleteConfirmInput(e) { this.setData({ tournamentDeleteConfirmText: e.detail.value }); },
  onGameDeleteConfirmInput(e) { this.setData({ gameDeleteConfirmText: e.detail.value }); },
  onEventDeleteConfirmInput(e) { this.setData({ eventDeleteConfirmText: e.detail.value }); },

  async chooseTournamentCover() {
    if (!this.data.canManageTournaments || this.data.uploadingTournamentCover) return;
    this.setData({ uploadingTournamentCover: true, tournamentCoverUploadText: '选择赛事封面中...' });
    try {
      const res = await chooseAndUploadImage('tournament', 'tournament-cover', text => {
        this.setData({ tournamentCoverUploadText: text });
      });
      if (!res) {
        this.setData({ tournamentCoverUploadText: '' });
        return;
      }
      this.setData({
        tournamentCover: res.url || '',
        tournamentCoverUploadText: '已上传赛事封面',
      });
    } catch (err) {
      console.error('[admin] tournament cover upload failed', err);
      this.setData({ tournamentCoverUploadText: '上传失败，可稍后重试' });
      showError(err, '赛事封面上传失败');
    } finally {
      this.setData({ uploadingTournamentCover: false });
    }
  },

  clearTournamentCover() {
    this.setData({
      tournamentCover: '',
      tournamentCoverUploadText: '',
    });
  },

  onStarfieldPresetChange(e) {
    const starfieldPresetIndex = Number(e.detail.value);
    const option = starfieldPresetOptions[starfieldPresetIndex] || starfieldPresetOptions[0];
    if (option.settings) {
      this.setData(buildStarfieldState({
        key: 'players-starfield',
        value: option.settings,
        updatedAt: this.data.starfieldSetting?.updatedAt || null,
        updatedByName: this.data.starfieldSetting?.updatedByName || '',
      }, starfieldPresetIndex));
      return;
    }
    this.setData({
      starfieldPresetIndex,
      starfieldPresetLabel: option.label,
    });
  },

  onStarfieldFormationChange(e) {
    const starfieldFormationIndex = Number(e.detail.value);
    const option = starfieldFormationOptions[starfieldFormationIndex] || starfieldFormationOptions[0];
    this.setData({
      starfieldFormationIndex,
      starfieldFormationLabel: option.label,
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  onStarfieldPathChange(e) {
    const starfieldPathIndex = Number(e.detail.value);
    const option = starfieldPathOptions[starfieldPathIndex] || starfieldPathOptions[0];
    this.setData({
      starfieldPathIndex,
      starfieldPathLabel: option.label,
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  onStarfieldParticleModeChange(e) {
    const starfieldParticleModeIndex = Number(e.detail.value);
    const option = starfieldParticleModeOptions[starfieldParticleModeIndex] || starfieldParticleModeOptions[0];
    this.setData({
      starfieldParticleModeIndex,
      starfieldParticleModeLabel: option.label,
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  onStarfieldYearInput(e) {
    this.setData({
      starfieldYear: String(e.detail.value || '').replace(/[^\d]/g, '').slice(0, 6),
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  onStarfieldRandomSeedInput(e) {
    this.setData({
      starfieldRandomSeed: e.detail.value,
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  onStarfieldSliderChange(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({
      [field]: Number(e.detail.value),
      starfieldPresetIndex: 0,
      starfieldPresetLabel: starfieldPresetOptions[0].label,
    });
  },

  resetStarfieldDefaults() {
    this.setData(buildStarfieldState({
      key: 'players-starfield',
      value: starfieldDefaults,
      updatedAt: this.data.starfieldSetting?.updatedAt || null,
      updatedByName: this.data.starfieldSetting?.updatedByName || '',
      isDefault: true,
    }));
    toast('已恢复默认参数，发布后全站生效');
  },

  async publishStarfieldSettings() {
    if (!this.data.canManageSiteSettings || this.data.saving) return;
    const value = currentStarfieldSettings(this.data);
    const confirmed = await confirmAction('发布星阵', '确认把当前球员页星阵配置发布到全站？网页和壁纸模式会读取同一份配置。', '发布');
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      const res = await api.call('/site-settings/players-starfield', {
        method: 'PUT',
        data: { value },
      });
      this.setData(buildStarfieldState(res.setting || { key: 'players-starfield', value }));
      toast('星阵配置已发布');
    } catch (err) {
      showError(err, '星阵发布失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onEventBatchSelectionChange(e) {
    const eventIds = normalizeSelectedEventIds(e.detail.value || [], this.data.events);
    this.setData(buildEventSelectionState({
      events: this.data.events,
      selectedEventIds: eventIds,
      query: this.data.eventSearch,
      tag: currentEventTagFilter(this.data),
    }));
  },

  selectAllBatchEvents() {
    const eventIds = (this.data.visibleBatchEvents || []).map(event => event.id);
    this.setData(buildEventSelectionState({
      events: this.data.events,
      selectedEventIds: eventIds,
      query: this.data.eventSearch,
      tag: currentEventTagFilter(this.data),
    }));
  },

  clearBatchEvents() {
    this.setData(buildEventSelectionState({
      events: this.data.events,
      selectedEventIds: [],
      query: this.data.eventSearch,
      tag: currentEventTagFilter(this.data),
    }));
  },

  onEventSearchInput(e) {
    const eventSearch = e.detail.value || '';
    this.setData({
      eventSearch,
      ...buildEventSelectionState({
        events: this.data.events,
        selectedEventIds: this.data.selectedEventIds,
        query: eventSearch,
        tag: currentEventTagFilter(this.data),
      }),
    });
  },

  onEventTagFilterChange(e) {
    const eventTagFilterIndex = Number(e.detail.value || 0);
    const option = eventTagFilterOptions[eventTagFilterIndex] || eventTagFilterOptions[0];
    this.setData({
      eventTagFilterIndex,
      eventTagFilterLabel: option.label,
      ...buildEventSelectionState({
        events: this.data.events,
        selectedEventIds: this.data.selectedEventIds,
        query: this.data.eventSearch,
        tag: option.value,
      }),
    });
  },

  openBatchEvent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/events/event-detail/event-detail?id=${id}` });
  },

  editBatchEvent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/events/event-create/event-create?id=${id}` });
  },

  async loadMoreAdminEvents() {
    if (!this.data.canManageEvents || !this.data.eventsHasMore || this.data.loadingMoreEvents) return;
    this.setData({ loadingMoreEvents: true });
    try {
      const res = await api.get('/events', {
        limit: ADMIN_EVENT_PAGE_LIMIT,
        offset: this.data.eventsNextOffset || (this.data.events || []).length,
      });
      const events = mergeEventsById(this.data.events || [], res.events || []);
      this.setData({
        events,
        eventsHasMore: !!res.hasMore,
        eventsNextOffset: normalizeNextOffset(res.nextOffset, events.length),
        ...buildEventBatchState({
          events,
          selectedEventIds: this.data.selectedEventIds,
          query: this.data.eventSearch,
          tag: currentEventTagFilter(this.data),
        }),
      });
    } catch (err) {
      showError(err, '加载更多接龙失败');
    } finally {
      this.setData({ loadingMoreEvents: false });
    }
  },

  async batchDeleteEvents() {
    if (!this.data.canManageEvents || this.data.saving) return;
    const eventIds = this.data.selectedEventIds || [];
    if (!eventIds.length) return toast('请选择要删除的接龙');
    if (String(this.data.eventDeleteConfirmText || '').trim() !== '删除接龙') {
      return toast('请输入“删除接龙”确认');
    }
    const ok = await confirmAction('删除接龙', `确认删除选中的 ${eventIds.length} 条接龙？接龙详情和报名名单会移除，已产生的签到/积分流水不会批量改写。`, '删除');
    if (!ok) return;
    this.setData({ saving: true });
    try {
      for (const id of eventIds) {
        await api.del(`/events/${id}`);
      }
      toast(`已删除 ${eventIds.length} 条接龙`);
      this.setData({
        selectedEventIds: [],
        selectedEventCount: 0,
        eventDeleteConfirmText: '',
      });
      await this.load();
    } catch (err) {
      showError(err, '批量删除接龙失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async saveTournament() {
    if (!this.data.canManageTournaments || this.data.saving) return;
    const name = String(this.data.tournamentName || '').trim();
    if (!name) return toast('请填写赛事全称');
    const type = (this.data.tournamentTypeOptions[this.data.tournamentTypeIndex] || tournamentTypeOptions[0]).value;
    const sport = (this.data.tournamentSportOptions[this.data.tournamentSportIndex] || tournamentSportOptions[0]).value;
    const payload = {
      type,
      sport,
      name,
      shortName: String(this.data.tournamentShortName || '').trim(),
      season: String(this.data.tournamentSeason || '').trim(),
      location: String(this.data.tournamentLocation || '').trim(),
      startDate: this.data.tournamentStartDate || null,
      endDate: this.data.tournamentEndDate || null,
      cover: String(this.data.tournamentCover || '').trim() || null,
      description: String(this.data.tournamentDescription || '').trim() || null,
    };
    const selected = selectedTournament(this.data);
    this.setData({ saving: true });
    try {
      if (selected) {
        await api.patch(`/tournaments/${selected.id}`, payload);
      } else {
        await api.post('/tournaments', payload);
      }
      toast(selected ? '赛事已更新' : '赛事已创建');
      await this.load();
    } catch (err) {
      showError(err, '赛事保存失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteTournament() {
    if (!this.data.canDeleteTournaments || this.data.saving) return;
    const selected = selectedTournament(this.data);
    if (!selected) return toast('请选择要删除的赛事');
    if (String(this.data.tournamentDeleteConfirmText || '').trim() !== '删除赛事') {
      return toast('请输入“删除赛事”确认');
    }
    this.setData({ saving: true });
    try {
      await api.del(`/tournaments/${selected.id}`);
      toast('赛事已删除');
      this.setData({ tournamentDeleteConfirmText: '' });
      await this.load();
    } catch (err) {
      showError(err, '删除赛事失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onGameMoveTournamentChange(e) {
    const gameMoveTournamentIndex = Number(e.detail.value);
    const option = this.data.gameMoveTournamentOptions[gameMoveTournamentIndex] || this.data.gameMoveTournamentOptions[0];
    this.setData({
      gameMoveTournamentIndex,
      gameMoveTournamentLabel: option.label,
    });
  },

  onGameFilterChange(e) {
    const gameFilterIndex = Number(e.detail.value);
    const option = this.data.gameFilterOptions[gameFilterIndex] || this.data.gameFilterOptions[0];
    this.setData({
      gameFilterIndex,
      gameFilterLabel: option.label,
      ...buildGameSelectionState({
        games: this.data.games,
        tournaments: this.data.tournaments,
        filterId: option.id || '',
        selectedGameIds: this.data.selectedGameIds,
      }),
    });
  },

  onGameBatchSelectionChange(e) {
    const visibleIds = new Set((this.data.visibleBatchGames || []).map(game => game.id));
    const checkedVisibleIds = new Set(e.detail.value || []);
    const next = (this.data.selectedGameIds || []).filter(id => !visibleIds.has(id));
    checkedVisibleIds.forEach(id => next.push(id));
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournaments: this.data.tournaments,
      filterId: currentGameFilterId(this.data),
      selectedGameIds: next,
    }));
  },

  selectAllBatchGames() {
    const next = new Set(this.data.selectedGameIds || []);
    (this.data.visibleBatchGames || []).forEach(game => next.add(game.id));
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournaments: this.data.tournaments,
      filterId: currentGameFilterId(this.data),
      selectedGameIds: Array.from(next),
    }));
  },

  clearBatchGames() {
    this.setData(buildGameSelectionState({
      games: this.data.games,
      tournaments: this.data.tournaments,
      filterId: currentGameFilterId(this.data),
      selectedGameIds: [],
    }));
  },

  async loadMoreAdminGames() {
    if ((!this.data.canMoveGames && !this.data.canWritePoints) || !this.data.gamesHasMore || this.data.loadingMoreGames) return;
    this.setData({ loadingMoreGames: true });
    try {
      const res = await api.get('/games', {
        includeAggregate: false,
        limit: ADMIN_GAME_PAGE_LIMIT,
        offset: this.data.gamesNextOffset || (this.data.games || []).length,
      });
      const games = mergeGamesById(this.data.games || [], res.games || []);
      this.setData({
        games,
        gamesHasMore: !!res.hasMore,
        gamesNextOffset: normalizeNextOffset(res.nextOffset, games.length),
        ...buildGameBatchState({
          games,
          tournaments: this.data.tournaments,
          selectedGameIds: this.data.selectedGameIds,
          targetId: currentGameMoveTournamentId(this.data),
          filterId: currentGameFilterId(this.data),
        }),
        ...buildPointGameState({
          games: mergeGamesById(games, this.data.pointGameCandidateGames || []),
          tournaments: this.data.tournaments,
          selectedId: this.data.pointGameId,
          query: this.data.pointGameSearch,
        }),
      });
    } catch (err) {
      showError(err, '加载更多比赛失败');
    } finally {
      this.setData({ loadingMoreGames: false });
    }
  },

  async batchReassignGames() {
    if (!this.data.canMoveGames || this.data.saving) return;
    const target = selectedGameMoveTournament(this.data);
    if (!target) return toast('请选择目标赛事');
    const gameIds = this.data.selectedGameIds || [];
    if (!gameIds.length) return toast('请选择要移动的比赛');
    this.setData({ saving: true });
    try {
      const res = await api.patch('/games/batch-reassign', {
        gameIds,
        tournamentId: target.id,
      });
      toast(`已移动 ${res.moved || gameIds.length} 场比赛`);
      this.setData({ selectedGameIds: [], selectedGameCount: 0 });
      await this.load();
    } catch (err) {
      showError(err, '批量移动比赛失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async batchDeleteGames() {
    if (!this.data.canDeleteGames || this.data.saving) return;
    const gameIds = this.data.selectedGameIds || [];
    if (!gameIds.length) return toast('请选择要删除的比赛');
    if (String(this.data.gameDeleteConfirmText || '').trim() !== '删除比赛') {
      return toast('请输入“删除比赛”确认');
    }
    const ok = await confirmAction('删除比赛', `确认删除选中的 ${gameIds.length} 场比赛？比分、打击、投手和事件日志会从比赛库移除。`, '删除');
    if (!ok) return;
    this.setData({ saving: true });
    try {
      for (const id of gameIds) {
        await api.del(`/games/${id}`);
      }
      toast(`已删除 ${gameIds.length} 场比赛`);
      this.setData({
        selectedGameIds: [],
        selectedGameCount: 0,
        gameDeleteConfirmText: '',
      });
      await this.load();
    } catch (err) {
      showError(err, '批量删除比赛失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onInviteUserChange(e) {
    const inviteUserIndex = Number(e.detail.value);
    const option = this.data.inviteUserOptions[inviteUserIndex] || this.data.inviteUserOptions[0];
    this.setData({ inviteUserIndex, inviteUserLabel: option.label });
  },

  async loadMoreInviteUsers() {
    if (!this.data.canBindInvite || !this.data.inviteUsersHasMore || this.data.loadingMoreInviteUsers) return;
    const offset = this.data.inviteUsersNextOffset || (this.data.inviteUsers || []).length;
    this.setData({ loadingMoreInviteUsers: true });
    try {
      const res = await api.get('/admin/bind-invitation-options', {
        limit: ADMIN_INVITE_USER_PAGE_LIMIT,
        offset,
        includePlayers: 'false',
      });
      const inviteUsers = mergeAdminUsersById(this.data.inviteUsers || [], res.users || []);
      const inviteUserOptions = buildInviteUserOptions(inviteUsers);
      const selectedId = (this.data.inviteUserOptions[this.data.inviteUserIndex] || {}).id || '';
      const inviteUserIndex = pickBlankableOptionIndex(inviteUserOptions, selectedId);
      this.setData({
        inviteUsers,
        inviteUsersHasMore: !!res.usersHasMore,
        inviteUsersNextOffset: normalizeNextOffset(res.usersNextOffset, inviteUsers.length),
        inviteUserOptions,
        inviteUserIndex,
        inviteUserLabel: (inviteUserOptions[inviteUserIndex] || inviteUserOptions[0]).label,
      });
    } catch (err) {
      showError(err, '加载更多可邀请用户失败');
    } finally {
      this.setData({ loadingMoreInviteUsers: false });
    }
  },

  onInvitePlayerChange(e) {
    const invitePlayerIndex = Number(e.detail.value);
    const option = this.data.invitePlayerOptions[invitePlayerIndex] || this.data.invitePlayerOptions[0];
    this.setData({ invitePlayerIndex, invitePlayerLabel: option.label });
  },

  onInviteMessageInput(e) {
    this.setData({ inviteMessage: e.detail.value });
  },

  onBindCodePlayerChange(e) {
    const bindCodePlayerIndex = Number(e.detail.value);
    const option = this.data.bindCodePlayerOptions[bindCodePlayerIndex] || this.data.bindCodePlayerOptions[0];
    this.setData({
      bindCodePlayerIndex,
      bindCodePlayerLabel: option.label,
    });
  },

  onBindCodeSearchInput(e) {
    const bindCodeSearch = e.detail.value;
    this.setData({
      bindCodeSearch,
      visibleBindCodes: buildVisibleBindCodes(this.data.bindCodes, this.data.players, bindCodeSearch),
    });
  },

  async loadMoreBindCodes() {
    if (!this.data.canManageBindCodes || !this.data.bindCodesHasMore || this.data.loadingMoreBindCodes) return;
    const offset = this.data.bindCodesNextOffset || (this.data.bindCodes || []).length;
    this.setData({ loadingMoreBindCodes: true });
    try {
      const res = await api.get('/bind-codes', { limit: ADMIN_BIND_CODE_PAGE_LIMIT, offset });
      const bindCodes = mergeBindCodesByCode(this.data.bindCodes || [], res.bindCodes || []);
      this.setData({
        bindCodes,
        bindCodesHasMore: !!res.hasMore,
        bindCodesNextOffset: normalizeNextOffset(res.nextOffset, bindCodes.length),
        visibleBindCodes: buildVisibleBindCodes(bindCodes, this.data.players, this.data.bindCodeSearch),
      });
    } catch (err) {
      showError(err, '加载更多绑定码失败');
    } finally {
      this.setData({ loadingMoreBindCodes: false });
    }
  },

  async createBindCode() {
    if (!this.data.canManageBindCodes || this.data.saving) return;
    const player = selectedBindCodePlayer(this.data);
    if (!player) return toast('请选择正式球员');
    this.setData({ saving: true, generatedBindCode: '' });
    try {
      const res = await api.post('/bind-codes', { playerId: player.id });
      const code = res.bindCode?.code || '';
      if (code) {
        wx.setClipboardData({ data: code });
      }
      await this.load();
      this.setData({
        bindCodePlayerIndex: 0,
        bindCodePlayerLabel: this.data.bindCodePlayerOptions[0]?.label || '请选择正式球员',
        generatedBindCode: code,
      });
      toast(code ? '绑定码已生成并复制' : '绑定码已生成');
    } catch (err) {
      showError(err, '生成绑定码失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  copyBindCode(e) {
    const code = String(e.currentTarget.dataset.code || '').trim();
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success() {
        toast('绑定码已复制');
      },
    });
  },

  async deleteBindCode(e) {
    if (!this.data.canManageBindCodes || this.data.saving) return;
    const code = String(e.currentTarget.dataset.code || '').trim();
    if (!code) return;
    this.setData({ saving: true });
    try {
      await new Promise((resolve, reject) => {
        wx.showModal({
          title: '作废绑定码',
          content: `确认作废 ${code}？作废后不能再用于绑定。`,
          confirmText: '作废',
          success(res) {
            if (res.confirm) resolve();
            else reject(new Error('cancelled'));
          },
          fail: reject,
        });
      });
      await api.del(`/bind-codes/${encodeURIComponent(code)}`);
      toast('绑定码已作废');
      await this.load();
    } catch (err) {
      if (err && err.message === 'cancelled') return;
      showError(err, '作废绑定码失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async sendBindInvitation() {
    if (!this.data.canBindInvite || this.data.saving) return;
    const user = selectedInviteUser(this.data);
    if (!user) return toast('请选择用户');
    const player = selectedInvitePlayer(this.data);
    if (!player) return toast('请选择正式球员');
    this.setData({ saving: true, inviteCode: '' });
    try {
      const res = await api.post('/admin/bind-invitations', {
        userId: user.id,
        playerId: player.id,
        message: this.data.inviteMessage,
      });
      toast('绑定邀请已发送');
      this.setData({ inviteMessage: '', inviteCode: res.code || '' });
    } catch (err) {
      showError(err, '发送绑定邀请失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async approveRequest(e) {
    return this.reviewRequest(e.currentTarget.dataset.id, 'approve');
  },

  async rejectRequest(e) {
    return this.reviewRequest(e.currentTarget.dataset.id, 'reject');
  },

  async reviewRequest(id, action) {
    if (!id || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.post(`/admin/bind-requests/${id}/${action}`, {
        reviewNote: this.data.reviewNote,
      });
      toast(action === 'approve' ? '已批准绑定' : '已驳回申请');
      this.setData({ reviewNote: '' });
      await this.load();
    } catch (err) {
      showError(err, action === 'approve' ? '批准失败' : '驳回失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onPlayerChange(e) {
    const playerIndex = Number(e.detail.value);
    const option = this.data.playerOptions[playerIndex] || this.data.playerOptions[0];
    this.setData({ playerIndex, playerLabel: option.label });
    return this.loadPlayerRecords(option.id);
  },

  onPlayerPoolSearchInput(e) {
    const playerPoolSearch = e.detail.value;
    const level = (this.data.playerPoolLevelOptions[this.data.playerPoolLevelIndex] || playerPoolLevelOptions[0]).value;
    this.setData({
      playerPoolSearch,
      visiblePlayerPool: buildVisiblePlayerPool(this.data.players, playerPoolSearch, level),
      playerPoolSummary: playerPoolSummary(this.data.players, playerPoolSearch, level, this.data.playersHasMore),
    });
  },

  onPlayerPoolLevelChange(e) {
    const playerPoolLevelIndex = Number(e.detail.value || 0);
    const option = this.data.playerPoolLevelOptions[playerPoolLevelIndex] || playerPoolLevelOptions[0];
    this.setData({
      playerPoolLevelIndex,
      playerPoolLevelLabel: option.label,
      visiblePlayerPool: buildVisiblePlayerPool(this.data.players, this.data.playerPoolSearch, option.value),
      playerPoolSummary: playerPoolSummary(this.data.players, this.data.playerPoolSearch, option.value, this.data.playersHasMore),
    });
  },

  async loadMoreAdminPlayers() {
    if (!this.data.playersHasMore || this.data.loadingMorePlayers) return;
    const offset = this.data.playersNextOffset || (this.data.players || []).length;
    const selectedPlayerId = currentPlayerId(this.data);
    const selectedMergeSourceId = currentMergeSourceId(this.data);
    const selectedMergeTargetId = currentMergeTargetId(this.data);
    const selectedBindCodePlayerId = (this.data.bindCodePlayerOptions[this.data.bindCodePlayerIndex] || {}).id || '';
    const selectedInvitePlayerId = (this.data.invitePlayerOptions[this.data.invitePlayerIndex] || {}).id || '';
    const playerPoolLevel = (this.data.playerPoolLevelOptions[this.data.playerPoolLevelIndex] || playerPoolLevelOptions[0]).value;
    this.setData({ loadingMorePlayers: true });
    try {
      const res = await api.get('/players', adminPlayerParams(offset));
      const players = mergePlayersById(this.data.players || [], res.players || []);
      const playerOptions = buildPlayerOptions(players);
      const playerIndex = pickBlankableOptionIndex(playerOptions, selectedPlayerId);
      const selectedAdminUser = selectedAdminUserFromOptions(this.data.adminUsers, this.data.adminUserOptions, this.data.adminUserIndex);
      const directBindPlayerOptions = buildInvitePlayerOptions(players.filter(player => player.level === 'verified'));
      const directBindState = buildDirectBindState(selectedAdminUser, directBindPlayerOptions);
      const invitePlayerOptions = this.data.canBindInvite ? buildInvitePlayerOptions(players) : this.data.invitePlayerOptions;
      const invitePlayerIndex = pickBlankableOptionIndex(invitePlayerOptions, selectedInvitePlayerId);
      const bindCodePlayerOptions = buildBindCodePlayerOptions(players);
      const bindCodePlayerIndex = pickBlankableOptionIndex(bindCodePlayerOptions, selectedBindCodePlayerId);
      this.setData({
        players,
        playersHasMore: !!res.hasMore,
        playersNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.players || []).length),
        playerOptions,
        playerIndex,
        playerLabel: (playerOptions[playerIndex] || playerOptions[0] || {}).label || '请选择球员',
        directBindPlayerOptions,
        ...directBindState,
        invitePlayerOptions,
        invitePlayerIndex,
        invitePlayerLabel: (invitePlayerOptions[invitePlayerIndex] || invitePlayerOptions[0] || {}).label || '请选择正式球员',
        bindCodePlayerOptions,
        bindCodePlayerIndex,
        bindCodePlayerLabel: (bindCodePlayerOptions[bindCodePlayerIndex] || bindCodePlayerOptions[0]).label,
        visibleBindCodes: buildVisibleBindCodes(this.data.bindCodes, players, this.data.bindCodeSearch),
        visiblePlayerPool: buildVisiblePlayerPool(players, this.data.playerPoolSearch, playerPoolLevel),
        playerPoolSummary: playerPoolSummary(players, this.data.playerPoolSearch, playerPoolLevel, !!res.hasMore),
        ...buildAttendanceSelectionState({
          players,
          selectedAttendancePlayerIds: this.data.selectedAttendancePlayerIds,
          query: this.data.attendancePlayerSearch,
        }),
        ...buildMergeState({
          players,
          sourceId: selectedMergeSourceId,
          targetId: selectedMergeTargetId,
          keepAlias: (this.data.mergeKeepAliasValues || []).includes('keep'),
        }),
        stats: buildStats(
          this.data.pendingRequests || [],
          players,
          this.data.events || [],
          [],
          (this.data.stats || []).find(item => item.label === '待审时刻')?.value
        ),
      });
    } catch (err) {
      showError(err, '加载更多球员失败');
    } finally {
      this.setData({ loadingMorePlayers: false });
    }
  },

  openPoolPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },

  openPoolHighlights(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/highlights/highlights?playerId=${id}` });
  },

  async selectPoolPlayerRecords(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const playerIndex = pickBlankableOptionIndex(this.data.playerOptions, id);
    const option = this.data.playerOptions[playerIndex] || this.data.playerOptions[0];
    this.setData({ playerIndex, playerLabel: option.label });
    await this.loadPlayerRecords(id);
    if (wx.pageScrollTo) wx.pageScrollTo({ selector: '.points-panel', duration: 220 });
    toast('已切换积分与签到记录');
  },

  selectPoolMergeSource(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData(buildMergeState({
      players: this.data.players,
      sourceId: id,
      targetId: currentMergeTargetId(this.data),
      keepAlias: (this.data.mergeKeepAliasValues || []).includes('keep'),
    }));
    toast('已设为合并源球员');
  },

  async createPoolBindCode(e) {
    if (!this.data.canManageBindCodes || this.data.saving) return;
    const id = e.currentTarget.dataset.id;
    const player = (this.data.players || []).find(item => item.id === id);
    if (!player) return toast('未找到球员');
    if (player.level !== 'verified') return toast('绑定码只给正式球员');
    this.setData({ saving: true, generatedBindCode: '' });
    try {
      const res = await api.post('/bind-codes', { playerId: id });
      const code = res.bindCode?.code || '';
      if (code && wx.setClipboardData) {
        wx.setClipboardData({ data: code });
      }
      const bindCodes = code ? [{ code, playerId: id, used: false, createdAt: new Date().toISOString().slice(0, 10) }].concat(this.data.bindCodes || []) : this.data.bindCodes;
      this.setData({
        bindCodes,
        generatedBindCode: code,
        visibleBindCodes: buildVisibleBindCodes(bindCodes, this.data.players, this.data.bindCodeSearch),
      });
      toast(code ? '绑定码已生成并复制' : '绑定码已生成');
    } catch (err) {
      showError(err, '生成绑定码失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async upgradePoolPlayer(e) {
    if (!this.data.canWritePlayers || this.data.saving) return;
    const id = e.currentTarget.dataset.id;
    const player = (this.data.players || []).find(item => item.id === id);
    if (!player) return toast('未找到球员');
    if (player.level === 'verified') return toast('已经是正式球员');
    const ok = await confirmAction(
      '升级正式球员',
      `确认将「${player.name || '该球员'}」升级为正式球员？这会跳过 8 次训练签到的自动门槛，同名正式球员仍由后端拦截。`,
      '升级'
    );
    if (!ok) return;
    this.setData({ saving: true });
    try {
      const res = await api.post(`/players/${id}/upgrade`, {});
      await this.load();
      toast(res.already ? '已是正式球员' : '已升级正式球员');
    } catch (err) {
      showError(err, '升级失败，可能存在同名正式球员');
    } finally {
      this.setData({ saving: false });
    }
  },

  openLeaderboardPlayer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${id}` });
  },

  async loadPlayerRecords(playerId = currentPlayerId(this.data)) {
    if (!playerId) {
      this.setData({ pointAdjustments: [], attendanceRecords: [] });
      return;
    }
    try {
      const [adjustmentsRes, attendanceRes] = await Promise.all([
        this.data.canWritePoints
          ? api.get('/points-adjustments', { playerId, limit: ADMIN_RECORD_PAGE_LIMIT }).catch(() => ({ adjustments: [] }))
          : Promise.resolve({ adjustments: [] }),
        this.data.canWriteAttendances
          ? api.get('/attendances', { playerId, limit: ADMIN_RECORD_PAGE_LIMIT }).catch(() => ({ attendances: [] }))
          : Promise.resolve({ attendances: [] }),
      ]);
      this.setData({
        pointAdjustments: formatPointAdjustments(adjustmentsRes.adjustments || []),
        attendanceRecords: formatAttendanceRecords(attendanceRes.attendances || []),
      });
    } catch (err) {
      showError(err, '积分与签到记录加载失败');
    }
  },

  onCreatePlayerLevelChange(e) {
    const createPlayerLevelIndex = Number(e.detail.value);
    const option = playerCreateLevelOptions[createPlayerLevelIndex] || playerCreateLevelOptions[0];
    this.setData({ createPlayerLevelIndex, createPlayerLevelLabel: option.label });
  },

  onCreatePlayerNameInput(e) { this.setData({ createPlayerName: e.detail.value }); },
  onCreatePlayerNumberInput(e) { this.setData({ createPlayerNumber: e.detail.value }); },
  onCreatePlayerPositionInput(e) { this.setData({ createPlayerPosition: e.detail.value }); },
  onCreatePlayerBatsInput(e) { this.setData({ createPlayerBats: e.detail.value }); },
  onCreatePlayerThrowsInput(e) { this.setData({ createPlayerThrows: e.detail.value }); },
  onCreatePlayerJoinYearInput(e) { this.setData({ createPlayerJoinYear: e.detail.value }); },
  onCreatePlayerSloganInput(e) { this.setData({ createPlayerSlogan: e.detail.value }); },
  onCreatePlayerTitlesInput(e) { this.setData({ createPlayerTitles: e.detail.value }); },
  onCreatePlayerAliasesInput(e) { this.setData({ createPlayerAliases: e.detail.value }); },
  onCreatePlayerPhotoInput(e) { this.setData({ createPlayerPhoto: e.detail.value, createPlayerPhotoUploadText: '' }); },
  onBatchPlayerLevelChange(e) {
    const batchPlayerLevelIndex = Number(e.detail.value);
    const option = playerCreateLevelOptions[batchPlayerLevelIndex] || playerCreateLevelOptions[0];
    this.setData({ batchPlayerLevelIndex, batchPlayerLevelLabel: option.label });
  },
  onBatchPlayerTextInput(e) { this.setData({ batchPlayerText: e.detail.value }); },

  async chooseBatchPlayerPhotos() {
    if (!this.data.canWritePlayers || this.data.uploadingBatchPlayerPhotos) return;
    this.setData({ uploadingBatchPlayerPhotos: true, batchPlayerPhotoText: '选择照片中...' });
    try {
      const files = await chooseImageFiles(9);
      if (!files.length) {
        this.setData({ batchPlayerPhotoText: '' });
        return;
      }
      const photos = { ...(this.data.batchPlayerPhotos || {}) };
      const uploadedNames = [];
      for (const file of files) {
        const playerName = imageFileBaseName(file);
        if (!playerName) continue;
        this.setData({ batchPlayerPhotoText: `上传 ${playerName} 的照片中...` });
        const uploaded = await uploadImageFile(file, 'player', `batch-player-${playerName}`);
        if (uploaded?.url) {
          photos[playerName] = uploaded.url;
          uploadedNames.push(playerName);
        }
      }
      const names = Object.keys(photos);
      this.setData({
        batchPlayerPhotos: photos,
        batchPlayerPhotoCount: names.length,
        batchPlayerPhotoText: names.length
          ? `已上传 ${names.length} 张，按文件名匹配：${names.slice(0, 5).join('、')}${names.length > 5 ? '等' : ''}`
          : '未识别到可匹配姓名的照片',
      });
      if (uploadedNames.length) toast(`已上传 ${uploadedNames.length} 张照片`);
    } catch (err) {
      showError(err, '批量照片上传失败');
      this.setData({ batchPlayerPhotoText: '上传失败，可重新选择或先只导入名单' });
    } finally {
      this.setData({ uploadingBatchPlayerPhotos: false });
    }
  },

  clearBatchPlayerPhotos() {
    if (this.data.uploadingBatchPlayerPhotos) return;
    this.setData({
      batchPlayerPhotos: {},
      batchPlayerPhotoCount: 0,
      batchPlayerPhotoText: '已清空批量照片',
    });
  },

  async chooseCreatePlayerPhoto() {
    if (!this.data.canWritePlayers || this.data.uploadingCreatePlayerPhoto) return;
    this.setData({ uploadingCreatePlayerPhoto: true, createPlayerPhotoUploadText: '选择图片中...' });
    try {
      const uploaded = await chooseAndUploadImage('player', 'admin-player-photo', text => {
        this.setData({ createPlayerPhotoUploadText: text });
      });
      if (!uploaded) {
        this.setData({ createPlayerPhotoUploadText: '' });
        return;
      }
      this.setData({
        createPlayerPhoto: uploaded.url || '',
        createPlayerPhotoUploadText: '已上传到 COS，创建档案时自动关联',
      });
      toast('真实照片已上传');
    } catch (err) {
      showError(err, '真实照片上传失败');
      this.setData({ createPlayerPhotoUploadText: '上传失败，可稍后重试或粘贴图片地址' });
    } finally {
      this.setData({ uploadingCreatePlayerPhoto: false });
    }
  },

  clearCreatePlayerPhoto() {
    if (this.data.uploadingCreatePlayerPhoto) return;
    this.setData({ createPlayerPhoto: '', createPlayerPhotoUploadText: '创建时不设置真实照片' });
  },

  async createPlayer() {
    if (!this.data.canWritePlayers || this.data.saving) return;
    if (this.data.uploadingCreatePlayerPhoto) return toast('照片上传中');
    const name = String(this.data.createPlayerName || '').trim();
    if (!name) return toast('请填写球员姓名');
    const level = (this.data.playerCreateLevelOptions[this.data.createPlayerLevelIndex] || playerCreateLevelOptions[0]).value;
    const joinYearValue = String(this.data.createPlayerJoinYear || '').trim();
    const joinYear = joinYearValue ? Number(joinYearValue) : null;
    if (joinYearValue && (!Number.isInteger(joinYear) || joinYear < 1900 || joinYear > 2100)) {
      return toast('入队年份格式不正确');
    }
    this.setData({ saving: true, createPlayerResultText: '' });
    try {
      const res = await api.post('/players', {
        name,
        number: String(this.data.createPlayerNumber || '').trim(),
        position: String(this.data.createPlayerPosition || '').trim(),
        bats: String(this.data.createPlayerBats || '').trim(),
        throws: String(this.data.createPlayerThrows || '').trim(),
        joinYear,
        slogan: String(this.data.createPlayerSlogan || '').trim(),
        titles: splitList(this.data.createPlayerTitles),
        aliases: splitList(this.data.createPlayerAliases),
        photo: String(this.data.createPlayerPhoto || '').trim(),
        level,
      });
      const player = res.player || {};
      toast('球员档案已创建');
      this.setData({
        createPlayerName: '',
        createPlayerNumber: '',
        createPlayerPosition: '',
        createPlayerBats: '',
        createPlayerThrows: '',
        createPlayerJoinYear: '',
        createPlayerSlogan: '',
        createPlayerTitles: '',
        createPlayerAliases: '',
        createPlayerPhoto: '',
        createPlayerPhotoUploadText: '',
        createPlayerResultText: `已新增：${player.name || name} · ${level === 'verified' ? '正式球员' : '试训队员'}`,
      });
      await this.load();
      if (player.id) {
        wx.navigateTo({ url: `/pages/players/player-detail/player-detail?id=${player.id}` });
      }
    } catch (err) {
      showError(err, '新增球员失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async importPlayersBatch() {
    if (!this.data.canWritePlayers || this.data.saving) return;
    if (this.data.uploadingBatchPlayerPhotos) return toast('照片上传中');
    const text = String(this.data.batchPlayerText || '').trim();
    if (!text) return toast('请粘贴球员名单');
    const level = (this.data.playerCreateLevelOptions[this.data.batchPlayerLevelIndex] || playerCreateLevelOptions[0]).value;
    this.setData({ saving: true, batchPlayerResultText: '' });
    try {
      const photos = this.data.batchPlayerPhotos || {};
      const res = await api.post('/players/import', { text, level, photos });
      const summary = res.summary || {};
      const skippedText = summary.skipped ? `，跳过 ${summary.skipped} 个重复` : '';
      const invalidText = summary.invalid ? `，${summary.invalid} 行需检查` : '';
      const photoText = summary.photoMatched ? `，匹配 ${summary.photoMatched} 张照片` : '';
      this.setData({
        batchPlayerText: '',
        batchPlayerPhotos: {},
        batchPlayerPhotoCount: 0,
        batchPlayerPhotoText: '',
        batchPlayerResultText: `已导入 ${summary.created || 0} 人${photoText}${skippedText}${invalidText}。`,
      });
      toast(`批量导入完成：${summary.created || 0} 人`);
      await this.load();
    } catch (err) {
      showError(err, '批量导入失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onMergeSourceChange(e) {
    const sourceIndex = Number(e.detail.value);
    const sourceId = (this.data.mergeSourceOptions[sourceIndex] || {}).id || '';
    this.setData(buildMergeState({
      players: this.data.players,
      sourceId,
      targetId: currentMergeTargetId(this.data),
      keepAlias: (this.data.mergeKeepAliasValues || []).includes('keep'),
    }));
  },

  onMergeTargetChange(e) {
    const targetIndex = Number(e.detail.value);
    const targetId = (this.data.mergeTargetOptions[targetIndex] || {}).id || '';
    this.setData(buildMergeState({
      players: this.data.players,
      sourceId: currentMergeSourceId(this.data),
      targetId,
      keepAlias: (this.data.mergeKeepAliasValues || []).includes('keep'),
    }));
  },

  onMergeKeepAliasChange(e) {
    const keepAlias = (e.detail.value || []).includes('keep');
    this.setData(buildMergeState({
      players: this.data.players,
      sourceId: currentMergeSourceId(this.data),
      targetId: currentMergeTargetId(this.data),
      keepAlias,
    }));
  },

  async mergePlayers() {
    if (!this.data.canWritePlayers || this.data.saving) return;
    const source = selectedMergeSource(this.data);
    const target = selectedMergeTarget(this.data);
    if (!source) return toast('请选择要并入的球员');
    if (!target) return toast('请选择保留的球员档案');
    if (source.id === target.id) return toast('不能合并同一个球员');
    const keepSourceAsAlias = (this.data.mergeKeepAliasValues || []).includes('keep');
    const confirmed = await confirmMerge(source, target, keepSourceAsAlias);
    if (!confirmed) return;
    this.setData({ saving: true, mergeResultText: '' });
    try {
      const res = await api.post('/players/merge', {
        sourceId: source.id,
        targetId: target.id,
        keepSourceAsAlias,
      });
      const migrated = res.counts
        ? `账号 ${res.counts.users || 0}、签到 ${res.counts.attendances || 0}、积分 ${res.counts.points || 0}`
        : '相关数据';
      this.setData({
        mergeSourceIndex: 0,
        mergeSourceLabel: '请选择要并入的球员',
        mergeTargetIndex: 0,
        mergeTargetLabel: '请选择保留的球员档案',
        mergeResultText: `已合并：${source.name} -> ${target.name}，迁移 ${migrated}。`,
      });
      toast(res.message || '球员档案已合并');
      await this.load();
    } catch (err) {
      showError(err, '合并球员失败');
    } finally {
      this.setData({ saving: false });
    }
  },

	  onPointDeltaInput(e) {
	    this.setData({ pointDelta: e.detail.value });
	  },

	  onPointReasonInput(e) {
	    this.setData({ pointReason: e.detail.value });
	  },

	  async onPointGameSearchInput(e) {
	    const query = String(e.detail.value || '').trim();
	    this.setData(buildPointGameState({
	      games: pointGameSourceGames(this.data),
	      tournaments: this.data.tournaments,
	      selectedId: this.data.pointGameId,
	      query,
	    }));
	    if (!query || !this.data.canWritePoints) {
	      this.setData({ pointGameCandidateGames: [] });
	      return;
	    }
	    try {
	      const res = await api.get('/games', {
	        includeAggregate: false,
	        limit: POINT_GAME_SEARCH_LIMIT,
	        offset: 0,
	        keyword: query,
	      });
	      const pointGameCandidateGames = res.games || [];
	      const pointGames = mergeGamesById(this.data.games || [], pointGameCandidateGames);
	      this.setData({
	        pointGameCandidateGames,
	        ...buildPointGameState({
	          games: pointGames,
	          tournaments: this.data.tournaments,
	          selectedId: this.data.pointGameId,
	          query,
	        }),
	      });
	    } catch (err) {
	      showError(err, '搜索比赛失败');
	    }
	  },

	  onPointGameChange(e) {
	    const pointGameIndex = Number(e.detail.value || 0);
	    const option = this.data.pointGameOptions[pointGameIndex] || this.data.pointGameOptions[0];
	    this.setData(buildPointGameState({
	      games: pointGameSourceGames(this.data),
	      tournaments: this.data.tournaments,
	      selectedId: option.id || '',
	      query: this.data.pointGameSearch,
	    }));
	  },

	  clearPointGame() {
	    this.setData(buildPointGameState({
	      games: pointGameSourceGames(this.data),
	      tournaments: this.data.tournaments,
	      selectedId: '',
	      query: this.data.pointGameSearch,
	    }));
	  },

	  async submitPointAdjustment() {
	    if (!this.data.canWritePoints || this.data.saving) return;
	    const player = selectedPlayer(this.data);
	    if (!player) return toast('请选择球员');
	    const delta = Number(this.data.pointDelta);
	    if (!Number.isFinite(delta) || delta === 0) return toast('请输入非零积分');
	    const reason = String(this.data.pointReason || '').trim();
	    if (!reason) return toast('请填写调整原因');
	    const pointGameId = this.data.pointGameId || null;
	    this.setData({ saving: true });
	    try {
	      await api.post('/points-adjustments', {
	        playerId: player.id,
	        delta,
	        reason,
	        gameId: pointGameId,
	      });
	      toast('积分已调整');
	      this.setData({
	        pointDelta: '',
	        pointReason: '',
	        ...buildPointGameState({
	          games: pointGameSourceGames(this.data),
	          tournaments: this.data.tournaments,
	          selectedId: '',
	          query: this.data.pointGameSearch,
	        }),
	      });
	      await this.loadPlayerRecords(player.id);
    } catch (err) {
      showError(err, '积分调整失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onAttendanceKindChange(e) {
    const attendanceKindIndex = Number(e.detail.value);
    const option = attendanceKinds[attendanceKindIndex] || attendanceKinds[0];
    this.setData({ attendanceKindIndex, attendanceKindLabel: option.label });
  },

  onAttendanceDateChange(e) {
    this.setData({ attendanceDate: e.detail.value });
  },

	  onAttendanceNoteInput(e) {
	    this.setData({ attendanceNote: e.detail.value });
	  },

	  onAttendancePlayerSearchInput(e) {
	    this.setData(buildAttendanceSelectionState({
	      players: this.data.players,
	      selectedAttendancePlayerIds: this.data.selectedAttendancePlayerIds,
	      query: e.detail.value,
	    }));
	  },

	  onAttendancePlayerSelectionChange(e) {
	    const visibleIds = new Set((this.data.visibleAttendancePlayers || []).map(item => item.id));
	    const hiddenSelected = (this.data.selectedAttendancePlayerIds || []).filter(id => !visibleIds.has(id));
	    const visibleSelected = e.detail.value || [];
	    this.setData(buildAttendanceSelectionState({
	      players: this.data.players,
	      selectedAttendancePlayerIds: hiddenSelected.concat(visibleSelected),
	      query: this.data.attendancePlayerSearch,
	    }));
	  },

	  selectAllAttendancePlayers() {
	    const selected = new Set(this.data.selectedAttendancePlayerIds || []);
	    (this.data.visibleAttendancePlayers || []).forEach(item => selected.add(item.id));
	    this.setData(buildAttendanceSelectionState({
	      players: this.data.players,
	      selectedAttendancePlayerIds: Array.from(selected),
	      query: this.data.attendancePlayerSearch,
	    }));
	  },

	  clearAttendancePlayers() {
	    this.setData(buildAttendanceSelectionState({
	      players: this.data.players,
	      selectedAttendancePlayerIds: [],
	      query: this.data.attendancePlayerSearch,
	    }));
	  },

	  async submitAttendance() {
	    if (!this.data.canWriteAttendances || this.data.saving) return;
	    const player = selectedPlayer(this.data);
	    const selectedIds = normalizeSelectedAttendancePlayerIds(this.data.selectedAttendancePlayerIds, this.data.players);
	    const playerIds = selectedIds.length ? selectedIds : (player ? [player.id] : []);
	    if (!playerIds.length) return toast('请选择球员或勾选出席球员');
	    const kind = attendanceKinds[this.data.attendanceKindIndex]?.value || 'training';
	    this.setData({ saving: true });
	    try {
	      const results = await Promise.all(playerIds.map(playerId => api.post('/attendances', {
	        playerId,
	        kind,
	        date: this.data.attendanceDate,
	        note: this.data.attendanceNote,
	      })));
	      const conflictCount = results.filter(res => res.nameConflict).length;
	      const upgradeCount = results.filter(res => res.triggeredUpgrade).length;
	      if (selectedIds.length) {
	        toast(`已补录 ${playerIds.length} 人签到${upgradeCount ? `，升级 ${upgradeCount} 人` : ''}${conflictCount ? `，${conflictCount} 人需绑定审批` : ''}`);
	        this.setData({
	          attendanceNote: '',
	          ...buildAttendanceSelectionState({
	            players: this.data.players,
	            selectedAttendancePlayerIds: [],
	            query: this.data.attendancePlayerSearch,
	          }),
	        });
	      } else if (conflictCount) {
	        toast('已补录，重名需绑定审批');
	      } else {
	        toast(upgradeCount ? '已补录并升级正式队员' : '签到已补录');
	        this.setData({ attendanceNote: '' });
	      }
	      await this.loadPlayerRecords(playerIds[0]);
	    } catch (err) {
	      showError(err, '补录签到失败');
	    } finally {
      this.setData({ saving: false });
    }
  },

  async deletePointAdjustment(e) {
    if (!this.data.canWritePoints || this.data.saving) return;
    const id = String(e.currentTarget.dataset.id || '').trim();
    const item = (this.data.pointAdjustments || []).find(row => row.id === id);
    if (!id || !item) return;
    const confirmed = await confirmAction('删除积分调整', `确认删除 ${item.deltaText} 分记录？删除后球员总分会相应回退。`, '删除');
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      await api.del(`/points-adjustments/${id}`);
      toast('积分调整已删除');
      await this.loadPlayerRecords(currentPlayerId(this.data));
    } catch (err) {
      showError(err, '删除积分调整失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteAttendanceRecord(e) {
    if (!this.data.canWriteAttendances || this.data.saving) return;
    const id = String(e.currentTarget.dataset.id || '').trim();
    const item = (this.data.attendanceRecords || []).find(row => row.id === id);
    if (!id || !item) return;
    const confirmed = await confirmAction('删除签到记录', `确认删除 ${item.kindLabel} ${item.dateText}？删除后出勤积分会相应回退。`, '删除');
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      await api.del(`/attendances/${id}`);
      toast('签到记录已删除');
      await this.loadPlayerRecords(currentPlayerId(this.data));
    } catch (err) {
      showError(err, '删除签到失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  onHofYearInput(e) {
    this.setData({ hofYear: e.detail.value });
  },

  onHofReasonInput(e) {
    this.setData({ hofReason: e.detail.value });
  },

  async addHallOfFame() {
    if (this.data.saving) return;
    const player = selectedPlayer(this.data);
    if (!player) return toast('请选择球员');
    const inductedYear = Number(this.data.hofYear) || new Date().getFullYear();
    this.setData({ saving: true });
    try {
      await api.post('/hall-of-fame', {
        playerId: player.id,
        inductedYear,
        reason: this.data.hofReason,
      });
      toast('已加入名人堂');
      this.setData({ hofReason: '' });
    } catch (err) {
      showError(err, '名人堂授予失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async removeHallOfFame() {
    if (this.data.saving) return;
    const player = selectedPlayer(this.data);
    if (!player) return toast('请选择球员');
    const confirmed = await confirmAction('移出名人堂', `确认把「${player.name}」移出名人堂？入选年份和理由会一并删除。`, '移出');
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      await api.del(`/hall-of-fame/${player.id}`);
      toast('已移出名人堂');
    } catch (err) {
      showError(err, '移出名人堂失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

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
        const paths = (res.tempFilePaths || []).slice(0, count);
        const files = paths.map((filePath, index) => ({
          tempFilePath: filePath,
          size: (res.tempFiles || [])[index]?.size,
          name: filePath.split('/').pop() || '',
        }));
        resolve(files);
      },
      fail: reject,
    });
  });
}

async function chooseImageFile() {
  const files = await chooseImageFiles(1);
  return files[0] || null;
}

async function chooseAndUploadImage(kind, fallbackPrefix, onStatus) {
  const file = await chooseImageFile();
  if (!file) return null;
  if (onStatus) onStatus('上传 COS 中...');
  return uploadImageFile(file, kind, fallbackPrefix);
}

async function uploadImageFile(file, kind, fallbackPrefix) {
  const filePath = file.tempFilePath || file.path || '';
  const fileName = file.name || filePath.split('/').pop() || `${fallbackPrefix}-${Date.now()}.jpg`;
  const fileBase64 = await readFileBase64(filePath);
  return api.post('/upload/base64', {
    kind,
    fileName,
    contentType: inferImageContentType(fileName, filePath),
    fileBase64,
  });
}

function imageFileBaseName(file) {
  const filePath = file?.tempFilePath || file?.path || '';
  const fileName = file?.name || filePath.split('/').pop() || '';
  return String(fileName || '').replace(/\.[^.]+$/, '').trim();
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
    'games:confirm',
    'games:revise',
    'games:cover_write',
    'tournaments:write',
    'bind_codes:manage',
    'users:read',
    'users:grant_admin',
    'users:app_connect_code',
    'users:password_reset',
    'users:bind_direct',
    'audit:read',
    'audit:game_read',
    'destructive:delete',
    'system:settings',
    'hof:write',
    'highlights:write',
    'notifications:write',
  ].some(permission => permissions.includes(permission));
}

function hasPermission(user, permission) {
  return (user?.permissions || []).includes(permission);
}

function splitList(value) {
  return String(value || '')
    .split(/[,\n，、]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function permissionChips(user) {
  const permissions = user?.permissions || [];
  const chips = [];
  if (user?.adminLevel) chips.push(`${user.adminLevel} 级`);
  (user?.adminPermissionGroups || []).forEach(group => {
    chips.push(group === 'data' ? '数据组' : group === 'ops' ? '运营组' : group);
  });
  permissions.forEach(permission => {
    if (permissionLabels[permission]) chips.push(permissionLabels[permission]);
  });
  return Array.from(new Set(chips)).slice(0, 12);
}

function adminPlayerParams(offset = 0) {
  return {
    include: 'all',
    limit: ADMIN_PLAYER_PAGE_LIMIT,
    offset,
  };
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

function buildPlayerOptions(players) {
  return [{ id: '', label: '请选择球员' }].concat((players || []).map(player => ({
    id: player.id,
    label: `#${player.number || '-'} ${player.name} · ${player.level === 'verified' ? '正式' : '试训'}`,
  })));
}

function buildVisiblePlayerPool(players, query = '', level = '') {
  const q = String(query || '').trim().toLowerCase();
  return (players || [])
    .filter(player => !level || player.level === level)
    .filter(player => {
      if (!q) return true;
      const aliases = normalizeList(player.aliases).join(' ');
      const titles = normalizeList(player.titles).join(' ');
      return [player.name, player.number, player.position, player.bats, player.throws, player.slogan, aliases, titles, player.level]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'verified' ? -1 : 1;
      return String(a.number || '').localeCompare(String(b.number || ''), 'zh-Hans', { numeric: true })
        || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans');
    })
    .map(player => {
      const aliases = normalizeList(player.aliases);
      const titles = normalizeList(player.titles);
      return {
        id: player.id,
        name: player.name || '未命名球员',
        numberText: `#${player.number || '-'}`,
        positionText: player.position || '守位待定',
        levelLabel: player.level === 'verified' ? '正式球员' : '试训队员',
        levelClass: player.level === 'verified' ? 'verified' : 'casual',
        canUpgrade: player.level !== 'verified',
        canCreateBindCode: player.level === 'verified',
        meta: [
          player.bats ? `打 ${player.bats}` : '',
          player.throws ? `投 ${player.throws}` : '',
          player.joinYear ? `${player.joinYear} 入队` : '',
          aliases.length ? `别名 ${aliases.slice(0, 2).join('/')}${aliases.length > 2 ? '+' : ''}` : '',
          titles.length ? titles.slice(0, 2).join(' / ') : '',
        ].filter(Boolean).join(' · ') || '暂无扩展资料',
      };
    });
}

function playerPoolSummary(players, query = '', level = '', hasMore = false) {
  const visible = buildVisiblePlayerPool(players, query, level).length;
  const total = (players || []).length;
  return hasMore
    ? `${visible}/${total} 名已加载球员，继续加载可查看更多`
    : `${visible}/${total} 名球员`;
}

function buildAttendanceSelectionState({ players, selectedAttendancePlayerIds = [], query = '' }) {
  const selectedIds = normalizeSelectedAttendancePlayerIds(selectedAttendancePlayerIds, players);
  const visibleAttendancePlayers = buildVisibleAttendancePlayers(players, query, selectedIds);
  const count = selectedIds.length;
  return {
    attendancePlayerSearch: query,
    selectedAttendancePlayerIds: selectedIds,
    visibleAttendancePlayers,
    attendanceSelectedCount: count,
    attendanceSelectionSummary: count ? `已选 ${count} 人` : '未勾选时使用上方选中球员',
    attendanceSubmitLabel: count ? `补录已选 ${count} 人` : '补录上方选中球员',
  };
}

function normalizeSelectedAttendancePlayerIds(selectedIds, players) {
  const playerIdSet = new Set((players || []).map(player => player.id));
  return Array.from(new Set(selectedIds || [])).filter(id => playerIdSet.has(id));
}

function buildVisibleAttendancePlayers(players, query = '', selectedIds = []) {
  const q = String(query || '').trim().toLowerCase();
  const selectedSet = new Set(selectedIds || []);
  return (players || [])
    .filter(player => {
      if (!q) return true;
      const aliases = normalizeList(player.aliases).join(' ');
      return [player.name, player.number, player.position, player.bats, player.throws, aliases, player.level]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'verified' ? -1 : 1;
      return String(a.number || '').localeCompare(String(b.number || ''), 'zh-Hans', { numeric: true })
        || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans');
    })
    .map(player => ({
      id: player.id,
      selected: selectedSet.has(player.id),
      name: player.name || '未命名球员',
      numberText: `#${player.number || '-'}`,
      levelLabel: player.level === 'verified' ? '正式' : '试训',
      levelClass: player.level === 'verified' ? 'verified' : 'casual',
      meta: [
        player.position || '守位待定',
        player.bats ? `打 ${player.bats}` : '',
        player.throws ? `投 ${player.throws}` : '',
      ].filter(Boolean).join(' · '),
    }));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeList(parsed);
    } catch (_) {}
    return value.split(/[,\n，、/]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function buildMergePlayerOptions(players, placeholder) {
  return [{ id: '', label: placeholder }].concat((players || []).map(player => {
    const aliasCount = Array.isArray(player.aliases) ? player.aliases.length : 0;
    const suffix = aliasCount ? ` · ${aliasCount} 个别名` : '';
    return {
      id: player.id,
      label: `#${player.number || '-'} ${player.name} · ${player.level === 'verified' ? '正式' : '试训'}${suffix}`,
    };
  }));
}

function buildMergeState({ players, sourceId, targetId, keepAlias }) {
  const mergeSourceOptions = buildMergePlayerOptions(players, '请选择要并入的球员');
  const mergeTargetOptions = buildMergePlayerOptions(players, '请选择保留的球员档案');
  const mergeSourceIndex = pickBlankableOptionIndex(mergeSourceOptions, sourceId);
  let mergeTargetIndex = pickBlankableOptionIndex(mergeTargetOptions, targetId);
  const source = selectedMergePlayerFromOptions(players, mergeSourceOptions, mergeSourceIndex);
  let target = selectedMergePlayerFromOptions(players, mergeTargetOptions, mergeTargetIndex);
  if (source && target && source.id === target.id) {
    mergeTargetIndex = 0;
    target = null;
  }
  return {
    mergeSourceOptions,
    mergeSourceIndex,
    mergeSourceLabel: (mergeSourceOptions[mergeSourceIndex] || mergeSourceOptions[0]).label,
    mergeTargetOptions,
    mergeTargetIndex,
    mergeTargetLabel: (mergeTargetOptions[mergeTargetIndex] || mergeTargetOptions[0]).label,
    mergeKeepAliasValues: keepAlias ? ['keep'] : [],
    mergePreviewText: mergePreviewText(source, target, keepAlias),
  };
}

function mergePreviewText(source, target, keepAlias) {
  if (!source && !target) return '选择源球员和目标球员后，会显示合并影响。';
  if (!source) return `请选择要并入 ${target.name} 的源球员。`;
  if (!target) return `请选择要保留的目标档案，${source.name} 会被并入目标后删除源档案。`;
  const aliasText = keepAlias ? `，并把“${source.name}”和源档案别名加入目标别名` : '';
  return `${source.name} 会并入 ${target.name}${aliasText}；账号绑定、签到、积分、名人堂和精彩时刻会迁移到目标档案，历史比赛姓名不改写。`;
}

function selectedMergePlayerFromOptions(players, options, index) {
  const option = (options || [])[index] || {};
  if (!option.id) return null;
  return (players || []).find(player => player.id === option.id) || null;
}

function currentMergeSourceId(data) {
  return (data.mergeSourceOptions[data.mergeSourceIndex] || {}).id || '';
}

function currentMergeTargetId(data) {
  return (data.mergeTargetOptions[data.mergeTargetIndex] || {}).id || '';
}

function buildAdminUserOptions(users, filters = {}) {
  const visibleUsers = (users || [])
    .filter(user => adminUserMatchesFilters(user, filters))
    .sort((a, b) => compareAdminUsers(a, b, filters.sort));
  return [{ id: '', label: visibleUsers.length ? '请选择账号' : '没有匹配账号' }].concat(visibleUsers.map(user => {
    const level = user.adminLevel ? `${user.adminLevel} 级` : '普通';
    const bound = user.boundPlayerName
      ? `#${user.boundPlayerNumber || '-'} ${user.boundPlayerName}`
      : '未绑定球员';
    return {
      id: user.id,
      label: `${user.displayName || user.email || user.id} · ${level} · ${bound}`,
    };
  }));
}

function currentAdminUserFilters(data) {
  return {
    identity: (data.adminIdentityFilterOptions?.[data.adminIdentityFilterIndex] || adminIdentityFilterOptions[0]).value || '',
    group: (data.adminGroupFilterOptions?.[data.adminGroupFilterIndex] || adminGroupFilterOptions[0]).value || '',
    position: (data.adminPositionFilterOptions?.[data.adminPositionFilterIndex] || adminPositionFilterOptions[0]).value || '',
    bind: (data.adminBindFilterOptions?.[data.adminBindFilterIndex] || adminBindFilterOptions[0]).value || '',
    sort: (data.adminUserSortOptions?.[data.adminUserSortIndex] || adminUserSortOptions[0]).value || 'recent',
    q: String(data.adminUserSearch || '').trim().toLowerCase(),
  };
}

function adminUserFilterSummary(options, users, hasMore = false) {
  const visible = Math.max((options || []).length - 1, 0);
  const total = (users || []).length;
  const suffix = hasMore ? '，继续加载可查看更多' : '';
  return `${visible}/${total} 个已加载账号${suffix}`;
}

function adminUserMatchesFilters(user, filters = {}) {
  return matchesAdminIdentity(user, filters.identity)
    && matchesAdminGroup(user, filters.group)
    && matchesAdminPosition(user, filters.position)
    && matchesAdminBindStatus(user, filters.bind)
    && matchesAdminSearch(user, filters.q);
}

function matchesAdminSearch(user, q) {
  if (!q) return true;
  return [
    user?.displayName,
    user?.email,
    user?.boundPlayerName,
    user?.boundPlayerNumber,
    user?.boundPlayerPosition,
    user?.id,
    user?.adminLevel,
    ...(user?.adminPermissionGroups || []),
  ].filter(Boolean).join(' ').toLowerCase().includes(q);
}

function compareAdminUsers(a, b, sort = 'recent') {
  if (sort === 'created') {
    return String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''))
      || compareAdminUsers(a, b, 'name');
  }
  if (sort === 'name') {
    return String(a?.displayName || a?.email || a?.id || '').localeCompare(
      String(b?.displayName || b?.email || b?.id || ''),
      'zh-Hans',
      { numeric: true }
    );
  }
  return String(b?.lastActiveAt || '').localeCompare(String(a?.lastActiveAt || ''))
    || compareAdminUsers(a, b, 'name');
}

function matchesAdminIdentity(user, value) {
  if (!value) return true;
  const level = String(user?.adminLevel || '').toUpperCase();
  const groups = user?.adminPermissionGroups || [];
  const isAdminish = user?.role === 'admin' || !!level || groups.length > 0 || (user?.permissions || []).some(permission => permissionLabels[permission]);
  if (value === 'admin') return isAdminish;
  if (value === 'normal') return !isAdminish;
  return level === value;
}

function matchesAdminGroup(user, value) {
  if (!value) return true;
  const groups = new Set(user?.adminPermissionGroups || []);
  const hasData = groups.has('data');
  const hasOps = groups.has('ops');
  if (value === 'data') return hasData && !hasOps;
  if (value === 'ops') return hasOps && !hasData;
  if (value === 'data_ops') return hasData && hasOps;
  if (value === 'none') return !hasData && !hasOps;
  return true;
}

function matchesAdminPosition(user, value) {
  if (!value) return true;
  const group = adminPositionGroup(user?.boundPlayerPosition || user?.playerPosition || '');
  return group === value;
}

function matchesAdminBindStatus(user, value) {
  if (!value) return true;
  const isBound = !!(user?.boundPlayerId || user?.boundPlayerName || user?.boundPlayerNumber);
  if (value === 'bound') return isBound;
  if (value === 'unbound') return !isBound;
  return true;
}

function adminPositionGroup(position) {
  const text = String(position || '').trim().toUpperCase();
  if (!text) return 'unset';
  const tokens = text.split(/[^A-Z0-9\u4e00-\u9fa5]+/).filter(Boolean);
  if (tokens.some(token => token === 'P' || token.includes('投手') || token === '投')) return 'pitcher';
  if (tokens.some(token => token === 'C' || token.includes('捕手') || token === '捕')) return 'catcher';
  if (tokens.some(token => ['LF', 'CF', 'RF', 'OF'].includes(token) || token.includes('外野'))) return 'outfield';
  if (tokens.some(token => ['1B', '2B', '3B', 'SS', 'IF', 'INF'].includes(token) || token.includes('内野') || token.includes('游击'))) return 'infield';
  return 'unset';
}

function optionLabel(options, index) {
  return (options[index] || options[0] || {}).label || '';
}

function pickOptionIndex(options, selectedId) {
  const found = (options || []).findIndex(option => option.id && option.id === selectedId);
  if (found >= 0) return found;
  return (options || []).length > 1 ? 1 : 0;
}

function selectedAdminUserFromOptions(users, options, index) {
  const option = (options || [])[index] || {};
  if (!option.id) return null;
  return (users || []).find(user => user.id === option.id) || null;
}

function selectedAdminUser(data) {
  return selectedAdminUserFromOptions(data.adminUsers, data.adminUserOptions, data.adminUserIndex);
}

function mergeAdminUsersById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(user => {
      const id = user && user.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function mergeBindCodesByCode(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(item => {
      const code = item && item.code;
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
}

function currentBindRequestStatus(data) {
  return (data.bindRequestStatusOptions?.[data.bindRequestStatusIndex] || bindRequestStatusOptions[0]).value || '';
}

function buildAdminGroupOptions(values) {
  const selected = new Set(values || []);
  return [
    { label: '数据组', value: 'data', checked: selected.has('data') },
    { label: '运营组', value: 'ops', checked: selected.has('ops') },
  ];
}

function buildAdminPermissionState(user, index = 0, label = '请选择账号') {
  const adminLevel = user?.adminLevel || '';
  const adminLevelIndex = adminLevelOptions.findIndex(option => option.value === adminLevel);
  const adminGroupValues = user ? (user.adminPermissionGroups || []) : [];
  return {
    adminUserIndex: index,
    adminUserLabel: label || '请选择账号',
    adminUserMeta: user ? formatAdminUserMeta(user) : '',
    adminLevelIndex: adminLevelIndex >= 0 ? adminLevelIndex : 0,
    adminLevelLabel: adminLevelOptions[adminLevelIndex >= 0 ? adminLevelIndex : 0].label,
    adminGroupValues,
    adminGroupOptions: buildAdminGroupOptions(adminGroupValues),
  };
}

function buildDirectBindState(user, options) {
  const boundPlayerId = user?.boundPlayerId || user?.bound_player_id || '';
  const directBindPlayerIndex = pickOptionIndex(options || [], boundPlayerId);
  const option = (options || [])[directBindPlayerIndex] || (options || [])[0] || {};
  return {
    directBindPlayerIndex,
    directBindPlayerLabel: option.label || '请选择正式球员',
  };
}

function formatAdminUserMeta(user) {
  const parts = [];
  if (user.email) parts.push(user.email);
  if (user.boundPlayerName) parts.push(`绑定 #${user.boundPlayerNumber || '-'} ${user.boundPlayerName}`);
  if (user.adminGrantedByName) parts.push(`授权人 ${user.adminGrantedByName}`);
  if (user.lastActiveAt) parts.push(`最近活跃 ${String(user.lastActiveAt).slice(0, 10)}`);
  if (user.isOwner) parts.push('所有者账号');
  return parts.join(' · ');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeStarfieldSettings(raw = {}) {
  const value = { ...starfieldDefaults, ...(raw || {}) };
  const formations = new Set(starfieldFormationOptions.map(option => option.value));
  const paths = new Set(starfieldPathOptions.map(option => option.value));
  const particleModes = new Set(starfieldParticleModeOptions.map(option => option.value));
  if (!formations.has(value.formation)) value.formation = starfieldDefaults.formation;
  if (!paths.has(value.path)) value.path = starfieldDefaults.path;
  if (!particleModes.has(value.particleMode)) value.particleMode = starfieldDefaults.particleMode;
  value.year = String(value.year || starfieldDefaults.year).replace(/[^\d]/g, '').slice(0, 6) || starfieldDefaults.year;
  value.yearLimit = Math.round(clampNumber(value.yearLimit, starfieldDefaults.yearLimit, 24, 160));
  value.particleDensity = clampNumber(value.particleDensity, starfieldDefaults.particleDensity, 0.35, 1.8);
  value.particleBrightness = clampNumber(value.particleBrightness, starfieldDefaults.particleBrightness, 0.35, 1.8);
  value.particleRadius = clampNumber(value.particleRadius, starfieldDefaults.particleRadius, 0.55, 1.8);
  value.particleStrength = clampNumber(value.particleStrength, starfieldDefaults.particleStrength, 0.4, 2.2);
  value.particleReturn = clampNumber(value.particleReturn, starfieldDefaults.particleReturn, 0.35, 2.5);
  value.pathDuration = clampNumber(value.pathDuration, starfieldDefaults.pathDuration, 5.6, 24);
  value.breatheDuration = clampNumber(value.breatheDuration, starfieldDefaults.breatheDuration, 5.8, 18);
  value.sway = clampNumber(value.sway, starfieldDefaults.sway, 0.2, 2.6);
  value.spread = clampNumber(value.spread, starfieldDefaults.spread, 0.82, 1.28);
  value.randomSeed = Math.round(clampNumber(value.randomSeed, starfieldDefaults.randomSeed, 1, 999999));
  return value;
}

function buildStarfieldState(setting, presetIndex = 0) {
  const value = normalizeStarfieldSettings(setting?.value || setting?.settings || {});
  const starfieldFormationIndex = Math.max(starfieldFormationOptions.findIndex(option => option.value === value.formation), 0);
  const starfieldPathIndex = Math.max(starfieldPathOptions.findIndex(option => option.value === value.path), 0);
  const starfieldParticleModeIndex = Math.max(starfieldParticleModeOptions.findIndex(option => option.value === value.particleMode), 0);
  const preset = starfieldPresetOptions[presetIndex] || starfieldPresetOptions[0];
  return {
    starfieldSetting: {
      ...(setting || {}),
      key: 'players-starfield',
      value,
    },
    starfieldUpdatedText: formatStarfieldUpdatedText(setting),
    starfieldPresetIndex: presetIndex,
    starfieldPresetLabel: preset.label,
    starfieldFormationIndex,
    starfieldFormationLabel: starfieldFormationOptions[starfieldFormationIndex].label,
    starfieldPathIndex,
    starfieldPathLabel: starfieldPathOptions[starfieldPathIndex].label,
    starfieldParticleModeIndex,
    starfieldParticleModeLabel: starfieldParticleModeOptions[starfieldParticleModeIndex].label,
    starfieldYear: value.year,
    starfieldYearLimit: value.yearLimit,
    starfieldPathDuration: value.pathDuration,
    starfieldBreatheDuration: value.breatheDuration,
    starfieldSway: value.sway,
    starfieldSpread: value.spread,
    starfieldRandomSeed: value.randomSeed,
    starfieldParticleDensity: value.particleDensity,
    starfieldParticleBrightness: value.particleBrightness,
    starfieldParticleRadius: value.particleRadius,
    starfieldParticleStrength: value.particleStrength,
    starfieldParticleReturn: value.particleReturn,
  };
}

function formatStarfieldUpdatedText(setting) {
  if (!setting || setting.isDefault) return '当前使用默认配置，还没有发布记录';
  const pieces = [];
  if (setting.updatedAt) pieces.push(`发布 ${String(setting.updatedAt).slice(0, 16).replace('T', ' ')}`);
  if (setting.updatedByName) pieces.push(`发布人 ${setting.updatedByName}`);
  return pieces.length ? pieces.join(' · ') : '已读取全站发布配置';
}

function currentStarfieldSettings(data) {
  const formation = (data.starfieldFormationOptions[data.starfieldFormationIndex] || starfieldFormationOptions[0]).value;
  const path = (data.starfieldPathOptions[data.starfieldPathIndex] || starfieldPathOptions[0]).value;
  const particleMode = (data.starfieldParticleModeOptions[data.starfieldParticleModeIndex] || starfieldParticleModeOptions[0]).value;
  return normalizeStarfieldSettings({
    formation,
    path,
    particleMode,
    year: data.starfieldYear,
    yearLimit: data.starfieldYearLimit,
    particleDensity: data.starfieldParticleDensity,
    particleBrightness: data.starfieldParticleBrightness,
    particleRadius: data.starfieldParticleRadius,
    particleStrength: data.starfieldParticleStrength,
    particleReturn: data.starfieldParticleReturn,
    pathDuration: data.starfieldPathDuration,
    breatheDuration: data.starfieldBreatheDuration,
    sway: data.starfieldSway,
    spread: data.starfieldSpread,
    randomSeed: data.starfieldRandomSeed,
  });
}

function buildTournamentOptions(tournaments) {
  return [{ id: '', label: '新建赛事' }].concat((tournaments || []).map(tournament => ({
    id: tournament.id,
    label: `${tournamentTypeLabel(tournament.type)} ${tournament.shortName || tournament.name} · ${tournament.season || '未设赛季'}`,
  })));
}

function selectedTournamentFromOptions(tournaments, options, index) {
  const option = (options || [])[index] || {};
  if (!option.id) return null;
  return (tournaments || []).find(tournament => tournament.id === option.id) || null;
}

function selectedTournament(data) {
  return selectedTournamentFromOptions(data.tournaments, data.tournamentOptions, data.tournamentIndex);
}

function buildTournamentState(tournament, index = 0, label = '新建赛事') {
  const type = tournament?.type || tournamentTypeOptions[0].value;
  const sport = tournament?.sport || tournamentSportOptions[0].value;
  const typeIndex = Math.max(tournamentTypeOptions.findIndex(option => option.value === type), 0);
  const sportIndex = Math.max(tournamentSportOptions.findIndex(option => option.value === sport), 0);
  return {
    tournamentIndex: index,
    tournamentLabel: label || '新建赛事',
    tournamentTypeIndex: typeIndex,
    tournamentTypeLabel: tournamentTypeOptions[typeIndex].label,
    tournamentSportIndex: sportIndex,
    tournamentSportLabel: tournamentSportOptions[sportIndex].label,
    tournamentName: tournament?.name || '',
    tournamentShortName: tournament?.shortName || '',
    tournamentSeason: tournament?.season || '',
    tournamentLocation: tournament?.location || '',
    tournamentStartDate: tournament?.startDate || '',
    tournamentEndDate: tournament?.endDate || '',
    tournamentCover: tournament?.cover || '',
    tournamentDescription: tournament?.description || '',
  };
}

function tournamentTypeLabel(type) {
  const found = tournamentTypeOptions.find(option => option.value === type);
  return found ? found.label : '📅 赛事';
}

function gameSportLabel(sport) {
  if (sport === 'softball') return '🥎 慢垒';
  if (sport === 'baseball') return '⚾ 棒球';
  return '⚾🥎 综合';
}

function buildGameMoveTournamentOptions(tournaments) {
  return [{ id: '', label: '请选择目标赛事' }].concat((tournaments || []).map(tournament => ({
    id: tournament.id,
    label: `${tournamentTypeLabel(tournament.type)} ${tournament.shortName || tournament.name} · ${tournament.season || '未设赛季'}`,
  })));
}

function buildGameFilterOptions(tournaments) {
  return [
    { id: '', label: '全部比赛' },
    { id: '__unassigned', label: '⚠ 未关联赛事' },
  ].concat((tournaments || []).map(tournament => ({
    id: tournament.id,
    label: `${tournamentTypeLabel(tournament.type)} ${tournament.shortName || tournament.name}`,
  })));
}

function pointGameSourceGames(data) {
  return mergeGamesById(data.games || [], data.pointGameCandidateGames || []);
}

function buildPointGameState({ games, tournaments, selectedId = '', query = '' }) {
  const pointGameOptions = buildPointGameOptions(games, tournaments, query, selectedId);
  const pointGameIndex = pickBlankableOptionIndex(pointGameOptions, selectedId);
  const option = pointGameOptions[pointGameIndex] || pointGameOptions[0];
  return {
    pointGameSearch: query,
    pointGameOptions,
    pointGameIndex,
    pointGameId: option.id || '',
    pointGameLabel: option.label || '不关联具体比赛',
    pointGameMeta: option.meta || '该调整不会出现在某场比赛链接中',
  };
}

function buildPointGameOptions(games, tournaments, query = '', selectedId = '') {
  const q = String(query || '').trim().toLowerCase();
  const tournamentMap = new Map((tournaments || []).map(tournament => [tournament.id, tournament]));
  const options = (games || [])
    .filter(game => {
      if (!q) return true;
      const tournament = game.tournamentId ? tournamentMap.get(game.tournamentId) : null;
      return [
        game.away,
        game.home,
        game.date,
        game.venue,
        game.season,
        game.seasonName,
        gameSportLabel(game.sport),
        tournament?.name,
        tournament?.shortName,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.id || '').localeCompare(String(b.id || '')))
    .slice(0, 40)
    .map(game => pointGameOption(game, tournamentMap));
  if (selectedId && !options.some(option => option.id === selectedId)) {
    const selected = (games || []).find(game => game.id === selectedId);
    if (selected) options.unshift(pointGameOption(selected, tournamentMap));
  }
  return [{ id: '', label: '不关联具体比赛', meta: '该调整不会出现在某场比赛链接中' }].concat(options);
}

function pointGameOption(game, tournamentMap) {
  const tournament = game.tournamentId ? tournamentMap.get(game.tournamentId) : null;
  const hasScore = game.awayScore !== null && game.awayScore !== undefined
    && game.homeScore !== null && game.homeScore !== undefined;
  const score = hasScore ? `${game.awayScore}:${game.homeScore}` : 'vs';
  const tournamentText = tournament
    ? `${tournamentTypeLabel(tournament.type)} ${tournament.shortName || tournament.name}`
    : (game.seasonName || game.season || '未关联赛事');
  return {
    id: game.id,
    label: `${game.date || '日期未设'} · ${game.away || '客队'} ${score} ${game.home || '主队'}`,
    meta: [tournamentText, gameSportLabel(game.sport), game.venue || '场地未设'].filter(Boolean).join(' · '),
  };
}

function pickBlankableOptionIndex(options, selectedId) {
  if (!selectedId) return 0;
  const found = (options || []).findIndex(option => option.id === selectedId);
  return found >= 0 ? found : 0;
}

function normalizeSelectedEventIds(selectedEventIds, events) {
  const eventIdSet = new Set((events || []).map(event => event.id));
  return Array.from(new Set(selectedEventIds || [])).filter(id => eventIdSet.has(id));
}

function buildEventBatchState({ events, selectedEventIds, query = '', tag = '' }) {
  const selectedIds = normalizeSelectedEventIds(selectedEventIds, events);
  return buildEventSelectionState({ events, selectedEventIds: selectedIds, query, tag });
}

function buildEventSelectionState({ events, selectedEventIds, query = '', tag = '' }) {
  const selectedIds = normalizeSelectedEventIds(selectedEventIds, events);
  return {
    selectedEventIds: selectedIds,
    selectedEventCount: selectedIds.length,
    visibleBatchEvents: buildVisibleBatchEvents(events, selectedIds, query, tag),
  };
}

function buildVisibleBatchEvents(events, selectedEventIds, query = '', tag = '') {
  const selectedSet = new Set(selectedEventIds || []);
  const q = String(query || '').trim().toLowerCase();
  return (events || [])
    .filter(event => {
      const kind = eventTagKind(event.tag);
      if (tag && kind !== tag) return false;
      if (!q) return true;
      return [
        event.title,
        event.tag,
        eventTagLabel(event.tag),
        event.date,
        event.location,
        event.body,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    })
    .map(event => ({
      id: event.id,
      selected: selectedSet.has(event.id),
      title: event.title || '未命名接龙',
      tagLabel: eventTagLabel(event.tag),
      meta: [event.date || '日期未设', event.location || '地点未设'].filter(Boolean).join(' · '),
    }));
}

function currentEventTagFilter(data) {
  return (data.eventTagFilterOptions[data.eventTagFilterIndex] || eventTagFilterOptions[0]).value || '';
}

function eventTagKind(tag) {
  const value = String(tag || '').toLowerCase();
  if (value.includes('training') || value.includes('训练')) return 'training';
  if (value.includes('game') || value.includes('比赛')) return 'game';
  if (value.includes('tournament') || value.includes('杯赛') || value.includes('联赛')) return 'tournament';
  return 'event';
}

function eventTagLabel(tag) {
  const kind = eventTagKind(tag);
  if (kind === 'training') return '🏋️ 训练';
  if (kind === 'game') return '⚾ 比赛';
  if (kind === 'tournament') return '🏆 杯赛/联赛';
  return '📅 活动';
}

function normalizeSelectedGameIds(selectedGameIds, games) {
  const gameIdSet = new Set((games || []).map(game => game.id));
  return Array.from(new Set(selectedGameIds || [])).filter(id => gameIdSet.has(id));
}

function buildGameBatchState({ games, tournaments, selectedGameIds, targetId, filterId }) {
  const gameMoveTournamentOptions = buildGameMoveTournamentOptions(tournaments);
  const gameMoveTournamentIndex = pickBlankableOptionIndex(gameMoveTournamentOptions, targetId);
  const gameFilterOptions = buildGameFilterOptions(tournaments);
  const gameFilterIndex = pickBlankableOptionIndex(gameFilterOptions, filterId);
  const selectedIds = normalizeSelectedGameIds(selectedGameIds, games);
  return {
    gameMoveTournamentOptions,
    gameMoveTournamentIndex,
    gameMoveTournamentLabel: (gameMoveTournamentOptions[gameMoveTournamentIndex] || gameMoveTournamentOptions[0]).label,
    gameFilterOptions,
    gameFilterIndex,
    gameFilterLabel: (gameFilterOptions[gameFilterIndex] || gameFilterOptions[0]).label,
    ...buildGameSelectionState({
      games,
      tournaments,
      filterId: (gameFilterOptions[gameFilterIndex] || {}).id || '',
      selectedGameIds: selectedIds,
    }),
  };
}

function buildGameSelectionState({ games, tournaments, filterId, selectedGameIds }) {
  const selectedIds = normalizeSelectedGameIds(selectedGameIds, games);
  return {
    selectedGameIds: selectedIds,
    selectedGameCount: selectedIds.length,
    visibleBatchGames: buildVisibleBatchGames(games, tournaments, selectedIds, filterId),
  };
}

function buildVisibleBatchGames(games, tournaments, selectedGameIds, filterId) {
  const selectedSet = new Set(selectedGameIds || []);
  const tournamentMap = new Map((tournaments || []).map(tournament => [tournament.id, tournament]));
  return (games || [])
    .filter(game => {
      if (!filterId) return true;
      if (filterId === '__unassigned') return !game.tournamentId;
      if (game.tournamentId === filterId) return true;
      const tournament = tournamentMap.get(filterId);
      return !game.tournamentId && tournament?.season && game.season === tournament.season;
    })
    .map(game => {
      const tournament = game.tournamentId ? tournamentMap.get(game.tournamentId) : null;
      const hasScore = game.awayScore !== null && game.awayScore !== undefined
        && game.homeScore !== null && game.homeScore !== undefined;
      const score = hasScore
        ? `${game.awayScore}:${game.homeScore}`
        : 'vs';
      const fallbackSeason = game.seasonName || game.season || '';
      return {
        id: game.id,
        selected: selectedSet.has(game.id),
        title: `${game.away || '客队'} ${score} ${game.home || '主队'}`,
        tournamentLabel: tournament
          ? `${tournamentTypeLabel(tournament.type)} ${tournament.shortName || tournament.name}`
          : (fallbackSeason ? `⚠ 未关联 · ${fallbackSeason}` : '⚠ 未关联赛事'),
        meta: [game.date || '日期未设', gameSportLabel(game.sport), game.venue || '场地未设'].filter(Boolean).join(' · '),
      };
    });
}

function currentGameFilterId(data) {
  return (data.gameFilterOptions[data.gameFilterIndex] || {}).id || '';
}

function currentGameMoveTournamentId(data) {
  return (data.gameMoveTournamentOptions[data.gameMoveTournamentIndex] || {}).id || '';
}

function normalizeNextOffset(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeGamesById(existing, incoming) {
  const seen = new Set();
  return []
    .concat(existing || [])
    .concat(incoming || [])
    .filter(game => {
      const id = game && game.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
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

function selectedGameMoveTournament(data) {
  const option = data.gameMoveTournamentOptions[data.gameMoveTournamentIndex] || {};
  if (!option.id) return null;
  return (data.tournaments || []).find(tournament => tournament.id === option.id) || null;
}

function buildInviteUserOptions(users) {
  return [{ id: '', label: '请选择用户' }].concat((users || []).map(user => {
    const bound = user.boundPlayerName
      ? `已绑 #${user.boundPlayerNumber || '-'} ${user.boundPlayerName}`
      : '未绑定';
    const email = user.email ? ` · ${user.email}` : '';
    return {
      id: user.id,
      label: `${user.displayName || user.id}${email} · ${bound}`,
    };
  }));
}

function buildInvitePlayerOptions(players) {
  return [{ id: '', label: '请选择正式球员' }].concat((players || [])
    .filter(player => player.level === 'verified' || player.level === undefined)
    .map(player => ({
      id: player.id,
      label: `#${player.number || '-'} ${player.name} · ${player.position || '位置待定'}`,
    })));
}

function buildBindCodePlayerOptions(players) {
  return buildInvitePlayerOptions(players);
}

function selectedBindCodePlayer(data) {
  const option = data.bindCodePlayerOptions[data.bindCodePlayerIndex] || {};
  if (!option.id) return null;
  return (data.players || []).find(player => player.id === option.id) || null;
}

function buildVisibleBindCodes(bindCodes, players, query) {
  const q = String(query || '').trim().toLowerCase();
  const playerMap = new Map((players || []).map(player => [player.id, player]));
  return (bindCodes || []).map(code => {
    const player = playerMap.get(code.playerId) || {};
    const playerText = player.name
      ? `#${player.number || '-'} ${player.name}`
      : `球员 ${code.playerId || '-'}`;
    const statusLabel = code.used ? '已使用' : '未使用';
    return {
      ...code,
      playerText,
      statusLabel,
      statusClass: code.used ? 'used' : 'unused',
      meta: [
        player.position || '',
        code.createdAt ? `创建 ${String(code.createdAt).slice(0, 10)}` : '',
        code.usedBy ? `使用人 ${code.usedBy}` : '',
        code.usedAt ? `使用 ${String(code.usedAt).slice(0, 10)}` : '',
      ].filter(Boolean).join(' · '),
      searchable: [code.code, player.name, player.number, player.position, statusLabel, code.usedBy].filter(Boolean).join(' ').toLowerCase(),
    };
  }).filter(item => !q || item.searchable.includes(q));
}

function selectedPlayer(data) {
  return selectedPlayerFromOptions(data.players, data.playerOptions, data.playerIndex);
}

function selectedPlayerFromOptions(players, options, index) {
  const option = (options || [])[index] || {};
  if (!option.id) return null;
  return (players || []).find(player => player.id === option.id) || null;
}

function currentPlayerId(data) {
  return (data.playerOptions[data.playerIndex] || {}).id || '';
}

function formatPointAdjustments(adjustments) {
  return (adjustments || []).slice(0, 8).map(item => {
    const delta = Number(item.delta || 0);
    const deltaText = `${delta > 0 ? '+' : ''}${delta}`;
    return {
      ...item,
      deltaText,
      deltaClass: delta >= 0 ? 'positive' : 'negative',
      reasonText: item.reason || '未填写原因',
      meta: [
        item.gameId ? `关联比赛 ${item.gameId}` : '未关联比赛',
        item.createdAt ? `创建 ${formatDateTime(item.createdAt)}` : '',
      ].filter(Boolean).join(' · '),
    };
  });
}

function formatAttendanceRecords(attendances) {
  return (attendances || []).slice(0, 8).map(item => ({
    ...item,
    kindLabel: item.kind === 'training' ? '🏋️ 训练签到' : '📅 活动出席',
    dateText: item.date || '日期未设',
    noteText: item.note || '无备注',
    meta: [
      item.refId ? `关联接龙 ${item.refId}` : '',
      item.createdAt ? `创建 ${formatDateTime(item.createdAt)}` : '',
    ].filter(Boolean).join(' · '),
  }));
}

function formatLeaderboardOverview(rows) {
  return (rows || []).slice(0, 12).map((row, index) => {
    const player = row.player || {};
    const breakdown = row.breakdown || {};
    const breakdownText = [
      breakdown.base ? `出场 ${breakdown.base}` : '',
      breakdown.performance ? `表现 ${signedText(breakdown.performance)}` : '',
      breakdown.awards ? `奖项 ${breakdown.awards}` : '',
      breakdown.manual ? `手动 ${signedText(breakdown.manual)}` : '',
    ].filter(Boolean).join(' · ') || '暂无拆分';
    return {
      playerId: player.id || row.playerId || '',
      rank: index + 1,
      rankClass: index < 3 ? 'is-top' : '',
      displayName: player.name || row.name || '队员',
      meta: [player.number ? `#${player.number}` : '', player.position || '守位待定'].filter(Boolean).join(' · '),
      total: Number(row.total || 0),
      breakdownText,
    };
  });
}

function signedText(value) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${n}`;
}

function formatDateTime(value) {
  return String(value || '').slice(0, 16).replace('T', ' ');
}

function selectedMergeSource(data) {
  return selectedMergePlayerFromOptions(data.players, data.mergeSourceOptions, data.mergeSourceIndex);
}

function selectedMergeTarget(data) {
  return selectedMergePlayerFromOptions(data.players, data.mergeTargetOptions, data.mergeTargetIndex);
}

function selectedInviteUser(data) {
  const option = data.inviteUserOptions[data.inviteUserIndex] || {};
  if (!option.id) return null;
  return (data.inviteUsers || []).find(user => user.id === option.id) || null;
}

function selectedInvitePlayer(data) {
  const option = data.invitePlayerOptions[data.invitePlayerIndex] || {};
  if (!option.id) return null;
  return {
    id: option.id,
    label: option.label,
  };
}

function selectedDirectBindPlayer(data) {
  const option = data.directBindPlayerOptions[data.directBindPlayerIndex] || {};
  if (!option.id) return null;
  return {
    id: option.id,
    label: option.label,
  };
}

function confirmMerge(source, target, keepAlias) {
  return new Promise(resolve => {
    if (!wx.showModal) {
      resolve(true);
      return;
    }
    wx.showModal({
      title: '确认合并球员',
      content: `将“${source.name}”并入“${target.name}”。源档案会删除${keepAlias ? '，源姓名会保留为目标别名' : ''}。`,
      confirmText: '确认合并',
      confirmColor: '#d8b75e',
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

function confirmAction(title, content, confirmText = '确认') {
  return new Promise(resolve => {
    if (!wx.showModal) {
      resolve(true);
      return;
    }
    wx.showModal({
      title,
      content,
      confirmText,
      confirmColor: '#ff8a8a',
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

function formatAuditLog(log) {
  return {
    ...log,
    title: log.summary || actionLabel(log.action),
    actorText: log.actorName ? `操作人 ${log.actorName}` : '系统记录',
    meta: [
      actionLabel(log.action),
      log.targetType ? `对象 ${log.targetType}` : '',
      log.targetId ? `ID ${log.targetId}` : '',
    ].filter(Boolean).join(' · '),
    timeText: log.createdAt ? String(log.createdAt).slice(0, 16).replace('T', ' ') : '',
  };
}

function actionLabel(action) {
  const map = {
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
    manual_point_adjustment: '积分调整',
    points_adjust: '积分调整',
    points_adjust_delete: '删除积分调整',
    attendance_create: '补录签到',
    attendance_delete: '删除签到',
    hall_of_fame_create: '名人堂授予',
    hall_of_fame_delete: '名人堂移出',
    send_notification: '发送通知',
    reset_password: '重置密码',
    bind_user_player: '直接绑定',
    unbind_user_player: '解除绑定',
    create_app_connect_code: '网页关联码',
    app_connect_code_create: '网页关联码',
    delete_user: '删除账号',
    delete_tournament: '删除赛事',
  };
  return map[action] || action || '审计记录';
}

function buildStats(requests, players, events, highlights, pendingHighlightTotal) {
  const verified = players.filter(player => player.level === 'verified').length;
  const casual = players.filter(player => player.level !== 'verified').length;
  const total = Number(pendingHighlightTotal);
  const pendingHighlights = Number.isFinite(total)
    ? total
    : highlights.filter(item => item.status === 'pending').length;
  return [
    { label: '待审绑定', value: requests.length },
    { label: '正式球员', value: verified },
    { label: '试训队员', value: casual },
    { label: '近期接龙', value: events.length },
    { label: '待审时刻', value: pendingHighlights },
  ];
}

function formatBindRequest(request) {
  const target = request.requestedPlayerName
    ? `#${request.requestedPlayerNumber || '-'} ${request.requestedPlayerName}`
    : '目标球员';
  const status = request.status || 'pending';
  return {
    ...request,
    target,
    applicant: request.realName || request.nickname || request.userDisplayName || '申请人',
    statusLabel: bindRequestStatusLabel(status),
    statusClass: status,
    isPending: status === 'pending',
    meta: [
      request.hasWxIdentity ? '微信登录已关联' : '',
      request.nickname ? `昵称 ${request.nickname}` : '',
      request.contactTail ? `核验 ${request.contactTail}` : '',
      request.jerseyNumber ? `号码 ${request.jerseyNumber}` : '',
      request.currentPlayerName ? `当前 ${request.currentPlayerName}` : '',
      request.reviewNote ? `审批 ${request.reviewNote}` : '',
      request.source ? `来源 ${sourceLabel(request.source)}` : '',
    ].filter(Boolean).join(' · '),
  };
}

function bindRequestStatusLabel(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  };
  return map[status] || status || '待审核';
}

function sourceLabel(source) {
  const map = {
    mini: '小程序',
    web: '网页',
    mini_relay_paste: '接龙导入',
    wechat_group_paste: '群接龙',
  };
  return map[source] || source;
}
