// /api/points-adjustments/* 路由（admin 手动加减分）
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function rowToAdjustment(r) {
  if (!r) return null;
  return {
    id: r.id, playerId: r.player_id, delta: r.delta, reason: r.reason,
    gameId: r.game_id || null,
    createdBy: r.created_by, createdAt: r.created_at,
  };
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

// 不传 limit 时保持旧版全量返回,兼容网页端整表读取
router.get('/', wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const filters = [], params = [];
  if (req.query.playerId) { filters.push('player_id = ?'); params.push(req.query.playerId); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const queryLimit = limit ? limit + 1 : 0;
  const rows = await db.q(
    `SELECT * FROM points_adjustments ${where} ORDER BY created_at DESC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    limit ? params.concat([queryLimit, offset]) : params
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  const payload = { adjustments: pageRows.map(rowToAdjustment) };
  if (limit) {
    payload.hasMore = rows.length > limit;
    payload.nextOffset = offset + pageRows.length;
  }
  res.json(payload);
}));

router.post('/', requirePermission('points:write'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.playerId)         return res.status(400).json({ error: 'bad_request', message: 'playerId 必填' });
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'bad_request', message: 'delta 必须是非零数字' });
  if (!b.reason)           return res.status(400).json({ error: 'bad_request', message: 'reason 必填' });
  const id = `adj_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  await db.q(
    `INSERT INTO points_adjustments (id, player_id, delta, reason, game_id, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, b.playerId, delta, b.reason, b.gameId || null, req.user.id]
  );
  await logAudit({
    actorUserId: req.user.id,
    action: 'points_adjust',
    targetType: 'player',
    targetId: b.playerId,
    summary: `手动积分 ${delta > 0 ? '+' : ''}${delta}：${b.reason}`,
    metadata: { adjustmentId: id, delta, reason: b.reason, gameId: b.gameId || null },
  }).catch(() => {});
  res.status(201).json({ adjustment: rowToAdjustment(await db.qOne('SELECT * FROM points_adjustments WHERE id = ?', [id])) });
}));

router.delete('/:id', requirePermission('points:write'), wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM points_adjustments WHERE id = ?', [req.params.id]);
  await db.q('DELETE FROM points_adjustments WHERE id = ?', [req.params.id]);
  if (row) {
    await logAudit({
      actorUserId: req.user.id,
      action: 'points_adjust_delete',
      targetType: 'player',
      targetId: row.player_id,
      summary: `删除手动积分 ${row.delta > 0 ? '+' : ''}${row.delta}`,
      metadata: { adjustmentId: req.params.id, reason: row.reason || '' },
    }).catch(() => {});
  }
  res.json({ ok: true });
}));

module.exports = { router, rowToAdjustment };
