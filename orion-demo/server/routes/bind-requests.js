// /api/bind-requests/* and /api/admin/bind-requests/*
// Web / mini-program shared flow: users apply to bind a verified player profile,
// admins approve or reject, and approval reuses the canonical bind migration helper.

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requireAuth, requirePermission } = require('../middleware');
const {
  ensurePeopleTables,
  rowToBindRequest,
  logAudit,
  createNotification,
  bindUserToPlayer,
} = require('../people-helpers');

const router = express.Router();
const adminRouter = express.Router();

function clean(v, max = 255) {
  return String(v || '').trim().slice(0, max);
}

function requestSelect(whereSql = '', limit = 80) {
  return `
    SELECT
      br.*,
      u.display_name AS user_display_name,
      ui.value AS user_email,
      u.bound_player_id AS current_player_id,
      cp.name AS current_player_name,
      p.name AS requested_player_name,
      p.number AS requested_player_number,
      p.position AS requested_player_position,
      reviewer.display_name AS reviewer_name
    FROM player_bind_requests br
    JOIN users u ON u.id = br.user_id
    LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.type = 'email'
    LEFT JOIN players cp ON cp.id = u.bound_player_id
    LEFT JOIN players p ON p.id = br.requested_player_id
    LEFT JOIN users reviewer ON reviewer.id = br.reviewed_by
    ${whereSql}
    ORDER BY
      CASE br.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
      br.created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit || 80), 1), 200)}
  `;
}

async function findRequest(id) {
  const rows = await db.q(requestSelect('WHERE br.id = ?', 1), [id]);
  return rows[0] || null;
}

async function notifyAdmins({ request, actorUserId }) {
  const admins = await db.q(`SELECT id FROM users WHERE admin_level IN ('A', 'B')`);
  await Promise.all(admins.map(a => createNotification({
    userId: a.id,
    type: 'bind_request_submitted',
    title: `新的球员绑定申请：${request.realName}`,
    body: `${request.realName} 申请绑定到「${request.requestedPlayerName || '目标球员'}」。`,
    payload: { requestId: request.id, userId: request.userId, playerId: request.requestedPlayerId },
    createdBy: actorUserId,
  }).catch(() => null)));
}

// 当前用户的申请状态
router.get('/mine', requireAuth, wrap(async (req, res) => {
  await ensurePeopleTables();
  const rows = await db.q(requestSelect('WHERE br.user_id = ?', 20), [req.user.id]);
  res.json({ requests: rows.map(rowToBindRequest) });
}));

