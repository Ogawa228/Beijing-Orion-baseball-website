// /api/site-settings/* — public site-wide settings with admin write access
//
// Public pages can read selected settings. Only admins may publish changes.

const express = require('express');
const db = require('../db');
const { wrap, requirePermission } = require('../middleware');
const { logAudit } = require('../people-helpers');

const router = express.Router();

const PLAYERS_STARFIELD_KEY = 'players-starfield';
const ALLOWED_KEYS = new Set([PLAYERS_STARFIELD_KEY]);

const PLAYERS_STARFIELD_DEFAULTS = {
  formation: 'scatter',
  path: 'or',
  year: '2026',
  yearLimit: 84,
  particleMode: 'auto',
  particleDensity: 1,
  particleBrightness: 1,
  particleRadius: 1,
  particleStrength: 1,
  particleReturn: 1,
  pathDuration: 13.6,
  breatheDuration: 10.8,
  sway: 1,
  spread: 1,
  randomSeed: 17,
};

const FORMATIONS = new Set(['scatter', 'orion', 'spiral', 'orbit', 'vline', 'year', 'random']);
const PATHS = new Set(['or', 'wave', 'orbit', 'spiral', 'random', 'none']);
const PARTICLE_MODES = new Set(['auto', 'webgl', 'css', 'off']);

let siteSettingsReady = false;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizePlayersStarfield(raw = {}) {
  const next = { ...PLAYERS_STARFIELD_DEFAULTS, ...(raw || {}) };
  if (!FORMATIONS.has(next.formation)) next.formation = PLAYERS_STARFIELD_DEFAULTS.formation;
  if (!PATHS.has(next.path)) next.path = PLAYERS_STARFIELD_DEFAULTS.path;
  if (!PARTICLE_MODES.has(next.particleMode)) next.particleMode = PLAYERS_STARFIELD_DEFAULTS.particleMode;
  next.year = String(next.year || PLAYERS_STARFIELD_DEFAULTS.year).replace(/[^\d]/g, '').slice(0, 6) || PLAYERS_STARFIELD_DEFAULTS.year;
  next.yearLimit = Math.round(clampNumber(next.yearLimit, PLAYERS_STARFIELD_DEFAULTS.yearLimit, 24, 160));
  next.particleDensity = clampNumber(next.particleDensity, PLAYERS_STARFIELD_DEFAULTS.particleDensity, 0.35, 1.8);
  next.particleBrightness = clampNumber(next.particleBrightness, PLAYERS_STARFIELD_DEFAULTS.particleBrightness, 0.35, 1.8);
  next.particleRadius = clampNumber(next.particleRadius, PLAYERS_STARFIELD_DEFAULTS.particleRadius, 0.55, 1.8);
  next.particleStrength = clampNumber(next.particleStrength, PLAYERS_STARFIELD_DEFAULTS.particleStrength, 0.4, 2.2);
  next.particleReturn = clampNumber(next.particleReturn, PLAYERS_STARFIELD_DEFAULTS.particleReturn, 0.35, 2.5);
  next.pathDuration = clampNumber(next.pathDuration, PLAYERS_STARFIELD_DEFAULTS.pathDuration, 5.6, 24);
  next.breatheDuration = clampNumber(next.breatheDuration, PLAYERS_STARFIELD_DEFAULTS.breatheDuration, 5.8, 18);
  next.sway = clampNumber(next.sway, PLAYERS_STARFIELD_DEFAULTS.sway, 0.2, 2.6);
  next.spread = clampNumber(next.spread, PLAYERS_STARFIELD_DEFAULTS.spread, 0.82, 1.28);
  next.randomSeed = Math.round(clampNumber(next.randomSeed, PLAYERS_STARFIELD_DEFAULTS.randomSeed, 1, 999999));
  return next;
}

function normalizeSettingValue(key, raw) {
  if (key === PLAYERS_STARFIELD_KEY) return normalizePlayersStarfield(raw);
  return raw || {};
}

async function ensureSiteSettingsTable() {
  if (siteSettingsReady) return;
  await db.q(`
    CREATE TABLE IF NOT EXISTS site_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      value_json JSON NOT NULL,
      updated_by VARCHAR(64) DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_updated_at (updated_at),
      INDEX idx_updated_by (updated_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  siteSettingsReady = true;
}

function parseJsonValue(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function rowToSetting(key, row) {
  const storedValue = row ? parseJsonValue(row.value_json) : null;
  return {
    key,
    value: normalizeSettingValue(key, storedValue || {}),
    updatedBy: row?.updated_by || null,
    updatedByName: row?.updated_by_name || '',
    updatedAt: row?.updated_at || null,
    createdAt: row?.created_at || null,
    isDefault: !row,
  };
}

function assertAllowedKey(key, res) {
  if (ALLOWED_KEYS.has(key)) return true;
  res.status(404).json({ error: 'not_found', message: '配置不存在' });
  return false;
}

router.get('/:key', wrap(async (req, res) => {
  const key = String(req.params.key || '').trim();
  if (!assertAllowedKey(key, res)) return;
  await ensureSiteSettingsTable();
  const row = await db.qOne(`
    SELECT s.*, u.display_name AS updated_by_name
    FROM site_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    WHERE s.setting_key = ?
  `, [key]);
  res.json({ setting: rowToSetting(key, row) });
}));

router.put('/:key', requirePermission('system:settings'), wrap(async (req, res) => {
  const key = String(req.params.key || '').trim();
  if (!assertAllowedKey(key, res)) return;
  await ensureSiteSettingsTable();

  const rawValue = req.body?.value ?? req.body?.settings ?? req.body ?? {};
  const value = normalizeSettingValue(key, rawValue);
  await db.q(`
    INSERT INTO site_settings (setting_key, value_json, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      value_json = VALUES(value_json),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
  `, [key, JSON.stringify(value), req.user.id]);

  await logAudit({
    actorUserId: req.user.id,
    action: 'site_setting_publish',
    targetType: 'site_setting',
    targetId: key,
    summary: key === PLAYERS_STARFIELD_KEY ? '发布球员页全站星阵配置' : `发布站点配置：${key}`,
    metadata: { key, value },
  }).catch(() => {});

  const row = await db.qOne(`
    SELECT s.*, u.display_name AS updated_by_name
    FROM site_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    WHERE s.setting_key = ?
  `, [key]);
  res.json({ ok: true, setting: rowToSetting(key, row) });
}));

module.exports = router;
