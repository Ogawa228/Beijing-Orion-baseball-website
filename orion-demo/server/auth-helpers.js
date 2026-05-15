// 鉴权工具：密码哈希 + 签名 cookie
// 简化方案：用 HMAC-SHA256 签名 userId 作为 session token，无状态
// 后续接 wx.login 时同样体系，wx 那边追加 wx_openid 进 user_identities

const crypto = require('crypto');

// SESSION_SECRET 从环境变量读，没设就用一个默认（生产部署务必设）
const SECRET = process.env.SESSION_SECRET || 'orion-default-secret-change-me';
const COOKIE_NAME = 'orion_session';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 天

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
function setSessionCookie(res, userId) {
  const token = signSession(userId);
  // HttpOnly + SameSite=Lax + Secure 仅生产
  const isProd = process.env.NODE_ENV === 'production';
  const maxAgeSec = Math.floor(COOKIE_MAX_AGE_MS / 1000);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  return token;
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function readSessionUserId(req) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(s => s.trim());
  const target = parts.find(p => p.startsWith(COOKIE_NAME + '='));
  if (!target) return null;
  const token = target.slice(COOKIE_NAME.length + 1);
  return verifySession(token);
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
};
