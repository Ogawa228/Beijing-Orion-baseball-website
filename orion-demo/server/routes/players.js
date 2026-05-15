// /api/players/* 路由：球员池 CRUD + 升级
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requireAdmin } = require('../middleware');
const { canonicalNameKey } = require('../name-utils');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function parseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function uniqueNamesByCanonical(items) {
  const out = [];
  const seen = new Set();
  for (const raw of items || []) {
    const name = String(raw || '').trim();
    const key = canonicalNameKey(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// 把 DB 行转换成前端友好的对象（snake_case → camelCase + 解 JSON）
function rowToPlayer(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    number: r.number,
    position: r.position,
    photo: r.photo,
    slogan: r.slogan,
    bats: r.bats,
    throws: r.throws_,         // throws_ 是关键字回避
    joinYear: r.join_year,
    titles: parseJsonArray(r.titles),
    aliases: parseJsonArray(r.aliases),
    level: r.level,
    upgradedAt: r.upgraded_at,
    upgradedBy: r.upgraded_by,
  };
}

// GET /api/players - 列表（默认只返 verified；?include=casual 返 casual）
router.get('/', wrap(async (req, res) => {
  const inc = (req.query.include || '').toLowerCase();
  let where = '';
  if (inc === 'all' || inc === 'casual') where = '';
  else where = `WHERE level = 'verified'`;
  const rows = await db.q(`SELECT * FROM players ${where} ORDER BY created_at ASC`);
  res.json({ players: rows.map(rowToPlayer) });
}));

// POST /api/players/merge - 合并两个球员档案（admin only）
//
// 语义：保留 target player；source player 的姓名/别名并入 target.aliases，
// 所有 player_id 引用迁到 target，最后删除 source。
// 比赛 JSON 里的 batting/pitching 原始姓名不批量改，保留 GameChanger 原始记录；
// 后续统计靠 aliases 把 "Andy" 等名字归并到目标球员。
router.post('/merge', requireAdmin, wrap(async (req, res) => {
  const { sourceId, targetId, keepSourceAsAlias = true } = req.body || {};
  if (!sourceId || !targetId) {
    return res.status(400).json({ error: 'bad_request', message: 'sourceId / targetId 必填' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: 'same_player', message: '源球员和目标球员不能相同' });
  }

  const conn = await db.getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [[source]] = await conn.execute('SELECT * FROM players WHERE id = ? FOR UPDATE', [sourceId]);
    const [[target]] = await conn.execute('SELECT * FROM players WHERE id = ? FOR UPDATE', [targetId]);
    if (!source || !target) {
      await conn.rollback();
      return res.status(404).json({ error: 'not_found', message: '源球员或目标球员不存在' });
    }

    const targetNameKey = canonicalNameKey(target.name);
    const mergedAliases = uniqueNamesByCanonical([
      ...parseJsonArray(target.aliases),
      ...(keepSourceAsAlias ? [source.name] : []),
      ...parseJsonArray(source.aliases),
    ]).filter(name => canonicalNameKey(name) !== targetNameKey);
    const mergedTitles = uniqueNamesByCanonical([
      ...parseJsonArray(target.titles),
      ...parseJsonArray(source.titles),
    ]);

    const keepVerified = target.level === 'verified' || source.level === 'verified';
    await conn.execute(
      `UPDATE players
       SET aliases = ?, titles = ?,
           number = CASE WHEN COALESCE(number, '') = '' THEN ? ELSE number END,
           position = CASE WHEN COALESCE(position, '') = '' THEN ? ELSE position END,
           photo = CASE WHEN COALESCE(photo, '') = '' THEN ? ELSE photo END,
           slogan = CASE WHEN COALESCE(slogan, '') = '' THEN ? ELSE slogan END,
           bats = CASE WHEN COALESCE(bats, '') = '' THEN ? ELSE bats END,
           throws_ = CASE WHEN COALESCE(throws_, '') = '' THEN ? ELSE throws_ END,
           join_year = CASE WHEN join_year IS NULL THEN ? ELSE join_year END,
           level = ?, upgraded_at = CASE WHEN ? = 'verified' AND upgraded_at IS NULL THEN NOW() ELSE upgraded_at END,
           upgraded_by = CASE WHEN ? = 'verified' AND upgraded_by IS NULL THEN 'merge' ELSE upgraded_by END
       WHERE id = ?`,
      [
        mergedAliases.length ? JSON.stringify(mergedAliases) : null,
        JSON.stringify(mergedTitles),
        source.number || '',
        source.position || '',
        source.photo || null,
        source.slogan || '',
        source.bats || '',
        source.throws_ || '',
        source.join_year || null,
        keepVerified ? 'verified' : target.level,
        keepVerified ? 'verified' : target.level,
        keepVerified ? 'verified' : target.level,
        targetId,
      ]
    );

    const counts = {};
    let result;

    [result] = await conn.execute('UPDATE users SET bound_player_id = ? WHERE bound_player_id = ?', [targetId, sourceId]);
    counts.users = result.affectedRows || 0;

    [result] = await conn.execute('UPDATE bind_codes SET player_id = ? WHERE player_id = ?', [targetId, sourceId]);
    counts.bindCodes = result.affectedRows || 0;

    [result] = await conn.execute('UPDATE attendances SET player_id = ? WHERE player_id = ?', [targetId, sourceId]);
    counts.attendances = result.affectedRows || 0;

    [result] = await conn.execute('UPDATE points_adjustments SET player_id = ? WHERE player_id = ?', [targetId, sourceId]);
    counts.pointsAdjustments = result.affectedRows || 0;

    const [[sourceHof]] = await conn.execute('SELECT * FROM hall_of_fame WHERE player_id = ?', [sourceId]);
    const [[targetHof]] = await conn.execute('SELECT * FROM hall_of_fame WHERE player_id = ?', [targetId]);
    counts.hallOfFame = 0;
    if (sourceHof && !targetHof) {
      [result] = await conn.execute('UPDATE hall_of_fame SET player_id = ? WHERE player_id = ?', [targetId, sourceId]);
      counts.hallOfFame = result.affectedRows || 0;
    } else if (sourceHof && targetHof) {
      const sourceReason = String(sourceHof.reason || '').trim();
      if (sourceReason) {
        await conn.execute(
          `UPDATE hall_of_fame
           SET reason = TRIM(CONCAT(COALESCE(reason, ''), CASE WHEN COALESCE(reason, '') = '' THEN '' ELSE '\n\n' END, ?)),
               inducted_year = CASE
                 WHEN inducted_year IS NULL THEN ?
                 WHEN ? IS NULL THEN inducted_year
                 WHEN ? < inducted_year THEN ?
                 ELSE inducted_year
               END
           WHERE player_id = ?`,
          [`[由「${source.name}」合并] ${sourceReason}`, sourceHof.inducted_year, sourceHof.inducted_year, sourceHof.inducted_year, sourceHof.inducted_year, targetId]
        );
      }
      [result] = await conn.execute('DELETE FROM hall_of_fame WHERE player_id = ?', [sourceId]);
      counts.hallOfFame = result.affectedRows || 0;
    }

    const highlightNames = uniqueNamesByCanonical([source.name, ...parseJsonArray(source.aliases)]);
    counts.highlights = 0;
    for (const name of highlightNames) {
      [result] = await conn.execute('UPDATE highlights SET player_name = ? WHERE player_name = ?', [target.name, name]);
      counts.highlights += result.affectedRows || 0;
    }

    [result] = await conn.execute('DELETE FROM players WHERE id = ?', [sourceId]);
    counts.deletedPlayers = result.affectedRows || 0;

    await conn.commit();

    const [[updated]] = await conn.execute('SELECT * FROM players WHERE id = ?', [targetId]);
    await logAudit({
      actorUserId: req.user?.id,
      action: 'player_merge',
      targetType: 'player',
      targetId,
      summary: `合并球员「${source.name}」到「${target.name}」`,
      metadata: { sourceId, targetId, keepSourceAsAlias, aliases: mergedAliases, counts },
    }).catch(() => {});
    res.json({
      ok: true,
      source: rowToPlayer(source),
      target: rowToPlayer(updated),
      aliases: mergedAliases,
      counts,
      message: `已将「${source.name}」合并到「${target.name}」`,
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}));

// GET /api/players/:id - 单球员
router.get('/:id', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ player: rowToPlayer(row) });
}));

