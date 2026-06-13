// /api/players/* 路由：球员池 CRUD + 升级
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { hasPermission } = require('../permissions');
const { canonicalNameKey } = require('../name-utils');
const { logAudit } = require('../people-helpers');
const { ensurePlayerPublicProfileSchema } = require('../player-public-profile');

const router = express.Router();

function canPatchPlayer(req, body) {
  const keys = Object.keys(body || {}).filter(k => !k.startsWith('_'));
  if (!keys.length) return false;
  if (hasPermission(req.user, 'players:write')) return true;
  const displayOnly = keys.every(k => ['photo', 'slogan'].includes(k));
  if (displayOnly && hasPermission(req.user, 'players:display_write')) return true;
  const aliasOnly = keys.every(k => ['aliases'].includes(k));
  if (aliasOnly && hasPermission(req.user, 'games:revise')) return true;
  return false;
}

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

function splitList(value) {
  if (Array.isArray(value)) return uniqueNamesByCanonical(value);
  return uniqueNamesByCanonical(String(value || '').split(/[、,，;；|/]/));
}

function normalizePhotoUrl(value) {
  const url = String(value || '').trim();
  if (!url || url.length > 2048 || /^data:/i.test(url)) return '';
  return url;
}

function buildPlayerPhotoMap(value) {
  const entries = Array.isArray(value)
    ? value.map(item => [item?.name || item?.playerName, item?.url || item?.photo])
    : Object.entries(value || {});
  const map = new Map();
  for (const [name, rawUrl] of entries.slice(0, 200)) {
    const key = canonicalNameKey(name);
    const url = normalizePhotoUrl(rawUrl);
    if (!key || !url || map.has(key)) continue;
    map.set(key, url);
  }
  return map;
}

function splitImportLine(line) {
  const cleaned = String(line || '')
    .replace(/^\s*(?:\d+[\.\)、)]|[-*•])\s*/, '')
    .trim();
  if (!cleaned) return [];
  if (/[,，\t]/.test(cleaned)) return cleaned.split(/[,，\t]/).map(s => s.trim());
  const parts = cleaned.split(/\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= 3) return parts;
  return [parts[0], parts[1], parts.slice(2).join(' ')];
}

function parseListLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 200);
}

function parseListOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10000);
}

