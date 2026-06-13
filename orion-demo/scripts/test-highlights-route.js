#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const permissionsPath = path.join(root, 'server/permissions.js');
const highlightsRoutePath = path.join(root, 'server/routes/highlights.js');

const highlights = [
  row('h1', 'published', 'g1', '江山', '2026-06-04T10:00:00Z'),
  row('h2', 'approved', 'g2', '江山', '2026-06-03T10:00:00Z'),
  row('h3', 'pending', 'g1', '张三', '2026-06-02T10:00:00Z'),
  row('h4', 'published', 'g3', '队友', '2026-06-01T10:00:00Z'),
];

const games = [
  {
    id: 'g1',
    tournament_id: 't_slow',
    event_id: 'e1',
    sport: 'softball',
    season: '2026-slow',
    season_name: '奥体慢垒',
    cover: 'https://cos.example/g1.jpg',
    date: '2026-06-04',
    venue: '奥体',
    home: '猎户座',
    away: '神策',
    home_score: 19,
    away_score: 14,
  },
  {
    id: 'g2',
    tournament_id: '',
    event_id: '',
    sport: 'baseball',
    season: '2026-base',
    season_name: '棒球联赛',
    cover: '',
    date: '2026-06-03',
    venue: '树人',
    home: '猎户座',
    away: '猛虎',
    home_score: 8,
    away_score: 6,
  },
];

const players = [
  {
    id: 'p1',
    name: '江山',
    number: '7',
    position: 'CF',
    public_display_name: 'Jiang',
    public_avatar: 'avatar://jiang',
    aliases: JSON.stringify(['Jiang']),
  },
];

function row(id, status, gameId, playerName, createdAt) {
  return {
    id,
    game_id: gameId,
    player_name: playerName,
    title: `时刻 ${id}`,
    url: '',
    cover: `https://cos.example/${id}.jpg`,
    uploader: 'u_test',
    status,
    created_at: createdAt,
  };
}

function filterHighlightRows(sql, params = []) {
  let paramIndex = 0;
  let rows = highlights.slice();
  if (/game_id = \?/.test(sql)) {
    const gameId = params[paramIndex++];
    rows = rows.filter(item => item.game_id === gameId);
  }
  if (/player_name = \?/.test(sql)) {
    const playerName = params[paramIndex++];
    rows = rows.filter(item => item.player_name === playerName);
  }
  if (/status IN/.test(sql)) {
    rows = rows.filter(item => item.status === 'published' || item.status === 'approved');
  } else if (/status = \?/.test(sql)) {
    const status = params[paramIndex++];
    rows = rows.filter(item => item.status === status);
  }
  return rows;
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/SELECT \* FROM players WHERE name IN/.test(sql)) {
          const names = new Set(params.map(item => String(item || '')));
          return players.filter(player => names.has(player.name) || names.has(player.public_display_name));
        }
        if (/SELECT id, tournament_id, event_id, sport, season, season_name, cover, date, venue, home, away, home_score, away_score FROM games WHERE id IN/.test(sql)) {
          const ids = new Set(params.map(item => String(item || '')));
          return games.filter(game => ids.has(game.id));
        }
        if (!/SELECT \* FROM highlights/.test(sql)) {
          throw new Error(`unexpected q: ${sql}`);
        }
        const hasPaging = /LIMIT \? OFFSET \?/.test(sql);
        const filterParams = hasPaging ? params.slice(0, -2) : params;
        let rows = filterHighlightRows(sql, filterParams);
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        if (hasPaging) {
          const limit = Number(params[params.length - 2]) || 0;
          const offset = Number(params[params.length - 1]) || 0;
          rows = rows.slice(offset, offset + limit);
        }
        return rows;
      },
      qOne: async (sql, params = []) => {
        if (!/SELECT COUNT\(\*\) AS total FROM highlights/.test(sql)) {
          throw new Error(`unexpected qOne: ${sql}`);
        }
        return { total: filterHighlightRows(sql, params).length };
      },
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requireAuth: (req, _res, next) => {
        req.user = { id: 'u_test' };
        next();
      },
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin', permissions: ['highlights:write'] };
        next();
      },
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };

  delete require.cache[permissionsPath];
  require.cache[permissionsPath] = {
    id: permissionsPath,
    filename: permissionsPath,
    loaded: true,
    exports: { hasPermission: (user, permission) => (user.permissions || []).includes(permission) },
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
  delete require.cache[highlightsRoutePath];
  const { router } = require(highlightsRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/highlights', router);

  const first = await request(app, '/highlights?public=true&limit=2&offset=0');
  assert.strictEqual(first.status, 200);
  assert.deepStrictEqual(first.data.highlights.map(item => item.id), ['h1', 'h2']);
  assert.strictEqual(first.data.hasMore, true);
  assert.strictEqual(first.data.nextOffset, 2);

  const second = await request(app, '/highlights?public=true&limit=2&offset=2');
  assert.strictEqual(second.status, 200);
  assert.deepStrictEqual(second.data.highlights.map(item => item.id), ['h4']);
  assert.strictEqual(second.data.hasMore, false);
  assert.strictEqual(second.data.nextOffset, 3);

  const pending = await request(app, '/highlights?status=pending&limit=10');
  assert.strictEqual(pending.status, 200);
  assert.deepStrictEqual(pending.data.highlights.map(item => item.id), ['h3']);

  const pendingTotal = await request(app, '/highlights?status=pending&limit=1&includeTotal=true');
  assert.strictEqual(pendingTotal.status, 200);
  assert.deepStrictEqual(pendingTotal.data.highlights.map(item => item.id), ['h3']);
  assert.strictEqual(pendingTotal.data.total, 1);

  const player = await request(app, '/highlights?playerName=%E6%B1%9F%E5%B1%B1&public=true&limit=10');
  assert.strictEqual(player.status, 200);
  assert.deepStrictEqual(player.data.highlights.map(item => item.id), ['h1', 'h2']);

  const withPlayer = await request(app, '/highlights?public=true&limit=1&includePlayer=true');
  assert.strictEqual(withPlayer.status, 200);
  assert.strictEqual(withPlayer.data.highlights[0].player.id, 'p1');
  assert.strictEqual(withPlayer.data.highlights[0].player.publicDisplayName, 'Jiang');

  const withGame = await request(app, '/highlights?public=true&limit=2&includePlayer=true&includeGame=true');
  assert.strictEqual(withGame.status, 200);
  assert.strictEqual(withGame.data.highlights[0].game.id, 'g1');
  assert.strictEqual(withGame.data.highlights[0].game.awayScore, 14);
  assert.strictEqual(withGame.data.highlights[0].game.homeScore, 19);
  assert.strictEqual(withGame.data.highlights[1].game.id, 'g2');

  console.log('Highlights route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
