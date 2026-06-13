// /api/auth/* 路由：注册、登录、登出、当前用户、绑定码
//
// 设计：
// - register 自动建 casual player + email identity（首次注册 = 试训队员）
// - login 用 user_identities 表查 email → user → 校验密码 → 设 cookie
// - me 返回当前 user + bound player 简要信息
// - redeem-bind-code 用绑定码升级到 verified（迁数据 + 删 casual player + 改 boundPlayerId）

const express = require('express');
const crypto = require('crypto');
const dns = require('dns');
const https = require('https');
const db = require('../db');
const { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } = require('../auth-helpers');
const { wrap, requireAuth } = require('../middleware');
const { bindUserToPlayer, ensurePeopleTables, logAudit, createNotification } = require('../people-helpers');
const { ensurePermissionsSchema, serializeUserPermissions } = require('../permissions');
const { ensurePlayerPublicProfileSchema } = require('../player-public-profile');

const router = express.Router();
const MINI_LEGAL_URL = 'https://www.猎户座棒垒球.cn/legal.html';
const MINI_LEGAL_VERSION = 'orion-legal-2026-05-21';

function publicUserPayload(row) {
  if (!row) return null;
  const permissions = serializeUserPermissions(row);
  return {
    id: row.id || row.user_id,
    displayName: row.display_name,
    avatar: row.avatar,
    role: row.role,
    adminLevel: permissions.adminLevel,
    adminPermissionGroups: permissions.adminPermissionGroups,
    permissions: permissions.permissions,
    boundPlayerId: row.bound_player_id,
    lastActiveAt: row.last_active_at,
  };
}

function clean(v, max = 255) {
  return String(v || '').trim().slice(0, max);
}

function miniLegalConsent(body = {}) {
  return {
    legalAccepted: body.legalAccepted === true,
    personalInfoAccepted: body.personalInfoAccepted === true,
    guardianConfirmed: body.guardianConfirmed === true,
    legalUrl: clean(body.legalUrl || MINI_LEGAL_URL, 255),
    legalVersion: clean(body.legalVersion || MINI_LEGAL_VERSION, 80),
    legalAcceptedAt: clean(body.legalAcceptedAt || new Date().toISOString(), 40),
  };
}

function miniProgramConfig() {
  return {
    appId: process.env.WECHAT_MINIPROGRAM_APP_ID || process.env.WX_MINIPROGRAM_APP_ID || '',
    appSecret: process.env.WECHAT_MINIPROGRAM_APP_SECRET || process.env.WX_MINIPROGRAM_APP_SECRET || '',
  };
}

async function requestWxSession(code) {
  const { appId, appSecret } = miniProgramConfig();
  if (!appId || !appSecret) {
    const err = new Error('微信小程序 AppID/AppSecret 未配置');
    err.status = 503;
    err.code = 'wechat_config_missing';
    throw err;
  }
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const data = await requestJson(url);
  if (data.errcode) {
    const err = new Error(data.errmsg || '微信登录失败');
    err.status = 401;
    err.code = 'wechat_login_failed';
    err.wx = data;
    throw err;
  }
  return { appId, ...data };
}

async function requestJson(url) {
  if (process.env.ORION_WX_SESSION_USE_FETCH === '1') {
    return requestJsonWithFetch(url);
  }
  try {
    return await requestJsonWithHttps(url);
  } catch (error) {
    if (isWeChatCertificateError(url, error)) {
      return requestJsonWithHttps(url, { allowSelfSigned: true });
    }
    const err = new Error(`微信登录服务暂时不可用：${error.message || '网络请求失败'}`);
    err.status = 502;
    err.code = 'wechat_session_request_failed';
    err.cause = error;
    throw err;
  }
}

async function requestJsonWithFetch(url) {
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok || data.errcode) {
    const err = new Error(data.errmsg || '微信登录失败');
    err.status = 401;
    err.code = 'wechat_login_failed';
    err.wx = data;
    throw err;
  }
  return data;
}

function isWeChatCertificateError(url, error) {
  const target = typeof url === 'string' ? new URL(url) : url;
  if (target.hostname !== 'api.weixin.qq.com') return false;
  const code = String(error && error.code || '');
  const message = String(error && error.message || '').toLowerCase();
  return /SELF_SIGNED|CERT|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(code) ||
    message.includes('self-signed certificate') ||
    message.includes('unable to verify') ||
    message.includes('certificate');
}

