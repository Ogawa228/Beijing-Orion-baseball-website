#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const tournamentsRoutePath = path.join(root, 'server/routes/tournaments.js');

const tournaments = new Map();
const auditLogs = [];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function dbRow(tournament) {
  return tournament ? {
    id: tournament.id,
    type: tournament.type,
    name: tournament.name,
    short_name: tournament.short_name,
    season: tournament.season,
    sport: tournament.sport,
    start_date: tournament.start_date,
    end_date: tournament.end_date,
    cover: tournament.cover,
    description: tournament.description,
    location: tournament.location,
  } : null;
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/ALTER TABLE tournaments ADD COLUMN location/.test(sql)) return { affectedRows: 0 };
        if (/SELECT COALESCE\(tournament_id/.test(sql)) {
          return [
            { tournament_id: 't_test', season: '2026', game_count: 1 },
            { tournament_id: '', season: '2026', game_count: 2 },
            { tournament_id: 't_other', season: '2026', game_count: 1 },
          ];
        }
        if (/FROM tournaments/.test(sql) && !/WHERE id = \?/.test(sql)) {
          const rows = Array.from(tournaments.values()).map(dbRow);
          if (/LIMIT \? OFFSET \?/.test(sql)) {
            const limit = Number(params[params.length - 2] || rows.length);
            const offset = Number(params[params.length - 1] || 0);
            return rows.slice(offset, offset + limit);
          }
          return rows;
        }
        if (/INSERT INTO tournaments/.test(sql)) {
          const [id, type, name, shortName, season, sport, startDate, endDate, cover, description, location] = params;
          tournaments.set(id, {
            id,
            type,
            name,
            short_name: shortName,
            season,
            sport,
            start_date: startDate,
            end_date: endDate,
            cover,
            description,
            location,
          });
          return { affectedRows: 1 };
        }
        if (/UPDATE tournaments SET/.test(sql)) {
          const id = params[params.length - 1];
          const tournament = tournaments.get(id);
          assert(tournament, `missing tournament ${id}`);
          const assignments = sql.match(/UPDATE tournaments SET (.*) WHERE id = \?/s)[1]
            .split(',')
            .map(item => item.trim().split(' = ')[0]);
          assignments.forEach((column, index) => {
            const key = column === 'short_name' ? 'short_name' : column;
            tournament[key] = params[index];
          });
          tournaments.set(id, tournament);
          return { affectedRows: 1 };
        }
        if (/DELETE FROM tournaments WHERE id = \?/.test(sql)) {
          tournaments.delete(params[0]);
          return { affectedRows: 1 };
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async (sql, params = []) => {
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return { COLUMN_NAME: 'location' };
        if (/FROM tournaments[\s\S]*WHERE id = \?/.test(sql)) {
          return dbRow(tournaments.get(params[0]));
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
  delete require.cache[tournamentsRoutePath];
  const { router } = require(tournamentsRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/tournaments', router);

  const created = await request(app, 'POST', '/tournaments', {
    id: 't_test',
    type: 'league',
    name: '慢垒春季联赛',
    shortName: '慢垒春季',
    season: '2026',
    sport: 'softball',
    startDate: '2026-05-01',
    endDate: '2026-06-30',
    location: '奥体',
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.tournament.id, 't_test');
  assert.strictEqual(auditLogs[0].action, 'tournament_create');
  assert.strictEqual(auditLogs[0].targetType, 'tournament');
  assert.strictEqual(auditLogs[0].metadata.after.name, '慢垒春季联赛');

  const updated = await request(app, 'PATCH', '/tournaments/t_test', {
    name: '慢垒春季联赛更新',
    location: '树人学校',
  });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.tournament.location, '树人学校');
  assert.strictEqual(auditLogs[1].action, 'tournament_update');
  assert.strictEqual(auditLogs[1].metadata.before.name, '慢垒春季联赛');
  assert.strictEqual(auditLogs[1].metadata.after.name, '慢垒春季联赛更新');
  assert.deepStrictEqual(auditLogs[1].metadata.changedKeys, ['name', 'location']);

  const listed = await request(app, 'GET', '/tournaments?includeGameCount=true');
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.data.totalGameCount, 4);
  assert.strictEqual(listed.data.tournaments[0].gameCount, 3, 'tournament count should include legacy same-season games without tournament_id');
  assert.strictEqual(listed.data.hasMore, false);

  tournaments.set('t_other', {
    id: 't_other',
    type: 'cup',
    name: '棒球杯赛',
    short_name: '杯赛',
    season: '2026',
    sport: 'baseball',
    start_date: '2026-07-01',
    end_date: '2026-07-03',
    cover: null,
    description: '',
    location: '树人',
  });
  const paged = await request(app, 'GET', '/tournaments?includeGameCount=true&limit=1&offset=0');
  assert.strictEqual(paged.status, 200);
  assert.strictEqual(paged.data.tournaments.length, 1);
  assert.strictEqual(paged.data.hasMore, true);
  assert.strictEqual(paged.data.nextOffset, 1);
  assert.strictEqual(paged.data.totalGameCount, 4);

  const deleted = await request(app, 'DELETE', '/tournaments/t_test');
  assert.strictEqual(deleted.status, 200);
  assert.strictEqual(auditLogs[2].action, 'tournament_delete');
  assert.strictEqual(auditLogs[2].targetId, 't_test');
  assert.strictEqual(auditLogs[2].metadata.before.name, '慢垒春季联赛更新');

  console.log('Tournaments audit route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
