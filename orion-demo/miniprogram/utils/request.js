const { ORION_CONFIG } = require('./config');
const session = require('./session');

function normalizePath(path) {
  const p = String(path || '');
  if (p.startsWith('/api/')) return p;
  return `/api${p.startsWith('/') ? p : `/${p}`}`;
}

function normalizeHeader(header) {
  return Object.keys(header || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = header[key];
    return acc;
  }, {});
}

function readSetCookie(header) {
  const h = normalizeHeader(header);
  const raw = h['set-cookie'];
  if (!raw) return '';
  const text = Array.isArray(raw) ? raw.join(';') : String(raw);
  const match = text.match(/orion_session=([^;]+)/);
  return match ? match[1] : '';
}

function rememberSession(res) {
  const data = res && res.data;
  if (data && data.sessionToken) {
    session.setSession(data.sessionToken);
    return;
  }
  const token = readSetCookie(res && res.header);
  if (token) session.setSession(token);
}

function normalizeRequestError(err) {
  const raw = String((err && (err.errMsg || err.message)) || err || '');
  if (raw.includes('-601012') || raw.includes('unauthorized env') || raw.includes('未获得该环境授权')) {
    return new Error('云环境未授权当前小程序');
  }
  if (raw.includes('timeout')) {
    return new Error('云托管请求超时');
  }
  if (raw.includes('X-WX-SERVICE')) {
    return new Error('云托管服务名配置错误');
  }
  return err instanceof Error ? err : new Error(raw || '网络请求失败');
}

function requestByHttp({ path, method, data, header }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ORION_CONFIG.httpBase}${path}`,
      method,
      data,
      header,
      success: resolve,
      fail: reject,
    });
  });
}

function getCloudClient() {
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发');
  return wx.cloud;
}

let resourceCloudPromise = null;

function getResourceCloudClient() {
  const cloud = getCloudClient();
  if (!ORION_CONFIG.cloudResourceAppid) return Promise.resolve(cloud);
  if (!cloud.Cloud) {
    throw new Error('当前微信版本不支持跨环境云托管');
  }
  if (!resourceCloudPromise) {
    const resourceCloud = new cloud.Cloud({
      resourceAppid: ORION_CONFIG.cloudResourceAppid,
      resourceEnv: ORION_CONFIG.cloudEnv,
    });
    resourceCloudPromise = Promise.resolve(resourceCloud.init())
      .then(() => resourceCloud)
      .catch(err => {
        resourceCloudPromise = null;
        throw err;
      });
  }
  return resourceCloudPromise;
}

async function requestByContainer({ path, method, data, header }) {
  const cloud = await getResourceCloudClient();
  return cloud.callContainer({
    ...(ORION_CONFIG.cloudResourceAppid ? {} : { config: { env: ORION_CONFIG.cloudEnv } }),
    path,
    method,
    data,
    header: {
      ...header,
      'X-WX-SERVICE': ORION_CONFIG.cloudService,
    },
  });
}

async function call(path, options = {}) {
  const normalized = normalizePath(path);
  const method = options.method || 'GET';
  const token = session.getSession();
  const header = {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.header || {}),
  };
  const payload = {
    path: normalized,
    method,
    data: options.data || {},
    header,
  };
  let res;
  try {
    res = ORION_CONFIG.useHttpFallback
      ? await requestByHttp(payload)
      : await requestByContainer(payload);
  } catch (err) {
    throw normalizeRequestError(err);
  }
  rememberSession(res);
  const statusCode = res.statusCode || 200;
  const data = typeof res.data === 'string' ? tryParseJson(res.data) : res.data;
  if (statusCode >= 400) {
    const err = new Error((data && data.message) || `请求失败 ${statusCode}`);
    err.statusCode = statusCode;
    err.payload = data;
    throw err;
  }
  return data || {};
}

function tryParseJson(text) {
  try { return JSON.parse(text); } catch (_) { return text; }
}

function get(path, data) {
  const query = data && Object.keys(data).length
    ? `?${Object.keys(data).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`).join('&')}`
    : '';
  return call(`${path}${query}`, { method: 'GET' });
}

function post(path, data) {
  return call(path, { method: 'POST', data });
}

function patch(path, data) {
  return call(path, { method: 'PATCH', data });
}

function del(path, data) {
  return call(path, { method: 'DELETE', data });
}

module.exports = {
  call,
  get,
  post,
  patch,
  del,
};
