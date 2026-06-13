/* ===================================================================
   Orion DB — fetch-based API client (云端模式)
   - 不再用 localStorage，所有数据走 /api/*
   - 页面加载时 await DB.preload() 一次拉全部数据到内存 cache
   - 同步读：DB.allPlayers() / DB.getPlayerStats() 等从 cache 直接读
   - 异步写：DB.addPlayer() / DB.recordAttendance() 等 await fetch
   - 老 SEED + Trad-Simp 表已搬到后端；前端 canonicalNameKey 用简化版
   =================================================================== */

const SLOGAN_MAX = 14;
const DEFAULT_PUBLIC_PLAYER_AVATAR = 'assets/img/generated/orion-default-player-avatar.png?v=4';
const WEB_SESSION_STORAGE_KEY = 'orion_web_session';

function _storedSessionToken() {
  try { return localStorage.getItem(WEB_SESSION_STORAGE_KEY) || ''; }
  catch (_) { return ''; }
}

function _storeSessionToken(token) {
  try {
    const v = String(token || '').trim();
    if (v) localStorage.setItem(WEB_SESSION_STORAGE_KEY, v);
  } catch (_) {}
}

function _clearStoredSessionToken() {
  try { localStorage.removeItem(WEB_SESSION_STORAGE_KEY); } catch (_) {}
}

// ============== fetch helper ==============
async function _api(method, url, body) {
  const headers = {};
  const sessionToken = _storedSessionToken();
  if (sessionToken) headers['X-Orion-Session'] = sessionToken;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) {
    if (r.status === 401) _clearStoredSessionToken();
    const err = new Error(data.message || data.error || r.statusText || '请求失败');
    err.code = data.error;
    err.status = r.status;
    throw err;
  }
  return data;
}

// ============== 名字归一化（简化版，与 server/name-utils.js 同语义）==============
const RAD_MAP = {
  '⺁':'厂','⺄':'卜','⺈':'刂','⺋':'匚','⺌':'匸','⺎':'卩','⺒':'又','⺔':'女','⺕':'子','⺖':'宀',
  '⺡':'弓','⺢':'彐','⺨':'忄','⺪':'扌','⺮':'氵','⺱':'灬','⺷':'王','⺹':'见','⺺':'示','⺼':'纟',
  '⻂':'艹','⻊':'走','⻑':'长','⻓':'长','⻔':'门','⻗':'阝','⻘':'青','⻜':'飞','⻝':'食','⻢':'马',
  '⻥':'见','⻦':'鸟','⻧':'鱼','⻩':'黄','⻫':'齐','⻰':'龙','⻲':'龟',
};

function _canonicalNameKey(s) {
  if (!s) return '';
  let n = String(s).normalize('NFKC');
  n = n.replace(/[⺀-⻿]/g, ch => RAD_MAP[ch] || ch);
  n = n.replace(/[\s 　​-‍﻿]+/g, ' ').trim();
  const cjkSpace = /([⺀-⿿㐀-鿿])\s+([⺀-⿿㐀-鿿])/g;
  n = n.replace(cjkSpace, '$1$2').replace(cjkSpace, '$1$2');
  n = n.replace(/[\s·・•./．\-—–_]+/g, '');
  return n.toLowerCase();
}

function _imageUrl(value, fallback = 'assets/img/logo.jpg') {
  const v = String(value || '').trim();
  if (!v) return fallback;
  if (/^(data:|blob:|https?:\/\/|\/)/i.test(v)) return v;
  if (v.startsWith('assets/')) return v;
  return 'assets/img/players/' + v;
}

function _maskPlayerName(name) {
  const chars = Array.from(String(name || '').trim());
  if (!chars.length) return '星X';
  if (chars.length === 1) return chars[0] + 'X';
  const mask = 'X'.repeat(Math.max(1, chars.length - 1));
  return chars[0] + (chars.length >= 3 ? ' ' : '') + mask;
}

function _maskPlayerIdentityName(player) {
  const candidates = [player?.name, ...(Array.isArray(player?.aliases) ? player.aliases : [])]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => Array.from(b).length - Array.from(a).length);
  return _maskPlayerName(candidates[0] || player?.name || '');
}

// ============== 内存 cache ==============
const _cache = {
  players: [], games: [], tournaments: [], events: [],
  hallOfFame: [], highlights: [], bindCodes: [],
  attendances: [], pointsAdjustments: [],
  notifications: [], bindRequests: [],
  user: null, player: null,
  rules: null,
  _loaded: false,
  _lastLoadAt: 0,
};

