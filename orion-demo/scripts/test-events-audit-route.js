#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const eventsRoutePath = path.join(root, 'server/routes/events.js');

const events = new Map();
const auditLogs = [];
const signupCounts = new Map([['ev_test', 2]]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function dbRow(event) {
  return event ? {
    id: event.id,
    tag: event.tag,
    title: event.title,
    cover: event.cover,
    date: event.date,
    location: event.location,
    body: event.body,
    images: event.images,
    metadata: event.metadata,
    source_link: event.source_link,
    created_at: event.created_at,
  } : null;
}

function dbRowWithSignupCounts(event) {
  const row = dbRow(event);
  if (!row) return null;
  const signupCount = signupCounts.get(event.id) || 0;
  return {
    ...row,
    signup_count: signupCount,
    tentative_signup_count: 1,
    cancelled_signup_count: 0,
    active_signup_count: signupCount + 1,
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
        if (/FROM events e\s+LEFT JOIN/s.test(sql)) {
          const rows = Array.from(events.values()).map(dbRowWithSignupCounts);
          return /LIMIT \? OFFSET \?/.test(sql)
            ? rows.slice(Number(params[1]) || 0, (Number(params[1]) || 0) + (Number(params[0]) || 0))
            : rows;
        }
        if (/SELECT \* FROM events ORDER BY created_at DESC/.test(sql)) {
          const rows = Array.from(events.values()).map(dbRow);
          return /LIMIT \? OFFSET \?/.test(sql)
            ? rows.slice(Number(params[1]) || 0, (Number(params[1]) || 0) + (Number(params[0]) || 0))
            : rows;
        }
        if (/ALTER TABLE events ADD COLUMN metadata/.test(sql)) {
          return { affectedRows: 0 };
        }
        if (/INSERT INTO events/.test(sql)) {
          const [id, tag, title, cover, date, location, body, images, metadata, sourceLink] = params;
          events.set(id, {
            id,
            tag,
            title,
            cover,
            date,
            location,
            body,
            images,
            metadata,
            source_link: sourceLink,
            created_at: '2026-05-28',
          });
          return { affectedRows: 1 };
        }
        if (/UPDATE events SET/.test(sql)) {
          const id = params[params.length - 1];
          const event = events.get(id);
          assert(event, `missing event ${id}`);
          const assignments = sql.match(/UPDATE events SET (.*) WHERE id = \?/s)[1]
            .split(',')
            .map(item => item.trim().split(' = ')[0]);
          assignments.forEach((column, index) => {
            event[column === 'source_link' ? 'source_link' : column] = params[index];
          });
          events.set(id, event);
          return { affectedRows: 1 };
        }
        if (/DELETE FROM events WHERE id = \?/.test(sql)) {
          events.delete(params[0]);
          return { affectedRows: 1 };
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async (sql, params = []) => {
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql) && /TABLE_NAME = 'events'/.test(sql) && /COLUMN_NAME = 'metadata'/.test(sql)) {
          return { COLUMN_NAME: 'metadata' };
        }
        if (/SELECT \* FROM events WHERE id = \?/.test(sql)) {
          return dbRow(events.get(params[0]));
        }
        if (/SELECT COUNT\(\*\) AS c FROM event_signups WHERE event_id = \?/.test(sql)) {
          return { c: signupCounts.get(params[0]) || 0 };
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
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin' };
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
      logAudit: async log => {
        auditLogs.push(clone(log));
      },
    },
  };
}

async function request(app, method, url, body) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[eventsRoutePath];
  const { router } = require(eventsRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/events', router);

  const created = await request(app, 'POST', '/events', {
    id: 'ev_test',
    tag: '🏋️ 训练',
    title: '周末训练',
    cover: 'https://cos.example/event.jpg',
    date: '2026-06-06',
    location: '奥体',
    body: '训练说明',
    images: ['https://cos.example/1.jpg'],
    metadata: { location: { name: '奥体', source: 'wx.chooseLocation', latitude: 39.99, longitude: 116.39 } },
    sourceLink: 'https://www.xiaohongshu.com/explore/orion',
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.event.id, 'ev_test');
  assert.strictEqual(created.data.event.metadata.location.source, 'wx.chooseLocation');
  assert.strictEqual(auditLogs[0].action, 'event_create');
  assert.strictEqual(auditLogs[0].targetType, 'event');
  assert.strictEqual(auditLogs[0].metadata.after.title, '周末训练');

  const listed = await request(app, 'GET', '/events');
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.data.events[0].signupCount, 2);
  assert.strictEqual(listed.data.events[0].tentativeSignupCount, 1);
  assert.strictEqual(listed.data.events[0].activeSignupCount, 3);

  const paged = await request(app, 'GET', '/events?limit=1&offset=0');
  assert.strictEqual(paged.status, 200);
  assert.strictEqual(paged.data.events.length, 1);
  assert.strictEqual(paged.data.hasMore, false);
  assert.strictEqual(paged.data.nextOffset, 1);

  const updated = await request(app, 'PATCH', '/events/ev_test', {
    title: '周末训练更新',
    sourceLink: '',
  });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.event.title, '周末训练更新');
  assert.strictEqual(auditLogs[1].action, 'event_update');
  assert.strictEqual(auditLogs[1].metadata.before.title, '周末训练');
  assert.strictEqual(auditLogs[1].metadata.after.title, '周末训练更新');
  assert.deepStrictEqual(auditLogs[1].metadata.changedKeys, ['title', 'sourceLink']);

  const deleted = await request(app, 'DELETE', '/events/ev_test');
  assert.strictEqual(deleted.status, 200);
  assert.strictEqual(auditLogs[2].action, 'event_delete');
  assert.strictEqual(auditLogs[2].metadata.before.title, '周末训练更新');
  assert.strictEqual(auditLogs[2].metadata.signupCount, 2);

  console.log('Events audit route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
