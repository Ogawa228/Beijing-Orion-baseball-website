#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const permissionsPath = path.join(root, 'server/permissions.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const adminRoutePath = path.join(root, 'server/routes/admin.js');

const rows = [
  userRow('u4', '第四账号', 'player', null, [], 'late@example.com', '', '', '', '2026-06-04T08:00:00'),
  userRow('u3', '数据组员', 'admin', 'C', ['data'], 'data@example.com', '捕手队员', 21, 'C', '2026-06-03T08:00:00'),
  userRow('u2', '运营组员', 'player', null, [], 'ops@example.com', '', '', '', '2026-06-02T08:00:00'),
  userRow('u1', '全站管理员', 'admin', 'A', ['data', 'ops'], 'admin@example.com', '一号队员', 1, 'P', '2026-06-01T08:00:00'),
];
const queries = [];
let playersQueryCount = 0;

function userRow(id, name, role, adminLevel, groups, email, playerName, playerNumber, playerPosition, createdAt) {
  return {
    id,
    display_name: name,
    role,
    admin_level: adminLevel,
    admin_permission_groups: JSON.stringify(groups || []),
    admin_granted_by: '',
    admin_granted_by_name: '',
    admin_granted_at: null,
    bound_player_id: playerName ? `p_${id}` : null,
    avatar: '',
    last_active_at: createdAt,
    created_at: createdAt,
    email,
    player_name: playerName,
    player_number: playerNumber,
    player_position: playerPosition,
  };
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/FROM users u/.test(sql) && /LEFT JOIN user_identities/.test(sql)) {
          queries.push({ sql, params });
          let matched = rows;
          if (/display_name LIKE \?/.test(sql)) {
            const like = String(params[0] || '').replace(/%/g, '');
            matched = matched.filter(row => (
              String(row.display_name).includes(like) || String(row.email).includes(like)
            ));
          }
          if (/LIMIT \? OFFSET \?/.test(sql)) {
            const limit = Number(params[params.length - 2]) || matched.length;
            const offset = Number(params[params.length - 1]) || 0;
            return matched.slice(offset, offset + limit);
          }
          return matched;
        }
        if (/FROM players/.test(sql) && /level = 'verified'/.test(sql)) {
          playersQueryCount += 1;
          return [{ id: 'p_u1', name: '一号队员', number: 1, position: 'P' }];
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async () => null,
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin', permissions: ['users:read'] };
        next();
      },
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };

  delete require.cache[permissionsPath];
  require.cache[permissionsPath] = {
    id: permissionsPath,
    filename: permissionsPath,
    loaded: true,
    exports: {
      ADMIN_LEVELS: new Set(['A', 'B', 'C']),
      ADMIN_PERMISSION_GROUPS: new Set(['data', 'ops']),
      OWNER_EMAIL: 'admin@example.com',
      ensurePermissionsSchema: async () => {},
      hasPermission: () => true,
      isOwnerUserId: () => false,
      normalizePermissionGroups: user => {
        const raw = user.admin_permission_groups || user.adminPermissionGroups || [];
        if (Array.isArray(raw)) return raw;
        try { return JSON.parse(raw || '[]'); } catch (_) { return []; }
      },
      permissionsForUser: () => ['users:read'],
    },
  };

  delete require.cache[peopleHelpersPath];
  require.cache[peopleHelpersPath] = {
    id: peopleHelpersPath,
    filename: peopleHelpersPath,
    loaded: true,
    exports: {
      ensurePeopleTables: async () => {},
      rowToAuditLog: row => row,
      logAudit: async () => {},
      createNotification: async () => ({}),
      generateBindCode: () => 'ORION-TEST',
      bindUserToPlayer: async () => ({}),
      unbindUserFromPlayer: async () => ({}),
    },
  };
}

async function request(app, url) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`);
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[adminRoutePath];
  const router = require(adminRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/admin', router);

  const first = await request(app, '/admin/users?limit=2&offset=0');
  assert.strictEqual(first.status, 200);
  assert.deepStrictEqual(first.data.users.map(item => item.id), ['u4', 'u3']);
  assert.strictEqual(first.data.hasMore, true);
  assert.strictEqual(first.data.nextOffset, 2);
  assert.strictEqual(first.data.users[1].adminLevel, 'C');
  assert.deepStrictEqual(first.data.users[1].adminPermissionGroups, ['data']);
  assert.strictEqual(first.data.users[0].isOwner, false);

  const second = await request(app, '/admin/users?limit=2&offset=2');
  assert.strictEqual(second.status, 200);
  assert.deepStrictEqual(second.data.users.map(item => item.id), ['u2', 'u1']);
  assert.strictEqual(second.data.hasMore, false);
  assert.strictEqual(second.data.nextOffset, 4);
  assert.strictEqual(second.data.users[1].isOwner, true);

  const all = await request(app, '/admin/users');
  assert.strictEqual(all.status, 200);
  assert.deepStrictEqual(all.data.users.map(item => item.id), ['u4', 'u3', 'u2', 'u1']);
  assert.strictEqual(all.data.hasMore, false);
  assert.strictEqual(all.data.nextOffset, 4);

  assert(queries[0].sql.includes('LIMIT ? OFFSET ?'), 'paged query should use SQL limit/offset');
  assert.deepStrictEqual(queries[0].params, [3, 0]);
  assert.deepStrictEqual(queries[1].params, [3, 2]);

  // bind-invitation-options:旧版全量兼容(用户上限 200 + 球员候选)
  const inviteLegacy = await request(app, '/admin/bind-invitation-options');
  assert.strictEqual(inviteLegacy.status, 200);
  assert.deepStrictEqual(inviteLegacy.data.users.map(item => item.id), ['u4', 'u3', 'u2', 'u1']);
  assert.strictEqual(inviteLegacy.data.players.length, 1, 'legacy invitation options should keep player candidates');
  assert.strictEqual(inviteLegacy.data.usersHasMore, undefined, 'legacy invitation options should not add paging fields');

  // bind-invitation-options:分页 + includePlayers=false 跳过球员候选查询
  const playersQueriesBefore = playersQueryCount;
  const invitePaged = await request(app, '/admin/bind-invitation-options?limit=2&offset=0&includePlayers=false');
  assert.deepStrictEqual(invitePaged.data.users.map(item => item.id), ['u4', 'u3']);
  assert.strictEqual(invitePaged.data.usersHasMore, true);
  assert.strictEqual(invitePaged.data.usersNextOffset, 2);
  assert.deepStrictEqual(invitePaged.data.players, []);
  assert.strictEqual(playersQueryCount, playersQueriesBefore, 'includePlayers=false should skip the players query');

  // bind-invitation-options:keyword 小候选
  const inviteKeyword = await request(app, '/admin/bind-invitation-options?limit=10&includePlayers=false&keyword=%E6%95%B0%E6%8D%AE');
  assert.deepStrictEqual(inviteKeyword.data.users.map(item => item.id), ['u3']);

  console.log('Admin users route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
