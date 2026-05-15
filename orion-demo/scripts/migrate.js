#!/usr/bin/env node
// 一次性迁移脚本：读浏览器导出的 localStorage JSON → INSERT 到 MySQL
//
// 使用：
//   1. 在浏览器（任意已加载 db.js 的页面）console 跑：
//      (() => {
//        const data = localStorage.getItem('orion_db_v6');
//        const blob = new Blob([data], {type:'application/json'});
//        const a = document.createElement('a');
//        a.href = URL.createObjectURL(blob);
//        a.download = 'orion-data.json';
//        a.click();
//      })()
//   2. 把下载的 orion-data.json 放到项目根目录
//   3. 跑：node scripts/migrate.js orion-data.json
//
// 安全：脚本会先 TRUNCATE 所有表（从空开始），所以重复跑幂等

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// ============== 字段映射 ==============
// localStorage 是 camelCase；MySQL 是 snake_case
// 这里只列**键名变化**的，简单同名的不写

const players_map = {
  joinYear: 'join_year',
  upgradedAt: 'upgraded_at',
  upgradedBy: 'upgraded_by',
};
const games_map = {
  tournamentId: 'tournament_id',
  seasonName: 'season_name',
  homeScore: 'home_score',
  awayScore: 'away_score',
  homeTotals: 'home_totals',
  awayTotals: 'away_totals',
  oppBatting: 'opp_batting',
  oppPitching: 'opp_pitching',
  mvpPlayerName: 'mvp_player_name',
  mvpNote: 'mvp_note',
  isAggregate: 'is_aggregate',
};
const tournaments_map = {
  shortName: 'short_name',
  startDate: 'start_date',
  endDate: 'end_date',
};
const events_map = {
  sourceLink: 'source_link',
  createdAt: 'created_at',
};
const hof_map = { inductedYear: 'inducted_year' };
const highlights_map = { gameId: 'game_id', playerName: 'player_name' };
const bindcodes_map = { playerId: 'player_id', usedBy: 'used_by', usedAt: 'used_at', createdAt: 'created_at' };
const att_map = { playerId: 'player_id', refId: 'ref_id', createdBy: 'created_by', createdAt: 'created_at' };
const padj_map = { playerId: 'player_id', createdBy: 'created_by', createdAt: 'created_at' };

function rename(obj, mapping) {
  if (!obj) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[mapping[k] || k] = v;
  }
  return out;
}

// JSON 字段：MySQL 接受 JSON.stringify 的字符串
function jsonField(v) { return v == null ? null : JSON.stringify(v); }

// 'throws' 是 MySQL 关键字，schema 里改名为 throws_
function fixThrowsKey(p) {
  const out = { ...p };
  if ('throws' in out) { out.throws_ = out.throws; delete out.throws; }
  return out;
}

