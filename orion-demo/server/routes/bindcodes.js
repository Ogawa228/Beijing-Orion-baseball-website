// /api/bind-codes/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function rowToBindCode(r) {
  if (!r) return null;
  return {
    code: r.code, playerId: r.player_id, used: !!r.used,
    usedBy: r.used_by, usedAt: r.used_at, createdAt: r.created_at,
  };
}

router.get('/', requireAdmin, wrap(async (_req, res) => {
  const rows = await db.q('SELECT * FROM bind_codes ORDER BY created_at DESC');
  res.json({ bindCodes: rows.map(rowToBindCode) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.playerId) return res.status(400).json({ error: 'bad_request', message: 'playerId 必填' });
  // 生成 ORION-XXXX-XXXX 格式
  const r1 = Math.random().toString(36).slice(2,6).toUpperCase();
  const r2 = Math.random().toString(36).slice(2,6).toUpperCase();
  const code = b.code || `ORION-${r1}-${r2}`;
  await db.q(
    `INSERT INTO bind_codes (code, player_id, created_at) VALUES (?, ?, CURDATE())`,
    [code, b.playerId]
  );
  await logAudit({
    actorUserId: req.user.id,
    action: 'create_bind_code',
    targetType: 'player',
    targetId: b.playerId,
    summary: `生成绑定码 ${code}`,
    metadata: { code },
  }).catch(() => {});
  res.status(201).json({ bindCode: rowToBindCode(await db.qOne('SELECT * FROM bind_codes WHERE code = ?', [code])) });
}));

router.delete('/:code', requireAdmin, wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM bind_codes WHERE code = ?', [req.params.code]);
  await db.q('DELETE FROM bind_codes WHERE code = ?', [req.params.code]);
  if (row) {
    await logAudit({
      actorUserId: req.user.id,
      action: 'delete_bind_code',
      targetType: 'player',
      targetId: row.player_id,
      summary: `作废绑定码 ${req.params.code}`,
      metadata: { code: req.params.code, used: !!row.used },
    }).catch(() => {});
  }
  res.json({ ok: true });
}));

module.exports = { router, rowToBindCode };
