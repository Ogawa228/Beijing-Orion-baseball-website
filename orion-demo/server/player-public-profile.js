const db = require('./db');

let schemaReady = false;
let schemaPromise = null;

async function ensureColumn(existing, column, ddl) {
  if (existing.has(column)) return;
  try {
    await db.q(ddl);
  } catch (e) {
    if (e && e.code === 'ER_DUP_FIELDNAME') return;
    throw e;
  }
}

async function ensurePlayerPublicProfileSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const rows = await db.q(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'players'
        AND COLUMN_NAME IN ('public_display_name', 'public_avatar')
    `);
    const existing = new Set(rows.map(r => r.COLUMN_NAME));
    await ensureColumn(existing, 'public_display_name',
      "ALTER TABLE players ADD COLUMN public_display_name VARCHAR(80) DEFAULT '' AFTER photo");
    existing.add('public_display_name');
    await ensureColumn(existing, 'public_avatar',
      "ALTER TABLE players ADD COLUMN public_avatar MEDIUMTEXT DEFAULT NULL AFTER public_display_name");
    existing.add('public_avatar');
    schemaReady = true;
  })().finally(() => { schemaPromise = null; });
  return schemaPromise;
}

module.exports = { ensurePlayerPublicProfileSchema };
