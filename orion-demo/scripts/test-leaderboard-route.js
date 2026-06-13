#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pointsPath = path.join(root, 'server/points.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const leaderboardRoutePath = path.join(root, 'server/routes/leaderboard.js');

const leaderboardRows = [
  { player: { id: 'p_top', name: '榜首', number: 1, position: 'P' }, total: 180, breakdown: { base: 100 }, gamesCount: 8 },
  { player: { id: 'p1', name: '江山', number: 7, position: 'CF' }, total: 120, breakdown: { base: 80 }, gamesCount: 6 },
  { player: { id: 'p2', name: '张三', number: 18, position: 'SS' }, total: 90, breakdown: { base: 70 }, gamesCount: 5 },
  { player: { id: 'p3', name: '李四', number: 22, position: 'LF' }, total: 60, breakdown: { base: 40 }, gamesCount: 3 },
];

function installMocks() {
  delete require.cache[pointsPath];
  require.cache[pointsPath] = {
    id: pointsPath,
    filename: pointsPath,
    loaded: true,
    exports: {
      RULES: { training: 5 },
      leaderboard: async options => {
        assert.strictEqual(options.season || '', '2026');
        return leaderboardRows;
      },
      getPlayerPoints: async () => ({ total: 0, breakdown: {}, timeline: [] }),
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };
}

async function request(app, url) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`);
    return { status: res.status, data: await res.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[leaderboardRoutePath];
  const router = require(leaderboardRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/', router);

  const top = await request(app, '/leaderboard?season=2026&limit=1');
  assert.strictEqual(top.status, 200);
  assert.strictEqual(top.data.leaderboard.length, 1);
  assert.strictEqual(top.data.leaderboard[0].player.id, 'p_top');
  assert.strictEqual(top.data.leaderboard[0].rank, 1);
  assert.strictEqual(top.data.hasMore, true);
  assert.strictEqual(top.data.nextOffset, 1);

  const selected = await request(app, '/leaderboard?season=2026&playerIds=p2,p3&limit=2');
  assert.strictEqual(selected.status, 200);
  assert.deepStrictEqual(selected.data.leaderboard.map(row => row.player.id), ['p2', 'p3']);
  assert.deepStrictEqual(selected.data.leaderboard.map(row => row.rank), [3, 4]);
  assert.strictEqual(selected.data.hasMore, false);
  assert.strictEqual(selected.data.nextOffset, 2);

  const selectedPage = await request(app, '/leaderboard?season=2026&playerIds=p1,p2,p3&limit=1&offset=1');
  assert.strictEqual(selectedPage.status, 200);
  assert.strictEqual(selectedPage.data.leaderboard[0].player.id, 'p2');
  assert.strictEqual(selectedPage.data.leaderboard[0].rank, 3);
  assert.strictEqual(selectedPage.data.hasMore, true);
  assert.strictEqual(selectedPage.data.nextOffset, 2);

  console.log('Leaderboard route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