// POST /api/players - 新建（admin only）
router.post('/', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'bad_request', message: 'name 必填' });
  const id = b.id || `p_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  await db.q(
    `INSERT INTO players (id, name, number, position, photo, slogan, bats, throws_, join_year, titles, aliases, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, b.name, b.number || '', b.position || '', b.photo || null, b.slogan || '',
      b.bats || '', b.throws || '', b.joinYear || null,
      JSON.stringify(b.titles || []),
      b.aliases ? JSON.stringify(b.aliases) : null,
      b.level || 'verified'
    ]
  );
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_create',
    targetType: 'player',
    targetId: id,
    summary: `新增球员「${row.name}」`,
    metadata: { playerId: id, level: row.level },
  }).catch(() => {});
  res.status(201).json({ player: rowToPlayer(row) });
}));

// PATCH /api/players/:id - 更新（admin only）
router.patch('/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const fields = [], values = [];
  const map = {
    name: 'name', number: 'number', position: 'position', photo: 'photo', slogan: 'slogan',
    bats: 'bats', throws: 'throws_', joinYear: 'join_year', level: 'level'
  };
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  if (b.titles !== undefined)  { fields.push('titles = ?');  values.push(JSON.stringify(b.titles || [])); }
  if (b.aliases !== undefined) { fields.push('aliases = ?'); values.push(b.aliases ? JSON.stringify(b.aliases) : null); }
  if (!fields.length) return res.status(400).json({ error: 'bad_request', message: '没有可更新字段' });
  values.push(req.params.id);
  const before = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  await db.q(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_update',
    targetType: 'player',
    targetId: req.params.id,
    summary: `编辑球员「${row?.name || req.params.id}」`,
    metadata: { fields: Object.keys(b), beforeName: before?.name || '' },
  }).catch(() => {});
  res.json({ player: rowToPlayer(row) });
}));

