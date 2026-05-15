// /api/highlights/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requireAuth, requirePermission } = require('../middleware');
const { hasPermission } = require('../permissions');

const router = express.Router();

function rowToHighlight(r) {
  if (!r) return null;
  return {
    id: r.id, gameId: r.game_id, playerName: r.player_name, title: r.title,
    url: r.url, cover: r.cover, uploader: r.uploader, status: r.status,
    createdAt: r.created_at,
  };
}

// GET /api/highlights?gameId=...&playerName=...
router.get('/', wrap(async (req, res) => {
  const filters = [], params = [];
  if (req.query.gameId)     { filters.push('game_id = ?');     params.push(req.query.gameId); }
  if (req.query.playerName) { filters.push('player_name = ?'); params.push(req.query.playerName); }
  if (req.query.status)     { filters.push('status = ?');      params.push(req.query.status); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.q(`SELECT * FROM highlights ${where} ORDER BY created_at DESC`, params);
  res.json({ highlights: rows.map(rowToHighlight) });
}));

// POST /api/highlights - 任何登录用户都能投稿（status='pending'，admin 审核）
router.post('/', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title 必填' });
  const id = `h_${Date.now()}`;
  // admin 直接 published；其他用户 pending
  const canPublish = hasPermission(req.user, 'highlights:write');
  const status = canPublish ? 'published' : 'pending';
  await db.q(
    `INSERT INTO highlights (id, game_id, player_name, title, url, cover, uploader, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, b.gameId || null, b.playerName || '', b.title, b.url || '', b.cover || null,
     canPublish ? 'admin' : req.user.id, status]
  );
  res.status(201).json({ highlight: rowToHighlight(await db.qOne('SELECT * FROM highlights WHERE id = ?', [id])) });
}));

// PATCH /api/highlights/:id - admin 修改 status 或元数据
router.patch('/:id', requirePermission('highlights:write'), wrap(async (req, res) => {
  const b = req.body || {};
  const fields = [], values = [];
  for (const [k, col] of Object.entries({ title:'title', url:'url', cover:'cover', status:'status' })) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE highlights SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ highlight: rowToHighlight(await db.qOne('SELECT * FROM highlights WHERE id = ?', [req.params.id])) });
}));

router.delete('/:id', requirePermission('highlights:write'), wrap(async (req, res) => {
  await db.q('DELETE FROM highlights WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = { router, rowToHighlight };
