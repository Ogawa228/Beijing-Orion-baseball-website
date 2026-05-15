// /api/games/* 路由 —— games 是核心表，JSON 字段最多
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { resolveRegisteredPlayerName } = require('../name-utils');
const { logAudit } = require('../people-helpers');

const router = express.Router();

function rowToGame(r) {
  if (!r) return null;
  return {
    id: r.id, tournamentId: r.tournament_id,
    sport: r.sport, season: r.season, seasonName: r.season_name,
    cover: r.cover,
    date: r.date ? new Date(r.date).toISOString().slice(0,10) : null,
    venue: r.venue, innings: r.innings,
    home: r.home, away: r.away,
    homeScore: r.home_score, awayScore: r.away_score,
    linescore: r.linescore,
    homeTotals: r.home_totals, awayTotals: r.away_totals,
    batting: r.batting, oppBatting: r.opp_batting,
    pitching: r.pitching, oppPitching: r.opp_pitching,
    mvpPlayerName: r.mvp_player_name, mvpNote: r.mvp_note,
    isAggregate: !!r.is_aggregate,
  };
}

const J = v => v == null ? null : JSON.stringify(v);

async function loadPlayerPool() {
  return db.q('SELECT id, name, number, position, aliases FROM players');
}

function normalizeRegisteredRows(rows, players) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || !row.name) return row;
    const fixedName = resolveRegisteredPlayerName(players, row.name, row);
    return fixedName && fixedName !== row.name ? { ...row, name: fixedName } : row;
  });
}

function normalizeGamePayload(raw, players) {
  const b = { ...raw };
  // b.batting / b.pitching 按现有数据契约始终代表猎户侧。
  // 后端只校验猎户侧，避免把对手的同名/单字球员误改成注册球员。
  if (b.batting !== undefined) b.batting = normalizeRegisteredRows(b.batting, players);
  if (b.pitching !== undefined) b.pitching = normalizeRegisteredRows(b.pitching, players);
  if (b.mvpPlayerName) b.mvpPlayerName = resolveRegisteredPlayerName(players, b.mvpPlayerName, {});
  return b;
}

// GET /api/games?includeAggregate=true&tournamentId=...&season=...
router.get('/', wrap(async (req, res) => {
  const filters = [];
  const params = [];
  if (!req.query.includeAggregate || req.query.includeAggregate === 'false') {
    filters.push('is_aggregate = FALSE');
  }
  if (req.query.tournamentId) { filters.push('tournament_id = ?'); params.push(req.query.tournamentId); }
  if (req.query.season)       { filters.push('season = ?');        params.push(req.query.season); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.q(`SELECT * FROM games ${where} ORDER BY date DESC`, params);
  res.json({ games: rows.map(rowToGame) });
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ game: rowToGame(row) });
}));

router.post('/', requirePermission('games:confirm'), wrap(async (req, res) => {
  const players = await loadPlayerPool();
  const b = normalizeGamePayload(req.body || {}, players);
  if (!b.id) b.id = `g_${Date.now()}`;
  await db.q(
    `INSERT INTO games (id, tournament_id, sport, season, season_name, cover, date, venue, innings,
      home, away, home_score, away_score, linescore, home_totals, away_totals,
      batting, opp_batting, pitching, opp_pitching, mvp_player_name, mvp_note, is_aggregate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.id, b.tournamentId || null, b.sport || '', b.season || '', b.seasonName || '',
      b.cover || null, b.date || null, b.venue || null, b.innings || null,
      b.home || '', b.away || '', b.homeScore || null, b.awayScore || null,
      J(b.linescore), J(b.homeTotals), J(b.awayTotals),
      J(b.batting), J(b.oppBatting), J(b.pitching), J(b.oppPitching),
      b.mvpPlayerName || '', b.mvpNote || '',
      b.isAggregate ? 1 : 0,
    ]
  );
  const row = await db.qOne('SELECT * FROM games WHERE id = ?', [b.id]);
  res.status(201).json({ game: rowToGame(row) });
}));

router.patch('/:id', requirePermission('games:revise'), wrap(async (req, res) => {
  const beforeRow = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!beforeRow) return res.status(404).json({ error: 'not_found' });
  const players = await loadPlayerPool();
  const b = normalizeGamePayload(req.body || {}, players);
  const map = {
    tournamentId: 'tournament_id', sport: 'sport', season: 'season', seasonName: 'season_name',
    cover: 'cover', date: 'date', venue: 'venue', innings: 'innings',
    home: 'home', away: 'away', homeScore: 'home_score', awayScore: 'away_score',
    mvpPlayerName: 'mvp_player_name', mvpNote: 'mvp_note',
  };
  const jsonMap = {
    linescore: 'linescore', homeTotals: 'home_totals', awayTotals: 'away_totals',
    batting: 'batting', oppBatting: 'opp_batting', pitching: 'pitching', oppPitching: 'opp_pitching',
  };
  const fields = [], values = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  for (const [k, col] of Object.entries(jsonMap)) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(J(b[k])); }
  }
  if (b.isAggregate !== undefined) { fields.push('is_aggregate = ?'); values.push(b.isAggregate ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`, values);
  const afterRow = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  const game = rowToGame(afterRow);
  const reason = String((req.body && req.body._revisionReason) || '').trim();
  await logAudit({
    actorUserId: req.user.id,
    action: reason ? 'revise_game_data' : 'update_game',
    targetType: 'game',
    targetId: req.params.id,
    summary: reason
      ? `修订比赛数据：${game.away} vs ${game.home} · ${reason}`
      : `更新比赛：${game.away} vs ${game.home}`,
    metadata: {
      reason,
      source: (req.body && req.body._revisionSource) || '',
      before: rowToGame(beforeRow),
      after: game,
      changedKeys: Object.keys(req.body || {}).filter(k => !k.startsWith('_')),
    },
  });
  res.json({ game });
}));

router.delete('/:id', requirePermission('destructive:delete'), wrap(async (req, res) => {
  await db.q('DELETE FROM games WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = { router, rowToGame };
