// /api/admin/* — 管理员专用 API
//
//   GET  /api/admin/users                        列出所有注册用户（A 全站级）
//   PATCH /api/admin/users/:id/admin-level       授予/回收后台权限（A 全站级）
//   POST /api/admin/users/:id/reset-password     重置某用户密码（A 全站级）

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { hashPassword } = require('../auth-helpers');
const {
  ADMIN_LEVELS,
  ADMIN_PERMISSION_GROUPS,
  OWNER_EMAIL,
  ensurePermissionsSchema,
  hasPermission,
  isOwnerUserId,
  normalizePermissionGroups,
  permissionsForUser,
} = require('../permissions');
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
const MAX_ADMIN_USER_LIMIT = 100;

function parseAdminUserLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_ADMIN_USER_LIMIT);
}

function parseAdminUserOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10000);
}

function rowToUser(u) {
  const userLike = {
    role: u.role,
    admin_level: u.admin_level,
    admin_permission_groups: u.admin_permission_groups,
  };
  return {
    id: u.id,
    email: u.email || '',
    displayName: u.display_name,
    role: u.role,
    adminLevel: u.admin_level || null,
    adminPermissionGroups: normalizePermissionGroups(userLike),
    adminGrantedBy: u.admin_granted_by || null,
    adminGrantedByName: u.admin_granted_by_name || '',
    adminGrantedAt: u.admin_granted_at || null,
    permissions: permissionsForUser(userLike),
    isOwner: u.email === OWNER_EMAIL,
    avatar: u.avatar,
    boundPlayerId: u.bound_player_id,
    boundPlayerName: u.player_name,
    boundPlayerNumber: u.player_number,
    boundPlayerPosition: u.player_position || '',
    lastActiveAt: u.last_active_at,
    createdAt: u.created_at,
  };
}

// 列出用户（带绑定 player 信息）；不传 limit 时保持旧版全量返回兼容
router.get('/users', requirePermission('users:read'), wrap(async (req, res) => {
  await ensurePermissionsSchema();
  await ensurePeopleTables();
  const limit = parseAdminUserLimit(req.query.limit);
  const offset = parseAdminUserOffset(req.query.offset);
  const pageSql = limit ? ' LIMIT ? OFFSET ?' : '';
  const pageParams = limit ? [limit + 1, offset] : [];
  const users = await db.q(`
    SELECT
      u.id, u.display_name, u.role, u.admin_level, u.admin_granted_by, u.admin_granted_at,
      u.admin_permission_groups, u.bound_player_id, u.avatar,
      u.last_active_at, u.created_at,
      ui.value AS email,
      p.name AS player_name, p.number AS player_number, p.position AS player_position,
      grantor.display_name AS admin_granted_by_name
    FROM users u
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    LEFT JOIN players p ON p.id = u.bound_player_id
    LEFT JOIN users grantor ON grantor.id = u.admin_granted_by
    ORDER BY u.created_at DESC
    ${pageSql}
  `, pageParams);
  const pageUsers = limit ? users.slice(0, limit) : users;
  res.json({
    users: pageUsers.map(rowToUser),
    hasMore: limit ? users.length > limit : false,
    nextOffset: limit ? offset + pageUsers.length : users.length,
  });
}));