const DB = {
  // 暴露常量（页面引用）
  POINTS_RULES: null,
  SLOGAN_MAX,
  DEFAULT_PUBLIC_PLAYER_AVATAR,

  // ==================== 加载 ====================
  async preload(force = false) {
    if (_cache._loaded && !force && (Date.now() - _cache._lastLoadAt < 60_000)) return;
    const cu = await _api('GET', '/api/auth/me').catch(() => ({ user: null, player: null }));
    _cache.user = cu.user;
    _cache.player = cu.player;
    const promises = [
      _api('GET', '/api/players?include=all'),
      _api('GET', '/api/games?includeAggregate=true'),
      _api('GET', '/api/tournaments'),
      _api('GET', '/api/events'),
      _api('GET', '/api/hall-of-fame'),
      _api('GET', '/api/highlights'),
      _api('GET', '/api/attendances'),
      _api('GET', '/api/points-adjustments'),
      _api('GET', '/api/points/rules'),
    ];
    const extras = { bindCodes: [], notifications: [], bindRequests: [] };
    if ((cu.user?.permissions || []).includes('bind_codes:manage')) {
      promises.push(_api('GET', '/api/bind-codes')
        .then(r => { extras.bindCodes = r.bindCodes || []; })
        .catch(() => {}));
    }
    if (cu.user) {
      promises.push(_api('GET', '/api/notifications')
        .then(r => { extras.notifications = r.notifications || []; })
        .catch(() => {}));
      promises.push(_api('GET', '/api/bind-requests/mine')
        .then(r => { extras.bindRequests = r.requests || []; })
        .catch(() => {}));
    }
    const results = await Promise.all(promises);
    _cache.players = results[0].players || [];
    _cache.games = results[1].games || [];
    _cache.tournaments = results[2].tournaments || [];
    _cache.events = results[3].events || [];
    _cache.hallOfFame = results[4].hallOfFame || [];
    _cache.highlights = results[5].highlights || [];
    _cache.attendances = results[6].attendances || [];
    _cache.pointsAdjustments = results[7].adjustments || [];
    _cache.rules = results[8].rules || {};
    DB.POINTS_RULES = _cache.rules;
    _cache.bindCodes = extras.bindCodes;
    _cache.notifications = extras.notifications;
    _cache.bindRequests = extras.bindRequests;
    _cache._loaded = true;
    _cache._lastLoadAt = Date.now();
  },

  reload() {
    DB._preloadPromise = DB.preload(true).catch(e => {
      console.error('[DB.reload]', e);
      window._dbPreloadError = e;
      throw e;
    });
    return DB._preloadPromise;
  },

  // ==================== Helpers ====================
  isOrionTeam(teamName) {
    if (!teamName) return false;
    return /猎户|Orion|Zoo\s*Park|ZPRK/i.test(String(teamName));
  },
  canonicalNameKey: _canonicalNameKey,

  getPlayerLevel(player) {
    if (!player) return 'verified';
    return player.level || 'verified';
  },
  maskPlayerName: _maskPlayerName,
  canViewRealPlayerIdentity(player) {
    if (!player) return false;
    if (DB.hasPermission('players:write') || DB.hasPermission('players:display_write')) return true;
    const u = _cache.user;
    if (u && u.boundPlayerId === player.id) return true;
    return !!(_cache.player && DB.getPlayerLevel(_cache.player) === 'verified');
  },
  canEditPlayerPublicProfile(player) {
    if (!player) return false;
    if (DB.hasPermission('players:write') || DB.hasPermission('players:display_write')) return true;
    const u = _cache.user;
    return !!(u && u.boundPlayerId === player.id && DB.getPlayerLevel(player) === 'verified');
  },
  publicPlayerName(player, opts = {}) {
    if (!player) return '';
    if (opts.reveal === true) return player.name || '';
    return String(player.publicDisplayName || '').trim() || player.name || _maskPlayerIdentityName(player);
  },
  publicPlayerAvatar(player, opts = {}) {
    if (!player) return DEFAULT_PUBLIC_PLAYER_AVATAR;
    if (opts.reveal === true) return DB.playerPhotoUrl(player);
    return String(player.publicAvatar || '').trim()
      ? _imageUrl(player.publicAvatar, DEFAULT_PUBLIC_PLAYER_AVATAR)
      : DB.playerPhotoUrl(player);
  },
  publicPlayerIdentity(player, opts = {}) {
    const reveal = opts.reveal === true;
    const hasCustomName = !!String(player?.publicDisplayName || '').trim();
    const hasCustomAvatar = !!String(player?.publicAvatar || '').trim();
    const isFrostedName = !reveal && !hasCustomName;
    const isFrostedAvatar = !reveal && !hasCustomAvatar;
    const canExposeName = reveal || hasCustomName;
    return {
      name: DB.publicPlayerName(player, { reveal }),
      avatar: DB.publicPlayerAvatar(player, { reveal }),
      maskedName: _maskPlayerIdentityName(player),
      hasCustomName,
      hasCustomAvatar,
      isFrostedName,
      isFrostedAvatar,
      isFrosted: isFrostedName || isFrostedAvatar,
      canExposeName,
      accessibleName: canExposeName ? DB.publicPlayerName(player, { reveal }) : '球员公开资料',
      photoAlt: canExposeName ? DB.publicPlayerName(player, { reveal }) : '球员公开头像',
    };
  },
  publicPlayerIdentityForViewer(player) {
    return DB.publicPlayerIdentity(player, { reveal: DB.canViewRealPlayerIdentity(player) });
  },
  publicPlayerProfileHref(player) {
    return player?.id ? `dashboard.html?id=${encodeURIComponent(player.id)}` : '#';
  },
  getTrainingCount(playerId) {
    return _cache.attendances.filter(a => a.playerId === playerId && a.kind === 'training').length;
  },

  // 名字 → player（含 alias）
  getPlayerByName(name) {
    if (!name) return null;
    const q = String(name).trim();
    let hit = _cache.players.find(p => p.name === q);
    if (hit) return hit;
    hit = _cache.players.find(p => Array.isArray(p.aliases) && p.aliases.includes(q));
    if (hit) return hit;
    const qN = _canonicalNameKey(q);
    if (!qN) return null;
    hit = _cache.players.find(p => _canonicalNameKey(p.name) === qN);
    if (hit) return hit;
    hit = _cache.players.find(p =>
      Array.isArray(p.aliases) && p.aliases.some(a => _canonicalNameKey(a) === qN)
    );
    return hit || null;
  },
  canonicalName(rawName) {
    const p = DB.getPlayerByName(rawName);
    return p ? p.name : rawName;
  },
  // 给定原始名字，返回注册球员的 canonicalKey（用于聚合时把 alias 归并到主名）
  playerCanonicalKey(rawName) {
    const p = DB.getPlayerByName(rawName);
    return p ? _canonicalNameKey(p.name) : _canonicalNameKey(rawName);
  },
  // player 主名 + 所有 aliases 的 canonical key set
  playerNameKeys(player) {
    const keys = new Set();
    if (player?.name) keys.add(_canonicalNameKey(player.name));
    if (Array.isArray(player?.aliases)) {
      for (const a of player.aliases) if (a) keys.add(_canonicalNameKey(a));
    }
    return keys;
  },

  // ==================== Helpers for optimistic updates ====================
  // 乐观更新策略：本地 cache 立即生效，后台 fetch 异步同步
  // - 失败时回滚 + toast 提示
  // - 调用方不需要 await（兼容老 admin 代码）
  // 不要在新代码里依赖。新代码用 await DB.api(...).
  _toastErr(msg, e) {
    if (typeof window !== 'undefined' && typeof window.toast === 'function') {
      window.toast(`${msg}：${e?.message || e}`, 'error');
    }
    console.error('[DB]', msg, e);
  },

  // ==================== Site Settings ====================
  async getSiteSetting(key) {
    const r = await _api('GET', `/api/site-settings/${encodeURIComponent(key)}`);
    return r.setting || null;
  },
  async updateSiteSetting(key, value) {
    const r = await _api('PUT', `/api/site-settings/${encodeURIComponent(key)}`, { value });
    return r.setting || null;
  },

  // ==================== Players ====================
  allPlayers()           { return [..._cache.players]; },
  getPlayerById(id)      { return _cache.players.find(p => p.id === id); },
  playerPhotoUrl(player) {
    return _imageUrl(player?.photo, 'assets/img/logo.jpg');
  },
  // 同步 API：本地立即推一个临时 player，后台 fetch 把临时换成真版
  addPlayer(data) {
    const tempId = data.id || `p_pending_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    const tempPlayer = {
      id: tempId, name: data.name||'', number: data.number||'', position: data.position||'',
      photo: data.photo||'', publicDisplayName: data.publicDisplayName || '', publicAvatar: data.publicAvatar || '',
      slogan: data.slogan||'', bats: data.bats||'', throws: data.throws||'',
      joinYear: data.joinYear||null, titles: data.titles||[],
      aliases: data.aliases||null, level: data.level || 'verified',
    };
    _cache.players.push(tempPlayer);
    _api('POST', '/api/players', data).then(r => {
      const idx = _cache.players.findIndex(p => p.id === tempId);
      if (idx >= 0) _cache.players[idx] = r.player;
    }).catch(e => {
      _cache.players = _cache.players.filter(p => p.id !== tempId);
      DB._toastErr('添加球员失败', e);
    });
    return tempPlayer;
  },
  updatePlayer(id, updates) {
    const idx = _cache.players.findIndex(p => p.id === id);
    if (idx < 0) return null;
    const before = { ..._cache.players[idx] };
    Object.assign(_cache.players[idx], updates);
    _api('PATCH', `/api/players/${id}`, updates).then(r => {
      const i = _cache.players.findIndex(p => p.id === id);
      if (i >= 0) _cache.players[i] = r.player;
    }).catch(e => {
      const i = _cache.players.findIndex(p => p.id === id);
      if (i >= 0) _cache.players[i] = before;
      DB._toastErr('更新球员失败', e);
    });
    return _cache.players[idx];
  },
  async updatePlayerPublicProfile(id, updates) {
    const r = await _api('PATCH', `/api/players/${encodeURIComponent(id)}/public-profile`, updates);
    const idx = _cache.players.findIndex(p => p.id === id);
    if (idx >= 0 && r.player) _cache.players[idx] = r.player;
    if (_cache.player?.id === id && r.player) _cache.player = { ..._cache.player, ...r.player };
    return r.player;
  },
  deletePlayer(id) {
    const before = _cache.players.find(p => p.id === id);
    if (!before) return;
    _cache.players = _cache.players.filter(p => p.id !== id);
    _cache.bindCodes = _cache.bindCodes.filter(c => c.playerId !== id);
    _cache.hallOfFame = _cache.hallOfFame.filter(h => h.playerId !== id);
    _api('DELETE', `/api/players/${id}`).catch(e => {
      _cache.players.push(before);
      DB._toastErr('删除球员失败', e);
    });
  },
  upgradePlayerToVerified(id, _opts) {
    const idx = _cache.players.findIndex(p => p.id === id);
    if (idx < 0) return null;
    const before = { ..._cache.players[idx] };
    _cache.players[idx].level = 'verified';
    _cache.players[idx].upgradedAt = new Date().toISOString();
    _cache.players[idx].upgradedBy = 'admin';
    _api('POST', `/api/players/${id}/upgrade`).then(r => {
      const i = _cache.players.findIndex(p => p.id === id);
      if (i >= 0) _cache.players[i] = r.player;
    }).catch(e => {
      // 回滚乐观更新
      const i = _cache.players.findIndex(p => p.id === id);
      if (i >= 0) _cache.players[i] = before;
      // 重名冲突给一个明确的引导
      if (e.code === 'name_conflict') {
        if (window.toast) window.toast(`⚠ ${e.message}`, 'error');
      } else {
        DB._toastErr('升级球员失败', e);
      }
      if (window.renderAll) window.renderAll();
    });
    return _cache.players[idx];
  },
  async mergePlayers(sourceId, targetId, opts = {}) {
    const r = await _api('POST', '/api/players/merge', {
      sourceId,
      targetId,
      keepSourceAsAlias: opts.keepSourceAsAlias !== false,
    });
    await DB.reload();
    return r;
  },

  // ==================== Tournaments ====================
  allTournaments(filter = {}) {
    return _cache.tournaments.filter(t =>
      (!filter.type || t.type === filter.type) &&
      (!filter.season || t.season === filter.season)
    );
  },
  getTournamentById(id) { return _cache.tournaments.find(t => t.id === id); },
  addTournament(t) {
    const tempId = t.id || `t_pending_${Date.now()}`;
    const tmp = { ...t, id: tempId };
    _cache.tournaments.push(tmp);
    _api('POST', '/api/tournaments', t).then(r => {
      const i = _cache.tournaments.findIndex(x => x.id === tempId);
      if (i >= 0) _cache.tournaments[i] = r.tournament;
    }).catch(e => { _cache.tournaments = _cache.tournaments.filter(x => x.id !== tempId); DB._toastErr('添加赛事失败', e); });
    return tmp;
  },
  updateTournament(id, u) {
    const i = _cache.tournaments.findIndex(t => t.id === id);
    if (i < 0) return null;
    const before = { ..._cache.tournaments[i] };
    Object.assign(_cache.tournaments[i], u);
    _api('PATCH', `/api/tournaments/${id}`, u).then(r => {
      const j = _cache.tournaments.findIndex(t => t.id === id);
      if (j >= 0) _cache.tournaments[j] = r.tournament;
    }).catch(e => {
      const j = _cache.tournaments.findIndex(t => t.id === id);
      if (j >= 0) _cache.tournaments[j] = before;
      DB._toastErr('更新赛事失败', e);
    });
    return _cache.tournaments[i];
  },
  deleteTournament(id) {
    const before = _cache.tournaments.find(t => t.id === id);
    if (!before) return;
    _cache.tournaments = _cache.tournaments.filter(t => t.id !== id);
    _api('DELETE', `/api/tournaments/${id}`).catch(e => { _cache.tournaments.push(before); DB._toastErr('删除赛事失败', e); });
  },
  getGamesForTournament(tournamentId) { return _cache.games.filter(g => g.tournamentId === tournamentId); },
  allSeasons() {
    const set = new Set();
    _cache.tournaments.forEach(t => t.season && set.add(t.season));
    _cache.games.forEach(g => g.date && set.add((g.date||'').slice(0,4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  },

  // ==================== Games ====================
  allGames(opts = {}) {
    const list = [..._cache.games];
    if (opts.includeAggregate) return list;
    return list.filter(g => !g.isAggregate);
  },
  getGameById(id) { return _cache.games.find(g => g.id === id); },
  addGame(game) {
    const tempId = game.id || `g_pending_${Date.now()}`;
    const tmp = { ...game, id: tempId };
    _cache.games.push(tmp);
    _api('POST', '/api/games', game).then(r => {
      const i = _cache.games.findIndex(g => g.id === tempId);
      if (i >= 0) _cache.games[i] = r.game;
    }).catch(e => { _cache.games = _cache.games.filter(g => g.id !== tempId); DB._toastErr('添加比赛失败', e); });
    return tmp;
  },
  updateGame(id, u) {
    const i = _cache.games.findIndex(g => g.id === id);
    if (i < 0) return null;
    const before = { ..._cache.games[i] };
    Object.assign(_cache.games[i], u);
    _api('PATCH', `/api/games/${id}`, u).then(r => {
      const j = _cache.games.findIndex(g => g.id === id);
      if (j >= 0) _cache.games[j] = r.game;
    }).catch(e => {
      const j = _cache.games.findIndex(g => g.id === id);
      if (j >= 0) _cache.games[j] = before;
      DB._toastErr('更新比赛失败', e);
    });
    return _cache.games[i];
  },
  async updateGameAsync(id, u) {
    const i = _cache.games.findIndex(g => g.id === id);
    if (i < 0) throw new Error('比赛不存在');
    const before = { ..._cache.games[i] };
    Object.assign(_cache.games[i], u);
    try {
      const r = await _api('PATCH', `/api/games/${id}`, u);
      const j = _cache.games.findIndex(g => g.id === id);
      if (j >= 0) _cache.games[j] = r.game;
      return r.game;
    } catch (e) {
      const j = _cache.games.findIndex(g => g.id === id);
      if (j >= 0) _cache.games[j] = before;
      throw e;
    }
  },
  deleteGame(id) {
    const before = _cache.games.find(g => g.id === id);
    if (!before) return;
    _cache.games = _cache.games.filter(g => g.id !== id);
    _api('DELETE', `/api/games/${id}`).catch(e => { _cache.games.push(before); DB._toastErr('删除比赛失败', e); });
  },

  // ==================== Events ====================
  allEvents() {
    return [..._cache.events].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },
  getEventById(id) { return _cache.events.find(e => e.id === id); },
  addEvent(ev) {
    const tempId = ev.id || `ev_pending_${Date.now()}`;
    const tmp = { ...ev, id: tempId, createdAt: ev.createdAt || new Date().toISOString().slice(0,10) };
    _cache.events.push(tmp);
    _api('POST', '/api/events', ev).then(r => {
      const i = _cache.events.findIndex(e => e.id === tempId);
      if (i >= 0) _cache.events[i] = r.event;
    }).catch(e => { _cache.events = _cache.events.filter(x => x.id !== tempId); DB._toastErr('添加活动失败', e); });
    return tmp;
  },
  updateEvent(id, u) {
    const i = _cache.events.findIndex(e => e.id === id);
    if (i < 0) return null;
    const before = { ..._cache.events[i] };
    Object.assign(_cache.events[i], u);
    _api('PATCH', `/api/events/${id}`, u).then(r => {
      const j = _cache.events.findIndex(e => e.id === id);
      if (j >= 0) _cache.events[j] = r.event;
    }).catch(e => {
      const j = _cache.events.findIndex(e => e.id === id);
      if (j >= 0) _cache.events[j] = before;
      DB._toastErr('更新活动失败', e);
    });
    return _cache.events[i];
  },
  deleteEvent(id) {
    const before = _cache.events.find(e => e.id === id);
    if (!before) return;
    _cache.events = _cache.events.filter(e => e.id !== id);
    _api('DELETE', `/api/events/${id}`).catch(e => { _cache.events.push(before); DB._toastErr('删除活动失败', e); });
  },

  // ==================== Hall of Fame ====================
  allHallOfFame() {
    return _cache.hallOfFame.map(h => ({ ...h, player: DB.getPlayerById(h.playerId) }));
  },
  addToHallOfFame(playerId, reason) {
    const inductedYear = new Date().getFullYear();
    const tmp = { playerId, inductedYear, reason: reason || '' };
    const idx = _cache.hallOfFame.findIndex(h => h.playerId === playerId);
    if (idx >= 0) _cache.hallOfFame[idx] = tmp; else _cache.hallOfFame.push(tmp);
    _api('POST', '/api/hall-of-fame', tmp).then(r => {
      const i = _cache.hallOfFame.findIndex(h => h.playerId === playerId);
      if (i >= 0) _cache.hallOfFame[i] = r.entry;
    }).catch(e => { _cache.hallOfFame = _cache.hallOfFame.filter(h => h.playerId !== playerId); DB._toastErr('加入名人堂失败', e); });
  },
  removeFromHallOfFame(playerId) {
    const before = _cache.hallOfFame.find(h => h.playerId === playerId);
    if (!before) return;
    _cache.hallOfFame = _cache.hallOfFame.filter(h => h.playerId !== playerId);
    _api('DELETE', `/api/hall-of-fame/${playerId}`).catch(e => { _cache.hallOfFame.push(before); DB._toastErr('移除名人堂失败', e); });
  },

  // ==================== Highlights ====================
  allHighlights() { return [..._cache.highlights]; },
  highlightsForGame(gameId)         { return _cache.highlights.filter(h => h.gameId === gameId); },
  highlightsForPlayer(playerName) {
    const player = DB.getPlayerByName(playerName);
    const keys = player ? DB.playerNameKeys(player) : new Set([_canonicalNameKey(playerName)]);
    return _cache.highlights.filter(h => keys.has(_canonicalNameKey(h.playerName)));
  },
  addHighlight(h) {
    const tempId = h.id || `h_pending_${Date.now()}`;
    const tmp = { ...h, id: tempId, status: h.status || 'pending' };
    _cache.highlights.push(tmp);
    _api('POST', '/api/highlights', h).then(r => {
      const i = _cache.highlights.findIndex(x => x.id === tempId);
      if (i >= 0) _cache.highlights[i] = r.highlight;
    }).catch(e => { _cache.highlights = _cache.highlights.filter(x => x.id !== tempId); DB._toastErr('上传高亮失败', e); });
    return tmp;
  },
  deleteHighlight(id) {
    const before = _cache.highlights.find(h => h.id === id);
    if (!before) return;
    _cache.highlights = _cache.highlights.filter(h => h.id !== id);
    _api('DELETE', `/api/highlights/${id}`).catch(e => { _cache.highlights.push(before); DB._toastErr('删除高亮失败', e); });
  },

  // ==================== Bind Codes ====================
  allBindCodes() { return [..._cache.bindCodes]; },
  // createBindCode 是同步的 stub：生成本地占位码 → 立即返回（admin 看到）
  // 后台 fetch 真正生成；服务器返回的真正 code 替换本地的，UI 自动 reflow
  // 注意：admin 立即用这个码当场展示，60s 内服务器回来会替换显示
  createBindCode(playerId) {
    const localCode = `ORION-PENDING-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const tmp = { code: localCode, playerId, used: false, createdAt: new Date().toISOString().slice(0,10) };
    _cache.bindCodes.push(tmp);
    _api('POST', '/api/bind-codes', { playerId }).then(r => {
      const i = _cache.bindCodes.findIndex(c => c.code === localCode);
      if (i >= 0) _cache.bindCodes[i] = r.bindCode;
      // 触发重新渲染（admin.html 的 renderCodes 监听 DB 变化）
      if (window.renderAll) window.renderAll();
      else if (window.renderCodes) window.renderCodes();
    }).catch(e => { _cache.bindCodes = _cache.bindCodes.filter(c => c.code !== localCode); DB._toastErr('生成绑定码失败', e); });
    return tmp;
  },
  deleteBindCode(code) {
    const before = _cache.bindCodes.find(c => c.code === code);
    if (!before) return;
    _cache.bindCodes = _cache.bindCodes.filter(c => c.code !== code);
    _api('DELETE', `/api/bind-codes/${encodeURIComponent(code)}`).catch(e => { _cache.bindCodes.push(before); DB._toastErr('删除绑定码失败', e); });
  },
  async redeemBindCode(_userId, code) {
    const r = await _api('POST', '/api/auth/redeem-bind-code', { code });
    // 重新 preload 拉最新数据（user.boundPlayerId / 老 casual player 已删 / attendance 迁移）
    await DB.reload();
    return r.player;
  },

  // ==================== Admin people management ====================
  async adminBindUserToPlayer(userId, playerId) {
    const r = await _api('POST', `/api/admin/users/${encodeURIComponent(userId)}/bind-player`, { playerId });
    await DB.reload();
    return r;
  },
  async adminUnbindUser(userId) {
    const r = await _api('POST', `/api/admin/users/${encodeURIComponent(userId)}/unbind-player`, {});
    await DB.reload();
    return r;
  },
  async sendBindInvitation(userId, playerId, message = '') {
    return _api('POST', '/api/admin/bind-invitations', { userId, playerId, message });
  },
  async createAppConnectCode(userId) {
    return _api('POST', `/api/admin/users/${encodeURIComponent(userId)}/app-connect-code`, {});
  },
  async getAuditLogs(limit = 80) {
    return _api('GET', `/api/admin/audit-logs?limit=${encodeURIComponent(limit)}`);
  },
  async updateAdminLevel(userId, adminLevel, adminPermissionGroups = []) {
    return _api('PATCH', `/api/admin/users/${encodeURIComponent(userId)}/admin-level`, {
      adminLevel,
      adminPermissionGroups,
    });
  },
  async deleteAdminUser(userId) {
    const r = await _api('DELETE', `/api/admin/users/${encodeURIComponent(userId)}`);
    await DB.reload();
    return r;
  },

  // ==================== Player bind requests ====================
  bindRequests() { return [..._cache.bindRequests]; },
  latestBindRequest() { return [..._cache.bindRequests].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0] || null; },
  async reloadBindRequests() {
    if (!_cache.user) return [];
    const r = await _api('GET', '/api/bind-requests/mine');
    _cache.bindRequests = r.requests || [];
    return _cache.bindRequests;
  },
  async submitBindRequest(payload) {
    const r = await _api('POST', '/api/bind-requests', payload);
    await DB.reloadBindRequests();
    return r.request;
  },
  async getAdminBindRequests(status = 'pending') {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return _api('GET', `/api/admin/bind-requests${q}`);
  },
  async approveBindRequest(id, reviewNote = '') {
    const r = await _api('POST', `/api/admin/bind-requests/${encodeURIComponent(id)}/approve`, { reviewNote });
    await DB.reload();
    return r;
  },
  async rejectBindRequest(id, reviewNote = '') {
    return _api('POST', `/api/admin/bind-requests/${encodeURIComponent(id)}/reject`, { reviewNote });
  },

  // ==================== Notifications ====================
  notifications() { return [..._cache.notifications]; },
  unreadNotifications() { return _cache.notifications.filter(n => !n.readAt); },
  async reloadNotifications() {
    if (!_cache.user) return [];
    const r = await _api('GET', '/api/notifications');
    _cache.notifications = r.notifications || [];
    return _cache.notifications;
  },
  async markNotificationRead(id) {
    const r = await _api('POST', `/api/notifications/${encodeURIComponent(id)}/read`, {});
    const i = _cache.notifications.findIndex(n => n.id === id);
    if (i >= 0) _cache.notifications[i] = r.notification;
    return r.notification;
  },

  // ==================== Attendances ====================
  allAttendances()                 { return [..._cache.attendances]; },
  attendancesForPlayer(playerId)   { return _cache.attendances.filter(a => a.playerId === playerId); },
  recordAttendance(payload) {
    const tempId = `att_pending_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    const tmp = {
      id: tempId, playerId: payload.playerId, kind: payload.kind, refId: payload.refId || null,
      date: payload.date || new Date().toISOString().slice(0,10),
      note: payload.note || '', createdBy: payload.createdBy || null,
      createdAt: new Date().toISOString(),
    };
    _cache.attendances.push(tmp);
    _api('POST', '/api/attendances', payload).then(r => {
      const i = _cache.attendances.findIndex(a => a.id === tempId);
      if (i >= 0) _cache.attendances[i] = r.attendance;
      if (r.triggeredUpgrade) {
        // 自动升级了某个 casual player → 拉新版 player
        _api('GET', `/api/players/${payload.playerId}`).then(p => {
          const j = _cache.players.findIndex(x => x.id === payload.playerId);
          if (j >= 0 && p?.player) _cache.players[j] = p.player;
          if (window.renderAll) window.renderAll();
          if (window.toast) window.toast('★ 签到达 8 次，已自动升级为正式队员', 'success');
        }).catch(() => {});
      } else if (r.nameConflict) {
        // 满 8 次但与预置 verified 球员撞名（如试训"虞婧"撞预置"虞婧"）
        // 不能独立升级，需要 admin 通过绑定码合并
        if (window.toast) {
          window.toast(
            `⚠ 已达 8 次训练，但「${r.nameConflict.name}」与正式队员同名 — 请联系管理员通过绑定码完成合并升级`,
            'info'
          );
        }
      }
    }).catch(e => { _cache.attendances = _cache.attendances.filter(a => a.id !== tempId); DB._toastErr('签到失败', e); });
    return tmp;
  },
  removeAttendance(id) {
    const before = _cache.attendances.find(a => a.id === id);
    if (!before) return;
    _cache.attendances = _cache.attendances.filter(a => a.id !== id);
    _api('DELETE', `/api/attendances/${id}`).catch(e => { _cache.attendances.push(before); DB._toastErr('删除签到失败', e); });
  },

  // ==================== Points Adjustments ====================
  allPointsAdjustments()            { return [..._cache.pointsAdjustments]; },
  adjustmentsForPlayer(playerId)    { return _cache.pointsAdjustments.filter(a => a.playerId === playerId); },
  addPointsAdjustment(payload) {
    const tempId = `adj_pending_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    const tmp = {
      id: tempId, playerId: payload.playerId, delta: Number(payload.delta),
      reason: payload.reason || '',
      gameId: payload.gameId || null,
      createdBy: payload.createdBy || null,
      createdAt: new Date().toISOString(),
    };
    _cache.pointsAdjustments.push(tmp);
    _api('POST', '/api/points-adjustments', payload).then(r => {
      const i = _cache.pointsAdjustments.findIndex(a => a.id === tempId);
      if (i >= 0) _cache.pointsAdjustments[i] = r.adjustment;
    }).catch(e => { _cache.pointsAdjustments = _cache.pointsAdjustments.filter(a => a.id !== tempId); DB._toastErr('加减分失败', e); });
    return tmp;
  },
  removePointsAdjustment(id) {
    const before = _cache.pointsAdjustments.find(a => a.id === id);
    if (!before) return;
    _cache.pointsAdjustments = _cache.pointsAdjustments.filter(a => a.id !== id);
    _api('DELETE', `/api/points-adjustments/${id}`).catch(e => { _cache.pointsAdjustments.push(before); DB._toastErr('删除调整失败', e); });
  },

  // ==================== Auth ====================
  currentUser() { return _cache.user; },
  hasPermission(permission) {
    return !!permission && Array.isArray(_cache.user?.permissions) && _cache.user.permissions.includes(permission);
  },
  isAdminUser() {
    return !!(_cache.user?.adminLevel || (_cache.user?.adminPermissionGroups || []).length || _cache.user?.role === 'admin');
  },
  adminLevel() {
    return _cache.user?.adminLevel || null;
  },
  adminPermissionGroups() {
    return [...(_cache.user?.adminPermissionGroups || [])];
  },
  findUserByEmail(_email) { /* 老 API：服务器端校验，前端无需 */ return null; },
  async register(payload) {
    const r = await _api('POST', '/api/auth/register', payload);
    if (r.sessionToken) _storeSessionToken(r.sessionToken);
    _cache.user = r.user;
    if (r.player) {
      _cache.player = r.player;
      _cache.players.push(r.player);
    }
    if (r.bindRequest) _cache.bindRequests = [r.bindRequest, ..._cache.bindRequests];
    return r.user;
  },
  async linkEmail({ code, email, password, displayName }) {
    const r = await _api('POST', '/api/auth/link-email', { code, email, password, displayName });
    if (r.sessionToken) _storeSessionToken(r.sessionToken);
    _cache.user = r.user;
    await DB.reload();
    return r.user;
  },
  // 当前登录账号自助生成一次性关联码（30 分钟有效）。
  // 网页先注册的用户拿它去小程序登录页"关联微信"，把微信身份挂到同一账号。
  async createAppConnectCode() {
    return _api('POST', '/api/auth/app-connect-code', {});
  },
  async login(email, password) {
    const r = await _api('POST', '/api/auth/login', { email, password });
    if (r.sessionToken) _storeSessionToken(r.sessionToken);
    _cache.user = r.user;
    return r.user;
  },
  async logout() {
    try { await _api('POST', '/api/auth/logout'); } catch (_) {}
    _clearStoredSessionToken();
    _cache.user = null;
    _cache.player = null;
  },
  async heartbeat() {
    if (!_cache.user) return;
    try { await _api('POST', '/api/auth/heartbeat'); } catch (_) {}
    if (_cache.user) _cache.user.lastActiveAt = new Date().toISOString();
  },
  // 用户更新自己的昵称 / 头像（与 player.name/photo 分离）
  async updateMe(updates) {
    const r = await _api('PATCH', '/api/auth/me', updates);
    _cache.user = r.user;
    return r.user;
  },

  // ==================== 通用工具：模糊搜索 + debounce ====================
  // 多 token 模糊匹配：query 拆成 token，每个 token 都需出现在 fields 拼接的文本里
  // 大小写不敏感；空 query 全通过；性能 O(text * tokens)，53 球员级别零压力
  fuzzyMatch(query, ...fields) {
    if (!query) return true;
    const text = fields.filter(s => s != null).map(s => String(s).toLowerCase()).join(' ');
    const tokens = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    return tokens.every(t => text.includes(t));
  },
  // 防抖：避免每个字符都触发一次 render
  debounce(fn, ms = 200) {
    let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  },
  // 老 API 兼容：reset 已经不再清服务器数据（云端模式）；改为 reload 拉一遍最新数据
  // admin.html 的"重置所有数据"按钮等于强制刷新 + 重拉 cache（不删数据）
  async reset() {
    await DB.reload();
    if (typeof window !== 'undefined' && typeof window.toast === 'function') {
      window.toast('已从服务器重新加载数据（云端模式不再支持本地清空）', 'info');
    }
  },

  // ==================== 在线状态 ====================
  // 当前用户的状态：active；其它球员：从他们关联 user 的 lastActiveAt 算
  // 注意：preload 里没拉所有 user 的 lastActiveAt（隐私），所以非自己的 player → offline
  getPlayerOnlineStatus(playerOrId) {
    const playerId = (typeof playerOrId === 'string') ? playerOrId : playerOrId?.id;
    if (!playerId) return { status: 'offline', lastActiveAt: null };
    if (_cache.user?.boundPlayerId === playerId) {
      const last = _cache.user.lastActiveAt;
      if (!last) return { status: 'offline', lastActiveAt: null };
      const diff = Date.now() - new Date(last).getTime();
      if (diff < 2 * 60 * 1000)  return { status: 'online',  lastActiveAt: last };
      if (diff < 30 * 60 * 1000) return { status: 'recent',  lastActiveAt: last };
    }
    return { status: 'offline', lastActiveAt: null };
  },

  // ==================== 计算：球员赛季统计 + 积分 + 排行榜 ====================
  // 跟 server/points.js 同语义；前端实时算（不再发请求）
  // 借调规则：只看 g.batting / g.pitching，永不看 oppBatting / oppPitching
  getPlayerStats(playerName, filter = {}) {
    let AB = 0, R = 0, H = 0, RBI = 0, BB = 0, SO = 0, games = 0;
    let _1B = 0, _2B = 0, _3B = 0, HR = 0;
    const perGame = [];
    const player = DB.getPlayerByName(playerName);
    const nameKeys = player ? DB.playerNameKeys(player) : new Set([_canonicalNameKey(playerName)]);
    _cache.games.forEach(g => {
      if (filter.tournamentId && g.tournamentId !== filter.tournamentId) return;
      if (filter.season && !(g.date || '').startsWith(filter.season)) return;
      if (filter.gameId && g.id !== filter.gameId) return;
      const line = (g.batting || []).find(b => nameKeys.has(_canonicalNameKey(b.name)));
      if (line) {
        AB += line.AB; R += line.R; H += line.H; RBI += line.RBI; BB += line.BB; SO += line.SO;
        _1B += (line._1B || 0); _2B += (line._2B || 0); _3B += (line._3B || 0); HR += (line.HR || 0);
        games += (line.gp || 1);
        const isHomeOrion = DB.isOrionTeam(g.home);
        perGame.push({ gameId: g.id, opponent: isHomeOrion ? g.away : g.home, date: g.date, isAggregate: !!g.isAggregate, ...line });
      }
    });
    const AVG = AB ? (H / AB) : 0;
    const OBP = (AB + BB) ? ((H + BB) / (AB + BB)) : 0;
    const hasExtras = (_1B + _2B + _3B + HR) > 0;
    const totalBases = hasExtras ? (_1B + 2 * _2B + 3 * _3B + 4 * HR) : (H * 1.5);
    const SLG = AB ? (totalBases / AB) : 0;
    const OPS = OBP + SLG;
    return { AB, R, H, RBI, BB, SO, games, AVG, OBP, SLG, OPS, _1B, _2B, _3B, HR, hasExtras, perGame };
  },

  getPlayerPoints(playerId) {
    const player = DB.getPlayerById(playerId);
    const R = DB.POINTS_RULES || {};
    if (!player || !R.training) return { total: 0, breakdown:{base:0,performance:0,awards:0,manual:0}, timeline: [] };
    const nameKeys = DB.playerNameKeys(player);
    const tournamentMap = new Map(_cache.tournaments.map(t => [t.id, t]));
    const timeline = [];
    let base = 0, performance = 0, awards = 0, manual = 0;

    for (const g of _cache.games) {
      if (g.isAggregate) continue;
      const tType = tournamentMap.get(g.tournamentId)?.type || 'friendly';
      const isLeagueOrCup = (tType === 'league' || tType === 'cup');
      const battingLine = (g.batting || []).find(b => nameKeys.has(_canonicalNameKey(b.name)));
      const pitchingLine = (g.pitching || []).find(p => nameKeys.has(_canonicalNameKey(p.name)));
      if (!battingLine && !pitchingLine) continue;

      const apperancePts = isLeagueOrCup ? R.leagueOrCup : R.friendlyOrTraining;
      base += apperancePts;
      const oppName = DB.isOrionTeam(g.home) ? g.away : g.home;
      const perfPieces = [];

      let mvpBonus = 0;
      if (g.mvpPlayerName && nameKeys.has(_canonicalNameKey(g.mvpPlayerName))) {
        mvpBonus = R.mvp; perfPieces.push(`MVP +${R.mvp}`);
      }

      let battingBonus = 0;
      if (battingLine) {
        const _1B = battingLine._1B || 0;
        const _2B = battingLine._2B || 0;
        const _3B = battingLine._3B || 0;
        const HR = battingLine.HR || 0;
        const hasGraded = (_1B + _2B + _3B + HR) > 0;
        if (hasGraded) {
          if (_1B) { battingBonus += _1B * R.single; perfPieces.push(`1B×${_1B} +${_1B*R.single}`); }
          if (_2B) { battingBonus += _2B * R.double; perfPieces.push(`2B×${_2B} +${_2B*R.double}`); }
          if (_3B) { battingBonus += _3B * R.triple; perfPieces.push(`3B×${_3B} +${_3B*R.triple}`); }
          if (HR)  { battingBonus += HR  * R.hr;     perfPieces.push(`HR×${HR} +${HR*R.hr}`); }
        } else {
          const H = battingLine.H || 0;
          if (H) { battingBonus += H * R.single; perfPieces.push(`H×${H} +${H*R.single}`); }
        }
        const RBIv = battingLine.RBI || 0;
        if (RBIv) { battingBonus += RBIv * R.rbi; perfPieces.push(`RBI×${RBIv} +${RBIv*R.rbi}`); }
        const Ev = battingLine.E || 0;
        if (Ev) { battingBonus += Ev * R.error; perfPieces.push(`E×${Ev} ${Ev*R.error}`); }
      }

      let pitchingBonus = 0;
      if (pitchingLine) {
        const SO = pitchingLine.SO || 0;
        const BB = pitchingLine.BB || 0;
        if (SO) { pitchingBonus += SO * R.so;        perfPieces.push(`SO×${SO} +${SO*R.so}`); }
        if (BB) { pitchingBonus += BB * R.bb_pitcher; perfPieces.push(`BB×${BB} ${BB*R.bb_pitcher}`); }
      }

      const perfTotal = mvpBonus + battingBonus + pitchingBonus;
      performance += perfTotal;
      const gameDelta = apperancePts + perfTotal;
      const t = tournamentMap.get(g.tournamentId);
      timeline.push({
        date: g.date, source: 'game', refId: g.id,
        label: `${isLeagueOrCup ? '🏆' : '⚾'} vs ${oppName||'对手'} · ${isLeagueOrCup ? '联赛·杯赛' : '友谊·训练赛'}`,
        delta: gameDelta,
        detail: { appearance: apperancePts, performance: perfTotal, pieces: perfPieces, tournamentName: t?.shortName || t?.name || '', tournamentId: t?.id || null, gameId: g.id }
      });
    }

    _cache.attendances.filter(a => a.playerId === playerId).forEach(a => {
      const delta = (a.kind === 'training') ? R.training : R.event;
      base += delta;
      let label = '';
      if (a.kind === 'training') label = `🏋 训练签到`;
      else {
        const ev = a.refId ? DB.getEventById(a.refId) : null;
        label = `🎉 活动出席${ev ? ' · ' + ev.title : ''}`;
      }
      timeline.push({ date: a.date, source: a.kind, refId: a.refId, label, delta, detail: { note: a.note || '' } });
    });

    (player.titles || []).forEach(t => {
      if (!t) return;
      const lower = String(t);
      let delta = 0, label = '';
      if (/赛季\s*MVP|赛季最佳/i.test(lower))  { delta = R.seasonMvp; label = `★ 赛季奖项 · ${t}`; }
      else if (/金手套/i.test(lower))          { delta = R.goldGlove; label = `🥇 金手套 · ${t}`; }
      else if (/银棒|银棒奖/i.test(lower))     { delta = R.silverBat; label = `🥈 银棒奖 · ${t}`; }
      else if (/最佳投手/i.test(lower))        { delta = R.goldGlove; label = `🏅 最佳投手 · ${t}`; }
      if (delta && !/名人堂/.test(lower)) {
        awards += delta;
        timeline.push({ date: '', source: 'award', refId: null, label, delta, detail: { title: t } });
      }
    });

    const hofEntry = _cache.hallOfFame.find(h => h.playerId === playerId);
    if (hofEntry) {
      awards += R.hallOfFame;
      timeline.push({
        date: hofEntry.inductedYear ? `${hofEntry.inductedYear}-01-01` : '',
        source: 'hof', refId: null, label: `🌟 入选名人堂`, delta: R.hallOfFame,
        detail: { reason: hofEntry.reason || '', year: hofEntry.inductedYear }
      });
    }

    _cache.pointsAdjustments.filter(a => a.playerId === playerId).forEach(a => {
      manual += a.delta;
      timeline.push({
        date: (a.createdAt || '').slice(0, 10),
        source: 'manual', refId: a.id,
        label: `⚙ 管理员调整${a.reason ? ' · ' + a.reason : ''}`,
        delta: a.delta,
        detail: { reason: a.reason || '', createdAt: a.createdAt }
      });
    });

    timeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return {
      total: base + performance + awards + manual,
      breakdown: { base, performance, awards, manual },
      timeline,
    };
  },

  getPointsLeaderboard(_filter = {}) {
    return _cache.players
      .map(p => {
        const pts = DB.getPlayerPoints(p.id);
        return {
          player: p,
          total: pts.total,
          breakdown: pts.breakdown,
          gamesCount: pts.timeline.filter(t => t.source === 'game').length,
          mvpCount: pts.timeline.filter(t => t.source === 'game' && /MVP/.test((t.detail?.pieces || []).join(','))).length,
        };
      })
      .filter(row => row.total !== 0 || row.gamesCount > 0)
      .sort((a, b) => b.total - a.total);
  },

  // ==================== Helpers (UI 用) ====================
  videoEmbedUrl(url) {
    if (!url) return null;
    const bv = url.match(/BV[0-9A-Za-z]+/);
    if (bv) return `https://player.bilibili.com/player.html?bvid=${bv[0]}&page=1&high_quality=1&danmaku=0`;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    return null;
  },
};