function flag(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function buildPlayerListWhere(query) {
  const inc = String(query.include || '').toLowerCase();
  const whereParts = [];
  const params = [];
  if (inc !== 'all' && inc !== 'casual') whereParts.push(`level = 'verified'`);
  const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
  if (keyword) {
    const like = `%${keyword}%`;
    whereParts.push(`(
      LOWER(name) LIKE ?
      OR LOWER(COALESCE(number, '')) LIKE ?
      OR LOWER(COALESCE(position, '')) LIKE ?
      OR LOWER(COALESCE(public_display_name, '')) LIKE ?
      OR CAST(join_year AS CHAR) LIKE ?
      OR LOWER(COALESCE(CAST(aliases AS CHAR), '')) LIKE ?
      OR LOWER(COALESCE(CAST(titles AS CHAR), '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like);
  }
  return {
    where: whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    params,
  };
}

function parsePlayerImportText(text) {
  const rows = [];
  const invalid = [];
  String(text || '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const parts = splitImportLine(line);
    const name = String(parts[0] || '').trim();
    if (!name || /^姓名$/i.test(name)) return;
    if (name.length > 80) {
      invalid.push({ line: index + 1, text: line, reason: '姓名过长' });
      return;
    }
    const joinYearValue = String(parts[5] || '').trim();
    const joinYear = joinYearValue ? Number(joinYearValue) : null;
    if (joinYearValue && (!Number.isInteger(joinYear) || joinYear < 1900 || joinYear > 2100)) {
      invalid.push({ line: index + 1, text: line, reason: '入队年份格式不正确' });
      return;
    }
    rows.push({
      line: index + 1,
      name,
      number: String(parts[1] || '').trim(),
      position: String(parts[2] || '').trim(),
      bats: String(parts[3] || '').trim(),
      throws: String(parts[4] || '').trim(),
      joinYear,
      aliases: splitList(parts.slice(6).join('、')),
    });
  });
  return { rows, invalid };
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
    publicDisplayName: r.public_display_name || '',
    publicAvatar: r.public_avatar || '',
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
  await ensurePlayerPublicProfileSchema();
  const { where, params } = buildPlayerListWhere(req.query || {});
  const limit = parseListLimit(req.query.limit);
  const offset = parseListOffset(req.query.offset);
  const pageParams = limit ? params.concat(limit + 1, offset) : params;
  const rows = await db.q(
    `SELECT * FROM players ${where} ORDER BY created_at ASC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    pageParams
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  const body = {
    players: pageRows.map(rowToPlayer),
    hasMore: limit ? rows.length > limit : false,
    nextOffset: limit ? offset + pageRows.length : rows.length,
  };
  if (flag(req.query.includeTotal)) {
    const countRow = await db.qOne(`SELECT COUNT(*) AS total FROM players ${where}`, params);
    body.total = Number(countRow?.total || 0);
  }
  if (flag(req.query.includePositionCount)) {
    const countRow = await db.qOne(
      `SELECT COUNT(DISTINCT CASE WHEN TRIM(COALESCE(position, '')) <> '' THEN TRIM(position) END) AS total FROM players ${where}`,
      params
    );
    body.positionCount = Number(countRow?.total || 0);
  }
  res.json(body);
}));

// PATCH /api/players/:id/public-profile - 球员本人或管理员维护球员页公开展示资料
router.patch('/:id/public-profile', wrap(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  await ensurePlayerPublicProfileSchema();
  const player = await db.qOne('SELECT id, name, level FROM players WHERE id = ?', [req.params.id]);
  if (!player) return res.status(404).json({ error: 'not_found' });
  const isSelfVerified = req.user.bound_player_id === req.params.id && player.level === 'verified';
  const canAdminEdit = hasPermission(req.user, 'players:display_write') || hasPermission(req.user, 'players:write');
  if (!isSelfVerified && !canAdminEdit) {
    return res.status(403).json({ error: 'forbidden', message: '只有球员本人或管理员可以修改公开展示资料' });
  }
  req.publicProfilePlayer = player;
  next();
}), wrap(async (req, res) => {
  const body = req.body || {};
  const fields = [];
  const values = [];
  if (body.publicDisplayName !== undefined) {
    const name = String(body.publicDisplayName || '').trim();
    if (name.length > 80) return res.status(400).json({ error: 'bad_request', message: '公开展示名称不能超过 80 个字符' });
    fields.push('public_display_name = ?');
    values.push(name);
  }
  if (body.publicAvatar !== undefined) {
    const avatar = String(body.publicAvatar || '').trim();
    if (avatar.length > 1_200_000) return res.status(400).json({ error: 'bad_request', message: '公开展示头像数据过大，请重新上传压缩后的图片' });
    fields.push('public_avatar = ?');
    values.push(avatar || null);
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request', message: '没有可更新字段' });
  values.push(req.params.id);
  await db.q(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_public_profile_update',
    targetType: 'player',
    targetId: req.params.id,
    summary: `更新球员公开展示资料「${req.publicProfilePlayer?.name || req.params.id}」`,
    metadata: { fields: Object.keys(body || {}) },
  }).catch(() => {});
  res.json({ player: rowToPlayer(row) });
}));

