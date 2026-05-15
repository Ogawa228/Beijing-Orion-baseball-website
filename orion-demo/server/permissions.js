const db = require('./db');

const OWNER_EMAIL = 'admin@orion.cn';
const ADMIN_LEVELS = new Set(['A', 'B', 'C']);
const ADMIN_PERMISSION_GROUPS = new Set(['data', 'ops']);

const OPS_PERMISSIONS = [
  'admin:access',
  'events:write',
  'tournaments:write',
  'highlights:write',
  'players:display_write',
  'uploads:content',
];

const DATA_PERMISSIONS = [
  'admin:access',
  'tournaments:write',
  'games:draft',
  'games:confirm',
  'games:revise',
  'games:cover_write',
  'audit:game_read',
  'players:alias_read',
];

const B_PERMISSIONS = [
  ...OPS_PERMISSIONS,
  ...DATA_PERMISSIONS,
  'bind_codes:manage',
  'bind_requests:review',
  'players:write',
  'players:honors_write',
  'attendances:write',
  'points:write',
  'hof:write',
];

const A_PERMISSIONS = [
  ...B_PERMISSIONS,
  'users:read',
  'users:grant_admin',
  'users:password_reset',
  'users:app_connect_code',
  'users:bind_direct',
  'audit:read',
  'system:settings',
  'destructive:delete',
];

const PERMISSIONS_BY_LEVEL = {
  C: new Set(['admin:access']),
  B: new Set(B_PERMISSIONS),
  A: new Set(A_PERMISSIONS),
};

const PERMISSIONS_BY_GROUP = {
  data: new Set(DATA_PERMISSIONS),
  ops: new Set(OPS_PERMISSIONS),
};

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

let schemaReady = false;
let schemaPromise = null;

function normalizeAdminLevel(user) {
  if (!user) return null;
  const raw = user.adminLevel || user.admin_level || null;
  if (ADMIN_LEVELS.has(raw)) return raw;
  return user.role === 'admin' ? 'C' : null;
}

function normalizePermissionGroups(user) {
  if (!user) return [];
  const raw = user.adminPermissionGroups ?? user.admin_permission_groups;
  const groups = parseJsonArray(raw)
    .map(g => String(g || '').trim().toLowerCase())
    .filter(g => ADMIN_PERMISSION_GROUPS.has(g));
  return Array.from(new Set(groups));
}

function isAdminUser(user) {
  return !!normalizeAdminLevel(user) || normalizePermissionGroups(user).length > 0;
}

function permissionsForLevel(level) {
  if (!ADMIN_LEVELS.has(level)) return [];
  return Array.from(PERMISSIONS_BY_LEVEL[level]);
}

function permissionsForUser(user) {
  const level = normalizeAdminLevel(user);
  const set = new Set(permissionsForLevel(level));
  if (level === 'A' || level === 'B') {
    for (const group of ADMIN_PERMISSION_GROUPS) {
      for (const p of PERMISSIONS_BY_GROUP[group]) set.add(p);
    }
  } else {
    for (const group of normalizePermissionGroups(user)) {
      for (const p of PERMISSIONS_BY_GROUP[group]) set.add(p);
    }
  }
  return Array.from(set);
}

function hasPermission(user, permission) {
  return permissionsForUser(user).includes(permission);
}

function serializeUserPermissions(user) {
  const adminLevel = normalizeAdminLevel(user);
  const adminPermissionGroups = (adminLevel === 'A' || adminLevel === 'B')
    ? Array.from(ADMIN_PERMISSION_GROUPS)
    : normalizePermissionGroups(user);
  return {
    adminLevel,
    adminPermissionGroups,
    permissions: permissionsForUser(user),
  };
}

async function ensureColumn(existing, column, ddl) {
  if (existing.has(column)) return;
  try {
    await db.q(ddl);
  } catch (e) {
    if (e && e.code === 'ER_DUP_FIELDNAME') return;
    throw e;
  }
}

async function ensurePermissionsSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const rows = await db.q(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('admin_level', 'admin_permission_groups', 'admin_granted_by', 'admin_granted_at')
    `);
    const existing = new Set(rows.map(r => r.COLUMN_NAME));
    await ensureColumn(existing, 'admin_level',
      "ALTER TABLE users ADD COLUMN admin_level ENUM('A','B','C') DEFAULT NULL AFTER role");
    existing.add('admin_level');
    await ensureColumn(existing, 'admin_permission_groups',
      "ALTER TABLE users ADD COLUMN admin_permission_groups JSON DEFAULT NULL AFTER admin_level");
    existing.add('admin_permission_groups');
    await ensureColumn(existing, 'admin_granted_by',
      "ALTER TABLE users ADD COLUMN admin_granted_by VARCHAR(64) DEFAULT NULL AFTER admin_permission_groups");
    existing.add('admin_granted_by');
    await ensureColumn(existing, 'admin_granted_at',
      "ALTER TABLE users ADD COLUMN admin_granted_at DATETIME DEFAULT NULL AFTER admin_granted_by");

    const owner = await db.qOne(`
      SELECT u.id
      FROM users u
      JOIN user_identities ui ON ui.user_id = u.id
      WHERE ui.type = 'email' AND ui.value = ?
      LIMIT 1
    `, [OWNER_EMAIL]);
    if (owner) {
      await db.q(`
        UPDATE users
        SET role = 'admin',
            admin_level = 'A',
            admin_permission_groups = JSON_ARRAY('data', 'ops'),
            admin_granted_by = COALESCE(admin_granted_by, id),
            admin_granted_at = COALESCE(admin_granted_at, NOW())
        WHERE id = ?
      `, [owner.id]);
    }
    const legacyAdminParams = owner ? [owner.id] : [];
    await db.q(`
      UPDATE users
      SET admin_level = 'C',
          admin_permission_groups = COALESCE(admin_permission_groups, JSON_ARRAY('data', 'ops')),
          admin_granted_at = COALESCE(admin_granted_at, NOW())
      WHERE role = 'admin'
        AND admin_level IS NULL
        ${owner ? 'AND id <> ?' : ''}
    `, legacyAdminParams);
    await db.q("UPDATE users SET role = 'admin' WHERE (admin_level IS NOT NULL OR admin_permission_groups IS NOT NULL) AND role <> 'admin'");
    schemaReady = true;
  })().finally(() => { schemaPromise = null; });
  return schemaPromise;
}

async function isOwnerUserId(userId) {
  const row = await db.qOne(`
    SELECT ui.user_id
    FROM user_identities ui
    WHERE ui.type = 'email' AND ui.value = ? AND ui.user_id = ?
    LIMIT 1
  `, [OWNER_EMAIL, userId]);
  return !!row;
}

module.exports = {
  ADMIN_PERMISSION_GROUPS,
  OWNER_EMAIL,
  ADMIN_LEVELS,
  PERMISSIONS_BY_GROUP,
  PERMISSIONS_BY_LEVEL,
  ensurePermissionsSchema,
  hasPermission,
  isAdminUser,
  isOwnerUserId,
  normalizeAdminLevel,
  normalizePermissionGroups,
  permissionsForLevel,
  permissionsForUser,
  serializeUserPermissions,
};
