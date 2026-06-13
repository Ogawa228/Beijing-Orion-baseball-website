// /api/leaderboard + /api/players/:id/points
const express = require('express');
const points = require('../points');
const { wrap } = require('../middleware');

const router = express.Router();

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 200);
}

function parseOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10000);
}

function parsePlayerIds(value) {
  return String(value || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .slice(0, 100);
}

// GET /api/leaderboard?season=2026
router.get('/leaderboard', wrap(async (req, res) => {
  const lb = await points.leaderboard({ season: req.query.season });
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const playerIds = parsePlayerIds(req.query.playerIds);
  const playerIdSet = new Set(playerIds);
  const ranked = lb.map((row, index) => ({ ...row, rank: index + 1 }));
  const source = playerIdSet.size
    ? ranked.filter(row => row.player?.id && playerIdSet.has(row.player.id))
    : ranked;
  const page = limit ? source.slice(offset, offset + limit) : source;
  res.json({
    leaderboard: page,
    rules: points.RULES,
    hasMore: limit ? offset + page.length < source.length : false,
    nextOffset: limit ? offset + page.length : source.length,
  });
}));

// GET /api/players/:id/points?season=2026
router.get('/players/:id/points', wrap(async (req, res) => {
  const result = await points.getPlayerPoints(req.params.id, { season: req.query.season });
  res.json({ ...result, rules: points.RULES });
}));

// GET /api/points/rules - 公式常量
router.get('/points/rules', (_req, res) => {
  res.json({ rules: points.RULES });
});

module.exports = router;
