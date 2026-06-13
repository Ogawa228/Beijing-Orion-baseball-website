const assert = require('assert');
const path = require('path');
const { parseRelayPaste } = require('../server/routes/event-signups');

const root = path.resolve(__dirname, '..');
const requestPath = path.join(root, 'miniprogram/utils/request.js');

let pageDef = null;
let appState = {};
let navigation = [];
let navigateBackCount = 0;
let relaunches = [];
let redirects = [];
let toasts = [];
let storage = {};
let clipboardText = '';
let clipboardWrites = [];
let imagePreviews = [];
let messageFiles = [];
let messageFileRequests = [];
let mediaFiles = [];
let fileReads = {};
let fileWrites = [];
let documentOpens = [];
let chooseLocationCalls = [];
let chosenLocation = null;
let chooseLocationError = null;
let locationCalls = [];
let locationError = null;
let fuzzyLocationCalls = [];
let fuzzyLocationError = null;

global.Page = def => { pageDef = def; };

global.getApp = () => appState;

global.wx = {
  env: { USER_DATA_PATH: '/tmp/orion-mini' },
  showToast({ title }) {
    toasts.push(title);
  },
  showModal({ success }) {
    success({ confirm: true, cancel: false });
  },
  navigateTo({ url }) {
    navigation.push(url);
  },
  switchTab({ url }) {
    // tab 页跳转与 navigateTo 共用 navigation 轨迹,断言 url 即可
    navigation.push(url);
  },
  navigateBack() {
    navigateBackCount += 1;
  },
  redirectTo({ url }) {
    redirects.push(url);
  },
  reLaunch({ url }) {
    relaunches.push(url);
  },
  login({ success }) {
    success({ code: 'wx_test_code' });
  },
  stopPullDownRefresh() {},
  chooseLocation(options) {
    chooseLocationCalls.push(options);
    if (chooseLocationError) {
      if (options.fail) options.fail(chooseLocationError);
      return;
    }
    options.success(chosenLocation || {
      name: '奥体中心棒垒球场',
      address: '北京市朝阳区奥体中心南侧',
      latitude: 39.99234,
      longitude: 116.39765,
    });
  },
  getLocation(options) {
    locationCalls.push(options);
    if (locationError) {
      if (options.fail) options.fail(locationError);
      return;
    }
    options.success({ latitude: 39.90421, longitude: 116.40741, accuracy: 25 });
  },
  getFuzzyLocation(options) {
    fuzzyLocationCalls.push(options);
    if (fuzzyLocationError) {
      if (options.fail) options.fail(fuzzyLocationError);
      return;
    }
    options.success({ latitude: 39.9042, longitude: 116.4074 });
  },
  getClipboardData({ success }) {
    success({ data: clipboardText });
  },
  setClipboardData({ data, success }) {
    clipboardWrites.push(data);
    if (success) success();
  },
  previewImage(options) {
    imagePreviews.push(options);
  },
  chooseMessageFile(options) {
    const { success } = options;
    messageFileRequests.push(options);
    success({ tempFiles: messageFiles });
  },
  chooseMedia({ success }) {
    success({ tempFiles: mediaFiles });
  },
  getFileSystemManager() {
    return {
      readFile({ filePath, success, fail }) {
        if (Object.prototype.hasOwnProperty.call(fileReads, filePath)) {
          success({ data: fileReads[filePath] });
        } else if (fail) {
          fail(new Error(`missing mock file ${filePath}`));
        }
      },
      writeFile({ filePath, data, encoding, success }) {
        fileWrites.push({ filePath, data, encoding });
        if (success) success();
      },
    };
  },
  openDocument({ filePath, fileType, success }) {
    documentOpens.push({ filePath, fileType });
    if (success) success();
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
};

function resetGlobals() {
  pageDef = null;
  navigation = [];
  navigateBackCount = 0;
  relaunches = [];
  redirects = [];
  toasts = [];
  storage = {};
  clipboardText = '';
  clipboardWrites = [];
  imagePreviews = [];
  messageFiles = [];
  messageFileRequests = [];
  mediaFiles = [];
  fileReads = {};
  fileWrites = [];
  documentOpens = [];
  chooseLocationCalls = [];
  chosenLocation = null;
  chooseLocationError = null;
  locationCalls = [];
  locationError = null;
  fuzzyLocationCalls = [];
  fuzzyLocationError = null;
  appState = {
    globalData: {
      user: { id: 'u_test', displayName: '测试队员' },
      player: { id: 'p_test', name: '测试队员', level: 'casual' },
    },
    setIdentity({ user, player }) {
      this.globalData.user = user || null;
      this.globalData.player = player || null;
    },
  };
}

function installApiMock(api) {
  delete require.cache[requestPath];
  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: api,
  };
}

function loadPage(relPath, api) {
  resetGlobals();
  installApiMock(api);
  const abs = path.join(root, relPath);
  delete require.cache[abs];
  require(abs);
  assert(pageDef, `${relPath} should register Page()`);
  return createPage(pageDef);
}

function createPage(def) {
  const page = {
    data: JSON.parse(JSON.stringify(def.data || {})),
    setData(patch) {
      for (const [key, value] of Object.entries(patch || {})) {
        this.data[key] = value;
      }
    },
  };
  for (const [key, value] of Object.entries(def)) {
    page[key] = typeof value === 'function' ? value.bind(page) : value;
  }
  return page;
}

function input(value) {
  return { detail: { value } };
}

function tap(dataset) {
  return { currentTarget: { dataset } };
}

function touch(dataset, y, x = 120) {
  const point = { clientY: y, clientX: x };
  return { currentTarget: { dataset }, touches: [point], changedTouches: [point] };
}

async function testLoginLegalFlow() {
  const posts = [];
  const page = loadPage('miniprogram/pages/login/login.js', {
    post: async (url, payload) => {
      posts.push({ url, payload });
      return {
        ok: true,
        isNew: true,
        user: { id: 'u_wx', displayName: payload.displayName },
        player: { id: 'p_wx', name: payload.displayName, level: 'casual' },
      };
    },
  });

  page.onNameInput(input('江山'));
  await page.login();
  assert.strictEqual(posts.length, 0);
  assert(toasts.includes('请先勾选协议确认'));
  assert.strictEqual(page.data.legalPageUrl, '/pages/legal/legal?url=https%3A%2F%2Fwww.%E7%8C%8E%E6%88%B7%E5%BA%A7%E6%A3%92%E5%9E%92%E7%90%83.cn%2Flegal.html');
  page.onConsentChange({ detail: { value: ['terms', 'personal-info', 'guardian'] } });
  assert.strictEqual(page.data.allConsented, true);
  await page.login();
  assert.strictEqual(posts[0].url, '/auth/wx-login');
  assert.strictEqual(posts[0].payload.code, 'wx_test_code');
  assert.strictEqual(posts[0].payload.legalAccepted, true);
  assert.strictEqual(posts[0].payload.personalInfoAccepted, true);
  assert.strictEqual(posts[0].payload.guardianConfirmed, true);
  assert.strictEqual(posts[0].payload.legalUrl, 'https://www.猎户座棒垒球.cn/legal.html');
  assert.strictEqual(appState.globalData.player.level, 'casual');
  await new Promise(resolve => setTimeout(resolve, 380));
  assert.strictEqual(relaunches.pop(), '/pages/bind/bind');
}

