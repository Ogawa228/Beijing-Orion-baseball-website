const crypto = require('crypto');
const db = require('./db');

let peopleTablesReady = false;

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function ensurePeopleTables() {
  if (peopleTablesReady) return;
  await db.q(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      actor_user_id VARCHAR(64) DEFAULT NULL,
      action VARCHAR(60) NOT NULL,
      target_type VARCHAR(40) DEFAULT '',
      target_id VARCHAR(64) DEFAULT '',
      summary VARCHAR(255) DEFAULT '',
      metadata JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_actor (actor_user_id),
      INDEX idx_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.q(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(120) NOT NULL,
      body TEXT DEFAULT NULL,
      payload JSON DEFAULT NULL,
      read_at DATETIME DEFAULT NULL,
      created_by VARCHAR(64) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_read (user_id, read_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  peopleTablesReady = true;
}

function rowToAuditLog(r) {
  if (!r) return null;
  let metadata = r.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; }
  }
  return {
    id: r.id,
    actorUserId: r.actor_user_id,
    actorName: r.actor_name || '',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    summary: r.summary || '',
    metadata,
    createdAt: r.created_at,
  };
}

function rowToNotification(r) {
  if (!r) return null;
  let payload = r.payload || {};
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) { payload = {}; }
  }
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body || '',
    payload,
    readAt: r.read_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

async function logAudit({ actorUserId, action, targetType = '', targetId = '', summary = '', metadata = {} }) {
  await ensurePeopleTables();
  const id = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.q(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, actorUserId || null, action, targetType, targetId, summary, JSON.stringify(metadata || {})]
  );
  return id;
}

async function createNotification({ userId, type, title, body = '', payload = {}, createdBy = null }) {
  await ensurePeopleTables();
  const id = `note_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.q(
    `INSERT INTO user_notifications (id, user_id, type, title, body, payload, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, type, title, body, JSON.stringify(payload || {}), createdBy]
  );
  return rowToNotification(await db.qOne('SELECT * FROM user_notifications WHERE id = ?', [id]));
}

async function generateBindCode(conn, playerId) {
  for (let i = 0; i < 8; i++) {
    const r1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const r2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `ORION-${r1}-${r2}`;
    try {
      await conn.execute(
        `INSERT INTO bind_codes (code, player_id, created_at) VALUES (?, ?, CURDATE())`,
        [code, playerId]
      );
      return code;
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  throw httpError(500, 'code_generation_failed', '绑定码生成失败，请重试');
}

async function bindUserToPlayer({ userId, playerId, actorUserId = null, method = 'admin_direct', bindCode = null }) {
  await ensurePeopleTables();
  const conn = await db.getPool().getConnection();
  let result;
  try {
    await conn.beginTransaction();
    const [[user]] = await conn.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw httpError(404, 'not_found', '用户不存在');
    const [[target]] = await conn.execute('SELECT * FROM players WHERE id = ? FOR UPDATE', [playerId]);
    if (!target) throw httpError(404, 'player_missing', '目标球员不存在');

    const previousId = user.bound_player_id;
    const migrated = { attendances: 0, pointsAdjustments: 0, deletedCasual: false, previousPlayerId: previousId || null };
    if (previousId && previousId !== playerId) {
      const [[prev]] = await conn.execute('SELECT * FROM players WHERE id = ? FOR UPDATE', [previousId]);
      if (prev && prev.level === 'casual') {
        let [r] = await conn.execute('UPDATE attendances SET player_id = ? WHERE player_id = ?', [playerId, previousId]);
        migrated.attendances = r.affectedRows || 0;
        [r] = await conn.execute('UPDATE points_adjustments SET player_id = ? WHERE player_id = ?', [playerId, previousId]);
        migrated.pointsAdjustments = r.affectedRows || 0;
        await conn.execute('DELETE FROM players WHERE id = ?', [previousId]);
        migrated.deletedCasual = true;
      }
    }

    if (target.level !== 'verified') {
      await conn.execute(
        `UPDATE players SET level = 'verified', upgraded_at = NOW(), upgraded_by = ? WHERE id = ?`,
        [method === 'bind_code' ? 'bindcode' : 'admin', playerId]
      );
    }
    await conn.execute(
      'UPDATE users SET bound_player_id = ?, display_name = ? WHERE id = ?',
      [playerId, target.name, userId]
    );
    if (bindCode) {
      await conn.execute(
        `UPDATE bind_codes SET used = TRUE, used_by = ?, used_at = CURDATE() WHERE code = ?`,
        [userId, bindCode]
      );
    }

    await conn.commit();
    result = {
      ok: true,
      user: { id: userId, displayName: target.name, boundPlayerId: playerId },
      player: { id: target.id, name: target.name, level: 'verified', number: target.number, position: target.position },
      previousPlayerId: previousId || null,
      migrated,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await logAudit({
    actorUserId,
    action: method === 'bind_code' ? 'bind_code_redeem' : 'user_bind_player',
    targetType: 'user',
    targetId: userId,
    summary: `绑定到球员「${result.player.name}」`,
    metadata: { playerId, method, bindCode, migrated: result.migrated },
  }).catch(() => {});
  return result;
}

async function unbindUserFromPlayer({ userId, actorUserId }) {
  await ensurePeopleTables();
  const user = await db.qOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) throw httpError(404, 'not_found', '用户不存在');
  await db.q('UPDATE users SET bound_player_id = NULL WHERE id = ?', [userId]);
  await logAudit({
    actorUserId,
    action: 'user_unbind_player',
    targetType: 'user',
    targetId: userId,
    summary: `解除账号「${user.display_name}」的球员绑定`,
    metadata: { previousPlayerId: user.bound_player_id || null },
  });
  return { ok: true, previousPlayerId: user.bound_player_id || null };
}

module.exports = {
  ensurePeopleTables,
  rowToAuditLog,
  rowToNotification,
  logAudit,
  createNotification,
  generateBindCode,
  bindUserToPlayer,
  unbindUserFromPlayer,
};
