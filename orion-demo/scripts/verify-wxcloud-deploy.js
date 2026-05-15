#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const CONFIG = {
  envId: process.env.WXCLOUD_ENV_ID || 'prod-d5gtkxdyu7263e95b',
  serviceName: process.env.WXCLOUD_SERVICE_NAME || 'express-knlw',
  region: process.env.WXCLOUD_REGION || '',
  healthPath: process.env.ORION_HEALTH_PATH || '/api/health',
  timeoutMs: Number(process.env.ORION_VERIFY_TIMEOUT_MS || 15000)
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--expected-version') out.expectedVersion = argv[++i];
    else if (arg === '--domain') out.domain = argv[++i];
    else if (arg === '--health-path') out.healthPath = argv[++i];
  }
  return out;
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function extractFirstJson(raw) {
  const text = stripAnsi(raw);
  for (let start = 0; start < text.length; start++) {
    const first = text[start];
    if (first !== '{' && first !== '[') continue;

    const stack = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const open = stack.pop();
        if ((ch === '}' && open !== '{') || (ch === ']' && open !== '[')) break;
        if (!stack.length) {
          const candidate = text.slice(start, i + 1);
          return JSON.parse(candidate);
        }
      }
    }
  }
  throw new Error(`No JSON payload found in wxcloud output: ${text.slice(0, 260)}`);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${result.status}: ${output}`);
  }
  return output;
}

function wxcloudJson(topic) {
  const args = [
    topic,
    '-e', CONFIG.envId,
    '-s', CONFIG.serviceName,
    '--json'
  ];
  if (CONFIG.region) args.push('--region', CONFIG.region);
  return extractFirstJson(run('wxcloud', args));
}

function parseTime(value) {
  if (!value) return 0;
  const isoish = String(value).replace(' ', 'T');
  const timestamp = Date.parse(isoish);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function versionSortValue(version) {
  const time = parseTime(version.CreatedTime || version.UpdatedTime);
  if (time) return time;
  const match = String(version.VersionName || '').match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVersionName(value) {
  if (!value) return '';
  const match = String(value).match(new RegExp(`(${escapeRegExp(CONFIG.serviceName)}-\\d+)`));
  return match ? match[1] : String(value);
}

function compareSemver(a, b) {
  const pa = String(a || '').split('.').map(n => Number(n) || 0);
  const pb = String(b || '').split('.').map(n => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function pickService(payload) {
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.find(row => row.ServerName === CONFIG.serviceName) || rows[0] || null;
}

function pickLatestVersion(payload) {
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.slice().sort((a, b) => versionSortValue(b) - versionSortValue(a))[0] || null;
}

async function fetchHealth(domain, healthPath, timeoutMs) {
  const base = String(domain || '').replace(/\/+$/, '');
  const path = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) { body = text; }
    return { url, status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cliText = run('wxcloud', ['--version']);
  const cliVersion = (cliText.match(/@wxcloud\/cli\/([0-9.]+)/) || [])[1] || '';

  const servicePayload = wxcloudJson('service:list');
  const versionPayload = wxcloudJson('version:list');
  const service = pickService(servicePayload);
  const latestVersion = pickLatestVersion(versionPayload);

  const domain = args.domain
    || (service && service.CustomDomain && service.CustomDomain !== '-' ? service.CustomDomain : '')
    || (service && service.DefaultPublicDomain)
    || '';

  const health = domain
    ? await fetchHealth(domain, args.healthPath || CONFIG.healthPath, CONFIG.timeoutMs)
    : null;

  const expectedShort = normalizeVersionName(args.expectedVersion);
  const latestShort = latestVersion ? normalizeVersionName(latestVersion.VersionName) : '';
  const checks = {
    cliAtLeast233: compareSemver(cliVersion, '2.3.3') >= 0,
    serviceFound: Boolean(service),
    serviceNormal: service ? service.Status === 'normal' : false,
    latestVersionFound: Boolean(latestVersion),
    latestVersionNormal: latestVersion ? latestVersion.Status === 'normal' : false,
    expectedVersionMatches: expectedShort ? expectedShort === latestShort : null,
    healthOk: Boolean(health && health.ok && health.body && health.body.server === 'ok' && health.body.db && health.body.db.ok === 1)
  };

  const ok = Object.values(checks).every(value => value !== false);
  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    envId: CONFIG.envId,
    serviceName: CONFIG.serviceName,
    cli: { raw: cliText, version: cliVersion },
    service: service && {
      name: service.ServerName,
      status: service.Status,
      publicAccess: service.IsPublicAccess,
      domain,
      createdTime: service.CreatedTime,
      updatedTime: service.UpdatedTime
    },
    latestVersion: latestVersion && {
      name: latestVersion.VersionName,
      status: latestVersion.Status,
      createdTime: latestVersion.CreatedTime,
      updatedTime: latestVersion.UpdatedTime
    },
    expectedVersion: args.expectedVersion || null,
    checks,
    health
  };

  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch(error => {
  console.log(JSON.stringify({
    ok: false,
    checkedAt: new Date().toISOString(),
    envId: CONFIG.envId,
    serviceName: CONFIG.serviceName,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
