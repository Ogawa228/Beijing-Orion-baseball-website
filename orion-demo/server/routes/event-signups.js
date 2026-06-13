// /api/event-signups/* — 小程序/网页共用的队内接龙报名
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requireAuth, requirePermission } = require('../middleware');
const { hasPermission } = require('../permissions');
const { logAudit } = require('../people-helpers');
const { canonicalNameKey, findPlayerByName, resolveRegisteredPlayerName } = require('../name-utils');

const router = express.Router();

let tableReady = false;

async function ensureEventSignupTable() {
  if (tableReady) return;
  await db.q(`
    CREATE TABLE IF NOT EXISTS event_signups (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) DEFAULT NULL,
      player_id VARCHAR(64) DEFAULT NULL,
      manual_name VARCHAR(120) DEFAULT '',
      status ENUM('going','tentative','cancelled') NOT NULL DEFAULT 'going',
      note TEXT DEFAULT NULL,
      source VARCHAR(40) DEFAULT 'mini',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_event_user (event_id, user_id),
      INDEX idx_event_status (event_id, status),
      INDEX idx_user_status (user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn('event_signups', 'manual_name', `ALTER TABLE event_signups ADD COLUMN manual_name VARCHAR(120) DEFAULT '' AFTER player_id`);
  await ensureColumn('event_signups', 'source', `ALTER TABLE event_signups ADD COLUMN source VARCHAR(40) DEFAULT 'mini' AFTER note`);
  await db.q(`ALTER TABLE event_signups MODIFY user_id VARCHAR(64) DEFAULT NULL`).catch(() => {});
  tableReady = true;
}

async function ensureColumn(table, column, sql) {
  const found = await db.qOne(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  if (!found) await db.q(sql);
}

function clean(v, max = 255) {
  return String(v || '').trim().slice(0, max);
}

function validSignupStatus(status) {
  return ['going', 'tentative', 'cancelled'].includes(status);
}

function rowToSignup(r) {
  if (!r) return null;
  return {
    id: r.id,
    eventId: r.event_id,
    userId: r.user_id || '',
    userDisplayName: r.user_display_name || '',
    playerId: r.player_id || '',
    playerName: r.player_name || '',
    playerNumber: r.player_number || '',
    manualName: r.manual_name || '',
    source: r.source || 'mini',
    eventTitle: r.event_title || '',
    eventDate: r.event_date || '',
    eventLocation: r.event_location || '',
    status: r.status,
    note: r.note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function signupSelect(where = '') {
  return `
    SELECT es.*,
           u.display_name AS user_display_name,
           p.name AS player_name,
           p.number AS player_number,
           e.title AS event_title,
           e.date AS event_date,
           e.location AS event_location
    FROM event_signups es
    LEFT JOIN users u ON u.id = es.user_id
    LEFT JOIN players p ON p.id = es.player_id
    LEFT JOIN events e ON e.id = es.event_id
    ${where}
    ORDER BY
      CASE es.status WHEN 'going' THEN 0 WHEN 'tentative' THEN 1 ELSE 2 END,
      es.created_at ASC
  `;
}

async function loadSignup(id) {
  const rows = await db.q(signupSelect('WHERE es.id = ?'), [id]);
  return rows[0] || null;
}

router.get('/', requireAuth, wrap(async (req, res) => {
  await ensureEventSignupTable();
  const filters = [];
  const params = [];
  if (req.query.eventId) {
    filters.push('es.event_id = ?');
    params.push(clean(req.query.eventId, 64));
  }
  if (req.query.mine === 'true') {
    filters.push('es.user_id = ?');
    params.push(req.user.id);
  }
  if (req.query.status) {
    filters.push('es.status = ?');
    params.push(clean(req.query.status, 20));
  }
  if (!filters.length && !hasPermission(req.user, 'events:write')) {
    filters.push('es.user_id = ?');
    params.push(req.user.id);
  }
  const rows = await db.q(signupSelect(filters.length ? `WHERE ${filters.join(' AND ')}` : ''), params);
  res.json({ signups: rows.map(rowToSignup) });
}));

router.get('/mine', requireAuth, wrap(async (req, res) => {
  await ensureEventSignupTable();
  const rows = await db.q(signupSelect('WHERE es.user_id = ?'), [req.user.id]);
  res.json({ signups: rows.map(rowToSignup) });
}));

router.post('/', requireAuth, wrap(async (req, res) => {
  await ensureEventSignupTable();
  const b = req.body || {};
  const eventId = clean(b.eventId, 64);
  const status = clean(b.status || 'going', 20);
  const note = clean(b.note, 1000);
  if (!eventId) return res.status(400).json({ error: 'bad_request', message: 'eventId 必填' });
  if (!validSignupStatus(status)) {
    return res.status(400).json({ error: 'bad_request', message: '报名状态无效' });
  }
  const event = await db.qOne('SELECT id, title FROM events WHERE id = ?', [eventId]);
  if (!event) return res.status(404).json({ error: 'event_missing', message: '活动不存在' });
  const playerId = req.user.bound_player_id || null;
  const existing = await db.qOne('SELECT id FROM event_signups WHERE event_id = ? AND user_id = ?', [eventId, req.user.id]);
  const id = existing?.id || `esu_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  if (existing) {
    await db.q(
      `UPDATE event_signups
       SET player_id = ?, manual_name = '', status = ?, note = ?, source = ?, updated_at = NOW()
       WHERE id = ?`,
      [playerId, status, note || null, clean(b.source || 'mini', 40), id]
    );
  } else {
    await db.q(
      `INSERT INTO event_signups (id, event_id, user_id, player_id, manual_name, status, note, source)
       VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
      [id, eventId, req.user.id, playerId, status, note || null, clean(b.source || 'mini', 40)]
    );
  }
  await logAudit({
    actorUserId: req.user.id,
    action: existing ? 'event_signup_update' : 'event_signup_create',
    targetType: 'event',
    targetId: eventId,
    summary: `${status === 'cancelled' ? '取消/更新活动报名' : '提交活动报名'}：${event.title}`,
    metadata: { signupId: id, status, source: b.source || 'mini' },
  }).catch(() => {});
  res.status(existing ? 200 : 201).json({ ok: true, signup: rowToSignup(await loadSignup(id)) });
}));

router.post('/import', requirePermission('events:write'), wrap(async (req, res) => {
  await ensureEventSignupTable();
  const b = req.body || {};
  const eventId = clean(b.eventId, 64);
  const text = String(b.text || '').trim();
  if (!eventId) return res.status(400).json({ error: 'bad_request', message: 'eventId 必填' });
  if (!text) return res.status(400).json({ error: 'bad_request', message: '请粘贴接龙内容' });
  const event = await db.qOne('SELECT id, title FROM events WHERE id = ?', [eventId]);
  if (!event) return res.status(404).json({ error: 'event_missing', message: '接龙不存在' });

  const players = await db.q('SELECT id, name, number, aliases FROM players');
  const parsed = parseRelayPaste(text, players);
  const existingRows = await db.q(signupSelect('WHERE es.event_id = ?'), [eventId]);
  const existingByKey = new Map();
  for (const row of existingRows) {
    const key = signupMatchKey(row);
    if (key && !existingByKey.has(key)) existingByKey.set(key, row);
  }

  const imported = [];
  for (const item of parsed) {
    const key = item.playerId ? `player:${item.playerId}` : `manual:${canonicalNameKey(item.name)}`;
    if (!key) continue;
    const existing = existingByKey.get(key);
    const id = existing?.id || `esu_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    if (existing) {
      await db.q(
        `UPDATE event_signups
         SET player_id = ?, manual_name = ?, status = ?, note = ?, source = 'wechat_group_paste', updated_at = NOW()
         WHERE id = ?`,
        [item.playerId || null, item.playerId ? '' : item.name, item.status, item.note || null, id]
      );
    } else {
      await db.q(
        `INSERT INTO event_signups (id, event_id, user_id, player_id, manual_name, status, note, source)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'wechat_group_paste')`,
        [id, eventId, item.playerId || null, item.playerId ? '' : item.name, item.status, item.note || null]
      );
      existingByKey.set(key, { id });
    }
    imported.push({ ...item, id });
  }

  await logAudit({
    actorUserId: req.user.id,
    action: 'event_signup_import_paste',
    targetType: 'event',
    targetId: eventId,
    summary: `导入微信群接龙：${event.title}`,
    metadata: {
      parsedCount: parsed.length,
      importedCount: imported.length,
      matchedCount: imported.filter(x => x.playerId).length,
      source: clean(b.source || 'mini_import', 40),
    },
  }).catch(() => {});

  res.status(201).json({
    ok: true,
    parsed,
    imported,
    matchedCount: imported.filter(x => x.playerId).length,
    unmatchedCount: imported.filter(x => !x.playerId).length,
    signups: (await db.q(signupSelect('WHERE es.event_id = ?'), [eventId])).map(rowToSignup),
  });
}));

