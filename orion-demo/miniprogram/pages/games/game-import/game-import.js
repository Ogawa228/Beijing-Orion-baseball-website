const api = require('../../../utils/request');
const upload = require('../../../utils/upload');
const { showError, toast } = require('../../../utils/format');
const { sportLabel } = require('../../../utils/labels');

const TOURNAMENT_PAGE_LIMIT = 30;

Page({
  data: {
    user: null,
    canImport: false,
    tournaments: [],
    tournamentOptions: [{ id: '', label: '请选择赛事' }],
    tournamentIndex: 0,
    tournamentLabel: '请选择赛事',
    tournamentHasMore: false,
    tournamentNextOffset: 0,
    loadingMoreTournaments: false,
    fileName: '',
    filePath: '',
    fileSizeText: '',
    files: [],
    selectedFileId: '',
    fileQueueText: '',
    coverUrl: '',
    coverFileName: '',
    coverUploadText: '',
    uploadingCover: false,
    draft: null,
    summaryRows: [],
    battingPreview: [],
    pitchingPreview: [],
    warnings: [],
    loading: true,
    parsing: false,
    saving: false,
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [me, tournamentRes] = await Promise.all([
        api.get('/auth/me'),
        fetchTournamentPage(0).catch(() => ({ tournaments: [], hasMore: false, nextOffset: 0 })),
      ]);
      getApp().setIdentity(me);
      const user = me.user || null;
      const tournaments = tournamentRes.tournaments || [];
      const tournamentOptions = buildTournamentOptions(tournaments);
      const canImport = hasPermission(user, 'games:draft') && hasPermission(user, 'games:confirm');
      this.setData({
        user,
        canImport,
        tournaments,
        tournamentOptions,
        tournamentIndex: tournamentOptions.length > 1 ? 1 : 0,
        tournamentLabel: tournamentOptions.length > 1 ? tournamentOptions[1].label : tournamentOptions[0].label,
        tournamentHasMore: !!tournamentRes.hasMore,
        tournamentNextOffset: normalizeNextOffset(tournamentRes.nextOffset, tournaments.length),
      });
    } catch (err) {
      showError(err, '导入页加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMoreTournaments() {
    if (!this.data.canImport || this.data.loadingMoreTournaments || !this.data.tournamentHasMore) return;
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

  onTournamentChange(e) {
    const tournamentIndex = Number(e.detail.value);
    const option = this.data.tournamentOptions[tournamentIndex] || this.data.tournamentOptions[0];
    this.setData({
      tournamentIndex,
      tournamentLabel: option.label,
      files: resetImportFiles(this.data.files),
      draft: null,
      summaryRows: [],
      battingPreview: [],
      pitchingPreview: [],
      warnings: [],
    });
  },

  async chooseGameFiles() {
    if (!this.data.canImport) return;
    try {
      const picked = await chooseMessageFiles();
      if (!picked.length) return;
      const files = picked
        .filter(file => /\.(pdf|xls|xlsx)$/i.test(file.name || ''))
        .map(formatImportFile);
      if (!files.length) return toast('请选择 PDF / Excel 文件');
      const file = files[0];
      this.setData({
        files,
        selectedFileId: file.id,
        fileName: file.name,
        filePath: file.path,
        fileSizeText: file.sizeText,
        fileQueueText: files.length > 1 ? `已选择 ${files.length} 份 PDF / Excel，逐份解析入库` : '',
        coverUrl: '',
        coverFileName: '',
        coverUploadText: '',
        draft: null,
        summaryRows: [],
        battingPreview: [],
        pitchingPreview: [],
        warnings: [],
      });
      if (files.length > 1) toast(`已选择 ${files.length} 份比赛文件`);
    } catch (err) {
      showError(err, '选择文件失败');
    }
  },

  choosePdf() {
    return this.chooseGameFiles();
  },

  selectFile(e) {
    if (this.data.parsing || this.data.saving) return;
    const id = e.currentTarget.dataset.id;
    const file = (this.data.files || []).find(item => item.id === id);
    if (!file) return;
    this.setData({
      selectedFileId: file.id,
      fileName: file.name,
      filePath: file.path,
      fileSizeText: file.sizeText,
      coverUrl: file.coverUrl || '',
      coverFileName: file.coverFileName || '',
      coverUploadText: file.coverUploadText || '',
      draft: file.saved ? null : (file.draft || null),
      warnings: file.warnings || [],
      summaryRows: file.draft ? buildSummaryRows(file.draft) : [],
      battingPreview: (file.draft?.batting || []).slice(0, 8).map(formatBattingRow),
      pitchingPreview: (file.draft?.pitching || []).slice(0, 6).map(formatPitchingRow),
    });
  },

  async chooseCoverImage() {
    if (!this.data.canImport || this.data.uploadingCover) return;
    if (!this.data.selectedFileId) return toast('请先选择比赛文件');
    this.setData({ uploadingCover: true, coverUploadText: '选择封面图中...' });
    try {
      const file = await chooseImageFile();
      if (!file) {
        this.setData({ coverUploadText: '' });
        return;
      }
      const fileName = file.name || `game-cover-${Date.now()}.jpg`;
      this.setData({ coverFileName: fileName, coverUploadText: '上传中...' });
      const res = await upload.uploadImage(file, 'game', 'game-cover');
      const coverUrl = res.url || '';
      const draft = this.data.draft ? { ...this.data.draft, cover: coverUrl } : null;
      const filePatch = {
        coverUrl,
        coverFileName: fileName,
        coverUploadText: '已上传封面图',
      };
      if (draft) filePatch.draft = draft;
      const files = updateImportFile(this.data.files, this.data.selectedFileId, filePatch);
      this.setData({
        files,
        draft,
        coverUrl,
        coverFileName: fileName,
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

  async parseSelectedFile() {
    if (!this.data.canImport || this.data.parsing) return;
    const tournament = selectedTournament(this.data);
    if (!tournament) return toast('请先选择赛事');
    if (!this.data.filePath || !this.data.fileName) return toast('请先选择 PDF / Excel');
    this.setData({ parsing: true });
    try {
      const fileBase64 = await readFileBase64(this.data.filePath);
      const res = await api.post('/games/import-gamechanger', {
        tournamentId: tournament.id,
        fileName: this.data.fileName,
        fileBase64,
        source: 'mini_program',
      });
      const selectedFile = (this.data.files || []).find(item => item.id === this.data.selectedFileId) || {};
      const parsedDrafts = Array.isArray(res.drafts) && res.drafts.length
        ? res.drafts
        : (res.draft ? [res.draft] : []);
      if (!parsedDrafts.length) return toast('未解析到比赛');
      const drafts = parsedDrafts.map(draft => selectedFile.coverUrl ? { ...draft, cover: selectedFile.coverUrl } : draft);
      const files = expandImportFileDrafts(this.data.files, this.data.selectedFileId, drafts, res.warnings || []);
      const draft = drafts[0] || null;
      const warnings = draft?.warnings || res.warnings || [];
      this.setData({
        files,
        draft,
        warnings,
        summaryRows: buildSummaryRows(draft),
        battingPreview: (draft?.batting || []).slice(0, 8).map(formatBattingRow),
        pitchingPreview: (draft?.pitching || []).slice(0, 6).map(formatPitchingRow),
      });
      toast(drafts.length > 1 ? `解析完成：${drafts.length} 场比赛` : '解析完成');
    } catch (err) {
      showError(err, '文件解析失败');
    } finally {
      this.setData({ parsing: false });
    }
  },

  parsePdf() {
    return this.parseSelectedFile();
  },

  async confirmImport() {
    if (!this.data.canImport || this.data.saving) return;
    const draft = this.data.draft;
    if (!draft) return toast('请先解析比赛文件');
    this.setData({ saving: true });
    try {
      const selectedFile = (this.data.files || []).find(file => file.id === this.data.selectedFileId) || {};
      const payload = { ...draft };
      if (selectedFile.coverUrl) payload.cover = selectedFile.coverUrl;
      delete payload.warnings;
      const res = await api.post('/games', payload);
      const id = res.game && res.game.id;
      const files = updateImportFile(this.data.files, this.data.selectedFileId, {
        saved: true,
        gameId: id || '',
        statusText: '已入库',
        statusClass: 'saved',
      });
      const next = nextImportFile(files, this.data.selectedFileId);
      if (next) {
        this.setData({
          files,
          selectedFileId: next.id,
          fileName: next.name,
          filePath: next.path,
          fileSizeText: next.sizeText,
          coverUrl: next.coverUrl || '',
          coverFileName: next.coverFileName || '',
          coverUploadText: next.coverUploadText || '',
          draft: next.draft || null,
          warnings: next.warnings || [],
          summaryRows: next.draft ? buildSummaryRows(next.draft) : [],
          battingPreview: (next.draft?.batting || []).slice(0, 8).map(formatBattingRow),
          pitchingPreview: (next.draft?.pitching || []).slice(0, 6).map(formatPitchingRow),
        });
        toast('已入库，继续下一份');
        return;
      }
      this.setData({ files });
      toast('比赛已入库');
      if (id) {
        wx.navigateTo({ url: `/pages/games/game-detail/game-detail?id=${id}` });
      }
    } catch (err) {
      showError(err, '比赛入库失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});

function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = user.permissions || [];
  if (permissions.includes(permission)) return true;
  return user.role === 'admin' && !permissions.length;
}

function buildTournamentOptions(tournaments) {
  return [{ id: '', label: '请选择赛事' }].concat((tournaments || []).map(t => ({
    id: t.id,
    label: [t.shortName || t.name, sportLabel(t.sport), t.season].filter(Boolean).join(' · '),
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

function selectedTournament(data) {
  const option = data.tournamentOptions[data.tournamentIndex] || data.tournamentOptions[0];
  return option && option.id ? option : null;
}

function chooseMessageFiles() {
  return new Promise((resolve, reject) => {
    if (!wx.chooseMessageFile) return reject(new Error('当前微信版本不支持选择聊天文件'));
    wx.chooseMessageFile({
      count: 10,
      type: 'file',
      extension: ['pdf', 'xls', 'xlsx'],
      success(res) {
        resolve(res.tempFiles || []);
      },
      fail: reject,
    });
  });
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

function formatImportFile(file, index) {
  const name = file.name || '';
  const path = file.path || file.tempFilePath || '';
  const kind = fileKind(name);
  return {
    id: `${Date.now()}_${index}_${name}`,
    name,
    path,
    kind,
    size: file.size || 0,
    sizeText: formatFileSize(file.size),
    statusText: '待解析',
    statusClass: 'pending',
    parsed: false,
    saved: false,
    active: index === 0,
    coverUrl: '',
    coverFileName: '',
    coverUploadText: '',
  };
}

function fileKind(name) {
  return /\.(xls|xlsx)$/i.test(String(name || '')) ? 'excel' : 'pdf';
}

function updateImportFile(files, id, patch) {
  return (files || []).map(file => file.id === id ? { ...file, ...patch } : file);
}

function resetImportFiles(files) {
  return (files || []).map(file => ({
    ...file,
    sourceFileId: '',
    draft: null,
    warnings: [],
    parsed: false,
    saved: false,
    gameId: '',
    statusText: '待解析',
    statusClass: 'pending',
  }));
}

function expandImportFileDrafts(files, id, drafts, fallbackWarnings) {
  const list = files || [];
  const index = list.findIndex(file => file.id === id);
  if (index < 0) return list;
  const base = list[index];
  const normalizedDrafts = (drafts || []).filter(Boolean);
  if (!normalizedDrafts.length) return list;
  const children = normalizedDrafts.map((draft, draftIndex) => ({
    ...base,
    id: draftIndex === 0 ? base.id : `${base.id}_draft_${draftIndex}`,
    sourceFileId: base.id,
    name: draftIndex === 0 ? base.name : `${base.name} · 第 ${draftIndex + 1} 场`,
    draft,
    warnings: draft.warnings || fallbackWarnings || [],
    parsed: true,
    saved: false,
    gameId: '',
    statusText: draftIndex === 0 && normalizedDrafts.length === 1 ? '已解析' : `已解析 ${draftIndex + 1}/${normalizedDrafts.length}`,
    statusClass: 'parsed',
  }));
  const withoutOldChildren = list.filter(file => file.id === base.id || file.sourceFileId !== base.id);
  const currentIndex = withoutOldChildren.findIndex(file => file.id === base.id);
  return withoutOldChildren.slice(0, currentIndex)
    .concat(children)
    .concat(withoutOldChildren.slice(currentIndex + 1));
}

function nextImportFile(files, currentId) {
  const list = files || [];
  const start = Math.max(0, list.findIndex(file => file.id === currentId));
  return list.slice(start + 1).find(file => !file.saved)
    || list.slice(0, start).find(file => !file.saved)
    || null;
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

function formatFileSize(size) {
  const n = Number(size || 0);
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.ceil(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function buildSummaryRows(game) {
  if (!game) return [];
  return [
    { label: '日期', value: game.date || '-' },
    { label: '赛事', value: game.seasonName || game.season || '-' },
    { label: '对阵', value: `${game.away || '-'} vs ${game.home || '-'}` },
    { label: '比分', value: `${game.awayScore ?? '-'} : ${game.homeScore ?? '-'}` },
    { label: '局数', value: game.innings ? `${game.innings} 局` : '-' },
    { label: '本队统计', value: `${(game.batting || []).length} 名打者 / ${(game.pitching || []).length} 名投手` },
  ];
}

function formatBattingRow(row) {
  return {
    name: row.name || '队员',
    line: `${row.H || 0}H / ${row.AB || 0}AB · ${row.R || 0}R · ${row.RBI || 0}RBI`,
  };
}

function formatPitchingRow(row) {
  return {
    name: row.name || '投手',
    line: `${row.IP || 0} IP · ${row.R || 0}R · ${row.ER || 0}ER · ${row.SO || 0}K`,
  };
}
