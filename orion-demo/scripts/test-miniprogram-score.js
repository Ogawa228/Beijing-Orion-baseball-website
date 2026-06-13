const assert = require('assert');
const path = require('path');

const requestPath = path.resolve(__dirname, '../miniprogram/utils/request.js');
let savedPayload = null;
let postCount = 0;
require.cache[requestPath] = {
  id: requestPath,
  filename: requestPath,
  loaded: true,
  exports: {
    post: async (_path, payload) => {
      postCount += 1;
      savedPayload = payload;
      return { game: { id: 'g_saved_test' } };
    },
  },
};

const TEST_DRAFT = {
  sport: 'softball',
  venue: 'Home',
  opponent: '测试对手',
  date: '2026-06-02',
  tournamentId: 't_test',
  tournamentName: '测试联赛',
  rosterSource: 'relay',
  rosterEventId: 'e_test',
  rosterEventTitle: '测试比赛接龙',
  relaySignupCount: 2,
  lineup: [
    { id: 'p1', name: '一棒投手', number: 1, slot: 'P' },
    { id: 'p2', name: '二棒捕手', number: 2, slot: 'C' },
  ],
};
const TEST_DRAFT_KEY = 'e_test|2026-06-02|测试对手|Home|softball';
const SNAPSHOT_KEY = 'orionLiveScoreSnapshot';

const storage = new Map();
storage.set('orionGameDraft', TEST_DRAFT);
let modalCalls = [];
let modalAnswer = null;
let redirectCount = 0;

let pageDef = null;
global.Page = def => { pageDef = def; };
global.getApp = () => ({ globalData: { user: { id: 'u_test', displayName: '测试记录员' } } });
global.wx = {
  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  removeStorageSync(key) {
    storage.delete(key);
  },
  showModal(options) {
    modalCalls.push(options);
    if (modalAnswer && options && typeof options.success === 'function') {
      options.success({ confirm: modalAnswer === 'confirm', cancel: modalAnswer === 'cancel' });
    }
  },
  enableAlertBeforeUnload() {},
  disableAlertBeforeUnload() {},
  showToast() {},
  navigateTo() {},
  redirectTo() { redirectCount += 1; },
};

require('../miniprogram/pages/score/live/live.js');

function createPage(def) {
  const page = {
    setData(patch) {
      for (const [key, value] of Object.entries(patch || {})) {
        this.data[key] = value;
      }
    },
  };
  for (const [key, value] of Object.entries(def)) {
    if (key === 'data') continue;
    page[key] = typeof value === 'function' ? value.bind(page) : value;
  }
  // 每个实例独立深拷贝 data,避免多页面用例共享同一份 def.data
  page.data = JSON.parse(JSON.stringify(def.data || {}));
  return page;
}

function tap(dataset) {
  return { currentTarget: { dataset } };
}

function input(value) {
  return { detail: { value } };
}

