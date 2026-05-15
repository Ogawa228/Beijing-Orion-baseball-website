// 球员名字归一化工具（后端版本）
//
// 简化版：覆盖 NFKC + CJK Supplement Radicals + 空白归一 + 大小写折叠。
// **未带完整 Trad→Simp 表**（前端 db.js 里那 2855 字 _TRAD2SIMP_MAP 太大）。
// TODO: 如果遇到繁简混用 bug，再把那张表搬过来；当前数据集无此问题。

// CJK Supplement Radicals → 简体（NFKC 不映射这一段，手工映射）
const RAD_MAP = {
  '⺁':'厂','⺄':'卜','⺈':'刂','⺋':'匚','⺌':'匸',
  '⺎':'卩','⺒':'又','⺔':'女','⺕':'子','⺖':'宀',
  '⺡':'弓','⺢':'彐','⺨':'忄','⺪':'扌','⺮':'氵',
  '⺱':'灬','⺷':'王','⺹':'见','⺺':'示','⺼':'纟',
  '⻂':'艹','⻊':'走','⻑':'长','⻓':'长','⻔':'门',
  '⻗':'阝','⻘':'青','⻜':'飞','⻝':'食','⻢':'马',
  '⻥':'见','⻦':'鸟','⻧':'鱼','⻩':'黄','⻫':'齐',
  '⻰':'龙','⻲':'龟',
  // 备用
  '⻢':'马','⻦':'鸟','⻩':'黄','⻑':'长','⻓':'长',
  '⻔':'门','⻘':'青','⻜':'飞','⻰':'龙','⻲':'龟',
  '⻥':'见','⻧':'角',
};

// 把任意名字归一为可比较的 key
function canonicalNameKey(s) {
  if (!s) return '';
  let n = String(s).normalize('NFKC');
  // CJK Supplement Radicals → 简体
  n = n.replace(/[⺀-⻿]/g, ch => RAD_MAP[ch] || ch);
  // 全部空白（含 NBSP / 全角空格 / 零宽字符）归一为单空格
  n = n.replace(/[\s 　​-‍﻿]+/g, ' ').trim();
  // 两个 CJK 字符之间的单空格干掉（"靳 江 山" → "靳江山"），跑两遍处理链式
  const cjkSpace = /([⺀-⿿㐀-鿿])\s+([⺀-⿿㐀-鿿])/g;
  n = n.replace(cjkSpace, '$1$2').replace(cjkSpace, '$1$2');
  // 标点剥离（中点 ·／・／•、句点 ./．、连字符 -／—／–、下划线、空白）
  n = n.replace(/[\s·・•./．\-—–_]+/g, '');
  return n.toLowerCase();
}

