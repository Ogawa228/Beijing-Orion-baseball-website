// /api/events/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

let eventMetadataReady = false;

async function ensureEventMetadataColumn() {
  if (eventMetadataReady) return;
  const col = await db.qOne(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'events'
      AND COLUMN_NAME = 'metadata'
  `);
  if (!col) {
    await db.q(`ALTER TABLE events ADD COLUMN metadata JSON DEFAULT NULL AFTER images`);
  }
  eventMetadataReady = true;
}

function parseJson(v, fallback = {}) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return fallback; }
}

function J(v) {
  return v == null ? null : JSON.stringify(v);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 100);
}

function parseOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10000);
}

function isMissingEventSignupsTable(err) {
  const message = String(err && err.message || '');
  return err?.code === 'ER_NO_SUCH_TABLE' || /event_signups|doesn't exist|no such table/i.test(message);
}

function rowToEvent(r) {
  if (!r) return null;
  let images = r.images || [];
  if (typeof images === 'string') {
    try { images = JSON.parse(images); } catch (_) { images = []; }
  }
  return {
    id: r.id, tag: r.tag, title: r.title, cover: r.cover,
    date: r.date, location: r.location, body: r.body,
    images,
    metadata: parseJson(r.metadata, {}),
    sourceLink: r.source_link,
    signupCount: num(r.signup_count),
    tentativeSignupCount: num(r.tentative_signup_count),
    cancelledSignupCount: num(r.cancelled_signup_count),
    activeSignupCount: num(r.active_signup_count),
    createdAt: r.created_at,
  };
}

async function loadEventsWithSignupCounts({ limit = 0, offset = 0 } = {}) {
  const pageSql = limit ? ' LIMIT ? OFFSET ?' : '';
  const pageParams = limit ? [limit + 1, offset] : [];
  try {
    return await db.q(`
      SELECT e.*,
             COALESCE(s.signup_count, 0) AS signup_count,
             COALESCE(s.tentative_signup_count, 0) AS tentative_signup_count,
             COALESCE(s.cancelled_signup_count, 0) AS cancelled_signup_count,
             COALESCE(s.active_signup_count, 0) AS active_signup_count
      FROM events e
      LEFT JOIN (
        SELECT event_id,
               SUM(CASE WHEN status = 'going' THEN 1 ELSE 0 END) AS signup_count,
               SUM(CASE WHEN status = 'tentative' THEN 1 ELSE 0 END) AS tentative_signup_count,
               SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_signup_count,
               SUM(CASE WHEN status IN ('going', 'tentative') THEN 1 ELSE 0 END) AS active_signup_count
        FROM event_signups
        GROUP BY event_id
      ) s ON s.event_id = e.id
      ORDER BY e.created_at DESC${pageSql}
    `, pageParams);
  } catch (err) {
    if (!isMissingEventSignupsTable(err)) throw err;
    return db.q(`SELECT * FROM events ORDER BY created_at DESC${pageSql}`, pageParams);
  }
}

router.get('/', wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const rows = await loadEventsWithSignupCounts({ limit, offset });
  const pageRows = limit ? rows.slice(0, limit) : rows;
  res.json({
    events: pageRows.map(rowToEvent),
    hasMore: limit ? rows.length > limit : false,
    nextOffset: limit ? offset + pageRows.length : rows.length,
  });
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ event: rowToEvent(row) });
}));

router.post('/', requirePermission('events:write'), wrap(async (req, res) => {
  await ensureEventMetadataColumn();
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title 必填' });
  const id = b.id || `ev_${Date.now()}`;
  await db.q(
    `INSERT INTO events (id, tag, title, cover, date, location, body, images, metadata, source_link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
    [id, b.tag || '', b.title, b.cover || null, b.date || '', b.location || '',
     b.body || null, JSON.stringify(b.images || []), J(b.metadata || {}), b.sourceLink || '']
  );
  const event = rowToEvent(await db.qOne('SELECT * FROM events WHERE id = ?', [id]));
  await logAudit({
    actorUserId: req.user.id,
    action: 'event_create',
    targetType: 'event',
    targetId: id,
    summary: `创建接龙：${event.title}`,
    metadata: { after: event },
  });
  res.status(201).json({ event });
}));

router.patch('/:id', requirePermission('events:write'), wrap(async (req, res) => {
  await ensureEventMetadataColumn();
  const b = req.body || {};
  const beforeRow = await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!beforeRow) return res.status(404).json({ error: 'not_found' });
  const map = { tag:'tag', title:'title', cover:'cover', date:'date', location:'location', body:'body', sourceLink:'source_link' };
  const fields = [], values = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  if (b.images !== undefined) { fields.push('images = ?'); values.push(JSON.stringify(b.images || [])); }
  if (b.metadata !== undefined) { fields.push('metadata = ?'); values.push(J(b.metadata || {})); }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
  const before = rowToEvent(beforeRow);
  const event = rowToEvent(await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id]));
  await logAudit({
    actorUserId: req.user.id,
    action: 'event_update',
    targetType: 'event',
    targetId: req.params.id,
    summary: `更新接龙：${event.title}`,
    metadata: {
      before,
      after: event,
      changedKeys: Object.keys(b || {}),
    },
  });
  res.json({ event });
}));

router.delete('/:id', requirePermission('events:write'), wrap(async (req, res) => {
  const beforeRow = await db.qOne('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!beforeRow) return res.status(404).json({ error: 'not_found' });
  const before = rowToEvent(beforeRow);
  const signupCountRow = await db.qOne('SELECT COUNT(*) AS c FROM event_signups WHERE event_id = ?', [req.params.id]).catch(() => ({ c: 0 }));
  await db.q('DELETE FROM events WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user.id,
    action: 'event_delete',
    targetType: 'event',
    targetId: req.params.id,
    summary: `删除接龙：${before.title}`,
    metadata: {
      before,
      signupCount: Number(signupCountRow?.c || 0),
    },
  });
  res.json({ ok: true });
}));

module.exports = { router, rowToEvent };
