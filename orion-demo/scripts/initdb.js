#!/usr/bin/env node
// 一键建库 + 建表
// 用法：
//   1. 先 cp .env.example .env，填好 DB_PASSWORD
//   2. 跑：node scripts/initdb.js
// 重复跑安全：所有 CREATE 都用 IF NOT EXISTS

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const cfg = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    connectTimeout: 30000,
    multipleStatements: true,    // schema.sql 有多条语句
  };

  if (!cfg.host || !cfg.password) {
    console.error('❌ 没读到 DB_HOST / DB_PASSWORD。先 cp .env.example .env 并填写');
    process.exit(1);
  }

  const dbName = process.env.DB_NAME || 'orion';
  console.log(`▸ 连接 MySQL: ${cfg.user}@${cfg.host}:${cfg.port}（Serverless 首次连接可能要 5-10s 冷启动）`);

  // 第一步：不指定 database 连接，建库
  let conn;
  try {
    conn = await mysql.createConnection(cfg);
    console.log('✓ 连接成功');
  } catch (e) {
    console.error('❌ 连接失败：', e.message);
    if (e.code === 'ENOTFOUND')      console.error('  → 域名解析失败，检查 DB_HOST');
    if (e.code === 'ECONNREFUSED')   console.error('  → 端口拒绝连接，检查 DB_PORT 和外网开通');
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  → 密码错误');
    process.exit(1);
  }

  console.log(`▸ 建库 \`${dbName}\` (utf8mb4 utf8mb4_unicode_ci)`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);

  // 第二步：跑 schema.sql（一次性多语句执行）
  const schemaPath = path.join(__dirname, '..', 'server', 'schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
  console.log(`▸ 执行 ${path.relative(process.cwd(), schemaPath)}（${(schemaSQL.length/1024).toFixed(1)} KB）`);
  await conn.query(schemaSQL);
  console.log('✓ 所有表已就绪');

  // 第三步：列出建好的表（只 SHOW TABLES，不 COUNT 单表 —— Serverless 长循环易断连）
  // 用 INFORMATION_SCHEMA 一次拿到所有表的行数预估，单条 SQL 更稳
  let tableInfo = [];
  try {
    tableInfo = await conn.query(`
      SELECT TABLE_NAME, TABLE_ROWS
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [dbName]).then(r => r[0]);
  } catch (e) {
    console.log(`⚠ 列表查询断连（可忽略，表已建好）：${e.message}`);
  }

  if (tableInfo.length) {
    console.log(`\n=== 数据库 \`${dbName}\` 共 ${tableInfo.length} 张表 ===`);
    for (const t of tableInfo) {
      console.log(`  · ${t.TABLE_NAME.padEnd(24)} ${t.TABLE_ROWS || 0} 行`);
    }
  }

  try { await conn.end(); } catch(_){}
  console.log(`\n✅ 完成。下一步：scripts/migrate.js 把你浏览器 localStorage 的数据导进 MySQL`);
}

main().catch(e => {
  console.error('❌ 失败：', e.message, e.stack);
  process.exit(1);
});