async function main() {
  assert(pageDef, 'score/live page definition should load');
  const page = createPage(pageDef);
  page.onLoad();

  assert.strictEqual(page.data.homeName, '猎户座');
  assert.strictEqual(page.data.awayName, '测试对手');
  assert.strictEqual(page.data.sportLabel, '🥎 慢垒');
  assert.strictEqual(page.data.lineHome.length, 1, 'scorebook should start with one inning and grow from actual recording');
  page.nextInning();
  assert.strictEqual(page.data.inning, 1, 'next inning should be allowed without a preset inning count');
  assert.strictEqual(page.data.lineHome.length, 2, 'linescore should extend when moving to a new inning');
  page.prevInning();
  assert.strictEqual(page.data.inning, 0);
  assert.strictEqual(page.data.currentBatter.name, '一棒投手');
  page.onBatterChange(input('1'));
  assert.strictEqual(page.data.currentBatter.name, '二棒捕手', 'picker should switch current batter directly');
  page.selectBatterRow(tap({ index: 0 }));
  assert.strictEqual(page.data.currentBatter.name, '一棒投手', 'tapping the batting table should switch current batter');

  page.incStat(tap({ key: 'R' }));
  assert.strictEqual(page.data.batting[0].R, 1);
  assert.strictEqual(page.data.homeScore, 1, 'Orion batter R should update home linescore');
  assert.strictEqual(page.data.playLog.length, 1, 'scoring action should create a play log entry');
  const snapshotAfterRun = storage.get(SNAPSHOT_KEY);
  assert(snapshotAfterRun, 'recording an action should persist a live snapshot');
  assert.strictEqual(snapshotAfterRun.draftKey, TEST_DRAFT_KEY, 'snapshot should carry the draft identity key');
  assert.strictEqual(snapshotAfterRun.state.homeScore, 1, 'snapshot should capture latest score');
  assert(!('history' in snapshotAfterRun.state), 'snapshot should not persist the undo history stack');

  page.undoLast();
  assert.strictEqual(page.data.batting[0].R, 0);
  assert.strictEqual(page.data.homeScore, 0, 'undo should restore linescore');
  assert.strictEqual(page.data.playLog.length, 0, 'undo should restore play log');
  assert.strictEqual(storage.get(SNAPSHOT_KEY).state.homeScore, 0, 'undo should refresh the persisted snapshot');

  page.toggleBase(tap({ base: 'first' }));
  assert.strictEqual(page.data.baseSummary, '一垒');
  page.incStat(tap({ key: 'OUT' }));
  assert.strictEqual(page.data.outs, 1, 'batter OUT should update game outs');
  assert(page.data.playLog[0].bases.includes('一垒'), 'play log should capture base state');
  page.undoLast();
  assert.strictEqual(page.data.outs, 0, 'undo should restore outs');
  assert.strictEqual(page.data.baseSummary, '一垒', 'undo should preserve prior base state');
  page.clearBases();
  assert.strictEqual(page.data.baseSummary, '垒上无人');
  page.nextHalf();
  assert.strictEqual(page.data.halfLabel, '下半局');
  assert.strictEqual(page.data.offenseName, '猎户座');

  page.toggleBase(tap({ base: 'third' }));
  page.incStat(tap({ key: '_1B' }));
  assert.strictEqual(page.data.homeScore, 1, 'single with runner on third should score automatically');
  assert.strictEqual(page.data.batting[0].RBI, 1, 'automatic run on a hit should credit RBI');
  assert.strictEqual(page.data.baseSummary, '一垒：一棒投手', 'single should leave batter identity on first');
  assert.strictEqual(page.data.currentBatter.name, '二棒捕手', 'plate appearance should advance to next batter');
  assert(page.data.playLog[0].label.includes('带回 1 分'), 'play log should describe automatic RBI/run result');
  assert.strictEqual(page.data.playLog[0].scoredRunners[0].playerName, '手动跑者', 'manual base runner should be carried in play log');
  page.undoLast();
  assert.strictEqual(page.data.homeScore, 0, 'undo should restore automatic base/run scoring');
  assert.strictEqual(page.data.baseSummary, '三垒', 'undo should restore previous runner state');
  assert.strictEqual(page.data.batting[0].RBI, 0, 'undo should restore RBI');
  assert.strictEqual(page.data.currentBatter.name, '一棒投手', 'undo should restore current batter');
  page.clearBases();

  page.incStat(tap({ key: '_1B' }));
  assert.strictEqual(page.data.baseSummary, '一垒：一棒投手', 'hit should put batter identity on base');
  page.incStat(tap({ key: 'HR' }));
  assert.strictEqual(page.data.homeScore, 2, 'home run with runner on first should score both runners');
  assert.strictEqual(page.data.batting[0].R, 1, 'scored base runner should receive R credit');
  assert.strictEqual(page.data.batting[1].R, 1, 'home run batter should receive R credit');
  assert.deepStrictEqual(page.data.playLog[0].scoredRunners.map(r => r.playerId), ['p1', 'p2']);
  page.undoLast();
  page.undoLast();
  assert.strictEqual(page.data.homeScore, 0, 'undo should restore identity-based runner scoring');
  page.clearBases();

  page.onAdjustmentPlayerChange(input('1'));
  page.onAdjustmentPositionChange(input('4'));
  page.onAdjustmentNoteInput(input('第 4 局换守 3B'));
  page.applyLineupAdjustment();
  assert.strictEqual(page.data.batting[1].pos, '3B', 'lineup adjustment should update player fielding position');
  assert(page.data.playLog[0].label.includes('阵容调整'), 'lineup adjustment should create a game log entry');

  page.incStat(tap({ key: 'R' }));
  page.incStat(tap({ key: '_2B' }));
  page.incStat(tap({ key: 'HR' }));
  page.incOpponentStat(tap({ key: 'R' }));
  page.incPitchStat(tap({ index: 0, key: 'OUT' }));
  page.incPitchStat(tap({ index: 0, key: 'OUT' }));
  page.incPitchStat(tap({ index: 0, key: 'SO' }));
  page.onMvpChange(input('1'));
  page.onMvpNoteInput(input('关键安打'));
  page.nextHalf();

  await page.saveGame();

  assert(savedPayload, 'saveGame should post a payload');
  assert.strictEqual(savedPayload.innings, 2, 'saved innings should come from the recorded linescore length');
  assert.strictEqual(savedPayload.linescore.home.length, 2, 'saved home linescore should include dynamically recorded innings');
  assert.strictEqual(savedPayload.linescore.away.length, 2, 'saved away linescore should include dynamically recorded innings');
  assert.strictEqual(savedPayload.homeScore, 3);
  assert.strictEqual(savedPayload.awayScore, 1);
  assert.strictEqual(savedPayload.homeTotals.R, 3);
  assert.strictEqual(savedPayload.homeTotals.H, 2);
  assert.strictEqual(savedPayload.awayTotals.R, 1);
  assert.strictEqual(savedPayload.batting[0]._2B, 1);
  assert.strictEqual(savedPayload.batting[1].pos, '3B');
  assert.strictEqual(savedPayload.batting[1].HR, 1);
  assert.strictEqual(savedPayload.batting[1].RBI, 2);
  assert.strictEqual(savedPayload.pitching[0].IP, '0.2');
  assert.strictEqual(savedPayload.pitching[0].SO, 1);
  assert.strictEqual(savedPayload.oppBatting[0].R, 1);
  assert.strictEqual(savedPayload.mvpPlayerName, '一棒投手');
  assert.strictEqual(savedPayload.mvpPlayerId, 'p1');
  assert(savedPayload.mvpNote.includes('关键安打'));
  assert(savedPayload.gameLog.length >= 4, 'save payload should include play-by-play gameLog');
  assert(savedPayload.gameLog.some(item => item.inningLabel.includes('下半局')), 'gameLog should include half-inning labels');
  assert(savedPayload.gameLog.every(item => item.gameId === savedPayload.id), 'gameLog should carry the saved game id');
  assert(savedPayload.gameLog.some(item => item.playerId === 'p1' && item.actionType === 'batting'), 'batting gameLog entries should keep player ids');
  assert(savedPayload.gameLog.some(item => item.playerId === 'p1' && item.actionType === 'pitching'), 'pitching gameLog entries should keep player ids');
  assert(savedPayload.gameLog.some(item => (item.scoredRunners || []).some(runner => runner.playerId === 'p1')), 'gameLog should keep scored runner ids');
  assert.strictEqual(savedPayload.metadata.source, 'mini_scorebook');
  assert.strictEqual(savedPayload.eventId, 'e_test');
  assert.strictEqual(savedPayload.metadata.gameId, savedPayload.id);
  assert.strictEqual(savedPayload.metadata.rosterSource, 'relay');
  assert.strictEqual(savedPayload.metadata.relatedEventId, 'e_test');
  assert.strictEqual(savedPayload.metadata.relatedTournamentId, 't_test');
  assert.strictEqual(savedPayload.metadata.rosterEventId, 'e_test');
  assert.strictEqual(savedPayload.metadata.rosterEventTitle, '测试比赛接龙');
  assert.deepStrictEqual(savedPayload.metadata.lineupPlayerIds, ['p1', 'p2']);
  assert(savedPayload.metadata.battingPlayerIds.includes('p1'), 'metadata should keep batting player ids');
  assert.strictEqual(savedPayload.metadata.mvpPlayerId, 'p1');

  assert.strictEqual(postCount, 1, 'first saveGame should post exactly once');
  assert.strictEqual(redirectCount, 1, 'first saveGame should redirect exactly once');
  assert(!storage.has(SNAPSHOT_KEY), 'successful save should clear the live snapshot');
  page.onUnload();
  assert(!storage.has(SNAPSHOT_KEY), 'unload after save should not rewrite the snapshot');

  // 双击保存只允许提交一次
  const page2 = createPage(pageDef);
  page2.onLoad();
  page2.incStat(tap({ key: 'R' }));
  await Promise.all([page2.saveGame(), page2.saveGame()]);
  assert.strictEqual(postCount, 2, 'double-tapping save should only post one game');
  assert.strictEqual(redirectCount, 2, 'double-tapping save should only redirect once');
  storage.delete(SNAPSHOT_KEY);

  // 误退后重进:确认恢复
  storage.set(SNAPSHOT_KEY, {
    draftKey: TEST_DRAFT_KEY,
    savedAt: 0,
    state: { homeScore: 5, awayScore: 2, playLog: [{ id: 'log_seed' }] },
  });
  modalAnswer = 'confirm';
  modalCalls = [];
  const page3 = createPage(pageDef);
  page3.onLoad();
  assert.strictEqual(modalCalls.length, 1, 'matching snapshot should prompt for restore');
  assert(modalCalls[0].content.includes('2:5'), 'restore prompt should describe the snapshot score');
  assert.strictEqual(page3.data.homeScore, 5, 'confirming restore should apply snapshot state');
  assert.strictEqual(page3.data.playLog.length, 1, 'confirming restore should bring back the play log');

  // 误退后重进:拒绝恢复则清快照
  storage.set(SNAPSHOT_KEY, {
    draftKey: TEST_DRAFT_KEY,
    savedAt: 0,
    state: { homeScore: 7, awayScore: 0, playLog: [] },
  });
  modalAnswer = 'cancel';
  modalCalls = [];
  const page4 = createPage(pageDef);
  page4.onLoad();
  assert.strictEqual(modalCalls.length, 1, 'matching snapshot should prompt before discarding');
  assert.strictEqual(page4.data.homeScore, 0, 'declining restore should keep a fresh game');
  assert(!storage.has(SNAPSHOT_KEY), 'declining restore should clear the stale snapshot');

  // 另一场比赛的快照不提示、直接丢弃
  storage.set(SNAPSHOT_KEY, {
    draftKey: 'e_other|2026-01-01|别队|Home|baseball',
    savedAt: 0,
    state: { homeScore: 9, awayScore: 9, playLog: [] },
  });
  modalCalls = [];
  const page5 = createPage(pageDef);
  page5.onLoad();
  assert.strictEqual(modalCalls.length, 0, 'snapshot from another game should not prompt');
  assert(!storage.has(SNAPSHOT_KEY), 'snapshot from another game should be discarded');
  assert.strictEqual(page5.data.homeScore, 0, 'mismatched snapshot should never leak into a new game');

  // onHide 应落地快照,保存前离开有兜底
  page5.incStat(tap({ key: 'R' }));
  storage.delete(SNAPSHOT_KEY);
  page5.onHide();
  assert(storage.has(SNAPSHOT_KEY), 'onHide should persist a recovery snapshot');

  console.log('Mini program score flow regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