// 支持 limit/offset/keyword 分页用户候选;includePlayers=false 时跳过球员候选(小程序用已分页球员池)。
// 不传 limit 时保持旧版行为(用户上限 200 + 全量正式球员)。
router.get('/bind-invitation-options', requirePermission('bind_codes:manage'), wrap(async (req, res) => {
  await ensurePeopleTables();
  const limit = parseAdminUserLimit(req.query.limit);
  const offset = parseAdminUserOffset(req.query.offset);
  const keyword = String(req.query.keyword || req.query.q || '').trim();
  const includePlayers = !(req.query.includePlayers === 'false' || req.query.includePlayers === '0');
  const userFilters = [], userParams = [];
  if (keyword) {
    const like = `%${keyword}%`;
    userFilters.push('(u.display_name LIKE ? OR ui.value LIKE ? OR p.name LIKE ?)');
    userParams.push(like, like, like);
  }
  const userWhere = userFilters.length ? `WHERE ${userFilters.join(' AND ')}` : '';
  const userQueryLimit = limit ? limit + 1 : 200;
  const users = await db.q(`
    SELECT
      u.id, u.display_name, u.bound_player_id, u.created_at,
      ui.value AS email,
      p.name AS player_name, p.number AS player_number, p.position AS player_position
    FROM users u
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    LEFT JOIN players p ON p.id = u.bound_player_id
    ${userWhere}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `, userParams.concat([userQueryLimit, limit ? offset : 0]));
  const pageUsers = limit ? users.slice(0, limit) : users;
  const players = includePlayers
    ? await db.q(`
        SELECT id, name, number, position
        FROM players
        WHERE level = 'verified'
        ORDER BY created_at ASC
        ${limit ? 'LIMIT 200' : ''}
      `)
    : [];
  const payload = {
    users: pageUsers.map(u => ({
      id: u.id,
      displayName: u.display_name || u.email || u.id,
      email: u.email || '',
      boundPlayerId: u.bound_player_id || '',
      boundPlayerName: u.player_name || '',
      boundPlayerNumber: u.player_number || '',
      boundPlayerPosition: u.player_position || '',
      createdAt: u.created_at,
    })),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      level: 'verified',
    })),
  };
  if (limit) {
    payload.usersHasMore = users.length > limit;
    payload.usersNextOffset = offset + pageUsers.length;
  }
  res.json(payload);
}));

router.patch('/users/:id/admin-level', requirePermission('users:grant_admin'), wrap(async (req, res) => {
  await ensurePermissionsSchema();
  const { id } = req.params;
  const raw = req.body?.adminLevel ?? req.body?.admin_level ?? null;
  const requestedGroups = req.body?.adminPermissionGroups ?? req.body?.admin_permission_groups ?? req.body?.permissionGroups ?? [];
  const groups = Array.isArray(requestedGroups)
    ? Array.from(new Set(requestedGroups.map(g => String(g || '').trim().toLowerCase()).filter(g => ADMIN_PERMISSION_GROUPS.has(g))))
    : [];
  let adminLevel = raw ? String(raw).trim().toUpperCase() : null;
  if (!adminLevel && groups.length) adminLevel = 'C';
  if (adminLevel && !ADMIN_LEVELS.has(adminLevel)) {
    return res.status(400).json({ error: 'bad_request', message: 'adminLevel 只能是 A / B / C / null' });
  }
  if (adminLevel === 'C' && !groups.length) {
    return res.status(400).json({ error: 'bad_request', message: '组员级至少选择数据组或运营组' });
  }
  const target = await db.qOne(`
    SELECT u.*, ui.value AS email
    FROM users u
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    WHERE u.id = ?
    LIMIT 1
  `, [id]);
  if (!target) return res.status(404).json({ error: 'not_found', message: '用户不存在' });

  const isOwner = target.email === OWNER_EMAIL || await isOwnerUserId(id);
  if (isOwner && adminLevel !== 'A') {
    return res.status(403).json({ error: 'owner_protected', message: `${OWNER_EMAIL} 不能被降级或回收权限` });
  }
  if (id === req.user.id && adminLevel !== 'A') {
    return res.status(400).json({ error: 'self_downgrade', message: '不能降级或回收自己的全站级权限' });
  }

  const before = {
    role: target.role,
    adminLevel: target.admin_level || null,
    adminPermissionGroups: normalizePermissionGroups(target),
  };
  if (adminLevel) {
    const storedGroups = (adminLevel === 'A' || adminLevel === 'B') ? ['data', 'ops'] : groups;
    await db.q(`
      UPDATE users
      SET role = 'admin',
          admin_level = ?,
          admin_permission_groups = ?,
          admin_granted_by = ?,
          admin_granted_at = NOW()
      WHERE id = ?
    `, [adminLevel, JSON.stringify(storedGroups), req.user.id, id]);
  } else {
    await db.q(`
      UPDATE users
      SET role = 'player',
          admin_level = NULL,
          admin_permission_groups = NULL,
          admin_granted_by = NULL,
          admin_granted_at = NULL
      WHERE id = ?
    `, [id]);
  }

  const updated = await db.qOne(`
    SELECT u.*, ui.value AS email, p.name AS player_name, p.number AS player_number, p.position AS player_position,
           grantor.display_name AS admin_granted_by_name
    FROM users u
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    LEFT JOIN players p ON p.id = u.bound_player_id
    LEFT JOIN users grantor ON grantor.id = u.admin_granted_by
    WHERE u.id = ?
    LIMIT 1
  `, [id]);
  await logAudit({
    actorUserId: req.user.id,
    action: 'admin_permission_update',
    targetType: 'user',
    targetId: id,
    summary: `调整后台权限：${updated.display_name} -> ${adminLevel || '普通用户'}`,
    metadata: {
      before,
      after: {
        role: updated.role,
        adminLevel: updated.admin_level || null,
        adminPermissionGroups: normalizePermissionGroups(updated),
      },
    },
  }).catch(() => {});
  await createNotification({
    userId: id,
    type: 'admin_permission_update',
    title: adminLevel ? `后台权限已调整为 ${adminLevel}` : '后台权限已回收',
    body: adminLevel ? '请重新进入管理后台以获取最新权限。' : '你的后台管理权限已被回收。',
    payload: {
      before,
      after: {
        role: updated.role,
        adminLevel: updated.admin_level || null,
        adminPermissionGroups: normalizePermissionGroups(updated),
      },
    },
    createdBy: req.user.id,
  }).catch(() => {});
  res.json({ ok: true, user: rowToUser(updated) });
}));

