#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const hofRoutePath = path.join(root, 'server/routes/hof.js');

const hofRows = [
  { player_id: 'p1', inducted_year: 2026, reason: '赛季 MVP', created_at: '2026-06-01T10:00:00Z' },
  { player_id: 'p2', inducted_year: 2025, reason: '长期贡献', created_at: '2025-06-01T10:00:00Z' },
];

const playerRows = [
  {
    id: 'p1',
    name: '江山',
    number: '7',
    position: 'CF',
    public_display_name: 'Jiang',
    public_avatar: 'avatar://jiang',
    aliases: JSON.stringify(['Jiang']),
  },
  {
    id: 'p2',
    name: '张三',
    number: '11',
    position: 'P',
    public_display_name: '',
    public_avatar: '',
    aliases: '[]',
  },
];

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/SELECT \* FROM hall_of_fame/.test(sql)) {
          const limit = /LIMIT \? OFFSET \?/.test(sql) ? Number(params[0]) || hofRows.length : hofRows.length;
          const offset = /LIMIT \? OFFSET \?/.test(sql) ? Number(params[1]) || 0 : 0;
          return hofRows.slice(offset, offset + limit);
        }
        if (/SELECT \* FROM players WHERE id IN/.test(sql)) {
          const ids = new Set(params);
          return playerRows.filter(row => ids.has(row.id));
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async () => null,
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requirePermission: () => (req, _res, next) => next(),
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };
}

async function request(app, url) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`);
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[hofRoutePath];
  const { router } = require(hofRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/hall-of-fame', router);

  const linked = await request(app, '/hall-of-fame?includePlayer=true&limit=1&offset=0');
  assert.strictEqual(linked.status, 200);
  assert.strictEqual(linked.data.hallOfFame.length, 1);
  assert.strictEqual(linked.data.hallOfFame[0].playerId, 'p1');
  assert.strictEqual(linked.data.hallOfFame[0].player.publicDisplayName, 'Jiang');
  assert.strictEqual(linked.data.hasMore, true);
  assert.strictEqual(linked.data.nextOffset, 1);

  const second = await request(app, '/hall-of-fame?includePlayer=true&limit=1&offset=1');
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.data.hallOfFame.length, 1);
  assert.strictEqual(second.data.hallOfFame[0].playerId, 'p2');
  assert.strictEqual(second.data.hasMore, false);
  assert.strictEqual(second.data.nextOffset, 2);

  const plain = await request(app, '/hall-of-fame?limit=1&offset=0');
  assert.strictEqual(plain.status, 200);
  assert.strictEqual(plain.data.hallOfFame.length, 1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(plain.data.hallOfFame[0], 'player'), false);

  console.log('Hall of fame route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