// ============== 主流程 ==============
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node scripts/migrate.js <localStorage 导出的 JSON 文件>');
    console.error('例如: node scripts/migrate.js orion-data.json');
    process.exit(1);
  }
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.error('❌ 文件不存在:', fullPath);
    process.exit(1);
  }
  console.log(`▸ 读 ${fullPath}（${(fs.statSync(fullPath).size/1024).toFixed(1)} KB）`);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const data = JSON.parse(raw);

  // 计数 sanity
  console.log(`  导出快照：`);
  console.log(`    · users:              ${(data.users||[]).length}`);
  console.log(`    · players:            ${(data.players||[]).length}`);
  console.log(`    · tournaments:        ${(data.tournaments||[]).length}`);
  console.log(`    · games:              ${(data.games||[]).length}`);
  console.log(`    · events:             ${(data.events||[]).length}`);
  console.log(`    · hallOfFame:         ${(data.hallOfFame||[]).length}`);
  console.log(`    · highlights:         ${(data.highlights||[]).length}`);
  console.log(`    · bindCodes:          ${(data.bindCodes||[]).length}`);
  console.log(`    · attendances:        ${(data.attendances||[]).length}`);
  console.log(`    · pointsAdjustments:  ${(data.pointsAdjustments||[]).length}`);

  // 用 pool 而非单连接：Serverless 自动暂停 / 网络抖动时会自动重连
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'orion',
    charset: 'utf8mb4',
    timezone: '+08:00',
    connectTimeout: 30000,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    maxAllowedPacket: 64 * 1024 * 1024,
  });
  // wrap 一层让旧 conn.query 调用照样工作（pool 直接 .query 也支持，但保留兼容）
  const conn = {
    query: (...args) => pool.query(...args),
    end: () => pool.end(),
  };
  // 主动 ping 一次唤醒 Serverless（首次连接 5-10s 冷启动）
  console.log('✓ 连接 MySQL pool（如果 Serverless 暂停了，正在唤醒...）');
  await pool.query('SELECT 1');
  console.log('✓ 数据库已唤醒');

  // ============== 清空表（按外键反向顺序）==============
  console.log('▸ 清空所有表（按外键反向）');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const tablesToClear = [
    'user_identities', 'users',
    'points_adjustments', 'attendances',
    'highlights', 'hall_of_fame', 'bind_codes',
    'events', 'games', 'tournaments', 'players',
    '_migrations',
  ];
  for (const t of tablesToClear) {
    await conn.query(`TRUNCATE TABLE \`${t}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // ============== 按依赖顺序 INSERT ==============

  // 1. tournaments
  if (data.tournaments?.length) {
    const rows = data.tournaments.map(t => {
      const r = rename(t, tournaments_map);
      return [r.id, r.type, r.name, r.short_name||'', r.season||'', r.sport||'mixed',
              r.start_date||null, r.end_date||null, r.cover||null, r.description||null, r.location||''];
    });
    await conn.query(
      `INSERT INTO tournaments (id, type, name, short_name, season, sport, start_date, end_date, cover, description, location) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ tournaments: ${rows.length}`);
  }

  // 2. players
  if (data.players?.length) {
    const rows = data.players.map(p => {
      const r = rename(fixThrowsKey(p), players_map);
      return [
        r.id, r.name, r.number||'', r.position||'', r.photo||null, r.slogan||'',
        r.bats||'', r.throws_||'',
        r.join_year || null,
        jsonField(r.titles || []),
        jsonField(r.aliases || null),
        r.level || 'verified',
        r.upgraded_at || null,
        r.upgraded_by || null,
      ];
    });
    await conn.query(
      `INSERT INTO players (id, name, number, position, photo, slogan, bats, throws_, join_year, titles, aliases, level, upgraded_at, upgraded_by) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ players: ${rows.length}`);
  }

  // 3. games
  if (data.games?.length) {
    const rows = data.games.map(g => {
      const r = rename(g, games_map);
      return [
        r.id, r.tournament_id || null, r.sport||'', r.season||'', r.season_name||'',
        r.cover||null, r.date||null, r.venue||null, r.innings||null,
        r.home||'', r.away||'', r.home_score||null, r.away_score||null,
        jsonField(r.linescore), jsonField(r.home_totals), jsonField(r.away_totals),
        jsonField(r.batting), jsonField(r.opp_batting), jsonField(r.pitching), jsonField(r.opp_pitching),
        r.mvp_player_name || '', r.mvp_note || '',
        r.is_aggregate ? 1 : 0,
      ];
    });
    await conn.query(
      `INSERT INTO games (id, tournament_id, sport, season, season_name, cover, date, venue, innings, home, away, home_score, away_score, linescore, home_totals, away_totals, batting, opp_batting, pitching, opp_pitching, mvp_player_name, mvp_note, is_aggregate) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ games: ${rows.length}`);
  }

  // 4. events
  if (data.events?.length) {
    const rows = data.events.map(e => {
      const r = rename(e, events_map);
      return [r.id, r.tag||'', r.title, r.cover||null, r.date||'', r.location||'',
              r.body||null, jsonField(r.images||[]), r.source_link||'', r.created_at || null];
    });
    await conn.query(
      `INSERT INTO events (id, tag, title, cover, date, location, body, images, source_link, created_at) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ events: ${rows.length}`);
  }

  // 5. hall_of_fame
  if (data.hallOfFame?.length) {
    const rows = data.hallOfFame.map(h => {
      const r = rename(h, hof_map);
      return [r.player_id || h.playerId, r.inducted_year, r.reason || ''];
    });
    await conn.query(
      `INSERT INTO hall_of_fame (player_id, inducted_year, reason) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ hall_of_fame: ${rows.length}`);
  }

  // 6. highlights
  if (data.highlights?.length) {
    const rows = data.highlights.map(h => {
      const r = rename(h, highlights_map);
      return [r.id, r.game_id||null, r.player_name||'', r.title||'', r.url||'',
              r.cover||null, r.uploader||'', r.status||'pending'];
    });
    await conn.query(
      `INSERT INTO highlights (id, game_id, player_name, title, url, cover, uploader, status) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ highlights: ${rows.length}`);
  }

  // 7. bind_codes
  if (data.bindCodes?.length) {
    const rows = data.bindCodes.map(b => {
      const r = rename(b, bindcodes_map);
      return [r.code, r.player_id, r.used ? 1 : 0, r.used_by || null, r.used_at || null, r.created_at || null];
    });
    await conn.query(
      `INSERT INTO bind_codes (code, player_id, used, used_by, used_at, created_at) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ bind_codes: ${rows.length}`);
  }

  // 8. attendances
  if (data.attendances?.length) {
    const rows = data.attendances.map(a => {
      const r = rename(a, att_map);
      return [r.id, r.player_id, r.kind, r.ref_id || null, r.date,
              r.note || null, r.created_by || null, r.created_at || null];
    });
    await conn.query(
      `INSERT INTO attendances (id, player_id, kind, ref_id, date, note, created_by, created_at) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ attendances: ${rows.length}`);
  }

  // 9. points_adjustments
  if (data.pointsAdjustments?.length) {
    const rows = data.pointsAdjustments.map(a => {
      const r = rename(a, padj_map);
      return [r.id, r.player_id, r.delta, r.reason || null, r.created_by || null, r.created_at || null];
    });
    await conn.query(
      `INSERT INTO points_adjustments (id, player_id, delta, reason, created_by, created_at) VALUES ?`,
      [rows]
    );
    console.log(`  ✓ points_adjustments: ${rows.length}`);
  }

  // 10. users + user_identities（同步建立）
  if (data.users?.length) {
    const userRows = data.users.map(u => [
      u.id, u.displayName || u.email || '匿名',
      u.role || 'player', u.boundPlayerId || null,
      null, null,    // app_connect_code 暂不迁移
      u.lastActiveAt || null,
      u.createdAt || null,
    ]);
    await conn.query(
      `INSERT INTO users (id, display_name, role, bound_player_id, app_connect_code, app_connect_code_expires_at, last_active_at, created_at) VALUES ?`,
      [userRows]
    );
    console.log(`  ✓ users: ${userRows.length}`);

    // user_identities：每个 user 把 email/password 拆成一行 identity
    const identityRows = [];
    for (const u of data.users) {
      if (u.email) {
        // 注意：旧数据 password 是明文，这里直接写进 password_hash 列
        // ⚠️ 后续接 wx.login 那一波时改用 bcrypt 重新哈希
        identityRows.push([u.id, 'email', u.email, u.password || null, null]);
      }
      if (Array.isArray(u.identities)) {
        for (const id of u.identities) {
          if (id.type === 'email') continue;  // 已处理
          identityRows.push([u.id, id.type, id.value, id.password_hash || null, id.app_id || null]);
        }
      }
    }
    if (identityRows.length) {
      await conn.query(
        `INSERT INTO user_identities (user_id, type, value, password_hash, app_id) VALUES ?`,
        [identityRows]
      );
      console.log(`  ✓ user_identities: ${identityRows.length}`);
    }
  }

  // 11. _migrations：把老 localStorage 里的 _migrations 数组也迁过去
  if (Array.isArray(data._migrations) && data._migrations.length) {
    const rows = data._migrations.map(name => [name]);
    await conn.query(`INSERT INTO _migrations (name) VALUES ?`, [rows]);
    console.log(`  ✓ _migrations: ${rows.length}`);
  }

  // ============== 收尾：行数 sanity ==============
  console.log('\n=== 迁移后各表行数 ===');
  const [stats] = await conn.query(`
    SELECT TABLE_NAME, TABLE_ROWS
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
  `, [process.env.DB_NAME || 'orion']);
  for (const t of stats) {
    console.log(`  · ${t.TABLE_NAME.padEnd(24)} ${t.TABLE_ROWS || 0} 行`);
  }

  await conn.end();
  console.log('\n✅ 迁移完成。下一步：把 db.js 改成 fetch /api/* 调云端，告别 localStorage');
}

main().catch(e => {
  console.error('❌ 失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
