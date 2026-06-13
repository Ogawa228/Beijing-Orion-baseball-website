const api = require('../../../utils/request');
const { showError, toast } = require('../../../utils/format');

const battingFields = ['AB', 'R', 'H', '_1B', '_2B', '_3B', 'HR', 'RBI', 'BB', 'SO', 'E'];
const pitchingFields = ['H', 'R', 'ER', 'BB', 'SO', 'HR'];
const TOURNAMENT_PAGE_LIMIT = 30;

Page({
  data: {
    id: '',
    loading: true,
    saving: false,
    canEditGame: false,
    canDeleteGame: false,
    game: null,
    tournaments: [],
    tournamentOptions: [{ id: '', label: '不关联赛事' }],
    tournamentIndex: 0,
    tournamentLabel: '不关联赛事',
    tournamentHasMore: false,
    tournamentNextOffset: 0,
    loadingMoreTournaments: false,
    cover: '',
    coverUploadText: '',
    uploadingCover: false,
    date: '',
    venue: '',
    away: '',
    home: '',
    awayScore: '',
    homeScore: '',
    awayH: '',
    awayE: '',
    homeH: '',
    homeE: '',
    mvpPlayerName: '',
    mvpPlayerId: '',
    mvpOptions: [{ id: '', label: '不选择 MVP', name: '' }],
    mvpIndex: 0,
    mvpLabel: '不选择 MVP',
    mvpNote: '',
    revisionReason: '',
    battingRows: [],
    battingOptions: [{ label: '暂无本队打者' }],
    battingIndex: 0,
    battingLabel: '暂无本队打者',
    currentBatting: null,
    pitchingRows: [],
    pitchingOptions: [{ label: '暂无本队投手' }],
    pitchingIndex: 0,
    pitchingLabel: '暂无本队投手',
    currentPitching: null,
    deleteConfirmText: '',
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [meRes, gameRes, tournamentsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get(`/games/${this.data.id}`),
        fetchTournamentPage(0).catch(() => ({ tournaments: [], hasMore: false, nextOffset: 0 })),
      ]);
      const user = meRes.user || null;
      const canEditGame = hasPermission(user, 'games:revise');
      const canDeleteGame = hasPermission(user, 'destructive:delete');
      if (!canEditGame) {
        this.setData({ canEditGame: false, loading: false });
        return toast('暂无比赛修订权限');
      }
      const game = gameRes.game || {};
      const firstPageTournaments = tournamentsRes.tournaments || [];
      let tournaments = firstPageTournaments;
      const currentTournamentId = game.tournamentId || '';
      if (currentTournamentId && !firstPageTournaments.some(tournament => tournament.id === currentTournamentId)) {
        const detailRes = await api.get(`/tournaments/${currentTournamentId}`).catch(() => ({ tournament: null }));
        if (detailRes.tournament) tournaments = mergeTournamentsById([detailRes.tournament], firstPageTournaments);
      }
      const tournamentOptions = buildTournamentOptions(tournaments);
      const tournamentIndex = pickTournamentIndex(tournamentOptions, game.tournamentId || '');
      const battingRows = cloneRows(game.batting || []);
      const pitchingRows = cloneRows(game.pitching || []);
      const battingOptions = buildRowOptions(battingRows, '暂无本队打者');
      const pitchingOptions = buildRowOptions(pitchingRows, '暂无本队投手');
      const mvpOptions = buildMvpOptions(battingRows, pitchingRows, game.mvpPlayerName || '');
      const mvpIndex = pickMvpIndex(mvpOptions, game.mvpPlayerId || '', game.mvpPlayerName || '');
      const mvpOption = mvpOptions[mvpIndex] || mvpOptions[0];
      this.setData({
        canEditGame,
        canDeleteGame,
        game,
        tournaments,
        tournamentOptions,
        tournamentIndex,
        tournamentLabel: tournamentOptions[tournamentIndex].label,
        tournamentHasMore: !!tournamentsRes.hasMore,
        tournamentNextOffset: normalizeNextOffset(tournamentsRes.nextOffset, firstPageTournaments.length),
        cover: game.cover || '',
        coverUploadText: '',
        date: game.date || '',
        venue: game.venue || '',
        away: game.away || '',
        home: game.home || '',
        awayScore: valueText(game.awayScore),
        homeScore: valueText(game.homeScore),
        awayH: valueText(game.awayTotals?.H),
        awayE: valueText(game.awayTotals?.E),
        homeH: valueText(game.homeTotals?.H),
        homeE: valueText(game.homeTotals?.E),
        mvpPlayerName: mvpOption.name || game.mvpPlayerName || '',
        mvpPlayerId: mvpOption.id || game.mvpPlayerId || '',
        mvpOptions,
        mvpIndex,
        mvpLabel: mvpOption.label,
        mvpNote: game.mvpNote || '',
        revisionReason: '',
        battingRows,
        battingOptions,
        battingIndex: 0,
        battingLabel: battingOptions[0].label,
        currentBatting: battingRows[0] || null,
        pitchingRows,
        pitchingOptions,
        pitchingIndex: 0,
        pitchingLabel: pitchingOptions[0].label,
        currentPitching: pitchingRows[0] || null,
        deleteConfirmText: '',
      });
    } catch (err) {
      showError(err, '修订页加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  onTournamentChange(e) {
    const tournamentIndex = Number(e.detail.value);
    const option = this.data.tournamentOptions[tournamentIndex] || this.data.tournamentOptions[0];
    this.setData({ tournamentIndex, tournamentLabel: option.label });
  },

  async loadMoreTournaments() {
    if (!this.data.canEditGame || this.data.loadingMoreTournaments || !this.data.tournamentHasMore) return;
    const selected = this.data.tournamentOptions[this.data.tournamentIndex] || {};
    const selectedId = selected.id || '';
    const offset = this.data.tournamentNextOffset || Math.max(0, (this.data.tournamentOptions || []).length - 1);
    this.setData({ loadingMoreTournaments: true });
    try {
      const res = await fetchTournamentPage(offset);
      const tournaments = mergeTournamentsById(this.data.tournaments || [], res.tournaments || []);
      const tournamentOptions = buildTournamentOptions(tournaments);
      const selectedIndex = selectedId
        ? tournamentOptions.findIndex(option => option.id === selectedId)
        : this.data.tournamentIndex;
      const tournamentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const option = tournamentOptions[tournamentIndex] || tournamentOptions[0];
      this.setData({
        tournaments,
        tournamentOptions,
        tournamentIndex,
        tournamentLabel: option.label,
        tournamentHasMore: !!res.hasMore,
        tournamentNextOffset: normalizeNextOffset(res.nextOffset, offset + (res.tournaments || []).length),
      });
    } catch (err) {
      showError(err, '赛事加载失败');
    } finally {
      this.setData({ loadingMoreTournaments: false });
    }
  },

  async chooseCoverImage() {
    if (!this.data.canEditGame || this.data.uploadingCover) return;
    this.setData({ uploadingCover: true, coverUploadText: '选择封面图中...' });
    try {
      const file = await chooseImageFile();
      if (!file) {
        this.setData({ coverUploadText: '' });
        return;
      }
      const filePath = file.tempFilePath || file.path || '';
      const fileName = file.name || filePath.split('/').pop() || `game-cover-${Date.now()}.jpg`;
      const fileBase64 = await readFileBase64(filePath);
      this.setData({ coverUploadText: '上传 COS 中...' });
      const res = await api.post('/upload/base64', {
        kind: 'game',
        fileName,
        contentType: inferImageContentType(fileName, filePath),
        fileBase64,
      });
      this.setData({
        cover: res.url || '',
        coverUploadText: '已上传封面图',
      });
      toast('封面已上传');
    } catch (err) {
      showError(err, '封面上传失败');
      this.setData({ coverUploadText: '上传失败，可稍后重试' });
    } finally {
      this.setData({ uploadingCover: false });
    }
  },

  onCoverInput(e) { this.setData({ cover: e.detail.value }); },

  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onVenueInput(e) { this.setData({ venue: e.detail.value }); },
  onAwayInput(e) { this.setData({ away: e.detail.value }); },
  onHomeInput(e) { this.setData({ home: e.detail.value }); },
  onAwayScoreInput(e) { this.setData({ awayScore: e.detail.value }); },
  onHomeScoreInput(e) { this.setData({ homeScore: e.detail.value }); },
  onAwayHInput(e) { this.setData({ awayH: e.detail.value }); },
  onAwayEInput(e) { this.setData({ awayE: e.detail.value }); },
  onHomeHInput(e) { this.setData({ homeH: e.detail.value }); },
  onHomeEInput(e) { this.setData({ homeE: e.detail.value }); },
  onMvpChange(e) {
    const mvpIndex = Number(e.detail.value);
    const option = this.data.mvpOptions[mvpIndex] || this.data.mvpOptions[0];
    this.setData({
      mvpIndex,
      mvpLabel: option.label,
      mvpPlayerName: option.name || '',
      mvpPlayerId: option.id || '',
    });
  },
  onMvpPlayerInput(e) {
    const mvpPlayerName = e.detail.value;
    this.setData({
      mvpPlayerName,
      mvpPlayerId: inferMvpPlayerId(mvpPlayerName, this.data.battingRows, this.data.pitchingRows),
    });
  },
  onMvpNoteInput(e) { this.setData({ mvpNote: e.detail.value }); },
  onRevisionReasonInput(e) { this.setData({ revisionReason: e.detail.value }); },
  onDeleteConfirmInput(e) { this.setData({ deleteConfirmText: e.detail.value }); },

  onBattingChange(e) {
    const battingIndex = Number(e.detail.value);
    const option = this.data.battingOptions[battingIndex] || this.data.battingOptions[0];
    this.setData({
      battingIndex,
      battingLabel: option.label,
      currentBatting: this.data.battingRows[battingIndex] || null,
    });
  },

  onBattingFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !this.data.currentBatting) return;
    this.setData({ currentBatting: { ...this.data.currentBatting, [field]: e.detail.value } });
  },

  saveCurrentBattingRow() {
    if (!this.data.currentBatting) return toast('暂无本队打者可修订');
    const rows = cloneRows(this.data.battingRows);
    rows[this.data.battingIndex] = normalizeBattingRow(this.data.currentBatting);
    this.setData({
      battingRows: rows,
      battingOptions: buildRowOptions(rows, '暂无本队打者'),
      currentBatting: rows[this.data.battingIndex],
    });
    toast('打击行已暂存');
  },

  onPitchingChange(e) {
    const pitchingIndex = Number(e.detail.value);
    const option = this.data.pitchingOptions[pitchingIndex] || this.data.pitchingOptions[0];
    this.setData({
      pitchingIndex,
      pitchingLabel: option.label,
      currentPitching: this.data.pitchingRows[pitchingIndex] || null,
    });
  },

  onPitchingFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !this.data.currentPitching) return;
    this.setData({ currentPitching: { ...this.data.currentPitching, [field]: e.detail.value } });
  },

  saveCurrentPitchingRow() {
    if (!this.data.currentPitching) return toast('暂无本队投手可修订');
    const rows = cloneRows(this.data.pitchingRows);
    rows[this.data.pitchingIndex] = normalizePitchingRow(this.data.currentPitching);
    this.setData({
      pitchingRows: rows,
      pitchingOptions: buildRowOptions(rows, '暂无本队投手'),
      currentPitching: rows[this.data.pitchingIndex],
    });
    toast('投手行已暂存');
  },

  async saveGame() {
    if (!this.data.canEditGame || this.data.saving) return;
    const reason = String(this.data.revisionReason || '').trim();
    if (!reason) return toast('请填写修订原因');
    const tournament = selectedTournament(this.data);
    const battingRows = commitCurrentRow(this.data.battingRows, this.data.battingIndex, this.data.currentBatting, normalizeBattingRow);
    const pitchingRows = commitCurrentRow(this.data.pitchingRows, this.data.pitchingIndex, this.data.currentPitching, normalizePitchingRow);
    const awayScore = numberOrZero(this.data.awayScore);
    const homeScore = numberOrZero(this.data.homeScore);
    const payload = {
      tournamentId: tournament ? tournament.id : null,
      season: tournament ? (tournament.season || '') : '',
      seasonName: tournament ? (tournament.name || '') : '',
      cover: String(this.data.cover || '').trim(),
      date: this.data.date || null,
      venue: String(this.data.venue || '').trim(),
      away: String(this.data.away || '').trim(),
      home: String(this.data.home || '').trim(),
      awayScore,
      homeScore,
      awayTotals: {
        ...(this.data.game?.awayTotals || {}),
        R: awayScore,
        H: numberOrZero(this.data.awayH),
        E: numberOrZero(this.data.awayE),
      },
      homeTotals: {
        ...(this.data.game?.homeTotals || {}),
        R: homeScore,
        H: numberOrZero(this.data.homeH),
        E: numberOrZero(this.data.homeE),
      },
      batting: battingRows,
      pitching: pitchingRows,
      mvpPlayerName: String(this.data.mvpPlayerName || '').trim(),
      mvpPlayerId: String(this.data.mvpPlayerId || '').trim(),
      mvpNote: String(this.data.mvpNote || '').trim(),
      _revisionReason: reason,
      _revisionSource: 'mini_game_edit',
    };
    this.setData({ saving: true });
    try {
      await api.patch(`/games/${this.data.id}`, payload);
      toast('比赛数据已修订');
      wx.navigateBack();
    } catch (err) {
      showError(err, '保存修订失败');
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteGame() {
    if (!this.data.canDeleteGame || this.data.saving) return;
    if (String(this.data.deleteConfirmText || '').trim() !== '删除比赛') {
      return toast('请输入“删除比赛”确认');
    }
    const confirmed = await confirmDeleteGame(this.data.game || {});
    if (!confirmed) return;
    this.setData({ saving: true });
    try {
      await api.del(`/games/${this.data.id}`);
      toast('比赛已删除');
      wx.navigateBack();
    } catch (err) {
      showError(err, '删除比赛失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function hasPermission(user, permission) {
  if ((user?.permissions || []).includes(permission)) return true;
  if (permission === 'destructive:delete') return user?.adminLevel === 'A';
  return user?.role === 'admin';
}

function confirmDeleteGame(game) {
  return new Promise(resolve => {
    if (!wx.showModal) {
      resolve(true);
      return;
    }
    wx.showModal({
      title: '删除比赛',
      content: `确认删除「${game.away || '客队'} vs ${game.home || '主队'}」？比分、打击、投手和事件日志会从比赛库移除。`,
      confirmText: '删除',
      confirmColor: '#d85f5f',
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

function cloneRows(rows) {
  return JSON.parse(JSON.stringify(rows || []));
}

function valueText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function buildTournamentOptions(tournaments) {
  return [{ id: '', label: '不关联赛事' }].concat((tournaments || []).map(tournament => ({
    id: tournament.id,
    label: `${tournament.shortName || tournament.name} · ${tournament.season || '未设赛季'}`,
  })));
}

function fetchTournamentPage(offset) {
  return api.get('/tournaments', {
    limit: TOURNAMENT_PAGE_LIMIT,
    offset,
  });
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

function pickTournamentIndex(options, id) {
  if (!id) return 0;
  const found = (options || []).findIndex(option => option.id === id);
  return found >= 0 ? found : 0;
}

function selectedTournament(data) {
  const option = data.tournamentOptions[data.tournamentIndex] || {};
  if (!option.id) return null;
  return (data.tournaments || []).find(tournament => tournament.id === option.id) || null;
}

function chooseImageFile() {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          resolve((res.tempFiles || [])[0] || null);
        },
        fail: reject,
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        resolve({ tempFilePath: (res.tempFilePaths || [])[0] || '', size: (res.tempFiles || [])[0]?.size });
      },
      fail: reject,
    });
  });
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

function buildRowOptions(rows, emptyLabel) {
  if (!rows || !rows.length) return [{ label: emptyLabel }];
  return rows.map((row, index) => ({
    label: `${index + 1}. ${row.name || '未命名'}${row.pos ? ` · ${row.pos}` : ''}`,
  }));
}

function nameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildMvpOptions(battingRows, pitchingRows, currentName) {
  const options = [{ id: '', label: '不选择 MVP', name: '' }];
  const seen = new Set(['']);
  const pushRow = row => {
    const name = String(row?.name || '').trim();
    if (!name) return;
    const id = String(row?.playerId || '').trim();
    const key = id || nameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      id,
      name,
      label: `⭐ ${name}${id ? ' · 已关联球员' : ' · 未关联球员'}`,
    });
  };
  (battingRows || []).forEach(pushRow);
  (pitchingRows || []).forEach(pushRow);
  const existingName = String(currentName || '').trim();
  if (existingName && !options.some(option => nameKey(option.name) === nameKey(existingName))) {
    options.push({ id: '', name: existingName, label: `⭐ ${existingName} · 手动记录` });
  }
  return options;
}

function pickMvpIndex(options, playerId, playerName) {
  const id = String(playerId || '').trim();
  if (id) {
    const byId = (options || []).findIndex(option => option.id === id);
    if (byId >= 0) return byId;
  }
  const name = nameKey(playerName);
  if (name) {
    const byName = (options || []).findIndex(option => nameKey(option.name) === name);
    if (byName >= 0) return byName;
  }
  return 0;
}

function inferMvpPlayerId(name, battingRows, pitchingRows) {
  const key = nameKey(name);
  if (!key) return '';
  const row = (battingRows || []).concat(pitchingRows || []).find(item => nameKey(item?.name) === key);
  return row ? String(row.playerId || '').trim() : '';
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBattingRow(row) {
  const next = { ...row, name: String(row.name || '').trim(), pos: String(row.pos || '').trim() };
  battingFields.forEach(field => { next[field] = numberOrZero(next[field]); });
  return next;
}

function normalizePitchingRow(row) {
  const next = {
    ...row,
    name: String(row.name || '').trim(),
    IP: String(row.IP || '').trim() || '0.0',
    decision: String(row.decision || '').trim(),
  };
  pitchingFields.forEach(field => { next[field] = numberOrZero(next[field]); });
  return next;
}

function commitCurrentRow(rows, index, current, normalize) {
  const next = cloneRows(rows);
  if (current && next[index]) next[index] = normalize(current);
  return next;
}
