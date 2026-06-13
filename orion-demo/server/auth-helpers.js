// 鉴权工具：密码哈希 + 签名 cookie
// 简化方案：用 HMAC-SHA256 签名 userId 作为 session token，无状态
// 后续接 wx.login 时同样体系，wx 那边追加 wx_openid 进 user_identities

const crypto = require('crypto');
const { domainToASCII } = require('url');

// SESSION_SECRET 从环境变量读，没设就用一个默认（生产部署务必设）
const SECRET = process.env.SESSION_SECRET || 'orion-default-secret-change-me';
const COOKIE_NAME = 'orion_session';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 天
const CUSTOM_COOKIE_DOMAIN = 'xn--4gsr8nf4ck7ihxnemb.cn';

// ============== 密码哈希（PBKDF2，纯标准库，无需 bcrypt）==============
// 格式：scheme$iterations$salt_hex$hash_hex
const PBKDF2_ITER = 50000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

function hashPassword(plaintext) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plaintext, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `pbkdf2$${PBKDF2_ITER}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(plaintext, stored) {
  if (!stored) return false;
  // 兼容老明文密码（迁移过来时直接抄了）
  if (!stored.startsWith('pbkdf2$')) return stored === plaintext;
  const [, iterStr, saltHex, hashHex] = stored.split('$');
  const iter = Number(iterStr);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.pbkdf2Sync(plaintext, salt, iter, expected.length, PBKDF2_DIGEST);
  return crypto.timingSafeEqual(actual, expected);
}

// ============== Session token：HMAC 签名的 userId ==============
// 格式：base64(userId).base64(hmac)
// 服务端验证签名 → 拿到 userId → 查 user
function signSession(userId) {
  const payload = Buffer.from(userId).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  // timing-safe 比较
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return Buffer.from(payload, 'base64url').toString('utf8'); }
  catch (_) { return null; }
}

// ============== Cookie 工具 ==============
function normalizeRequestHost(req) {
  const raw = String(req?.headers?.host || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  const withoutPort = raw.startsWith('[')
    ? raw.slice(1, raw.indexOf(']') > 0 ? raw.indexOf(']') : undefined)
    : raw.replace(/:\d+$/, '');
  return domainToASCII(withoutPort) || withoutPort;
}

function cookieDomainForRequest(req) {
  const host = normalizeRequestHost(req);
  if (host === CUSTOM_COOKIE_DOMAIN || host === `www.${CUSTOM_COOKIE_DOMAIN}`) {
    return CUSTOM_COOKIE_DOMAIN;
  }
  return '';
}

function sessionCookieString(value, req, { maxAgeSec, domain = '' } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (Number.isFinite(maxAgeSec)) parts.splice(2, 0, `Max-Age=${maxAgeSec}`);
  if (domain) parts.push(`Domain=${domain}`);
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res, userId, req) {
  const token = signSession(userId);
  const maxAgeSec = Math.floor(COOKIE_MAX_AGE_MS / 1000);
  const domain = cookieDomainForRequest(req);
  const cookies = [
    sessionCookieString(token, req, { maxAgeSec, domain }),
  ];
  if (domain) {
    cookies.unshift(sessionCookieString('', req, { maxAgeSec: 0 }));
  }
  res.setHeader('Set-Cookie', cookies);
  return token;
}

function sessionCookieDomainForRequest(req) {
  return cookieDomainForRequest(req);
}

function clearSessionCookie(res, req) {
  const domain = cookieDomainForRequest(req);
  const cookies = [
    sessionCookieString('', req, { maxAgeSec: 0 }),
  ];
  if (domain) {
    cookies.push(sessionCookieString('', req, { maxAgeSec: 0, domain }));
  }
  res.setHeader('Set-Cookie', cookies);
}

function readSessionUserId(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const bearer = String(auth || '').match(/^Bearer\s+(.+)$/i);
  const headerToken = req.headers['x-orion-session'] || (bearer && bearer[1]);
  if (headerToken) {
    const fromHeader = verifySession(String(headerToken).trim());
    if (fromHeader) return fromHeader;
  }
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(s => s.trim());
  const tokens = parts
    .filter(p => p.startsWith(COOKIE_NAME + '='))
    .map(p => p.slice(COOKIE_NAME.length + 1))
    .filter(Boolean);
  for (const token of tokens) {
    const userId = verifySession(token);
    if (userId) return userId;
  }
  return null;
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  readSessionUserId,
  sessionCookieDomainForRequest,
};