function parseAliases(aliases) {
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === 'string' && aliases.trim()) {
    try {
      const parsed = JSON.parse(aliases);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

// 给一个 player（可能含 aliases）返回所有 canonical key 集合
function playerNameKeys(player) {
  const keys = new Set();
  if (player?.name) keys.add(canonicalNameKey(player.name));
  for (const a of parseAliases(player?.aliases)) {
    if (a) keys.add(canonicalNameKey(a));
  }
  return keys;
}

// 在 players 列表里按名字（含 alias）查找
function findPlayerByName(players, name) {
  if (!name) return null;
  const key = canonicalNameKey(name);
  return players.find(p => playerNameKeys(p).has(key)) || null;
}

const KNOWN_PDF_NAME_FIXUPS = {
  '苏哲': '苏一哲',
  '晋': '晋飞',
  '强': '黄强',
  '陆海': '陆海龙',
  '靳江': '江山',
  '博': '马辰博',
};

// 反过来：给一个原始名字，找到注册球员的"主名 canonical key"。
// 用于聚合 game records 时把 "靳江山" 归到 "江山" 桶里。
function playerCanonicalKey(players, rawName) {
  const found = findPlayerByName(players, rawName);
  if (found) return canonicalNameKey(found.name);
  return canonicalNameKey(rawName);
}

function isSubsequence(shorter, longer) {
  if (!shorter || !longer) return false;
  let i = 0;
  for (const ch of longer) {
    if (ch === shorter[i]) i++;
    if (i >= shorter.length) return true;
  }
  return i >= shorter.length;
}

const POS_GROUPS = {
  P: ['p', '投手'],
  C: ['c', '捕手'],
  '1B': ['1b', '一垒', '一垒手'],
  '2B': ['2b', '二垒', '二垒手'],
  '3B': ['3b', '三垒', '三垒手'],
  SS: ['ss', '游击'],
  LF: ['lf', '左外野', '外野'],
  CF: ['cf', '中外野', '外野'],
  RF: ['rf', '右外野', '外野'],
  SF: ['sf', '短外野', '外野'],
  OF: ['of', '外野'],
  IF: ['if', '内野'],
};

function positionTokens(pos) {
  const raw = String(pos || '').toLowerCase();
  if (!raw) return new Set();
  const tokens = new Set();
  for (const [key, words] of Object.entries(POS_GROUPS)) {
    if (raw.includes(key.toLowerCase())) tokens.add(key);
    for (const w of words) {
      if (raw.includes(w.toLowerCase())) tokens.add(key);
    }
  }
  if (tokens.has('LF') || tokens.has('CF') || tokens.has('RF') || tokens.has('SF')) tokens.add('OF');
  if (tokens.has('1B') || tokens.has('2B') || tokens.has('3B') || tokens.has('SS')) tokens.add('IF');
  return tokens;
}

function positionMatches(player, row) {
  const rowPos = positionTokens(row?.pos || row?.position);
  const playerPos = positionTokens(player?.position);
  if (!rowPos.size || !playerPos.size) return false;
  for (const t of rowPos) if (playerPos.has(t)) return true;
  return false;
}

function rowNumber(row) {
  const n = row?.number || row?.jersey || row?.uniform || row?.['#'];
  return n == null ? '' : String(n).replace(/[^\d]/g, '');
}

function playerRecords(players) {
  const records = [];
  for (const player of players || []) {
    if (!player?.name) continue;
    records.push({ player, raw: player.name, display: player.name, key: canonicalNameKey(player.name) });
    for (const alias of parseAliases(player.aliases)) {
      if (alias) records.push({ player, raw: alias, display: player.name, key: canonicalNameKey(alias) });
    }
  }
  return records.filter(r => r.key);
}

function bestNameMatchScore(key, recordKey) {
  if (!key || !recordKey) return 0;
  if (key === recordKey) return 120;
  const gap = recordKey.length - key.length;
  if (
    key.length >= 2 &&
    gap > 0 &&
    gap <= 2 &&
    key[0] === recordKey[0] &&
    key[key.length - 1] === recordKey[recordKey.length - 1] &&
    isSubsequence(key, recordKey)
  ) {
    return 52 - gap;
  }
  return 0;
}

// 后端入库前的注册球员姓名校验。
// 只用于猎户侧 batting/pitching：把 PDF/Excel 里常见的漏字、单字截断
// 纠正回球员池主名或 alias 主名；对手侧不做强行匹配。
function resolveRegisteredPlayerName(players, rawName, row = {}) {
  if (!rawName) return '';
  const exact = findPlayerByName(players, rawName);
  if (exact) return exact.name;

  const key = canonicalNameKey(rawName);
  if (!key) return String(rawName).trim();

  const fixedTarget = KNOWN_PDF_NAME_FIXUPS[String(rawName).trim()];
  if (fixedTarget) {
    const fixed = findPlayerByName(players, fixedTarget);
    if (fixed) return fixed.name;
  }

  const number = rowNumber(row);
  if (key.length === 1 && !number) return String(rawName).trim();
  const scoredByPlayer = new Map();
  for (const rec of playerRecords(players)) {
    let score = bestNameMatchScore(key, rec.key);
    if (!score) continue;
    const pNumber = rec.player?.number == null ? '' : String(rec.player.number).replace(/[^\d]/g, '');
    if (number && pNumber && number === pNumber) score += 40;
    if (positionMatches(rec.player, row)) score += 12;

    const current = scoredByPlayer.get(rec.player.id || rec.display);
    if (!current || score > current.score) {
      scoredByPlayer.set(rec.player.id || rec.display, { player: rec.player, display: rec.display, score });
    }
  }

  const ranked = [...scoredByPlayer.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) return String(rawName).trim();

  const top = ranked[0];
  const second = ranked[1];
  const minScore = key.length === 1 ? 30 : 50;
  const isClear = !second || top.score - second.score >= (key.length === 1 ? 10 : 6);
  return top.score >= minScore && isClear ? top.display : String(rawName).trim();
}

// 是否是猎户系队伍
function isOrionTeam(teamName) {
  if (!teamName) return false;
  return /猎户|Orion|Zoo\s*Park|ZPRK/i.test(String(teamName));
}

module.exports = {
  canonicalNameKey, playerNameKeys, findPlayerByName, playerCanonicalKey,
  resolveRegisteredPlayerName, isOrionTeam,
  RAD_MAP,
};