router.delete('/users/:id', requirePermission('destructive:delete'), wrap(async (req, res) => {
  await ensurePermissionsSchema();
  await ensurePeopleTables();
  const { id } = req.params;
  if (id === req.user.id) {
    return res.status(400).json({ error: 'self_delete', message: '不能删除当前登录账号' });
  }
  if (await isOwnerUserId(id)) {
    return res.status(403).json({ error: 'owner_protected', message: `${OWNER_EMAIL} 不能被删除` });
  }

  const conn = await db.getPool().getConnection();
  let deletedUser;
  let deletedCasualPlayer = null;
  try {
    await conn.beginTransaction();
    const [[target]] = await conn.execute(`
      SELECT u.*, ui.value AS email, p.id AS player_id, p.name AS player_name, p.level AS player_level
      FROM users u
      LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
      LEFT JOIN players p ON p.id = u.bound_player_id
      WHERE u.id = ?
      LIMIT 1
      FOR UPDATE
    `, [id]);
    if (!target) {
      await conn.rollback();
      return res.status(404).json({ error: 'not_found', message: '用户不存在' });
    }
    if (target.email === OWNER_EMAIL) {
      await conn.rollback();
      return res.status(403).json({ error: 'owner_protected', message: `${OWNER_EMAIL} 不能被删除` });
    }

    deletedUser = {
      id: target.id,
      displayName: target.display_name,
      email: target.email || '',
      role: target.role,
      adminLevel: target.admin_level || null,
      adminPermissionGroups: normalizePermissionGroups(target),
      boundPlayerId: target.bound_player_id || null,
      boundPlayerName: target.player_name || '',
      boundPlayerLevel: target.player_level || '',
    };

    if (target.bound_player_id && target.player_level === 'casual') {
      const [[otherBound]] = await conn.execute(
        'SELECT COUNT(*) AS n FROM users WHERE bound_player_id = ? AND id <> ?',
        [target.bound_player_id, id]
      );
      if (!Number(otherBound?.n || 0)) {
        deletedCasualPlayer = { id: target.bound_player_id, name: target.player_name || '' };
      }
    }

    await conn.execute('UPDATE users SET admin_granted_by = NULL WHERE admin_granted_by = ?', [id]);
    await conn.execute('UPDATE attendances SET created_by = NULL WHERE created_by = ?', [id]);
    await conn.execute('UPDATE points_adjustments SET created_by = NULL WHERE created_by = ?', [id]);
    await conn.execute('UPDATE bind_codes SET used_by = NULL WHERE used_by = ?', [id]);
    await conn.execute('UPDATE admin_audit_logs SET actor_user_id = NULL WHERE actor_user_id = ?', [id]);
    await conn.execute('UPDATE user_notifications SET created_by = NULL WHERE created_by = ?', [id]);
    await conn.execute('UPDATE player_bind_requests SET reviewed_by = NULL WHERE reviewed_by = ?', [id]);
    await conn.execute('DELETE FROM user_notifications WHERE user_id = ?', [id]);
    await conn.execute('DELETE FROM player_bind_requests WHERE user_id = ?', [id]);
    await conn.execute('DELETE FROM user_identities WHERE user_id = ?', [id]);
    await conn.execute('DELETE FROM users WHERE id = ?', [id]);
    if (deletedCasualPlayer) {
      await conn.execute('DELETE FROM players WHERE id = ?', [deletedCasualPlayer.id]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await logAudit({
    actorUserId: req.user.id,
    action: 'delete_user',
    targetType: 'user',
    targetId: deletedUser.id,
    summary: `删除用户账号：${deletedUser.displayName}`,
    metadata: { deletedUser, deletedCasualPlayer },
  }).catch(() => {});
  res.json({ ok: true, deletedUser, deletedCasualPlayer });
}));

router.post('/users/:id/bind-player', requirePermission('users:bind_direct'), wrap(async (req, res) => {
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

router.post('/users/:id/unbind-player', requirePermission('users:bind_direct'), wrap(async (req, res) => {
  const result = await unbindUserFromPlayer({ userId: req.params.id, actorUserId: req.user.id });
  res.json(result);
}));

router.post('/users/:id/app-connect-code', requirePermission('users:app_connect_code'), wrap(async (req, res) => {
  const user = await db.qOne('SELECT id, display_name FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'not_found', message: '用户不存在' });
  const existingEmail = await db.qOne(
    `SELECT id FROM user_identities WHERE user_id = ? AND type = 'email' LIMIT 1`,
    [req.params.id]
  );
  if (existingEmail) {
    return res.status(409).json({ error: 'already_linked', message: '该用户已经有网页邮箱登录身份' });
  }
  const code = `APP-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  await db.q(
    `UPDATE users
     SET app_connect_code = ?, app_connect_code_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
     WHERE id = ?`,
    [code, req.params.id]
  );
  await logAudit({
    actorUserId: req.user.id,
    action: 'create_app_connect_code',
    targetType: 'user',
    targetId: req.params.id,
    summary: `生成网页关联码：${user.display_name}`,
    metadata: { expiresInMinutes: 30 },
  }).catch(() => {});
  res.json({ ok: true, code, expiresInMinutes: 30 });
}));

router.post('/bind-invitations', requirePermission('bind_codes:manage'), wrap(async (req, res) => {
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

router.get('/audit-logs', wrap(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  if (!hasPermission(req.user, 'audit:read') && !hasPermission(req.user, 'audit:game_read')) {
    return res.status(403).json({ error: 'forbidden', message: '权限不足', permission: 'audit:read' });
  }
  next();
}), wrap(async (req, res) => {
  await ensurePeopleTables();
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
  const offset = Math.min(Math.max(Number(req.query.offset || 0), 0), 5000);
  const gameOnly = !hasPermission(req.user, 'audit:read') && hasPermission(req.user, 'audit:game_read');
  const filters = [];
  const params = [];
  if (gameOnly) {
    filters.push("l.target_type = 'game'");
  } else if (req.query.targetType) {
    filters.push('l.target_type = ?');
    params.push(String(req.query.targetType).slice(0, 40));
  }
  if (req.query.action) {
    filters.push('l.action = ?');
    params.push(String(req.query.action).slice(0, 60));
  }
  if (req.query.q) {
    const keyword = `%${String(req.query.q).trim().slice(0, 80)}%`;
    filters.push('(l.summary LIKE ? OR l.action LIKE ? OR l.target_id LIKE ? OR u.display_name LIKE ?)');
    params.push(keyword, keyword, keyword, keyword);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.q(`
    SELECT l.*, u.display_name AS actor_name
    FROM admin_audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `, params);
  const hasMore = rows.length > limit;
  res.json({
    logs: rows.slice(0, limit).map(rowToAuditLog),
    hasMore,
    nextOffset: offset + Math.min(rows.length, limit),
    scope: gameOnly ? 'game' : 'all',
  });
}));

// 重置某用户密码 — admin 设置新密码，回头通过 IM/邮箱 告诉用户
router.post('/users/:id/reset-password', requirePermission('users:password_reset'), wrap(async (req, res) => {
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