// DELETE /api/players/:id (admin only)
router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const before = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  await db.q('DELETE FROM players WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_delete',
    targetType: 'player',
    targetId: req.params.id,
    summary: `删除球员「${before?.name || req.params.id}」`,
    metadata: { player: rowToPlayer(before) },
  }).catch(() => {});
  res.json({ ok: true });
}));

// POST /api/players/:id/upgrade - admin 手动升级 casual → verified
// 重名检测：如果已有 verified player 同名，拒绝直接升级，提示走绑定码合并
router.post('/:id/upgrade', requireAdmin, wrap(async (req, res) => {
  const player = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!player) return res.status(404).json({ error: 'not_found' });
  if (player.level === 'verified') return res.json({ player: rowToPlayer(player), already: true });
  const dup = await db.qOne(
    `SELECT id, name FROM players WHERE level = 'verified' AND id != ? AND name = ?`,
    [req.params.id, player.name]
  );
  if (dup) {
    return res.status(409).json({
      error: 'name_conflict',
      message: `已有同名正式队员「${dup.name}」(${dup.id})；请用绑定码把当前账号合并到对方，不要独立创建`,
      conflictWith: dup.id,
    });
  }
  await db.q(
    `UPDATE players SET level = 'verified', upgraded_at = NOW(), upgraded_by = 'admin' WHERE id = ?`,
    [req.params.id]
  );
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_upgrade',
    targetType: 'player',
    targetId: req.params.id,
    summary: `升级试训球员「${row.name}」为正式队员`,
    metadata: { playerId: req.params.id },
  }).catch(() => {});
  res.json({ player: rowToPlayer(row) });
}));

module.exports = { router, rowToPlayer };
