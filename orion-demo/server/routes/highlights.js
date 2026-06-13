// /api/highlights/* 路由
const express = require('express');
const db = require('../db');
const { wrap, requireAuth, requirePermission } = require('../middleware');
const { hasPermission } = require('../permissions');
const { rowToPlayer } = require('./players');

const router = express.Router();

function rowToHighlightGame(r) {
  if (!r) return null;
  return {
    id: r.id,
    tournamentId: r.tournament_id || '',
    eventId: r.event_id || '',
    sport: r.sport || '',
    season: r.season || '',
    seasonName: r.season_name || '',
    cover: r.cover || '',
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
    venue: r.venue || '',
    home: r.home || '',
    away: r.away || '',
    homeScore: r.home_score,
    awayScore: r.away_score,
  };
}

function rowToHighlight(r, player, game) {
  if (!r) return null;
  const highlight = {
    id: r.id, gameId: r.game_id, playerName: r.player_name, title: r.title,
    url: r.url, cover: r.cover, uploader: r.uploader, status: r.status,
    createdAt: r.created_at,
  };
  if (player) highlight.player = player;
  if (game) highlight.game = game;
  return highlight;
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

function shouldIncludeTotal(value) {
  return value === 'true' || value === true;
}

function shouldIncludePlayer(value) {
  return value === 'true' || value === true || value === '1' || value === 1;
}

function shouldIncludeGame(value) {
  return value === 'true' || value === true || value === '1' || value === 1;
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

async function loadPlayersForHighlights(highlights) {
  const names = [...new Set((highlights || []).map(item => String(item.player_name || '').trim()).filter(Boolean))];
  if (!names.length) return {};
  const placeholders = names.map(() => '?').join(', ');
  const rows = await db.q(
    `SELECT * FROM players WHERE name IN (${placeholders}) OR public_display_name IN (${placeholders})`,
    names.concat(names)
  );
  const byName = {};
  rows.forEach(row => {
    const player = rowToPlayer(row);
    [player.name, player.publicDisplayName].concat(player.aliases || []).forEach(name => {
      const key = norm(name);
      if (key && !byName[key]) byName[key] = player;
    });
  });
  return byName;
}

async function loadGamesForHighlights(highlights) {
  const ids = [...new Set((highlights || []).map(item => String(item.game_id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.q(
    `SELECT id, tournament_id, event_id, sport, season, season_name, cover, date, venue, home, away, home_score, away_score FROM games WHERE id IN (${placeholders})`,
    ids
  );
  const byId = {};
  rows.forEach(row => {
    const game = rowToHighlightGame(row);
    if (game?.id) byId[game.id] = game;
  });
  return byId;
}

// GET /api/highlights?gameId=...&playerName=...
router.get('/', wrap(async (req, res) => {
  const filters = [], params = [];
  if (req.query.gameId)     { filters.push('game_id = ?');     params.push(req.query.gameId); }
  if (req.query.playerName) { filters.push('player_name = ?'); params.push(req.query.playerName); }
  if (req.query.public === 'true') {
    filters.push("status IN ('published', 'approved')");
  } else if (req.query.status) {
    filters.push('status = ?');
    params.push(req.query.status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const includeTotal = shouldIncludeTotal(req.query.includeTotal);
  const rows = await db.q(
    `SELECT * FROM highlights ${where} ORDER BY created_at DESC${limit ? ' LIMIT ? OFFSET ?' : ''}`,
    limit ? params.concat(limit + 1, offset) : params
  );
  const highlights = limit ? rows.slice(0, limit) : rows;
  const playersByName = shouldIncludePlayer(req.query.includePlayer)
    ? await loadPlayersForHighlights(highlights)
    : {};
  const gamesById = shouldIncludeGame(req.query.includeGame)
    ? await loadGamesForHighlights(highlights)
    : {};
  const payload = {
    highlights: highlights.map(row => rowToHighlight(row, playersByName[norm(row.player_name)], gamesById[row.game_id])),
    hasMore: limit ? rows.length > limit : false,
    nextOffset: limit ? offset + highlights.length : rows.length,
  };
  if (includeTotal) {
    const countRow = await db.qOne(`SELECT COUNT(*) AS total FROM highlights ${where}`, params);
    payload.total = Number(countRow?.total || 0);
  }
  res.json(payload);
}));

// POST /api/highlights - 任何登录用户都能投稿（status='pending'，admin 审核）
router.post('/', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'bad_request', message: 'title 必填' });
  const id = `h_${Date.now()}`;
  // admin 直接 published；其他用户 pending
  const canPublish = hasPermission(req.user, 'highlights:write');
  const status = canPublish ? 'published' : 'pending';
  await db.q(
    `INSERT INTO highlights (id, game_id, player_name, title, url, cover, uploader, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, b.gameId || null, b.playerName || '', b.title, b.url || '', b.cover || null,
     canPublish ? 'admin' : req.user.id, status]
  );
  res.status(201).json({ highlight: rowToHighlight(await db.qOne('SELECT * FROM highlights WHERE id = ?', [id])) });
}));

// PATCH /api/highlights/:id - admin 修改 status 或元数据
router.patch('/:id', requirePermission('highlights:write'), wrap(async (req, res) => {
  const b = req.body || {};
  const fields = [], values = [];
  for (const [k, col] of Object.entries({ title:'title', url:'url', cover:'cover', status:'status' })) {
    if (b[k] !== undefined) { fields.push(`${col} = ?`); values.push(b[k]); }
  }
  if (!fields.length) return res.status(400).json({ error: 'bad_request' });
  values.push(req.params.id);
  await db.q(`UPDATE highlights SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ highlight: rowToHighlight(await db.qOne('SELECT * FROM highlights WHERE id = ?', [req.params.id])) });
}));

router.delete('/:id', requirePermission('highlights:write'), wrap(async (req, res) => {
  await db.q('DELETE FROM highlights WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = { router, rowToHighlight };