async function testEventDetailFlow() {
  const posts = [];
  const patches = [];
  const dels = [];
  const gameGets = [];
  const playerGets = [];
  const page = loadPage('miniprogram/pages/events/event-detail/event-detail.js', {
    get: async (url, params) => {
      if (url === '/events/e1') {
        return {
          event: {
            id: 'e1',
            title: '周末训练',
            date: '2026-06-06',
            location: '朝阳',
            cover: 'https://cos.example/event-cover.jpg',
            images: ['https://cos.example/event-1.jpg', 'https://cos.example/event-2.jpg'],
            sourceLink: 'https://www.xiaohongshu.com/explore/orion',
          },
        };
      }
      if (url === '/players') {
        playerGets.push({ ...params });
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        if (params.keyword === '测试') {
          assert.strictEqual(params.offset, 0);
          return {
            players: [
              { id: 'p_test', name: '测试队员', number: 11, level: 'verified' },
            ],
            hasMore: false,
            nextOffset: 1,
          };
        }
        if (params.offset === 50) {
          return {
            players: [
              { id: 'p_more', name: '第二页队员', number: 88, level: 'verified' },
            ],
            hasMore: false,
            nextOffset: 51,
          };
        }
        assert.strictEqual(params.offset, 0);
        assert.strictEqual(params.keyword, undefined);
        return {
          players: [
            { id: 'p_test', name: '测试队员', number: 11, level: 'verified' },
            { id: 'p_new', name: '新试训', number: 66, level: 'casual' },
          ],
          hasMore: true,
          nextOffset: 50,
        };
      }
      if (url === '/event-signups') {
        assert.strictEqual(params.eventId, 'e1');
        return {
          signups: [
            { id: 's1', eventId: 'e1', userId: 'u_test', playerName: '测试队员', status: 'going', note: '晚到' },
            { id: 's2', eventId: 'e1', userId: 'u_other', userDisplayName: '队友', status: 'tentative', note: '' },
            { id: 's_import', eventId: 'e1', manualName: '微信群新人', status: 'going', note: '手动导入' },
            { id: 's3', eventId: 'e1', userId: 'u_cancel', userDisplayName: '取消者', status: 'cancelled', note: '' },
          ],
        };
      }
      if (url === '/games') {
        gameGets.push({ ...params });
        assert.strictEqual(params.eventId, 'e1');
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 20);
        if (params.offset === 1) {
          return {
            games: [
              {
                id: 'g_event_2',
                eventId: 'e1',
                sport: 'softball',
                date: '2026-06-13',
                away: '猎户座',
                home: '海淀队',
                awayScore: 5,
                homeScore: 4,
                seasonName: '训练赛',
              },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          games: [
            {
              id: 'g_event_1',
              eventId: 'e1',
              sport: 'baseball',
              date: '2026-06-06',
              away: '猎户座',
              home: '朝阳队',
              awayScore: 8,
              homeScore: 6,
              seasonName: '周末联赛',
            },
          ],
          hasMore: true,
          nextOffset: 1,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      return { ok: true };
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      return { ok: true };
    },
    del: async url => {
      dels.push(url);
      return { ok: true };
    },
  });

  appState.globalData.user = { ...appState.globalData.user, role: 'admin', permissions: ['events:write', 'games:confirm'] };
  page.setData({ id: 'e1' });
  await page.load();
  assert.strictEqual(page.data.event.title, '周末训练');
  assert.strictEqual(page.data.event.cover, 'https://cos.example/event-cover.jpg');
  assert.strictEqual(page.data.event.heroCover, 'https://cos.example/event-cover.jpg');
  assert.deepStrictEqual(page.data.event.images, ['https://cos.example/event-1.jpg', 'https://cos.example/event-2.jpg']);
  assert.strictEqual(page.data.mine.id, 's1');
  assert.strictEqual(page.data.canImportSignups, true);
  assert.strictEqual(page.data.canManageSignups, true);
  assert.strictEqual(page.data.canEditEvent, true);
  assert.strictEqual(page.data.canStartGame, true);
  assert.strictEqual(page.data.manualPlayerOptions.length, 3);
  assert.strictEqual(page.data.manualPlayersHasMore, true);
  assert.deepStrictEqual(playerGets[0], { include: 'all', limit: 50, offset: 0 });
  await page.loadMoreManualPlayers();
  assert.strictEqual(page.data.manualPlayerOptions.length, 4);
  assert.strictEqual(page.data.manualPlayersHasMore, false);
  assert.deepStrictEqual(playerGets[1], { include: 'all', limit: 50, offset: 50 });
  page.onManualPlayerQueryInput(input('测试'));
  await page.searchManualPlayers();
  assert.strictEqual(page.data.manualPlayerOptions.length, 2);
  assert.deepStrictEqual(playerGets[2], { include: 'all', limit: 50, offset: 0, keyword: '测试' });
  await page.clearManualPlayerQuery();
  assert.strictEqual(page.data.manualPlayerOptions.length, 3);
  assert.deepStrictEqual(playerGets[3], { include: 'all', limit: 50, offset: 0 });
  assert.strictEqual(page.data.activeSignups.length, 3);
  assert.strictEqual(page.data.linkedGames.length, 1);
  assert.strictEqual(page.data.linkedGames[0].title, '猎户座 vs 朝阳队');
  assert.strictEqual(page.data.linkedGames[0].scoreText, '8 : 6');
  assert.strictEqual(page.data.linkedGamesHasMore, true);
  assert.strictEqual(page.data.linkedGamesNextOffset, 1);
  assert.deepStrictEqual(gameGets[0], { includeAggregate: 'false', eventId: 'e1', limit: 20, offset: 0 });
  await page.loadMoreLinkedGames();
  assert.strictEqual(page.data.linkedGames.length, 2);
  assert.strictEqual(page.data.linkedGames[1].title, '猎户座 vs 海淀队');
  assert.strictEqual(page.data.linkedGamesHasMore, false);
  assert.deepStrictEqual(gameGets[1], { includeAggregate: 'false', eventId: 'e1', limit: 20, offset: 1 });
  assert.deepStrictEqual(page.data.activeSignups.map(s => s.statusLabel), ['报名', '待定', '报名']);
  assert(page.data.activeSignups.some(s => s.manualName === '微信群新人'), 'manual imported relay name should be visible in signup list');

  page.onNoteInput(input('先待定，可能晚到'));
  await page.tentative();
  assert.strictEqual(posts[0].url, '/event-signups');
  assert.strictEqual(posts[0].payload.status, 'tentative');
  assert.strictEqual(posts[0].payload.eventId, 'e1');
  assert.strictEqual(posts[0].payload.source, 'mini');

  await page.cancelMine();
  assert.strictEqual(posts[1].url, '/event-signups/s1/cancel');

  page.onImportInput(input('1. 测试队员\n2. 微信群新人 待定 晚到'));
  await page.importRelayPaste();
  assert.strictEqual(posts[2].url, '/event-signups/import');
  assert.strictEqual(posts[2].payload.eventId, 'e1');
  assert.strictEqual(posts[2].payload.source, 'mini_relay_paste');
  assert(posts[2].payload.text.includes('微信群新人'));
  assert(page.data.importSummary.includes('已识别'));

  clipboardText = '1. 测试队员\n2. 新队友 请假';
  await page.pasteAndImportRelay();
  assert.strictEqual(posts[3].url, '/event-signups/import');
  assert(posts[3].payload.text.includes('新队友'));
  assert.strictEqual(page.data.importText, '');

  page.onManualPlayerChange(input('2'));
  page.onManualStatusChange(input('0'));
  page.onManualNoteInput(input('管理员补录'));
  await page.adminUpsertSignup();
  const adminSignupPost = posts.find(item => item.url === '/event-signups/admin-upsert');
  assert(adminSignupPost, 'event detail should allow admins to manually add relay members');
  assert.deepStrictEqual(adminSignupPost.payload, {
    eventId: 'e1',
    playerId: 'p_new',
    manualName: '',
    status: 'going',
    note: '管理员补录',
    source: 'mini_admin_manual',
  });

  page.onManualPlayerChange(input('0'));
  page.onManualNameInput(input('临时新人'));
  page.onManualStatusChange(input('1'));
  await page.adminUpsertSignup();
  const manualSignupPost = posts.filter(item => item.url === '/event-signups/admin-upsert').pop();
  assert.strictEqual(manualSignupPost.payload.manualName, '临时新人');
  assert.strictEqual(manualSignupPost.payload.status, 'tentative');

  await page.updateSignupStatus(tap({ id: 's2', status: 'going' }));
  assert.deepStrictEqual(patches[0], { url: '/event-signups/s2', payload: { status: 'going' } });

  page.copySourceLink();
  assert.strictEqual(clipboardWrites.pop(), 'https://www.xiaohongshu.com/explore/orion');
  page.previewEventImage(tap({ index: 1 }));
  assert.strictEqual(imagePreviews[0].current, 'https://cos.example/event-2.jpg');
  assert.deepStrictEqual(imagePreviews[0].urls, ['https://cos.example/event-1.jpg', 'https://cos.example/event-2.jpg']);
  page.startScoreFromEvent();
  assert.strictEqual(navigation.pop(), '/pages/score/create/create?eventId=e1');
  page.openGame(tap({ id: 'g_event_1' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g_event_1');
  page.editEvent();
  assert.strictEqual(navigation.pop(), '/pages/events/event-create/event-create?id=e1');
  await page.deleteEvent();
  assert(toasts.includes('请输入“删除接龙”确认'));
  page.onDeleteConfirmInput(input('删除接龙'));
  await page.deleteEvent();
  assert.strictEqual(dels[0], '/events/e1');
  assert.strictEqual(relaunches.pop(), '/pages/events/event-list/event-list');
}

async function testEventCreateEditFlow() {
  const posts = [];
  const patches = [];
  const page = loadPage('miniprogram/pages/events/event-create/event-create.js', {
    get: async url => {
      if (url === '/auth/me') {
        return {
          user: {
            id: 'u_ops',
            displayName: '运营组员',
            adminLevel: 'C',
            adminPermissionGroups: ['ops'],
            permissions: ['admin:access', 'events:write'],
          },
          player: null,
        };
      }
      if (url === '/events/e1') {
        return {
          event: {
            id: 'e1',
            title: '周末训练',
            tag: '🏋️ 训练',
            date: '2026-06-06 09:00',
            location: '朝阳',
            metadata: {
              location: {
                name: '朝阳',
                address: '北京市朝阳区测试球场',
                latitude: 39.91,
                longitude: 116.42,
                source: 'wx.chooseLocation',
              },
            },
            cover: 'https://cos.example/old-event.jpg',
            images: ['https://cos.example/old-gallery.jpg'],
            sourceLink: 'https://www.xiaohongshu.com/explore/orion',
            body: '原始训练说明',
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        return { url: `https://cos.example/${payload.fileName}`, cloudPath: `orion/event/${payload.fileName}` };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      return { event: { id: 'e1', ...payload } };
    },
  });

  page.onLoad({ id: 'e1' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(page.data.editing, true);
  assert.strictEqual(page.data.canCreateEvent, true);
  assert.strictEqual(page.data.pageTitle, '编辑队内接龙');
  assert.strictEqual(page.data.title, '周末训练');
  assert.strictEqual(page.data.eventDate, '2026-06-06');
  assert.strictEqual(page.data.eventTime, '09:00');
  assert.strictEqual(page.data.locationMetaText, '北京市朝阳区测试球场 · 39.91000, 116.42000');
  assert.strictEqual(page.data.cover, 'https://cos.example/old-event.jpg');
  assert.deepStrictEqual(page.data.images, ['https://cos.example/old-gallery.jpg']);
  assert.strictEqual(typeof page.parseXhsPaste, 'undefined');
  page.onEventDateChange(input('2026-06-08'));
  page.onEventTimeChange(input('18:30'));
  assert.strictEqual(page.data.date, '2026-06-08 18:30');
  mediaFiles = [{ tempFilePath: '/tmp/event-cover.png', name: 'event-cover.png', size: 1024 }];
  fileReads['/tmp/event-cover.png'] = 'event_cover_base64';
  await page.chooseCoverImage();
  assert.strictEqual(posts[0].url, '/upload/base64');
  assert.strictEqual(posts[0].payload.kind, 'event');
  assert.strictEqual(posts[0].payload.fileName, 'event-cover.png');
  assert.strictEqual(posts[0].payload.contentType, 'image/png');
  assert.strictEqual(page.data.cover, 'https://cos.example/event-cover.png');
  mediaFiles = [
    { tempFilePath: '/tmp/event-gallery-1.jpg', name: 'event-gallery-1.jpg', size: 1024 },
    { tempFilePath: '/tmp/event-gallery-2.webp', name: 'event-gallery-2.webp', size: 2048 },
  ];
  fileReads['/tmp/event-gallery-1.jpg'] = 'event_gallery_1_base64';
  fileReads['/tmp/event-gallery-2.webp'] = 'event_gallery_2_base64';
  await page.chooseGalleryImages();
  assert.strictEqual(posts[1].payload.fileName, 'event-gallery-1.jpg');
  assert.strictEqual(posts[2].payload.contentType, 'image/webp');
  assert.deepStrictEqual(page.data.images, [
    'https://cos.example/old-gallery.jpg',
    'https://cos.example/event-gallery-1.jpg',
    'https://cos.example/event-gallery-2.webp',
  ]);
  page.previewGalleryImage(tap({ index: 2 }));
  assert.strictEqual(imagePreviews[0].current, 'https://cos.example/event-gallery-2.webp');
  page.removeGalleryImage(tap({ index: 0 }));
  assert.deepStrictEqual(page.data.images, [
    'https://cos.example/event-gallery-1.jpg',
    'https://cos.example/event-gallery-2.webp',
  ]);
  page.onTitleInput(input('周末常规训练'));
  chosenLocation = {
    name: '奥体中心棒垒球场',
    address: '北京市朝阳区奥体中心南侧',
    latitude: 39.99234,
    longitude: 116.39765,
  };
  await page.chooseEventLocation();
  assert.strictEqual(chooseLocationCalls.length, 1);
  assert.strictEqual(page.data.location, '奥体中心棒垒球场');
  assert.strictEqual(page.data.locationSource, 'wx.chooseLocation');
  assert.strictEqual(page.data.locationMetaText, '北京市朝阳区奥体中心南侧 · 39.99234, 116.39765');
  page.onSourceLinkInput(input('https://www.bilibili.com/video/BVorion'));
  await page.submit();
  await new Promise(resolve => setTimeout(resolve, 380));
  assert.strictEqual(patches[0].url, '/events/e1');
  assert.strictEqual(patches[0].payload.title, '周末常规训练');
  assert.strictEqual(patches[0].payload.date, '2026-06-08 18:30');
  assert.strictEqual(patches[0].payload.location, '奥体中心棒垒球场');
  assert.strictEqual(patches[0].payload.metadata.location.source, 'wx.chooseLocation');
  assert.strictEqual(patches[0].payload.metadata.location.latitude, 39.99234);
  assert.strictEqual(patches[0].payload.cover, 'https://cos.example/event-cover.png');
  assert.deepStrictEqual(patches[0].payload.images, [
    'https://cos.example/event-gallery-1.jpg',
    'https://cos.example/event-gallery-2.webp',
  ]);
  assert.strictEqual(patches[0].payload.sourceLink, 'https://www.bilibili.com/video/BVorion');
  assert.strictEqual(redirects.pop(), '/pages/events/event-detail/event-detail?id=e1');
}

async function testEventListGalleryFlow() {
  let signupFetchCount = 0;
  const page = loadPage('miniprogram/pages/events/event-list/event-list.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return { user: { id: 'u_plain', displayName: '普通队员', permissions: [] }, player: null };
      }
      if (url === '/events') {
        assert.strictEqual(params.limit, 30);
        assert.strictEqual(params.offset, 0);
        return {
          events: [
            { id: 'e_cover', title: '有封面接龙', tag: '🏋️ 训练', cover: 'https://cos.example/cover.jpg', images: ['https://cos.example/gallery-a.jpg'], body: '训练说明', signupCount: 3 },
            { id: 'e_gallery', title: '只有配图接龙', tag: '⚾ 比赛', images: ['https://cos.example/gallery-first.jpg'], body: '比赛说明', signupCount: 0 },
          ],
          hasMore: false,
          nextOffset: 2,
        };
      }
      if (url === '/event-signups') {
        signupFetchCount += 1;
        assert(params.eventId === 'e_cover' || params.eventId === 'e_gallery');
        return { signups: params.eventId === 'e_cover' ? [{ id: 's1' }] : [] };
      }
      if (url === '/tournaments') {
        assert.strictEqual(params.includeGameCount, 'true');
        return {
          tournaments: [
            { id: 't_slow', type: 'league', name: '奥体慢垒春季赛', shortName: '奥体慢垒', sport: 'softball', season: '2026-slow', startDate: '2026-06-01', endDate: '2026-06-20', location: '奥体', gameCount: 2 },
          ],
        };
      }
      if (url === '/games') {
        return { games: [{ id: 'g_recent', away: '神策', home: '猎户座', awayScore: 3, homeScore: 7, sport: 'softball', date: '2026-06-02', seasonName: '奥体慢垒' }] };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.events.length, 2);
  assert.strictEqual(page.data.tournaments[0].displayName, '奥体慢垒');
  assert.strictEqual(page.data.recentGames[0].scoreText, '3 : 7');
  assert.strictEqual(page.data.events[0].previewCover, 'https://cos.example/cover.jpg');
  assert.strictEqual(page.data.events[1].previewCover, 'https://cos.example/gallery-first.jpg');
  assert.strictEqual(page.data.events[0].signupCount, 3);
  assert.strictEqual(page.data.canCreateEvent, false);
  assert.strictEqual(page.data.canRecordGame, false);
  assert.strictEqual(signupFetchCount, 0, 'event list should use /events signupCount instead of N+1 signup requests');
  page.create();
  assert.strictEqual(toasts.pop(), '需要运营组权限');
  page.startRecord();
  assert.strictEqual(toasts.pop(), '需要运营或记录权限');
  page.createTournament();
  assert.strictEqual(toasts.pop(), '需要赛事管理权限');
  page.switchSection(tap({ key: 'tournament' }));
  assert.strictEqual(page.data.activeSection, 'tournament');
  page.openTournament(tap({ id: 't_slow' }));
  assert.strictEqual(navigation.pop(), '/pages/tournaments/tournament-detail/tournament-detail?id=t_slow');
  page.openGames();
  assert.strictEqual(navigation.pop(), '/pages/games/game-list/game-list');
  page.open(tap({ id: 'e_gallery' }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-detail/event-detail?id=e_gallery');

  const opsPage = loadPage('miniprogram/pages/events/event-list/event-list.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return {
          user: {
            id: 'u_ops',
            displayName: '运营组员',
            adminLevel: 'C',
            adminPermissionGroups: ['ops'],
            permissions: ['admin:access', 'events:write', 'tournaments:write', 'games:draft'],
          },
          player: null,
        };
      }
      if (url === '/events') {
        assert.strictEqual(params.limit, 30);
        assert.strictEqual(params.offset, 0);
        return { events: [], hasMore: false, nextOffset: 0 };
      }
      if (url === '/tournaments') return { tournaments: [] };
      if (url === '/games') return { games: [] };
      throw new Error(`unexpected GET ${url}`);
    },
  });
  await opsPage.load();
  assert.strictEqual(opsPage.data.canCreateEvent, true);
  assert.strictEqual(opsPage.data.canRecordGame, true);
  assert.strictEqual(opsPage.data.canManageTournaments, true);
  opsPage.create();
  assert.strictEqual(navigation.pop(), '/pages/events/event-create/event-create');
  opsPage.createTournament();
  assert.strictEqual(navigation.pop(), '/pages/tournaments/tournament-manage/tournament-manage');
  opsPage.startRecord();
  assert.strictEqual(navigation.pop(), '/pages/score/create/create');

  let legacySignupFetchCount = 0;
  const legacyPage = loadPage('miniprogram/pages/events/event-list/event-list.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return { user: { id: 'u_ops', displayName: '运营组员', permissions: ['events:write'] }, player: null };
      }
      if (url === '/events') {
        assert.strictEqual(params.limit, 30);
        assert.strictEqual(params.offset, 0);
        return { events: [{ id: 'e_legacy', title: '旧后端接龙', tag: '🏋️ 训练', images: [], body: '' }], hasMore: false, nextOffset: 1 };
      }
      if (url === '/event-signups') {
        legacySignupFetchCount += 1;
        assert.strictEqual(params.eventId, 'e_legacy');
        return { signups: [{ id: 's1' }, { id: 's2' }] };
      }
      if (url === '/tournaments') return { tournaments: [] };
      if (url === '/games') return { games: [] };
      throw new Error(`unexpected GET ${url}`);
    },
  });
  await legacyPage.load();
  assert.strictEqual(legacyPage.data.events[0].signupCount, 2);
  assert.strictEqual(legacySignupFetchCount, 1, 'event list should keep legacy count fallback when /events has no count field');
}

async function testCheckinFlow() {
  const posts = [];
  const eventRequests = [];
  const page = loadPage('miniprogram/pages/checkin/checkin.js', {
    get: async (url, params = {}) => {
      if (url === '/events') {
        eventRequests.push(params);
        assert.strictEqual(params.limit, 60);
        if (params.offset === 0) {
          return {
            events: [{ id: 'e_recent', title: '最近训练', tag: '🏋️ 训练', date: '2026-06-05', location: '奥体' }],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            events: [{ id: 'e_more', title: '追加活动', tag: '📅 活动', date: '2026-06-08', location: '朝阳' }],
            hasMore: false,
            nextOffset: 2,
          };
        }
      }
      if (url === '/events/e1') {
        return { event: { id: 'e1', title: '周末比赛', tag: '⚾ 比赛', date: '2026-06-06', location: '朝阳' } };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      return {
        ok: true,
        duplicated: false,
        pointDelta: 5,
        points: { total: 35, breakdown: { base: 25, performance: 10, awards: 0, manual: 0 } },
        triggeredUpgrade: false,
        nameConflict: null,
        trialProgress: { level: 'casual', trainingCount: 6, requiredTrainingCount: 8, remainingTrainingCount: 2 },
        attendance: { id: 'att1', date: '2026-06-06', note: payload.note },
      };
    },
  });

  page.setData({ initialEventId: 'e1' });
  await page.loadRelays();
  assert.strictEqual(page.data.relayLabel, '周末比赛');
  assert.strictEqual(page.data.relayTypeLabel, '⚾ 比赛接龙');
  assert.strictEqual(page.data.relayIndex, 1);
  assert.deepStrictEqual(eventRequests, [{ limit: 60, offset: 0 }]);
  await page.loadMoreRelays();
  assert.strictEqual(page.data.relays.length, 4);
  assert.strictEqual(page.data.relayIndex, 1, 'loading more relays should preserve selected relay');
  assert.strictEqual(page.data.relaysHasMore, false);
  assert.deepStrictEqual(eventRequests, [{ limit: 60, offset: 0 }, { limit: 60, offset: 1 }]);
  await page.checkin();
  assert.strictEqual(posts[0].url, '/checkins/direct');
  assert.strictEqual(posts[0].payload.kind, 'event');
  assert.strictEqual(posts[0].payload.refId, 'e1');
  assert.strictEqual(posts[0].payload.source, 'mini_program_relay');
  assert.strictEqual(posts[0].payload.relay.title, '周末比赛');
  assert.strictEqual(locationCalls.length, 1);
  assert.strictEqual(fuzzyLocationCalls.length, 0);
  assert.strictEqual(posts[0].payload.location.type, 'precise');
  assert.strictEqual(posts[0].payload.location.source, 'wx.getLocation');
  assert.strictEqual(page.data.pointDeltaText, '积分 +5');
  assert.strictEqual(page.data.totalPointsText, '当前总积分 35');
  assert.strictEqual(page.data.trialProgressText, '');
  page.goPoints();
  assert.strictEqual(navigation.pop(), '/pages/points/points');
}

function testRelayPasteParser() {
  const players = [
    { id: 'p_test', name: '测试队员', aliases: JSON.stringify(['测队']) },
    { id: 'p_jiang', name: '江山', aliases: ['Jiang'] },
  ];
  const parsed = parseRelayPaste([
    '周末训练接龙',
    '1. 测队',
    '2. 微信群新人 待定 晚到',
    '3. 江山 请假',
    '4. 测队 重复',
  ].join('\n'), players);
  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].playerId, 'p_test');
  assert.strictEqual(parsed[0].status, 'going');
  assert.strictEqual(parsed[1].name, '微信群新人');
  assert.strictEqual(parsed[1].status, 'tentative');
  assert.strictEqual(parsed[1].note, '待定 晚到');
  assert.strictEqual(parsed[2].playerId, 'p_jiang');
  assert.strictEqual(parsed[2].status, 'cancelled');
}

async function testTrainingCheckinProgressFlow() {
  const posts = [];
  const page = loadPage('miniprogram/pages/checkin/checkin.js', {
    get: async (url, params = {}) => {
      if (url === '/events') {
        assert.deepStrictEqual(params, { limit: 60, offset: 0 });
        return {
          events: [{ id: 'train1', title: '周末训练', tag: '🏋️ 训练', date: '2026-06-07', location: '奥体' }],
          hasMore: false,
          nextOffset: 1,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      return {
      ok: true,
      duplicated: false,
      pointDelta: 5,
      points: { total: 25, breakdown: { base: 25, performance: 0, awards: 0, manual: 0 } },
      trialProgress: { level: 'casual', trainingCount: 6, requiredTrainingCount: 8, remainingTrainingCount: 2 },
      attendance: { id: 'att2', date: '2026-06-07', note: payload.note },
      };
    },
  });

  await page.loadRelays();
  page.onRelayChange({ detail: { value: 1 } });
  await page.checkin();
  assert.strictEqual(posts[0].payload.kind, 'training');
  assert.strictEqual(posts[0].payload.refId, 'train1');
  assert.strictEqual(posts[0].payload.location.type, 'precise');
  assert.strictEqual(posts[0].payload.location.source, 'wx.getLocation');
  assert.strictEqual(page.data.resultKindLabel, '🏋️ 训练接龙');
  assert.strictEqual(page.data.trialProgressText, '试训进度：训练签到 6/8，还差 2 次可自动升级');
}

async function testPointsFlow() {
  const leaderboardSeasons = [];
  const playerPointSeasons = [];
  const page = loadPage('miniprogram/pages/points/points.js', {
    get: async (url, params = {}) => {
      if (url === '/games/seasons') {
        return { seasons: [{ value: '2026' }, { value: '2025' }] };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        return {
          games: [
            { id: 'g_test', date: '2026-06-06' },
            { id: 'g_old', date: '2025-08-01' },
          ],
        };
      }
      if (url === '/leaderboard') {
        assert.strictEqual(params.limit, 50);
        assert.strictEqual(params.offset, 0);
        leaderboardSeasons.push(params.season || '');
        return {
          rules: {
            training: 5,
            friendlyOrTraining: 10,
            leagueOrCup: 15,
            event: 5,
            single: 1,
            hr: 10,
            rbi: 2,
            so: 3,
            bb_pitcher: -3,
            error: -3,
            seasonMvp: 100,
          },
          leaderboard: [
            { player: { id: 'p_test', name: '测试队员', number: 9, position: 'P' }, total: params.season === '2026' ? 17 : 35 },
          ],
        };
      }
      if (url === '/auth/me') {
        return { user: { id: 'u_test', displayName: '测试队员' }, player: { id: 'p_test', name: '测试队员' } };
      }
      if (url === '/players/p_test/points') {
        playerPointSeasons.push(params.season || '');
        const timeline = [
          { date: '2026-06-06', source: 'game', label: '比赛表现', delta: 12, refId: 'g_test', detail: { gameId: 'g_test', tournamentName: '测试杯' } },
          { date: '2026-06-04', source: 'training', label: '训练签到', delta: 5, refId: 'e_train', detail: { eventId: 'e_train', note: '准时到场' } },
          { date: '2026-06-01', source: 'manual', label: '管理员调整', delta: -3, refId: 'adj1', detail: { reason: '录入修正' } },
        ];
        return {
          total: params.season === '2026' ? 14 : 35,
          breakdown: params.season === '2026'
            ? { base: 15, performance: 2, awards: 0, manual: -3 }
            : { base: 25, performance: 10, awards: 0, manual: 0 },
          timeline,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  appState.globalData.player = null;
  await page.load();
  assert.strictEqual(appState.globalData.player.id, 'p_test');
  assert.strictEqual(page.data.mine.total, 35);
  assert.deepStrictEqual(page.data.seasonOptions.map(item => item.value), ['', '2026', '2025']);
  assert.strictEqual(page.data.seasonLabel, '全部赛季');
  assert.strictEqual(page.data.timeline[0].deltaText, '+12');
  assert.strictEqual(page.data.timeline[0].targetType, 'game');
  assert.strictEqual(page.data.timeline[0].targetId, 'g_test');
  assert.strictEqual(page.data.timeline[0].targetLabel, '查看比赛');
  assert.strictEqual(page.data.timeline[0].detailText, '测试杯');
  assert.strictEqual(page.data.timeline[1].targetType, 'event');
  assert.strictEqual(page.data.timeline[1].targetId, 'e_train');
  assert.strictEqual(page.data.timeline[1].detailText, '准时到场');
  assert.strictEqual(page.data.timeline[2].deltaClass, 'negative');
  assert.strictEqual(page.data.timeline[2].detailText, '备注：录入修正');
  assert.strictEqual(page.data.rulesCards[0].title, '⚾ 出场积分');
  assert.strictEqual(page.data.rulesCards[0].items[0].value, '+5');
  assert(page.data.rulesCards.some(group => group.items.some(rule => rule.key === 'bb_pitcher' && rule.value === '-3' && rule.deltaClass === 'negative')));
  assert.strictEqual(page.data.timelineFilterOptions[0].text, '全部 (3)');
  assert(page.data.timelineFilterOptions.some(item => item.value === 'game' && item.text === '⚾ 比赛 (1)'));
  page.setTimelineFilter(tap({ source: 'training' }));
  assert.strictEqual(page.data.timelineFilter, 'training');
  assert.strictEqual(page.data.timeline.length, 1);
  assert.strictEqual(page.data.timeline[0].source, 'training');
  page.setTimelineFilter(tap({ source: 'all' }));
  assert.strictEqual(page.data.timeline.length, 3);
  assert.strictEqual(page.data.leaderboard[0].rank, 1);
  assert.strictEqual(page.data.leaderboard[0].meta, '#9 · P');
  await page.onSeasonChange({ detail: { value: 1 } });
  assert.strictEqual(page.data.seasonLabel, '2026 赛季');
  assert.strictEqual(page.data.mine.total, 14);
  assert.strictEqual(page.data.leaderboard[0].total, 17);
  assert.deepStrictEqual(leaderboardSeasons, ['', '2026']);
  assert.deepStrictEqual(playerPointSeasons, ['', '2026']);
  page.openPlayer(tap({ id: 'p_test' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p_test');
  page.openTimelineItem(tap({ targetType: page.data.timeline[0].targetType, targetId: page.data.timeline[0].targetId }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g_test');
  page.openTimelineItem(tap({ targetType: page.data.timeline[1].targetType, targetId: page.data.timeline[1].targetId }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-detail/event-detail?id=e_train');
}

async function testPointsSeasonFallbackFlow() {
  const gameRequests = [];
  const page = loadPage('miniprogram/pages/points/points.js', {
    get: async (url, params = {}) => {
      if (url === '/games/seasons') {
        throw new Error('old backend');
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 100);
        gameRequests.push({ ...params });
        if (params.offset === 0) {
          return {
            games: [
              { id: 'g1', date: '2026-06-06' },
              { id: 'g2', date: '2025-08-01' },
            ],
            hasMore: true,
            nextOffset: 2,
          };
        }
        if (params.offset === 2) {
          return {
            games: [{ id: 'g3', date: '2024-07-01' }],
            hasMore: false,
            nextOffset: 3,
          };
        }
      }
      if (url === '/leaderboard') {
        assert.strictEqual(params.limit, 50);
        assert.strictEqual(params.offset, 0);
        return { rules: {}, leaderboard: [], hasMore: false, nextOffset: 0 };
      }
      if (url === '/auth/me') {
        return { user: { id: 'u_guest' }, player: null };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.deepStrictEqual(page.data.seasonOptions.map(item => item.value), ['', '2026', '2025', '2024']);
  assert.deepStrictEqual(gameRequests, [
    { includeAggregate: 'false', limit: 100, offset: 0 },
    { includeAggregate: 'false', limit: 100, offset: 2 },
  ]);
}

async function testHomeLeaderboardLinksFlow() {
  const page = loadPage('miniprogram/pages/home/home.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') return { user: { id: 'u_home', displayName: '首页用户' }, player: null };
      if (url === '/events') {
        assert.strictEqual(params.limit, 1);
        return { events: [{ id: 'e1', tag: 'Training', title: '训练', date: '2026-06-01', location: '奥体' }] };
      }
      if (url === '/leaderboard') {
        assert.strictEqual(params.limit, 3);
        return {
          leaderboard: [
            { player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' }, total: 132 },
            { player: { id: 'p2', name: '张三' }, total: 120 },
          ],
        };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 3);
        return { games: [{ id: 'g_recent', sport: 'softball', away: '猛虎', home: '猎户座', awayScore: 2, homeScore: 3, date: '2026-06-01' }] };
      }
      // 驾驶舱瘦身后首页不再拉名人堂/精彩时刻内容;命中即视为回归
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.loading, false, 'home loading should settle after load');
  assert.strictEqual(page.data.nextEvent.tagLabel, '🏋️ 训练');
  assert.strictEqual(page.data.leaders[0].displayName, 'Jiang');
  assert.strictEqual(page.data.leaders[0].playerId, 'p1');
  assert.strictEqual(page.data.games[0].sportLabel, '🥎 慢垒');
  assert.strictEqual(page.data.games[0].id, 'g_recent');
  page.openPlayer(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
  page.openGame(tap({ id: 'g1' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g1');
  page.goProfile();
  assert.strictEqual(navigation.pop(), '/pages/profile/profile', 'hero chip should switchTab to profile');
}

async function testContactFlow() {
  const playerGets = [];
  const page = loadPage('miniprogram/pages/contact/contact.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') return { user: null, player: null };
      if (url === '/team-info') {
        return {
          teamInfo: [
            { icon: '📍', label: '主场', value: '北京 · 奥体中心棒垒球场', copyValue: '北京 奥体中心棒垒球场' },
            { icon: '⭐', label: '成立时间', value: '2013 年 9 月', copyValue: '2013 年 9 月' },
          ],
        };
      }
      if (url === '/players') {
        playerGets.push({ ...params });
        assert.strictEqual(params.limit, 5);
        assert.strictEqual(params.offset, 0);
        if (params.keyword === '曹山') return { players: [{ id: 'p_cao', name: '曹山', publicAvatar: 'avatar://cao' }] };
        if (params.keyword === '王斌') return { players: [] };
        if (params.keyword === '李斯然') return { players: [] };
        if (params.keyword === '黄强') return { players: [] };
        throw new Error(`unexpected player keyword ${params.keyword}`);
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.teamInfo.find(item => item.label === '成立时间').value, '2013 年 9 月');
  assert.deepStrictEqual(playerGets.map(item => item.keyword).sort(), ['曹山', '王斌', '李斯然', '黄强'].sort());
  assert.strictEqual(page.data.contacts[0].avatar, 'avatar://cao');
  assert.strictEqual(page.data.contacts[1].initial, '王');
  assert.strictEqual(page.data.contacts[1].role, '联络人 · #110 · 外野');
  assert.strictEqual(page.data.contacts[2].name, '李斯然');
  assert.strictEqual(page.data.contacts[2].role, '队长');
  assert.strictEqual(page.data.contacts[3].name, '黄强');
  assert.strictEqual(page.data.contacts[4].name, '洁哥');
  assert.strictEqual(page.data.contacts[4].role, '球队经理');
  page.copyHandle(tap({ value: 'qwecaoshan', label: '曹山微信' }));
  assert.strictEqual(clipboardWrites.pop(), 'qwecaoshan');
  page.copyHandle(tap({ value: '478753480@qq.com', label: '王斌邮箱' }));
  assert.strictEqual(clipboardWrites.pop(), '478753480@qq.com');
  page.copyInfo(tap({ value: 'orion@beijing-orion.com', label: '邮箱' }));
  assert.strictEqual(clipboardWrites.pop(), 'orion@beijing-orion.com');
  page.onNameInput(input('测试新人'));
  page.onContactInput(input('wx_test'));
  page.onMessageInput(input('想参加周末试训'));
  page.copyJoinMessage();
  const copied = clipboardWrites.pop();
  assert(copied.includes('北京猎户座棒垒球试训信息'));
  assert(copied.includes('姓名：测试新人'));
  assert(copied.includes('联系方式：wx_test'));
  page.goEvents();
  assert.strictEqual(navigation.pop(), '/pages/events/event-list/event-list');
  page.goLegal();
  assert(navigation.pop().startsWith('/pages/legal/legal?url='));
}

async function testHallOfFameFlow() {
  const hofGets = [];
  let authGets = 0;
  const page = loadPage('miniprogram/pages/hall-of-fame/hall-of-fame.js', {
    get: async (url, params = {}) => {
      if (url === '/hall-of-fame') {
        hofGets.push({ ...params });
        assert.strictEqual(params.includePlayer, 'true');
        assert.strictEqual(params.limit, 30);
        if (params.offset === 1) {
          return {
            hallOfFame: [
              { playerId: 'p2', inductedYear: 2025, reason: '长期贡献', player: { id: 'p2', name: '张三', publicDisplayName: 'San', publicAvatar: 'avatar://san', number: 11, position: 'P' } },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          hallOfFame: [
            { playerId: 'p1', inductedYear: 2026, reason: '赛季 MVP', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang', publicAvatar: 'avatar://jiang', number: 7, position: 'CF' } },
          ],
          hasMore: true,
          nextOffset: 1,
        };
      }
      if (url === '/auth/me') {
        authGets += 1;
        return { user: { id: 'u_hof', displayName: '名人堂用户' }, player: null };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.entries.length, 1);
  assert.strictEqual(page.data.entries[0].displayName, 'Jiang');
  assert.strictEqual(page.data.entries[0].numberText, '#7');
  assert.strictEqual(page.data.entries[0].reasonText, '赛季 MVP');
  assert.strictEqual(page.data.hasMore, true);
  assert.strictEqual(page.data.nextOffset, 1);
  assert.deepStrictEqual(hofGets[0], { includePlayer: 'true', limit: 30, offset: 0 });
  await page.loadMore();
  assert.strictEqual(page.data.entries.length, 2);
  assert.strictEqual(page.data.entries[1].displayName, 'San');
  assert.strictEqual(page.data.entries[1].rank, 2);
  assert.strictEqual(page.data.hasMore, false);
  assert.deepStrictEqual(hofGets[1], { includePlayer: 'true', limit: 30, offset: 1 });
  assert.strictEqual(authGets, 1);
  page.openPlayer(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
}

async function testHighlightsImageFlow() {
  const posts = [];
  const patches = [];
  const dels = [];
  const guestCalls = [];
  const guestPage = loadPage('miniprogram/pages/highlights/highlights.js', {
    get: async (url, params = {}) => {
      guestCalls.push({ url, params });
      if (url === '/auth/me') return { user: null, player: null };
      if (url === '/highlights') {
        assert.strictEqual(params.public, 'true');
        assert.strictEqual(params.includePlayer, 'true');
        assert.strictEqual(params.includeGame, 'true');
        assert.strictEqual(params.limit, 60);
        return {
          highlights: [
            {
              id: 'h_guest',
              gameId: 'g_guest',
              title: '游客可见时刻',
              cover: 'https://cos.example/guest.jpg',
              playerName: '江山',
              status: 'published',
              player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' },
              game: { id: 'g_guest', away: '神策', home: '猎户座', awayScore: 14, homeScore: 19, date: '2026-03-29' },
            },
          ],
          hasMore: false,
          nextOffset: 1,
        };
      }
      throw new Error(`guest should not request ${url}`);
    },
  });
  await guestPage.load();
  assert.strictEqual(guestPage.data.highlights[0].gameId, 'g_guest');
  assert(guestPage.data.highlights[0].meta.includes('神策 14 : 19 猎户座'), 'guest highlights should use includeGame payload for score meta');
  assert(!guestCalls.some(call => call.url === '/games'), 'guest highlights should not fetch game picker options');
  assert(!guestCalls.some(call => call.url === '/players'), 'guest highlights should not fetch player picker options');

  const publicPlayerRequests = [];
  const publicPage = loadPage('miniprogram/pages/highlights/highlights.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') return { user: { id: 'u_test', displayName: '测试队员', permissions: [] }, player: { id: 'p_test', name: '测试队员' } };
      if (url === '/highlights') {
        assert.strictEqual(params.public, 'true');
        assert.strictEqual(params.includePlayer, 'true');
        assert.strictEqual(params.includeGame, 'true');
        assert.strictEqual(params.limit, 60);
        assert(Number.isFinite(Number(params.offset)));
        if (Number(params.offset) > 0) {
          return {
            highlights: [
              { id: 'h_extra', gameId: 'g2', title: '追加时刻', cover: 'https://cos.example/extra.jpg', url: '', playerName: '江山', status: 'published', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' }, game: { id: 'g2', away: '猎户座', home: '奥美', awayScore: 8, homeScore: 6, date: '2026-04-06' } },
            ],
            hasMore: false,
            nextOffset: 3,
          };
        }
        return {
          highlights: [
            { id: 'h_published', gameId: 'g9', title: '精彩时刻', cover: 'https://cos.example/published.jpg', url: 'https://www.bilibili.com/video/BV1xx', playerName: '江山', status: 'published', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' }, game: { id: 'g9', away: '旋风', home: '猎户座', awayScore: 5, homeScore: 6, date: '2026-04-13' } },
            { id: 'h_approved', gameId: 'g9', title: '精彩时刻', cover: 'https://cos.example/approved.jpg', url: 'https://www.bilibili.com/video/BV1xx', playerName: '江山', status: 'approved', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' }, game: { id: 'g9', away: '旋风', home: '猎户座', awayScore: 5, homeScore: 6, date: '2026-04-13' } },
            { id: 'h_pending', gameId: 'g9', title: '待审误回包', cover: 'https://cos.example/pending.jpg', url: '', playerName: '江山', status: 'pending', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' }, game: { id: 'g9', away: '旋风', home: '猎户座', awayScore: 5, homeScore: 6, date: '2026-04-13' } },
          ],
          hasMore: true,
          nextOffset: 2,
        };
      }
      if (url === '/players') {
        publicPlayerRequests.push(params);
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        assert(Number.isFinite(Number(params.offset)));
        if (Number(params.offset) > 0) {
          return {
            players: [{ id: 'p2', name: '队友', publicDisplayName: '队友', number: 11 }],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return {
          players: [{ id: 'p1', name: '江山', publicDisplayName: 'Jiang', number: 7 }],
          hasMore: true,
          nextOffset: 1,
        };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 50);
        assert(Number.isFinite(Number(params.offset)));
        if (Number(params.offset) > 0) {
          return {
            games: [{ id: 'g2', away: '猎户座', home: '奥美', awayScore: 8, homeScore: 6, date: '2026-04-06' }],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return {
          games: [{ id: 'g1', away: '神策', home: '猎户座', awayScore: 14, homeScore: 19, date: '2026-03-29' }],
          hasMore: true,
          nextOffset: 1,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') return { url: 'https://cos.example/mini-upload.jpg', cloudPath: 'orion/highlight/mini-upload.jpg' };
      return { highlight: { id: 'h_new', ...payload, status: 'pending' } };
    },
  });

  await publicPage.onLoad({ playerId: 'p1' });
  assert.strictEqual(publicPage.data.isReviewer, false);
  assert.strictEqual(publicPage.data.playerIndex, 1);
  assert.strictEqual(publicPage.data.playerLabel, '#7 Jiang');
  assert.strictEqual(publicPage.data.playerOptionHasMore, true);
  assert.strictEqual(publicPage.data.highlights.length, 2);
  assert.strictEqual(publicPage.data.highlightHasMore, true);
  assert.strictEqual(publicPage.data.gameOptionHasMore, true);
  assert.strictEqual(publicPage.data.highlights[0].bilibiliUrl, 'https://www.bilibili.com/video/BV1xx');
  assert.strictEqual(publicPage.data.highlights[0].playerId, 'p1');
  assert.strictEqual(publicPage.data.highlights[0].gameId, 'g9');
  assert(publicPage.data.highlights[0].meta.includes('旋风 5 : 6 猎户座'), 'photo wall meta should use highlight.game, not only picker games');
  await publicPage.loadMoreHighlights();
  assert.strictEqual(publicPage.data.highlights.length, 3);
  assert.strictEqual(publicPage.data.highlightHasMore, false);
  await publicPage.loadMoreGameOptions();
  assert.strictEqual(publicPage.data.gameOptions.length, 3);
  assert.strictEqual(publicPage.data.gameOptionHasMore, false);
  await publicPage.loadMorePlayerOptions();
  assert.strictEqual(publicPage.data.playerOptions.length, 3);
  assert.strictEqual(publicPage.data.playerOptionHasMore, false);
  assert.deepStrictEqual(publicPlayerRequests.map(item => item.offset), [0, 1]);
  publicPage.previewImage(tap({ image: 'https://cos.example/published.jpg' }));
  assert.strictEqual(imagePreviews[0].current, 'https://cos.example/published.jpg');
  publicPage.openPlayer(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
  publicPage.openGame(tap({ id: 'g9' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g9');
  publicPage.copyBilibili(tap({ url: 'https://www.bilibili.com/video/BV1xx' }));
  assert.strictEqual(clipboardWrites[0], 'https://www.bilibili.com/video/BV1xx');
  mediaFiles = [{ tempFilePath: '/tmp/highlight.jpg', size: 2048 }];
  fileReads = { '/tmp/highlight.jpg': '/9j/4AAQSkZJRg==' };
  await publicPage.chooseAndUploadImage();
  const uploadPost = posts.find(item => item.url === '/upload/base64');
  assert(uploadPost, 'mini highlights should upload selected images to COS');
  assert.strictEqual(uploadPost.payload.kind, 'highlight');
  assert.strictEqual(uploadPost.payload.fileName, 'highlight.jpg');
  assert.strictEqual(uploadPost.payload.contentType, 'image/jpeg');
  assert.strictEqual(publicPage.data.imageInput, 'https://cos.example/mini-upload.jpg');
  publicPage.onTitleInput(input('第 4 局关键安打'));
  publicPage.onBilibiliInput(input('https://www.bilibili.com/video/BV2xx'));
  publicPage.onPlayerChange({ detail: { value: 1 } });
  publicPage.onGameChange({ detail: { value: 1 } });
  await publicPage.submitHighlight();
  const highlightPost = posts.find(item => item.url === '/highlights');
  assert(highlightPost, 'mini highlights should submit uploaded image as highlight cover');
  assert.strictEqual(highlightPost.payload.cover, 'https://cos.example/mini-upload.jpg');
  assert.strictEqual(highlightPost.payload.url, 'https://www.bilibili.com/video/BV2xx');
  assert.strictEqual(highlightPost.payload.playerName, '江山');
  assert.strictEqual(highlightPost.payload.gameId, 'g1');

  const adminPage = loadPage('miniprogram/pages/highlights/highlights.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') return { user: { id: 'u_admin', displayName: '管理员', role: 'admin', permissions: ['highlights:write'] }, player: null };
      if (url === '/highlights') {
        assert.strictEqual(params.limit, 60);
        assert.strictEqual(params.offset, 0);
        assert.strictEqual(params.public, undefined);
        assert.strictEqual(params.includePlayer, 'true');
        assert.strictEqual(params.includeGame, 'true');
        return {
          highlights: [
            { id: 'h_pending', title: '待审图片', cover: 'https://cos.example/pending.jpg', status: 'pending' },
            { id: 'h_published', title: '已发图片', cover: 'https://cos.example/published.jpg', status: 'published' },
            { id: 'h_rejected', title: '已下架图片', cover: 'https://cos.example/rejected.jpg', status: 'rejected' },
          ],
          hasMore: false,
          nextOffset: 3,
        };
      }
      if (url === '/players') {
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        assert.strictEqual(params.offset, 0);
        return { players: [], hasMore: false, nextOffset: 0 };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 50);
        assert.strictEqual(params.offset, 0);
        return { games: [], hasMore: false, nextOffset: 0 };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      return { highlight: { id: 'h_pending', status: payload.status } };
    },
    del: async url => {
      dels.push(url);
      return { ok: true };
    },
  });
  await adminPage.load();
  assert.strictEqual(adminPage.data.isReviewer, true);
  assert.strictEqual(adminPage.data.highlights[0].isPending, true);
  assert.strictEqual(adminPage.data.highlights[1].isPublic, true);
  assert.strictEqual(adminPage.data.highlights[2].isRejected, true);
  await adminPage.publishHighlight(tap({ id: 'h_pending' }));
  assert.strictEqual(patches[0].url, '/highlights/h_pending');
  assert.strictEqual(patches[0].payload.status, 'published');
  await adminPage.unpublishHighlight(tap({ id: 'h_published' }));
  assert.strictEqual(patches[1].url, '/highlights/h_published');
  assert.strictEqual(patches[1].payload.status, 'rejected');
  assert(toasts.includes('已下架'));
  await adminPage.restoreHighlight(tap({ id: 'h_rejected' }));
  assert.strictEqual(patches[2].url, '/highlights/h_rejected');
  assert.strictEqual(patches[2].payload.status, 'approved');
  await adminPage.deleteHighlight(tap({ id: 'h_rejected' }));
  assert.strictEqual(dels[0], '/highlights/h_rejected');
}

async function testPlayerListFlow() {
  const leaderboardRequests = [];
  const page = loadPage('miniprogram/pages/players/player-list/player-list.js', {
    get: async (url, params = {}) => {
      if (url === '/players') {
        assert.strictEqual(params.limit, 40);
        assert.strictEqual(params.includeTotal, 'true');
        assert.strictEqual(params.includePositionCount, 'true');
        if (params.offset === 2) {
          return {
            players: [
              { id: 'p3', name: '李四', number: 22, position: 'LF', titles: [] },
            ],
            total: 3,
            positionCount: 3,
            hasMore: false,
            nextOffset: 3,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          players: [
            { id: 'p1', name: '江山', publicDisplayName: 'Jiang', publicAvatar: 'avatar://jiang', number: 7, position: 'CF', joinYear: 2024, titles: ['MVP'] },
            { id: 'p2', name: '张三', number: 18, position: 'SS', titles: [] },
          ],
          total: 3,
          positionCount: 3,
          hasMore: true,
          nextOffset: 2,
        };
      }
      if (url === '/leaderboard') {
        leaderboardRequests.push({ ...params });
        if (params.limit === 1 && !params.playerIds) {
          return {
            leaderboard: [
              { player: { id: 'p2', name: '张三' }, total: 120, rank: 1 },
            ],
          };
        }
        assert(Number(params.limit) <= 40, 'player roster should not fetch a 200-row leaderboard');
        if (params.playerIds === 'p1,p2') {
          return {
            leaderboard: [
              { player: { id: 'p2', name: '张三' }, total: 120, rank: 1 },
              { player: { id: 'p1', name: '江山' }, total: 88, rank: 2 },
            ],
          };
        }
        if (params.playerIds === 'p3') {
          return {
            leaderboard: [
              { player: { id: 'p3', name: '李四' }, total: 36, rank: 3 },
            ],
          };
        }
        throw new Error(`unexpected leaderboard params ${JSON.stringify(params)}`);
      }
      if (url === '/auth/me') return { user: null, player: null };
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.deepStrictEqual(leaderboardRequests[0], { limit: 1 });
  assert.deepStrictEqual(leaderboardRequests[1], { playerIds: 'p1,p2', limit: 2 });
  assert.strictEqual(page.data.playerCount, 3);
  assert.strictEqual(page.data.positionCount, 3);
  assert.strictEqual(page.data.topPlayer.displayName, '张三');
  assert.strictEqual(page.data.topPlayer.isFrostedName, true);
  assert.strictEqual(page.data.players[0].displayName, 'Jiang');
  assert.strictEqual(page.data.players[0].avatar, 'avatar://jiang');
  assert.strictEqual(page.data.players[0].isFrostedName, false);
  assert.strictEqual(page.data.players[0].rank, 2);
  assert.strictEqual(page.data.hasMore, true);
  await page.loadMore();
  assert.deepStrictEqual(leaderboardRequests[2], { playerIds: 'p3', limit: 1 });
  assert.strictEqual(page.data.players.length, 3);
  assert.strictEqual(page.data.players[2].rank, 3);
  assert.strictEqual(page.data.players[2].total, 36);
  assert.strictEqual(page.data.hasMore, false);
  page.onSearch(input('CF'));
  assert.strictEqual(page.data.visiblePlayers.length, 1);
  assert.strictEqual(page.data.visiblePlayers[0].id, 'p1');
  page.clearSearch();
  assert.strictEqual(page.data.visiblePlayers.length, 3);
  page.openDetail(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
}

async function testPlayerDetailFlow() {
  const patches = [];
  const posts = [];
  const dels = [];
  let playerData = {
    id: 'p1',
    name: '江山',
    photo: 'photo://real-old',
    publicDisplayName: 'Jiang',
    publicAvatar: 'avatar://jiang',
    number: 7,
    position: 'CF',
    bats: 'R',
    throws: 'R',
    joinYear: 2024,
    titles: ['MVP'],
    aliases: ['江'],
    slogan: '旧口号',
    level: 'casual',
  };
  const gameRequests = [];
  const playerListRequests = [];
  const page = loadPage('miniprogram/pages/players/player-detail/player-detail.js', {
    get: async (url, params = {}) => {
      if (url === '/players/p1') {
        return { player: playerData };
      }
      if (url === '/players') {
        playerListRequests.push(params);
        return { players: [] };
      }
      if (url === '/auth/me') return { user: { id: 'u_admin', displayName: '管理员', permissions: ['players:write', 'destructive:delete'] }, player: null };
      if (url === '/players/p1/points') {
        return {
          total: 88,
          breakdown: { base: 20, performance: 50, awards: 18, manual: 0 },
          timeline: [
            { date: '2026-06-06', source: 'game', label: '比赛表现', delta: 12, refId: 'g1', detail: { gameId: 'g1', tournamentName: '慢垒春季' } },
            { date: '2026-06-01', source: 'manual', label: '管理员调整', delta: -2, refId: 'adj1', detail: { reason: '纠错' } },
          ],
        };
      }
      if (url === '/games') {
        gameRequests.push(params);
        assert.strictEqual(params.includeAggregate, 'true');
        assert.strictEqual(params.playerId, 'p1');
        assert.strictEqual(params.limit, 30);
        if (params.offset === 4) {
          return {
            games: [
              {
                id: 'g4',
                date: '2026-04-20',
                sport: 'baseball',
                away: '猎户座',
                home: '海淀',
                awayScore: 6,
                homeScore: 3,
                batting: [{ playerId: 'p1', name: '江山', AB: 2, H: 1, R: 0, RBI: 1, pos: 'CF' }],
                pitching: [],
              },
            ],
            hasMore: false,
            nextOffset: 5,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          games: [
            {
              id: 'g1',
              date: '2026-06-06',
              sport: 'baseball',
              away: '猎户座',
              home: '测试队',
              awayScore: 8,
              homeScore: 6,
              batting: [
                { playerId: 'p1', name: '江山', AB: 4, H: 2, R: 1, RBI: 3, HR: 1, pos: 'CF' },
                { playerId: 'p2', name: '队友', AB: 3, H: 1, R: 1, RBI: 0, pos: 'SS' },
              ],
              pitching: [],
            },
            {
              id: 'g2',
              date: '2026-05-20',
              sport: 'softball',
              season: '2026',
              away: '测试队',
              home: '猎户座',
              awayScore: 5,
              homeScore: 7,
              batting: [{ name: '江', AB: 3, H: 1, R: 1, RBI: 0, pos: 'P' }],
              pitching: [{ name: '江山', IP: '2.0', SO: 2, BB: 1, ER: 0 }],
            },
            {
              id: 'g_agg_2026',
              date: '2026-12-31',
              sport: 'softball',
              season: '2026',
              away: '猎户座',
              home: '赛季汇总',
              awayScore: 0,
              homeScore: 0,
              isAggregate: true,
              batting: [{ name: '江山', gp: 12, AB: 50, H: 40, R: 20, RBI: 30, HR: 8 }],
              pitching: [],
            },
            {
              id: 'g3',
              date: '2026-05-01',
              sport: 'baseball',
              away: '别人',
              home: '测试队',
              awayScore: 1,
              homeScore: 2,
              batting: [{ name: '其他队员', AB: 3, H: 0 }],
            },
          ],
          hasMore: true,
          nextOffset: 4,
        };
      }
      if (url === '/highlights') {
        assert.strictEqual(params.public, 'true');
        assert.strictEqual(params.limit, 24);
        assert(['江山', 'Jiang', '江'].includes(params.playerName));
        if (params.playerName === 'Jiang') {
          return {
            highlights: [
              { id: 'h_player', title: '球员关键安打', cover: 'https://cos.example/player-hit.jpg', url: 'https://www.bilibili.com/video/BVplayer', playerName: 'Jiang', gameId: 'g1', status: 'published' },
              { id: 'h_pending', title: '待审不展示', cover: 'https://cos.example/pending.jpg', url: '', playerName: 'Jiang', gameId: 'g1', status: 'pending' },
            ],
          };
        }
        if (params.playerName === '江') {
          return {
            highlights: [
              { id: 'h_alias', title: '别名守备', cover: 'https://cos.example/player-field.jpg', url: '', playerName: '江', gameId: 'g2', status: 'approved' },
            ],
          };
        }
        return {
          highlights: [],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      if (url === '/players/p1') {
        playerData = { ...playerData, ...payload };
        return { player: playerData };
      }
      if (url === '/players/p1/public-profile') {
        playerData = {
          ...playerData,
          publicDisplayName: payload.publicDisplayName,
          publicAvatar: payload.publicAvatar,
        };
        return { player: playerData };
      }
      throw new Error(`unexpected PATCH ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        if (payload.kind === 'player') {
          return { url: 'https://cos.example/player-photo.png', cloudPath: 'orion/player/player-photo.png' };
        }
        return { url: 'https://cos.example/player-avatar.png', cloudPath: 'orion/avatar/player-avatar.png' };
      }
      if (url === '/players/p1/upgrade') {
        playerData = { ...playerData, level: 'verified' };
        return { player: playerData };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    del: async url => {
      dels.push(url);
      if (url === '/players/p1') return { ok: true };
      throw new Error(`unexpected DELETE ${url}`);
    },
  });

  page.setData({ id: 'p1' });
  await page.load();
  assert.strictEqual(page.data.player.displayName, 'Jiang');
  assert.strictEqual(page.data.player.avatar, 'avatar://jiang');
  assert.strictEqual(page.data.points.total, 88);
  assert.deepStrictEqual(page.data.breakdown.map(x => x.value), [20, 50, 18, 0]);
  assert.strictEqual(page.data.timeline[0].deltaText, '+12');
  assert.strictEqual(page.data.timeline[0].targetType, 'game');
  assert.strictEqual(page.data.timeline[0].targetId, 'g1');
  assert.strictEqual(page.data.timeline[0].detailText, '慢垒春季');
  assert.strictEqual(page.data.timeline[1].deltaClass, 'negative');
  assert.strictEqual(page.data.timeline[1].detailText, '备注：纠错');
  assert.deepStrictEqual(playerListRequests, [], 'player detail should derive capability roster from loaded games instead of fetching /players');
  assert.deepStrictEqual(gameRequests, [{ includeAggregate: 'true', playerId: 'p1', limit: 30, offset: 0 }]);
  assert.strictEqual(page.data.gamesHasMore, true);
  assert.strictEqual(page.data.gamesNextOffset, 4);
  assert.strictEqual(page.data.gameLoadedSummary, '已加载最近 2 场，可继续加载历史比赛');
  assert.strictEqual(page.data.games.length, 2);
  assert.strictEqual(page.data.capability.hasStats, true);
  assert.strictEqual(page.data.capability.slash, '.429 / .429 / .857');
  assert.strictEqual(page.data.capability.OPS, '1.286');
  assert.strictEqual(page.data.capability.games, 2, 'same-season aggregate rows should not double-count when game rows exist');
  assert.deepStrictEqual(page.data.capability.rateCards.map(x => x.value), ['.429', '.429', '.857', '1.286']);
  assert.deepStrictEqual(page.data.capability.metrics.map(x => x.value), [3, 2, 3, 1]);
  assert.deepStrictEqual(page.data.capability.advanced.map(x => x.label), ['ISO', 'BB%', 'K%', 'BB/K']);
  assert.strictEqual(page.data.capability.trend[0].singleAvgText, '.500');
  assert.strictEqual(page.data.capability.trend[1].rollingAvgText, '.333');
  assert(page.data.games[0].meta.includes('⚾ 棒球'), 'related game meta should display Chinese sport labels with emoji');
  assert(page.data.games[1].meta.includes('🥎 慢垒'), 'related game meta should display Chinese sport labels with emoji');
  assert.strictEqual(page.data.games[0].battingText.includes('2H/4AB'), true);
  assert.strictEqual(page.data.games[1].pitchingText.includes('2.0 IP'), true);
  await page.loadMorePlayerGames();
  assert.deepStrictEqual(gameRequests, [
    { includeAggregate: 'true', playerId: 'p1', limit: 30, offset: 0 },
    { includeAggregate: 'true', playerId: 'p1', limit: 30, offset: 4 },
  ]);
  assert.strictEqual(page.data.gamesHasMore, false);
  assert.strictEqual(page.data.games.length, 3);
  assert.strictEqual(page.data.capability.games, 3);
  assert.strictEqual(page.data.gameLoadedSummary, '已加载 3 场相关比赛');
  assert.strictEqual(page.data.highlights.length, 2);
  assert.strictEqual(page.data.highlights[0].title, '球员关键安打');
  assert.strictEqual(page.data.highlightImages[1], 'https://cos.example/player-field.jpg');
  page.previewHighlight(tap({ image: 'https://cos.example/player-hit.jpg' }));
  assert.strictEqual(imagePreviews[0].current, 'https://cos.example/player-hit.jpg');
  assert.deepStrictEqual(imagePreviews[0].urls, ['https://cos.example/player-hit.jpg', 'https://cos.example/player-field.jpg']);
  page.copyHighlightLink(tap({ url: 'https://www.bilibili.com/video/BVplayer' }));
  assert.strictEqual(clipboardWrites[0], 'https://www.bilibili.com/video/BVplayer');
  page.submitPlayerHighlight();
  assert.strictEqual(navigation.pop(), '/pages/highlights/highlights?playerId=p1');
  assert.strictEqual(page.data.canEditPlayer, true);
  assert.strictEqual(page.data.canDeletePlayer, true);
  assert.strictEqual(page.data.editPhoto, 'photo://real-old');
  assert.strictEqual(page.data.editPublicDisplayName, 'Jiang');
  assert.strictEqual(page.data.editPublicAvatar, 'avatar://jiang');
  assert.strictEqual(page.data.editAliases, '江');
  mediaFiles = [{ tempFilePath: '/tmp/player-photo.png', name: 'player-photo.png' }];
  fileReads['/tmp/player-photo.png'] = 'photo_base64';
  await page.choosePlayerPhoto();
  const photoUpload = posts.find(item => item.url === '/upload/base64' && item.payload.kind === 'player');
  assert.strictEqual(photoUpload.payload.fileName, 'player-photo.png');
  assert.strictEqual(page.data.editPhoto, 'https://cos.example/player-photo.png');
  mediaFiles = [{ tempFilePath: '/tmp/player-avatar.png', name: 'player-avatar.png' }];
  fileReads['/tmp/player-avatar.png'] = 'avatar_base64';
  await page.choosePublicAvatar();
  const avatarUpload = posts.find(item => item.url === '/upload/base64' && item.payload.kind === 'avatar');
  assert.strictEqual(avatarUpload.payload.kind, 'avatar');
  assert.strictEqual(avatarUpload.payload.fileName, 'player-avatar.png');
  assert.strictEqual(page.data.editPublicAvatar, 'https://cos.example/player-avatar.png');
  page.onEditPublicDisplayNameInput(input('公开江山'));
  page.onEditNumberInput(input('17'));
  page.onEditPositionInput(input('P/CF'));
  page.onEditSloganInput(input('新口号'));
  page.onEditTitlesInput(input('MVP、金手套'));
  page.onEditAliasesInput(input('江、Jiang'));
  await page.savePlayerProfile();
  assert.strictEqual(patches[0].url, '/players/p1');
  assert.strictEqual(patches[0].payload.photo, 'https://cos.example/player-photo.png');
  assert.strictEqual(patches[0].payload.number, '17');
  assert.strictEqual(patches[0].payload.position, 'P/CF');
  assert.deepStrictEqual(patches[0].payload.titles, ['MVP', '金手套']);
  assert.deepStrictEqual(patches[0].payload.aliases, ['江', 'Jiang']);
  assert.strictEqual(patches[1].url, '/players/p1/public-profile');
  assert.strictEqual(patches[1].payload.publicDisplayName, '公开江山');
  assert.strictEqual(patches[1].payload.publicAvatar, 'https://cos.example/player-avatar.png');
  assert.strictEqual(page.data.player.numberText, '#17');
  assert.strictEqual(page.data.player.displayName, '公开江山');
  await page.upgradePlayer();
  assert(posts.some(item => item.url === '/players/p1/upgrade'));
  assert.strictEqual(page.data.player.level, 'verified');
  await page.deletePlayer();
  assert(toasts.includes('请输入“删除球员”确认'));
  assert.strictEqual(dels.length, 0);
  page.onDeleteConfirmInput(input('删除球员'));
  await page.deletePlayer();
  assert.strictEqual(dels[0], '/players/p1');
  assert.strictEqual(redirects.pop(), '/pages/players/player-list/player-list');
  page.openTimelineItem(tap({ targetType: page.data.timeline[0].targetType, targetId: page.data.timeline[0].targetId }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g1');
  page.openGame(tap({ id: 'g1' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g1');
}

async function testProfileSettingsFlow() {
  const patches = [];
  const posts = [];
  let me = {
    user: { id: 'u_profile', displayName: '旧昵称', avatar: 'avatar://old', permissions: [] },
    player: {
      id: 'p1',
      name: '真实姓名',
      level: 'verified',
      photo: 'photo://real',
      publicDisplayName: '公开名',
      publicAvatar: 'avatar://public',
    },
  };
  const page = loadPage('miniprogram/pages/profile/profile.js', {
    get: async url => {
      if (url === '/auth/me') return me;
      if (url === '/event-signups/mine') return { signups: [] };
      if (url === '/bind-requests/mine') return { requests: [] };
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        return { url: `https://cos.example/${payload.fileName}`, cloudPath: `orion/${payload.kind}/${payload.fileName}` };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      if (url === '/auth/me') {
        me = { ...me, user: { ...me.user, displayName: payload.displayName, avatar: payload.avatar } };
        return { user: me.user };
      }
      if (url === '/players/p1/public-profile') {
        me = {
          ...me,
          player: {
            ...me.player,
            publicDisplayName: payload.publicDisplayName,
            publicAvatar: payload.publicAvatar,
          },
        };
        return { player: me.player };
      }
      throw new Error(`unexpected PATCH ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.accountNameInput, '旧昵称');
  assert.strictEqual(page.data.publicNameInput, '公开名');
  assert.strictEqual(page.data.canEditPublicProfile, true);
  assert.strictEqual(page.data.publicPreviewName, '公开名');
  assert.strictEqual(page.data.showBindCta, false);

  mediaFiles = [{ tempFilePath: '/tmp/account-avatar.png', name: 'account-avatar.png' }];
  fileReads['/tmp/account-avatar.png'] = 'account_avatar_base64';
  await page.chooseAccountAvatar();
  const accountUpload = posts.find(item => item.url === '/upload/base64' && item.payload.fileName === 'account-avatar.png');
  assert(accountUpload, 'profile should upload account avatar from wx.chooseMedia');
  assert.strictEqual(accountUpload.payload.kind, 'avatar');
  assert.strictEqual(page.data.accountAvatarInput, 'https://cos.example/account-avatar.png');

  page.onAccountNameInput(input('新昵称'));
  await page.saveAccountProfile();
  assert.strictEqual(patches[0].url, '/auth/me');
  assert.strictEqual(patches[0].payload.displayName, '新昵称');
  assert.strictEqual(patches[0].payload.avatar, 'https://cos.example/account-avatar.png');
  assert.strictEqual(page.data.accountNameInput, '新昵称');

  mediaFiles = [{ tempFilePath: '/tmp/profile-public-avatar.webp', name: 'profile-public-avatar.webp' }];
  fileReads['/tmp/profile-public-avatar.webp'] = 'public_avatar_base64';
  await page.choosePublicAvatar();
  const publicUpload = posts.find(item => item.url === '/upload/base64' && item.payload.fileName === 'profile-public-avatar.webp');
  assert(publicUpload, 'profile should upload public avatar from wx.chooseMedia');
  assert.strictEqual(publicUpload.payload.kind, 'avatar');
  assert.strictEqual(publicUpload.payload.contentType, 'image/webp');
  assert.strictEqual(page.data.publicAvatarInput, 'https://cos.example/profile-public-avatar.webp');
  page.onPublicNameInput(input('公开新名'));
  await page.savePublicProfile();
  assert.strictEqual(patches[1].url, '/players/p1/public-profile');
  assert.strictEqual(patches[1].payload.publicDisplayName, '公开新名');
  assert.strictEqual(patches[1].payload.publicAvatar, 'https://cos.example/profile-public-avatar.webp');
  assert.strictEqual(page.data.publicPreviewName, '公开新名');
}

async function testNotificationsFlow() {
  const posts = [];
  const notificationRequests = [];
  const playerRequests = [];
  let notifications = [
    { id: 'n1', title: '训练提醒', body: '周六奥体集合', readAt: null, createdAt: '2026-06-01T10:00:00' },
    { id: 'n2', title: '比赛提醒', body: '周日树人集合', readAt: null, createdAt: '2026-06-02T10:00:00' },
  ];
  const page = loadPage('miniprogram/pages/notifications/notifications.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') {
        return {
          user: { id: 'u_admin', displayName: '运营管理员', role: 'admin', permissions: ['notifications:write'] },
          player: null,
        };
      }
      if (url === '/notifications') {
        notificationRequests.push(params);
        assert.strictEqual(params.limit, 30);
        if (params.offset === 0) {
          return { notifications: notifications.slice(0, 1), unreadCount: 2, hasMore: true, nextOffset: 1 };
        }
        if (params.offset === 1) {
          return { notifications: notifications.slice(1, 2), unreadCount: 2, hasMore: false, nextOffset: 2 };
        }
      }
      if (url === '/players') {
        playerRequests.push(params);
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        assert(Number.isFinite(Number(params.offset)));
        if (params.offset === 0) {
          return {
            players: [{ id: 'p1', name: '江山', publicDisplayName: 'Jiang', number: 7, level: 'verified' }],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            players: [{ id: 'p2', name: '试训新人', number: 21, level: 'casual' }],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return { players: [], hasMore: false, nextOffset: params.offset };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/notifications/n1/read') {
        notifications = notifications.map(item => item.id === 'n1' ? { ...item, readAt: '2026-06-01T10:05:00' } : item);
        return { notification: notifications[0] };
      }
      if (url === '/notifications') return { ok: true, count: 1, notifications: [] };
      throw new Error(`unexpected POST ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.isSender, true);
  assert.deepStrictEqual(playerRequests, [], 'notifications page should not load player candidates before selecting target player scope');
  assert.strictEqual(page.data.unreadCount, 2);
  assert.strictEqual(page.data.notifications.length, 1);
  assert.strictEqual(page.data.notificationsHasMore, true);
  assert.strictEqual(page.data.notifications[0].statusText, '未读');
  await page.loadMoreNotifications();
  assert.strictEqual(page.data.notifications.length, 2);
  assert.strictEqual(page.data.notificationsHasMore, false);
  assert.deepStrictEqual(notificationRequests, [{ limit: 30, offset: 0 }, { limit: 30, offset: 1 }]);
  await page.markRead(tap({ id: 'n1' }));
  assert.strictEqual(posts[0].url, '/notifications/n1/read');
  assert.strictEqual(page.data.unreadCount, 1);
  assert.strictEqual(page.data.notifications[0].statusText, '已读');

  await page.onTargetChange(input('4'));
  assert.strictEqual(page.data.targetScope, 'player');
  assert.strictEqual(page.data.playerOptions.length, 2);
  assert.strictEqual(page.data.playerHasMore, true);
  await page.loadMorePlayers();
  assert.strictEqual(page.data.playerOptions.length, 3);
  assert.strictEqual(page.data.playerHasMore, false);
  page.onPlayerChange(input('2'));
  page.onNoticeTitleInput(input('本周训练提醒'));
  page.onNoticeBodyInput(input('周六 15:00 奥体集合，带手套和水。'));
  await page.submitNotice();
  const broadcast = posts.find(item => item.url === '/notifications');
  assert(broadcast, 'admin should be able to send a notification');
  assert.strictEqual(broadcast.payload.scope, 'player');
  assert.strictEqual(broadcast.payload.playerId, 'p2');
  assert.strictEqual(broadcast.payload.title, '本周训练提醒');
  assert(toasts.includes('已发送 1 人'));
}

async function testBindFlow() {
  const posts = [];
  const playerGets = [];
  const pending = {
    id: 'br1',
    status: 'pending',
    requestedPlayerName: '正式球员',
    requestedPlayerNumber: 18,
    requestedPlayerPosition: 'SS',
  };
  const page = loadPage('miniprogram/pages/bind/bind.js', {
    get: async (url, params = {}) => {
      if (url === '/players') {
        playerGets.push({ ...params });
        assert.strictEqual(params.limit, 50);
        if (params.keyword === '投手') {
          assert.strictEqual(params.offset, 0);
          return {
            players: [{ id: 'p20', name: '投手球员', number: 20, position: 'P' }],
            hasMore: false,
            nextOffset: 1,
          };
        }
        if (params.offset === 50) {
          return {
            players: [{ id: 'p19', name: '候补正式球员', number: 19, position: 'OF' }],
            hasMore: false,
            nextOffset: 51,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          players: [{ id: 'p18', name: '正式球员', number: 18, position: 'SS' }],
          hasMore: true,
          nextOffset: 50,
        };
      }
      if (url === '/bind-requests/mine') return { requests: [pending] };
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      return { ok: true };
    },
  });

  await page.load();
  assert.strictEqual(page.data.latestRequest.statusLabel, '待审核');
  assert.strictEqual(page.data.submitLabel, '更新待审申请');
  assert.strictEqual(page.data.playersHasMore, true);
  assert.deepStrictEqual(playerGets[0], { limit: 50, offset: 0 });
  await page.loadMorePlayers();
  assert.strictEqual(page.data.players.length, 2);
  assert.strictEqual(page.data.playersHasMore, false);
  assert.deepStrictEqual(playerGets[1], { limit: 50, offset: 50 });
  page.onQueryInput(input('投手'));
  await page.searchPlayers();
  assert.strictEqual(page.data.players.length, 1);
  assert.strictEqual(page.data.players[0].id, 'p20');
  assert.deepStrictEqual(playerGets[2], { limit: 50, offset: 0, keyword: '投手' });
  page.onQueryInput(input(''));
  await page.searchPlayers();
  page.select(tap({ id: 'p18' }));
  await page.submit();
  assert.strictEqual(posts[0].url, '/bind-requests');
  assert.strictEqual(posts[0].payload.requestedPlayerId, 'p18');
  assert.strictEqual(posts[0].payload.jerseyNumber, 18);
  assert.strictEqual(posts[0].payload.source, 'mini');

  const approved = { ...pending, status: 'approved' };
  page.setRequestState([approved].map(pageReq => ({
    ...pageReq,
    target: '#18 正式球员',
    statusLabel: '已通过',
    statusClass: 'approved',
  })), { ...approved, target: '#18 正式球员', statusLabel: '已通过', statusClass: 'approved' });
  await page.submit();
  assert.strictEqual(posts.length, 1, 'approved request should not post again');
  assert(toasts.includes('绑定申请已通过'));
}

async function testAdminConsoleFlow() {
  const posts = [];
  const patches = [];
  const deletes = [];
  const calls = [];
  let bindRequests = [
    {
      id: 'br1',
      status: 'pending',
      realName: '测试新人',
      nickname: '新人',
      jerseyNumber: 19,
      requestedPlayerId: 'p1',
      requestedPlayerName: '一号队员',
      requestedPlayerNumber: 1,
      requestedPlayerPosition: 'P',
      currentPlayerName: '试训新人',
      source: 'mini',
      note: '训练满次数，申请绑定',
    },
    {
      id: 'br_done',
      status: 'approved',
      realName: '老队员',
      nickname: '老队员',
      requestedPlayerId: 'p1',
      requestedPlayerName: '一号队员',
      requestedPlayerNumber: 1,
      currentPlayerName: '老试训',
      source: 'web',
      reviewNote: '已线下核验',
    },
    {
      id: 'br_reject',
      status: 'rejected',
      realName: '误选队员',
      nickname: '误选',
      requestedPlayerId: 'p1',
      requestedPlayerName: '一号队员',
      requestedPlayerNumber: 1,
      currentPlayerName: '未绑定',
      source: 'mini',
      reviewNote: '目标球员不匹配',
    },
  ];
  let bindCodes = [
    { code: 'ORION-OLD', playerId: 'p1', used: false, createdAt: '2026-06-01' },
    { code: 'ORION-USED', playerId: 'p1', used: true, usedBy: 'u_old', usedAt: '2026-06-02', createdAt: '2026-06-01' },
  ];
  let pointAdjustments = [
    { id: 'adj_old', playerId: 'p1', delta: -2, reason: '录入错误修正', gameId: 'g_old', createdAt: '2026-06-10T10:00:00' },
  ];
  let attendances = [
    { id: 'att_old', playerId: 'p1', kind: 'training', date: '2026-06-01', note: '旧训练补录', createdAt: '2026-06-01T09:00:00' },
  ];
  let events = [
    { id: 'e1', title: '训练接龙', tag: 'Training · 训练', date: '2026-06-13', location: '奥体' },
    { id: 'e2', title: '比赛接龙', tag: 'Game · 比赛', date: '2026-06-14', location: '树人' },
  ];
  let games = [
    { id: 'g_old', tournamentId: '', sport: 'softball', season: '2026-slow', seasonName: '2026 慢垒', away: '神策', home: '猎户座', awayScore: 3, homeScore: 7, date: '2026-05-01', venue: '奥体' },
    { id: 'g_linked', tournamentId: 't_slow', sport: 'softball', season: '2026-slow', seasonName: '奥体慢垒春季赛', away: '猎户座', home: '猛虎', awayScore: 2, homeScore: 1, date: '2026-05-08', venue: '树人' },
  ];
  let adminPlayers = [
    { id: 'p1', name: '一号队员', number: 1, position: 'P', level: 'verified' },
    { id: 'p2', name: '试训新人', number: '', position: 'OF', level: 'casual' },
  ];
  const moreAdminPlayers = [
    { id: 'p3', name: '三号外野', number: 3, position: 'LF', level: 'verified' },
  ];
  const tournamentRequests = [];
  const adminUserRequests = [];
  const adminPlayerRequests = [];
  const pointGameSearchRequests = [];
  const page = loadPage('miniprogram/pages/admin/admin.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return {
          user: {
            id: 'u_admin',
            displayName: '数据管理员',
            role: 'admin',
            adminLevel: 'A',
            adminPermissionGroups: ['data', 'ops'],
            permissions: ['bind_requests:review', 'players:write', 'points:write', 'attendances:write', 'events:write', 'tournaments:write', 'games:revise', 'hof:write', 'highlights:write', 'bind_codes:manage', 'users:read', 'users:grant_admin', 'users:password_reset', 'users:app_connect_code', 'users:bind_direct', 'audit:read', 'audit:game_read', 'destructive:delete', 'system:settings'],
          },
          player: null,
        };
      }
      if (url === '/admin/bind-requests') {
        const status = params.status || '';
        const requests = status
          ? bindRequests.filter(item => item.status === status)
          : bindRequests;
        return { requests };
      }
      if (url === '/players') {
        adminPlayerRequests.push(params);
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        if (params.offset === 2) {
          return {
            players: moreAdminPlayers,
            hasMore: false,
            nextOffset: 3,
          };
        }
        return {
          players: adminPlayers,
          hasMore: true,
          nextOffset: 2,
        };
      }
      if (url === '/events') {
        assert.strictEqual(params.limit, 60);
        assert.strictEqual(params.offset, 0);
        return { events, hasMore: false, nextOffset: events.length };
      }
      if (url === '/site-settings/players-starfield') {
        return {
          setting: {
            key: 'players-starfield',
            value: { formation: 'scatter', path: 'or', year: '2026', pathDuration: 13.6, breatheDuration: 10.8, sway: 1, spread: 1, randomSeed: 17 },
            updatedByName: '站长',
            updatedAt: '2026-06-12T10:00:00',
          },
        };
      }
      if (url === '/highlights') {
        assert.deepStrictEqual(params, { status: 'pending', limit: 1, includeTotal: 'true' });
        return { highlights: [{ id: 'h1', title: '待审精彩时刻', cover: 'https://cos.example/h1.jpg', status: 'pending' }], total: 1 };
      }
      if (url === '/tournaments') {
        tournamentRequests.push(params);
        assert.strictEqual(params.limit, 30);
        if (params.offset === 1) {
          return {
            tournaments: [
              { id: 't_baseball', type: 'cup', name: '北京棒球杯', shortName: '棒球杯', sport: 'baseball', season: '2026-base', location: '树人' },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return {
          tournaments: [
            { id: 't_slow', type: 'league', name: '奥体慢垒春季赛', shortName: '奥体慢垒', sport: 'softball', season: '2026-slow', location: '奥体' },
          ],
          hasMore: true,
          nextOffset: 1,
        };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, false);
        if (params.keyword) {
          pointGameSearchRequests.push(params);
          assert.strictEqual(params.limit, 40);
          assert.strictEqual(params.offset, 0);
          return {
            games: [
              { id: 'g_search', tournamentId: '', sport: 'baseball', season: '2026-base', seasonName: '2026 棒球', away: '猎户座', home: '远征队', awayScore: 6, homeScore: 5, date: '2026-04-20', venue: '树人' },
            ],
            hasMore: false,
            nextOffset: 1,
          };
        }
        assert.strictEqual(params.limit, 80);
        assert.strictEqual(params.offset, 0);
        return { games, hasMore: false, nextOffset: games.length };
      }
      if (url === '/leaderboard') {
        return {
          leaderboard: [
            { player: { id: 'p1', name: '一号队员', number: 1, position: 'P' }, total: 42, breakdown: { base: 20, performance: 15, awards: 5, manual: 2 } },
            { player: { id: 'p2', name: '试训新人', number: '', position: 'OF' }, total: 12, breakdown: { base: 10, performance: 0, awards: 0, manual: 2 } },
          ],
        };
      }
      if (url === '/points-adjustments') {
        assert.strictEqual(params.playerId, 'p1');
        assert.strictEqual(params.limit, 8, 'admin recent adjustments should be capped server-side');
        return { adjustments: pointAdjustments };
      }
      if (url === '/attendances') {
        assert.strictEqual(params.playerId, 'p1');
        assert.strictEqual(params.limit, 8, 'admin recent attendances should be capped server-side');
        return { attendances };
      }
      if (url === '/admin/bind-invitation-options') {
        assert.strictEqual(params.limit, 50, 'invite user candidates should load in pages');
        assert.strictEqual(params.includePlayers, 'false', 'invite players should reuse the paged admin player pool');
        return {
          users: [
            { id: 'u1', displayName: '试训新人账号', email: 'trial@example.com', boundPlayerName: '试训新人', boundPlayerNumber: '', boundPlayerPosition: 'OF' },
          ],
          players: [],
          usersHasMore: false,
          usersNextOffset: 1,
        };
      }
      if (url === '/bind-codes') {
        assert.strictEqual(params.limit, 50, 'bind codes should load in pages');
        return { bindCodes, hasMore: false, nextOffset: bindCodes.length };
      }
      if (url === '/admin/audit-logs') {
        assert.strictEqual(params.limit, 20);
        return {
          logs: [
            {
              id: 'log1',
              action: 'revise_game_data',
              targetType: 'game',
              targetId: 'g1',
              summary: '修订比赛数据：测试队 vs 猎户座',
              actorName: '数据管理员',
              createdAt: '2026-06-12T09:30:00',
            },
            {
              id: 'log2',
              action: 'player_delete',
              targetType: 'player',
              targetId: 'p_old',
              summary: '删除球员「误建档案」',
              actorName: '数据管理员',
              createdAt: '2026-06-12T09:20:00',
            },
          ],
        };
      }
      if (url === '/admin/users') {
        adminUserRequests.push(params);
        assert.strictEqual(params.limit, 50);
        if (params.offset === 4) {
          return {
            users: [
              {
                id: 'u_late',
                displayName: '后加载账号',
                email: 'late@example.com',
                role: 'player',
                adminLevel: null,
                adminPermissionGroups: [],
                boundPlayerName: '',
                boundPlayerNumber: '',
                createdAt: '2026-04-30T08:00:00',
                lastActiveAt: '2026-06-08T09:00:00',
              },
            ],
            hasMore: false,
            nextOffset: 5,
          };
        }
        return {
          users: [
            {
              id: 'u_admin',
              displayName: '数据管理员',
              email: 'admin@example.com',
              role: 'admin',
              adminLevel: 'A',
              adminPermissionGroups: ['data', 'ops'],
              adminGrantedByName: '系统',
              boundPlayerName: '一号队员',
              boundPlayerNumber: 1,
              createdAt: '2026-05-02T08:00:00',
              lastActiveAt: '2026-06-12T09:00:00',
            },
            {
              id: 'u_ops',
              displayName: '运营组员',
              email: 'ops@example.com',
              role: 'player',
              adminLevel: null,
              adminPermissionGroups: [],
              boundPlayerName: '',
              boundPlayerNumber: '',
              createdAt: '2026-05-01T08:00:00',
              lastActiveAt: '2026-06-10T09:00:00',
            },
            {
              id: 'u_data',
              displayName: '数据组员',
              email: 'data@example.com',
              role: 'admin',
              adminLevel: 'C',
              adminPermissionGroups: ['data'],
              boundPlayerName: '捕手队员',
              boundPlayerNumber: 21,
              boundPlayerPosition: 'C',
              createdAt: '2026-05-03T08:00:00',
              lastActiveAt: '2026-06-11T09:00:00',
            },
            {
              id: 'u_plain',
              displayName: '普通账号',
              email: 'plain@example.com',
              role: 'player',
              adminLevel: null,
              adminPermissionGroups: [],
              boundPlayerName: '内野队员',
              boundPlayerNumber: 9,
              boundPlayerPosition: 'SS',
              createdAt: '2026-05-04T08:00:00',
              lastActiveAt: '2026-06-09T09:00:00',
            },
          ],
          hasMore: params.offset === 0,
          nextOffset: params.offset === 0 ? 4 : 5,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/admin/bind-requests/br1/approve') {
        bindRequests = bindRequests.map(item => (
          item.id === 'br1' ? { ...item, status: 'approved', reviewNote: payload.reviewNote } : item
        ));
      }
      if (url === '/admin/bind-invitations') return { ok: true, code: 'ORION-TEST' };
      if (url === '/bind-codes') {
        const bindCode = { code: 'ORION-NEW', playerId: payload.playerId, used: false, createdAt: '2026-06-12' };
        bindCodes = [bindCode].concat(bindCodes);
        return { ok: true, bindCode };
      }
      if (url === '/admin/users/u_ops/app-connect-code') return { ok: true, code: 'APP-TEST-2026', expiresInMinutes: 30 };
      if (url === '/admin/users/u_ops/reset-password') return { ok: true, message: '密码已重置' };
      if (url === '/admin/users/u_ops/bind-player') return { ok: true };
      if (url === '/admin/users/u_ops/unbind-player') return { ok: true };
      if (url === '/players/p2/upgrade') {
        const upgraded = { ...adminPlayers.find(item => item.id === 'p2'), level: 'verified', upgradedBy: 'admin' };
        adminPlayers = adminPlayers.map(item => (item.id === 'p2' ? upgraded : item));
        return { ok: true, player: upgraded };
      }
      if (url === '/upload/base64') {
        return {
          url: `https://cos.example/${payload.fileName}`,
          cloudPath: `orion/player/${payload.fileName}`,
        };
      }
      if (url === '/players') return { player: { id: 'p_new', name: payload.name, level: payload.level } };
      if (url === '/players/import') {
        return { ok: true, summary: { total: 3, created: 2, skipped: 1, invalid: 0, photoMatched: Object.keys(payload.photos || {}).length } };
      }
      if (url === '/players/merge') return { ok: true, counts: { users: 1, attendances: 2, points: 3 }, message: '合并完成' };
      return { ok: true };
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      return { ok: true };
    },
    del: async (url, payload) => {
      deletes.push({ url, payload });
      if (url.startsWith('/bind-codes/')) {
        const code = decodeURIComponent(url.replace('/bind-codes/', ''));
        bindCodes = bindCodes.filter(item => item.code !== code);
      }
      if (url.startsWith('/points-adjustments/')) {
        const id = decodeURIComponent(url.replace('/points-adjustments/', ''));
        pointAdjustments = pointAdjustments.filter(item => item.id !== id);
      }
      if (url.startsWith('/attendances/')) {
        const id = decodeURIComponent(url.replace('/attendances/', ''));
        attendances = attendances.filter(item => item.id !== id);
      }
      if (url.startsWith('/games/')) {
        const id = decodeURIComponent(url.replace('/games/', ''));
        games = games.filter(item => item.id !== id);
      }
      if (url.startsWith('/events/')) {
        const id = decodeURIComponent(url.replace('/events/', ''));
        events = events.filter(item => item.id !== id);
      }
      return { ok: true };
    },
    call: async (url, options) => {
      calls.push({ url, options });
      if (url === '/site-settings/players-starfield' && options.method === 'PUT') {
        return {
          ok: true,
          setting: {
            key: 'players-starfield',
            value: options.data.value,
            updatedByName: '数据管理员',
            updatedAt: '2026-06-12T10:30:00',
          },
        };
      }
      throw new Error(`unexpected CALL ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.isAdmin, true);
  assert(page.data.permissionChips.includes('A 级'));
  assert(page.data.permissionChips.includes('数据组'));
  assert.strictEqual(page.data.canBindInvite, false);
  assert.strictEqual(page.data.canManageBindCodes, false);
  assert.strictEqual(page.data.canReadAudit, true);
  assert.deepStrictEqual(page.data.adminToolTabs.map(item => item.key), ['reviews', 'players', 'points', 'accounts', 'audit']);
  assert.strictEqual(page.data.activeTool, 'reviews');
  page.switchTool(tap({ tool: 'players' }));
  assert.strictEqual(page.data.activeTool, 'players');
  page.switchTool(tap({ tool: 'accounts' }));
  assert.strictEqual(page.data.activeTool, 'accounts');
  assert.strictEqual(page.data.canManageEvents, true);
  assert.strictEqual(page.data.canManageTournaments, true);
  assert.strictEqual(page.data.canMoveGames, true);
  assert.strictEqual(page.data.canDeleteGames, true);
  assert.strictEqual(page.data.canDeleteTournaments, true);
  assert.strictEqual(page.data.canWritePoints, true);
  assert.strictEqual(page.data.canWriteAttendances, true);
  assert.strictEqual(page.data.canViewPointsOverview, true);
  assert.strictEqual(page.data.leaderboardOverview[0].displayName, '一号队员');
  assert.strictEqual(page.data.leaderboardOverview[0].total, 42);
  assert(page.data.leaderboardOverview[0].breakdownText.includes('表现 +15'));
  assert.strictEqual(page.data.canManageSiteSettings, true);
  assert.strictEqual(page.data.starfieldFormationLabel, '✨ 星河散列');
  assert.strictEqual(page.data.starfieldPathLabel, 'OR 路径');
  assert(page.data.starfieldUpdatedText.includes('站长'));
  const diamondPresetIndex = page.data.starfieldPresetOptions.findIndex(item => item.value === 'baseball-diamond');
  assert(diamondPresetIndex > 0, 'admin starfield presets should expose baseball diamond');
  page.onStarfieldPresetChange(input(String(diamondPresetIndex)));
  assert.strictEqual(page.data.starfieldFormationLabel, '💎 棒球钻石');
  assert.strictEqual(page.data.pointAdjustments[0].deltaText, '-2');
  assert.strictEqual(page.data.attendanceRecords[0].kindLabel, '🏋️ 训练签到');
  assert.deepStrictEqual(page.data.pointGameOptions.map(item => item.id), ['', 'g_linked', 'g_old']);
  await page.onPointGameSearchInput(input('远征'));
  assert.deepStrictEqual(pointGameSearchRequests, [{ includeAggregate: false, limit: 40, offset: 0, keyword: '远征' }]);
  assert.deepStrictEqual(page.data.pointGameOptions.map(item => item.id), ['', 'g_search']);
  page.onPointGameChange(input('1'));
  assert.strictEqual(page.data.pointGameId, 'g_search');
  assert(page.data.pointGameLabel.includes('远征队'));
  page.onPointDeltaInput(input('5'));
  page.onPointReasonInput(input('训练协助'));
  await page.submitPointAdjustment();
  const pointPost = posts.find(item => item.url === '/points-adjustments');
  assert(pointPost, 'admin console should post point adjustments');
  assert.strictEqual(pointPost.payload.playerId, 'p1');
  assert.strictEqual(pointPost.payload.delta, 5);
  assert.strictEqual(pointPost.payload.reason, '训练协助');
  assert.strictEqual(pointPost.payload.gameId, 'g_search');
  assert.strictEqual(page.data.pointGameId, '');
  await page.onPointGameSearchInput(input(''));
  assert.strictEqual(page.data.tournamentOptions.length, 2);
  assert.strictEqual(page.data.gameMoveTournamentOptions.length, 2);
  assert.strictEqual(page.data.tournamentHasMore, true);
  assert.deepStrictEqual(tournamentRequests, [{ limit: 30, offset: 0 }]);
  await page.loadMoreAdminTournaments();
  assert.strictEqual(page.data.tournamentOptions.length, 3);
  assert.strictEqual(page.data.gameMoveTournamentOptions.length, 3);
  assert.strictEqual(page.data.gameFilterOptions.length, 4);
  assert.strictEqual(page.data.tournamentHasMore, false);
  assert.deepStrictEqual(tournamentRequests, [{ limit: 30, offset: 0 }, { limit: 30, offset: 1 }]);
  assert.strictEqual(page.data.visibleBatchGames.length, 2);
  assert.strictEqual(page.data.visibleBatchEvents.length, 2);
  assert.strictEqual(page.data.visibleBatchEvents[0].tagLabel, '🏋️ 训练');
  page.onEventSearchInput(input('比赛'));
  assert.deepStrictEqual(page.data.visibleBatchEvents.map(item => item.id), ['e2']);
  page.onEventTagFilterChange(input('1'));
  assert.deepStrictEqual(page.data.visibleBatchEvents.map(item => item.id), [], 'training filter should combine with current search');
  page.onEventTagFilterChange(input('0'));
  page.openBatchEvent(tap({ id: 'e2' }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-detail/event-detail?id=e2');
  page.editBatchEvent(tap({ id: 'e2' }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-create/event-create?id=e2');
  page.onEventSearchInput(input(''));
  assert.strictEqual(page.data.visibleBatchEvents.length, 2);
  assert.strictEqual(page.data.canManageUsers, true);
  assert.strictEqual(page.data.canResetPassword, true);
  assert.strictEqual(page.data.canCreateAppConnectCode, false);
  assert.strictEqual(page.data.canBindDirect, false);
  assert.strictEqual(page.data.canDeleteUsers, false);
  assert.strictEqual(page.data.canWritePlayers, true);
  assert.strictEqual(page.data.visiblePlayerPool.length, 2);
  assert.strictEqual(page.data.playerPoolSummary, '2/2 名已加载球员，继续加载可查看更多');
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), ['p1', 'p2']);
  assert.strictEqual(page.data.visiblePlayerPool[0].levelLabel, '正式球员');
  assert.strictEqual(page.data.visiblePlayerPool[0].canCreateBindCode, false);
  assert.strictEqual(page.data.playersHasMore, true);
  assert.strictEqual(page.data.playersNextOffset, 2);
  await page.loadMoreAdminPlayers();
  assert.deepStrictEqual(adminPlayerRequests.slice(0, 2), [
    { include: 'all', limit: 50, offset: 0 },
    { include: 'all', limit: 50, offset: 2 },
  ]);
  assert.strictEqual(page.data.playersHasMore, false);
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), ['p1', 'p3', 'p2']);
  assert.strictEqual(page.data.playerPoolSummary, '3/3 名球员');
  page.onPlayerPoolLevelChange(input('2'));
  assert.strictEqual(page.data.playerPoolLevelLabel, '试训队员');
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), ['p2']);
  assert.strictEqual(page.data.playerPoolSummary, '1/3 名球员');
  page.onPlayerPoolSearchInput(input('一号'));
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), []);
  page.onPlayerPoolLevelChange(input('0'));
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), ['p1']);
  page.onPlayerPoolSearchInput(input(''));
  assert.deepStrictEqual(page.data.visiblePlayerPool.map(item => item.id), ['p1', 'p3', 'p2']);
  page.openPoolPlayer(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
  page.openPoolHighlights(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/highlights/highlights?playerId=p1');
  await page.selectPoolPlayerRecords(tap({ id: 'p1' }));
  assert(page.data.playerLabel.includes('一号队员'));
  assert(toasts.includes('已切换积分与签到记录'));
  page.selectPoolMergeSource(tap({ id: 'p2' }));
  assert(page.data.mergeSourceLabel.includes('试训新人'));
  assert.deepStrictEqual(page.data.visibleAttendancePlayers.map(item => item.id), ['p1', 'p3', 'p2']);
  assert.strictEqual(page.data.attendanceSelectionSummary, '未勾选时使用上方选中球员');
  page.onAttendancePlayerSearchInput(input('试训'));
  assert.deepStrictEqual(page.data.visibleAttendancePlayers.map(item => item.id), ['p2']);
  page.selectAllAttendancePlayers();
  assert.deepStrictEqual(page.data.selectedAttendancePlayerIds, ['p2']);
  assert.strictEqual(page.data.attendanceSubmitLabel, '补录已选 1 人');
  page.clearAttendancePlayers();
  assert.strictEqual(page.data.attendanceSelectedCount, 0);
  page.onAttendancePlayerSearchInput(input(''));
  await page.upgradePoolPlayer(tap({ id: 'p2' }));
  assert(posts.some(item => item.url === '/players/p2/upgrade'), 'admin player pool should upgrade trial players inline');
  assert.strictEqual(page.data.players.find(item => item.id === 'p2').level, 'verified');
  assert.strictEqual(page.data.visiblePlayerPool.find(item => item.id === 'p2').levelLabel, '正式球员');
  assert(toasts.includes('已升级正式球员'));
  assert.strictEqual(page.data.adminUserOptions.length, 5);
  assert.strictEqual(page.data.adminUsersHasMore, true);
  assert.strictEqual(page.data.adminUsersNextOffset, 4);
  assert.deepStrictEqual(adminUserRequests, [{ limit: 50, offset: 0 }, { limit: 50, offset: 0 }]);
  assert.strictEqual(page.data.adminUserFilterSummary, '4/4 个已加载账号，继续加载可查看更多');
  page.onAdminUserSearchInput(input('plain@example'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_plain']);
  assert.strictEqual(page.data.adminUserFilterSummary, '1/4 个已加载账号，继续加载可查看更多');
  page.onAdminUserSearchInput(input(''));
  page.onAdminUserSortChange(input('1'));
  assert.strictEqual(page.data.adminUserSortLabel, '最早注册 ↑');
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_ops', 'u_admin', 'u_data', 'u_plain']);
  page.onAdminUserSortChange(input('0'));
  assert.strictEqual(page.data.adminUserSortLabel, '最近活跃 ↓');
  page.onAdminIdentityFilterChange(input('4'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_data']);
  assert.strictEqual(page.data.adminUserLabel.includes('数据组员'), true);
  page.onAdminPositionFilterChange(input('2'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_data']);
  page.onAdminGroupFilterChange(input('3'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['']);
  assert.strictEqual(page.data.adminUserLabel, '没有匹配账号');
  assert.strictEqual(page.data.adminUserMeta, '');
  page.onAdminIdentityFilterChange(input('0'));
  page.onAdminPositionFilterChange(input('0'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_admin']);
  page.onAdminGroupFilterChange(input('0'));
  page.onAdminPositionFilterChange(input('3'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_plain']);
  page.onAdminPositionFilterChange(input('0'));
  assert.strictEqual(page.data.adminUserOptions.length, 5);
  page.onAdminBindFilterChange(input('2'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_ops']);
  assert.strictEqual(page.data.adminBindFilterLabel, '未绑定账号');
  page.onAdminBindFilterChange(input('1'));
  assert.deepStrictEqual(page.data.adminUserOptions.map(item => item.id), ['', 'u_admin', 'u_data', 'u_plain']);
  page.onAdminBindFilterChange(input('0'));
  assert.strictEqual(page.data.adminUserOptions.length, 5);
  await page.loadMoreAdminUsers();
  assert.deepStrictEqual(adminUserRequests, [{ limit: 50, offset: 0 }, { limit: 50, offset: 0 }, { limit: 50, offset: 4 }]);
  assert.strictEqual(page.data.adminUserOptions.length, 6);
  assert.strictEqual(page.data.adminUsersHasMore, false);
  assert.strictEqual(page.data.adminUserFilterSummary, '5/5 个已加载账号');
  assert.deepStrictEqual(page.data.visibleBindCodes, []);
  page.onBindCodeSearchInput(input('未使用'));
  assert.deepStrictEqual(page.data.visibleBindCodes, []);
  page.onBindCodeSearchInput(input(''));
  page.onBindCodePlayerChange(input('1'));
  const bindCodePostsBefore = posts.filter(item => item.url === '/bind-codes').length;
  await page.createBindCode();
  await page.createPoolBindCode(tap({ id: 'p1' }));
  assert.strictEqual(posts.filter(item => item.url === '/bind-codes').length, bindCodePostsBefore);
  assert.strictEqual(page.data.generatedBindCode, '');
  page.onCreatePlayerLevelChange(input('0'));
  page.onCreatePlayerNameInput(input('新试训'));
  page.onCreatePlayerNumberInput(input('66'));
  page.onCreatePlayerPositionInput(input('OF'));
  page.onCreatePlayerBatsInput(input('R'));
  page.onCreatePlayerThrowsInput(input('R'));
  page.onCreatePlayerJoinYearInput(input('2026'));
  page.onCreatePlayerSloganInput(input('先跑起来'));
  page.onCreatePlayerTitlesInput(input('新人、外野'));
  page.onCreatePlayerAliasesInput(input('Xin Trial'));
  mediaFiles = [{ tempFilePath: '/tmp/admin-player-photo.jpg', name: 'admin-player-photo.jpg', size: 1024 }];
  fileReads['/tmp/admin-player-photo.jpg'] = 'admin_player_photo_base64';
  await page.chooseCreatePlayerPhoto();
  const createPlayerPhotoPost = posts.find(item => item.url === '/upload/base64' && item.payload.fileName === 'admin-player-photo.jpg');
  assert(createPlayerPhotoPost, 'admin create player should upload a real player photo');
  assert.deepStrictEqual(createPlayerPhotoPost.payload, {
    kind: 'player',
    fileName: 'admin-player-photo.jpg',
    contentType: 'image/jpeg',
    fileBase64: 'admin_player_photo_base64',
  });
  assert.strictEqual(page.data.createPlayerPhoto, 'https://cos.example/admin-player-photo.jpg');
  await page.createPlayer();
  const createPlayerPost = posts.find(item => item.url === '/players');
  assert(createPlayerPost, 'admin console should create player files');
  assert.deepStrictEqual(createPlayerPost.payload, {
    name: '新试训',
    number: '66',
    position: 'OF',
    bats: 'R',
    throws: 'R',
    joinYear: 2026,
    slogan: '先跑起来',
    titles: ['新人', '外野'],
    aliases: ['Xin Trial'],
    photo: 'https://cos.example/admin-player-photo.jpg',
    level: 'casual',
  });
  assert.strictEqual(page.data.createPlayerPhoto, '');
  assert(navigation.includes('/pages/players/player-detail/player-detail?id=p_new'), 'admin create player should open the new player detail');
  page.onBatchPlayerLevelChange(input('1'));
  page.onBatchPlayerTextInput(input('新正式,18,SS\n重复队员,19,OF\n新投手,21,P,R,R,2026,Pitcher'));
  mediaFiles = [
    { tempFilePath: '/tmp/新正式.png', name: '新正式.png', size: 2048 },
    { tempFilePath: '/tmp/新投手.webp', name: '新投手.webp', size: 2048 },
  ];
  fileReads['/tmp/新正式.png'] = 'batch_player_photo_1';
  fileReads['/tmp/新投手.webp'] = 'batch_player_photo_2';
  await page.chooseBatchPlayerPhotos();
  const batchPhotoUploads = posts.filter(item => (
    item.url === '/upload/base64'
    && ['新正式.png', '新投手.webp'].includes(item.payload.fileName)
  ));
  assert.strictEqual(batchPhotoUploads.length, 2, 'admin batch import should upload selected player photos');
  assert.strictEqual(batchPhotoUploads[0].payload.contentType, 'image/png');
  assert.strictEqual(batchPhotoUploads[1].payload.contentType, 'image/webp');
  assert.strictEqual(page.data.batchPlayerPhotoCount, 2);
  await page.importPlayersBatch();
  const importPlayersPost = posts.find(item => item.url === '/players/import');
  assert(importPlayersPost, 'admin console should batch import pasted player lists');
  assert.deepStrictEqual(importPlayersPost.payload, {
    text: '新正式,18,SS\n重复队员,19,OF\n新投手,21,P,R,R,2026,Pitcher',
    level: 'verified',
    photos: {
      新正式: 'https://cos.example/新正式.png',
      新投手: 'https://cos.example/新投手.webp',
    },
  });
  assert(page.data.batchPlayerResultText.includes('匹配 2 张照片'));
  assert.strictEqual(page.data.batchPlayerPhotoCount, 0);
  page.onMergeSourceChange(input('2'));
  page.onMergeTargetChange(input('1'));
  assert(page.data.mergePreviewText.includes('试训新人 会并入 一号队员'));
  await page.mergePlayers();
  const mergePost = posts.find(item => item.url === '/players/merge');
  assert(mergePost, 'admin console should merge duplicate player files');
  assert.deepStrictEqual(mergePost.payload, { sourceId: 'p2', targetId: 'p1', keepSourceAsAlias: true });
  assert(page.data.mergeResultText.includes('试训新人 -> 一号队员'));
  page.onAdminUserChange(input(String(page.data.adminUserOptions.findIndex(item => item.id === 'u_ops'))));
  assert.strictEqual(page.data.adminUserLabel.includes('运营组员'), true);
  const appConnectPostsBefore = posts.filter(item => item.url === '/admin/users/u_ops/app-connect-code').length;
  await page.createAdminAppConnectCode();
  assert.strictEqual(posts.filter(item => item.url === '/admin/users/u_ops/app-connect-code').length, appConnectPostsBefore);
  assert.strictEqual(page.data.appConnectCode, '');
  page.onResetPasswordInput(input('NewPass2026'));
  await page.resetAdminPassword();
  const resetPost = posts.find(item => item.url === '/admin/users/u_ops/reset-password');
  assert(resetPost, 'admin console should reset web passwords');
  assert.strictEqual(resetPost.payload.newPassword, 'NewPass2026');
  assert.strictEqual(page.data.resetPasswordValue, '');
  const directBindPostsBefore = posts.filter(item => item.url === '/admin/users/u_ops/bind-player').length;
  const unbindPostsBefore = posts.filter(item => item.url === '/admin/users/u_ops/unbind-player').length;
  const deleteUserCallsBefore = deletes.filter(item => item.url === '/admin/users/u_ops').length;
  page.onDirectBindPlayerChange(input('1'));
  await page.bindAdminUserToPlayer();
  await page.unbindAdminUserFromPlayer();
  page.onDeleteConfirmInput(input('删除账号'));
  await page.deleteAdminUser();
  assert.strictEqual(posts.filter(item => item.url === '/admin/users/u_ops/bind-player').length, directBindPostsBefore);
  assert.strictEqual(posts.filter(item => item.url === '/admin/users/u_ops/unbind-player').length, unbindPostsBefore);
  assert.strictEqual(deletes.filter(item => item.url === '/admin/users/u_ops').length, deleteUserCallsBefore);
  page.onAdminLevelChange(input('1'));
  page.onAdminGroupChange(input(['ops']));
  await page.saveAdminPermission();
  assert.strictEqual(patches[0].url, '/admin/users/u_ops/admin-level');
  assert.deepStrictEqual(patches[0].payload, { adminLevel: 'C', adminPermissionGroups: ['ops'] });
  assert.strictEqual(page.data.auditLogs[0].title, '修订比赛数据：测试队 vs 猎户座');
  assert(page.data.auditLogs[0].meta.includes('修订比赛'));
  assert(page.data.auditLogs[1].meta.includes('删除球员'));
  assert.deepStrictEqual(page.data.stats.map(s => s.value), [1, 1, 2, 1]);
  assert.deepStrictEqual(page.data.stats.map(s => s.label), ['待审绑定', '待审时刻', '近期接龙', '未关联比赛']);
  page.openTodo(tap({ kind: 'events' }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-list/event-list');
  assert.strictEqual(page.data.pendingRequests[0].applicant, '测试新人');
  assert.strictEqual(page.data.pendingRequests[0].target, '#1 一号队员');
  assert.strictEqual(page.data.pendingRequests[0].statusLabel, '待审核');
  assert.strictEqual(page.data.pendingRequests[0].isPending, true);
  await page.onBindRequestStatusChange(input('1'));
  assert.strictEqual(page.data.bindRequestStatusLabel, '全部申请');
  assert.deepStrictEqual(page.data.pendingRequests.map(item => item.id), ['br1', 'br_done', 'br_reject']);
  assert.deepStrictEqual(page.data.pendingRequests.map(item => item.statusLabel), ['待审核', '已通过', '已驳回']);
  assert.strictEqual(page.data.pendingRequests[1].isPending, false);
  assert.strictEqual(page.data.stats[0].value, 1);
  await page.onBindRequestStatusChange(input('2'));
  assert.deepStrictEqual(page.data.pendingRequests.map(item => item.id), ['br_done']);
  assert.strictEqual(page.data.bindRequestEmptyText, '暂无已通过申请');
  await page.onBindRequestStatusChange(input('0'));
  assert.deepStrictEqual(page.data.pendingRequests.map(item => item.id), ['br1']);
  page.openLeaderboardPlayer(tap({ id: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');

  page.selectAllBatchEvents();
  assert.deepStrictEqual(page.data.selectedEventIds.sort(), ['e1', 'e2']);
  await page.batchDeleteEvents();
  assert(toasts.includes('请输入“删除接龙”确认'), 'admin batch event delete should require confirm text');
  page.onEventDeleteConfirmInput(input('删除接龙'));
  await page.batchDeleteEvents();
  assert(deletes.some(item => item.url === '/events/e1'), 'admin console should batch delete selected events');
  assert(deletes.some(item => item.url === '/events/e2'), 'admin console should batch delete all selected events');
  assert.strictEqual(page.data.eventDeleteConfirmText, '');

  page.onStarfieldPresetChange(input('3'));
  assert.strictEqual(page.data.starfieldFormationLabel, '🌀 螺旋升空');
  page.onStarfieldSliderChange({ detail: { value: 12.4 }, currentTarget: { dataset: { field: 'starfieldPathDuration' } } });
  await page.publishStarfieldSettings();
  const starfieldCall = calls.find(item => item.url === '/site-settings/players-starfield');
  assert(starfieldCall, 'admin console should publish starfield site settings');
  assert.strictEqual(starfieldCall.options.method, 'PUT');
  assert.strictEqual(starfieldCall.options.data.value.formation, 'spiral');
  assert.strictEqual(starfieldCall.options.data.value.pathDuration, 12.4);
  assert.strictEqual(page.data.starfieldUpdatedText.includes('数据管理员'), true);

  page.onReviewNoteInput(input('身份核验通过'));
  await page.approveRequest(tap({ id: 'br1' }));
  const approvePost = posts.find(item => item.url === '/admin/bind-requests/br1/approve');
  assert(approvePost, 'admin console should approve bind requests');
  assert.strictEqual(approvePost.payload.reviewNote, '身份核验通过');
  assert.strictEqual(page.data.pendingRequests.length, 0);

  await page.onPlayerChange(input('1'));
  await page.deletePointAdjustment(tap({ id: 'adj_old' }));
  const adjustmentDelete = deletes.find(item => item.url === '/points-adjustments/adj_old');
  assert(adjustmentDelete, 'admin console should delete wrong point adjustments');

  page.onAttendanceKindChange(input('0'));
  page.onAttendanceDateChange(input('2026-06-12'));
  page.onAttendanceNoteInput(input('管理员补录训练'));
  await page.submitAttendance();
  const attendancePost = posts.find(item => item.url === '/attendances');
  assert(attendancePost, 'admin console should post attendances');
  assert.strictEqual(attendancePost.payload.playerId, 'p1');
  assert.strictEqual(attendancePost.payload.kind, 'training');
  assert.strictEqual(attendancePost.payload.date, '2026-06-12');
  page.onAttendancePlayerSelectionChange(input(['p1', 'p2']));
  assert.strictEqual(page.data.attendanceSelectedCount, 2);
  assert.strictEqual(page.data.attendanceSubmitLabel, '补录已选 2 人');
  page.onAttendanceKindChange(input('1'));
  page.onAttendanceDateChange(input('2026-06-13'));
  page.onAttendanceNoteInput(input('活动批量补录'));
  await page.submitAttendance();
  const attendancePosts = posts.filter(item => item.url === '/attendances');
  const batchAttendancePosts = attendancePosts.slice(-2);
  assert.deepStrictEqual(batchAttendancePosts.map(item => item.payload.playerId), ['p1', 'p2']);
  assert(batchAttendancePosts.every(item => item.payload.kind === 'event'));
  assert(batchAttendancePosts.every(item => item.payload.date === '2026-06-13'));
  assert(batchAttendancePosts.every(item => item.payload.note === '活动批量补录'));
  assert.deepStrictEqual(page.data.selectedAttendancePlayerIds, []);
  assert.strictEqual(page.data.attendanceSubmitLabel, '补录上方选中球员');
  await page.deleteAttendanceRecord(tap({ id: 'att_old' }));
  const attendanceDelete = deletes.find(item => item.url === '/attendances/att_old');
  assert(attendanceDelete, 'admin console should delete wrong attendance records');

  page.onHofYearInput(input('2026'));
  page.onHofReasonInput(input('赛季 MVP'));
  await page.addHallOfFame();
  const hofPost = posts.find(item => item.url === '/hall-of-fame');
  assert(hofPost, 'admin console should add hall of fame');
  assert.strictEqual(hofPost.payload.playerId, 'p1');
  assert.strictEqual(hofPost.payload.inductedYear, 2026);
  assert.strictEqual(hofPost.payload.reason, '赛季 MVP');

  await page.removeHallOfFame();
  const hofDelete = deletes.find(item => item.url === '/hall-of-fame/p1');
  assert(hofDelete, 'admin console should remove hall of fame entries');

  page.onInviteUserChange(input('1'));
  page.onInvitePlayerChange(input('1'));
  page.onInviteMessageInput(input('请绑定正式球员档案'));
  await page.sendBindInvitation();
  assert(!posts.some(item => item.url === '/admin/bind-invitations'), 'admin console should not send bind invitations from the cleaned UI flow');
  assert.strictEqual(page.data.inviteCode, '');

  assert(!posts.some(item => item.url === '/tournaments'), 'admin console should not create tournaments from the cleaned panel flow');
}

async function testTournamentManageFlow() {
  const posts = [];
  const patches = [];
  const deletes = [];
  const page = loadPage('miniprogram/pages/tournaments/tournament-manage/tournament-manage.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return {
          user: {
            id: 'u_ops',
            displayName: '赛事管理员',
            role: 'admin',
            permissions: ['tournaments:write', 'games:revise', 'destructive:delete'],
          },
          player: null,
        };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, false);
        return {
          games: [
            { id: 'g_old', tournamentId: '', sport: 'softball', season: '2026-slow', seasonName: '2026 慢垒', away: '神策', home: '猎户座', awayScore: 3, homeScore: 7, date: '2026-06-10', venue: '奥体' },
            { id: 'g_linked', tournamentId: 't_new', sport: 'softball', season: '2026-test', seasonName: '测试杯赛', away: '猎户座', home: '猛虎', awayScore: 2, homeScore: 1, date: '2026-06-11', venue: '树人' },
          ],
          hasMore: false,
          nextOffset: 2,
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        return { url: `https://cos.example/${payload.fileName}` };
      }
      if (url === '/tournaments') {
        return { tournament: { id: 't_new', ...payload } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      if (url === '/games/batch-reassign') return { moved: payload.gameIds.length };
      return { tournament: { id: 't_new', ...payload } };
    },
    del: async url => {
      deletes.push({ url });
      return { ok: true };
    },
  });

  await page.onLoad({});
  assert.strictEqual(page.data.canManageTournaments, true);
  assert.strictEqual(page.data.canMoveGames, true);
  assert.strictEqual(page.data.editing, false);
  page.onTournamentTypeChange(input('0'));
  page.onTournamentSportChange(input('0'));
  page.onNameInput(input('测试杯赛'));
  page.onShortNameInput(input('测试杯'));
  page.onSeasonInput(input('2026-test'));
  page.onStartDateChange(input('2026-06-20'));
  page.onEndDateChange(input('2026-06-21'));
  page.onLocationInput(input('奥体'));
  mediaFiles = [{ tempFilePath: '/tmp/tournament-cover.webp', name: 'tournament-cover.webp', size: 2048 }];
  fileReads['/tmp/tournament-cover.webp'] = 'tournament_cover_base64';
  await page.chooseCoverImage();
  const coverPost = posts.find(item => item.url === '/upload/base64');
  assert.deepStrictEqual(coverPost.payload, {
    kind: 'tournament',
    fileName: 'tournament-cover.webp',
    contentType: 'image/webp',
    fileBase64: 'tournament_cover_base64',
  });
  page.onDescriptionInput(input('小程序创建赛事'));
  await page.submit();
  const tournamentPost = posts.find(item => item.url === '/tournaments');
  assert.deepStrictEqual(tournamentPost.payload, {
    type: 'cup',
    sport: 'softball',
    name: '测试杯赛',
    shortName: '测试杯',
    season: '2026-test',
    startDate: '2026-06-20',
    endDate: '2026-06-21',
    location: '奥体',
    cover: 'https://cos.example/tournament-cover.webp',
    description: '小程序创建赛事',
  });
  assert.strictEqual(page.data.id, 't_new');
  assert.strictEqual(page.data.editing, true);
  assert.strictEqual(page.data.visibleGames.length, 1);
  assert.strictEqual(page.data.visibleGames[0].id, 'g_old');
  page.selectAllVisibleGames();
  await page.moveSelectedGames();
  const batchPatch = patches.find(item => item.url === '/games/batch-reassign');
  assert.deepStrictEqual(batchPatch.payload, { gameIds: ['g_old'], tournamentId: 't_new' });
  page.onNameInput(input('测试杯赛修订'));
  await page.submit();
  const tournamentPatch = patches.find(item => item.url === '/tournaments/t_new');
  assert.strictEqual(tournamentPatch.payload.name, '测试杯赛修订');
  page.onDeleteConfirmInput(input('删除赛事'));
  await page.deleteTournament();
  assert.strictEqual(deletes[0].url, '/tournaments/t_new');
  assert.strictEqual(navigation.pop(), '/pages/events/event-list/event-list');

  const blockedPage = loadPage('miniprogram/pages/tournaments/tournament-manage/tournament-manage.js', {
    get: async url => {
      if (url === '/auth/me') return { user: { id: 'u_plain', displayName: '普通队员', permissions: [] }, player: null };
      throw new Error(`unexpected GET ${url}`);
    },
  });
  await blockedPage.onLoad({});
  assert.strictEqual(blockedPage.data.canManageTournaments, false);
  assert.strictEqual(toasts.pop(), '需要赛事管理权限');
  await new Promise(resolve => setTimeout(resolve, 380));
  assert.strictEqual(navigation.pop(), '/pages/events/event-list/event-list');
}

async function testAdminAuditPageFlow() {
  const calls = [];
  const page = loadPage('miniprogram/pages/admin/audit/audit.js', {
    get: async (url, params) => {
      if (url === '/auth/me') {
        return {
          user: {
            id: 'u_admin',
            displayName: '数据管理员',
            role: 'admin',
            adminLevel: 'A',
            adminPermissionGroups: ['data', 'ops'],
            permissions: ['audit:read', 'audit:game_read'],
          },
          player: null,
        };
      }
      if (url === '/admin/audit-logs') {
        calls.push({ ...params });
        const index = Number(params.offset || 0);
        if (params.action === 'player_delete') {
          return {
            scope: 'all',
            hasMore: false,
            nextOffset: index + 1,
            logs: [
              {
                id: 'log_player_delete',
                action: 'player_delete',
                targetType: 'player',
                targetId: 'p_old',
                summary: '删除球员「误建档案」',
                actorName: '数据管理员',
                metadata: { player: { id: 'p_old', name: '误建档案' } },
                createdAt: '2026-06-12T09:25:00',
              },
            ],
          };
        }
        return {
          scope: params.targetType === 'game' ? 'game' : 'all',
          hasMore: index === 0 && !params.q,
          nextOffset: index + 1,
          logs: [
            {
              id: `log${index + 1}`,
              action: params.action || 'revise_game_data',
              targetType: params.targetType || 'game',
              targetId: index ? 'g2' : 'g1',
              summary: index ? '更新比赛：猎户座 vs 海淀' : '修订比赛数据：测试队 vs 猎户座',
              actorName: '数据管理员',
              metadata: {
                reason: '赛后复核',
                changedKeys: ['batting', 'pitching'],
              },
              createdAt: '2026-06-12T09:30:00',
            },
          ],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load(true);
  assert.strictEqual(page.data.canReadAudit, true);
  assert.strictEqual(calls[0].limit, 30);
  assert.strictEqual(calls[0].offset, 0);
  assert.strictEqual(page.data.logs[0].title, '修订比赛数据：测试队 vs 猎户座');
  assert.strictEqual(page.data.logs[0].targetText, '比赛 · g1');
  assert(page.data.logs[0].metadataText.includes('赛后复核'));
  page.openDetail(tap({ id: 'log1' }));
  assert.strictEqual(page.data.detailOpen, true);
  page.copyDetail();
  assert(clipboardWrites.some(text => text.includes('changedKeys')));
  page.closeDetail();
  assert.strictEqual(page.data.detailOpen, false);

  await page.loadMore();
  assert.strictEqual(calls[1].offset, 1);
  assert.strictEqual(page.data.logs.length, 2);

  page.onKeywordInput(input('投手'));
  await page.search();
  assert.strictEqual(calls[calls.length - 1].q, '投手');
  await page.onTargetChange(input(String(page.data.targetFilters.findIndex(item => item.value === 'game'))));
  assert.strictEqual(calls[calls.length - 1].targetType, 'game');
  await page.onActionChange(input(String(page.data.actionFilters.findIndex(item => item.value === 'revise_game_data'))));
  assert.strictEqual(calls[calls.length - 1].action, 'revise_game_data');
  await page.onTargetChange(input(String(page.data.targetFilters.findIndex(item => item.value === 'event'))));
  assert.strictEqual(calls[calls.length - 1].targetType, 'event');
  await page.onActionChange(input(String(page.data.actionFilters.findIndex(item => item.value === 'event_create'))));
  assert.strictEqual(calls[calls.length - 1].action, 'event_create');
  assert.strictEqual(page.data.logs[0].actionText, '创建接龙');
  await page.onTargetChange(input(String(page.data.targetFilters.findIndex(item => item.value === 'player'))));
  assert.strictEqual(calls[calls.length - 1].targetType, 'player');
  await page.onActionChange(input(String(page.data.actionFilters.findIndex(item => item.value === 'player_delete'))));
  assert.strictEqual(calls[calls.length - 1].action, 'player_delete');
  assert.strictEqual(page.data.logs[0].actionText, '删除球员');
  assert.strictEqual(page.data.logs[0].targetText, '球员 · p_old');
  await page.onTargetChange(input(String(page.data.targetFilters.findIndex(item => item.value === 'tournament'))));
  assert.strictEqual(calls[calls.length - 1].targetType, 'tournament');
  await page.onActionChange(input(String(page.data.actionFilters.findIndex(item => item.value === 'tournament_delete'))));
  assert.strictEqual(calls[calls.length - 1].action, 'tournament_delete');
  assert.strictEqual(page.data.logs[0].actionText, '删除赛事');
  assert(page.data.logs[0].targetText.startsWith('赛事'));
  await page.onTargetChange(input(String(page.data.targetFilters.findIndex(item => item.value === 'site_setting'))));
  assert.strictEqual(calls[calls.length - 1].targetType, 'site_setting');
  await page.onActionChange(input(String(page.data.actionFilters.findIndex(item => item.value === 'site_setting_publish'))));
  assert.strictEqual(calls[calls.length - 1].action, 'site_setting_publish');
  assert.strictEqual(page.data.logs[0].actionText, '发布系统设置');
  await page.clearFilters();
  const last = calls[calls.length - 1];
  assert.strictEqual(last.targetType, undefined);
  assert.strictEqual(last.action, undefined);
  assert.strictEqual(last.q, undefined);
}

async function testGameListTournamentFlow() {
  const tournamentRequests = [];
  const allGames = [
    { id: 'g1', tournamentId: 't_slow', sport: 'softball', season: '2026-slow', seasonName: '慢垒春季', cover: 'https://cos.example/g1.jpg', away: '神策', home: '猎户座', awayScore: 3, homeScore: 7, date: '2026-05-01' },
    { id: 'g2', tournamentId: 't_base', sport: 'baseball', season: '2026-base', seasonName: '棒球联赛', away: '猎户星', home: '猛虎', awayScore: 2, homeScore: 1, date: '2026-05-08' },
    { id: 'g3', sport: 'softball', season: '2026-slow', away: '猎户座', home: '奥美', awayScore: 5, homeScore: 4, date: '2026-05-15' },
  ];
  const page = loadPage('miniprogram/pages/games/game-list/game-list.js', {
    get: async (url, params) => {
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'false');
        assert.strictEqual(params.limit, 30);
        assert(Number.isFinite(Number(params.offset)));
        let games = allGames.slice();
        if (params.sport) games = games.filter(game => game.sport === params.sport);
        if (params.tournamentId === 't_slow') {
          assert.strictEqual(params.includeSeasonFallback, 'true');
          games = games.filter(game => game.tournamentId === 't_slow' || (!game.tournamentId && game.season === '2026-slow'));
        }
        const offset = Number(params.offset || 0);
        const pageGames = games.slice(offset, offset + 2);
        return {
          games: pageGames,
          nextOffset: offset + pageGames.length,
          hasMore: offset + pageGames.length < games.length,
        };
      }
      if (url === '/tournaments') {
        assert.strictEqual(params.includeGameCount, 'true');
        assert.strictEqual(params.limit, 30);
        tournamentRequests.push(params);
        if (params.offset === 0) {
          return {
            totalGameCount: 3,
            tournaments: [
              { id: 't_slow', name: '奥体慢垒春季赛', shortName: '奥体慢垒', sport: 'softball', season: '2026-slow', location: '奥体', gameCount: 2 },
            ],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            totalGameCount: 3,
            tournaments: [
              { id: 't_base', name: '北京棒球联赛', shortName: '棒球联赛', sport: 'baseball', season: '2026-base', location: '树人', gameCount: 1 },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return { totalGameCount: 3, tournaments: [], hasMore: false, nextOffset: params.offset };
      }
      if (url === '/auth/me') {
        return { user: { id: 'u_admin', displayName: '数据管理员', role: 'admin', permissions: ['games:draft', 'games:confirm'] }, player: null };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.load();
  assert.strictEqual(page.data.canImport, true);
  assert.strictEqual(page.data.canRecordGame, true);
  assert.deepStrictEqual(tournamentRequests[0], { includeGameCount: 'true', limit: 30, offset: 0 });
  assert.strictEqual(page.data.tournaments.length, 2);
  assert.strictEqual(page.data.tournamentHasMore, true);
  assert.strictEqual(page.data.visibleGames.length, 2, 'game list should load the first page only');
  assert.strictEqual(page.data.hasMore, true);
  await page.loadMoreTournaments();
  assert.deepStrictEqual(tournamentRequests[1], { includeGameCount: 'true', limit: 30, offset: 1 });
  assert.strictEqual(page.data.tournaments.length, 3);
  assert.strictEqual(page.data.tournamentHasMore, false);
  await page.loadMore();
  assert.strictEqual(page.data.visibleGames.length, 3);
  assert.strictEqual(page.data.tournaments[1].meta, '🥎 慢垒 · 2026-slow · 奥体');
  assert.strictEqual(page.data.visibleGames[0].sportLabel, '🥎 慢垒');
  assert.strictEqual(page.data.visibleGames[0].coverClass, 'has-cover');
  assert.strictEqual(page.data.visibleGames[1].coverClass, 'no-cover');
  assert.strictEqual(page.data.tournaments[1].count, 2, 'season fallback should count legacy games without tournamentId');
  assert.strictEqual(page.data.tournaments[1].countText, '2 场');
  await page.setSport(tap({ sport: 'baseball' }));
  assert.deepStrictEqual(page.data.visibleGames.map(g => g.id), ['g2']);
  assert.strictEqual(page.data.visibleGames[0].sportLabel, '⚾ 棒球');
  await page.setSport(tap({ sport: 'all' }));
  await page.setTournament(tap({ id: 't_slow' }));
  assert.strictEqual(page.data.activeTournamentId, 't_slow');
  assert.deepStrictEqual(page.data.visibleGames.map(g => g.id), ['g1', 'g3']);
  assert.strictEqual(page.data.visibleGames[0].tournamentLabel, '奥体慢垒');
  page.openTournament(tap({ id: 't_slow' }));
  assert.strictEqual(navigation.pop(), '/pages/tournaments/tournament-detail/tournament-detail?id=t_slow');
  page.open(tap({ id: 'g1' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g1');
  page.importPdf();
  assert.strictEqual(navigation.pop(), '/pages/games/game-import/game-import');
  page.create();
  assert.strictEqual(navigation.pop(), '/pages/score/create/create');
}

async function testTournamentDetailFlow() {
  const playerDetailRequests = [];
  const playerSearchRequests = [];
  const page = loadPage('miniprogram/pages/tournaments/tournament-detail/tournament-detail.js', {
    get: async (url, params) => {
      if (url === '/tournaments/t_slow') {
        return {
          tournament: {
            id: 't_slow',
            name: '奥体慢垒春季赛',
            shortName: '奥体慢垒',
            type: 'league',
            sport: 'softball',
            season: '2026-slow',
            startDate: '2026-04-01',
            endDate: '2026-06-30',
            location: '奥体中心',
            cover: 'https://cos.example/tournament.jpg',
            description: '周末慢垒联赛',
          },
        };
      }
      if (url === '/games') {
        assert.strictEqual(params.includeAggregate, 'true');
        assert.strictEqual(params.tournamentId, 't_slow');
        assert.strictEqual(params.includeSeasonFallback, 'true');
        return {
          games: [
            {
              id: 'g1',
              tournamentId: 't_slow',
              sport: 'softball',
              season: '2026-slow',
              date: '2026-05-01',
              innings: 7,
              away: '神策',
              home: '猎户座',
              awayScore: 3,
              homeScore: 7,
              cover: 'https://cos.example/g1.jpg',
              batting: [
                { playerId: 'p1', name: '旧名', AB: 4, H: 2, R: 1, RBI: 3, BB: 1, _1B: 1, HR: 1 },
                { playerId: 'p2', name: '队友', AB: 4, H: 1, R: 2, RBI: 2, _1B: 1 },
              ],
              pitching: [{ playerId: 'p1', name: '旧名', IP: '2.0', H: 1, R: 1, ER: 1, BB: 0, SO: 4, decision: 'W' }],
            },
            {
              id: 'g2',
              sport: 'softball',
              season: '2026-slow',
              date: '2026-05-08',
              away: '猎户座',
              home: '奥美',
              awayScore: 5,
              homeScore: 4,
              batting: [{ name: 'Jiang', AB: 2, H: 1, R: 1, RBI: 1, BB: 0, _1B: 1 }],
              pitching: [{ name: 'Jiang', IP: '1.1', H: 0, R: 0, ER: 0, BB: 1, SO: 2 }],
            },
            {
              id: 'g_agg',
              tournamentId: 't_slow',
              sport: 'softball',
              season: '2026-slow',
              date: '2026-12-31',
              isAggregate: true,
              away: '猎户座',
              home: '赛季汇总',
              awayScore: 0,
              homeScore: 0,
              batting: [{ name: '江山', gp: 12, AB: 50, H: 40, RBI: 30, HR: 8 }],
            },
            {
              id: 'g_other',
              tournamentId: 't_other',
              sport: 'baseball',
              season: '2026-base',
              date: '2026-05-15',
              away: '猎户星',
              home: '猛虎',
              awayScore: 2,
              homeScore: 1,
              batting: [{ name: '江山', AB: 4, H: 4 }],
            },
          ],
        };
      }
      if (url === '/players/p1') {
        playerDetailRequests.push(url);
        return { player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang', aliases: ['Jiang', '旧名'] } };
      }
      if (url === '/players/p2') {
        playerDetailRequests.push(url);
        return { player: { id: 'p2', name: '队友', publicDisplayName: '队友公开名', aliases: [] } };
      }
      if (url === '/players') {
        playerSearchRequests.push(params);
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 5);
        assert.strictEqual(params.offset, 0);
        return { players: [] };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  page.setData({ id: 't_slow' });
  await page.load();
  assert.deepStrictEqual(playerDetailRequests.sort(), ['/players/p1', '/players/p2']);
  assert.deepStrictEqual(playerSearchRequests, [], 'tournament detail should not load the full player pool when IDs and aliases resolve rows');
  assert.strictEqual(page.data.summary.title, '奥体慢垒春季赛');
  assert.strictEqual(page.data.summary.recordText, '2 胜 0 败');
  assert.strictEqual(page.data.summary.runsText, '12:7');
  assert.strictEqual(page.data.games.length, 2, 'tournament detail should list regular games and hide aggregate rows when game rows exist');
  assert.deepStrictEqual(page.data.games.map(game => game.id), ['g1', 'g2']);
  assert.strictEqual(page.data.batting[0].name, 'Jiang');
  assert.strictEqual(page.data.batting[0].H, 3);
  assert.strictEqual(page.data.batting[0].HR, 1);
  assert.strictEqual(page.data.batting[0].linked, true);
  assert.strictEqual(page.data.pitching[0].name, 'Jiang');
  assert.strictEqual(page.data.pitching[0].IPText, '3.1');
  assert.strictEqual(page.data.pitching[0].ERAText, '2.70');
  page.onSortChange(input('3'));
  assert.strictEqual(page.data.sortLabel, 'RBI');
  assert.strictEqual(page.data.batting[0].RBI, 4);
  page.openPlayer(tap({ playerId: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
  page.openGame(tap({ id: 'g2' }));
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g2');
}

async function testGameImportFlow() {
  const posts = [];
  const tournamentRequests = [];
  const page = loadPage('miniprogram/pages/games/game-import/game-import.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') {
        return { user: { id: 'u_admin', displayName: '数据管理员', role: 'admin', permissions: ['games:draft', 'games:confirm'] }, player: null };
      }
      if (url === '/tournaments') {
        tournamentRequests.push(params);
        assert.strictEqual(params.limit, 30);
        if (params.offset === 0) {
          return {
            tournaments: [
              { id: 't_slow', name: '奥体慢垒春季赛', shortName: '奥体慢垒', sport: 'softball', season: '2026-slow' },
            ],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            tournaments: [
              { id: 't_base', name: '北京棒球联赛', shortName: '棒球联赛', sport: 'baseball', season: '2026-base' },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return { tournaments: [], hasMore: false, nextOffset: params.offset };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        return { url: 'https://cos.example/game-cover.jpg', cloudPath: 'orion/game/game-cover.jpg' };
      }
      if (url === '/games/import-gamechanger') {
        assert.strictEqual(payload.tournamentId, 't_slow');
        assert(['神策_vs_猎户座_Mar_30_2026.pdf', '奥美老登_vs_猎户座_May_06_2026.pdf', '奥体慢垒核验表.xlsx'].includes(payload.fileName));
        if (payload.fileName === '奥体慢垒核验表.xlsx') {
          assert.strictEqual(payload.fileBase64, 'UEsDBAo=');
          return {
            drafts: [
              {
                date: '2026-06-01',
                tournamentId: 't_slow',
                sport: 'softball',
                season: '2026-slow',
                seasonName: '奥体慢垒春季赛',
                away: '猎户座',
                home: 'Excel 一队',
                awayScore: 10,
                homeScore: 8,
                innings: 7,
                batting: [{ name: '江山', AB: 4, H: 2, R: 1, RBI: 2 }],
                pitching: [],
                metadata: { source: 'gamechanger_excel', originalFileName: payload.fileName, sourceGameId: 'excel-1' },
              },
              {
                date: '2026-06-02',
                tournamentId: 't_slow',
                sport: 'softball',
                season: '2026-slow',
                seasonName: '奥体慢垒春季赛',
                away: '猎户座',
                home: 'Excel 二队',
                awayScore: 7,
                homeScore: 6,
                innings: 7,
                batting: [{ name: '李嘉琪', AB: 3, H: 1, R: 1, RBI: 1 }],
                pitching: [],
                metadata: { source: 'gamechanger_excel', originalFileName: payload.fileName, sourceGameId: 'excel-2' },
              },
            ],
            warnings: ['Excel 复核提示'],
          };
        }
        if (payload.fileName === '神策_vs_猎户座_Mar_30_2026.pdf') {
          assert.strictEqual(payload.fileBase64, 'JVBERi0xLjQ=');
        } else {
          assert.strictEqual(payload.fileBase64, 'JVBERi0yLjA=');
        }
        const isSecondPdf = payload.fileName === '奥美老登_vs_猎户座_May_06_2026.pdf';
        return {
          draft: {
            date: isSecondPdf ? '2026-05-06' : '2026-03-30',
            tournamentId: 't_slow',
            sport: 'softball',
            season: '2026-slow',
            seasonName: '奥体慢垒春季赛',
            away: isSecondPdf ? '奥美老登' : '神策',
            home: '猎户座',
            awayScore: isSecondPdf ? 9 : 14,
            homeScore: isSecondPdf ? 12 : 19,
            innings: isSecondPdf ? 7 : 13,
            batting: [{ name: isSecondPdf ? '江山' : '李嘉琪', AB: 4, H: isSecondPdf ? 2 : 3, R: 2, RBI: isSecondPdf ? 2 : 4 }],
            pitching: [{ name: '周梦成', IP: '4.0', R: 4, ER: 2, SO: 1 }],
            metadata: { source: 'gamechanger_pdf', originalFileName: payload.fileName },
          },
          warnings: [],
        };
      }
      if (url === '/games') {
        return { game: { id: 'g_imported', ...payload } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  });

  messageFiles = [
    { name: '神策_vs_猎户座_Mar_30_2026.pdf', path: '/tmp/game.pdf', size: 2048 },
    { name: '奥美老登_vs_猎户座_May_06_2026.pdf', path: '/tmp/game-2.pdf', size: 4096 },
    { name: '奥体慢垒核验表.xlsx', path: '/tmp/games.xlsx', size: 8192 },
  ];
  fileReads = {
    '/tmp/game.pdf': 'JVBERi0xLjQ=',
    '/tmp/game-2.pdf': 'JVBERi0yLjA=',
    '/tmp/games.xlsx': 'UEsDBAo=',
  };
  await page.load();
  assert.strictEqual(page.data.canImport, true);
  assert.deepStrictEqual(tournamentRequests[0], { limit: 30, offset: 0 });
  assert.strictEqual(page.data.tournamentLabel, '奥体慢垒 · 🥎 慢垒 · 2026-slow');
  assert.strictEqual(page.data.tournamentHasMore, true);
  await page.loadMoreTournaments();
  assert.deepStrictEqual(tournamentRequests[1], { limit: 30, offset: 1 });
  assert.strictEqual(page.data.tournamentOptions.length, 3);
  assert.strictEqual(page.data.tournamentLabel, '奥体慢垒 · 🥎 慢垒 · 2026-slow');
  assert.strictEqual(page.data.tournamentHasMore, false);
  await page.choosePdf();
  assert.strictEqual(messageFileRequests[0].count, 10);
  assert.deepStrictEqual(messageFileRequests[0].extension, ['pdf', 'xls', 'xlsx']);
  assert.strictEqual(page.data.files.length, 3);
  assert.strictEqual(page.data.fileQueueText, '已选择 3 份 PDF / Excel，逐份解析入库');
  assert.strictEqual(page.data.fileName, '神策_vs_猎户座_Mar_30_2026.pdf');
  mediaFiles = [{ tempFilePath: '/tmp/game-cover.jpg', name: 'game-cover.jpg', size: 1024 }];
  fileReads['/tmp/game-cover.jpg'] = 'cover_base64';
  await page.chooseCoverImage();
  assert.strictEqual(posts[0].url, '/upload/base64');
  assert.strictEqual(posts[0].payload.kind, 'game');
  assert.strictEqual(posts[0].payload.fileName, 'game-cover.jpg');
  assert.strictEqual(posts[0].payload.contentType, 'image/jpeg');
  assert.strictEqual(page.data.coverUrl, 'https://cos.example/game-cover.jpg');
  await page.parsePdf();
  assert.strictEqual(posts[1].url, '/games/import-gamechanger');
  assert.strictEqual(page.data.summaryRows[3].value, '14 : 19');
  assert.strictEqual(page.data.battingPreview[0].name, '李嘉琪');
  await page.confirmImport();
  assert.strictEqual(posts[2].url, '/games');
  assert.strictEqual(posts[2].payload.metadata.source, 'gamechanger_pdf');
  assert.strictEqual(posts[2].payload.cover, 'https://cos.example/game-cover.jpg');
  assert.strictEqual(page.data.files[0].statusText, '已入库');
  assert.strictEqual(page.data.fileName, '奥美老登_vs_猎户座_May_06_2026.pdf');
  assert.strictEqual(page.data.coverUrl, '');
  assert.strictEqual(navigation.length, 0, 'batch import should stay on page until the last queued PDF is saved');
  await page.parsePdf();
  assert.strictEqual(posts[3].url, '/games/import-gamechanger');
  assert.strictEqual(posts[3].payload.fileName, '奥美老登_vs_猎户座_May_06_2026.pdf');
  assert.strictEqual(page.data.summaryRows[3].value, '9 : 12');
  await page.confirmImport();
  assert.strictEqual(posts[4].url, '/games');
  assert.strictEqual(posts[4].payload.metadata.originalFileName, '奥美老登_vs_猎户座_May_06_2026.pdf');
  assert.strictEqual(page.data.fileName, '奥体慢垒核验表.xlsx');
  assert.strictEqual(navigation.length, 0, 'queued Excel should keep import page active until all parsed games are saved');
  await page.parseSelectedFile();
  assert.strictEqual(posts[5].url, '/games/import-gamechanger');
  assert.strictEqual(posts[5].payload.fileName, '奥体慢垒核验表.xlsx');
  assert.strictEqual(page.data.files.length, 4, 'multi-game Excel should expand into parsed queue items');
  assert.strictEqual(page.data.summaryRows[3].value, '10 : 8');
  await page.confirmImport();
  assert.strictEqual(posts[6].url, '/games');
  assert.strictEqual(posts[6].payload.metadata.source, 'gamechanger_excel');
  assert.strictEqual(page.data.fileName, '奥体慢垒核验表.xlsx · 第 2 场');
  assert.strictEqual(navigation.length, 0);
  await page.confirmImport();
  assert.strictEqual(posts[7].url, '/games');
  assert.strictEqual(posts[7].payload.metadata.sourceGameId, 'excel-2');
  assert.strictEqual(navigation.pop(), '/pages/games/game-detail/game-detail?id=g_imported');
}

async function testGameDetailPlayerLinkFlow() {
  const highlightRequests = [];
  const playerSearchRequests = [];
  const page = loadPage('miniprogram/pages/games/game-detail/game-detail.js', {
    get: async (url, params = {}) => {
      if (url === '/games/g1') {
        return {
          game: {
            id: 'g1',
            eventId: 'e1',
            date: '2026-06-06',
            sport: 'baseball',
            cover: 'https://cos.example/g1.jpg',
            away: '测试队',
            home: '猎户座',
            awayScore: 3,
            homeScore: 8,
            linescore: { away: [1, 2], home: [4, 4] },
            homeTotals: { H: 9, E: 1 },
            awayTotals: { H: 5, E: 2 },
            batting: [
              { playerId: 'p1', name: '江山', AB: 4, H: 2, R: 1, RBI: 3, BB: 1, _2B: 1, pos: 'CF' },
              { name: '未知队员', AB: 2, H: 0, R: 0, RBI: 0, pos: 'RF' },
            ],
            pitching: [
              { name: '江', IP: '2.0', SO: 5, BB: 1, H: 2, ER: 1 },
              { name: '替补投手', IP: '1.0', SO: 4, BB: 0, H: 0, ER: 0 },
            ],
            oppBatting: [
              { name: '对手一棒', AB: 3, H: 2, R: 1, RBI: 1, BB: 0 },
              { name: '对手二棒', AB: 4, H: 1, R: 0, RBI: 0, BB: 1 },
            ],
            oppPitching: [
              { name: '对手先发', IP: '3.0', SO: 2, BB: 3, H: 5, ER: 4 },
              { name: '对手后援', IP: '1.0', SO: 1, BB: 0, H: 1, ER: 0 },
            ],
            mvpPlayerName: '江山',
            mvpPlayerId: 'p1',
            gameLog: [
              {
                id: 'log1',
                gameId: 'g1',
                playerId: 'p1',
                playerName: '江山',
                actionType: 'batting',
                actionKey: '_2B',
                label: '江山：二垒打',
                inningLabel: '第 1 局下半局',
                offenseName: '猎户座',
                outs: 1,
                bases: '二垒',
                score: '3:5',
                scoredRunners: [{ playerId: 'p1', playerName: '江山' }],
              },
            ],
            metadata: {
              source: 'mini_scorebook',
              rosterSource: 'relay',
              rosterEventId: 'e1',
              rosterEventTitle: '周末比赛接龙',
              relaySignupCount: 12,
            },
          },
        };
      }
      if (url === '/games/g1/export-pdf') {
        return {
          filename: '2026-06-06_测试队_vs_猎户座_比赛记录.pdf',
          mimeType: 'application/pdf',
          pdfBase64: Buffer.from('%PDF-1.7\nmock').toString('base64'),
        };
      }
      if (url === '/players/p1') {
        return {
          player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang', aliases: ['江'], position: 'CF' },
        };
      }
      if (url === '/players') {
        playerSearchRequests.push(params);
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 5);
        assert.strictEqual(params.offset, 0);
        return { players: [] };
      }
      if (url === '/highlights') {
        highlightRequests.push(params);
        assert.strictEqual(params.gameId, 'g1');
        assert.strictEqual(params.limit, 30);
        assert.strictEqual(params.includePlayer, 'true');
        if (params.offset === 2) {
          if (params.public !== undefined) assert.strictEqual(params.public, 'true');
          return {
            highlights: [
              { id: 'h3', gameId: 'g1', title: '赛后合影', cover: 'https://cos.example/h3.jpg', url: '', playerName: '江山', status: 'published', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' } },
            ],
            hasMore: false,
            nextOffset: 3,
          };
        }
        assert.strictEqual(params.offset, 0);
        if (!params.status) {
          if (params.public !== undefined) assert.strictEqual(params.public, 'true');
          return {
            highlights: [
              { id: 'h1', gameId: 'g1', title: '关键二垒打', cover: 'https://cos.example/h1.jpg', url: 'https://www.bilibili.com/video/BVh1', playerName: '江山', status: 'published', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' } },
              { id: 'h2', gameId: 'g1', title: '守备高光', cover: 'https://cos.example/h2.jpg', url: '', playerName: '江山', status: 'approved', player: { id: 'p1', name: '江山', publicDisplayName: 'Jiang' } },
            ],
            hasMore: true,
            nextOffset: 2,
          };
        }
        if (params.status === 'published') {
          return {
            highlights: [
              { id: 'h1', gameId: 'g1', title: '关键二垒打', cover: 'https://cos.example/h1.jpg', url: 'https://www.bilibili.com/video/BVh1', playerName: '江山', status: 'published' },
            ],
          };
        }
        if (params.status === 'approved') {
          return {
            highlights: [
              { id: 'h2', gameId: 'g1', title: '守备高光', cover: 'https://cos.example/h2.jpg', url: '', playerName: '江山', status: 'approved' },
            ],
          };
        }
        return { highlights: [] };
      }
      if (url === '/auth/me') {
        return { user: { id: 'u_data', role: 'admin', permissions: ['games:revise'] }, player: null };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  page.setData({ id: 'g1' });
  await page.load();
  assert.deepStrictEqual(playerSearchRequests.map(item => item.keyword), ['未知队员', '替补投手'], 'game detail should query only unmatched Orion-side names, not the full player pool');
  assert.strictEqual(page.data.game.sportLabel, '⚾ 棒球');
  assert.strictEqual(page.data.game.cover, 'https://cos.example/g1.jpg');
  assert.strictEqual(page.data.batting[0].playerId, 'p1');
  assert.strictEqual(page.data.batting[0].displayName, 'Jiang');
  assert.strictEqual(page.data.batting[0].avgText, '.500');
  assert.strictEqual(page.data.batting[0].opsText, '1.350');
  assert.strictEqual(page.data.battingSortLabel, '安打');
  page.sortBatting(tap({ key: 'RBI' }));
  assert.strictEqual(page.data.battingSortLabel, '打点');
  assert.strictEqual(page.data.batting[0].playerId, 'p1', 'batting table should sort by selected metric');
  assert.strictEqual(page.data.battingChart[0].valueText, '3', 'batting metric bar should follow selected sort metric');
  assert.strictEqual(page.data.batting[1].linked, false);
  assert.strictEqual(page.data.pitching[0].playerId, 'p1', 'pitching row should match player aliases');
  assert.strictEqual(page.data.pitching[0].eraText, '4.50');
  page.sortPitching(tap({ key: 'ERA' }));
  assert.strictEqual(page.data.pitchingSortArrow, ' ↑', 'lower-better pitching metric should sort ascending first');
  assert.strictEqual(page.data.pitching[0].name, '替补投手');
  page.sortOppBatting(tap({ key: 'AVG' }));
  assert.strictEqual(page.data.oppBattingSortLabel, '打率');
  assert.strictEqual(page.data.oppBatting[0].name, '对手一棒');
  assert.strictEqual(page.data.oppPitching.length, 2);
  page.sortOppPitching(tap({ key: 'WHIP' }));
  assert.strictEqual(page.data.oppPitchingSortLabel, 'WHIP');
  assert.strictEqual(page.data.oppPitching[0].name, '对手后援');
  assert.strictEqual(page.data.gameLog[0].playerId, 'p1', 'game log should keep player id links');
  assert.strictEqual(page.data.gameLog[0].label, 'Jiang：二垒打', 'game log labels should use public player identity');
  assert.strictEqual(page.data.gameLog[0].playerName, 'Jiang', 'game log profile link should use public player identity');
  assert.strictEqual(page.data.gameLog[0].scoredRunnerNames, 'Jiang', 'game log should render scored runner links with public display names');
  assert.strictEqual(page.data.mvp.playerId, 'p1', 'game detail should link MVP by player id');
  assert.strictEqual(page.data.mvp.displayName, 'Jiang');
  assert.strictEqual(page.data.origin.title, '周末比赛接龙');
  assert.strictEqual(page.data.origin.eventId, 'e1');
  assert.strictEqual(page.data.origin.countText, '12 人接龙');
  assert.deepStrictEqual(highlightRequests, [{ gameId: 'g1', limit: 30, offset: 0, includePlayer: 'true' }]);
  assert.strictEqual(page.data.highlights.length, 2);
  assert.strictEqual(page.data.highlightsHasMore, true);
  assert.strictEqual(page.data.highlightsNextOffset, 2);
  assert.strictEqual(page.data.highlightCountText, '2 张');
  assert.strictEqual(page.data.highlights[0].title, '关键二垒打');
  assert(page.data.highlights[0].meta.includes('Jiang'), 'game highlights should use public player identity');
  assert(!page.data.highlights[0].meta.includes('江山'), 'game highlights should not expose the raw player name when a public identity exists');
  assert.strictEqual(page.data.highlightImages[1], 'https://cos.example/h2.jpg');
  await page.loadMoreGameHighlights();
  assert.deepStrictEqual(highlightRequests, [
    { gameId: 'g1', limit: 30, offset: 0, includePlayer: 'true' },
    { gameId: 'g1', limit: 30, offset: 2, includePlayer: 'true' },
  ]);
  assert.strictEqual(page.data.highlights.length, 3);
  assert.strictEqual(page.data.highlightsHasMore, false);
  assert.strictEqual(page.data.highlightCountText, '3 张');
  assert.strictEqual(page.data.canEditGame, true);
  page.previewHighlight(tap({ image: 'https://cos.example/h1.jpg' }));
  assert.strictEqual(imagePreviews[0].current, 'https://cos.example/h1.jpg');
  assert.deepStrictEqual(imagePreviews[0].urls, ['https://cos.example/h1.jpg', 'https://cos.example/h2.jpg', 'https://cos.example/h3.jpg']);
  page.copyHighlightLink(tap({ url: 'https://www.bilibili.com/video/BVh1' }));
  assert.strictEqual(clipboardWrites[0], 'https://www.bilibili.com/video/BVh1');
  await page.exportGamePdf();
  assert.strictEqual(fileWrites.length, 1);
  assert.strictEqual(fileWrites[0].encoding, 'base64');
  assert.strictEqual(fileWrites[0].data, Buffer.from('%PDF-1.7\nmock').toString('base64'));
  assert(fileWrites[0].filePath.includes('比赛记录.pdf'), 'PDF export should write a local PDF file');
  assert.deepStrictEqual(documentOpens[0], { filePath: fileWrites[0].filePath, fileType: 'pdf' });
  page.editGame();
  assert.strictEqual(navigation.pop(), '/pages/games/game-edit/game-edit?id=g1');
  page.openPlayer(tap({ playerId: 'p1' }));
  assert.strictEqual(navigation.pop(), '/pages/players/player-detail/player-detail?id=p1');
  page.openPlayer(tap({}));
  assert.strictEqual(navigation.length, 0);
  page.openEvent(tap({ id: 'e1' }));
  assert.strictEqual(navigation.pop(), '/pages/events/event-detail/event-detail?id=e1');
}

async function testGameEditRevisionFlow() {
  const patches = [];
  const posts = [];
  const dels = [];
  const tournamentRequests = [];
  const page = loadPage('miniprogram/pages/games/game-edit/game-edit.js', {
    get: async (url, params = {}) => {
      if (url === '/auth/me') {
        return { user: { id: 'u_data', role: 'admin', permissions: ['games:revise', 'destructive:delete'] }, player: null };
      }
      if (url === '/games/g1') {
        return {
          game: {
            id: 'g1',
            tournamentId: 't_old',
            date: '2026-06-06',
            cover: 'https://cos.example/old-cover.jpg',
            venue: 'Home',
            away: '测试队',
            home: '猎户座',
            awayScore: 3,
            homeScore: 8,
            awayTotals: { R: 3, H: 5, E: 2 },
            homeTotals: { R: 8, H: 9, E: 1 },
            batting: [
              { playerId: 'p1', name: '江山', pos: 'CF', AB: 4, R: 1, H: 2, _1B: 1, _2B: 1, _3B: 0, HR: 0, RBI: 3, BB: 0, SO: 1, E: 0 },
            ],
            pitching: [
              { playerId: 'p1', name: '江山', IP: '3.0', H: 5, R: 3, ER: 2, BB: 1, SO: 4, HR: 0, decision: 'W' },
            ],
            mvpPlayerName: '江山',
            mvpPlayerId: 'p1',
            mvpNote: '原始备注',
          },
        };
      }
      if (url === '/tournaments') {
        tournamentRequests.push(params);
        assert.strictEqual(params.limit, 30);
        if (params.offset === 0) {
          return {
            tournaments: [
              { id: 't_mid', name: '第一页赛事', shortName: '首赛', season: '2026-first' },
            ],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            tournaments: [
              { id: 't_new', name: '新赛事', shortName: '新赛', season: '2026-new' },
            ],
            hasMore: false,
            nextOffset: 2,
          };
        }
      }
      if (url === '/tournaments/t_old') {
        return {
          tournament: { id: 't_old', name: '旧赛事', shortName: '旧赛', season: '2026-old' },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    post: async (url, payload) => {
      posts.push({ url, payload });
      if (url === '/upload/base64') {
        return { url: 'https://cos.example/revised-cover.png', cloudPath: 'orion/game/revised-cover.png' };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    patch: async (url, payload) => {
      patches.push({ url, payload });
      return { ok: true, game: { id: 'g1' } };
    },
    del: async url => {
      dels.push(url);
      return { ok: true };
    },
  });

  page.setData({ id: 'g1' });
  await page.load();
  assert.strictEqual(page.data.canEditGame, true);
  assert.strictEqual(page.data.cover, 'https://cos.example/old-cover.jpg');
  assert.strictEqual(page.data.tournamentOptions.length, 3);
  assert.strictEqual(page.data.tournamentIndex, 1);
  assert.strictEqual(page.data.tournamentLabel, '旧赛 · 2026-old');
  assert.deepStrictEqual(tournamentRequests, [{ limit: 30, offset: 0 }]);
  assert.strictEqual(page.data.mvpPlayerId, 'p1');
  assert(page.data.mvpLabel.includes('已关联球员'));
  await page.loadMoreTournaments();
  assert.strictEqual(page.data.tournamentOptions.length, 4);
  assert.strictEqual(page.data.tournamentIndex, 1, 'loading more tournaments should preserve the selected existing tournament');
  assert.strictEqual(page.data.tournamentHasMore, false);
  assert.deepStrictEqual(tournamentRequests, [{ limit: 30, offset: 0 }, { limit: 30, offset: 1 }]);
  mediaFiles = [{ tempFilePath: '/tmp/revised-cover.png', name: 'revised-cover.png', size: 1024 }];
  fileReads['/tmp/revised-cover.png'] = 'revised_cover_base64';
  await page.chooseCoverImage();
  assert.strictEqual(posts[0].url, '/upload/base64');
  assert.strictEqual(posts[0].payload.kind, 'game');
  assert.strictEqual(posts[0].payload.fileName, 'revised-cover.png');
  assert.strictEqual(posts[0].payload.contentType, 'image/png');
  assert.strictEqual(page.data.cover, 'https://cos.example/revised-cover.png');
  page.onTournamentChange(input('3'));
  page.onDateChange(input('2026-06-07'));
  page.onAwayScoreInput(input('4'));
  page.onHomeScoreInput(input('9'));
  page.onHomeHInput(input('11'));
  page.onBattingFieldInput({ currentTarget: { dataset: { field: 'H' } }, detail: { value: '3' } });
  page.onBattingFieldInput({ currentTarget: { dataset: { field: '_2B' } }, detail: { value: '2' } });
  page.saveCurrentBattingRow();
  page.onPitchingFieldInput({ currentTarget: { dataset: { field: 'SO' } }, detail: { value: '6' } });
  page.saveCurrentPitchingRow();
  page.onMvpNoteInput(input('赛后复核后修订'));
  await page.saveGame();
  assert(toasts.includes('请填写修订原因'), 'saving without reason should be blocked');
  page.onRevisionReasonInput(input('GameChanger 复核后修正比分和二垒打'));
  await page.saveGame();
  assert.strictEqual(patches.length, 1);
  assert.strictEqual(patches[0].url, '/games/g1');
  assert.strictEqual(patches[0].payload.tournamentId, 't_new');
  assert.strictEqual(patches[0].payload.season, '2026-new');
  assert.strictEqual(patches[0].payload.seasonName, '新赛事');
  assert.strictEqual(patches[0].payload.cover, 'https://cos.example/revised-cover.png');
  assert.strictEqual(patches[0].payload.date, '2026-06-07');
  assert.strictEqual(patches[0].payload.awayScore, 4);
  assert.strictEqual(patches[0].payload.homeScore, 9);
  assert.strictEqual(patches[0].payload.homeTotals.H, 11);
  assert.strictEqual(patches[0].payload.batting[0].H, 3);
  assert.strictEqual(patches[0].payload.batting[0]._2B, 2);
  assert.strictEqual(patches[0].payload.pitching[0].SO, 6);
  assert.strictEqual(patches[0].payload.mvpPlayerId, 'p1');
  assert.strictEqual(patches[0].payload._revisionSource, 'mini_game_edit');
  assert.strictEqual(patches[0].payload._revisionReason, 'GameChanger 复核后修正比分和二垒打');
  assert.strictEqual(navigateBackCount, 1);
  await page.deleteGame();
  assert(toasts.includes('请输入“删除比赛”确认'), 'game delete should require explicit confirm text');
  page.onDeleteConfirmInput(input('删除比赛'));
  await page.deleteGame();
  assert.strictEqual(dels[0], '/games/g1');
  assert.strictEqual(navigateBackCount, 2);
}

async function testScoreCreateRosterSourceFlow() {
  const eventRequests = [];
  const tournamentRequests = [];
  const playerRequests = [];
  const playerDetailRequests = [];
  const page = loadPage('miniprogram/pages/score/create/create.js', {
    get: async (url, params) => {
      if (url === '/players') {
        playerRequests.push({ ...params });
        assert.strictEqual(params.include, 'all');
        assert.strictEqual(params.limit, 50);
        if (params.keyword === '三棒') {
          assert.strictEqual(params.offset, 0);
          return {
            players: [
              { id: 'p3', name: '三棒游击', number: 3, position: 'SS' },
            ],
            hasMore: false,
            nextOffset: 1,
          };
        }
        if (params.offset === 50) {
          return {
            players: [
              { id: 'p3', name: '三棒游击', number: 3, position: 'SS' },
            ],
            hasMore: false,
            nextOffset: 51,
          };
        }
        assert.strictEqual(params.offset, 0);
        return {
          players: [
            { id: 'p1', name: '一棒投手', number: 1, position: 'P' },
          ],
          hasMore: true,
          nextOffset: 50,
        };
      }
      if (url === '/players/p2') {
        playerDetailRequests.push(url);
        return { player: { id: 'p2', name: '二棒捕手', number: 2, position: 'C' } };
      }
      if (url === '/tournaments') {
        tournamentRequests.push(params);
        assert.strictEqual(params.limit, 30, 'score create should page tournament candidates');
        if (params.offset === 0) {
          return {
            tournaments: [{ id: 't_slow', name: '奥体慢垒春季赛', sport: 'softball', season: '2026-slow' }],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            tournaments: [{ id: 't_base', name: '北京棒球联赛', sport: 'baseball', season: '2026-base' }],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return { tournaments: [], hasMore: false, nextOffset: params.offset };
      }
      if (url === '/events') {
        eventRequests.push(params);
        assert.strictEqual(params.limit, 60, 'score create should page event candidates');
        if (params.offset === 0) {
          return {
            events: [{ id: 'e0', title: '最近训练接龙', date: '2026-06-05' }],
            hasMore: true,
            nextOffset: 1,
          };
        }
        if (params.offset === 1) {
          return {
            events: [{ id: 'e2', title: '加赛接龙', date: '2026-06-07' }],
            hasMore: false,
            nextOffset: 2,
          };
        }
        return { events: [], hasMore: false, nextOffset: params.offset };
      }
      if (url === '/events/e1') {
        return { event: { id: 'e1', title: '周末比赛接龙', date: '2026-06-06' } };
      }
      if (url === '/event-signups') {
        assert.strictEqual(params.eventId, 'e1');
        return {
          signups: [
            { id: 's1', playerId: 'p1', playerName: '一棒投手', status: 'going', note: '先发' },
            { id: 's2', playerId: 'p2', playerName: '二棒捕手', status: 'tentative', note: '' },
            { id: 's3', manualName: '微信群新人', status: 'going', note: '' },
            { id: 's4', playerId: 'p3', playerName: '三棒游击', status: 'cancelled', note: '' },
          ],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  await page.onLoad({ eventId: 'e1' });
  assert.deepStrictEqual(playerRequests[0], { include: 'all', limit: 50, offset: 0 });
  assert.deepStrictEqual(playerDetailRequests, ['/players/p2']);
  assert.strictEqual(page.data.playersHasMore, true);
  assert.deepStrictEqual(tournamentRequests[0], { limit: 30, offset: 0 });
  assert.strictEqual(page.data.tournamentHasMore, true);
  await page.loadMoreTournaments();
  assert.deepStrictEqual(tournamentRequests[1], { limit: 30, offset: 1 });
  assert.strictEqual(page.data.tournamentOptions.length, 3);
  assert.strictEqual(page.data.tournamentHasMore, false);
  assert.deepStrictEqual(eventRequests[0], { limit: 60, offset: 0 });
  assert.strictEqual(page.data.relayMode, true);
  assert.strictEqual(page.data.rosterSource, 'relay');
  assert.strictEqual(page.data.rosterEventLabel, '周末比赛接龙');
  assert.deepStrictEqual(page.data.rosterEventOptions.map(event => event.id), ['', 'e1', 'e0']);
  assert.strictEqual(page.data.rosterEventsHasMore, true);
  assert.strictEqual(page.data.date, '2026-06-06');
  assert.strictEqual(page.data.relaySummary, '3 人接龙，2 人可直接进出场名单');
  assert.strictEqual(page.data.lineup.length, 2);
  assert.deepStrictEqual(page.data.lineup.map(p => p.id), ['p1', 'p2']);
  assert.deepStrictEqual(page.data.relayUnmatchedNames, ['微信群新人']);
  await page.loadMoreRosterEvents();
  assert.deepStrictEqual(eventRequests[1], { limit: 60, offset: 1 });
  assert.deepStrictEqual(page.data.rosterEventOptions.map(event => event.id), ['', 'e1', 'e0', 'e2']);
  assert.strictEqual(page.data.rosterEventLabel, '周末比赛接龙');
  assert.strictEqual(page.data.rosterEventsHasMore, false);

  page.onLineupTouchStart(touch({ index: 0 }, 200));
  page.onLineupTouchMove(touch({ index: 0 }, 260));
  page.onLineupTouchEnd(touch({ index: 0 }, 260));
  assert.deepStrictEqual(page.data.lineup.map(p => p.id), ['p2', 'p1'], 'dragging a player block down should reorder batting order');
  page.moveLineupUp(tap({ index: 1 }));
  assert.deepStrictEqual(page.data.lineup.map(p => p.id), ['p1', 'p2'], 'up button should reorder batting order');
  page.moveLineupDown(tap({ index: 0 }));
  assert.deepStrictEqual(page.data.lineup.map(p => p.id), ['p2', 'p1'], 'down button should reorder batting order');
  page.onLineupTap(tap({ index: 1 }));
  page.onFieldMarkerTap(tap({ slot: 'SS' }));
  assert.strictEqual(page.data.lineup[1].slot, 'SS', 'selected player block should assign to tapped field slot');
  page.createSelectorQuery = () => ({
    in() { return this; },
    select(selector) {
      assert.strictEqual(selector, '.field-board');
      return this;
    },
    boundingClientRect(callback) {
      callback({ left: 100, right: 400, top: 100, bottom: 400, width: 300, height: 300 });
      return this;
    },
    exec() {},
  });
  page.onLineupTouchStart(touch({ index: 0 }, 170, 250));
  page.onLineupTouchEnd(touch({ index: 0 }, 175, 250));
  assert.strictEqual(page.data.lineup[0].slot, 'SF', 'dragging a player block onto the field should snap to the nearest defensive slot');

  await page.loadMorePlayers();
  assert.deepStrictEqual(playerRequests[1], { include: 'all', limit: 50, offset: 50 });
  assert.strictEqual(page.data.playersHasMore, false);
  page.onPlayerSearchInput(input('三棒'));
  await page.searchPlayers();
  assert.deepStrictEqual(playerRequests[2], { include: 'all', limit: 50, offset: 0, keyword: '三棒' });
  page.onRosterChange(input(['p3']));
  assert.strictEqual(page.data.lineup.length, 3, 'admin should still be able to manually add players after relay import');
  assert.deepStrictEqual(page.data.lineup.map(p => p.id), ['p2', 'p1', 'p3'], 'hidden relay-selected players should stay selected when adding from a searched page');
  page.onTournamentChange(input('2'));
  page.onOpponentInput(input('测试对手'));
  page.onDateChange(input('2026-06-10'));
  page.startGame();
  assert.strictEqual(storage.orionGameDraft.rosterSource, 'relay');
  assert.strictEqual(storage.orionGameDraft.date, '2026-06-10');
  assert.strictEqual(storage.orionGameDraft.tournamentId, 't_base');
  assert.strictEqual(storage.orionGameDraft.tournamentName, '北京棒球联赛');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(storage.orionGameDraft, 'innings'), false, 'score create should not preset innings');
  assert.strictEqual(storage.orionGameDraft.rosterEventId, 'e1');
  assert.strictEqual(storage.orionGameDraft.rosterEventTitle, '周末比赛接龙');
  assert.strictEqual(storage.orionGameDraft.relaySignupCount, 3);
  assert.strictEqual(storage.orionGameDraft.lineup.length, 3);
  assert.strictEqual(navigation.pop(), '/pages/score/live/live');
}

async function main() {
  await testLoginLegalFlow();
  await testEventDetailFlow();
  await testEventCreateEditFlow();
  await testEventListGalleryFlow();
  testRelayPasteParser();
  await testCheckinFlow();
  await testTrainingCheckinProgressFlow();
  await testPointsFlow();
  await testPointsSeasonFallbackFlow();
  await testHomeLeaderboardLinksFlow();
  await testContactFlow();
  await testHallOfFameFlow();
  await testHighlightsImageFlow();
  await testPlayerListFlow();
  await testPlayerDetailFlow();
  await testProfileSettingsFlow();
  await testNotificationsFlow();
  await testBindFlow();
  await testAdminConsoleFlow();
  await testTournamentManageFlow();
  await testAdminAuditPageFlow();
  await testGameListTournamentFlow();
  await testTournamentDetailFlow();
  await testGameImportFlow();
  await testGameDetailPlayerLinkFlow();
  await testGameEditRevisionFlow();
  await testScoreCreateRosterSourceFlow();
  console.log('Mini program player flow regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
