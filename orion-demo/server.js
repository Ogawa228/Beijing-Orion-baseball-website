// orion-demo · Express server
// - 静态文件托管（保留旧版行为）
// - /api/* 路由：JSON API（前端 / 小程序统一调）
// - /healthz：云托管健康检查端点
//
// 部署到云托管时 .env 不会被打包（见 .dockerignore），
// 配置通过云托管控制台「环境变量」注入

const path = require('path');
// dotenv 用绝对路径，避免 cwd 不在 orion-demo/ 时找不到 .env
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const db = require('./server/db');
const { attachUser, errorHandler, wrap } = require('./server/middleware');

const app = express();
const port = process.env.PORT || 80;

// JSON body parser，限制 20MB 处理大 base64 图片
app.use(express.json({ limit: '20mb' }));

// 把 user 注入到 req.user（无 cookie 也走，是 null）
app.use(attachUser);

// ============== API 路由 ==============
const api = express.Router();

// 健康检查（同时被云托管负载均衡器周期性请求）
api.get('/health', wrap(async (_req, res) => {
  const ping = await db.ping();
  res.status(ping.ok ? 200 : 503).json({
    server: 'ok',
    db: ping,
    time: new Date().toISOString(),
  });
}));

// 数据库元信息
api.get('/db/info', wrap(async (_req, res) => {
  const [version] = await db.q('SELECT VERSION() AS version');
  const tables = await db.q(`
    SELECT TABLE_NAME, TABLE_ROWS
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME
  `);
  res.json({ version: version.version, dbName: process.env.DB_NAME, tables });
}));

// Mount 业务路由
api.use('/auth',         require('./server/routes/auth'));
api.use('/players',      require('./server/routes/players').router);
api.use('/tournaments',  require('./server/routes/tournaments').router);
api.use('/games',        require('./server/routes/games').router);
api.use('/events',       require('./server/routes/events').router);
api.use('/attendances',  require('./server/routes/attendances').router);
api.use('/points-adjustments', require('./server/routes/adjustments').router);
api.use('/bind-codes',   require('./server/routes/bindcodes').router);
api.use('/bind-requests', require('./server/routes/bind-requests').router);
api.use('/notifications', require('./server/routes/notifications').router);
api.use('/highlights',   require('./server/routes/highlights').router);
api.use('/hall-of-fame', require('./server/routes/hof').router);
api.use('/site-settings', require('./server/routes/site-settings'));
api.use('/upload',       require('./server/routes/upload'));
api.use('/admin/bind-requests', require('./server/routes/bind-requests').adminRouter);
api.use('/admin',        require('./server/routes/admin'));
// leaderboard 包含多个端点：/leaderboard /players/:id/points /points/rules
api.use('/',             require('./server/routes/leaderboard'));

// API 路由的统一错误处理（mount 在所有 API 子路由后）
api.use(errorHandler);

app.use('/api', api);

// ============== 静态文件托管 ==============
// 只暴露前端页面和前端资产，避免把 server/*.js、package.json 等源码当静态文件下载。
const HTML_PAGES = new Set([
  'index.html',
  'players.html',
  'dashboard.html',
  'events.html',
  'game-detail.html',
  'games.html',
  'hall-of-fame.html',
  'player-points.html',
  'ranking.html',
  'tournament.html',
  'contact.html',
  'admin.html',
]);

app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
}));

// players.html 当前按浏览器 ESM 方式加载 three，只开放所需 build 产物。
app.get('/node_modules/three/build/:file', (req, res, next) => {
  const file = String(req.params.file || '');
  if (!/^three\.(module|core)\.js$/.test(file)) return next();
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'node_modules/three/build', file));
});

app.get(['/', '/index', '/index.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:page', (req, res, next) => {
  const raw = String(req.params.page || '');
  const page = raw.endsWith('.html') ? raw : `${raw}.html`;
  if (!HTML_PAGES.has(page)) return next();
  res.sendFile(path.join(__dirname, page));
});

// 云托管 LB 心跳
app.get('/healthz', (_req, res) => res.send('ok'));

// 404 fallback 到 index.html（SPA 风格，但 /api/* 已经在前面拦截）
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`▸ orion-demo server listening on ${port}`);
  console.log(`▸ API:  http://localhost:${port}/api/health`);
  console.log(`▸ Site: http://localhost:${port}/`);
});

// Safety net：第三方 SDK（如 @cloudbase/node-sdk）有时把错误抛在 await 之外，
// 没这层兜底单次失败的请求会拖垮整个进程
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack || err);
});

// 优雅关闭：收到 SIGTERM 关数据库连接池
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing...');
  await db.close();
  server.close(() => process.exit(0));
});
