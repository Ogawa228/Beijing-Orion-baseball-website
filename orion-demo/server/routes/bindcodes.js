// /api/bind-codes/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function rowToBindCode(r) {
  if (!r) return null;
  return {
    code: r.code, playerId: r.player_id, used: !!r.used,
    usedBy: r.used_by, usedAt: r.used_at, createdAt: r.created_at,
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

// 不传 limit 时保持旧版全量返回,兼容网页端 db.js 的整表缓存
router.get('/', requirePermission('bind_codes:manage'), wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const keyword = String(req.query.keyword || req.query.q || '').trim();
  const filters = [], params = [];
  if (keyword) {
    const like = `%${keyword}%`;
    filters.push('(code LIKE ? OR player_id LIKE ?)');
    params.push(like, like);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const queryLimit = limit ? limit + 1 : 0;
  const rows = await db.q(
    `SELECT * FROM bind_codes ${where} ORDER BY created_at DESC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    limit ? params.concat([queryLimit, offset]) : params
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  const payload = { bindCodes: pageRows.map(rowToBindCode) };
  if (limit) {
    payload.hasMore = rows.length > limit;
    payload.nextOffset = offset + pageRows.length;
  }
  res.json(payload);
}));

router.post('/', requirePermission('bind_codes:manage'), wrap(async (req, res) => {
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

router.delete('/:code', requirePermission('bind_codes:manage'), wrap(async (req, res) => {
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
