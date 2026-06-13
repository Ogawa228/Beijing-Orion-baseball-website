// /api/games/* 路由 —— games 是核心表，JSON 字段最多
const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { findPlayerByName, resolveRegisteredPlayerName } = require('../name-utils');
const { logAudit } = require('../people-helpers');
const { parseGameChangerPdfBuffer, parseGameChangerExcelBuffer, MAX_PDF_BYTES, MAX_EXCEL_BYTES } = require('../gamechanger-import');
const { createGameRecordPdf, exportFileName } = require('../pdf-export');

const router = express.Router();

let gameSchemaReady = false;

async function ensureGameSchema() {
  if (gameSchemaReady) return;
  const cols = await db.q(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'games'
      AND COLUMN_NAME IN ('event_id', 'mvp_player_id', 'game_log', 'metadata')
  `);
  const existing = new Set(cols.map(row => row.COLUMN_NAME));
  if (!existing.has('event_id')) {
    await db.q(`ALTER TABLE games ADD COLUMN event_id VARCHAR(64) DEFAULT NULL AFTER tournament_id`);
  }
  if (!existing.has('mvp_player_id')) {
    await db.q(`ALTER TABLE games ADD COLUMN mvp_player_id VARCHAR(64) DEFAULT '' AFTER mvp_player_name`);
  }
  if (!existing.has('game_log')) {
    await db.q(`ALTER TABLE games ADD COLUMN game_log JSON DEFAULT NULL AFTER mvp_note`);
  }
  if (!existing.has('metadata')) {
    await db.q(`ALTER TABLE games ADD COLUMN metadata JSON DEFAULT NULL AFTER game_log`);
  }
  const indexes = await db.q(`
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'games'
      AND INDEX_NAME = 'idx_game_event'
  `);
  if (!indexes.length) {
    await db.q(`ALTER TABLE games ADD INDEX idx_game_event (event_id)`);
  }
  gameSchemaReady = true;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  return value;
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function parseGameLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 200);
}

function parseGameOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10000);
}

function gameKeyword(value) {
  return String(value || '').trim().toLowerCase().slice(0, 60);
}

function rowToGame(r) {
  if (!r) return null;
  const metadata = parseJson(r.metadata, {});
  return {
    id: r.id, tournamentId: r.tournament_id, eventId: r.event_id || metadata.rosterEventId || metadata.relatedEventId || '',
    sport: r.sport, season: r.season, seasonName: r.season_name,
    cover: r.cover,
    date: r.date ? new Date(r.date).toISOString().slice(0,10) : null,
    venue: r.venue, innings: r.innings,
    home: r.home, away: r.away,
    homeScore: r.home_score, awayScore: r.away_score,
    linescore: parseJson(r.linescore, null),
    homeTotals: parseJson(r.home_totals, null), awayTotals: parseJson(r.away_totals, null),
    batting: parseJson(r.batting, []), oppBatting: parseJson(r.opp_batting, []),
    pitching: parseJson(r.pitching, []), oppPitching: parseJson(r.opp_pitching, []),
    mvpPlayerName: r.mvp_player_name,
    mvpPlayerId: r.mvp_player_id || metadata.mvpPlayerId || '',
    mvpNote: r.mvp_note,
    gameLog: parseJson(r.game_log, []),
    metadata,
    isAggregate: !!r.is_aggregate,
  };
}

const J = v => v == null ? null : JSON.stringify(v);

async function loadPlayerPool() {
  return db.q('SELECT id, name, number, position, aliases FROM players');
}

async function loadTournament(id) {
  if (!id) return null;
  return db.qOne('SELECT id, name, short_name, season, sport FROM tournaments WHERE id = ?', [id]);
}

async function loadPlayerFilterKeys(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;
  const row = await db.qOne('SELECT id, name, public_display_name, aliases FROM players WHERE id = ?', [id]).catch(() => null);
  const keys = new Set([norm(id)]);
  if (row) {
    keys.add(norm(row.name));
    keys.add(norm(row.public_display_name));
    parseJson(row.aliases, []).forEach(alias => keys.add(norm(alias)));
  }
  keys.delete('');
  return keys;
}

function rowMatchesPlayerKeys(row, keys) {
  if (!row || !keys) return false;
  return keys.has(norm(row.playerId || row.player_id || row.id))
    || keys.has(norm(row.name))
    || keys.has(norm(row.playerName || row.player_name));
}

function gameMatchesPlayer(game, keys) {
  if (!game || !keys) return false;
  if (keys.has(norm(game.mvpPlayerId)) || keys.has(norm(game.mvpPlayerName))) return true;
  const lineups = []
    .concat(game.batting || [])
    .concat(game.pitching || []);
  if (lineups.some(row => rowMatchesPlayerKeys(row, keys))) return true;
  return (game.gameLog || []).some(row => {
    if (rowMatchesPlayerKeys(row, keys)) return true;
    return (row.scoredRunners || []).some(runner => rowMatchesPlayerKeys(runner, keys));
  });
}

function normalizeRegisteredRows(rows, players) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const requestedId = String(row.playerId || '').trim();
    const byId = requestedId ? players.find(player => player.id === requestedId) : null;
    const rawName = row.name || row.playerName || '';
    const fixedName = rawName ? resolveRegisteredPlayerName(players, rawName, row) : '';
    const byName = fixedName ? findPlayerByName(players, fixedName) : null;
    const player = byId || byName;
    if (!player) return fixedName && fixedName !== rawName ? { ...row, name: fixedName } : row;
    return {
      ...row,
      playerId: player.id,
      name: player.name || fixedName || rawName,
    };
  });
}

function normalizeGamePayload(raw, players) {
  const b = { ...raw };
  if (b.eventId === undefined && b.metadata && typeof b.metadata === 'object') {
    b.eventId = b.metadata.rosterEventId || b.metadata.relatedEventId || undefined;
  }
  // b.batting / b.pitching 按现有数据契约始终代表猎户侧。
  // 后端只校验猎户侧，避免把对手的同名/单字球员误改成注册球员。
  if (b.batting !== undefined) b.batting = normalizeRegisteredRows(b.batting, players);
  if (b.pitching !== undefined) b.pitching = normalizeRegisteredRows(b.pitching, players);
  const hasMvpName = Object.prototype.hasOwnProperty.call(b, 'mvpPlayerName');
  const hasMvpId = Object.prototype.hasOwnProperty.call(b, 'mvpPlayerId');
  if (hasMvpName || hasMvpId) {
    const requestedId = String(b.mvpPlayerId || '').trim();
    const byId = requestedId ? players.find(player => player.id === requestedId) : null;
    if (byId) {
      b.mvpPlayerId = byId.id;
      b.mvpPlayerName = byId.name || b.mvpPlayerName || '';
    } else if (b.mvpPlayerName) {
      b.mvpPlayerName = resolveRegisteredPlayerName(players, b.mvpPlayerName, {});
      const byName = findPlayerByName(players, b.mvpPlayerName);
      b.mvpPlayerId = byName ? byName.id : '';
    } else if (hasMvpId) {
      b.mvpPlayerId = '';
    }
    if (b.metadata && typeof b.metadata === 'object') {
      b.metadata = { ...b.metadata, mvpPlayerId: b.mvpPlayerId || '' };
    }
  }
  return b;
}

// GET /api/games?includeAggregate=true&tournamentId=...&season=...
router.get('/', wrap(async (req, res) => {
  if (req.query.eventId) await ensureGameSchema();
  const filters = [];
  const params = [];
  const limit = parseGameLimit(req.query.limit);
  const offset = parseGameOffset(req.query.offset);
  const playerKeys = await loadPlayerFilterKeys(req.query.playerId);
  const tournamentId = String(req.query.tournamentId || '').trim();
  const sport = String(req.query.sport || '').trim();
  const keyword = gameKeyword(req.query.keyword || req.query.q);
  if (!req.query.includeAggregate || req.query.includeAggregate === 'false') {
    filters.push('is_aggregate = FALSE');
  }
  if (tournamentId && req.query.includeSeasonFallback === 'true') {
    const tournament = await loadTournament(tournamentId).catch(() => null);
    if (tournament && tournament.season) {
      filters.push('(tournament_id = ? OR ((tournament_id IS NULL OR tournament_id = \'\') AND season = ?))');
      params.push(tournamentId, tournament.season);
    } else {
      filters.push('tournament_id = ?');
      params.push(tournamentId);
    }
  } else if (tournamentId) {
    filters.push('tournament_id = ?');
    params.push(tournamentId);
  }
  if (req.query.eventId)      { filters.push('event_id = ?');      params.push(req.query.eventId); }
  if (req.query.season)       { filters.push('season = ?');        params.push(req.query.season); }
  if (sport && sport !== 'all') { filters.push('sport = ?');        params.push(sport); }
  if (keyword) {
    const like = `%${keyword}%`;
    filters.push(`(
      LOWER(COALESCE(id, '')) LIKE ?
      OR LOWER(COALESCE(home, '')) LIKE ?
      OR LOWER(COALESCE(away, '')) LIKE ?
      OR LOWER(COALESCE(venue, '')) LIKE ?
      OR LOWER(COALESCE(season, '')) LIKE ?
      OR LOWER(COALESCE(season_name, '')) LIKE ?
      OR LOWER(COALESCE(sport, '')) LIKE ?
      OR DATE_FORMAT(date, '%Y-%m-%d') LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const canPageInSql = limit && !playerKeys;
  const rows = await db.q(
    `SELECT * FROM games ${where} ORDER BY date DESC${canPageInSql ? ' LIMIT ? OFFSET ?' : ''}`,
    canPageInSql ? params.concat(limit + 1, offset) : params
  );
  const games = rows.map(rowToGame).filter(game => !playerKeys || gameMatchesPlayer(game, playerKeys));
  const pagedGames = limit
    ? (playerKeys ? games.slice(offset, offset + limit) : games.slice(0, limit))
    : games;
  res.json({
    games: pagedGames,
    hasMore: limit ? games.length > (playerKeys ? offset + limit : limit) : false,
    nextOffset: limit ? offset + pagedGames.length : games.length,
  });
}));