// 当前用户提交或更新待审核申请
router.post('/', requireAuth, wrap(async (req, res) => {
  await ensurePeopleTables();
  const b = req.body || {};
  const requestedPlayerId = clean(b.requestedPlayerId || b.playerId, 64);
  const realName = clean(b.realName, 80);
  const nickname = clean(b.nickname, 80);
  const jerseyNumber = clean(b.jerseyNumber, 8);
  const contactTail = clean(b.contactTail, 40);
  const note = clean(b.note, 1000);
  const source = clean(b.source || 'web', 20) || 'web';

  if (!requestedPlayerId) return res.status(400).json({ error: 'bad_request', message: '请选择目标球员档案' });
  if (!realName) return res.status(400).json({ error: 'bad_request', message: '请填写真实姓名/队内称呼' });

  const target = await db.qOne('SELECT id, name, number, position, level FROM players WHERE id = ?', [requestedPlayerId]);
  if (!target) return res.status(404).json({ error: 'player_missing', message: '目标球员不存在' });
  if (target.level !== 'verified') return res.status(400).json({ error: 'bad_player_level', message: '只能申请绑定正式球员档案' });

  if (req.user.bound_player_id === requestedPlayerId) {
    return res.status(409).json({ error: 'already_bound', message: '你的账号已经绑定到这个球员档案' });
  }
  if (req.user.bound_player_id) {
    const current = await db.qOne('SELECT level FROM players WHERE id = ?', [req.user.bound_player_id]);
    if (current && current.level === 'verified') {
      return res.status(409).json({ error: 'already_verified', message: '你的账号已绑定正式球员档案，如需更换请联系管理员' });
    }
  }

  const pending = await db.qOne(
    `SELECT id FROM player_bind_requests WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  let id = pending?.id;
  if (id) {
    await db.q(
      `UPDATE player_bind_requests
       SET requested_player_id = ?, real_name = ?, nickname = ?, jersey_number = ?,
           contact_tail = ?, note = ?, source = ?, updated_at = NOW()
       WHERE id = ?`,
      [requestedPlayerId, realName, nickname, jerseyNumber, contactTail, note || null, source, id]
    );
  } else {
    id = `pbr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.q(
      `INSERT INTO player_bind_requests
       (id, user_id, requested_player_id, real_name, nickname, jersey_number, contact_tail, note, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, requestedPlayerId, realName, nickname, jerseyNumber, contactTail, note || null, source]
    );
  }

  const row = await findRequest(id);
  const request = rowToBindRequest(row);
  await logAudit({
    actorUserId: req.user.id,
    action: pending ? 'update_bind_request' : 'submit_bind_request',
    targetType: 'bind_request',
    targetId: id,
    summary: `申请绑定球员「${target.name}」`,
    metadata: { playerId: requestedPlayerId, source },
  }).catch(() => {});
  await notifyAdmins({ request, actorUserId: req.user.id });
  res.status(pending ? 200 : 201).json({ ok: true, request });
}));

// 管理员查看申请队列
adminRouter.get('/', requirePermission('bind_requests:review'), wrap(async (req, res) => {
  await ensurePeopleTables();
  const status = clean(req.query.status, 20);
  const allowed = new Set(['pending', 'approved', 'rejected']);
  const where = allowed.has(status) ? 'WHERE br.status = ?' : '';
  const rows = await db.q(requestSelect(where, req.query.limit || 120), where ? [status] : []);
  res.json({ requests: rows.map(rowToBindRequest) });
}));

adminRouter.post('/:id/approve', requirePermission('bind_requests:review'), wrap(async (req, res) => {
  await ensurePeopleTables();
  const row = await findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: '绑定申请不存在' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'not_pending', message: '该申请已经处理过' });

  const reviewNote = clean(req.body?.reviewNote, 1000);
  const result = await bindUserToPlayer({
    userId: row.user_id,
    playerId: row.requested_player_id,
    actorUserId: req.user.id,
    method: 'bind_request',
  });
  await db.q(
    `UPDATE player_bind_requests
     SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
     WHERE id = ?`,
    [req.user.id, reviewNote || null, req.params.id]
  );
  await createNotification({
    userId: row.user_id,
    type: 'bind_request_approved',
    title: `绑定申请已通过：${row.requested_player_name}`,
    body: `你的账号已绑定到「${row.requested_player_name}」的正式球员档案。`,
    payload: { requestId: req.params.id, playerId: row.requested_player_id, migrated: result.migrated },
    createdBy: req.user.id,
  }).catch(() => {});
  await logAudit({
    actorUserId: req.user.id,
    action: 'approve_bind_request',
    targetType: 'bind_request',
    targetId: req.params.id,
    summary: `批准绑定申请：${row.user_display_name} -> ${row.requested_player_name}`,
    metadata: { userId: row.user_id, playerId: row.requested_player_id, migrated: result.migrated },
  }).catch(() => {});
  res.json({ ok: true, request: rowToBindRequest(await findRequest(req.params.id)), bindResult: result });
}));

adminRouter.post('/:id/reject', requirePermission('bind_requests:review'), wrap(async (req, res) => {
  await ensurePeopleTables();
  const row = await findRequest(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: '绑定申请不存在' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'not_pending', message: '该申请已经处理过' });
  const reviewNote = clean(req.body?.reviewNote, 1000);
  await db.q(
    `UPDATE player_bind_requests
     SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
     WHERE id = ?`,
    [req.user.id, reviewNote || null, req.params.id]
  );
  await createNotification({
    userId: row.user_id,
    type: 'bind_request_rejected',
    title: `绑定申请未通过：${row.requested_player_name}`,
    body: reviewNote || '管理员需要你补充或核对信息后再提交。',
    payload: { requestId: req.params.id, playerId: row.requested_player_id },
    createdBy: req.user.id,
  }).catch(() => {});
  await logAudit({
    actorUserId: req.user.id,
    action: 'reject_bind_request',
    targetType: 'bind_request',
    targetId: req.params.id,
    summary: `驳回绑定申请：${row.user_display_name} -> ${row.requested_player_name}`,
    metadata: { userId: row.user_id, playerId: row.requested_player_id, reviewNote },
  }).catch(() => {});
  res.json({ ok: true, request: rowToBindRequest(await findRequest(req.params.id)) });
}));

module.exports = { router, adminRouter };
