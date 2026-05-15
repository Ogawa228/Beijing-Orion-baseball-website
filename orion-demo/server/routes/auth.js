// /api/auth/* 路由：注册、登录、登出、当前用户、绑定码
//
// 设计：
// - register 自动建 casual player + email identity（首次注册 = 试训队员）
// - login 用 user_identities 表查 email → user → 校验密码 → 设 cookie
// - me 返回当前 user + bound player 简要信息
// - redeem-bind-code 用绑定码升级到 verified（迁数据 + 删 casual player + 改 boundPlayerId）

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } = require('../auth-helpers');
const { wrap, requireAuth } = require('../middleware');
const { bindUserToPlayer } = require('../people-helpers');

const router = express.Router();

// 1. POST /api/auth/register
// body: { email, password, displayName }
// 副作用：建 user + email identity + casual player（boundPlayerId 立即关联）
router.post('/register', wrap(async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'bad_request', message: '邮箱 / 密码 / 昵称都必填' });
  }
  // 邮箱已注册？
  const existing = await db.qOne(
    'SELECT user_id FROM user_identities WHERE type = ? AND value = ?',
    ['email', email.toLowerCase()]
  );
  if (existing) return res.status(409).json({ error: 'email_taken', message: '该邮箱已被注册' });

  // 1. 建 casual player
  const rand = crypto.randomBytes(3).toString('hex');
  const ts = Date.now();
  const playerId = `p_user_${ts}_${rand}`;
  await db.q(
    `INSERT INTO players (id, name, level, join_year) VALUES (?, ?, 'casual', ?)`,
    [playerId, displayName, new Date().getFullYear()]
  );
  // 2. 建 user
  const userId = `u_${ts}_${rand}`;
  await db.q(
    `INSERT INTO users (id, display_name, role, bound_player_id, last_active_at) VALUES (?, ?, 'player', ?, NOW())`,
    [userId, displayName, playerId]
  );
  // 3. 建 email identity（密码哈希）
  await db.q(
    `INSERT INTO user_identities (user_id, type, value, password_hash) VALUES (?, 'email', ?, ?)`,
    [userId, email.toLowerCase(), hashPassword(password)]
  );

  setSessionCookie(res, userId);
  res.json({
    user: { id: userId, displayName, role: 'player', boundPlayerId: playerId },
    player: { id: playerId, name: displayName, level: 'casual' },
  });
}));

// 2. POST /api/auth/login
// body: { email, password }
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'bad_request', message: '邮箱密码必填' });
  }
  const id = await db.qOne(
    `SELECT ui.user_id, ui.password_hash, u.id, u.display_name, u.role, u.bound_player_id
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
  setSessionCookie(res, id.user_id);
  res.json({
    user: {
      id: id.user_id,
      displayName: id.display_name,
      role: id.role,
      boundPlayerId: id.bound_player_id,
    },
  });
}));

// 3. POST /api/auth/logout
router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// 4. GET /api/auth/me
router.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const player = req.user.bound_player_id
    ? await db.qOne('SELECT id, name, level, photo, position, number FROM players WHERE id = ?', [req.user.bound_player_id])
    : null;
  res.json({
    user: {
      id: req.user.id,
      displayName: req.user.display_name,
      avatar: req.user.avatar,
      role: req.user.role,
      boundPlayerId: req.user.bound_player_id,
      lastActiveAt: req.user.last_active_at,
    },
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
    user: {
      id: updated.id,
      displayName: updated.display_name,
      avatar: updated.avatar,
      role: updated.role,
      boundPlayerId: updated.bound_player_id,
    }
  });
}));

// 5. POST /api/auth/heartbeat
// 心跳：每 30 秒由前端调一次更新 last_active_at，驱动在线状态
router.post('/heartbeat', requireAuth, wrap(async (req, res) => {
  await db.q('UPDATE users SET last_active_at = NOW() WHERE id = ?', [req.user.id]);
  res.json({ ok: true, ts: new Date().toISOString() });
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
