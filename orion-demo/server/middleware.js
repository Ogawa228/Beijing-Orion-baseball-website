// Express 中间件：把 user 注入 req，并提供鉴权守卫
const db = require('./db');
const { readSessionUserId } = require('./auth-helpers');
const { ensurePermissionsSchema, hasPermission, isAdminUser } = require('./permissions');

// 把 user 注入 req.user（无登录态 → null）
async function attachUser(req, _res, next) {
  const userId = readSessionUserId(req);
  if (!userId) { req.user = null; return next(); }
  try {
    await ensurePermissionsSchema();
    req.user = await db.qOne('SELECT * FROM users WHERE id = ?', [userId]);
  } catch (e) {
    req.user = null;
  }
  next();
}

// 必须登录
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  next();
}

// 必须是 admin
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'forbidden', message: '需要管理员权限' });
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'forbidden', message: '权限不足', permission });
    }
    next();
  };
}

// 统一错误处理中间件（最后 mount）
function errorHandler(err, _req, res, _next) {
  console.error('[API ERROR]', err.stack || err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: err.code || 'internal_error',
    message: err.message || '服务器错误',
  });
}

// 把 async 路由 handler 包一层，让抛错走 errorHandler
function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { attachUser, requireAuth, requireAdmin, requirePermission, errorHandler, wrap };
