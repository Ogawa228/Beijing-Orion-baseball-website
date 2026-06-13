const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  throw new Error(message);
}

function assertFile(rel) {
  if (!exists(rel)) fail(`missing file: ${rel}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match ? match[1] : '';
}

function assertCss(css, selector, tokens, messagePrefix) {
  const block = cssBlock(css, selector);
  assert(block, `${messagePrefix} missing selector ${selector}`);
  tokens.forEach(token => {
    assert(block.includes(token), `${messagePrefix} ${selector} missing ${token}`);
  });
}

function assertRadiusAtLeast(css, selector, minRpx, messagePrefix) {
  const block = cssBlock(css, selector);
  assert(block, `${messagePrefix} missing selector ${selector}`);
  const match = block.match(/border-radius:\s*(\d+)rpx/);
  assert(match && Number(match[1]) >= minRpx, `${messagePrefix} ${selector} border-radius should be at least ${minRpx}rpx`);
}

function checkProjectConfig() {
  const config = readJson(path.join(root, 'project.config.json'));
  assert(config.appid === 'wx8ad6ccfa1b8f040a', `unexpected appid: ${config.appid}`);
  assert(config.miniprogramRoot === 'miniprogram/', 'miniprogramRoot must be miniprogram/');
  assert(config.compileType === 'miniprogram', 'compileType must be miniprogram');
  const conditions = (((config.condition || {}).miniprogram || {}).list || []).map(x => x.pathName);
  ['pages/home/home', 'pages/login/login', 'pages/legal/legal', 'pages/contact/contact', 'pages/checkin/checkin', 'pages/players/player-list/player-list', 'pages/players/player-detail/player-detail', 'pages/hall-of-fame/hall-of-fame', 'pages/highlights/highlights', 'pages/score/create/create', 'pages/games/game-list/game-list', 'pages/tournaments/tournament-detail/tournament-detail', 'pages/tournaments/tournament-manage/tournament-manage', 'pages/games/game-edit/game-edit', 'pages/games/game-import/game-import', 'pages/admin/admin', 'pages/admin/audit/audit'].forEach(page => {
    assert(conditions.includes(page), `missing devtools condition for ${page}`);
  });
}

function checkAppJson() {
  const app = readJson(path.join(miniRoot, 'app.json'));
  const pages = app.pages || [];
  assert(pages.length >= 10, 'app.json should register mini program pages');
  assert(app.lazyCodeLoading !== 'requiredComponents', 'disable lazyCodeLoading requiredComponents until DevTools stops missing deep WXML files');
  pages.forEach(page => {
    ['js', 'json', 'wxml', 'wxss'].forEach(ext => assertFile(`miniprogram/${page}.${ext}`));
  });
  [
    'pages/events/event-create/event-create',
    'pages/legal/legal',
    'pages/contact/contact',
    'pages/checkin/checkin',
    'pages/players/player-list/player-list',
    'pages/players/player-detail/player-detail',
    'pages/hall-of-fame/hall-of-fame',
    'pages/highlights/highlights',
    'pages/score/create/create',
    'pages/score/live/live',
    'pages/games/game-detail/game-detail',
    'pages/tournaments/tournament-detail/tournament-detail',
    'pages/tournaments/tournament-manage/tournament-manage',
    'pages/games/game-edit/game-edit',
    'pages/games/game-import/game-import',
    'pages/admin/admin',
    'pages/admin/audit/audit',
  ].forEach(page => assert(pages.includes(page), `app.json missing page ${page}`));
  ['chooseLocation', 'getLocation'].forEach(api => {
    assert((app.requiredPrivateInfos || []).includes(api), `app.json must declare ${api}`);
  });
  assert(!(app.requiredPrivateInfos || []).includes('getFuzzyLocation'), 'app.json must not declare getFuzzyLocation together with getLocation for WeChat CI upload');
  assert(app.permission && app.permission['scope.userLocation'], 'app.json must describe scope.userLocation');
}

function checkCloudConfig() {
  const text = fs.readFileSync(path.join(miniRoot, 'utils/config.js'), 'utf8');
  assert(text.includes("cloudEnv: 'prod-d5gtkxdyu7263e95b'"), 'cloudEnv mismatch');
  assert(text.includes("cloudService: 'express-knlw'"), 'cloudService mismatch');
  assert(text.includes("cloudResourceAppid: 'wx7dce60930ee10898'"), 'cloudResourceAppid mismatch');
  const appJs = fs.readFileSync(path.join(miniRoot, 'app.js'), 'utf8');
  assert(appJs.includes('!ORION_CONFIG.cloudResourceAppid || ORION_CONFIG.cloudInitEnv'), 'app.js should not initialize the default cloud instance for cross-resource calls unless cloudInitEnv is set');
  const request = fs.readFileSync(path.join(miniRoot, 'utils/request.js'), 'utf8');
  assert(request.includes('cloud.callContainer({'), 'request.js should use wx.cloud.callContainer');
  assert(request.includes('new cloud.Cloud({') && request.includes('resourceAppid: ORION_CONFIG.cloudResourceAppid') && request.includes('resourceEnv: ORION_CONFIG.cloudEnv'), 'request.js should support cross-environment cloud resources');
  assert(request.includes('config: { env: ORION_CONFIG.cloudEnv }'), 'request.js should keep direct callContainer config.env fallback');
  assert(request.includes('云环境未授权当前小程序') && request.includes('-601012'), 'request.js should normalize unauthorized environment errors');
  assert(request.includes("'X-WX-SERVICE'"), 'request.js must send X-WX-SERVICE');
}

function checkCoreBusinessSurface() {
  const files = [
    'miniprogram/pages/login/login.js',
    'miniprogram/pages/legal/legal.js',
    'miniprogram/pages/contact/contact.js',
    'miniprogram/pages/contact/contact.wxml',
    'miniprogram/pages/events/event-detail/event-detail.js',
    'miniprogram/pages/checkin/checkin.js',
    'miniprogram/pages/players/player-list/player-list.js',
    'miniprogram/pages/players/player-detail/player-detail.js',
    'miniprogram/pages/hall-of-fame/hall-of-fame.js',
    'miniprogram/pages/hall-of-fame/hall-of-fame.wxml',
    'miniprogram/pages/highlights/highlights.js',
    'miniprogram/pages/highlights/highlights.wxml',
    'miniprogram/pages/notifications/notifications.js',
    'miniprogram/pages/notifications/notifications.wxml',
    'miniprogram/pages/score/create/create.js',
    'miniprogram/pages/score/live/live.js',
    'miniprogram/pages/games/game-list/game-list.js',
    'miniprogram/pages/tournaments/tournament-detail/tournament-detail.js',
    'miniprogram/pages/tournaments/tournament-detail/tournament-detail.wxml',
    'miniprogram/pages/tournaments/tournament-manage/tournament-manage.js',
    'miniprogram/pages/tournaments/tournament-manage/tournament-manage.wxml',
    'miniprogram/pages/games/game-detail/game-detail.wxml',
    'miniprogram/pages/games/game-edit/game-edit.js',
    'miniprogram/pages/games/game-edit/game-edit.wxml',
    'miniprogram/pages/games/game-import/game-import.js',
    'miniprogram/pages/games/game-import/game-import.wxml',
    'miniprogram/pages/admin/admin.js',
    'miniprogram/pages/admin/admin.wxml',
    'miniprogram/pages/admin/audit/audit.js',
    'miniprogram/pages/admin/audit/audit.wxml',
    'miniprogram/utils/labels.js',
    'miniprogram/utils/player-identity.js',
    'scripts/test-miniprogram-request.js',
    'scripts/test-miniprogram-flows.js',
    'scripts/test-miniprogram-score.js',
    'server/routes/event-signups.js',
    'server/routes/checkins.js',
    'server/routes/auth.js',
    'server/routes/notifications.js',
    'server/routes/players.js',
    'server/gamechanger-import.js',
    'scripts/test-gamechanger-server-import.js',
    'scripts/test-players-import-route.js',
  ];
  files.forEach(assertFile);
  const identityUtils = fs.readFileSync(path.join(root, 'miniprogram/utils/player-identity.js'), 'utf8');
  ['playerIdentity', 'viewerCanReveal', 'publicDisplayName', 'publicAvatar', 'identity-frosted-name', 'identity-frosted-avatar'].forEach(token => {
    assert(identityUtils.includes(token), `player identity helper missing ${token}`);
  });
  const appWxss = fs.readFileSync(path.join(root, 'miniprogram/app.wxss'), 'utf8');
  ['.identity-frosted-name', '.identity-frosted-avatar', 'filter: blur'].forEach(token => {
    assert(appWxss.includes(token), `global frosted identity style missing ${token}`);
  });
  const loginJs = fs.readFileSync(path.join(root, 'miniprogram/pages/login/login.js'), 'utf8');
  ['https://www.猎户座棒垒球.cn/legal.html', 'LEGAL_PAGE_URL', 'LEGAL_VERSION', 'onConsentChange', 'allConsented', 'legalAccepted', 'personalInfoAccepted', 'guardianConfirmed'].forEach(token => {
    assert(loginJs.includes(token), `login legal/trial flow missing ${token}`);
  });
  const loginWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/login/login.wxml'), 'utf8');
  ['直接选择自己的正式球员档案提交绑定申请', '<navigator class="legal-link" url="{{legalPageUrl}}" hover-class="legal-link-hover">用户协议、隐私政策和个人信息处理规则</navigator>', '<checkbox-group', 'personal-info', 'guardian'].forEach(token => {
    assert(loginWxml.includes(token), `login legal UI missing ${token}`);
  });
  assert(!loginWxml.includes('<button class="legal-link"'), 'login legal link should not be rendered as a button');
  ['linkWechat', 'connectCode', 'toggleLinkPanel', '网页关联码'].forEach(token => {
    assert(!loginJs.includes(token) && !loginWxml.includes(token), `login should not expose connect-code flow: ${token}`);
  });
  assert(loginJs.includes("'/pages/bind/bind'") && loginWxml.includes('申请绑定'), 'login should route unverified users to bind request flow');
  const homeWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.wxml'), 'utf8');
  assert(homeWxml.includes('<navigator class="link" url="/pages/events/event-list/event-list"'), 'home section action should use navigator links');
  assert(!homeWxml.includes('<button class="link"'), 'home section action links should not use button layout');
  const profileWxmlAdmin = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.wxml'), 'utf8');
  assert(profileWxmlAdmin.includes('/pages/admin/admin') && profileWxmlAdmin.includes('管理后台'), 'profile should expose admin console for privileged users');
  assert(!homeWxml.includes('quick-card'), 'home should stay slim: primary nav lives in the custom tabBar, not home quick cards');
  const legalWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/legal/legal.wxml'), 'utf8');
  assert(legalWxml.includes('<web-view src="{{url}}">'), 'legal page should link to external legal.html through web-view');
  const authRoute = fs.readFileSync(path.join(root, 'server/routes/auth.js'), 'utf8');
  ['MINI_LEGAL_URL', 'https://www.猎户座棒垒球.cn/legal.html', 'legal_consent_required', 'personalInfoAccepted', 'guardianConfirmed', 'legalConsent'].forEach(token => {
    assert(authRoute.includes(token), `wx-login legal consent missing ${token}`);
  });
  ["router.post('/link-wechat'", 'wechat_already_linked', 'link_wechat_identity'].forEach(token => {
    assert(authRoute.includes(token), `auth route link-wechat fallback missing ${token}`);
  });
  const webDbJs = fs.readFileSync(path.join(root, 'assets/js/db.js'), 'utf8');
  assert(webDbJs.includes('createAppConnectCode'), 'web db.js should expose self-service connect code helper');
  const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert(dashboardHtml.includes('generateMiniConnectCode') && dashboardHtml.includes('生成小程序关联码'), 'dashboard should expose mini connect code generator');
  const eventDetail = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-detail/event-detail.js'), 'utf8');
  assert(eventDetail.includes("submitSignup('tentative')"), 'event detail should support tentative relay status');
  assert(eventDetail.includes('onShareAppMessage') && eventDetail.includes('猎户接龙'), 'event detail should support sharing relay cards to WeChat groups');
  assert(eventDetail.includes("api.post('/event-signups/import'") && eventDetail.includes('importRelayPaste'), 'event detail should support admin paste import for WeChat relay text');
  assert(eventDetail.includes('wx.getClipboardData') && eventDetail.includes('pasteAndImportRelay'), 'event detail should support one-tap clipboard relay import');
  assert(eventDetail.includes('canImportSignups') && eventDetail.includes("permissions.includes('events:write')"), 'event detail paste import should be admin/permission gated');
  ["api.post('/event-signups/admin-upsert'", 'adminUpsertSignup', 'manualPlayerOptions', 'MANUAL_PLAYER_PAGE_LIMIT', 'manualPlayerParams', 'manualPlayersHasMore', 'manualPlayersNextOffset', 'loadMoreManualPlayers', "api.get('/players', manualPlayerParams", 'updateSignupStatus', 'api.patch(`/event-signups/', 'editEvent', 'deleteEvent', 'api.del(`/events/', 'copySourceLink', 'previewEventImage', 'heroCover', "api.get('/games'", 'LINKED_GAME_PAGE_LIMIT', 'linkedGamesHasMore', 'linkedGamesNextOffset', 'loadMoreLinkedGames', 'mergeLinkedGamesById', 'linkedGames', 'startScoreFromEvent', 'openGame'].forEach(token => {
    assert(eventDetail.includes(token), `event detail admin signup management missing ${token}`);
  });
  const eventDetailWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-detail/event-detail.wxml'), 'utf8');
  ['wx:if="{{event}}" class="section card panel stack"', 'event-cover-hero', 'event-gallery', 'previewEventImage', '复制外部链接', '关联比赛', '记录比赛', 'linkedGames', '加载更多关联比赛', '管理员手动增补', '搜索姓名 / 背号后选择球员', '加载更多球员', '加入/更新名单', 'data-status="cancelled"', '未建档成员只作为手动姓名', '群接龙导入', '粘贴并识别群接龙', '识别输入框内容', '管理接龙', '编辑接龙', '删除接龙'].forEach(token => {
    assert(eventDetailWxml.includes(token), `event detail admin signup UI missing ${token}`);
  });
  const checkin = fs.readFileSync(path.join(root, 'miniprogram/pages/checkin/checkin.js'), 'utf8');
  assert(checkin.includes('wx.getLocation'), 'checkin should call wx.getLocation after precise location permission is enabled');
  assert(!checkin.includes('wx.getFuzzyLocation'), 'checkin should not call wx.getFuzzyLocation when getLocation is declared for upload');
  assert(checkin.includes('getBestLocation'), 'checkin should use a single location entrypoint');
  assert(checkin.includes('scope.userLocation'), 'checkin should explicitly request location scope');
  assert(checkin.includes("api.post('/checkins/direct'"), 'checkin should post /checkins/direct');
  ['loadRelays', 'relayKind', 'mini_program_relay', 'pointDeltaText', 'totalPointsText', 'goPoints', 'EVENT_PAGE_LIMIT', "api.get('/events', {", "api.get(`/events/${initialEventId}`)", 'relaysHasMore', 'relaysNextOffset', 'loadMoreRelays', 'mergeEventsById', 'normalizeNextOffset'].forEach(token => {
    assert(checkin.includes(token), `checkin result missing ${token}`);
  });
  const checkinWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/checkin/checkin.wxml'), 'utf8');
  assert(checkinWxml.includes('签到接龙') && !checkinWxml.includes('签到类型'), 'checkin page should be relay-based instead of type-based');
  assert(checkinWxml.includes('加载更多接龙') && checkinWxml.includes('loadingMoreRelays'), 'checkin page should support paged relay loading');
  const checkinsRoute = fs.readFileSync(path.join(root, 'server/routes/checkins.js'), 'utf8');
  ['pointDelta', 'points', 'getPlayerPoints', 'trialProgress', 'AUTO_UPGRADE_TRAINING_COUNT', 'relay'].forEach(token => {
    assert(checkinsRoute.includes(token), `checkins route missing ${token}`);
  });
  const eventSignupsRoute = fs.readFileSync(path.join(root, 'server/routes/event-signups.js'), 'utf8');
  ['parseRelayPaste', 'manual_name', 'wechat_group_paste', "router.post('/import'", "router.post('/admin-upsert'", "router.patch('/:id'", 'event_signup_admin_update', 'resolveRegisteredPlayerName'].forEach(token => {
    assert(eventSignupsRoute.includes(token), `event signup import missing ${token}`);
  });
  const highlightsRoute = fs.readFileSync(path.join(root, 'server/routes/highlights.js'), 'utf8');
  ["req.query.public === 'true'", "status IN ('published', 'approved')", 'LIMIT ?', 'includeTotal', 'includeGame', 'loadGamesForHighlights', 'rowToHighlightGame', 'COUNT(*) AS total'].forEach(token => {
    assert(highlightsRoute.includes(token), `highlights public list optimization missing ${token}`);
  });
  const eventsRoute = fs.readFileSync(path.join(root, 'server/routes/events.js'), 'utf8');
  ['logAudit', 'event_create', 'event_update', 'event_delete', 'changedKeys', 'signupCount', 'loadEventsWithSignupCounts', 'activeSignupCount', 'ensureEventMetadataColumn', 'metadata', 'parseLimit', 'nextOffset'].forEach(token => {
    assert(eventsRoute.includes(token), `events route audit missing ${token}`);
  });
  const adminJs = fs.readFileSync(path.join(root, 'miniprogram/pages/admin/admin.js'), 'utf8');
  ['bind_requests:review', 'points:write', 'attendances:write', 'tournaments:write', 'games:draft', 'games:revise', 'hof:write', 'highlights:write', 'notifications:write', 'users:read', 'users:grant_admin', 'users:password_reset', 'destructive:delete', 'audit:game_read', 'system:settings', "api.get('/admin/bind-requests'", 'bindRequestStatusOptions', 'onBindRequestStatusChange', 'bindRequestStatusLabel', "api.get('/admin/users'", 'ADMIN_USER_PAGE_LIMIT', 'adminUsersHasMore', 'adminUsersNextOffset', 'loadMoreAdminUsers', 'mergeAdminUsersById', 'adminBindFilterOptions', 'onAdminBindFilterChange', 'matchesAdminBindStatus', 'adminUserSortOptions', 'onAdminUserSortChange', 'onAdminUserSearchInput', 'matchesAdminSearch', 'compareAdminUsers', "api.patch(`/admin/users/", "api.post(`/admin/users/${target.id}/reset-password", "api.get('/tournaments'", "api.get('/games'", 'ADMIN_PLAYER_PAGE_LIMIT', 'adminPlayerParams', "api.get('/players', adminPlayerParams", 'playersHasMore', 'playersNextOffset', 'loadMoreAdminPlayers', 'mergePlayersById', 'visiblePlayerPool', 'playerPoolSummary', 'playerPanelTabs', 'activePlayerPanel', 'switchPlayerPanel', 'onPlayerPoolSearchInput', 'onPlayerPoolLevelChange', 'openPoolPlayer', 'openPoolHighlights', 'selectPoolPlayerRecords', 'selectPoolMergeSource', 'upgradePoolPlayer', "api.post(`/players/${id}/upgrade", 'visibleAttendancePlayers', 'selectedAttendancePlayerIds', 'onAttendancePlayerSelectionChange', 'selectAllAttendancePlayers', 'clearAttendancePlayers', 'pointGameId', 'pointGameOptions', 'onPointGameSearchInput', 'onPointGameChange', 'clearPointGame', 'ADMIN_EVENT_PAGE_LIMIT', "api.get('/events', { limit: ADMIN_EVENT_PAGE_LIMIT", 'eventsHasMore', 'eventsNextOffset', 'loadMoreAdminEvents', 'mergeEventsById', "api.get('/admin/audit-logs'", "api.post('/players'", "api.post('/players/import'", "api.post('/upload/base64'", "chooseAndUploadImage('player'", 'wx.chooseMedia', 'wx.getFileSystemManager().readFile', 'chooseCreatePlayerPhoto', 'clearCreatePlayerPhoto', 'createPlayerPhoto', 'chooseBatchPlayerPhotos', 'clearBatchPlayerPhotos', 'batchPlayerPhotos', 'imageFileBaseName', 'createPlayer', 'importPlayersBatch', 'playerCreateLevelOptions', '试训队员', '正式球员', 'player_delete', "api.get('/leaderboard'", 'leaderboardOverview', 'formatLeaderboardOverview', 'openLeaderboardPlayer', "api.post('/points-adjustments'", "api.get('/points-adjustments'", "api.del(`/points-adjustments/", 'deletePointAdjustment', "api.post('/attendances'", "api.get('/attendances'", "api.del(`/attendances/", 'deleteAttendanceRecord', "api.post('/hall-of-fame'", "api.get('/highlights'", "api.del(`/hall-of-fame/", 'delete_game', "api.get('/site-settings/players-starfield'", "api.call('/site-settings/players-starfield'", 'publishStarfieldSettings', 'starfieldPresetOptions', 'openTodo', '未关联比赛'].forEach(token => {
    assert(adminJs.includes(token), `mini admin console missing ${token}`);
  });
  ["status: 'pending'", "includeTotal: 'true'", 'pendingHighlightTotal'].forEach(token => {
    assert(adminJs.includes(token), `mini admin highlight counter optimization missing ${token}`);
  });
  assert(adminJs.includes("api.get('/tournaments'"), 'mini admin should still read tournaments only for labels and summaries');
  ["api.get('/events'", "api.del(`/events/${id}`", 'canManageEvents', 'selectedEventIds', 'batchDeleteEvents', 'eventDeleteConfirmText', 'eventTagFilterOptions', 'eventTagFilterLabel', 'onEventSearchInput', 'onEventTagFilterChange', 'openBatchEvent', 'editBatchEvent', 'eventTagKind'].forEach(token => {
    assert(adminJs.includes(token), `mini admin event batch delete missing ${token}`);
  });
  const adminWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/admin/admin.wxml'), 'utf8');
  const adminWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/admin/admin.wxss'), 'utf8');
  ['ADMIN_GAME_PAGE_LIMIT', 'POINT_GAME_SEARCH_LIMIT', 'pointGameCandidateGames', 'pointGameSourceGames', 'gamesHasMore', 'gamesNextOffset', 'loadMoreAdminGames', 'mergeGamesById', 'keyword: query', '搜索比赛失败', '加载更多比赛候选'].forEach(token => {
    assert(adminJs.includes(token) || adminWxml.includes(token), `mini admin game pagination missing ${token}`);
  });
  ['猎户管理台', '待办摘要', '需要处理的事项', '未关联比赛', 'admin-tool-nav', 'adminToolTabs', 'activeTool', 'player-panel-tabs', 'playerPanelTabs', "activePlayerPanel === 'pool'", "activePlayerPanel === 'create'", "activePlayerPanel === 'batch'", "activePlayerPanel === 'merge'", '球员池', '合并档案', '账号管理', '搜索昵称、邮箱、球员、号码', '加载更多账号', 'adminBindFilterOptions', 'adminBindFilterLabel', 'adminUserSortLabel', '保存权限', '重置网页密码', '绑定审批', 'bindRequestStatusOptions', 'bindRequestStatusLabel', '最近操作', '审计日志', '注册球员池', '搜索姓名、别名、背号、守位', 'player-pool-row', '档案', '时刻', '升级', 'points-panel', '批量出席名单', 'attendance-player-row', 'attendanceSubmitLabel', '关联比赛（可选）', 'pointGameLabel', '新增球员', '真实球员照片', '上传照片', '清空照片', 'create-player-photo-preview', '批量粘贴导入', '批量照片匹配', '选择照片', '导入名单', '全员积分总览', 'leaderboardOverview', 'openLeaderboardPlayer', '手动调整积分', '暂无手动积分记录', '补录签到', '暂无签到记录', '精彩时刻', '赛事活动', '新建赛事', '数据导入', '开始记录比赛可从赛事活动或比赛中心进入'].forEach(token => {
    assert(adminWxml.includes(token), `mini admin UI missing ${token}`);
  });
  ['星阵全站发布', '赛事设置', '删除选中比赛', '输入“删除比赛”确认', '队内接龙管理', '删除选中接龙', '输入“删除接龙”确认', '发送绑定邀请', '绑定码中心', '生成绑定码', '新绑定码', '绑码', '网页关联码', '直接绑定', '解除绑定', '删除账号', '名人堂授予', '加入名人堂', '移出名人堂', '新建比赛'].forEach(token => {
    assert(!adminWxml.includes(token), `mini admin UI should not expose deprecated/low-frequency entry ${token}`);
  });
  assert(adminJs.includes('const canBindInvite = false'), 'mini admin should disable bind-code invitation UI');
  assert(adminJs.includes('const canCreateAppConnectCode = false'), 'mini admin should disable app-connect code UI');
  assert(adminJs.includes('const canBindDirect = false'), 'mini admin should disable direct bind UI');
  assert(adminJs.includes('const canDeleteUsers = false'), 'mini admin should disable account deletion UI');
  assertCss(adminWxss, '.admin-tool-tab', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2', 'text-align: center'], 'mini admin top tab button');
  assertCss(adminWxss, '.player-panel-tab', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2', 'text-align: center'], 'mini admin player tab button');
  assertCss(adminWxss, '.link', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2'], 'mini admin link action button');
  assertCss(adminWxss, '.tiny-link', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2'], 'mini admin tiny action button');
  assertCss(adminWxss, '.shortcut', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 24rpx', 'line-height: 1.2', 'text-align: center'], 'mini admin shortcut button');
  const tournamentManageJs = fs.readFileSync(path.join(root, 'miniprogram/pages/tournaments/tournament-manage/tournament-manage.js'), 'utf8');
  const tournamentManageWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/tournaments/tournament-manage/tournament-manage.wxml'), 'utf8');
  const tournamentManageWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/tournaments/tournament-manage/tournament-manage.wxss'), 'utf8');
  ['tournaments:write', 'games:revise', 'destructive:delete', "api.get(`/tournaments/${this.data.id}`)", "api.post('/tournaments'", "api.patch(`/tournaments/${this.data.id}`", "api.del(`/tournaments/${this.data.id}`", "api.patch('/games/batch-reassign'", "api.get('/games'", "api.post('/upload/base64'", "uploadImageFile(file, 'tournament'", 'chooseCoverImage', 'moveSelectedGames', 'deleteConfirmText', '删除赛事'].forEach(token => {
    assert(tournamentManageJs.includes(token), `tournament manage behavior missing ${token}`);
  });
  ['{{pageTitle}}', '{{pageSubtle}}', '赛事容器', '赛事类型', '项目', '赛事全称', '简称', '赛季', 'mode="date"', '开始日期', '结束日期', '赛事封面', '上传封面', '比赛归属整理', '未关联比赛', '当前赛事', '全部比赛', '全选当前', '删除赛事容器', '只删除赛事容器，不删除已记录比赛'].forEach(token => {
    assert(tournamentManageWxml.includes(token) || tournamentManageJs.includes(token), `tournament manage UI missing ${token}`);
  });
  assertCss(tournamentManageWxss, '.small-btn', ['border-radius: 22rpx'], 'tournament manage small button');
  const playersRoute = fs.readFileSync(path.join(root, 'server/routes/players.js'), 'utf8');
  ["router.post('/import'", 'player_batch_import', 'parsePlayerImportText', 'buildPlayerPhotoMap', 'matchedPhotoCount', 'photoMatched', '一次最多导入 100 名球员'].forEach(token => {
    assert(playersRoute.includes(token), `players batch import route missing ${token}`);
  });
  ["router.delete('/:id'", "requirePermission('destructive:delete')", 'player_delete', '删除球员'].forEach(token => {
    assert(playersRoute.includes(token), `players delete route missing ${token}`);
  });
  const gamesRouteBatch = fs.readFileSync(path.join(root, 'server/routes/games.js'), 'utf8');
  ["requireAnyPermission(['games:confirm', 'events:write'])", "require('../middleware')"].forEach(token => {
    assert(gamesRouteBatch.includes(token), `games create route permission missing ${token}`);
  });
  ["router.patch('/batch-reassign'", "requirePermission('games:revise')", 'batch_reassign_games', 'missingIds'].forEach(token => {
    assert(gamesRouteBatch.includes(token), `games batch reassign route missing ${token}`);
  });
  ["router.delete('/:id'", "requirePermission('destructive:delete')", 'delete_game', '删除比赛'].forEach(token => {
    assert(gamesRouteBatch.includes(token), `games delete route missing ${token}`);
  });
  ["router.post('/import-gamechanger'", "requirePermission('games:draft')", 'parseGameChangerPdfBuffer', 'parseGameChangerExcelBuffer', 'fileBase64', 'tournament_not_found', 'unsupported_file_type'].forEach(token => {
    assert(gamesRouteBatch.includes(token), `games import route missing ${token}`);
  });
  const gamechangerImport = fs.readFileSync(path.join(root, 'server/gamechanger-import.js'), 'utf8');
  ['resolvePdftotext', 'parseGameChangerPdfBuffer', 'parseGameChangerExcelBuffer', 'sheetjs_workbook', '_parseBattingTables', '_assembleGame', 'originalFileName'].forEach(token => {
    assert(gamechangerImport.includes(token), `server GameChanger import missing ${token}`);
  });
  const auditJs = fs.readFileSync(path.join(root, 'miniprogram/pages/admin/audit/audit.js'), 'utf8');
  ["api.get('/admin/audit-logs'", 'targetFilters', 'actionFilters', 'loadMore', 'openDetail', 'metadataText', 'audit:game_read', 'event_create', 'event_update', 'event_delete', 'player_delete', '删除球员', 'tournament_create', 'tournament_update', 'tournament_delete', 'site_setting_publish', 'points_adjust_delete', 'attendance_delete'].forEach(token => {
    assert(auditJs.includes(token), `mini admin audit page missing ${token}`);
  });
  const tournamentsRoute = fs.readFileSync(path.join(root, 'server/routes/tournaments.js'), 'utf8');
  ['logAudit', 'tournament_create', 'tournament_update', 'tournament_delete', 'changedKeys'].forEach(token => {
    assert(tournamentsRoute.includes(token), `tournaments audit route missing ${token}`);
  });
  const auditWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/admin/audit/audit.wxml'), 'utf8');
  ['审计日志', '搜索摘要、对象 ID、操作人', '记录列表', '查看详情', '复制详情 JSON', '加载更多'].forEach(token => {
    assert(auditWxml.includes(token), `mini admin audit UI missing ${token}`);
  });
  const adminRoute = fs.readFileSync(path.join(root, 'server/routes/admin.js'), 'utf8');
  ["router.get('/bind-invitation-options'", "router.post('/bind-invitations'", "router.post('/users/:id/reset-password'", "router.post('/users/:id/bind-player'", "router.post('/users/:id/unbind-player'", "router.delete('/users/:id'", "requirePermission('bind_codes:manage')", 'parseAdminUserLimit', 'parseAdminUserOffset', 'LIMIT ? OFFSET ?', 'boundPlayerName', 'req.query.targetType', 'req.query.action', 'nextOffset'].forEach(token => {
    assert(adminRoute.includes(token), `admin bind invitation route missing ${token}`);
  });
  const hofPageJs = fs.readFileSync(path.join(root, 'miniprogram/pages/hall-of-fame/hall-of-fame.js'), 'utf8');
  const hofPageWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/hall-of-fame/hall-of-fame.wxml'), 'utf8');
  ["api.get('/hall-of-fame', { includePlayer: 'true', limit: HOF_PAGE_LIMIT, offset })", "api.get('/auth/me')", 'HOF_PAGE_LIMIT', 'hasMore', 'nextOffset', 'loadMore', 'mergeEntriesByPlayerId', 'entry.player', 'playerIdentity', 'nameClass', 'avatarClass', 'openPlayer'].forEach(token => {
    assert(hofPageJs.includes(token), `hall of fame page missing ${token}`);
  });
  ['🏛 名人堂', '猎户名人堂', 'bindtap="openPlayer"', '加载更多名人堂', '{{item.nameClass}}', '{{item.avatarClass}}', '{{item.reasonText}}'].forEach(token => {
    assert(hofPageWxml.includes(token), `hall of fame UI missing ${token}`);
  });
  const highlightsJs = fs.readFileSync(path.join(root, 'miniprogram/pages/highlights/highlights.js'), 'utf8');
  const highlightsWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/highlights/highlights.wxml'), 'utf8');
  ["api.get('/highlights'", "params.public = 'true'", "includePlayer: 'true'", "includeGame: 'true'", 'HIGHLIGHT_LIMIT', 'GAME_OPTION_LIMIT', 'HIGHLIGHT_PLAYER_OPTION_LIMIT', 'fetchHighlightsPage', 'fetchPlayerOptionsPage', 'fetchGameOptionsPage', 'user ? fetchGameOptionsPage(0)', 'loadMoreHighlights', 'loadMorePlayerOptions', 'loadMoreGameOptions', "api.post('/highlights'", "api.post('/upload/base64'", "api.patch(`/highlights/", "api.del(`/highlights/", 'initialPlayerId', 'resolvePlayerIndex', 'unpublishHighlight', 'restoreHighlight', 'deleteHighlight', 'openPlayer', 'openGame', 'wx.chooseMedia', 'wx.getFileSystemManager().readFile', 'wx.previewImage', 'wx.setClipboardData', 'cover:', 'normalizeBilibiliUrl', 'playerIdentity', 'buildPlayerNameIndex', 'highlight.player', 'highlight.game ||', 'playerId', 'gameId', 'metaClass'].forEach(token => {
    assert(highlightsJs.includes(token), `highlights page missing ${token}`);
  });
  ['📸 时刻', '精彩时刻', '提交精彩时刻', 'moments-scroll', 'moment-card', '看球员', '看比赛', '选择图片并上传 COS', '图片地址', 'B站链接，可选', '复制B站链接', '加载更多球员候选', '加载更多比赛候选', '加载更多精彩时刻', '发布图片', '下架', '重新发布', '删除记录', '{{item.metaClass}}'].forEach(token => {
    assert(highlightsWxml.includes(token), `highlights UI missing ${token}`);
  });
  assert(!highlightsWxml.includes('<video'), 'mini highlights should not render an in-app video player');
  const uploadRoute = fs.readFileSync(path.join(root, 'server/routes/upload.js'), 'utf8');
  ["router.post('/base64'", 'fileBase64', 'uploadImageBuffer', 'kind: body.kind', '只支持 JPG / PNG / GIF / WEBP / SVG'].forEach(token => {
    assert(uploadRoute.includes(token), `upload route missing ${token}`);
  });
  const notificationsJs = fs.readFileSync(path.join(root, 'miniprogram/pages/notifications/notifications.js'), 'utf8');
  const notificationsWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/notifications/notifications.wxml'), 'utf8');
  ["api.get('/notifications', {", 'NOTIFICATION_PAGE_LIMIT', 'NOTIFICATION_PLAYER_LIMIT', 'notificationsHasMore', 'notificationsNextOffset', 'loadMoreNotifications', 'mergeNotificationsById', 'fetchPlayerOptionsPage', 'loadPlayerOptions', 'loadMorePlayers', 'playerHasMore', 'playerNextOffset', "api.post('/notifications'", 'notifications:write', 'targetOptions', '全队成员', '指定球员', 'submitNotice', 'markRead'].forEach(token => {
    assert(notificationsJs.includes(token), `notifications page missing ${token}`);
  });
  ['🔔 通知', '发送站内通知', '未读通知', '加载更多球员', '加载更多通知', 'loadingMorePlayers', 'loadingMoreNotifications', 'bindtap="submitNotice"'].forEach(token => {
    assert(notificationsWxml.includes(token), `notifications UI missing ${token}`);
  });
  const notificationsRoute = fs.readFileSync(path.join(root, 'server/routes/notifications.js'), 'utf8');
  ["router.post('/'", "notifications:write", 'admin_broadcast', 'targetScope', 'send_notification', 'parseLimit', 'parseOffset', 'unreadCount', 'hasMore', 'nextOffset', 'LIMIT ? OFFSET ?'].forEach(token => {
    assert(notificationsRoute.includes(token), `notifications route missing ${token}`);
  });
  assert(checkin.includes('trialProgressText') && checkin.includes('试训进度'), 'checkin should show trial upgrade progress');
  const pointsJs = fs.readFileSync(path.join(root, 'miniprogram/pages/points/points.js'), 'utf8');
  ["api.get('/auth/me')", "api.get('/games/seasons'", "api.get('/games'", 'SEASON_FALLBACK_PAGE_LIMIT', 'loadSeasonGamesFallback', "limit: SEASON_FALLBACK_PAGE_LIMIT", "api.get('/leaderboard', leaderboardParams", 'LEADERBOARD_PAGE_LIMIT', 'leaderboardHasMore', 'loadMoreLeaderboard', 'loadSeasonOptions', 'buildSeasonOptionsFromValues', 'seasonOptions', 'onSeasonChange', 'timelineFilterOptions', 'setTimelineFilter', 'buildSeasonOptions', 'buildTimelineFilterOptions', 'timeline', 'formatTimelineItem', 'openPlayer', 'openTimelineItem', 'timelineTarget', '/pages/players/player-detail/player-detail', '/pages/games/game-detail/game-detail', '/pages/events/event-detail/event-detail', 'rulesCards', 'buildRulesCards', 'fmtRuleDelta'].forEach(token => {
    assert(pointsJs.includes(token), `points page missing ${token}`);
  });
  const pointsWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/points/points.wxml'), 'utf8');
  ['bindtap="openPlayer"', 'data-id="{{item.playerId}}"', 'wx:key="playerId"', 'mode="selector"', 'bindchange="onSeasonChange"', 'bindtap="setTimelineFilter"', '{{item.text}}', '球队排行 · {{seasonLabel}}', '加载更多排行'].forEach(token => {
    assert(pointsWxml.includes(token), `points leaderboard should link to player detail: ${token}`);
  });
  ['⭐ 积分', '积分规则', 'rulesCards', '服务器当前积分规则', 'rule-delta'].forEach(token => {
    assert(pointsWxml.includes(token), `points rules UI missing ${token}`);
  });
  ['bindtap="openTimelineItem"', 'data-target-type="{{item.targetType}}"', '{{item.targetLabel}}'].forEach(token => {
    assert(pointsWxml.includes(token), `points timeline should link to related records: ${token}`);
  });
  const pointsServerSeason = fs.readFileSync(path.join(root, 'server/points.js'), 'utf8');
  const leaderboardRoute = fs.readFileSync(path.join(root, 'server/routes/leaderboard.js'), 'utf8');
  ['normalizeSeasonFilter', 'applySeasonFilter', 'rebuildBreakdownFromTimeline', 'item.detail?.season'].forEach(token => {
    assert(pointsServerSeason.includes(token), `server points season filtering missing ${token}`);
  });
  ['req.query.season', 'req.query.limit', 'req.query.playerIds', 'parsePlayerIds', 'rank: index + 1', 'parseLimit', 'nextOffset', "points.leaderboard({ season", "points.getPlayerPoints(req.params.id, { season"].forEach(token => {
    assert(leaderboardRoute.includes(token), `leaderboard route season filtering missing ${token}`);
  });
  assert(!pointsWxml.includes('>Points<'), 'points page should not show English eyebrow');
  const playerListJs = fs.readFileSync(path.join(root, 'miniprogram/pages/players/player-list/player-list.js'), 'utf8');
  ["api.get('/players', playerPageParams", "api.get('/leaderboard', { limit: 1 })", "api.get('/auth/me')", 'PLAYER_PAGE_LIMIT', 'fetchLeaderboardForPlayers', 'leaderboardPageParams', 'playerIds', 'rank: Number(row.rank || index + 1)', 'includeTotal', 'includePositionCount', 'loadMore', 'hasMore', 'nextOffset', 'playerIdentity', 'nameClass', 'avatarClass', 'openDetail'].forEach(token => {
    assert(playerListJs.includes(token), `player list missing ${token}`);
  });
  const playerListWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/players/player-list/player-list.wxml'), 'utf8');
  ['👥 阵容', '球员阵容', '正式球员', '守位覆盖', '当前积分榜首', '搜索姓名、背号、守位', 'bindtap="openDetail"', '{{item.nameClass}}', '{{item.avatarClass}}', '加载更多球员'].forEach(token => {
    assert(playerListWxml.includes(token), `player list UI missing ${token}`);
  });
  const playerDetailJs = fs.readFileSync(path.join(root, 'miniprogram/pages/players/player-detail/player-detail.js'), 'utf8');
  ["api.get(`/players/${this.data.id}`)", "api.get(`/players/${this.data.id}/points`)", "api.get('/games'", 'PLAYER_GAME_PAGE_LIMIT', 'playerGameParams', 'gamesHasMore', 'gamesNextOffset', 'loadMorePlayerGames', 'mergeGamesById', "api.get('/highlights'", "public: 'true'", 'playerName', 'limit: 24', 'fetchPlayerPublicHighlights', 'playerHighlightNames', 'playerIdentity', 'nameClass', 'avatarClass', 'relatedGames', 'capabilityProfile', 'capabilityRosterFromGames', 'playerHighlights', 'previewHighlight', 'copyHighlightLink', 'submitPlayerHighlight', 'wx.previewImage', 'wx.setClipboardData', 'rowMatches', 'openGame', 'openTimelineItem', 'timelineTarget', '/pages/events/event-detail/event-detail', "api.patch(`/players/${this.data.id}`", "api.patch(`/players/${this.data.id}/public-profile`", "api.post('/upload/base64'", "api.post(`/players/${this.data.id}/upgrade`", "api.del(`/players/${this.data.id}`", 'canEditPlayer', 'canDeletePlayer', 'destructive:delete', 'deleteConfirmText', 'deletePlayer', 'onDeleteConfirmInput', 'editPhoto', 'editAliases', 'editPublicDisplayName', 'choosePlayerPhoto', 'clearPlayerPhoto', 'choosePublicAvatar', 'wx.chooseMedia', 'wx.getFileSystemManager().readFile'].forEach(token => {
    assert(playerDetailJs.includes(token), `player detail missing ${token}`);
  });
  assert(!playerDetailJs.includes("api.get('/players', { include: 'all', limit: 200 })"), 'player detail should not fetch a 200-player roster for capability overview');
  const playerDetailWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/players/player-detail/player-detail.wxml'), 'utf8');
  ['bindtap="openTimelineItem"', 'data-target-id="{{item.targetId}}"', '{{item.targetLabel}}'].forEach(token => {
    assert(playerDetailWxml.includes(token), `player detail timeline should link related records: ${token}`);
  });
  const pointsServer = fs.readFileSync(path.join(root, 'server/points.js'), 'utf8');
  ['rowMatchesPlayer', 'gameId: g.id', 'tournamentId: t?.id', 'eventId: event?.id'].forEach(token => {
    assert(pointsServer.includes(token), `server points timeline should expose linkage token ${token}`);
  });
  ['👤 球员', '球员档案', '{{player.nameClass}}', '{{player.avatarClass}}', '真实球员照片', '上传真实照片', '清空照片', '公开展示资料', '选择公开头像', '保存档案', '升级正式球员', '危险操作', '输入“删除球员”确认', '删除球员', '别名用于历史比赛统计归并', '积分概览', '能力概览', 'OPS {{capability.OPS}}', '球员精彩时刻', 'highlight-grid', '{{item.metaClass}}', '复制B站链接', 'bindtap="previewHighlight"', 'bindtap="copyHighlightLink"', 'bindtap="submitPlayerHighlight"', '最近积分流水', '相关比赛', 'gameLoadedSummary', '加载更多相关比赛', 'loadingMoreGames', 'bindtap="openGame"'].forEach(token => {
    assert(playerDetailWxml.includes(token), `player detail UI missing ${token}`);
  });
  const gameListJs = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-list/game-list.js'), 'utf8');
  ['parseLimit', 'parseOffset', 'hasMore', 'nextOffset', 'LIMIT ? OFFSET ?'].forEach(token => {
    assert(tournamentsRoute.includes(token), `tournaments route pagination missing ${token}`);
  });
  ["api.get('/tournaments'", "includeGameCount: 'true'", 'TOURNAMENT_PAGE_LIMIT', 'tournamentHasMore', 'tournamentNextOffset', 'loadMoreTournaments', 'mergeTournamentsById', "api.get('/games'", 'limit:', 'offset', 'hasMore', 'loadMore', 'buildTournamentFilters', 'setTournament', 'openTournament', 'gameInTournament', 'gameTournamentLabel', 'canRecordGames', 'importPdf', '/pages/games/game-import/game-import', '/pages/tournaments/tournament-detail/tournament-detail'].forEach(token => {
    assert(gameListJs.includes(token), `game list tournament filter missing ${token}`);
  });
  const gameListWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-list/game-list.wxml'), 'utf8');
  ['比赛工作台', 'game-workbench', '开始记录比赛', 'wx:if="{{canRecordGame}}"', 'bindtap="create"', '导入 GameChanger', '筛选比赛', '赛事赛季', 'tournament-card', 'bindtap="setTournament"', 'catchtap="openTournament"', '详情', '{{item.countText}}', 'tournamentHasMore', 'loadMoreTournaments', '加载更多赛事', 'bindtap="loadMore"', '加载更多比赛', '{{item.tournamentLabel', 'game-cover', 'game-cover-img', '{{item.cover}}', '开始记录第一场'].forEach(token => {
    assert(gameListWxml.includes(token), `game list tournament UI missing ${token}`);
  });
  assert(!gameListWxml.includes('>发起<'), 'game list record button should use direct label');
  const gameListWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-list/game-list.wxss'), 'utf8');
  ['game-list-head', 'create-btn', 'game-sport-tabs', 'game-sport-chip', 'tournament-load-more', 'game-card-grid', 'load-more'].forEach(token => {
    assert(gameListWxml.includes(token) || gameListWxss.includes(token), `game list compact header/filter UI missing ${token}`);
  });
  assert(gameListWxss.includes('flex-wrap: nowrap') && gameListWxss.includes('game-sport-all') && !gameListWxss.includes('grid-template-columns: repeat(3'), 'game list filter should use compact sport chips instead of a full-width segmented bar');
  assert(!gameListWxml.includes('sport-filter') && !gameListWxml.includes('filter-btn'), 'game list sport filter should not reuse generic filter classes');
  assertCss(gameListWxss, '.record-main-btn', ['border-radius: 26rpx'], 'game list main record button');
  assertCss(gameListWxss, '.game-sport-chip', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2', 'text-align: center'], 'game list sport chip button');
  const tournamentDetailJs = fs.readFileSync(path.join(root, 'miniprogram/pages/tournaments/tournament-detail/tournament-detail.js'), 'utf8');
  ["api.get(`/tournaments/${this.data.id}`)", "api.get('/games'", 'tournamentId: this.data.id', "includeSeasonFallback: 'true'", 'PLAYER_LINK_QUERY_LIMIT', 'collectTournamentPlayerRefs', 'loadPlayersForTournament', "api.get('/players', { include: 'all', keyword: name, limit: PLAYER_LINK_QUERY_LIMIT, offset: 0 })", "api.get('/auth/me')", 'playerIdentity', 'buildBattingLeaderboard', 'buildPitchingLeaderboard', 'gameInTournament', 'openGame', 'openPlayer', 'onSortChange'].forEach(token => {
    assert(tournamentDetailJs.includes(token), `tournament detail missing ${token}`);
  });
  const tournamentDetailWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/tournaments/tournament-detail/tournament-detail.wxml'), 'utf8');
  ['🏆 赛事', '全部场次', '打击排行榜', '投手排行榜', '按 {{sortLabel}}', '{{item.nameClass}}', 'bindtap="openGame"', 'bindtap="openPlayer"', 'OPS', 'ERA'].forEach(token => {
    assert(tournamentDetailWxml.includes(token), `tournament detail UI missing ${token}`);
  });
  const gameDetailJs = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-detail/game-detail.js'), 'utf8');
  const gameDetailWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-detail/game-detail.wxml'), 'utf8');
  ["api.get('/auth/me')", 'playerIdentity', 'nameClass', 'games:revise', 'editGame', '/pages/games/game-edit/game-edit'].forEach(token => {
    assert(gameDetailJs.includes(token) || gameDetailWxml.includes(token), `game detail edit entry missing ${token}`);
  });
  ["api.get('/highlights'", 'fetchGameHighlights', 'HIGHLIGHT_PAGE_LIMIT', "includePlayer: 'true'", 'highlightsHasMore', 'highlightsNextOffset', 'loadMoreGameHighlights', 'mergeHighlightsById', "public: 'true'", 'isPublicHighlight', 'previewHighlight', 'copyHighlightLink', 'wx.previewImage', 'wx.setClipboardData', 'formatHighlight(highlight, indexes, viewer)', 'displayLogLabel', 'highlight.player'].forEach(token => {
    assert(gameDetailJs.includes(token), `game detail highlights missing ${token}`);
  });
  ['精彩时刻', 'highlight-grid', '复制B站链接', '加载更多精彩时刻', 'loadingMoreHighlights', 'bindtap="previewHighlight"', 'bindtap="copyHighlightLink"', '{{item.metaClass}}', 'log-link {{item.nameClass}}', 'scoreRules', '球数 {{item.countText}}', '垒位 {{item.baseMoveText}}'].forEach(token => {
    assert(gameDetailWxml.includes(token), `game detail highlights UI missing ${token}`);
  });
  assert(!gameDetailWxml.includes('<video'), 'game detail should not render in-app video players');
  const gameEditJs = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-edit/game-edit.js'), 'utf8');
  const gameEditWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-edit/game-edit.wxml'), 'utf8');
  ['game-cover-hero', '{{game.cover}}'].forEach(token => {
    assert(gameDetailWxml.includes(token), `game detail cover UI missing ${token}`);
  });
  ["api.get(`/games/${this.data.id}`)", "api.get('/tournaments', {", 'TOURNAMENT_PAGE_LIMIT', 'tournamentHasMore', 'tournamentNextOffset', 'loadMoreTournaments', 'mergeTournamentsById', 'normalizeNextOffset', "api.get(`/tournaments/${currentTournamentId}`)", "api.patch(`/games/${this.data.id}`", "api.del(`/games/${this.data.id}`", "api.post('/upload/base64'", 'games:revise', 'destructive:delete', '_revisionReason', "mini_game_edit", 'normalizeBattingRow', 'normalizePitchingRow', 'chooseCoverImage', 'deleteGame', 'deleteConfirmText', "kind: 'game'", 'wx.chooseMedia', 'wx.getFileSystemManager().readFile', 'cover: String(this.data.cover'].forEach(token => {
    assert(gameEditJs.includes(token), `game edit page missing ${token}`);
  });
  ['比赛数据修订', '加载更多赛事候选', 'loadingMoreTournaments', '比赛封面图', '上传封面', 'COS 图片地址', '本队打击修订', '投手数据修订', '必填：修订原因', '保存修订', '危险操作', '删除比赛'].forEach(token => {
    assert(gameEditWxml.includes(token), `game edit UI missing ${token}`);
  });
  const gameImportJs = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-import/game-import.js'), 'utf8');
  const gameImportWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-import/game-import.wxml'), 'utf8');
  ["wx.chooseMessageFile", "extension: ['pdf', 'xls', 'xlsx']", "wx.getFileSystemManager().readFile", "api.get('/tournaments', {", 'TOURNAMENT_PAGE_LIMIT', 'tournamentHasMore', 'tournamentNextOffset', 'loadMoreTournaments', 'mergeTournamentsById', "api.post('/upload/base64'", "kind: 'game'", "api.post('/games/import-gamechanger'", "api.post('/games'", 'games:draft', 'games:confirm', 'chooseCoverImage', 'coverUrl', 'expandImportFileDrafts', 'parseSelectedFile'].forEach(token => {
    assert(gameImportJs.includes(token), `game import page missing ${token}`);
  });
  ['数据导入', '关联赛事', '加载更多赛事候选', 'loadingMoreTournaments', '选择 PDF / Excel', '选择聊天文件', '逐份解析入库', '比赛封面图', '上传封面', '解析文件', '解析预览', '确认入库', '本队打击', '投手数据'].forEach(token => {
    assert(gameImportWxml.includes(token), `game import UI missing ${token}`);
  });
  const scoreCreate = fs.readFileSync(path.join(root, 'miniprogram/pages/score/create/create.js'), 'utf8');
  ['rosterSources', 'loadRelaySignups', 'rosterEventId', "'/event-signups'", 'PLAYER_PAGE_LIMIT', 'playerQueryParams', 'playersHasMore', 'playersNextOffset', 'loadMorePlayers', 'searchPlayers', 'ensurePlayersLoaded', "api.get('/players', playerQueryParams", 'EVENT_PAGE_LIMIT', "api.get('/events', { limit: EVENT_PAGE_LIMIT", "api.get(`/events/${prefillEventId}`)", 'TOURNAMENT_PAGE_LIMIT', "api.get('/tournaments', { limit: TOURNAMENT_PAGE_LIMIT", 'tournamentHasMore', 'tournamentNextOffset', 'loadMoreTournaments', 'mergeTournamentsById', 'rosterEventsHasMore', 'rosterEventsNextOffset', 'loadMoreRosterEvents', 'mergeEventsById', 'normalizeNextOffset', 'onLineupTouchMove', 'onFieldMarkerTap', 'moveLineupPlayer'].forEach(token => {
    assert(scoreCreate.includes(token), `score create missing roster relay token ${token}`);
  });
  assert(scoreCreate.includes('onDateChange'), 'score create should use date picker change handler');
  assert(!scoreCreate.includes('onInningsInput') && !scoreCreate.includes('innings: 7'), 'score create should not preset innings');
  const scoreCreateWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/score/create/create.wxml'), 'utf8');
  ['setup-steps', '比赛信息', '出场名单', '守位确认', '基础信息', '阵容来源', '阵容工作台', 'roster-list', 'lineup-workbench', '出场名单来源', '接龙活动', '已识别', '已绑定', '需手动添加', '加载更多接龙候选', 'loadingMoreRosterEvents', '加载更多赛事候选', 'loadingMoreTournaments', '搜索姓名 / 背号 / 守位', '加载更多球员', 'loadingMorePlayers', '管理员可以在接龙导入后继续勾选', 'catchtouchmove', 'onFieldMarkerTap', 'moveLineupUp', 'moveLineupDown'].forEach(token => {
    assert(scoreCreateWxml.includes(token), `score create UI missing ${token}`);
  });
  assert(scoreCreateWxml.includes('picker mode="date"') && scoreCreateWxml.includes('bindchange="onDateChange"'), 'score create date should use picker mode=date');
  assert(!scoreCreateWxml.includes('局数') && !scoreCreateWxml.includes('onInningsInput'), 'score create should not ask for innings before recording');
  const scoreLive = fs.readFileSync(path.join(root, 'miniprogram/pages/score/live/live.js'), 'utf8');
  ['pitching', 'oppBatting', 'mvpPlayerName', 'mvpPlayerId', 'homeTotals', 'awayTotals', 'undoLast', 'gameLog', 'metadata', 'mini_scorebook', 'eventId', 'rosterEventId', 'relatedEventId', 'relatedTournamentId', 'playerId', 'actionType', 'halfLabel', 'baseSummary', 'advanceBasesForOutcome', 'onBatterChange', 'advanceBatterAfterPlateAppearance', 'applyLineupAdjustment', 'scoreRulesForSport', 'foulWithTwoStrikesIsOut', 'recordPitch', 'countBefore', 'countAfter', 'baseBefore', 'baseAfter', 'resultKey', 'resultLabel'].forEach(token => {
    assert(scoreLive.includes(token), `score live missing ${token}`);
  });
  ['ensureLineLength', 'normalizeLines', 'normalizedLines.innings'].forEach(token => {
    assert(scoreLive.includes(token), `score live should derive innings from recorded linescore: ${token}`);
  });
  const scoreLiveWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/score/live/live.wxml'), 'utf8');
  ['现场记分台', 'countText', '记录界外球', 'score-mode-tabs', '打席', '跑垒', '投手', '阵容', '日志', '赛后', '慢投垒', '比赛局面', '事件日志', '换半局 / 下一局', '垒上跑者', '手动打点 RBI', '直接选择当前打者', 'selectBatterRow', '阵容调整', '记录阵容调整', '进入赛后确认'].forEach(token => {
    assert(scoreLiveWxml.includes(token), `score live UI missing ${token}`);
  });
  assert(scoreLiveWxml.includes('action-stack'), 'score live should use narrow-safe action stacks');
  const scoreLiveWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/score/live/live.wxss'), 'utf8');
  assert(scoreLiveWxss.includes('display: flex') && scoreLiveWxss.includes('flex-wrap: wrap') && scoreLiveWxss.includes('.stat-btn'), 'score live stat actions should use stable flex wrapping');
  assertCss(scoreLiveWxss, '.score-mode-tabs', ['border-radius: 999rpx'], 'score live mode segmented control');
  assertCss(scoreLiveWxss, '.pitch-btn', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 24rpx', 'line-height: 1.2', 'text-align: center'], 'score live pitch action button');
  assertCss(scoreLiveWxss, '.stat-btn', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 22rpx', 'line-height: 1.2', 'text-align: center'], 'score live stat action button');
  assertCss(scoreLiveWxss, '.undo-btn', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2'], 'score live undo button');
  const gameDetail = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-detail/game-detail.wxml'), 'utf8');
  ['R</text>', 'H</text>', 'E</text>', '守位', '{{item.pos ||', 'ER', 'HR', 'AVG', 'OPS', 'ERA', 'WHIP', '对手进攻', '对手投手', '事件日志', '来自接龙', '导出 PDF', '按 {{battingSortLabel}}', '指标条同步', 'metric-bars', 'bindtap="sortBatting"', 'bindtap="sortPitching"', 'bindtap="sortOppBatting"', 'bindtap="sortOppPitching"', 'bindtap="openPlayer"', 'bindtap="openEvent"', 'bindtap="exportGamePdf"', 'data-player-id="{{item.playerId}}"', 'data-player-id="{{mvp.playerId}}"', '查看 {{item.playerName', '{{item.displayName || item.name}}'].forEach(token => {
    assert(gameDetail.includes(token), `game detail missing ${token}`);
  });
  const gameDetailLinkJs = fs.readFileSync(path.join(root, 'miniprogram/pages/games/game-detail/game-detail.js'), 'utf8');
  ['PLAYER_LINK_QUERY_LIMIT', 'collectGamePlayerRefs', 'loadPlayersForGame', "api.get('/players', { include: 'all', keyword: name, limit: PLAYER_LINK_QUERY_LIMIT, offset: 0 })", 'buildPlayerIndexes', 'linkRows', 'linkMvp', 'gameOrigin', 'gameScoreRules', 'logCountText', 'openPlayer', 'openEvent', 'exportGamePdf', '/export-pdf', 'wx.openDocument', 'writeFile', 'player.publicDisplayName', 'BAT_SORT_OPTIONS', 'PITCH_SORT_OPTIONS', 'applyTableSort', 'decorateBattingRows', 'decoratePitchingRows', 'chartRows', 'oppPitching'].forEach(token => {
    assert(gameDetailLinkJs.includes(token), `game detail player link missing ${token}`);
  });
  const labelUtils = fs.readFileSync(path.join(root, 'miniprogram/utils/labels.js'), 'utf8');
  ['🥎 慢垒', '⚾ 棒球', '⚾🥎 综合', '🏋️ 训练', '📅 活动', 'eventTagLabel', 'sportLabel'].forEach(token => {
    assert(labelUtils.includes(token), `mini program display label helper missing ${token}`);
  });
  [
    'miniprogram/pages/home/home.wxml',
    'miniprogram/pages/events/event-list/event-list.wxml',
    'miniprogram/pages/events/event-detail/event-detail.wxml',
    'miniprogram/pages/games/game-list/game-list.wxml',
    'miniprogram/pages/games/game-detail/game-detail.wxml',
  ].forEach(rel => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    ['Training', "'Event'", "{{game.sport}}", "{{item.sport}}", "'mixed'"].forEach(token => {
      assert(!text.includes(token), `${rel} should not expose raw English enum fallback ${token}`);
    });
  });
  const gamesRoute = fs.readFileSync(path.join(root, 'server/routes/games.js'), 'utf8');
  ['event_id', 'mvp_player_id', 'game_log', 'metadata', 'ensureGameSchema', 'gameLog', 'createGameRecordPdf', 'export-pdf', 'pdfBase64', "router.get('/seasons'", 'parseGameLimit', 'loadPlayerFilterKeys', 'gameMatchesPlayer', 'gameKeyword', 'req.query.keyword', 'DATE_FORMAT(date'].forEach(token => {
    assert(gamesRoute.includes(token), `games route missing ${token}`);
  });
  const pdfExport = fs.readFileSync(path.join(root, 'server/pdf-export.js'), 'utf8');
  ['createGameRecordPdf', 'STSong-Light', 'UniGB-UCS2-H', '逐局比分', '猎户进攻', '投手记录', '事件日志'].forEach(token => {
    assert(pdfExport.includes(token), `game PDF export missing ${token}`);
  });
  const profileJs = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.js'), 'utf8');
  ['eventTitle', 'bindRequests', 'statusLabel', '已报名', '待定', '已取消', '待审核', '已通过', '已驳回'].forEach(token => {
    assert(profileJs.includes(token), `profile signup history missing ${token}`);
  });
  ["api.patch('/auth/me'", "api.patch(`/players/${player.id}/public-profile`", 'canEditPublicProfile', 'publicPreviewName', 'players:display_write', "api.post('/upload/base64'", 'chooseAccountAvatar', 'choosePublicAvatar', 'wx.chooseMedia', 'wx.getFileSystemManager().readFile'].forEach(token => {
    assert(profileJs.includes(token), `profile public/account settings missing ${token}`);
  });
  const profileWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.wxml'), 'utf8');
  ['绑定申请', '{{item.title}}', '{{item.meta', '{{item.statusLabel}}'].forEach(token => {
    assert(profileWxml.includes(token), `profile signup list missing ${token}`);
  });
  ['账号资料', '保存账号资料', '选择账号头像', '清空头像', '球员页公开展示', '选择公开头像', '清空公开头像', '保存公开展示', 'publicPreviewAvatar'].forEach(token => {
    assert(profileWxml.includes(token), `profile public/account settings UI missing ${token}`);
  });
  assert(profileWxml.includes('/pages/admin/admin') && profileWxml.includes('管理后台'), 'profile should expose admin console for privileged users');
  const bindJs = fs.readFileSync(path.join(root, 'miniprogram/pages/bind/bind.js'), 'utf8');
  assert(bindJs.includes('jerseyNumber: selected.number'), 'bind request should include selected player jersey number');
  ['PLAYER_PAGE_LIMIT', 'playerQueryParams', 'playersHasMore', 'playersNextOffset', 'loadMorePlayers', 'searchPlayers', 'mergePlayersById', 'latestRequest', 'submitDisabled', '待审核', '已通过', '已驳回'].forEach(token => {
    assert(bindJs.includes(token), `bind status missing ${token}`);
  });
  const bindWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/bind/bind.wxml'), 'utf8');
  ['申请绑定正式球员档案', '不用关联码', '📝 审核状态', '✅ 已选球员', 'bindconfirm="searchPlayers"', '加载更多球员', '{{latestRequest.statusLabel}}', '{{submitLabel}}'].forEach(token => {
    assert(bindWxml.includes(token), `bind page UI missing ${token}`);
  });
  const flowTest = fs.readFileSync(path.join(root, 'scripts/test-miniprogram-flows.js'), 'utf8');
  const eventsAuditTest = fs.readFileSync(path.join(root, 'scripts/test-events-audit-route.js'), 'utf8');
  const gamesLinkageTest = fs.readFileSync(path.join(root, 'scripts/test-games-linkage-route.js'), 'utf8');
  ['event_create', 'event_update', 'event_delete', 'signupCount'].forEach(token => {
    assert(eventsAuditTest.includes(token), `events audit regression missing ${token}`);
  });
  ['event_id', 'eventId', 'mvpPlayerId', '/games?eventId=e_test', 'includeSeasonFallback=true', 'g_legacy_tournament', 'sport=softball', 'offset=1', 'hasMore', 'nextOffset'].forEach(token => {
    assert(gamesLinkageTest.includes(token), `games linkage regression missing ${token}`);
  });
  ['canWritePlayers', "api.post('/players/merge'", 'mergePlayers', 'mergeKeepAliasValues', 'confirmMerge'].forEach(token => {
    assert(adminJs.includes(token), `admin player merge missing ${token}`);
  });
  ['合并球员档案', '源姓名和别名', '确认合并', 'onMergeSourceChange', 'onMergeTargetChange'].forEach(token => {
    assert(adminWxml.includes(token), `admin player merge UI missing ${token}`);
  });
  ['testLoginLegalFlow', 'testEventDetailFlow', 'testEventCreateEditFlow', 'testEventListGalleryFlow', 'testCheckinFlow', 'testTrainingCheckinProgressFlow', 'testPointsFlow', 'testPointsSeasonFallbackFlow', 'testHomeLeaderboardLinksFlow', 'testHallOfFameFlow', 'testHighlightsImageFlow', 'testPlayerListFlow', 'testPlayerDetailFlow', 'testProfileSettingsFlow', 'testNotificationsFlow', 'testBindFlow', 'testAdminConsoleFlow', 'createPlayer', 'mergePlayers', 'testAdminAuditPageFlow', 'testGameListTournamentFlow', 'testGameImportFlow', 'testGameDetailPlayerLinkFlow', 'testScoreCreateRosterSourceFlow'].forEach(token => {
    assert(flowTest.includes(token), `mini player flow regression missing ${token}`);
  });
  const eventSignups = fs.readFileSync(path.join(root, 'server/routes/event-signups.js'), 'utf8');
  ['eventTitle', 'e.title AS event_title', 'LEFT JOIN events e'].forEach(token => {
    assert(eventSignups.includes(token), `event signups route missing ${token}`);
  });
}

function checkPackageScripts() {
  const pkg = readJson(path.join(root, 'package.json'));
  assert(pkg.scripts && pkg.scripts['test:events-audit'], 'package.json missing test:events-audit');
  assert(pkg.scripts && pkg.scripts['test:tournaments-audit'], 'package.json missing test:tournaments-audit');
  assert(pkg.scripts && pkg.scripts['test:notifications-route'], 'package.json missing test:notifications-route');
  assert(pkg.scripts['test:miniprogram-ci'].includes('test:notifications-route'), 'test:miniprogram-ci should run notifications route regression');
  assert(pkg.scripts && pkg.scripts['test:games-linkage'], 'package.json missing test:games-linkage');
  assert(pkg.scripts && pkg.scripts['test:miniprogram-request'], 'package.json missing test:miniprogram-request');
  assert(pkg.scripts && pkg.scripts['test:gamechanger-server'], 'package.json missing test:gamechanger-server');
  assert(pkg.scripts && pkg.scripts['test:miniprogram-flows'], 'package.json missing test:miniprogram-flows');
  assert(pkg.scripts && pkg.scripts['test:miniprogram-score'], 'package.json missing test:miniprogram-score');
  assert(pkg.scripts && pkg.scripts['test:miniprogram-preflight'], 'package.json missing test:miniprogram-preflight');
}

function checkAssetsAndQrRemoval() {
  ['logo.jpg', 'moon-earthrise.jpg', 'orion-default-player-avatar.png'].forEach(file => {
    assertFile(`miniprogram/assets/${file}`);
  });
  const allFiles = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else allFiles.push(full);
    }
  }
  walk(miniRoot);
  const qrRefs = allFiles
    .filter(file => /\.(js|json|wxml|wxss)$/.test(file))
    .filter(file => /qrcode|二维码|checkin-token/.test(fs.readFileSync(file, 'utf8')));
  assert(!qrRefs.length, `unexpected QR check-in references: ${qrRefs.map(file => path.relative(root, file)).join(', ')}`);
  const unboundedPlayerReads = [];
  const unboundedLeaderboardReads = [];
  allFiles
    .filter(file => /\.js$/.test(file))
    .forEach(file => {
      const rel = path.relative(root, file);
      fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (line.includes("api.get('/players'") && !line.includes('limit:') && !line.includes('playerPageParams') && !line.includes('playerQueryParams') && !line.includes('manualPlayerParams') && !line.includes('adminPlayerParams')) {
          unboundedPlayerReads.push(`${rel}:${index + 1}`);
        }
        if (line.includes("api.get('/leaderboard'") && !line.includes('limit:') && !line.includes('leaderboardParams') && !line.includes('leaderboardPageParams')) {
          unboundedLeaderboardReads.push(`${rel}:${index + 1}`);
        }
      });
    });
  assert(!unboundedPlayerReads.length, `mini program /players calls must be bounded: ${unboundedPlayerReads.join(', ')}`);
  assert(!unboundedLeaderboardReads.length, `mini program /leaderboard calls must be bounded: ${unboundedLeaderboardReads.join(', ')}`);
}

function checkMiniProgramUiGuards() {
  const homeWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.wxml'), 'utf8');
  const homeWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.wxss'), 'utf8');
  const homeJs = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.js'), 'utf8');
  const appWxss = fs.readFileSync(path.join(root, 'miniprogram/app.wxss'), 'utf8');
  // 2026-06-13 驾驶舱改版:首页=数据中心 tab,主导航迁入自定义 tabBar,首页只留三个信息区块 + 页脚低频文字链接
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
  assert(appJson.tabBar && appJson.tabBar.custom === true, 'app.json should declare a custom tabBar');
  const tabPaths = (appJson.tabBar.list || []).map(item => item.pagePath);
  ['pages/events/event-list/event-list', 'pages/home/home', 'pages/checkin/checkin', 'pages/points/points', 'pages/profile/profile'].forEach(pagePath => {
    assert(tabPaths.includes(pagePath), `tabBar list missing ${pagePath}`);
  });
  assert(tabPaths.length === 5 && tabPaths[2] === 'pages/checkin/checkin', 'checkin should be the centered 3rd tab');
  assert((appJson.tabBar.list || [])[0]?.text === '赛事活动', 'bottom-left tab should be the combined events/games hub');
  ['custom-tab-bar/index.js', 'custom-tab-bar/index.wxml', 'custom-tab-bar/index.wxss', 'custom-tab-bar/index.json'].forEach(file => {
    assert(fs.existsSync(path.join(root, 'miniprogram', file)), `custom tab bar missing ${file}`);
  });
  const tabBarJs = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.js'), 'utf8');
  ['wx.switchTab', 'setActiveByRoute', '赛事活动', '数据中心', '签到', '积分榜', '我的'].forEach(token => {
    assert(tabBarJs.includes(token), `custom tab bar missing ${token}`);
  });
  const tabBarWxss = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.wxss'), 'utf8');
  assert(tabBarWxss.includes('.orion-tabbar-big') && /margin-top:\s*-\d+rpx/.test(tabBarWxss), 'center checkin button should be raised and enlarged');
  // tabBar 用矢量 SVG 图标(灰/金两态),非 emoji;attached 即定位 active 消除选中态频闪
  assert(tabBarJs.includes('svgIcon') && tabBarJs.includes('iconActive') && tabBarJs.includes('checkinIcon'), 'tab bar should use vector SVG icons with active/inactive states');
  assert(tabBarJs.includes('attached') && tabBarJs.includes('getCurrentPages'), 'tab bar should resolve active tab on attach to avoid selection flicker');
  const tabBarWxml = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.wxml'), 'utf8');
  assert(tabBarWxml.includes('orion-tabbar-ico') && tabBarWxml.includes('iconActive') && tabBarWxml.includes('orion-tabbar-big-ico'), 'tab bar wxml should render image icons');
  const navUtil = fs.readFileSync(path.join(root, 'miniprogram/utils/nav.js'), 'utf8');
  assert(navUtil.includes('switchTab') && navUtil.includes('isTabPath') && navUtil.includes('syncTabBar'), 'nav util should route tab pages through switchTab');
  ['pages/events/event-list/event-list', 'pages/home/home', 'pages/checkin/checkin', 'pages/points/points', 'pages/profile/profile'].forEach(pagePath => {
    const js = fs.readFileSync(path.join(root, `miniprogram/${pagePath}.js`), 'utf8');
    const wxml = fs.readFileSync(path.join(root, `miniprogram/${pagePath}.wxml`), 'utf8');
    assert(js.includes('nav.syncTabBar(this)'), `${pagePath} should sync custom tabBar active state in onShow`);
    assert(wxml.includes('tab-page'), `${pagePath} should use tab-page safe scroll container`);
  });
  assert(appWxss.includes('.tab-page') && appWxss.includes('overflow-y: auto'), 'tab pages should scroll above the fixed custom tabBar');
  assert(/\.tab-page[\s\S]*padding-bottom:\s*220rpx/.test(appWxss), 'tab pages should keep enough bottom padding above the fixed custom tabBar');
  // 全局按钮基线: Apple 式圆角、居中和稳定高度,避免回退到 line-height/方角按钮。
  assertCss(appWxss, 'button', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 24rpx', 'line-height: normal', 'text-align: center'], 'global button reset');
  assert(!/button\s*\{[\s\S]*border-radius:\s*0/.test(appWxss), 'global button reset must not force square buttons');
  assertCss(appWxss, '.btn', ['display: flex', 'align-items: center', 'justify-content: center', 'min-height: 82rpx', 'line-height: 1.2', 'text-align: center'], 'global app button');
  assertRadiusAtLeast(appWxss, '.btn', 22, 'global app button');
  assertCss(appWxss, '.btn-small', ['min-height: 64rpx', 'border-radius: 20rpx'], 'global small button');
  assertCss(appWxss, '.btn-pill', ['border-radius: 999rpx'], 'global pill button');
  assert(appWxss.includes('.button-hover') && appWxss.includes('.btn-hover') && appWxss.includes('button[disabled]') && appWxss.includes('.btn[disabled]'), 'global button hover and disabled states should be stable');
  const eventDetailNav = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-detail/event-detail.js'), 'utf8');
  assert(eventDetailNav.includes('orionPendingCheckinEventId') && eventDetailNav.includes("wx.switchTab({ url: '/pages/checkin/checkin' })"), 'event detail should hand the checkin deep-link through storage + switchTab');
  const checkinNav = fs.readFileSync(path.join(root, 'miniprogram/pages/checkin/checkin.js'), 'utf8');
  assert(checkinNav.includes('orionPendingCheckinEventId'), 'checkin should consume the pending deep-link event id in onShow');

  ['openPlayer', '/pages/players/player-detail/player-detail'].forEach(token => {
    assert(homeJs.includes(token), `home leaderboard player link missing ${token}`);
  });
  ["api.get('/leaderboard', { limit: 3 })", "api.get('/games', { includeAggregate: 'false', limit: HOME_GAME_LIMIT })"].forEach(token => {
    assert(homeJs.includes(token), `home should cap heavy home requests: ${token}`);
  });
  assert(!homeJs.includes('/hall-of-fame') && !homeJs.includes('/highlights'), 'slim home should not fetch hall-of-fame/highlights content');
  ['bindtap="openPlayer"', 'data-id="{{item.playerId}}"', '{{item.displayName}}'].forEach(token => {
    assert(homeWxml.includes(token), `home leaderboard should link to player detail: ${token}`);
  });
  assert(homeWxml.includes('/pages/players/player-list/player-list') && homeWxml.includes('球员阵容'), 'home should keep roster entry as footer quick link');
  assert(homeWxml.includes('/pages/hall-of-fame/hall-of-fame') && homeWxml.includes('名人堂'), 'home should keep hall-of-fame entry as footer quick link');
  assert(homeWxml.includes('/pages/highlights/highlights') && homeWxml.includes('精彩时刻'), 'home should keep highlights entry as footer quick link');
  assert(homeWxml.includes('open-type="switchTab"'), 'home section links to tab pages should use switchTab navigators');
  assert(homeWxml.includes('hero-chip'), 'home hero should expose login/profile chip');
  assert(homeWxss.includes('.quick-links') && homeWxss.includes('.hero-chip'), 'home should style footer quick links and hero chip');
  assert(!homeWxml.includes('创建接龙'), 'home should not expose duplicate create-relay card');
  assert(!homeWxml.includes('发起比赛'), 'home should not expose duplicate create-game card');

  const profileWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.wxml'), 'utf8');
  const profileWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.wxss'), 'utf8');
  assert(profileWxml.includes('/pages/contact/contact') && profileWxml.includes('联系我们'), 'profile should expose contact page');
  assert(!profileWxml.includes('quick grid-2'), 'profile quick cards should not use grid-2 button layout');
  assert(profileWxml.includes('btn-danger logout') && profileWxss.includes('width: 100%'), 'profile logout should render as a full-width app-style button');
  assertCss(profileWxss, '.logout', ['display: flex !important', 'align-items: center', 'justify-content: center', 'width: 100% !important', 'border-radius: 26rpx', 'line-height: 1.2', 'text-align: center'], 'profile logout button');
  assertCss(profileWxss, '.link', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2'], 'profile link action button');
  // 个人面板入口改为 图标圆 + 标题 + 副标题 + 箭头 的清晰 cell(单列)
  ['quick-cell', 'quick-ico', 'quick-cell-title', 'quick-cell-sub', 'quick-arrow'].forEach(token => {
    assert(profileWxml.includes(token), `profile quick cell should expose ${token}`);
    assert(profileWxss.includes('.' + token) || profileWxss.includes(token), `profile quick cell should style ${token}`);
  });
  assert(!profileWxml.includes('My Orion') && !profileWxml.includes('Player Profile'), 'profile should not expose English eyebrows');

  const contactJs = fs.readFileSync(path.join(root, 'miniprogram/pages/contact/contact.js'), 'utf8');
  const contactWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/contact/contact.wxml'), 'utf8');
  ['CONTACT_PLAYER_LIMIT', 'loadTeamInfo', "'/team-info'", '2013 年 9 月', 'loadContactPlayers', "keyword: contact.playerName", 'qwecaoshan', '478753480@qq.com', '609655049', 'Alan__1110', 'Deco_E', '洁哥', 'wx.setClipboardData', 'copyJoinMessage'].forEach(token => {
    assert(contactJs.includes(token), `contact page missing ${token}`);
  });
  assert(!contactJs.includes("value: '2010'") && !contactJs.includes("copyValue: '2010'"), 'contact page should not use stale 2010 founded year');
  ['联系我们', '球队信息', '负责人', '复制咨询内容', '查看接龙', '查看用户协议、隐私政策和个人信息处理规则'].forEach(token => {
    assert(contactWxml.includes(token), `contact page UI missing ${token}`);
  });

  const eventCreateWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-create/event-create.wxml'), 'utf8');
  const eventCreateJs = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-create/event-create.js'), 'utf8');
  assert(eventCreateWxml.includes('wx:if="{{canCreateEvent}}"') && eventCreateWxml.includes('需要运营组权限'), 'event create page should be gated by ops permission');
  assert(eventCreateJs.includes('ensureEventWritePermission') && eventCreateJs.includes("permissions || []).includes('events:write')"), 'event create page should verify events:write before showing form');
  assert(eventCreateWxml.includes('<picker mode="selector" range="{{tagOptions}}"'), 'event tag should use a preset picker');
  assert(!eventCreateWxml.includes('bindinput="onTagInput"'), 'event tag should not be a manual input');
  assert(eventCreateWxml.includes('class="form-grid"'), 'event create should use narrow-safe form grid');
  assert(eventCreateJs.includes('tagOptions') && eventCreateJs.includes('onTagChange'), 'event create tag picker behavior missing');
  ['api.patch(`/events/${this.data.id}`', "api.post('/upload/base64'", "kind: 'event'", 'chooseCoverImage', 'chooseGalleryImages', 'removeGalleryImage', 'previewGalleryImage', 'sourceLink', 'wx.chooseLocation', 'chooseEventLocation', 'buildLocationMetadata', 'parseEventDate', 'buildEventDate', 'onEventDateChange', 'onEventTimeChange', 'clearEventTime', 'wx.chooseMedia', 'wx.getFileSystemManager().readFile', 'images: normalizeImages'].forEach(token => {
    assert(eventCreateJs.includes(token), `event create edit/cover behavior missing ${token}`);
  });
  ['mode="date"', 'mode="time"', 'eventDate', 'eventTime', '选择日期', '选择时间', '清空', '接龙封面图', '上传封面', '接龙配图', '上传配图', 'removeGalleryImage', '外部链接（可选）', '地图选择', 'locationMetaText', '{{submitLabel}}'].forEach(token => {
    assert(eventCreateWxml.includes(token), `event create edit/cover UI missing ${token}`);
  });
  ['小红书', 'xhsRaw', 'parseXhsPaste', 'pasteAndParseXhs', 'parseXhsContent', '一键导入帖子内容', '识别并填充', '粘贴识别', '原帖链接', 'bindinput="onDateInput"'].forEach(token => {
    assert(!eventCreateJs.includes(token) && !eventCreateWxml.includes(token), `event create should not expose removed paste/date input token ${token}`);
  });
  ['🏋️ 训练', '⚾ 比赛', '🧢 队内赛', '🌟 试训', '🤝 团队活动'].forEach(token => {
    assert(eventCreateJs.includes(token), `event create tag picker should use Chinese emoji label ${token}`);
  });
  ['Training · 训练', 'Game · 比赛', 'Scrimmage · 队内赛', 'Tryout · 试训', 'Team · 团队活动'].forEach(token => {
    assert(!eventCreateJs.includes(token), `event create tag picker should not expose English label ${token}`);
  });

  const eventListWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-list/event-list.wxml'), 'utf8');
  const eventListJs = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-list/event-list.js'), 'utf8');
  const eventListWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-list/event-list.wxss'), 'utf8');
  assert(eventListWxml.includes('赛事活动工作台') && eventListWxml.includes('hub-actions') && eventListWxml.includes('hub-action-card'), 'event list should be the events/games hub with narrow-safe actions');
  assert(eventListWxml.includes('wx:if="{{canCreateEvent}}"') && eventListJs.includes('canCreateEvents(user)'), 'event list create button should only show to events:write users');
  ['开始记录比赛', '新建赛事', '发起活动接龙', '接龙', '赛事', '比赛', 'sectionTabs', 'activeSection', '最近接龙', '赛事容器', '最近比赛', 'tournaments', 'recentGames', 'openTournament', 'editTournament', 'openGame', 'openImport', 'wx:if="{{canRecordGame}}"', 'wx:if="{{canManageTournaments}}"', 'bindtap="startRecord"', 'bindtap="createTournament"', 'bindtap="openGames"', '/pages/score/create/create', '/pages/tournaments/tournament-manage/tournament-manage', '/pages/games/game-list/game-list', '/pages/games/game-import/game-import', 'canRecordGames(user)', 'canManageTournaments(user)'].forEach(token => {
    assert(eventListWxml.includes(token) || eventListJs.includes(token), `event list games entry missing ${token}`);
  });
  ['EVENT_PAGE_LIMIT', 'TOURNAMENT_PAGE_LIMIT', "includeGameCount: 'true'", 'formatTournamentCard', 'hasMore', 'nextOffset', 'loadMore', 'mergeEventsById', "'/auth/me'"].forEach(token => {
    assert(eventListJs.includes(token), `event list pagination missing ${token}`);
  });
  assert(eventListWxml.includes('加载更多接龙') && eventListWxss.includes('.load-more'), 'event list should expose paged loading UI');
  assert(eventListWxml.includes('event-cover') && eventListWxml.includes('{{item.previewCover}}'), 'event list should render event cover images');
  assert(eventListJs.includes('previewCover') && eventListJs.includes('normalizeImages(ev.images)'), 'event list should fall back to first gallery image');
  assert(eventListJs.includes('readServerSignupCount') && eventListJs.includes('loadLegacySignupCounts'), 'event list should use /events signup counts with legacy fallback');
  assert(eventListWxss.includes('display: grid') && eventListWxss.includes('minmax(0, 1fr)') && eventListWxss.includes('.section-tabs'), 'event list hub actions should fit within page width');
  assertCss(eventListWxss, '.hub-action-card', ['align-items: center', 'justify-content: center', 'border-radius: 26rpx', 'text-align: center'], 'event list action card button');
  assertCss(eventListWxss, '.section-tabs', ['border-radius: 999rpx'], 'event list segmented control');
  assertCss(eventListWxss, '.section-tab', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx', 'line-height: 1.2'], 'event list segmented tab');
  assertCss(eventListWxss, '.load-more', ['display: flex', 'align-items: center', 'justify-content: center', 'border-radius: 24rpx'], 'event list load more button');

  const eventDetailWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/events/event-detail/event-detail.wxss'), 'utf8');
  assert(eventDetailWxss.includes('display: flex') && eventDetailWxss.includes('flex-wrap: wrap') && eventDetailWxss.includes('min-width: 148rpx'), 'event detail signup actions should wrap safely');
  assert(eventDetailWxss.includes('.linked-game-row') && eventDetailWxss.includes('.linked-game-score') && eventDetailWxss.includes('.linked-game-more'), 'event detail should style linked game score rows and more button');
  assert(eventDetailWxss.includes('.manual-player-search') && eventDetailWxss.includes('.manual-player-more'), 'event detail should style manual player search and load more controls');
  assertCss(eventDetailWxss, '.signup-actions .btn', ['border-radius: 22rpx'], 'event detail signup button');
  assertCss(eventDetailWxss, '.relay-import-actions .btn', ['border-radius: 24rpx'], 'event detail relay import button');
  assertCss(eventDetailWxss, '.tiny-link', ['display: inline-flex', 'align-items: center', 'justify-content: center', 'border-radius: 999rpx'], 'event detail tiny action button');
}

function main() {
  checkProjectConfig();
  checkAppJson();
  checkCloudConfig();
  checkCoreBusinessSurface();
  checkPackageScripts();
  checkAssetsAndQrRemoval();
  checkMiniProgramUiGuards();
  console.log('Mini program preflight passed');
}

main();