router.post('/admin-upsert', requirePermission('events:write'), wrap(async (req, res) => {
  await ensureEventSignupTable();
  const b = req.body || {};
  const eventId = clean(b.eventId, 64);
  const playerId = clean(b.playerId, 64);
  const manualName = clean(b.manualName, 120);
  const status = clean(b.status || 'going', 20);
  const note = clean(b.note, 1000);
  const source = clean(b.source || 'mini_admin_manual', 40);
  if (!eventId) return res.status(400).json({ error: 'bad_request', message: 'eventId 必填' });
  if (!validSignupStatus(status)) return res.status(400).json({ error: 'bad_request', message: '报名状态无效' });
  const event = await db.qOne('SELECT id, title FROM events WHERE id = ?', [eventId]);
  if (!event) return res.status(404).json({ error: 'event_missing', message: '接龙不存在' });

  let player = null;
  if (playerId) {
    player = await db.qOne('SELECT id, name FROM players WHERE id = ?', [playerId]);
    if (!player) return res.status(404).json({ error: 'player_missing', message: '球员不存在' });
  } else if (!manualName) {
    return res.status(400).json({ error: 'bad_request', message: '请选择球员或填写手动姓名' });
  }

  const existingRows = await db.q(signupSelect('WHERE es.event_id = ?'), [eventId]);
  const targetKey = player ? `player:${player.id}` : `manual:${canonicalNameKey(manualName)}`;
  const existing = existingRows.find(row => signupMatchKey(row) === targetKey);
  const id = existing?.id || `esu_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  if (existing) {
    await db.q(
      `UPDATE event_signups
       SET user_id = NULL, player_id = ?, manual_name = ?, status = ?, note = ?, source = ?, updated_at = NOW()
       WHERE id = ?`,
      [player ? player.id : null, player ? '' : manualName, status, note || null, source, id]
    );
  } else {
    await db.q(
      `INSERT INTO event_signups (id, event_id, user_id, player_id, manual_name, status, note, source)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [id, eventId, player ? player.id : null, player ? '' : manualName, status, note || null, source]
    );
  }

  await logAudit({
    actorUserId: req.user.id,
    action: existing ? 'event_signup_admin_update' : 'event_signup_admin_create',
    targetType: 'event',
    targetId: eventId,
    summary: `${existing ? '更新' : '手动新增'}接龙名单：${player?.name || manualName}`,
    metadata: { signupId: id, playerId: player?.id || '', manualName, status, source },
  }).catch(() => {});
  res.status(existing ? 200 : 201).json({ ok: true, signup: rowToSignup(await loadSignup(id)) });
}));

