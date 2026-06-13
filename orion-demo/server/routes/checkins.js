// /api/checkins/* — 小程序接龙签到：精确定位优先，降级模糊定位 + 后端写 attendance
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requireAuth } = require('../middleware');
const { logAudit } = require('../people-helpers');
const { RULES, getPlayerPoints } = require('../points');

const router = express.Router();
const AUTO_UPGRADE_TRAINING_COUNT = 8;

let attendanceMetadataReady = false;
let eventMetadataReady = false;

async function ensureAttendanceMetadataColumn() {
  if (attendanceMetadataReady) return;
  const col = await db.qOne(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'attendances'
      AND COLUMN_NAME = 'metadata'
  `);
  if (!col) {
    await db.q(`ALTER TABLE attendances ADD COLUMN metadata JSON DEFAULT NULL AFTER note`);
  }
  attendanceMetadataReady = true;
}

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

function clean(v, max = 255) {
  return String(v || '').trim().slice(0, max);
}

function parseJson(v, fallback = {}) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return fallback; }
}

function rowToAttendance(r) {
  if (!r) return null;
  return {
    id: r.id,
    playerId: r.player_id,
    kind: r.kind,
    refId: r.ref_id,
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
    note: r.note || '',
    metadata: parseJson(r.metadata, {}),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

async function maybeAutoUpgrade(playerId, kind) {
  if (kind !== 'training') return { triggeredUpgrade: false, nameConflict: null };
  const player = await db.qOne('SELECT id, name, level FROM players WHERE id = ?', [playerId]);
  if (!player || player.level !== 'casual') return { triggeredUpgrade: false, nameConflict: null };
  const cnt = await db.qOne(
    `SELECT COUNT(*) AS c FROM attendances WHERE player_id = ? AND kind = 'training'`,
    [playerId]
  );
  if (!cnt || cnt.c < AUTO_UPGRADE_TRAINING_COUNT) return { triggeredUpgrade: false, nameConflict: null };
  const dup = await db.qOne(
    `SELECT id FROM players WHERE level = 'verified' AND id != ? AND name = ?`,
    [playerId, player.name]
  );
  if (dup) return { triggeredUpgrade: false, nameConflict: { conflictWithId: dup.id, name: player.name } };
  await db.q(
    `UPDATE players SET level = 'verified', upgraded_at = NOW(), upgraded_by = 'auto' WHERE id = ?`,
    [playerId]
  );
  return { triggeredUpgrade: true, nameConflict: null };
}

async function loadTrialProgress(playerId) {
  const [player, cnt] = await Promise.all([
    db.qOne('SELECT id, level FROM players WHERE id = ?', [playerId]),
    db.qOne(`SELECT COUNT(*) AS c FROM attendances WHERE player_id = ? AND kind = 'training'`, [playerId]),
  ]);
  const trainingCount = Number(cnt?.c || 0);
  return {
    level: player?.level || '',
    trainingCount,
    requiredTrainingCount: AUTO_UPGRADE_TRAINING_COUNT,
    remainingTrainingCount: Math.max(AUTO_UPGRADE_TRAINING_COUNT - trainingCount, 0),
  };
}

function normalizeLocation(raw = {}) {
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const type = clean(raw.type || (raw.source === 'wx.getLocation' ? 'precise' : 'fuzzy'), 20);
  const accuracy = Number(raw.accuracy);
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    type,
    source: clean(raw.source || (type === 'precise' ? 'wx.getLocation' : 'wx.getFuzzyLocation'), 60),
    fallbackFrom: clean(raw.fallbackFrom || '', 60),
    fallbackReason: clean(raw.fallbackReason || '', 120),
    capturedAt: clean(raw.capturedAt || new Date().toISOString(), 40),
  };
}

async function loadPointsSummary(playerId) {
  const points = await getPlayerPoints(playerId);
  return {
    total: points.total,
    breakdown: points.breakdown,
  };
}

router.post('/direct', requireAuth, wrap(async (req, res) => {
  await ensureAttendanceMetadataColumn();
  const b = req.body || {};
  const kind = clean(b.kind || 'training', 20);
  if (!['training', 'event'].includes(kind)) {
    return res.status(400).json({ error: 'bad_request', message: 'kind 只能是 training 或 event' });
  }
  if (!req.user.bound_player_id) {
    return res.status(400).json({ error: 'no_player', message: '当前账号还没有球员档案，不能签到' });
  }
  const date = clean(b.date || new Date().toISOString().slice(0, 10), 10);
  const refId = clean(b.refId || b.eventId, 64) || null;
  let event = null;
  if (refId) {
    await ensureEventMetadataColumn();
    event = await db.qOne('SELECT id, title, tag, date, location, metadata FROM events WHERE id = ?', [refId]);
    if (!event) return res.status(404).json({ error: 'event_missing', message: '接龙不存在' });
    event.metadata = parseJson(event.metadata, {});
  }
  if (kind === 'event') {
    if (!refId) return res.status(400).json({ error: 'bad_request', message: '接龙签到需要选择接龙' });
  }

  const duplicate = await db.qOne(
    `SELECT * FROM attendances
     WHERE player_id = ? AND kind = ? AND COALESCE(ref_id, '') = COALESCE(?, '') AND date = ?
     LIMIT 1`,
    [req.user.bound_player_id, kind, refId || null, date]
  );
  if (duplicate) {
    return res.json({
      ok: true,
      duplicated: true,
      attendance: rowToAttendance(duplicate),
      pointDelta: 0,
      points: await loadPointsSummary(req.user.bound_player_id),
      trialProgress: await loadTrialProgress(req.user.bound_player_id),
      triggeredUpgrade: false,
      nameConflict: null,
    });
  }

  const id = `att_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const note = clean(b.note || (kind === 'training' ? '小程序训练签到' : '小程序活动签到'), 255);
  const location = normalizeLocation(b.location || {});
  const metadata = {
    source: clean(b.source || 'mini_program', 40),
    method: location?.type === 'precise' ? 'one_tap_location' : 'one_tap_fuzzy_location',
    location,
    relay: {
      eventId: event?.id || clean(b.relay?.id || refId, 64) || null,
      title: clean(event?.title || b.relay?.title, 120),
      tag: clean(event?.tag || b.relay?.typeLabel, 40),
      date: clean(event?.date || b.relay?.date, 80),
      location: clean(event?.location || b.relay?.location, 120),
      targetLocation: event?.metadata?.location || b.relay?.targetLocation || null,
    },
  };
  await db.q(
    `INSERT INTO attendances (id, player_id, kind, ref_id, date, note, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.bound_player_id, kind, refId || null, date, note || null, JSON.stringify(metadata), req.user.id]
  );
  const upgrade = await maybeAutoUpgrade(req.user.bound_player_id, kind);
  const attendance = await db.qOne('SELECT * FROM attendances WHERE id = ?', [id]);
  await logAudit({
    actorUserId: req.user.id,
    action: 'mini_direct_checkin',
    targetType: kind,
    targetId: refId || date,
    summary: `${kind === 'training' ? '训练' : '接龙'}一键签到：${event?.title || date}`,
    metadata: { attendanceId: id, kind, refId, hasLocation: !!location, ...upgrade },
  }).catch(() => {});
  res.status(201).json({
    ok: true,
    duplicated: false,
    attendance: rowToAttendance(attendance),
    pointDelta: kind === 'training' ? RULES.training : RULES.event,
    points: await loadPointsSummary(req.user.bound_player_id),
    trialProgress: await loadTrialProgress(req.user.bound_player_id),
    ...upgrade,
  });
}));

module.exports = { router, ensureAttendanceMetadataColumn };
