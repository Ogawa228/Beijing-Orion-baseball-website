#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PDF_ROOT = path.resolve(ROOT, '..', '2026 奥体慢投垒赛季数据');

function resolvePdftotext() {
  const candidates = [
    process.env.PDFTOTEXT,
    '/opt/homebrew/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    'pdftotext',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
      execFileSync(candidate, ['-v'], { stdio: 'ignore' });
      return candidate;
    } catch (_) {
      // Try the next candidate.
    }
  }
  throw new Error('pdftotext not found. Install poppler or set PDFTOTEXT=/path/to/pdftotext.');
}

function decodeXml(text) {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseBboxRows(pdftotext, file) {
  const xml = execFileSync(pdftotext, ['-bbox-layout', '-enc', 'UTF-8', file, '-'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const rows = [];
  let pageNo = 0;
  const pageRe = /<page\b[^>]*>([\s\S]*?)<\/page>/g;
  let pageMatch;
  while ((pageMatch = pageRe.exec(xml)) !== null) {
    pageNo += 1;
    const words = [];
    const wordRe = /<word\b([^>]*)>([\s\S]*?)<\/word>/g;
    let wordMatch;
    while ((wordMatch = wordRe.exec(pageMatch[1])) !== null) {
      const attrs = wordMatch[1];
      const attr = name => {
        const m = attrs.match(new RegExp(`${name}="([^"]+)"`));
        return m ? Number(m[1]) : 0;
      };
      const str = decodeXml(wordMatch[2]).trim();
      if (str) words.push({ x: attr('xMin'), y: attr('yMin'), str });
    }

    const bands = [];
    for (const word of words) {
      let band = bands.find(b => Math.abs(b.y - word.y) <= 3);
      if (!band) {
        band = { y: word.y, cells: [] };
        bands.push(band);
      }
      band.cells.push({ x: word.x, str: word.str });
    }

    bands.sort((a, b) => a.y - b.y);
    for (const band of bands) {
      band.cells.sort((a, b) => a.x - b.x);
      rows.push({
        page: pageNo,
        y: band.y,
        cells: band.cells,
        text: band.cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return rows;
}

function loadParser() {
  const parserPath = path.join(ROOT, 'assets/js/parser.js');
  const seedPath = path.join(ROOT, 'orion-data.json');
  if (fs.existsSync(seedPath)) {
    globalThis.OrionParserKnownPlayers = JSON.parse(fs.readFileSync(seedPath, 'utf8')).players || [];
  }
  vm.runInThisContext(fs.readFileSync(parserPath, 'utf8'), { filename: parserPath });
  return globalThis.OrionParser;
}

function parseVenue(rows) {
  for (const row of rows.slice(0, 20)) {
    if (/\bAway\b/i.test(row.text)) return 'Away';
    if (/\bHome\b/i.test(row.text)) return 'Home';
  }
  return 'Home';
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectTotals(actual, expected, label) {
  for (const key of ['R', 'H', 'E']) {
    expectEqual(actual && actual[key], expected[key], `${label}.${key}`);
  }
}

function expectIncludes(rows, names, label) {
  const got = new Set(rows.map(r => r.name));
  for (const name of names || []) {
    if (!got.has(name)) {
      throw new Error(`${label}: missing player ${name}; got ${rows.map(r => r.name).join(', ')}`);
    }
  }
}

const cases = [
  {
    file: path.join(PDF_ROOT, '2026 年奥体慢垒春季联赛/小组赛/北京慧星棒垒球队_vs_猎户座_Apr_30_2026/北京慧星棒垒球队_vs_猎户座_Apr_30_2026.pdf'),
    away: '北京慧星棒垒球队',
    home: '猎户座',
    awayScore: 9,
    homeScore: 24,
    innings: 13,
    line1Totals: { R: 9, H: 17, E: 2 },
    line2Totals: { R: 24, H: 34, E: 2 },
    battingCounts: [14, 15],
    pitchingCounts: [3, 3],
    mustInclude: { team2: ['尹程', '张学谦'] },
  },
  {
    file: path.join(PDF_ROOT, '2026 年奥体慢垒春季联赛/小组赛/猎户座_vs_劲飞青鸟_Apr_20_2026/猎户座_vs_劲飞青鸟_Apr_20_2026.pdf'),
    away: '猎户座',
    home: '劲飞青鸟',
    awayScore: 13,
    homeScore: 28,
    innings: 13,
    line1Totals: { R: 13, H: 21, E: 10 },
    line2Totals: { R: 28, H: 30, E: 8 },
    battingCounts: [15, 12],
    pitchingCounts: [3, 2],
    mustInclude: { team1: ['苏一哲'], team2: ['郝家麒'] },
  },
  {
    file: path.join(PDF_ROOT, '2026 年奥体慢垒春季联赛/小组赛/猎户座_vs_奥美老登队_May_7_2026/猎户座_vs_奥美老登队_May_7_2026.pdf'),
    away: '猎户座',
    home: '奥美老登队',
    awayScore: 22,
    homeScore: 14,
    innings: 13,
    line1Totals: { R: 22, H: 41, E: 5 },
    line2Totals: { R: 14, H: 24, E: 2 },
    battingCounts: [14, 10],
    pitchingCounts: [4, 2],
    mustInclude: { team1: ['李嘉琪'], team2: ['顾鹤天'] },
  },
  {
    file: path.join(PDF_ROOT, '2026 年奥体慢垒春季联赛/小组赛/神策_vs_猎户座_Mar_30_2026/神策_vs_猎户座_Mar_30_2026.pdf'),
    away: '神策',
    home: '猎户座',
    awayScore: 14,
    homeScore: 19,
    innings: 13,
    line1Totals: { R: 14, H: 28, E: 10 },
    line2Totals: { R: 19, H: 27, E: 4 },
    battingCounts: [13, 12],
    pitchingCounts: [3, 1],
    mustInclude: { team1: ['王竞先'], team2: ['李嘉琪'] },
  },
  {
    file: path.join(PDF_ROOT, 'zoopark （猎户座甲组）数据/ZooPark_vs_劲飞猛禽_Apr_9_2026.pdf'),
    away: 'ZooPark',
    home: '劲飞猛禽',
    awayScore: 17,
    homeScore: 14,
    innings: 14,
    line1Totals: { R: 17, H: 28, E: 7 },
    line2Totals: { R: 14, H: 29, E: 1 },
    battingCounts: [14, 11],
    pitchingCounts: [1, 1],
    mustInclude: { team1: ['李晨', '王超'], team2: ['梁奇', '安刚'] },
  },
];

function main() {
  const pdftotext = resolvePdftotext();
  const parser = loadParser();
  let passed = 0;

  for (const testCase of cases) {
    if (!fs.existsSync(testCase.file)) {
      throw new Error(`Missing fixture PDF: ${testCase.file}`);
    }
    const rows = parseBboxRows(pdftotext, testCase.file);
    const fileName = path.basename(testCase.file);
    const hdr = parser._applyFilenameHeaderHint(parser._parseScoreHeader(rows), fileName);
    if (!hdr) throw new Error(`${fileName}: header not recognized`);

    expectEqual(hdr.team1, testCase.away, `${fileName} header.away`);
    expectEqual(hdr.team2, testCase.home, `${fileName} header.home`);
    expectEqual(hdr.score1, testCase.awayScore, `${fileName} header.awayScore`);
    expectEqual(hdr.score2, testCase.homeScore, `${fileName} header.homeScore`);

    const lineScore = parser._parseLineScore(rows, hdr.team1, hdr.team2, hdr.rowIdx);
    if (!lineScore) throw new Error(`${fileName}: line score not recognized`);
    expectEqual(lineScore.innings, testCase.innings, `${fileName} innings`);
    expectTotals(lineScore.line1.totals, testCase.line1Totals, `${fileName} line1Totals`);
    expectTotals(lineScore.line2.totals, testCase.line2Totals, `${fileName} line2Totals`);

    const batting = parser._parseBattingTables(rows, lineScore.endIdx, hdr.team1, hdr.team2);
    const pitching = parser._parsePitchingTables(rows, batting.endIdx, hdr.team1, hdr.team2);
    if (typeof parser._applyFieldingErrorsToTable === 'function') {
      parser._applyFieldingErrorsToTable(batting.table1, pitching.fieldingE1, hdr.team1);
      parser._applyFieldingErrorsToTable(batting.table2, pitching.fieldingE2, hdr.team2);
    }
    expectEqual(batting.table1.length, testCase.battingCounts[0], `${fileName} batting.team1`);
    expectEqual(batting.table2.length, testCase.battingCounts[1], `${fileName} batting.team2`);
    expectEqual(pitching.table1.length, testCase.pitchingCounts[0], `${fileName} pitching.team1`);
    expectEqual(pitching.table2.length, testCase.pitchingCounts[1], `${fileName} pitching.team2`);
    expectEqual((batting.warnings || []).length, 0, `${fileName} warnings`);
    expectEqual(
      batting.table1.reduce((sum, row) => sum + (+row.E || 0), 0),
      testCase.line1Totals.E,
      `${fileName} batting.team1.E`
    );
    expectEqual(
      batting.table2.reduce((sum, row) => sum + (+row.E || 0), 0),
      testCase.line2Totals.E,
      `${fileName} batting.team2.E`
    );
    expectIncludes(batting.table1, testCase.mustInclude.team1, `${fileName} batting.team1`);
    expectIncludes(batting.table2, testCase.mustInclude.team2, `${fileName} batting.team2`);

    const game = parser._assembleGame({
      hdr,
      date: '',
      venue: parseVenue(rows),
      innings: lineScore.innings,
      line1: lineScore.line1,
      line2: lineScore.line2,
      bat1: batting.table1,
      bat2: batting.table2,
      pit1: pitching.table1,
      pit2: pitching.table2,
    }, '猎户座');
    parser.applyFilenameGameOverride(game, fileName, { orionName: '猎户座' });
    expectEqual(game.home, testCase.home, `${fileName} game.home`);
    expectEqual(game.away, testCase.away, `${fileName} game.away`);
    expectEqual(game.homeScore, testCase.homeScore, `${fileName} game.homeScore`);
    expectEqual(game.awayScore, testCase.awayScore, `${fileName} game.awayScore`);

    passed += 1;
    console.log(`✓ ${fileName}: ${testCase.awayScore}-${testCase.homeScore}, batting ${batting.table1.length}/${batting.table2.length}, pitching ${pitching.table1.length}/${pitching.table2.length}`);
  }

  console.log(`GameChanger PDF regression passed: ${passed}/${cases.length}`);
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
