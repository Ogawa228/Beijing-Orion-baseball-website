#!/usr/bin/env node
'use strict';

// POST /api/auth/link-wechat 路由回归：
// 1) 缺参数 / 缺法定同意的拒绝语义
// 2) 关联码先于 wx code 校验（无效关联码不烧一次性 jscode）
// 3) happy path：微信身份挂到关联码对应的已有账号，清码、写审计、返回 session
// 4) 微信已属于另一账号时 409，不写任何身份

const assert = require('assert');
const express = require('express');
const path = require('path');

process.env.WECHAT_MINIPROGRAM_APP_ID = 'wx_test_app';
process.env.WECHAT_MINIPROGRAM_APP_SECRET = 'test_secret';
process.env.ORION_WX_SESSION_USE_FETCH = '1';

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const authRoutePath = path.join(root, 'server/routes/auth.js');

const webUser = {
  id: 'u_web_1',
  display_name: '网页老队员',
  avatar: '',
  role: 'player',
  admin_level: null,
  admin_permission_groups: '[]',
  bound_player_id: null,
  app_connect_code: 'ABCD1234',
  app_connect_code_expires_at: '2099-01-01 00:00:00',
  last_active_at: null,
};

const state = {
  identityInserts: [],
  userUpdates: [],
  auditInserts: [],
  wxOwner: null, // findWxUser 命中的账号
};

function installDbMock() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/INSERT IGNORE INTO user_identities/.test(sql)) {
          state.identityInserts.push(params);
          return { affectedRows: 1 };
        }
        if (/UPDATE users/.test(sql) && /app_connect_code = NULL/.test(sql)) {
          state.userUpdates.push(params);
          return { affectedRows: 1 };
        }
        if (/INSERT INTO admin_audit_logs/.test(sql)) {
          state.auditInserts.push(params);
          return { affectedRows: 1 };
        }
        // ensurePermissionsSchema / ensurePeopleTables 等 DDL 与无关查询一律放行
        return [];
      },
      qOne: async (sql, params = []) => {
        if (/FROM users\s+WHERE app_connect_code = \?/.test(sql.replace(/\s+/g, ' '))) {
          return params[0] === webUser.app_connect_code ? { ...webUser } : null;
        }
        if (/FROM user_identities ui/.test(sql) && /wx_unionid|wx_openid/.test(sql)) {
          return state.wxOwner ? { ...state.wxOwner } : null;
        }
        if (/SELECT \* FROM users WHERE id = \?/.test(sql)) {
          return params[0] === webUser.id ? { ...webUser, app_connect_code: null } : null;
        }
        if (/SELECT bound_player_id FROM users WHERE id = \?/.test(sql)) {
          return { bound_player_id: null };
        }
        return null;
      },
      getPool: () => { throw new Error('link-wechat 不应使用事务连接'); },
    },
  };
}

let fetchCalls = [];
global.fetch = async url => {
  fetchCalls.push(String(url));
  return {
    ok: true,
    json: async () => ({ openid: 'oid_test_1', unionid: 'uid_test_1', session_key: 'sk' }),
  };
};

installDbMock();
const authRouter = require(authRoutePath);

const consent = {
  legalAccepted: true,
  personalInfoAccepted: true,
  guardianConfirmed: true,
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function postJson(base, body) {
  const res = await fetch2(`${base}/api/auth/link-wechat`, body);
  return res;
}

// 本地请求用 node http，避免走被 stub 的 global.fetch
const http = require('http');
function fetch2(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}'), headers: res.headers }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function main() {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1) 缺参数
  let res = await postJson(base, { code: 'wx_code_1' });
  assert.strictEqual(res.status, 400, 'missing connectCode should 400');
  assert.strictEqual(res.body.error, 'bad_request');

  // 2) 缺法定同意
  res = await postJson(base, { code: 'wx_code_1', connectCode: 'ABCD1234' });
  assert.strictEqual(res.status, 400, 'missing consent should 400');
  assert.strictEqual(res.body.error, 'legal_consent_required');

  // 3) 关联码无效：不应消费 wx code
  fetchCalls = [];
  res = await postJson(base, { code: 'wx_code_1', connectCode: 'WRONGCODE', ...consent });
  assert.strictEqual(res.status, 404, 'invalid connect code should 404');
  assert.strictEqual(res.body.error, 'invalid_code');
  assert.strictEqual(fetchCalls.length, 0, 'invalid connect code must not burn the one-time wx code');

  // 4) happy path：小写关联码也接受，微信身份挂到已有账号
  fetchCalls = [];
  state.identityInserts = [];
  state.userUpdates = [];
  res = await postJson(base, { code: 'wx_code_2', connectCode: 'abcd1234', ...consent });
  assert.strictEqual(res.status, 200, `link should succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.linked, true);
  assert.strictEqual(res.body.isNew, false, 'linking must not create a new account');
  assert.strictEqual(res.body.user.id, 'u_web_1');
  assert(res.body.sessionToken, 'link should return a session token for the mini program');
  assert(String(res.headers['set-cookie'] || '').includes('orion_session'), 'link should set the shared session cookie');
  assert.strictEqual(fetchCalls.length, 1, 'valid request should call jscode2session once');
  assert.strictEqual(state.identityInserts.length, 2, 'should attach wx_openid + wx_unionid identities');
  assert.deepStrictEqual(state.identityInserts[0], ['u_web_1', 'oid_test_1', 'wx_test_app']);
  assert.deepStrictEqual(state.identityInserts[1], ['u_web_1', 'uid_test_1', 'wx_test_app']);
  assert.strictEqual(state.userUpdates.length, 1, 'connect code should be cleared after linking');

  // 5) 微信已属于另一账号：409 且不写身份
  state.wxOwner = { id: 'u_wx_other', display_name: '小程序旧账号' };
  state.identityInserts = [];
  res = await postJson(base, { code: 'wx_code_3', connectCode: 'ABCD1234', ...consent });
  assert.strictEqual(res.status, 409, 'wechat already linked elsewhere should 409');
  assert.strictEqual(res.body.error, 'wechat_already_linked');
  assert.strictEqual(state.identityInserts.length, 0, 'conflict must not attach identities');
  state.wxOwner = null;

  server.close();
  console.log('Auth link-wechat route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
