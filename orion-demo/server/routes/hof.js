// /api/hall-of-fame/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');

const router = express.Router();

function rowToHOF(r) {
  if (!r) return null;
  return {
    playerId: r.player_id, inductedYear: r.inducted_year, reason: r.reason,
    createdAt: r.created_at,
  };
}

router.get('/', wrap(async (_req, res) => {
  const rows = await db.q('SELECT * FROM hall_of_fame ORDER BY inducted_year DESC, created_at ASC');
  res.json({ hallOfFame: rows.map(rowToHOF) });
}));

// POST /api/hall-of-fame - admin 添加入选
router.post('/', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.playerId) return res.status(400).json({ error: 'bad_request', message: 'playerId 必填' });
  await db.q(
    `INSERT INTO hall_of_fame (player_id, inducted_year, reason) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE inducted_year = VALUES(inducted_year), reason = VALUES(reason)`,
    [b.playerId, b.inductedYear || new Date().getFullYear(), b.reason || '']
  );
  const row = await db.qOne('SELECT * FROM hall_of_fame WHERE player_id = ?', [b.playerId]);
  res.status(201).json({ entry: rowToHOF(row) });
}));

router.delete('/:playerId', requireAdmin, wrap(async (req, res) => {
  await db.q('DELETE FROM hall_of_fame WHERE player_id = ?', [req.params.playerId]);
  res.json({ ok: true });
}));

module.exports = { router, rowToHOF };
