// /api/events/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');

const router = express.Router();

function rowToEvent(r) {
  if (!r) return null;
  return {
    id: r.id, tag: r.tag, title: r.title, cover: r.cover,
    date: r.date, location: r.location, body: r.body,
    images: r.images || [],
    sourceLink: r.source_link,
    createdAt: r.created_at,
  };
}

router.get('/', wrap(async (_req, res) => {
  const rows = await db.q('SELECT * FROM events ORDER BY created_at DESC');
  res.json({ events: rows.map(rowToEvent) });
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ event: rowToEvent(row) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title 必填' });
  const id = b.id || `ev_${Date.now()}`;
  await db.q(
    `INSERT INTO events (id, tag, title, cover, date, location, body, images, source_link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
    [id, b.tag || '', b.title, b.cover || null, b.date || '', b.location || '',
     b.body || null, JSON.stringify(b.images || []), b.sourceLink || '']
  );
  res.status(201).json({ event: rowToEvent(await db.qOne('SELECT * FROM events WHERE id = ?', [id])) });
}));

router.patch('/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const map = { tag:'tag', title:'title', cover:'cover', date:'date', location:'location', body:'body', sourceLink:'source_link' };
  const fields = [], values = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  if (b.images !== undefined) { fields.push('images = ?'); values.push(JSON.stringify(b.images || [])); }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ event: rowToEvent(await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id])) });
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  await db.q('DELETE FROM events WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = { router, rowToEvent };
