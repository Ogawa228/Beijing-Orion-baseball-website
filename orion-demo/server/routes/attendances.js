// /api/attendances/* 路由
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function rowToAttendance(r) {
  if (!r) return null;
  return {
    id: r.id, playerId: r.player_id, kind: r.kind, refId: r.ref_id,
    date: r.date ? new Date(r.date).toISOString().slice(0,10) : null,
    note: r.note, createdBy: r.created_by, createdAt: r.created_at,
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

// GET /api/attendances?playerId=...&limit=...&offset=...
// 不传 limit 时保持旧版全量返回,兼容网页端整表读取
router.get('/', wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const filters = [], params = [];
  if (req.query.playerId) { filters.push('player_id = ?'); params.push(req.query.playerId); }
  if (req.query.kind)     { filters.push('kind = ?');      params.push(req.query.kind); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const queryLimit = limit ? limit + 1 : 0;
  const rows = await db.q(
    `SELECT * FROM attendances ${where} ORDER BY date DESC, created_at DESC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    limit ? params.concat([queryLimit, offset]) : params
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  const payload = { attendances: pageRows.map(rowToAttendance) };
  if (limit) {
    payload.hasMore = rows.length > limit;
    payload.nextOffset = offset + pageRows.length;
  }
  res.json(payload);
}));

// POST /api/attendances - admin 录签到
// body: { playerId, kind, refId?, date?, note? }
// 副作用：满 8 次 training → 自动升 verified
router.post('/', requirePermission('attendances:write'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.playerId || !b.kind) return res.status(400).json({ error: 'bad_request', message: 'playerId / kind 必填' });
  if (b.kind !== 'training' && b.kind !== 'event') {
    return res.status(400).json({ error: 'bad_request', message: 'kind 只能是 training 或 event' });
  }
  const id = `att_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const date = b.date || new Date().toISOString().slice(0,10);
  await db.q(
    `INSERT INTO attendances (id, player_id, kind, ref_id, date, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, b.playerId, b.kind, b.refId || null, date, b.note || null, req.user.id]
  );

  // 钩子：满 8 次 training 且 casual → 检查重名 + 自动升 verified
  // 重名场景（如试训"虞婧"撞预置"虞婧"）：不升级，标记 nameConflict 给前端提示
  // 让用户知道要走绑定码合并路径，避免独立两份同名 verified player
  let triggeredUpgrade = false;
  let nameConflict = null;
  if (b.kind === 'training') {
    const player = await db.qOne('SELECT id, name, level FROM players WHERE id = ?', [b.playerId]);
    if (player && player.level === 'casual') {
      const cnt = await db.qOne(
        `SELECT COUNT(*) AS c FROM attendances WHERE player_id = ? AND kind = 'training'`,
        [b.playerId]
      );
      if (cnt && cnt.c >= 8) {
        // 重名检测：是否已有同名 verified player
        const dup = await db.qOne(
          `SELECT id FROM players WHERE level = 'verified' AND id != ? AND name = ?`,
          [b.playerId, player.name]
        );
        if (dup) {
          nameConflict = { conflictWithId: dup.id, name: player.name };
        } else {
          await db.q(
            `UPDATE players SET level = 'verified', upgraded_at = NOW(), upgraded_by = 'auto' WHERE id = ?`,
            [b.playerId]
          );
          triggeredUpgrade = true;
        }
      }
    }
  }

  const row = await db.qOne('SELECT * FROM attendances WHERE id = ?', [id]);
  await logAudit({
    actorUserId: req.user.id,
    action: 'attendance_create',
    targetType: 'player',
    targetId: b.playerId,
    summary: `${b.kind === 'training' ? '训练签到' : '活动出席'}：${date}`,
    metadata: { attendanceId: id, kind: b.kind, date, triggeredUpgrade, nameConflict },
  }).catch(() => {});
  res.status(201).json({ attendance: rowToAttendance(row), triggeredUpgrade, nameConflict });
}));

// DELETE /api/attendances/:id
router.delete('/:id', requirePermission('attendances:write'), wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM attendances WHERE id = ?', [req.params.id]);
  await db.q('DELETE FROM attendances WHERE id = ?', [req.params.id]);
  if (row) {
    await logAudit({
      actorUserId: req.user.id,
      action: 'attendance_delete',
      targetType: 'player',
      targetId: row.player_id,
      summary: `删除${row.kind === 'training' ? '训练签到' : '活动出席'}：${row.date ? new Date(row.date).toISOString().slice(0,10) : ''}`,
      metadata: { attendanceId: req.params.id, kind: row.kind },
    }).catch(() => {});
  }
  res.json({ ok: true });
}));

module.exports = { router, rowToAttendance };
