// /api/leaderboard + /api/players/:id/points
const express = require('express');
const points = require('../points');
const { wrap } = require('../middleware');

const router = express.Router();

// GET /api/leaderboard
router.get('/leaderboard', wrap(async (_req, res) => {
  const lb = await points.leaderboard();
  res.json({ leaderboard: lb, rules: points.RULES });
}));

// GET /api/players/:id/points
router.get('/players/:id/points', wrap(async (req, res) => {
  const result = await points.getPlayerPoints(req.params.id);
  res.json({ ...result, rules: points.RULES });
}));

// GET /api/points/rules - 公式常量
router.get('/points/rules', (_req, res) => {
  res.json({ rules: points.RULES });
});

module.exports = router;
