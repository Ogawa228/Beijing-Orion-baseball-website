#!/usr/bin/env node
'use strict';

// POST /api/checkins/direct 地理围栏回归：
// 接龙设了地图选点坐标时,签到位置必须在 500 米内,否则 403 too_far。
// 用 mock db + express 端到端走真实路由逻辑,不连数据库。

const assert = require('assert');
const express = require('express');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peoplePath = path.join(root, 'server/people-helpers.js');
const pointsPath = path.join(root, 'server/points.js');
const checkinsPath = path.join(root, 'server/routes/checkins.js');

// 接龙地图选点目标坐标(奥体中心一带)
const TARGET = { latitude: 39.9824, longitude: 116.3956 };
const NEAR = { latitude: 39.9824, longitude: 116.3991 }; // 约 298m,应放行
const FAR = { latitude: 39.9824, longitude: 116.4096 };  // 约 1193m,应拒绝

let insertedCount = 0;

require.cache[middlewarePath] = {
  id: middlewarePath, filename: middlewarePath, loaded: true,
  exports: {
    wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    requireAuth: (req, _res, next) => { req.user = { id: 'u_test', bound_player_id: 'p_test' }; next(); },
  },
};

require.cache[peoplePath] = {
  id: peoplePath, filename: peoplePath, loaded: true,
  exports: { logAudit: async () => {} },
};

require.cache[pointsPath] = {
  id: pointsPath, filename: pointsPath, loaded: true,
  exports: { RULES: { training: 5, event: 5 }, getPlayerPoints: async () => ({ total: 10, breakdown: {} }) },
};

require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    q: async (sql) => {
      if (/INSERT INTO attendances/.test(sql)) { insertedCount += 1; return { affectedRows: 1 }; }
      return [];
    },
    qOne: async (sql) => {
      if (/INFORMATION_SCHEMA/.test(sql)) return { COLUMN_NAME: 'metadata' }; // 列已存在,不 ALTER
      if (/FROM events WHERE id/.test(sql)) {
        return { id: 'e_test', title: '测试接龙', tag: '活动', date: '2026-07-01', location: '奥体', metadata: JSON.stringify({ location: TARGET }) };
      }
      if (/FROM attendances[\s\S]*COALESCE\(ref_id/.test(sql)) return null; // 无重复签到
      if (/SELECT id, level FROM players/.test(sql)) return { id: 'p_test', level: 'verified' };
      if (/COUNT\(\*\) AS c FROM attendances/.test(sql)) return { c: 3 };
      if (/SELECT \* FROM attendances WHERE id/.test(sql)) {
        return { id: 'att_x', player_id: 'p_test', kind: 'event', ref_id: 'e_test', date: '2026-07-01', note: '', metadata: '{}', created_by: 'u_test', created_at: new Date().toISOString() };
      }
      return null;
    },
  },
};

const { router } = require(checkinsPath);

function postJson(base, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request(`${base}/api/checkins/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/checkins', router);
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1) 远点(约 1.2km)→ 403 too_far,不写 attendance
  insertedCount = 0;
  let res = await postJson(base, { kind: 'event', refId: 'e_test', location: FAR });
  assert.strictEqual(res.status, 403, `far checkin should be rejected, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.error, 'too_far');
  assert(res.body.distance > 500, 'too_far response should report distance > 500');
  assert.strictEqual(insertedCount, 0, 'rejected checkin must not insert attendance');

  // 2) 近点(约 300m)→ 201 成功,写入 attendance
  insertedCount = 0;
  res = await postJson(base, { kind: 'event', refId: 'e_test', location: NEAR });
  assert.strictEqual(res.status, 201, `near checkin should succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.duplicated, false);
  assert.strictEqual(insertedCount, 1, 'accepted checkin should insert one attendance');

  // 3) 缺定位但接龙设了坐标 → 400 location_required
  insertedCount = 0;
  res = await postJson(base, { kind: 'event', refId: 'e_test', location: {} });
  assert.strictEqual(res.status, 400, 'missing location with geofenced relay should 400');
  assert.strictEqual(res.body.error, 'location_required');
  assert.strictEqual(insertedCount, 0, 'no-location checkin must not insert attendance');

  server.close();
  console.log('Checkin geofence route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