// 暴露
window.DB = DB;
window.SLOGAN_MAX = SLOGAN_MAX;

// ============== 自动 preload ==============
// 页面引入 db.js 即自动启动一次 preload；调用方仍可 await DB.preload() 等待完成
DB._preloadPromise = DB.preload().catch(e => {
  console.error('[DB.preload]', e);
  // 标记，让 UI 显示"连接服务器失败"
  window._dbPreloadError = e;
});
window.dbReady = () => DB._preloadPromise;

// Auto-mount universe starfield background on every page (pure DOM, no deps)
// NOTE: the old rotating galaxy spiral was removed — the site now uses
// a real NASA/Webb photograph as the full-site backdrop (see style.css),
// and keeps only dust nebulae + starfield here.
(function mountUniverse(){
  if (document.querySelector('.universe')) return;
  function build(){
    if (!document.querySelector('.hero')) {
      const mw = document.createElement('div');
      mw.className = 'sky-milky-way';
      mw.setAttribute('aria-hidden','true');
      document.body.insertBefore(mw, document.body.firstChild);
    }
    const uni = document.createElement('div');
    uni.className = 'universe';
    uni.setAttribute('aria-hidden','true');
    uni.innerHTML = `
      <div class="universe-layer">
        <div class="universe-nebula n1"></div>
        <div class="universe-nebula n2"></div>
        <div class="universe-nebula n3"></div>
      </div>
      <svg class="universe-stars" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1400 2400"></svg>
    `;
    document.body.appendChild(uni);
    const svg = uni.querySelector('.universe-stars');
    const W = 1400, H = 2400;
    const hasMW = !!document.querySelector('.sky-milky-way');
    const scale = hasMW ? 0.3 : 1;
    let s = '';
    const dustN = Math.round(120 * scale);
    for (let i=0; i<dustN; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const tw = Math.random() < .15 ? ` twinkle d${(i%5)+1}` : '';
      const rad = 0.4 + Math.random() * 0.6;
      s += `<circle class="star star-sm${tw}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}"/>`;
    }
    const midN = Math.round(40 * scale);
    for (let i=0; i<midN; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const tw = Math.random() < .3 ? ` twinkle d${(i%5)+1}` : '';
      const rad = 1.0 + Math.random() * 0.7;
      s += `<circle class="star star-md${tw}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}"/>`;
    }
    const brightN = Math.round(12 * scale);
    for (let i=0; i<brightN; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const rad = 1.8 + Math.random() * 0.9;
      s += `<circle class="star star-lg" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}"/>`;
    }
    const clusterN = hasMW ? 2 : 4;
    for (let c = 0; c < clusterN; c++) {
      const cx = Math.random() * W, cy = Math.random() * H;
      const count = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(-2 * Math.log(Math.random())) * 24;
        const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
        const rad = 0.5 + Math.random() * 0.8;
        s += `<circle class="star star-sm" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}"/>`;
      }
    }
    const orion = [
      {x:380,y:240,r:6.5},{x:860,y:280,r:5.5},{x:820,y:480,r:4.5},
      {x:660,y:495,r:5},{x:505,y:510,r:4.5},{x:420,y:680,r:5},{x:900,y:660,r:6.8}
    ];
    orion.forEach((st,i)=>{ s += `<circle class="star star-xl twinkle d${(i%5)+1}" cx="${st.x}" cy="${st.y}" r="${st.r}"/>`; });
    svg.innerHTML = s;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once:true });
  } else {
    build();
  }
})();
