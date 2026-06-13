// /api/notifications/* — 站内信 / 绑定邀请
const express = require('express');
const db = require('../db');
const { wrap, requireAuth, requirePermission } = require('../middleware');
const {
  ensurePeopleTables,
  rowToNotification,
  createNotification,
  logAudit,
} = require('../people-helpers');

const router = express.Router();
const MAX_RECIPIENTS = 500;
const DEFAULT_NOTIFICATION_LIMIT = 30;
const MAX_NOTIFICATION_LIMIT = 100;

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function parseLimit(value, fallback = DEFAULT_NOTIFICATION_LIMIT) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_NOTIFICATION_LIMIT);
}

function parseOffset(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function loadRecipients(scope, playerId) {
  if (scope === 'verified') {
    return db.q(
      `SELECT u.id, u.display_name
       FROM users u
       JOIN players p ON p.id = u.bound_player_id
       WHERE p.level = 'verified'
       ORDER BY u.created_at DESC
       LIMIT ${MAX_RECIPIENTS}`
    );
  }
  if (scope === 'trial') {
    return db.q(
      `SELECT u.id, u.display_name
       FROM users u
       LEFT JOIN players p ON p.id = u.bound_player_id
       WHERE COALESCE(p.level, 'casual') <> 'verified'
       ORDER BY u.created_at DESC
       LIMIT ${MAX_RECIPIENTS}`
    );
  }
  if (scope === 'admins') {
    return db.q(
      `SELECT u.id, u.display_name
       FROM users u
       WHERE u.role = 'admin'
          OR u.admin_level IS NOT NULL
          OR u.admin_permission_groups IS NOT NULL
       ORDER BY u.created_at DESC
       LIMIT ${MAX_RECIPIENTS}`
    );
  }
  if (scope === 'player') {
    if (!playerId) return [];
    return db.q(
      `SELECT u.id, u.display_name
       FROM users u
       WHERE u.bound_player_id = ?
       ORDER BY u.created_at DESC
       LIMIT ${MAX_RECIPIENTS}`,
      [playerId]
    );
  }
  return db.q(
    `SELECT u.id, u.display_name
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT ${MAX_RECIPIENTS}`
  );
}

router.get('/', requireAuth, wrap(async (req, res) => {
  await ensurePeopleTables();
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const rows = await db.q(
    `SELECT *
     FROM user_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, limit + 1, offset]
  );
  const pageRows = rows.slice(0, limit);
  const unread = await db.qOne(
    `SELECT COUNT(*) AS total
     FROM user_notifications
     WHERE user_id = ? AND read_at IS NULL`,
    [req.user.id]
  ).catch(() => ({ total: pageRows.filter(row => !row.read_at).length }));
  res.json({
    notifications: pageRows.map(rowToNotification),
    unreadCount: Number(unread?.total) || 0,
    hasMore: rows.length > limit,
    nextOffset: offset + pageRows.length,
  });
}));

router.post('/', requirePermission('notifications:write'), wrap(async (req, res) => {
  await ensurePeopleTables();
  const title = clean(req.body?.title, 80);
  const body = clean(req.body?.body, 800);
  const scope = clean(req.body?.scope || 'all', 20);
  const playerId = clean(req.body?.playerId, 64);
  if (!title) return res.status(400).json({ error: 'bad_request', message: '请填写通知标题' });
  if (!body) return res.status(400).json({ error: 'bad_request', message: '请填写通知内容' });
  if (!['all', 'verified', 'trial', 'admins', 'player'].includes(scope)) {
    return res.status(400).json({ error: 'bad_request', message: '通知范围无效' });
  }
  if (scope === 'player' && !playerId) {
    return res.status(400).json({ error: 'bad_request', message: '请选择指定球员' });
  }

  const recipients = await loadRecipients(scope, playerId);
  if (!recipients.length) {
    return res.status(400).json({ error: 'no_recipients', message: '没有匹配的接收人' });
  }
  const notifications = await Promise.all(recipients.map(user => createNotification({
    userId: user.id,
    type: 'admin_broadcast',
    title,
    body,
    payload: {
      source: 'mini_admin',
      targetScope: scope,
      playerId: scope === 'player' ? playerId : '',
    },
    createdBy: req.user.id,
  })));
  await logAudit({
    actorUserId: req.user.id,
    action: 'send_notification',
    targetType: 'notification',
    targetId: notifications[0]?.id || '',
    summary: `发送站内通知：${title}（${notifications.length} 人）`,
    metadata: {
      title,
      scope,
      playerId: scope === 'player' ? playerId : '',
      recipientCount: notifications.length,
      recipientIds: recipients.slice(0, 50).map(user => user.id),
    },
  }).catch(() => {});
  res.status(201).json({ ok: true, count: notifications.length, notifications });
}));

router.post('/:id/read', requireAuth, wrap(async (req, res) => {
  await ensurePeopleTables();
  await db.q(
    `UPDATE user_notifications
     SET read_at = IFNULL(read_at, NOW())
     WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  );
  const row = await db.qOne('SELECT * FROM user_notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'not_found', message: '站内信不存在' });
  res.json({ notification: rowToNotification(row) });
}));

module.exports = { router };