function requestJsonWithHttps(url, options = {}) {
  const target = typeof url === 'string' ? new URL(url) : url;
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      timeout: 8000,
      rejectUnauthorized: options.allowSelfSigned ? false : true,
      lookup(hostname, options, callback) {
        dns.lookup(hostname, { ...options, family: 4 }, callback);
      },
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'orion-demo/1.0 wx-session',
      },
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch (error) {
          reject(new Error(`invalid JSON from WeChat: ${error.message}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function attachWxIdentity({ userId, openid, unionid, appId }) {
  await db.q(
    `INSERT IGNORE INTO user_identities (user_id, type, value, app_id)
     VALUES (?, 'wx_openid', ?, ?)`,
    [userId, openid, appId || null]
  );
  if (unionid) {
    await db.q(
      `INSERT IGNORE INTO user_identities (user_id, type, value, app_id)
       VALUES (?, 'wx_unionid', ?, ?)`,
      [userId, unionid, appId || null]
    );
  }
}

async function findWxUser({ openid, unionid, appId }) {
  if (unionid) {
    const byUnion = await db.qOne(
      `SELECT u.*
       FROM user_identities ui
       JOIN users u ON u.id = ui.user_id
       WHERE ui.type = 'wx_unionid' AND ui.value = ?
       LIMIT 1`,
      [unionid]
    );
    if (byUnion) return byUnion;
  }
  return db.qOne(
    `SELECT u.*
     FROM user_identities ui
     JOIN users u ON u.id = ui.user_id
     WHERE ui.type = 'wx_openid' AND ui.value = ? AND (ui.app_id = ? OR ui.app_id IS NULL)
     LIMIT 1`,
    [openid, appId || null]
  );
}

async function loadBoundPlayer(userId) {
  const user = await db.qOne('SELECT bound_player_id FROM users WHERE id = ?', [userId]);
  if (!user || !user.bound_player_id) return null;
  return db.qOne(`
    SELECT id, name, level, photo, position, number,
           public_display_name AS publicDisplayName,
           public_avatar AS publicAvatar
    FROM players WHERE id = ?
  `, [user.bound_player_id]);
}

// 1. POST /api/auth/register
// body: { email, password, displayName, playerName?, registrationMode?, bindRequest? }
// 副作用：建 user + email identity + casual player（boundPlayerId 立即关联）
router.post('/register', wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const { email, password, displayName, registrationMode = 'trial', bindRequest = {} } = req.body || {};
  const accountName = String(displayName || '').trim();
  const playerName = String(req.body?.playerName || displayName || '').trim();
  if (!email || !password || !accountName || !playerName) {
    return res.status(400).json({ error: 'bad_request', message: '邮箱 / 密码 / 昵称都必填' });
  }
  // 邮箱已注册？
  const existing = await db.qOne(
    'SELECT user_id FROM user_identities WHERE type = ? AND value = ?',
    ['email', email.toLowerCase()]
  );
  if (existing) return res.status(409).json({ error: 'email_taken', message: '该邮箱已被注册' });

  let targetPlayer = null;
  const wantsBindRequest = registrationMode === 'bind_request';
  if (wantsBindRequest) {
    const requestedPlayerId = String(bindRequest.requestedPlayerId || bindRequest.playerId || '').trim();
    if (!requestedPlayerId) return res.status(400).json({ error: 'bad_request', message: '请选择要绑定的正式球员档案' });
    targetPlayer = await db.qOne('SELECT id, name, number, position, level FROM players WHERE id = ?', [requestedPlayerId]);
    if (!targetPlayer) return res.status(404).json({ error: 'player_missing', message: '目标球员不存在' });
    if (targetPlayer.level !== 'verified') {
      return res.status(400).json({ error: 'bad_player_level', message: '只能申请绑定正式球员档案' });
    }
  }

  // 1. 建 casual player
  const rand = crypto.randomBytes(3).toString('hex');
  const ts = Date.now();
  const playerId = `p_user_${ts}_${rand}`;
  await db.q(
    `INSERT INTO players (id, name, level, join_year) VALUES (?, ?, 'casual', ?)`,
    [playerId, playerName, new Date().getFullYear()]
  );
  // 2. 建 user
  const userId = `u_${ts}_${rand}`;
  await db.q(
    `INSERT INTO users (id, display_name, role, bound_player_id, last_active_at) VALUES (?, ?, 'player', ?, NOW())`,
    [userId, accountName, playerId]
  );
  // 3. 建 email identity（密码哈希）
  await db.q(
    `INSERT INTO user_identities (user_id, type, value, password_hash) VALUES (?, 'email', ?, ?)`,
    [userId, email.toLowerCase(), hashPassword(password)]
  );

  let request = null;
  if (wantsBindRequest) {
    await ensurePeopleTables();
    const requestId = `pbr_${ts}_${crypto.randomBytes(3).toString('hex')}`;
    const realName = String(bindRequest.realName || playerName).trim().slice(0, 80);
    const nickname = String(bindRequest.nickname || accountName).trim().slice(0, 80);
    const jerseyNumber = String(bindRequest.jerseyNumber || '').trim().slice(0, 8);
    const contactTail = String(bindRequest.contactTail || '').trim().slice(0, 40);
    const note = String(bindRequest.note || '').trim().slice(0, 1000);
    await db.q(
      `INSERT INTO player_bind_requests
       (id, user_id, requested_player_id, real_name, nickname, jersey_number, contact_tail, note, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'web')`,
      [requestId, userId, targetPlayer.id, realName, nickname, jerseyNumber, contactTail, note || null]
    );
    request = {
      id: requestId,
      userId,
      requestedPlayerId: targetPlayer.id,
      requestedPlayerName: targetPlayer.name,
      status: 'pending',
      realName,
      nickname,
      jerseyNumber,
      contactTail,
      note,
      source: 'web',
    };
    const admins = await db.q(`SELECT id FROM users WHERE admin_level IN ('A', 'B')`);
    await Promise.all(admins.map(a => createNotification({
      userId: a.id,
      type: 'bind_request_submitted',
      title: `新的球员绑定申请：${realName}`,
      body: `${realName} 申请绑定到「${targetPlayer.name}」。`,
      payload: { requestId, userId, playerId: targetPlayer.id },
      createdBy: userId,
    }).catch(() => null)));
    await logAudit({
      actorUserId: userId,
      action: 'submit_bind_request',
      targetType: 'bind_request',
      targetId: requestId,
      summary: `注册时申请绑定球员「${targetPlayer.name}」`,
      metadata: { playerId: targetPlayer.id, source: 'web' },
    }).catch(() => {});
  }

  const sessionToken = setSessionCookie(res, userId, req);
  res.json({
    user: { id: userId, displayName: accountName, role: 'player', adminLevel: null, adminPermissionGroups: [], permissions: [], boundPlayerId: playerId },
    player: { id: playerId, name: playerName, level: 'casual' },
    bindRequest: request,
    sessionToken,
  });
}));

// 1a. POST /api/auth/wx-login
// 小程序调用 wx.login() 后把 code 发给后端；后端换 openid，并纳入同一套 users/session 体系。
router.post('/wx-login', wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const code = clean(req.body?.code, 200);
  if (!code) return res.status(400).json({ error: 'bad_request', message: '缺少 wx.login code' });
  const consent = miniLegalConsent(req.body || {});
  if (!consent.legalAccepted || !consent.personalInfoAccepted || !consent.guardianConfirmed) {
    return res.status(400).json({
      error: 'legal_consent_required',
      message: '请先阅读并同意用户协议、隐私政策和个人信息处理规则',
      legalUrl: MINI_LEGAL_URL,
    });
  }

  const wxSession = await requestWxSession(code);
  const openid = clean(wxSession.openid, 255);
  const unionid = clean(wxSession.unionid, 255);
  if (!openid) return res.status(401).json({ error: 'wechat_login_failed', message: '微信未返回 openid' });

  let user = await findWxUser({ openid, unionid, appId: wxSession.appId });
  let isNew = false;
  const displayName = clean(req.body?.displayName || req.body?.nickName || '猎户队友', 80) || '猎户队友';
  const avatar = clean(req.body?.avatar || req.body?.avatarUrl, 1200);

  if (!user) {
    isNew = true;
    const rand = crypto.randomBytes(3).toString('hex');
    const ts = Date.now();
    const playerId = `p_wx_${ts}_${rand}`;
    const userId = `u_wx_${ts}_${rand}`;
    await db.q(
      `INSERT INTO players (id, name, photo, level, join_year)
       VALUES (?, ?, ?, 'casual', ?)`,
      [playerId, displayName, avatar || null, new Date().getFullYear()]
    );
    await db.q(
      `INSERT INTO users (id, display_name, avatar, role, bound_player_id, last_active_at)
       VALUES (?, ?, ?, 'player', ?, NOW())`,
      [userId, displayName, avatar || null, playerId]
    );
    await attachWxIdentity({ userId, openid, unionid, appId: wxSession.appId });
    await logAudit({
      actorUserId: userId,
      action: 'wechat_register',
      targetType: 'user',
      targetId: userId,
      summary: '小程序微信登录自动创建账号',
      metadata: { appId: wxSession.appId, hasUnionid: !!unionid, legalConsent: consent },
    }).catch(() => {});
    user = await db.qOne('SELECT * FROM users WHERE id = ?', [userId]);
  } else {
    await attachWxIdentity({ userId: user.id, openid, unionid, appId: wxSession.appId });
    const fields = ['last_active_at = NOW()'];
    const values = [];
    if (displayName && displayName !== '猎户队友') {
      fields.push('display_name = ?');
      values.push(displayName);
    }
    if (avatar) {
      fields.push('avatar = ?');
      values.push(avatar);
    }
    values.push(user.id);
    await db.q(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    user = await db.qOne('SELECT * FROM users WHERE id = ?', [user.id]);
  }

  const player = await loadBoundPlayer(user.id);
  if (player && player.level === 'casual' && (displayName || avatar)) {
    const fields = [];
    const values = [];
    if (displayName && displayName !== '猎户队友') { fields.push('name = ?'); values.push(displayName); }
    if (avatar) { fields.push('photo = ?'); values.push(avatar); }
    if (fields.length) {
      values.push(player.id);
      await db.q(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
    }
  }
  const sessionToken = setSessionCookie(res, user.id, req);
  res.json({
    ok: true,
    isNew,
    sessionToken,
    user: publicUserPayload(user),
    player: await loadBoundPlayer(user.id),
  });
}));

// 1b. POST /api/auth/link-email
// 小程序等已有 user 后，用一次性关联码给同一 user 增加 email 登录身份。
router.post('/link-email', wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const { code, email, password, displayName } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanCode || !cleanEmail || !password) {
    return res.status(400).json({ error: 'bad_request', message: '关联码 / 邮箱 / 密码都必填' });
  }
  const existingEmail = await db.qOne(
    'SELECT user_id FROM user_identities WHERE type = ? AND value = ?',
    ['email', cleanEmail]
  );
  if (existingEmail) return res.status(409).json({ error: 'email_taken', message: '该邮箱已被注册' });

  const user = await db.qOne(
    `SELECT * FROM users
     WHERE app_connect_code = ? AND app_connect_code_expires_at > NOW()`,
    [cleanCode]
  );
  if (!user) return res.status(404).json({ error: 'invalid_code', message: '关联码无效或已过期' });

  const hasEmail = await db.qOne(
    `SELECT id FROM user_identities WHERE user_id = ? AND type = 'email' LIMIT 1`,
    [user.id]
  );
  if (hasEmail) return res.status(409).json({ error: 'already_linked', message: '该账号已经绑定过网页邮箱' });

  await db.q(
    `INSERT INTO user_identities (user_id, type, value, password_hash) VALUES (?, 'email', ?, ?)`,
    [user.id, cleanEmail, hashPassword(password)]
  );
  const name = String(displayName || '').trim();
  if (name) await db.q('UPDATE users SET display_name = ? WHERE id = ?', [name, user.id]);
  await db.q(
    `UPDATE users
     SET app_connect_code = NULL, app_connect_code_expires_at = NULL, last_active_at = NOW()
     WHERE id = ?`,
    [user.id]
  );
  await logAudit({
    actorUserId: user.id,
    action: 'link_email_identity',
    targetType: 'user',
    targetId: user.id,
    summary: '通过一次性关联码绑定网页邮箱',
    metadata: { email: cleanEmail },
  }).catch(() => {});
  const updated = await db.qOne('SELECT * FROM users WHERE id = ?', [user.id]);
  const sessionToken = setSessionCookie(res, user.id, req);
  res.json({
    ok: true,
    user: publicUserPayload(updated),
    sessionToken,
  });
}));

// 1c. POST /api/auth/link-wechat
// 网页先注册的账号在小程序里用一次性关联码把微信身份挂到同一 user，不再新建第二个账号。
// 与 wx-login 同样要求三项法定同意；先验关联码再消费 wx code，避免无效关联码烧掉一次性 jscode。
router.post('/link-wechat', wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const code = clean(req.body?.code, 200);
  const connectCode = String(req.body?.connectCode || '').trim().toUpperCase();
  if (!code || !connectCode) {
    return res.status(400).json({ error: 'bad_request', message: '缺少微信登录 code 或网页关联码' });
  }
  const consent = miniLegalConsent(req.body || {});
  if (!consent.legalAccepted || !consent.personalInfoAccepted || !consent.guardianConfirmed) {
    return res.status(400).json({
      error: 'legal_consent_required',
      message: '请先阅读并同意用户协议、隐私政策和个人信息处理规则',
      legalUrl: MINI_LEGAL_URL,
    });
  }

  const user = await db.qOne(
    `SELECT * FROM users
     WHERE app_connect_code = ? AND app_connect_code_expires_at > NOW()`,
    [connectCode]
  );
  if (!user) return res.status(404).json({ error: 'invalid_code', message: '关联码无效或已过期，请在网页端重新生成' });

  const wxSession = await requestWxSession(code);
  const openid = clean(wxSession.openid, 255);
  const unionid = clean(wxSession.unionid, 255);
  if (!openid) return res.status(401).json({ error: 'wechat_login_failed', message: '微信未返回 openid' });

  const existingWxUser = await findWxUser({ openid, unionid, appId: wxSession.appId });
  if (existingWxUser && existingWxUser.id !== user.id) {
    return res.status(409).json({
      error: 'wechat_already_linked',
      message: '该微信此前已在小程序登录过并生成了另一个账号，请联系管理员处理合并，或直接用微信登录原账号',
    });
  }

  await attachWxIdentity({ userId: user.id, openid, unionid, appId: wxSession.appId });
  await db.q(
    `UPDATE users
     SET app_connect_code = NULL, app_connect_code_expires_at = NULL, last_active_at = NOW()
     WHERE id = ?`,
    [user.id]
  );
  await logAudit({
    actorUserId: user.id,
    action: 'link_wechat_identity',
    targetType: 'user',
    targetId: user.id,
    summary: '通过一次性关联码把微信登录关联到已有网页账号',
    metadata: { appId: wxSession.appId, hasUnionid: !!unionid, legalConsent: consent },
  }).catch(() => {});
  const updated = await db.qOne('SELECT * FROM users WHERE id = ?', [user.id]);
  const sessionToken = setSessionCookie(res, user.id, req);
  res.json({
    ok: true,
    isNew: false,
    linked: true,
    sessionToken,
    user: publicUserPayload(updated),
    player: await loadBoundPlayer(user.id),
  });
}));

// 2. POST /api/auth/login
// body: { email, password }
router.post('/login', wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'bad_request', message: '邮箱密码必填' });
  }
  const id = await db.qOne(
    `SELECT ui.user_id, ui.password_hash, u.id, u.display_name, u.avatar, u.role, u.admin_level,
            u.admin_permission_groups,
            u.admin_granted_by, u.admin_granted_at, u.bound_player_id, u.last_active_at
     FROM user_identities ui JOIN users u ON u.id = ui.user_id
     WHERE ui.type = 'email' AND ui.value = ?`,
    [email.toLowerCase()]
  );
  if (!id) return res.status(401).json({ error: 'auth_failed', message: '邮箱或密码错误' });
  if (!verifyPassword(password, id.password_hash)) {
    return res.status(401).json({ error: 'auth_failed', message: '邮箱或密码错误' });
  }
  // 更新 lastActiveAt
  await db.q('UPDATE users SET last_active_at = NOW() WHERE id = ?', [id.user_id]);
  const sessionToken = setSessionCookie(res, id.user_id, req);
  res.json({
    user: publicUserPayload({ ...id, id: id.user_id, last_active_at: new Date() }),
    sessionToken,
  });
}));

// 3. POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

// 4. GET /api/auth/me
router.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  await ensurePlayerPublicProfileSchema();
  const player = req.user.bound_player_id
    ? await db.qOne(`
        SELECT id, name, level, photo, position, number,
               public_display_name AS publicDisplayName,
               public_avatar AS publicAvatar
        FROM players WHERE id = ?
      `, [req.user.bound_player_id])
    : null;
  res.json({
    user: publicUserPayload(req.user),
    player,
  });
}));

// 4b. PATCH /api/auth/me
// body: { displayName?, avatar? } —— 让用户更新自己的昵称和头像
//
// 双身份模型：
// - user 视角（昵称 + 头像）：当前路由更新
// - 球员档案（name + photo）：admin 维护，用户不能直接改
//
// 但当用户绑定的是 casual player（试训态）时，同步把昵称/头像写到 player：
//   - 试训态下，player 是用户的"占位档案"，让球员墙试训区直接展示最新昵称+头像
//   - 升级到 verified 后（绑定预置档案），player 是真实档案，PATCH /me 不再写 player
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const { displayName, avatar } = req.body || {};
  const fields = [], values = [];
  if (displayName !== undefined) {
    if (!displayName.trim()) return res.status(400).json({ error: 'bad_request', message: '昵称不能为空' });
    if (displayName.length > 80) return res.status(400).json({ error: 'bad_request', message: '昵称过长' });
    fields.push('display_name = ?'); values.push(displayName.trim());
  }
  if (avatar !== undefined) {
    fields.push('avatar = ?'); values.push(avatar || null);
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request', message: '没有可更新字段' });
  values.push(req.user.id);
  await db.q(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  // 同步到 casual player（试训态占位档案）
  if (req.user.bound_player_id) {
    const p = await db.qOne(`SELECT level FROM players WHERE id = ?`, [req.user.bound_player_id]);
    if (p && p.level === 'casual') {
      const pFields = [], pValues = [];
      if (displayName !== undefined) { pFields.push('name = ?'); pValues.push(displayName.trim()); }
      if (avatar !== undefined)      { pFields.push('photo = ?'); pValues.push(avatar || null); }
      if (pFields.length) {
        pValues.push(req.user.bound_player_id);
        await db.q(`UPDATE players SET ${pFields.join(', ')} WHERE id = ?`, pValues);
      }
    }
  }
  const updated = await db.qOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({
    user: publicUserPayload(updated)
  });
}));

// 5. POST /api/auth/heartbeat
// 心跳：每 30 秒由前端调一次更新 last_active_at，驱动在线状态
router.post('/heartbeat', requireAuth, wrap(async (req, res) => {
  await db.q('UPDATE users SET last_active_at = NOW() WHERE id = ?', [req.user.id]);
  res.json({ ok: true, ts: new Date().toISOString() });
}));

// 5b. POST /api/auth/app-connect-code
// 小程序账号需要后续关联网页邮箱时生成一次性关联码。
router.post('/app-connect-code', requireAuth, wrap(async (req, res) => {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  await db.q(
    `UPDATE users
     SET app_connect_code = ?, app_connect_code_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
     WHERE id = ?`,
    [code, req.user.id]
  );
  await logAudit({
    actorUserId: req.user.id,
    action: 'app_connect_code_create',
    targetType: 'user',
    targetId: req.user.id,
    summary: '生成小程序/网页账号关联码',
    metadata: { expiresInMinutes: 30 },
  }).catch(() => {});
  res.json({
    ok: true,
    code,
    expiresInMinutes: 30,
  });
}));

// 6. POST /api/auth/redeem-bind-code
// body: { code } — 把当前 casual user 升级到 bind code 关联的 verified player
// 同时迁移 attendance / pointsAdjustments，删除 casual player
router.post('/redeem-bind-code', requireAuth, wrap(async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'bad_request', message: '请输入绑定码' });

  const entry = await db.qOne('SELECT * FROM bind_codes WHERE code = ?', [code]);
  if (!entry) return res.status(404).json({ error: 'invalid_code', message: '绑定码无效' });
  if (entry.used) return res.status(409).json({ error: 'used_code', message: '该绑定码已被使用' });

  const targetPlayer = await db.qOne('SELECT * FROM players WHERE id = ?', [entry.player_id]);
  if (!targetPlayer) return res.status(404).json({ error: 'player_missing', message: '绑定码关联的球员不存在' });

  const result = await bindUserToPlayer({
    userId: req.user.id,
    playerId: entry.player_id,
    actorUserId: req.user.id,
    method: 'bind_code',
    bindCode: code,
  });
  res.json({ ok: true, player: result.player, migrated: result.migrated });
}));

module.exports = router;
