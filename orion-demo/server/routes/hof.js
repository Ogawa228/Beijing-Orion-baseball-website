// /api/hall-of-fame/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { rowToPlayer } = require('./players');

const router = express.Router();

function rowToHOF(r, player) {
  if (!r) return null;
  const entry = {
    playerId: r.player_id, inductedYear: r.inducted_year, reason: r.reason,
    createdAt: r.created_at,
  };
  if (player) entry.player = player;
  return entry;
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 100);
}

function parseOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function flag(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

async function loadPlayersByIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return {};
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.q(`SELECT * FROM players WHERE id IN (${placeholders})`, uniqueIds);
  const byId = {};
  rows.forEach(row => {
    const player = rowToPlayer(row);
    byId[player.id] = player;
  });
  return byId;
}

router.get('/', wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const queryLimit = limit ? limit + 1 : 0;
  const rows = await db.q(
    `SELECT * FROM hall_of_fame ORDER BY inducted_year DESC, created_at ASC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    limit ? [queryLimit, offset] : []
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  const playersById = flag(req.query.includePlayer)
    ? await loadPlayersByIds(pageRows.map(row => row.player_id))
    : {};
  const payload = { hallOfFame: pageRows.map(row => rowToHOF(row, playersById[row.player_id])) };
  if (limit) {
    payload.hasMore = rows.length > limit;
    payload.nextOffset = offset + pageRows.length;
  }
  res.json(payload);
}));

// POST /api/hall-of-fame - admin 添加入选
router.post('/', requirePermission('hof:write'), wrap(async (req, res) => {
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

router.delete('/:playerId', requirePermission('hof:write'), wrap(async (req, res) => {
  await db.q('DELETE FROM hall_of_fame WHERE player_id = ?', [req.params.playerId]);
  res.json({ ok: true });
}));

module.exports = { router, rowToHOF };