router.get('/seasons', wrap(async (_req, res) => {
  const rows = await db.q(`
    SELECT YEAR(date) AS year
    FROM games
    WHERE date IS NOT NULL
      AND is_aggregate = FALSE
    GROUP BY YEAR(date)
    ORDER BY year DESC
  `);
  const seasons = rows
    .map(row => String(row.year || '').trim())
    .filter(year => /^\d{4}$/.test(year))
    .map(year => ({ value: year, label: `${year} 赛季` }));
  res.json({ seasons });
}));

router.get('/:id/export-pdf', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const game = rowToGame(row);
  const pdf = createGameRecordPdf(game);
  res.json({
    filename: exportFileName(game),
    mimeType: 'application/pdf',
    pdfBase64: pdf.toString('base64'),
  });
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ game: rowToGame(row) });
}));

router.post('/', requirePermission('games:confirm'), wrap(async (req, res) => {
  await ensureGameSchema();
  const players = await loadPlayerPool();
  const b = normalizeGamePayload(req.body || {}, players);
  if (!b.id) b.id = `g_${Date.now()}`;
  await db.q(
    `INSERT INTO games (id, tournament_id, event_id, sport, season, season_name, cover, date, venue, innings,
      home, away, home_score, away_score, linescore, home_totals, away_totals,
      batting, opp_batting, pitching, opp_pitching, mvp_player_name, mvp_player_id, mvp_note, game_log, metadata, is_aggregate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.id, b.tournamentId || null, b.eventId || b.metadata?.rosterEventId || b.metadata?.relatedEventId || null,
      b.sport || '', b.season || '', b.seasonName || '',
      b.cover || null, b.date || null, b.venue || null, b.innings || null,
      b.home || '', b.away || '', b.homeScore ?? null, b.awayScore ?? null,
      J(b.linescore), J(b.homeTotals), J(b.awayTotals),
      J(b.batting), J(b.oppBatting), J(b.pitching), J(b.oppPitching),
      b.mvpPlayerName || '', b.mvpPlayerId || '', b.mvpNote || '', J(b.gameLog), J(b.metadata),
      b.isAggregate ? 1 : 0,
    ]
  );
  const row = await db.qOne('SELECT * FROM games WHERE id = ?', [b.id]);
  res.status(201).json({ game: rowToGame(row) });
}));

router.post('/import-gamechanger', requirePermission('games:draft'), wrap(async (req, res) => {
  await ensureGameSchema();
  const fileName = String(req.body?.fileName || '').trim();
  const fileBase64 = String(req.body?.fileBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');
  const tournamentId = String(req.body?.tournamentId || '').trim();
  if (!fileName || !fileBase64) {
    return res.status(400).json({ error: 'bad_request', message: 'fileName / fileBase64 必填' });
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isExcel = ext === 'xls' || ext === 'xlsx';
  const isPdf = ext === 'pdf';
  if (!isPdf && !isExcel) {
    return res.status(400).json({ error: 'unsupported_file_type', message: '仅支持 PDF / XLS / XLSX' });
  }
  const buffer = Buffer.from(fileBase64, 'base64');
  const maxBytes = isExcel ? MAX_EXCEL_BYTES : MAX_PDF_BYTES;
  if (!buffer.length || buffer.length > maxBytes) {
    return res.status(buffer.length > maxBytes ? 413 : 400).json({
      error: buffer.length > maxBytes ? (isExcel ? 'excel_too_large' : 'pdf_too_large') : (isExcel ? 'empty_excel' : 'empty_pdf'),
      message: buffer.length > maxBytes ? `${isExcel ? 'Excel' : 'PDF'} 不能超过 12MB` : `${isExcel ? 'Excel' : 'PDF'} 文件为空`,
    });
  }
  const [players, tournament] = await Promise.all([
    loadPlayerPool(),
    loadTournament(tournamentId),
  ]);
  if (tournamentId && !tournament) {
    return res.status(404).json({ error: 'tournament_not_found', message: '目标赛事不存在' });
  }
  const parsed = isExcel
    ? await parseGameChangerExcelBuffer(buffer, {
      fileName,
      knownPlayers: players,
      orionName: req.body?.orionName || '猎户座',
    })
    : await parseGameChangerPdfBuffer(buffer, {
      fileName,
      knownPlayers: players,
      orionName: req.body?.orionName || '猎户座',
    });
  const parsedGames = isExcel ? parsed.games : [parsed.game];
  const drafts = parsedGames.map(game => {
    const draft = normalizeGamePayload(game, players);
    if (tournament) {
      draft.tournamentId = tournament.id;
      draft.sport = tournament.sport || draft.sport || 'softball';
      draft.season = tournament.season || draft.season || '';
      draft.seasonName = tournament.name || draft.seasonName || '';
      draft.metadata = {
        ...(draft.metadata || {}),
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentShortName: tournament.short_name,
      };
    } else {
      draft.sport = draft.sport || req.body?.sport || 'softball';
    }
    draft.metadata = {
      ...(draft.metadata || {}),
      source: isExcel ? 'gamechanger_excel' : 'gamechanger_pdf',
      importedVia: req.body?.source || 'mini_program',
      originalFileName: fileName,
    };
    return draft;
  });
  res.json({
    draft: drafts[0],
    drafts,
    filenameInfo: parsed.filenameInfo || null,
    sourceType: isExcel ? (parsed.sourceType || 'excel') : 'pdf',
    warnings: parsed.warnings || [],
  });
}));

router.patch('/batch-reassign', requirePermission('games:revise'), wrap(async (req, res) => {
  const rawIds = Array.isArray(req.body?.gameIds) ? req.body.gameIds : [];
  const gameIds = Array.from(new Set(rawIds.map(id => String(id || '').trim()).filter(Boolean)));
  const tournamentId = String(req.body?.tournamentId || '').trim();
  if (!gameIds.length || !tournamentId) {
    return res.status(400).json({ error: 'bad_request', message: 'gameIds / tournamentId 必填' });
  }

  const tournament = await db.qOne('SELECT id, name, short_name, season FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) return res.status(404).json({ error: 'tournament_not_found', message: '目标赛事不存在' });

  const placeholders = gameIds.map(() => '?').join(',');
  const beforeRows = await db.q(`SELECT * FROM games WHERE id IN (${placeholders})`, gameIds);
  if (!beforeRows.length) return res.status(404).json({ error: 'games_not_found', message: '未找到可移动的比赛' });
  const foundIds = new Set(beforeRows.map(row => row.id));
  const missingIds = gameIds.filter(id => !foundIds.has(id));

  await db.q(
    `UPDATE games
     SET tournament_id = ?, season = ?, season_name = ?
     WHERE id IN (${placeholders})`,
    [tournament.id, tournament.season || '', tournament.name || '', ...beforeRows.map(row => row.id)]
  );

  const afterRows = await db.q(`SELECT * FROM games WHERE id IN (${beforeRows.map(() => '?').join(',')})`, beforeRows.map(row => row.id));
  await logAudit({
    actorUserId: req.user.id,
    action: 'batch_reassign_games',
    targetType: 'game',
    targetId: `batch:${tournament.id}`,
    summary: `批量移动 ${beforeRows.length} 场比赛到：${tournament.short_name || tournament.name}`,
    metadata: {
      gameIds: beforeRows.map(row => row.id),
      missingIds,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      season: tournament.season || '',
      before: beforeRows.map(rowToGame),
      after: afterRows.map(rowToGame),
    },
  });

  res.json({
    ok: true,
    moved: beforeRows.length,
    missingIds,
    tournament: {
      id: tournament.id,
      name: tournament.name,
      shortName: tournament.short_name,
      season: tournament.season || '',
    },
    games: afterRows.map(rowToGame),
  });
}));

router.patch('/:id', requirePermission('games:revise'), wrap(async (req, res) => {
  await ensureGameSchema();
  const beforeRow = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!beforeRow) return res.status(404).json({ error: 'not_found' });
  const players = await loadPlayerPool();
  const b = normalizeGamePayload(req.body || {}, players);
  const map = {
    tournamentId: 'tournament_id', eventId: 'event_id', sport: 'sport', season: 'season', seasonName: 'season_name',
    cover: 'cover', date: 'date', venue: 'venue', innings: 'innings',
    home: 'home', away: 'away', homeScore: 'home_score', awayScore: 'away_score',
    mvpPlayerName: 'mvp_player_name', mvpPlayerId: 'mvp_player_id', mvpNote: 'mvp_note',
  };
  const jsonMap = {
    linescore: 'linescore', homeTotals: 'home_totals', awayTotals: 'away_totals',
    batting: 'batting', oppBatting: 'opp_batting', pitching: 'pitching', oppPitching: 'opp_pitching',
    gameLog: 'game_log', metadata: 'metadata',
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
  const beforeRow = await db.qOne('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!beforeRow) return res.status(404).json({ error: 'not_found' });
  await db.q('DELETE FROM games WHERE id = ?', [req.params.id]);
  const game = rowToGame(beforeRow);
  await logAudit({
    actorUserId: req.user.id,
    action: 'delete_game',
    targetType: 'game',
    targetId: req.params.id,
    summary: `删除比赛：${game.away} vs ${game.home}`,
    metadata: { before: game },
  });
  res.json({ ok: true });
}));

module.exports = { router, rowToGame };
