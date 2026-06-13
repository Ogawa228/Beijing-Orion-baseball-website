// /api/tournaments/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

let locationColumnReady = false;

async function ensureLocationColumn() {
  if (locationColumnReady) return;
  const col = await db.qOne(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tournaments'
      AND COLUMN_NAME = 'location'
  `);
  if (!col) {
    await db.q("ALTER TABLE tournaments ADD COLUMN location VARCHAR(120) DEFAULT '' AFTER description");
  }
  locationColumnReady = true;
}

const tournamentSelect = `
  SELECT id, type, name, short_name, season, sport,
         DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
         cover, description, location
  FROM tournaments
`;

function inferTournamentLocation(r) {
  const haystack = `${r.name || ''} ${r.short_name || ''} ${r.description || ''}`;
  if (/猛虎/.test(haystack)) return '北京市通州区私立树人学校棒球场';
  if (/奥体|周末常规训练/.test(haystack)) return '北京奥体中心棒垒球场';
  return '';
}

function rowToTournament(r) {
  if (!r) return null;
  return {
    id: r.id, type: r.type, name: r.name, shortName: r.short_name,
    season: r.season, sport: r.sport,
    startDate: r.start_date, endDate: r.end_date,
    cover: r.cover, description: r.description, location: r.location || inferTournamentLocation(r),
  };
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

async function loadTournamentGameCounts() {
  const rows = await db.q(`
    SELECT COALESCE(tournament_id, '') AS tournament_id, season, COUNT(*) AS game_count
    FROM games
    WHERE is_aggregate = FALSE
    GROUP BY COALESCE(tournament_id, ''), season
  `);
  const direct = new Map();
  const fallbackBySeason = new Map();
  let totalGameCount = 0;
  rows.forEach(row => {
    const count = Number(row.game_count || 0);
    const tournamentId = String(row.tournament_id || '').trim();
    const season = String(row.season || '').trim();
    totalGameCount += count;
    if (tournamentId) {
      direct.set(tournamentId, (direct.get(tournamentId) || 0) + count);
    } else if (season) {
      fallbackBySeason.set(season, (fallbackBySeason.get(season) || 0) + count);
    }
  });
  return { direct, fallbackBySeason, totalGameCount };
}

function attachGameCounts(tournaments, counts) {
  return tournaments.map(tournament => ({
    ...tournament,
    gameCount: (counts.direct.get(tournament.id) || 0)
      + (tournament.season ? (counts.fallbackBySeason.get(tournament.season) || 0) : 0),
  }));
}

router.get('/', wrap(async (req, res) => {
  await ensureLocationColumn();
  const filters = [];
  const params = [];
  if (req.query.type)   { filters.push('type = ?');   params.push(req.query.type); }
  if (req.query.season) { filters.push('season = ?'); params.push(req.query.season); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const pageSql = limit ? ' LIMIT ? OFFSET ?' : '';
  const rows = await db.q(
    `${tournamentSelect} ${where} ORDER BY start_date DESC${pageSql}`,
    limit ? params.concat(limit + 1, offset) : params
  );
  const pageRows = limit ? rows.slice(0, limit) : rows;
  let tournaments = pageRows.map(rowToTournament);
  let totalGameCount;
  if (req.query.includeGameCount === 'true') {
    const counts = await loadTournamentGameCounts();
    tournaments = attachGameCounts(tournaments, counts);
    totalGameCount = counts.totalGameCount;
  }
  res.json({
    tournaments,
    totalGameCount,
    hasMore: limit ? rows.length > limit : false,
    nextOffset: limit ? offset + pageRows.length : rows.length,
  });
}));

router.get('/:id', wrap(async (req, res) => {
  await ensureLocationColumn();
  const row = await db.qOne(`${tournamentSelect} WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ tournament: rowToTournament(row) });
}));

router.post('/', requirePermission('tournaments:write'), wrap(async (req, res) => {
  await ensureLocationColumn();
  const b = req.body || {};
  if (!b.name || !b.type) return res.status(400).json({ error: 'bad_request', message: 'name / type 必填' });
  const id = b.id || `t_${Date.now()}`;
  await db.q(
    `INSERT INTO tournaments (id, type, name, short_name, season, sport, start_date, end_date, cover, description, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, b.type, b.name, b.shortName || '', b.season || '', b.sport || 'mixed',
     b.startDate || null, b.endDate || null, b.cover || null, b.description || null, b.location || '']
  );
  const tournament = rowToTournament(await db.qOne(`${tournamentSelect} WHERE id = ?`, [id]));
  await logAudit({
    actorUserId: req.user?.id,
    action: 'tournament_create',
    targetType: 'tournament',
    targetId: id,
    summary: `创建赛事「${tournament?.name || b.name || id}」`,
    metadata: { after: tournament },
  }).catch(() => {});
  res.status(201).json({ tournament });
}));

router.patch('/:id', requirePermission('tournaments:write'), wrap(async (req, res) => {
  await ensureLocationColumn();
  const b = req.body || {};
  const before = rowToTournament(await db.qOne(`${tournamentSelect} WHERE id = ?`, [req.params.id]));
  const map = {
    type: 'type', name: 'name', shortName: 'short_name', season: 'season', sport: 'sport',
    startDate: 'start_date', endDate: 'end_date', cover: 'cover', description: 'description',
    location: 'location',
  };
  const changedKeys = [];
  const fields = [], values = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(b[k]);
      changedKeys.push(k);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = ?`, values);
  const tournament = rowToTournament(await db.qOne(`${tournamentSelect} WHERE id = ?`, [req.params.id]));
  await logAudit({
    actorUserId: req.user?.id,
    action: 'tournament_update',
    targetType: 'tournament',
    targetId: req.params.id,
    summary: `编辑赛事「${tournament?.name || before?.name || req.params.id}」`,
    metadata: { before, after: tournament, changedKeys },
  }).catch(() => {});
  res.json({ tournament });
}));

router.delete('/:id', requirePermission('destructive:delete'), wrap(async (req, res) => {
  await ensureLocationColumn();
  const before = rowToTournament(await db.qOne(`${tournamentSelect} WHERE id = ?`, [req.params.id]));
  await db.q('DELETE FROM tournaments WHERE id = ?', [req.params.id]);
  await logAudit({
    actorUserId: req.user?.id,
    action: 'tournament_delete',
    targetType: 'tournament',
    targetId: req.params.id,
    summary: `删除赛事「${before?.name || req.params.id}」`,
    metadata: { before },
  }).catch(() => {});
  res.json({ ok: true });
}));

module.exports = { router, rowToTournament };