// POST /api/players/merge - 合并两个球员档案（admin only）
//
// 语义：保留 target player；source player 的姓名/别名并入 target.aliases，
// 所有 player_id 引用迁到 target，最后删除 source。
// 比赛 JSON 里的 batting/pitching 原始姓名不批量改，保留 GameChanger 原始记录；
// 后续统计靠 aliases 把 "Andy" 等名字归并到目标球员。
router.post('/merge', requirePermission('players:write'), wrap(async (req, res) => {
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

// POST /api/players/import - 粘贴名单批量创建球员（admin only）
router.post('/import', requirePermission('players:write'), wrap(async (req, res) => {
  await ensurePlayerPublicProfileSchema();
  const b = req.body || {};
  const level = b.level === 'verified' ? 'verified' : 'casual';
  const photoMap = buildPlayerPhotoMap(b.photos || b.photoMap || {});
  const { rows, invalid } = parsePlayerImportText(b.text || b.playersText || '');
  if (!rows.length) {
    return res.status(400).json({ error: 'bad_request', message: '请粘贴球员名单' });
  }
  if (rows.length > 100) {
    return res.status(400).json({ error: 'too_many_players', message: '一次最多导入 100 名球员' });
  }

  const existingRows = await db.q('SELECT id, name, aliases FROM players');
  const existingKeys = new Map();
  for (const player of existingRows || []) {
    const names = [player.name, ...parseJsonArray(player.aliases)];
    for (const name of names) {
      const key = canonicalNameKey(name);
      if (key && !existingKeys.has(key)) existingKeys.set(key, player);
    }
  }

  const seenImportKeys = new Set();
  const created = [];
  const skipped = [];
  for (const row of rows) {
    const key = canonicalNameKey(row.name);
    if (!key) {
      invalid.push({ line: row.line, text: row.name, reason: '姓名无效' });
      continue;
    }
    if (existingKeys.has(key)) {
      skipped.push({
        line: row.line,
        name: row.name,
        reason: `已存在：${existingKeys.get(key).name}`,
      });
      continue;
    }
    if (seenImportKeys.has(key)) {
      skipped.push({ line: row.line, name: row.name, reason: '本次导入重复' });
      continue;
    }
    seenImportKeys.add(key);
    const photo = photoMap.get(key) || '';

    const id = `p_${Date.now()}_${created.length}_${crypto.randomBytes(2).toString('hex')}`;
    await db.q(
      `INSERT INTO players (id, name, number, position, photo, slogan, bats, throws_, join_year, titles, aliases, level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        row.name,
        row.number || '',
        row.position || '',
        photo || null,
        '',
        row.bats || '',
        row.throws || '',
        row.joinYear || null,
        JSON.stringify([]),
        row.aliases.length ? JSON.stringify(row.aliases) : null,
        level,
      ]
    );
    const inserted = await db.qOne('SELECT * FROM players WHERE id = ?', [id]);
    created.push(rowToPlayer(inserted));
  }
  const matchedPhotoCount = created.filter(player => player.photo).length;

  await logAudit({
    actorUserId: req.user?.id,
    action: 'player_batch_import',
    targetType: 'player',
    targetId: '',
    summary: `批量导入球员 ${created.length} 人`,
    metadata: {
      level,
      created: created.map(player => ({ id: player.id, name: player.name })),
      matchedPhotoCount,
      skipped,
      invalid,
      totalRows: rows.length,
    },
  }).catch(() => {});

  res.status(201).json({
    ok: true,
    level,
    created,
    skipped,
    invalid,
    summary: {
      total: rows.length,
      created: created.length,
      skipped: skipped.length,
      invalid: invalid.length,
      photoMatched: matchedPhotoCount,
    },
  });
}));

// GET /api/players/:id - 单球员
router.get('/:id', wrap(async (req, res) => {
  await ensurePlayerPublicProfileSchema();
  const row = await db.qOne('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ player: rowToPlayer(row) });
}));

// POST /api/players - 新建（admin only）
router.post('/', requirePermission('players:write'), wrap(async (req, res) => {
  await ensurePlayerPublicProfileSchema();
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
router.patch('/:id', wrap(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  if (!canPatchPlayer(req, req.body || {})) {
    return res.status(403).json({ error: 'forbidden', message: '权限不足', permission: 'players:write' });
  }
  next();
}), wrap(async (req, res) => {
  await ensurePlayerPublicProfileSchema();
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
router.delete('/:id', requirePermission('destructive:delete'), wrap(async (req, res) => {
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
router.post('/:id/upgrade', requirePermission('players:write'), wrap(async (req, res) => {
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
