#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const publicProfilePath = path.join(root, 'server/player-public-profile.js');
const playersRoutePath = path.join(root, 'server/routes/players.js');

const players = new Map([
  ['p_existing', {
    id: 'p_existing',
    name: '已有人',
    number: '1',
    position: 'P',
    photo: null,
    slogan: '',
    bats: '',
    throws_: '',
    join_year: null,
    titles: JSON.stringify([]),
    aliases: JSON.stringify(['老别名']),
    level: 'verified',
  }],
]);
const auditLogs = [];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function selectPlayersForSql(sql) {
  let rows = Array.from(players.values());
  if (/level = 'verified'/.test(sql)) rows = rows.filter(player => player.level === 'verified');
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
        if (/SELECT id, name, aliases FROM players/.test(sql)) {
          return Array.from(players.values()).map(player => ({
            id: player.id,
            name: player.name,
            aliases: player.aliases,
          }));
        }
        if (/SELECT \* FROM players/.test(sql)) {
          let rows = selectPlayersForSql(sql);
          if (/LIMIT \? OFFSET \?/.test(sql)) {
            const limit = Number(params[params.length - 2]);
            const offset = Number(params[params.length - 1]);
            rows = rows.slice(offset, offset + limit);
          }
          return rows;
        }
        if (/INSERT INTO players/.test(sql)) {
          const [
            id, name, number, position, photo, slogan, bats, throws_, joinYear, titles, aliases, level,
          ] = params;
          players.set(id, {
            id,
            name,
            number,
            position,
            photo,
            slogan,
            bats,
            throws_,
            join_year: joinYear,
            titles,
            aliases,
            level,
          });
          return { affectedRows: 1 };
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async (sql, params = []) => {
        if (/SELECT \* FROM players WHERE id = \?/.test(sql)) {
          return players.get(params[0]) || null;
        }
        if (/SELECT COUNT\(\*\) AS total FROM players/.test(sql)) {
          return { total: selectPlayersForSql(sql).length };
        }
        if (/SELECT COUNT\(DISTINCT CASE/.test(sql)) {
          const positions = new Set(selectPlayersForSql(sql).map(player => String(player.position || '').trim()).filter(Boolean));
          return { total: positions.size };
        }
        throw new Error(`unexpected qOne: ${sql}`);
      },
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin' };
        next();
      },
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };

  delete require.cache[peopleHelpersPath];
  require.cache[peopleHelpersPath] = {
    id: peopleHelpersPath,
    filename: peopleHelpersPath,
    loaded: true,
    exports: {
      logAudit: async log => {
        auditLogs.push(clone(log));
      },
    },
  };

  delete require.cache[publicProfilePath];
  require.cache[publicProfilePath] = {
    id: publicProfilePath,
    filename: publicProfilePath,
    loaded: true,
    exports: { ensurePlayerPublicProfileSchema: async () => {} },
  };
}

async function request(app, method, url, body) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[playersRoutePath];
  const { router } = require(playersRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/players', router);

  const res = await request(app, 'POST', '/players/import', {
    level: 'casual',
    photos: {
      新试训: 'https://cos.example/players/xin-trial.jpg',
      张三: 'data:image/png;base64,should-not-be-stored',
      不在名单: 'https://cos.example/players/unmatched.jpg',
    },
    text: [
      '已有人,1,P',
      '新试训,66,OF,R,R,2026,阿新、Xin Trial',
      '老别名,88,SS',
      '新试训,99,1B',
      '年份错误,12,C,R,R,1800',
      '张三 15 二垒 2B',
    ].join('\n'),
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.level, 'casual');
  assert.strictEqual(res.data.summary.created, 2);
  assert.strictEqual(res.data.summary.skipped, 3);
  assert.strictEqual(res.data.summary.invalid, 1);
  assert.strictEqual(res.data.summary.photoMatched, 1);
  assert.deepStrictEqual(res.data.created.map(player => player.name), ['新试训', '张三']);
  assert.strictEqual(res.data.created[0].photo, 'https://cos.example/players/xin-trial.jpg');
  assert.strictEqual(res.data.created[1].photo, null);
  assert.deepStrictEqual(res.data.created[0].aliases, ['阿新', 'Xin Trial']);
  assert.strictEqual(res.data.created[0].joinYear, 2026);
  assert(auditLogs.some(log => log.action === 'player_batch_import'));
  const audit = auditLogs.find(log => log.action === 'player_batch_import');
  assert.strictEqual(audit.metadata.created.length, 2);
  assert.strictEqual(audit.metadata.matchedPhotoCount, 1);
  assert.strictEqual(audit.metadata.skipped.length, 3);
  assert.strictEqual(audit.metadata.invalid.length, 1);

  const list = await request(app, 'GET', '/players?include=all&limit=2&includeTotal=true&includePositionCount=true');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.data.players.length, 2);
  assert.strictEqual(list.data.total, 3);
  assert.strictEqual(list.data.positionCount, 3);
  assert.strictEqual(list.data.hasMore, true);
  assert.strictEqual(list.data.nextOffset, 2);
  const second = await request(app, 'GET', '/players?include=all&limit=2&offset=2&includeTotal=true');
  assert.strictEqual(second.data.players.length, 1);
  assert.strictEqual(second.data.hasMore, false);
  assert.strictEqual(second.data.nextOffset, 3);

  console.log('Players import route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
