// /api/notifications/* — 站内信 / 绑定邀请
const express = require('express');
const db = require('../db');
const { wrap, requireAuth } = require('../middleware');
const { ensurePeopleTables, rowToNotification } = require('../people-helpers');

const router = express.Router();

router.get('/', requireAuth, wrap(async (req, res) => {
  await ensurePeopleTables();
  const rows = await db.q(
    `SELECT *
     FROM user_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({ notifications: rows.map(rowToNotification) });
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
