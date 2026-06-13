const api = require('../../../utils/request');
const { POSITIONS, createBatter, emptyLine, orionTeamName, sum } = require('../../../utils/baseball');
const { showError, toast } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');

const PITCH_DECISIONS = [
  { label: '无', value: '' },
  { label: '胜投', value: 'W' },
  { label: '败投', value: 'L' },
  { label: '救援成功', value: 'S' },
  { label: '中继', value: 'H' },
];

const HALF_OPTIONS = ['上半局', '下半局'];
const EMPTY_BASES = { first: false, second: false, third: false };
const BATTER_ACTION_LABELS = {
  _1B: '一垒安打',
  _2B: '二垒打',
  _3B: '三垒打',
  HR: '本垒打',
  RBI: '打点',
  R: '得分',
  BB: '四坏保送',
  SO: '三振',
  OUT: '出局',
  E: '守备失误',
};
const OPP_ACTION_LABELS = {
  _1B: '对手一垒安打',
  _2B: '对手二垒打',
  _3B: '对手三垒打',
  HR: '对手本垒打',
  RBI: '对手打点',
  R: '对手得分',
  BB: '对手四坏保送',
  SO: '对手三振',
  OUT: '对手出局',
  E: '对手失误',
};
const PLATE_APPEARANCE_KEYS = ['_1B', '_2B', '_3B', 'HR', 'BB', 'SO', 'OUT'];
const LIVE_SNAPSHOT_KEY = 'orionLiveScoreSnapshot';
// history 是撤销栈、positions/pitchDecisions 是常量、saving 是瞬时态,都不进恢复快照
const SNAPSHOT_EXCLUDED_KEYS = ['history', 'positions', 'pitchDecisions', 'saving'];

function draftSnapshotKey(draft) {
  if (!draft) return '';
  return [
    draft.rosterEventId || '',
    draft.date || '',
    draft.opponent || '',
    draft.venue || '',
    draft.sport || '',
  ].join('|');
}

function outsToIp(outs) {
  const total = Number(outs || 0);
  return `${Math.floor(total / 3)}.${total % 3}`;
}

function createPitcher(player) {
  return {
    playerId: player.id,
    name: player.name,
    outs: 0,
    IP: '0.0',
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    SO: 0,
    HR: 0,
    decision: '',
    decisionIndex: 0,
  };
}

