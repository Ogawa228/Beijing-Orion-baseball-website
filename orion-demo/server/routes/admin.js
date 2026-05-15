// /api/admin/* — 管理员专用 API
//
//   GET  /api/admin/users                        列出所有注册用户（admin only）
//   POST /api/admin/users/:id/reset-password     重置某用户密码（admin only）
//
// 安全：所有路由都走 requireAdmin 中间件。

const express = require('express');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');
const { hashPassword } = require('../auth-helpers');
const {
  ensurePeopleTables,
  rowToAuditLog,
  logAudit,
  createNotification,
  generateBindCode,
  bindUserToPlayer,
  unbindUserFromPlayer,
} = require('../people-helpers');

const router = express.Router();

// 列出所有用户（带绑定 player 信息）
router.get('/users', requireAdmin, wrap(async (_req, res) => {
  await ensurePeopleTables();
  const users = await db.q(`
    SELECT
      u.id, u.display_name, u.role, u.bound_player_id, u.avatar,
      u.last_active_at, u.created_at,
      ui.value AS email,
      p.name AS player_name, p.number AS player_number
    FROM users u
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    LEFT JOIN players p ON p.id = u.bound_player_id
    ORDER BY u.created_at DESC
  `);
  res.json({
    users: users.map(u => ({
      id: u.id,
      email: u.email || '',
      displayName: u.display_name,
      role: u.role,
      avatar: u.avatar,
      boundPlayerId: u.bound_player_id,
      boundPlayerName: u.player_name,
      boundPlayerNumber: u.player_number,
      lastActiveAt: u.last_active_at,
      createdAt: u.created_at,
    })),
  });
}));

router.post('/users/:id/bind-player', requireAdmin, wrap(async (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'bad_request', message: 'playerId 必填' });
  const result = await bindUserToPlayer({
    userId: req.params.id,
    playerId,
    actorUserId: req.user.id,
    method: 'admin_direct',
  });
  res.json(result);
}));

router.post('/users/:id/unbind-player', requireAdmin, wrap(async (req, res) => {
  const result = await unbindUserFromPlayer({ userId: req.params.id, actorUserId: req.user.id });
  res.json(result);
}));

router.post('/bind-invitations', requireAdmin, wrap(async (req, res) => {
  await ensurePeopleTables();
  const { userId, playerId, message } = req.body || {};
  if (!userId || !playerId) return res.status(400).json({ error: 'bad_request', message: 'userId / playerId 必填' });
  const user = await db.qOne('SELECT id, display_name FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'not_found', message: '用户不存在' });
  const player = await db.qOne('SELECT id, name, number, position FROM players WHERE id = ?', [playerId]);
  if (!player) return res.status(404).json({ error: 'player_missing', message: '球员不存在' });

  const conn = await db.getPool().getConnection();
  let code;
  try {
    const [[existing]] = await conn.execute(
      'SELECT code FROM bind_codes WHERE player_id = ? AND used = FALSE ORDER BY created_at DESC LIMIT 1',
      [playerId]
    );
    code = existing ? existing.code : await generateBindCode(conn, playerId);
  } finally {
    conn.release();
  }

  const note = await createNotification({
    userId,
    type: 'bind_invitation',
    title: `绑定球员档案：${player.name}`,
    body: message || `管理员邀请你绑定到「${player.name}${player.number ? ' #' + player.number : ''}」的正式球员档案。`,
    payload: { code, playerId, playerName: player.name, playerNumber: player.number || '', playerPosition: player.position || '' },
    createdBy: req.user.id,
  });
  await logAudit({
    actorUserId: req.user.id,
    action: 'send_bind_invitation',
    targetType: 'user',
    targetId: userId,
    summary: `向「${user.display_name}」发送绑定邀请：${player.name}`,
    metadata: { playerId, code, notificationId: note.id },
  });
  res.status(201).json({ ok: true, notification: note, code });
}));

router.get('/audit-logs', requireAdmin, wrap(async (req, res) => {
  await ensurePeopleTables();
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
  const rows = await db.q(`
    SELECT l.*, u.display_name AS actor_name
    FROM admin_audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  `);
  res.json({ logs: rows.map(rowToAuditLog) });
}));

// 重置某用户密码 — admin 设置新密码，回头通过 IM/邮箱 告诉用户
router.post('/users/:id/reset-password', requireAdmin, wrap(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: '新密码不能为空' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'weak_password', message: '密码至少 6 位' });
  }
  // 防 admin 误操作把自己锁出去：不允许重置自己用这个接口（自己改密走 PATCH /me）
  if (id === req.user.id) {
    return res.status(400).json({ error: 'self_reset', message: '不能用此接口重置自己的密码，请用「我的资料」改密' });
  }
  const target = await db.qOne('SELECT id FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: 'not_found', message: '用户不存在' });

  const hashed = hashPassword(newPassword);
  // 用户登录走 user_identities.password_hash（type = 'email'）
  const result = await db.q(
    `UPDATE user_identities SET password_hash = ? WHERE user_id = ? AND type = 'email'`,
    [hashed, id]
  );
  if (!result.affectedRows) {
    return res.status(404).json({ error: 'no_identity', message: '该用户没有邮箱登录身份，无法重置' });
  }
  await logAudit({
    actorUserId: req.user.id,
    action: 'reset_password',
    targetType: 'user',
    targetId: id,
    summary: '管理员重置用户密码',
    metadata: {},
  }).catch(() => {});
  res.json({ ok: true, message: '密码已重置' });
}));

module.exports = router;
