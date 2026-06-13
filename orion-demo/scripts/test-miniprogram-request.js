const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requestPath = path.join(root, 'miniprogram/utils/request.js');
const configPath = path.join(root, 'miniprogram/utils/config.js');
const sessionPath = path.join(root, 'miniprogram/utils/session.js');

let storage = {};

function resetModules() {
  [requestPath, configPath, sessionPath].forEach(file => {
    delete require.cache[file];
  });
}

function installWx(wxPatch = {}) {
  storage = {};
  global.wx = {
    getStorageSync(key) {
      return storage[key] || '';
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    removeStorageSync(key) {
      delete storage[key];
    },
    ...wxPatch,
  };
}

function loadRequest(configPatch, wxPatch) {
  resetModules();
  installWx(wxPatch);
  const { ORION_CONFIG } = require(configPath);
  Object.assign(ORION_CONFIG, configPatch);
  return require(requestPath);
}

async function testCrossEnvironmentCall() {
  let resourceOptions = null;
  let callArgs = null;
  let initCount = 0;

  const api = loadRequest(
    {
      cloudResourceAppid: 'wx7dce60930ee10898',
      cloudEnv: 'prod-d5gtkxdyu7263e95b',
      cloudService: 'express-knlw',
      useHttpFallback: false,
    },
    {
      cloud: {
        Cloud: function Cloud(options) {
          resourceOptions = options;
          return {
            init() {
              initCount += 1;
              return Promise.resolve();
            },
            callContainer(args) {
              callArgs = args;
              return Promise.resolve({
                statusCode: 200,
                data: { ok: true, sessionToken: 'token-from-cloud' },
                header: {},
              });
            },
          };
        },
      },
    }
  );

  const res = await api.get('/games', { includeAggregate: 'false' });
  assert.deepStrictEqual(resourceOptions, {
    resourceAppid: 'wx7dce60930ee10898',
    resourceEnv: 'prod-d5gtkxdyu7263e95b',
  });
  assert.strictEqual(callArgs.path, '/api/games?includeAggregate=false');
  assert.strictEqual(callArgs.method, 'GET');
  assert.strictEqual(callArgs.config, undefined, 'cross-environment call should not pass direct config.env');
  assert.strictEqual(callArgs.header['X-WX-SERVICE'], 'express-knlw');
  assert.deepStrictEqual(res, { ok: true, sessionToken: 'token-from-cloud' });
  assert.strictEqual(storage.orionSessionToken, 'token-from-cloud');

  await api.get('/events');
  assert.strictEqual(initCount, 1, 'resource cloud client should be cached');
}

async function testDirectEnvironmentFallback() {
  let callArgs = null;
  const api = loadRequest(
    {
      cloudResourceAppid: '',
      cloudEnv: 'prod-d5gtkxdyu7263e95b',
      cloudService: 'express-knlw',
      useHttpFallback: false,
    },
    {
      cloud: {
        callContainer(args) {
          callArgs = args;
          return Promise.resolve({ statusCode: 200, data: { direct: true }, header: {} });
        },
      },
    }
  );

  const res = await api.post('/checkins/direct', { kind: 'training' });
  assert.deepStrictEqual(callArgs.config, { env: 'prod-d5gtkxdyu7263e95b' });
  assert.strictEqual(callArgs.path, '/api/checkins/direct');
  assert.strictEqual(callArgs.method, 'POST');
  assert.deepStrictEqual(callArgs.data, { kind: 'training' });
  assert.strictEqual(res.direct, true);
}

async function testHttpFallbackAndCookieSession() {
  let requestArgs = null;
  const api = loadRequest(
    {
      httpBase: 'https://example.com',
      useHttpFallback: true,
    },
    {
      request(args) {
        requestArgs = args;
        args.success({
          statusCode: 200,
          data: { http: true },
          header: { 'set-cookie': 'orion_session=cookie-session; Path=/; HttpOnly' },
        });
      },
    }
  );

  const res = await api.get('/leaderboard');
  assert.strictEqual(requestArgs.url, 'https://example.com/api/leaderboard');
  assert.strictEqual(requestArgs.method, 'GET');
  assert.strictEqual(res.http, true);
  assert.strictEqual(storage.orionSessionToken, 'cookie-session');
}

async function testUnauthorizedEnvironmentError() {
  const api = loadRequest(
    {
      cloudResourceAppid: 'wx7dce60930ee10898',
      cloudEnv: 'prod-d5gtkxdyu7263e95b',
      useHttpFallback: false,
    },
    {
      cloud: {
        Cloud: function Cloud() {
          return {
            init() {
              return Promise.reject(new Error('errCode: -601012 unauthorized env | errMsg: 【资源复用】未获得该环境授权'));
            },
          };
        },
      },
    }
  );

  await assert.rejects(
    () => api.get('/events'),
    err => err.message === '云环境未授权当前小程序'
  );
}

async function main() {
  await testCrossEnvironmentCall();
  await testDirectEnvironmentFallback();
  await testHttpFallbackAndCookieSession();
  await testUnauthorizedEnvironmentError();
  console.log('Mini program request regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