function createOpponentBatting(opponent) {
  return {
    name: opponent || '对手',
    AB: 0,
    R: 0,
    H: 0,
    RBI: 0,
    BB: 0,
    SO: 0,
    _1B: 0,
    _2B: 0,
    _3B: 0,
    HR: 0,
    E: 0,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseSummary(bases) {
  const active = [
    ['first', '一垒'],
    ['second', '二垒'],
    ['third', '三垒'],
  ].reduce((items, [key, label]) => {
    const runner = bases[key];
    if (!runner) return items;
    const name = runnerName(runner);
    items.push(name ? `${label}：${name}` : label);
    return items;
  }, []);
  return active.length ? active.join('、') : '垒上无人';
}

function runnerName(runner) {
  if (!runner || runner === true) return '';
  return runner.playerName || runner.name || '';
}

function runnerFromBatter(row) {
  if (!row) return true;
  return {
    playerId: row.playerId || '',
    playerName: row.name || row.playerName || '',
    order: row.order || null,
    pos: row.pos || '',
  };
}

function runnerMeta(runner) {
  if (!runner) return null;
  if (runner === true) return { playerId: '', playerName: '手动跑者' };
  return {
    playerId: runner.playerId || runner.id || '',
    playerName: runner.playerName || runner.name || '跑者',
  };
}

function scoredRunnerList(runners) {
  return (runners || []).map(runnerMeta).filter(Boolean);
}

function buildOutDots(outs) {
  return [0, 1, 2].map(i => ({
    id: i,
    activeClass: i < Number(outs || 0) ? 'active' : '',
  }));
}

function ensureLineLength(line, inningIndex) {
  const next = (line || []).slice();
  const targetLength = Math.max(Number(inningIndex || 0) + 1, 1);
  while (next.length < targetLength) next.push(0);
  return next;
}

function normalizeLines(lineHome, lineAway, inningIndex = 0) {
  const targetIndex = Math.max(
    Number(inningIndex || 0),
    (lineHome || []).length - 1,
    (lineAway || []).length - 1,
    0
  );
  return {
    home: ensureLineLength(lineHome, targetIndex),
    away: ensureLineLength(lineAway, targetIndex),
    innings: targetIndex + 1,
  };
}

function buildGameMetadata(draft, batting, pitchers, gameId, mvpPlayer) {
  const lineup = draft.lineup || [];
  return {
    gameId: gameId || '',
    source: 'mini_scorebook',
    rosterSource: draft.rosterSource || 'manual',
    relatedEventId: draft.rosterEventId || '',
    rosterEventId: draft.rosterEventId || '',
    rosterEventTitle: draft.rosterEventTitle || '',
    relatedTournamentId: draft.tournamentId || '',
    relaySignupCount: Number(draft.relaySignupCount || 0),
    lineupPlayerIds: lineup.map(player => player.id).filter(Boolean),
    battingPlayerIds: (batting || []).map(row => row.playerId).filter(Boolean),
    pitchingPlayerIds: (pitchers || []).map(row => row.playerId).filter(Boolean),
    mvpPlayerId: (mvpPlayer && mvpPlayer.id) || '',
    savedFrom: 'wechat_miniprogram',
  };
}

function countRunners(bases) {
  return ['first', 'second', 'third'].reduce((total, base) => total + (bases[base] ? 1 : 0), 0);
}

function advanceBasesForOutcome(bases, key, batter) {
  const current = bases || EMPTY_BASES;
  const batterRunner = runnerFromBatter(batter);
  const next = { first: false, second: false, third: false };
  const scoredRunners = [];

  if (key === '_1B') {
    if (current.third) scoredRunners.push(current.third);
    next.third = current.second || false;
    next.second = current.first || false;
    next.first = batterRunner;
  } else if (key === '_2B') {
    if (current.third) scoredRunners.push(current.third);
    if (current.second) scoredRunners.push(current.second);
    next.third = current.first || false;
    next.second = batterRunner;
  } else if (key === '_3B') {
    ['third', 'second', 'first'].forEach(base => {
      if (current[base]) scoredRunners.push(current[base]);
    });
    next.third = batterRunner;
  } else if (key === 'HR') {
    ['third', 'second', 'first'].forEach(base => {
      if (current[base]) scoredRunners.push(current[base]);
    });
    scoredRunners.push(batterRunner);
  } else if (key === 'BB') {
    if (!current.first) {
      next.first = batterRunner;
      next.second = current.second || false;
      next.third = current.third || false;
    } else if (!current.second) {
      next.first = batterRunner;
      next.second = current.first;
      next.third = current.third || false;
    } else if (!current.third) {
      next.first = batterRunner;
      next.second = current.first;
      next.third = current.second;
    } else {
      scoredRunners.push(current.third);
      next.first = batterRunner;
      next.second = current.first;
      next.third = current.second;
    }
  } else {
    return { bases: current, runs: 0, scoredRunners: [] };
  }

  return { bases: next, runs: scoredRunners.length, scoredRunners };
}

function creditScoredRunnerRuns(batting, runners) {
  const counts = scoredRunnerList(runners).reduce((acc, runner) => {
    if (runner.playerId) acc[runner.playerId] = (acc[runner.playerId] || 0) + 1;
    return acc;
  }, {});
  if (!Object.keys(counts).length) return batting;
  return (batting || []).map(row => {
    const count = counts[row.playerId] || 0;
    return count ? { ...row, R: Number(row.R || 0) + count } : row;
  });
}

function situationPatch({ halfIndex = 0, outs = 0, bases = EMPTY_BASES, awayName = '', homeName = '' }) {
  const safeOuts = Math.max(0, Math.min(Number(outs || 0), 3));
  const halfLabel = HALF_OPTIONS[halfIndex] || HALF_OPTIONS[0];
  return {
    halfIndex,
    halfLabel,
    offenseName: halfIndex === 0 ? awayName : homeName,
    outs: safeOuts,
    outDots: buildOutDots(safeOuts),
    bases,
    baseSummary: baseSummary(bases),
    baseFirstClass: bases.first ? 'active' : '',
    baseSecondClass: bases.second ? 'active' : '',
    baseThirdClass: bases.third ? 'active' : '',
  };
}

Page({
  data: {
    draft: null,
    sportLabel: '',
    homeName: '',
    awayName: '',
    lineHome: [],
    lineAway: [],
    homeScore: 0,
    awayScore: 0,
    inning: 0,
    halfOptions: HALF_OPTIONS,
    halfIndex: 0,
    halfLabel: HALF_OPTIONS[0],
    offenseName: '',
    outs: 0,
    outDots: buildOutDots(0),
    bases: EMPTY_BASES,
    baseSummary: baseSummary(EMPTY_BASES),
    baseFirstClass: '',
    baseSecondClass: '',
    baseThirdClass: '',
    positions: POSITIONS,
    batting: [],
    currentIndex: 0,
    currentBatter: {},
    adjustmentPlayerIndex: 0,
    adjustmentPositionIndex: 0,
    adjustmentPositionLabel: POSITIONS[0],
    adjustmentNote: '',
    pitchers: [],
    pitcherOptions: [],
    pitcherIndex: 0,
    pitchDecisions: PITCH_DECISIONS,
    opponentBatting: createOpponentBatting('对手'),
    mvpOptions: [{ id: '', name: '不选择' }],
    mvpIndex: 0,
    mvpNote: '',
    gameNote: '',
    playLog: [],
    history: [],
    saving: false,
  },

  onLoad() {
    const draft = wx.getStorageSync('orionGameDraft');
    if (!draft) {
      toast('没有比赛草稿');
      return;
    }
    const orion = orionTeamName(draft.sport);
    const homeName = draft.venue === 'Home' ? orion : draft.opponent;
    const awayName = draft.venue === 'Home' ? draft.opponent : orion;
    const batting = (draft.lineup || []).map((p, i) => createBatter(p, i + 1));
    const pitcherOptions = draft.lineup || [];
    const firstPitcher = pitcherOptions.find(p => p.slot === 'P') || pitcherOptions[0];
    const pitchers = firstPitcher ? [createPitcher(firstPitcher)] : [];
    const firstPositionIndex = Math.max(POSITIONS.indexOf((batting[0] || {}).pos), 0);
    this.setData({
      draft,
      sportLabel: sportLabel(draft.sport),
      homeName,
      awayName,
      lineHome: emptyLine(draft.innings),
      lineAway: emptyLine(draft.innings),
      batting,
      currentBatter: batting[0] || {},
      adjustmentPlayerIndex: 0,
      adjustmentPositionIndex: firstPositionIndex,
      adjustmentPositionLabel: POSITIONS[firstPositionIndex],
      pitcherOptions,
      pitchers,
      opponentBatting: createOpponentBatting(draft.opponent),
      mvpOptions: [{ id: '', name: '不选择' }].concat(draft.lineup || []),
      ...situationPatch({ halfIndex: 0, outs: 0, bases: clone(EMPTY_BASES), awayName, homeName }),
    });
    if (typeof wx.enableAlertBeforeUnload === 'function') {
      try {
        wx.enableAlertBeforeUnload({ message: '现场记录尚未保存，离开页面可能丢失本场记分。' });
      } catch (err) { /* 基础库不支持时静默降级,仍有快照兜底 */ }
    }
    this.restoreSnapshotIfAny(draft);
  },

  restoreSnapshotIfAny(draft) {
    if (typeof wx.getStorageSync !== 'function') return;
    let snapshot = null;
    try { snapshot = wx.getStorageSync(LIVE_SNAPSHOT_KEY); } catch (err) { return; }
    if (!snapshot || !snapshot.state) return;
    if (snapshot.draftKey !== draftSnapshotKey(draft)) {
      // 旧快照属于另一场比赛,直接丢弃,避免错场恢复
      this.clearSnapshot();
      return;
    }
    if (typeof wx.showModal !== 'function') return;
    const state = snapshot.state;
    const logCount = (state.playLog || []).length;
    wx.showModal({
      title: '恢复未保存的记分',
      content: `检测到本场尚未保存的现场记录（比分 ${state.awayScore || 0}:${state.homeScore || 0}，${logCount} 条记录），是否恢复？`,
      confirmText: '恢复',
      cancelText: '不恢复',
      success: res => {
        if (res.confirm) {
          this.setData(state);
        } else {
          this.clearSnapshot();
        }
      },
    });
  },

  persistSnapshot() {
    if (typeof wx.setStorageSync !== 'function') return;
    if (!this.data.draft || this._saved) return;
    const state = {};
    Object.keys(this.data).forEach(key => {
      if (SNAPSHOT_EXCLUDED_KEYS.indexOf(key) >= 0) return;
      state[key] = this.data[key];
    });
    try {
      wx.setStorageSync(LIVE_SNAPSHOT_KEY, {
        draftKey: draftSnapshotKey(this.data.draft),
        savedAt: Date.now(),
        state,
      });
    } catch (err) { /* 本地存储失败不阻塞现场记录 */ }
  },

  clearSnapshot() {
    if (typeof wx.removeStorageSync !== 'function') return;
    try { wx.removeStorageSync(LIVE_SNAPSHOT_KEY); } catch (err) { /* 忽略清理失败 */ }
  },

  onHide() {
    this.persistSnapshot();
  },

  onUnload() {
    this.persistSnapshot();
  },

  remember(label) {
    const history = this.data.history.slice(-19);
    history.push({
      label,
      lineHome: clone(this.data.lineHome),
      lineAway: clone(this.data.lineAway),
      homeScore: this.data.homeScore,
      awayScore: this.data.awayScore,
      inning: this.data.inning,
      halfIndex: this.data.halfIndex,
      halfLabel: this.data.halfLabel,
      offenseName: this.data.offenseName,
      outs: this.data.outs,
      outDots: clone(this.data.outDots),
      bases: clone(this.data.bases),
      baseSummary: this.data.baseSummary,
      baseFirstClass: this.data.baseFirstClass,
      baseSecondClass: this.data.baseSecondClass,
      baseThirdClass: this.data.baseThirdClass,
      batting: clone(this.data.batting),
      currentIndex: this.data.currentIndex,
      currentBatter: clone(this.data.currentBatter),
      pitchers: clone(this.data.pitchers),
      opponentBatting: clone(this.data.opponentBatting),
      playLog: clone(this.data.playLog),
    });
    this.setData({ history });
  },

  appendPlay(label, context = {}) {
    const entry = {
      id: `log_${Date.now()}_${this.data.playLog.length}`,
      inningLabel: `第 ${this.data.inning + 1} 局${this.data.halfLabel}`,
      offenseName: this.data.offenseName,
      label,
      playerId: context.playerId || '',
      playerName: context.playerName || '',
      actionKey: context.actionKey || '',
      actionType: context.actionType || '',
      team: context.team || '',
      scoredRunners: scoredRunnerList(context.scoredRunners || []),
      scoredRunnerNames: scoredRunnerList(context.scoredRunners || []).map(runner => runner.playerName).filter(Boolean).join('、'),
      score: `${this.data.awayScore}:${this.data.homeScore}`,
      outs: this.data.outs,
      bases: this.data.baseSummary,
    };
    this.setData({ playLog: [entry].concat(this.data.playLog).slice(0, 120) });
    this.persistSnapshot();
  },

  undoLast() {
    const history = this.data.history.slice();
    const last = history.pop();
    if (!last) return toast('没有可撤销操作');
    this.setData({
      lineHome: last.lineHome,
      lineAway: last.lineAway,
      homeScore: last.homeScore,
      awayScore: last.awayScore,
      inning: last.inning,
      halfIndex: last.halfIndex,
      halfLabel: last.halfLabel,
      offenseName: last.offenseName,
      outs: last.outs,
      outDots: last.outDots,
      bases: last.bases,
      baseSummary: last.baseSummary,
      baseFirstClass: last.baseFirstClass,
      baseSecondClass: last.baseSecondClass,
      baseThirdClass: last.baseThirdClass,
      batting: last.batting,
      currentIndex: last.currentIndex,
      currentBatter: last.currentBatter,
      pitchers: last.pitchers,
      opponentBatting: last.opponentBatting,
      playLog: last.playLog,
      history,
    });
    this.persistSnapshot();
  },

  addRunToTeam(team) {
    this.addRunsToTeam(team, 1);
  },

  addRunsToTeam(team, count) {
    const runCount = Math.max(Number(count || 0), 0);
    if (!runCount) return;
    const key = team === 'home' ? 'lineHome' : 'lineAway';
    const line = ensureLineLength(this.data[key], this.data.inning);
    line[this.data.inning] = Number(line[this.data.inning] || 0) + runCount;
    const lineHome = key === 'lineHome' ? line : ensureLineLength(this.data.lineHome, this.data.inning);
    const lineAway = key === 'lineAway' ? line : ensureLineLength(this.data.lineAway, this.data.inning);
    this.setData({
      lineHome,
      lineAway,
      homeScore: lineHome.reduce((a, b) => a + Number(b || 0), 0),
      awayScore: lineAway.reduce((a, b) => a + Number(b || 0), 0),
    });
  },

  orionTeamKey() {
    return this.data.draft && this.data.draft.venue === 'Home' ? 'home' : 'away';
  },

  addRun(e) {
    const team = e.currentTarget.dataset.team;
    this.remember(`${team === 'home' ? this.data.homeName : this.data.awayName} 得分`);
    this.addRunToTeam(team);
    this.appendPlay(`${team === 'home' ? this.data.homeName : this.data.awayName} 得分 +1`);
  },

  recalcScores() {
    this.setData({
      homeScore: this.data.lineHome.reduce((a, b) => a + Number(b || 0), 0),
      awayScore: this.data.lineAway.reduce((a, b) => a + Number(b || 0), 0),
    });
  },

  nextInning() {
    const next = this.data.inning + 1;
    this.setData({
      inning: next,
      lineHome: ensureLineLength(this.data.lineHome, next),
      lineAway: ensureLineLength(this.data.lineAway, next),
    });
    this.persistSnapshot();
  },

  prevInning() {
    const prev = Math.max(this.data.inning - 1, 0);
    this.setData({ inning: prev });
    this.persistSnapshot();
  },

  onHalfChange(e) {
    const halfIndex = Number(e.detail.value || 0);
    this.setData(situationPatch({
      halfIndex,
      outs: this.data.outs,
      bases: this.data.bases,
      awayName: this.data.awayName,
      homeName: this.data.homeName,
    }));
    this.persistSnapshot();
  },

  nextHalf() {
    this.remember('切换半局');
    const nextHalfIndex = this.data.halfIndex === 0 ? 1 : 0;
    const nextInning = this.data.halfIndex === 0
      ? this.data.inning
      : this.data.inning + 1;
    this.setData({
      inning: nextInning,
      lineHome: ensureLineLength(this.data.lineHome, nextInning),
      lineAway: ensureLineLength(this.data.lineAway, nextInning),
      ...situationPatch({
        halfIndex: nextHalfIndex,
        outs: 0,
        bases: clone(EMPTY_BASES),
        awayName: this.data.awayName,
        homeName: this.data.homeName,
      }),
    });
    this.appendPlay(`进入第 ${nextInning + 1} 局${HALF_OPTIONS[nextHalfIndex]}`);
  },

  addOut() {
    this.remember('出局数 +1');
    this.setOuts(Number(this.data.outs || 0) + 1);
    this.appendPlay('手动记录出局 +1');
  },

  clearOuts() {
    this.remember('清零出局数');
    this.setOuts(0);
  },

  setOuts(outs) {
    this.setData(situationPatch({
      halfIndex: this.data.halfIndex,
      outs,
      bases: this.data.bases,
      awayName: this.data.awayName,
      homeName: this.data.homeName,
    }));
    if (Number(outs || 0) >= 3) toast('三出局，可切换半局');
    this.persistSnapshot();
  },

  toggleBase(e) {
    const base = e.currentTarget.dataset.base;
    if (!base) return;
    this.remember('调整垒位');
    const bases = { ...this.data.bases, [base]: !this.data.bases[base] };
    this.setData(situationPatch({
      halfIndex: this.data.halfIndex,
      outs: this.data.outs,
      bases,
      awayName: this.data.awayName,
      homeName: this.data.homeName,
    }));
    this.persistSnapshot();
  },

  clearBases() {
    this.remember('清空垒位');
    this.setData(situationPatch({
      halfIndex: this.data.halfIndex,
      outs: this.data.outs,
      bases: clone(EMPTY_BASES),
      awayName: this.data.awayName,
      homeName: this.data.homeName,
    }));
    this.persistSnapshot();
  },

  prevBatter() {
    if (!this.data.batting.length) return;
    const currentIndex = (this.data.currentIndex + this.data.batting.length - 1) % this.data.batting.length;
    this.setData({ currentIndex, currentBatter: this.data.batting[currentIndex] });
  },

  nextBatter() {
    if (!this.data.batting.length) return;
    const currentIndex = (this.data.currentIndex + 1) % this.data.batting.length;
    this.setData({ currentIndex, currentBatter: this.data.batting[currentIndex] });
  },

  selectBatter(index) {
    if (!this.data.batting.length) return;
    const currentIndex = Math.max(0, Math.min(Number(index || 0), this.data.batting.length - 1));
    this.setData({ currentIndex, currentBatter: this.data.batting[currentIndex] });
  },

  onBatterChange(e) {
    this.selectBatter(Number(e.detail.value || 0));
  },

  selectBatterRow(e) {
    this.selectBatter(Number(e.currentTarget.dataset.index || 0));
  },

  onAdjustmentPlayerChange(e) {
    const adjustmentPlayerIndex = Number(e.detail.value || 0);
    const player = this.data.batting[adjustmentPlayerIndex] || {};
    const adjustmentPositionIndex = Math.max(POSITIONS.indexOf(player.pos), 0);
    this.setData({
      adjustmentPlayerIndex,
      adjustmentPositionIndex,
      adjustmentPositionLabel: POSITIONS[adjustmentPositionIndex],
    });
  },

  onAdjustmentPositionChange(e) {
    const adjustmentPositionIndex = Number(e.detail.value || 0);
    this.setData({
      adjustmentPositionIndex,
      adjustmentPositionLabel: POSITIONS[adjustmentPositionIndex] || POSITIONS[0],
    });
  },

  onAdjustmentNoteInput(e) {
    this.setData({ adjustmentNote: e.detail.value });
  },

  applyLineupAdjustment() {
    if (!this.data.batting.length) return toast('没有可调整球员');
    const index = Math.max(0, Math.min(Number(this.data.adjustmentPlayerIndex || 0), this.data.batting.length - 1));
    const newPos = POSITIONS[this.data.adjustmentPositionIndex] || POSITIONS[0];
    const batting = this.data.batting.slice();
    const row = { ...batting[index] };
    const oldPos = row.pos || '未设守位';
    const note = String(this.data.adjustmentNote || '').trim();
    if (oldPos === newPos && !note) {
      toast('守位没有变化');
      return;
    }
    this.remember(`阵容调整 ${row.name || '球员'}`);
    row.pos = newPos;
    batting[index] = row;
    const patch = {
      batting,
      adjustmentPlayerIndex: index,
      adjustmentPositionIndex: POSITIONS.indexOf(newPos),
      adjustmentPositionLabel: newPos,
      adjustmentNote: '',
    };
    if (index === this.data.currentIndex) patch.currentBatter = row;
    this.setData(patch);
    this.appendPlay(`阵容调整：${row.name || '球员'} ${oldPos} -> ${newPos}${note ? `；${note}` : ''}`, {
      playerId: row.playerId,
      playerName: row.name,
      actionKey: 'lineup_adjustment',
      actionType: 'lineup',
      team: 'orion',
    });
  },

  advanceBatterAfterPlateAppearance(key, batting) {
    if (!PLATE_APPEARANCE_KEYS.includes(key) || !batting.length) return;
    const currentIndex = (this.data.currentIndex + 1) % batting.length;
    this.setData({ currentIndex, currentBatter: batting[currentIndex] });
  },

  applyOutcomeBases(key, team, batter) {
    const result = advanceBasesForOutcome(this.data.bases, key, batter);
    if (!['_1B', '_2B', '_3B', 'HR', 'BB'].includes(key)) return result;
    if (result.runs) this.addRunsToTeam(team, result.runs);
    this.setData(situationPatch({
      halfIndex: this.data.halfIndex,
      outs: this.data.outs,
      bases: result.bases,
      awayName: this.data.awayName,
      homeName: this.data.homeName,
    }));
    return result;
  },

  incStat(e) {
    const key = e.currentTarget.dataset.key;
    this.remember(`${this.data.currentBatter.name || '球员'} ${key}`);
    let batting = this.data.batting.slice();
    const i = this.data.currentIndex;
    const row = { ...batting[i] };
    let outcomeRuns = 0;
    let scoredRunners = [];
    row[key] = Number(row[key] || 0) + 1;
    if (['_1B', '_2B', '_3B', 'HR'].includes(key)) {
      row.H = Number(row.H || 0) + 1;
      row.AB = Number(row.AB || 0) + 1;
    }
    if (['_1B', '_2B', '_3B', 'HR', 'BB'].includes(key)) {
      const outcome = this.applyOutcomeBases(key, this.orionTeamKey(), row);
      outcomeRuns = Number(outcome.runs || 0);
      scoredRunners = outcome.scoredRunners || [];
      if (outcomeRuns) row.RBI = Number(row.RBI || 0) + outcomeRuns;
    }
    if (key === 'SO') row.AB = Number(row.AB || 0) + 1;
    if (key === 'OUT') row.AB = Number(row.AB || 0) + 1;
    batting[i] = row;
    batting = creditScoredRunnerRuns(batting, scoredRunners);
    this.setData({ batting, currentBatter: row });
    if (key === 'R') this.addRunToTeam(this.orionTeamKey());
    if (key === 'SO' || key === 'OUT') this.setOuts(Number(this.data.outs || 0) + 1);
    const runnerSuffix = scoredRunnerList(scoredRunners).map(runner => runner.playerName).filter(Boolean).join('、');
    const suffix = outcomeRuns ? `，带回 ${outcomeRuns} 分${runnerSuffix ? `（${runnerSuffix} 得分）` : ''}` : '';
    this.appendPlay(`${row.name || '球员'}：${BATTER_ACTION_LABELS[key] || key}${suffix}`, {
      playerId: row.playerId,
      playerName: row.name,
      actionKey: key,
      actionType: 'batting',
      team: 'orion',
      scoredRunners,
    });
    this.advanceBatterAfterPlateAppearance(key, batting);
  },

  onPitcherChange(e) {
    this.setData({ pitcherIndex: Number(e.detail.value || 0) });
  },

  addPitcher() {
    const player = this.data.pitcherOptions[this.data.pitcherIndex];
    if (!player) return toast('没有可选投手');
    if (this.data.pitchers.some(p => p.playerId === player.id)) {
      return toast('投手已在记录中');
    }
    this.remember(`加入投手 ${player.name}`);
    this.setData({ pitchers: this.data.pitchers.concat(createPitcher(player)) });
  },

  incPitchStat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.remember(`${(this.data.pitchers[index] || {}).name || '投手'} ${key}`);
    const pitchers = this.data.pitchers.slice();
    const row = { ...pitchers[index] };
    if (!row) return;
    if (key === 'OUT') {
      row.outs = Number(row.outs || 0) + 1;
      row.IP = outsToIp(row.outs);
    } else {
      row[key] = Number(row[key] || 0) + 1;
    }
    pitchers[index] = row;
    this.setData({ pitchers });
    this.appendPlay(`${row.name || '投手'}：${key === 'OUT' ? '投球出局' : key}`, {
      playerId: row.playerId,
      playerName: row.name,
      actionKey: key,
      actionType: 'pitching',
      team: 'orion',
    });
  },

  onDecisionChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const decisionIndex = Number(e.detail.value || 0);
    const option = this.data.pitchDecisions[decisionIndex] || PITCH_DECISIONS[0];
    const pitchers = this.data.pitchers.slice();
    pitchers[index] = {
      ...pitchers[index],
      decisionIndex,
      decision: option.value,
    };
    this.setData({ pitchers });
  },

  incOpponentStat(e) {
    const key = e.currentTarget.dataset.key;
    this.remember(`对手 ${key}`);
    const row = { ...this.data.opponentBatting };
    let outcomeRuns = 0;
    row[key] = Number(row[key] || 0) + 1;
    if (['_1B', '_2B', '_3B', 'HR'].includes(key)) {
      row.H = Number(row.H || 0) + 1;
      row.AB = Number(row.AB || 0) + 1;
    }
    if (['_1B', '_2B', '_3B', 'HR', 'BB'].includes(key)) {
      const team = this.orionTeamKey() === 'home' ? 'away' : 'home';
      const outcome = this.applyOutcomeBases(key, team, null);
      outcomeRuns = Number(outcome.runs || 0);
      if (outcomeRuns) {
        row.R = Number(row.R || 0) + outcomeRuns;
        row.RBI = Number(row.RBI || 0) + outcomeRuns;
      }
    }
    if (key === 'SO') row.AB = Number(row.AB || 0) + 1;
    if (key === 'OUT') row.AB = Number(row.AB || 0) + 1;
    if (key === 'R') {
      const team = this.orionTeamKey() === 'home' ? 'away' : 'home';
      this.addRunToTeam(team);
    }
    this.setData({ opponentBatting: row });
    if (key === 'SO' || key === 'OUT') this.setOuts(Number(this.data.outs || 0) + 1);
    const suffix = outcomeRuns ? `，带回 ${outcomeRuns} 分` : '';
    this.appendPlay(`${OPP_ACTION_LABELS[key] || `对手 ${key}`}${suffix}`);
  },

  onMvpChange(e) {
    this.setData({ mvpIndex: Number(e.detail.value || 0) });
  },

  onMvpNoteInput(e) {
    this.setData({ mvpNote: e.detail.value });
  },

  onGameNoteInput(e) {
    this.setData({ gameNote: e.detail.value });
  },

  teamTotals(team) {
    const orionIsHome = this.data.draft && this.data.draft.venue === 'Home';
    const isOrion = team === (orionIsHome ? 'home' : 'away');
    const batting = this.data.batting;
    const opponent = this.data.opponentBatting;
    const score = team === 'home' ? this.data.homeScore : this.data.awayScore;
    if (isOrion) {
      return { R: score, H: sum(batting, 'H'), E: sum(batting, 'E') };
    }
    return { R: score, H: Number(opponent.H || 0), E: Number(opponent.E || 0) };
  },

  async saveGame() {
    if (this.data.saving) return;
    if (!getApp().globalData.user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const draft = this.data.draft;
    const normalizedLines = normalizeLines(this.data.lineHome, this.data.lineAway, this.data.inning);
    this.setData({ saving: true });
    try {
      const gameId = `g_mini_${Date.now()}`;
      const gameLog = this.data.playLog.slice().reverse().map(item => ({
        ...item,
        gameId,
        relatedEventId: draft.rosterEventId || '',
      }));
      const mvpPlayer = this.data.mvpOptions[this.data.mvpIndex] || {};
      const payload = {
        id: gameId,
        tournamentId: draft.tournamentId || null,
        eventId: draft.rosterEventId || null,
        sport: draft.sport,
        season: draft.date ? draft.date.slice(0, 4) : '',
        seasonName: draft.tournamentName || '小程序实时记录',
        date: draft.date,
        venue: draft.venue,
        innings: normalizedLines.innings,
        home: this.data.homeName,
        away: this.data.awayName,
        homeScore: this.data.homeScore,
        awayScore: this.data.awayScore,
        linescore: {
          home: normalizedLines.home,
          away: normalizedLines.away,
        },
        homeTotals: this.teamTotals('home'),
        awayTotals: this.teamTotals('away'),
        batting: this.data.batting,
        pitching: this.data.pitchers.map(p => ({
          playerId: p.playerId,
          name: p.name,
          IP: p.IP,
          H: Number(p.H || 0),
          R: Number(p.R || 0),
          ER: Number(p.ER || 0),
          BB: Number(p.BB || 0),
          SO: Number(p.SO || 0),
          HR: Number(p.HR || 0),
          decision: p.decision || '',
        })),
        oppBatting: [this.data.opponentBatting],
        oppPitching: [],
        gameLog,
        metadata: buildGameMetadata(draft, this.data.batting, this.data.pitchers, gameId, mvpPlayer),
        mvpPlayerName: mvpPlayer.id ? (mvpPlayer.name || '') : '',
        mvpPlayerId: mvpPlayer.id || '',
        mvpNote: [this.data.mvpNote, this.data.gameNote].filter(Boolean).join('\n'),
        isAggregate: false,
      };
      const res = await api.post('/games', payload);
      this._saved = true;
      this.clearSnapshot();
      if (typeof wx.disableAlertBeforeUnload === 'function') {
        try { wx.disableAlertBeforeUnload(); } catch (err) { /* 忽略 */ }
      }
      toast('已保存');
      wx.redirectTo({ url: `/pages/games/game-detail/game-detail?id=${res.game.id}` });
    } catch (err) {
      showError(err, '保存失败，可能需要数据组权限');
    } finally {
      this.setData({ saving: false });
    }
  },
});
