#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const notificationsRoutePath = path.join(root, 'server/routes/notifications.js');

let notifications = [
  row('n1', 'u1', null, '2026-06-03T10:00:00Z'),
  row('n2', 'u1', '2026-06-02T10:05:00Z', '2026-06-02T10:00:00Z'),
  row('n3', 'u1', null, '2026-06-01T10:00:00Z'),
  row('n4', 'u2', null, '2026-06-04T10:00:00Z'),
];

function row(id, userId, readAt, createdAt) {
  return {
    id,
    user_id: userId,
    type: 'admin_broadcast',
    title: `通知 ${id}`,
    body: `内容 ${id}`,
    payload: JSON.stringify({ id }),
    read_at: readAt,
    created_by: 'u_admin',
    created_at: createdAt,
  };
}

function rowToNotification(r) {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    payload: JSON.parse(r.payload || '{}'),
    readAt: r.read_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function sortedUserRows(userId) {
  return notifications
    .filter(item => item.user_id === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/SELECT \*/.test(sql) && /FROM user_notifications/.test(sql)) {
          const userId = params[0];
          const limit = Number(params[1]) || 0;
          const offset = Number(params[2]) || 0;
          return sortedUserRows(userId).slice(offset, offset + limit);
        }
        if (/UPDATE user_notifications/.test(sql)) {
          const [id, userId] = params;
          notifications = notifications.map(item => (
            item.id === id && item.user_id === userId && !item.read_at
              ? { ...item, read_at: '2026-06-03T11:00:00Z' }
              : item
          ));
          return { affectedRows: 1 };
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async (sql, params = []) => {
        if (/COUNT\(\*\) AS total/.test(sql)) {
          const userId = params[0];
          return { total: notifications.filter(item => item.user_id === userId && !item.read_at).length };
        }
        if (/SELECT \* FROM user_notifications WHERE id = \? AND user_id = \?/.test(sql)) {
          const [id, userId] = params;
          return notifications.find(item => item.id === id && item.user_id === userId) || null;
        }
        throw new Error(`unexpected qOne: ${sql}`);
      },
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requireAuth: (req, _res, next) => {
        req.user = { id: 'u1' };
        next();
      },
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin', permissions: ['notifications:write'] };
        next();
      },
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };

  delete require.cache[peopleHelpersPath];
  require.cache[peopleHelpersPath] = {
    id: peopleHelpersPath,
    filename: peopleHelpersPath,
    loaded: true,
    exports: {
      ensurePeopleTables: async () => {},
      rowToNotification,
      createNotification: async () => rowToNotification(row('created', 'u1', null, '2026-06-05T10:00:00Z')),
      logAudit: async () => {},
    },
  };
}

async function request(app, url, options = {}) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`, options);
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[notificationsRoutePath];
  const { router } = require(notificationsRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/notifications', router);

  const first = await request(app, '/notifications?limit=2&offset=0');
  assert.strictEqual(first.status, 200);
  assert.deepStrictEqual(first.data.notifications.map(item => item.id), ['n1', 'n2']);
  assert.strictEqual(first.data.unreadCount, 2);
  assert.strictEqual(first.data.hasMore, true);
  assert.strictEqual(first.data.nextOffset, 2);

  const second = await request(app, '/notifications?limit=2&offset=2');
  assert.strictEqual(second.status, 200);
  assert.deepStrictEqual(second.data.notifications.map(item => item.id), ['n3']);
  assert.strictEqual(second.data.hasMore, false);
  assert.strictEqual(second.data.nextOffset, 3);

  const read = await request(app, '/notifications/n1/read', { method: 'POST' });
  assert.strictEqual(read.status, 200);
  assert.strictEqual(read.data.notification.id, 'n1');
  assert.strictEqual(read.data.notification.readAt, '2026-06-03T11:00:00Z');

  const afterRead = await request(app, '/notifications?limit=2&offset=0');
  assert.strictEqual(afterRead.data.unreadCount, 1);

  console.log('Notifications route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
