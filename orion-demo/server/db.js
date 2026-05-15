// MySQL 连接池单例 —— server.js 和 scripts/* 共用
// 用 connection pool 而非单条连接：
//   1. 自动复用连接，并发请求不会被阻塞
//   2. Serverless 数据库自动暂停 / 恢复时，pool 会自动重连
const mysql = require('mysql2/promise');

// 兼容两套命名：
// - 本地 .env 用 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
// - 云托管控制台用腾讯云标准 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD / MYSQL_DATABASE
//   （MYSQL_ADDRESS 是 "host:port" 拼一起的格式）
function buildConfig() {
  let host = process.env.DB_HOST;
  let port = process.env.DB_PORT;
  if (process.env.MYSQL_ADDRESS) {
    const idx = process.env.MYSQL_ADDRESS.lastIndexOf(':');
    if (idx > 0) {
      host = host || process.env.MYSQL_ADDRESS.slice(0, idx);
      port = port || process.env.MYSQL_ADDRESS.slice(idx + 1);
    } else {
      host = host || process.env.MYSQL_ADDRESS;
    }
  }
  return {
    host,
    port: Number(port || 3306),
    user: process.env.MYSQL_USERNAME || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'orion',
    charset: 'utf8mb4',           // 必须 utf8mb4，存 emoji + CJK Supplement Radicals
    timezone: '+08:00',           // 北京时间
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    // Serverless 第一次访问可能要冷启动 5-10s
    connectTimeout: 30000,
  };
}
const config = buildConfig();

let _pool = null;

function getPool() {
  if (!_pool) {
    if (!config.host || !config.password) {
      throw new Error('数据库未配置：检查 .env 是否填了 DB_HOST/DB_PASSWORD');
    }
    _pool = mysql.createPool(config);
  }
  return _pool;
}

// 工具：执行 SQL，返回 rows。
// 自动重试 Serverless 冷启动 / 空闲断连等暂态错误（最多 3 次，指数退避 0.4s/1.2s）
const RETRYABLE = /Connection lost|server has gone away|ECONNRESET|ETIMEDOUT|connect ECONNREFUSED|read ECONNRESET|protocol_connection_lost/i;
async function q(sql, params = []) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [rows] = await getPool().execute(sql, params);
      return rows;
    } catch (e) {
      lastErr = e;
      if (attempt < 2 && RETRYABLE.test(e.message || '') ) {
        await new Promise(r => setTimeout(r, 400 * Math.pow(3, attempt)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// 工具：单行查询
async function qOne(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// 健康检查：确认数据库能连
async function ping() {
  try {
    const [rows] = await getPool().query('SELECT 1 AS ok, NOW() AS now, VERSION() AS version');
    return { ok: true, ...rows[0] };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  }
}

// 优雅关闭（SIGTERM 时调）
async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

module.exports = { getPool, q, qOne, ping, close };