router.patch('/:id', requirePermission('events:write'), wrap(async (req, res) => {
  await ensureEventSignupTable();
  const row = await loadSignup(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const fields = [];
  const values = [];
  if (b.status !== undefined) {
    const status = clean(b.status, 20);
    if (!validSignupStatus(status)) return res.status(400).json({ error: 'bad_request', message: '报名状态无效' });
    fields.push('status = ?');
    values.push(status);
  }
  if (b.note !== undefined) {
    fields.push('note = ?');
    values.push(clean(b.note, 1000) || null);
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request', message: '没有可更新字段' });
  fields.push('updated_at = NOW()');
  values.push(req.params.id);
  await db.q(`UPDATE event_signups SET ${fields.join(', ')} WHERE id = ?`, values);
  await logAudit({
    actorUserId: req.user.id,
    action: 'event_signup_admin_update',
    targetType: 'event',
    targetId: row.event_id,
    summary: '管理员更新接龙名单',
    metadata: { signupId: req.params.id, fields: Object.keys(b) },
  }).catch(() => {});
  res.json({ ok: true, signup: rowToSignup(await loadSignup(req.params.id)) });
}));

router.post('/:id/cancel', requireAuth, wrap(async (req, res) => {
  await ensureEventSignupTable();
  const row = await loadSignup(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user.id && !hasPermission(req.user, 'events:write')) {
    return res.status(403).json({ error: 'forbidden', message: '只能取消自己的报名' });
  }
  await db.q(`UPDATE event_signups SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [req.params.id]);
  await logAudit({
    actorUserId: req.user.id,
    action: 'event_signup_cancel',
    targetType: 'event',
    targetId: row.event_id,
    summary: '取消活动报名',
    metadata: { signupId: req.params.id },
  }).catch(() => {});
  res.json({ ok: true, signup: rowToSignup(await loadSignup(req.params.id)) });
}));

function signupMatchKey(row) {
  if (row.player_id) return `player:${row.player_id}`;
  const name = row.manual_name || row.player_name || row.user_display_name || '';
  const key = canonicalNameKey(name);
  return key ? `manual:${key}` : '';
}

function parseRelayPaste(text, players = []) {
  const parsed = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const item = parseRelayLine(rawLine, players);
    if (!item) continue;
    const key = item.playerId ? `player:${item.playerId}` : `manual:${canonicalNameKey(item.name)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push({ ...item, order: parsed.length + 1 });
  }
  return parsed;
}

function parseRelayLine(rawLine, players = []) {
  const raw = String(rawLine || '').trim();
  if (!raw) return null;
  const numbered = /^\s*(?:\d+|[一二三四五六七八九十]+)[\.、\)\）:：\s]+/.test(raw);
  if (!numbered && (/^(接龙|报名|名单|时间|地点|活动|比赛|训练|复制|点击|参与|共\s*\d+\s*人)/.test(raw) || /接龙\s*$/.test(raw))) return null;
  let line = raw
    .replace(/^[#>*\-\s]+/, '')
    .replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[\.、\)\）:：\s]+/, '')
    .replace(/^[✅☑✔✖❌⭕️\s]+/, '')
    .trim();
  if (!line) return null;

  let status = 'going';
  if (/待定|可能|看情况|不确定|pending/i.test(line)) status = 'tentative';
  if (/取消|请假|不去|不能|缺席|退出|cancel/i.test(line)) status = 'cancelled';

  let name = line;
  let note = '';
  const sep = line.match(/^(.{1,20}?)(?:\s+|[，,;；：:\(（\-—])(.+)$/);
  if (sep) {
    name = sep[1];
    note = sep[2];
  }
  name = name
    .replace(/[✅☑✔✖❌⭕️]/g, '')
    .replace(/^(报名|待定|请假|取消)\s*/, '')
    .replace(/\s*(报名|待定|请假|取消)$/, '')
    .trim();
  note = note
    .replace(/^[）)\-—，,;；：:\s]+/, '')
    .trim();
  if (!name || name.length > 24 || canonicalNameKey(name).length < 1) return null;

  let player = findPlayerByName(players, name);
  if (!player) {
    const resolved = resolveRegisteredPlayerName(players, name);
    if (resolved && resolved !== name) player = findPlayerByName(players, resolved);
  }
  return {
    raw,
    name,
    status,
    note,
    playerId: player?.id || '',
    playerName: player?.name || '',
    matched: !!player,
  };
}

module.exports = { router, ensureEventSignupTable, rowToSignup, parseRelayPaste };
