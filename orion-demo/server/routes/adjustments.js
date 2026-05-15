// /api/points-adjustments/* 路由（admin 手动加减分）
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');
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

router.get('/', wrap(async (req, res) => {
  const filters = [], params = [];
  if (req.query.playerId) { filters.push('player_id = ?'); params.push(req.query.playerId); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.q(`SELECT * FROM points_adjustments ${where} ORDER BY created_at DESC`, params);
  res.json({ adjustments: rows.map(rowToAdjustment) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
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

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
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
