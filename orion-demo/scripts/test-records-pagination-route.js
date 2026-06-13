#!/usr/bin/env node
'use strict';

// 覆盖 /api/bind-codes、/api/points-adjustments、/api/attendances 的
// limit/offset/hasMore/nextOffset 分页契约,以及不传 limit 的旧版全量兼容。

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const bindcodesPath = path.join(root, 'server/routes/bindcodes.js');
const adjustmentsPath = path.join(root, 'server/routes/adjustments.js');
const attendancesPath = path.join(root, 'server/routes/attendances.js');

const bindCodeRows = [
  { code: 'ORION-D4-1', player_id: 'p4', used: 0, used_by: null, used_at: null, created_at: '2026-06-04' },
  { code: 'ORION-C3-1', player_id: 'p3', used: 1, used_by: 'u3', used_at: '2026-06-03', created_at: '2026-06-03' },
  { code: 'ORION-B2-1', player_id: 'p2', used: 0, used_by: null, used_at: null, created_at: '2026-06-02' },
  { code: 'ORION-A1-1', player_id: 'p1', used: 0, used_by: null, used_at: null, created_at: '2026-06-01' },
];

const adjustmentRows = [
  { id: 'adj3', player_id: 'p1', delta: 5, reason: '补录', game_id: null, created_by: 'u_admin', created_at: '2026-06-03' },
  { id: 'adj2', player_id: 'p1', delta: -3, reason: '失误', game_id: 'g1', created_by: 'u_admin', created_at: '2026-06-02' },
  { id: 'adj1', player_id: 'p2', delta: 10, reason: 'MVP', game_id: null, created_by: 'u_admin', created_at: '2026-06-01' },
];

const attendanceRows = [
  { id: 'att3', player_id: 'p1', kind: 'training', ref_id: null, date: '2026-06-03', note: null, created_by: 'u_admin', created_at: '2026-06-03', metadata: null },
  { id: 'att2', player_id: 'p1', kind: 'event', ref_id: 'e1', date: '2026-06-02', note: null, created_by: 'u_admin', created_at: '2026-06-02', metadata: null },
  { id: 'att1', player_id: 'p1', kind: 'training', ref_id: null, date: '2026-06-01', note: null, created_by: 'u_admin', created_at: '2026-06-01', metadata: null },
];

const queries = [];

function filterRows(rows, sql, params) {
  let remaining = rows;
  const filters = params.slice();
  if (/player_id = \?/.test(sql)) {
    const playerId = filters.shift();
    remaining = remaining.filter(row => row.player_id === playerId);
  }
  if (/kind = \?/.test(sql)) {
    const kind = filters.shift();
    remaining = remaining.filter(row => row.kind === kind);
  }
  if (/code LIKE \?/.test(sql)) {
    const like = String(filters.shift() || '').replace(/%/g, '').toLowerCase();
    filters.shift();
    remaining = remaining.filter(row => (
      String(row.code).toLowerCase().includes(like) || String(row.player_id).toLowerCase().includes(like)
    ));
  }
  if (/LIMIT \? OFFSET \?/.test(sql)) {
    const offset = Number(filters[filters.length - 1]) || 0;
    const limit = Number(filters[filters.length - 2]) || remaining.length;
    remaining = remaining.slice(offset, offset + limit);
  }
  return remaining;
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        queries.push({ sql, params });
        if (/FROM bind_codes/.test(sql)) return filterRows(bindCodeRows, sql, params);
        if (/FROM points_adjustments/.test(sql)) return filterRows(adjustmentRows, sql, params);
        if (/FROM attendances/.test(sql)) return filterRows(attendanceRows, sql, params);
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
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin', permissions: ['bind_codes:manage'] };
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
      logAudit: async () => {},
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
  [bindcodesPath, adjustmentsPath, attendancesPath].forEach(p => { delete require.cache[p]; });
  const app = express();
  app.use(express.json());
  app.use('/bind-codes', require(bindcodesPath).router);
  app.use('/points-adjustments', require(adjustmentsPath).router);
  app.use('/attendances', require(attendancesPath).router);

  // bind-codes 分页
  const codesPage1 = await request(app, '/bind-codes?limit=2&offset=0');
  assert.strictEqual(codesPage1.status, 200);
  assert.deepStrictEqual(codesPage1.data.bindCodes.map(item => item.code), ['ORION-D4-1', 'ORION-C3-1']);
  assert.strictEqual(codesPage1.data.hasMore, true);
  assert.strictEqual(codesPage1.data.nextOffset, 2);

  const codesPage2 = await request(app, '/bind-codes?limit=2&offset=2');
  assert.deepStrictEqual(codesPage2.data.bindCodes.map(item => item.code), ['ORION-B2-1', 'ORION-A1-1']);
  assert.strictEqual(codesPage2.data.hasMore, false);
  assert.strictEqual(codesPage2.data.nextOffset, 4);

  // bind-codes keyword 小候选
  const codesKeyword = await request(app, '/bind-codes?limit=10&keyword=p3');
  assert.deepStrictEqual(codesKeyword.data.bindCodes.map(item => item.code), ['ORION-C3-1']);

  // bind-codes 旧版全量兼容(网页端 db.js 不传 limit)
  const codesAll = await request(app, '/bind-codes');
  assert.strictEqual(codesAll.data.bindCodes.length, 4);
  assert.strictEqual(codesAll.data.hasMore, undefined, 'legacy full response should not add paging fields');
  const legacyCodesQuery = queries[queries.length - 1];
  assert(!/LIMIT \? OFFSET \?/.test(legacyCodesQuery.sql), 'legacy bind-codes query should not page');

  // points-adjustments 分页 + playerId 过滤
  const adjPage = await request(app, '/points-adjustments?playerId=p1&limit=1&offset=0');
  assert.deepStrictEqual(adjPage.data.adjustments.map(item => item.id), ['adj3']);
  assert.strictEqual(adjPage.data.hasMore, true);
  assert.strictEqual(adjPage.data.nextOffset, 1);

  const adjAll = await request(app, '/points-adjustments?playerId=p1');
  assert.deepStrictEqual(adjAll.data.adjustments.map(item => item.id), ['adj3', 'adj2']);
  assert.strictEqual(adjAll.data.hasMore, undefined);

  // attendances 分页 + 过滤
  const attPage = await request(app, '/attendances?playerId=p1&limit=2&offset=0');
  assert.deepStrictEqual(attPage.data.attendances.map(item => item.id), ['att3', 'att2']);
  assert.strictEqual(attPage.data.hasMore, true);
  assert.strictEqual(attPage.data.nextOffset, 2);

  const attKind = await request(app, '/attendances?playerId=p1&kind=training&limit=10');
  assert.deepStrictEqual(attKind.data.attendances.map(item => item.id), ['att3', 'att1']);
  assert.strictEqual(attKind.data.hasMore, false);

  const attAll = await request(app, '/attendances?playerId=p1');
  assert.strictEqual(attAll.data.attendances.length, 3);
  assert.strictEqual(attAll.data.hasMore, undefined);

  console.log('Records pagination route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
