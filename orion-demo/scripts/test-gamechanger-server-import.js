#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseGameChangerPdfBuffer, parseGameChangerExcelBuffer } = require('../server/gamechanger-import');

const root = path.resolve(__dirname, '..');
const fixture = path.resolve(
  root,
  '..',
  '2026 奥体慢投垒赛季数据',
  '2026 年奥体慢垒春季联赛',
  '小组赛',
  '神策_vs_猎户座_Mar_30_2026',
  '神策_vs_猎户座_Mar_30_2026.pdf'
);

async function main() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['姓名', 'POS', 'AB', 'R', 'H', 'RBI', 'BB', 'SO'],
    ['江山', 'CF', 4, 2, 3, 4, 1, 0],
    ['李嘉琪', 'SS', 3, 1, 1, 1, 0, 1],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const excelParsed = await parseGameChangerExcelBuffer(excelBuffer, {
    fileName: 'orion-summary.xlsx',
    knownPlayers: [],
    orionName: '猎户座',
  });
  assert.strictEqual(excelParsed.games.length, 1);
  assert.strictEqual(excelParsed.games[0].metadata.source, 'gamechanger_excel');
  assert.strictEqual(excelParsed.games[0].home, '猎户座');
  assert(excelParsed.games[0].batting.some(row => row.name === '江山' && row.H === 3));

  if (!fs.existsSync(fixture)) {
    console.log('GameChanger server import Excel passed; PDF skipped: fixture PDF not found');
    return;
  }
  const seedPath = path.join(root, 'orion-data.json');
  const players = fs.existsSync(seedPath)
    ? JSON.parse(fs.readFileSync(seedPath, 'utf8')).players || []
    : [];
  const parsed = await parseGameChangerPdfBuffer(fs.readFileSync(fixture), {
    fileName: path.basename(fixture),
    knownPlayers: players,
    orionName: '猎户座',
  });
  assert.strictEqual(parsed.game.away, '神策');
  assert.strictEqual(parsed.game.home, '猎户座');
  assert.strictEqual(parsed.game.awayScore, 14);
  assert.strictEqual(parsed.game.homeScore, 19);
  assert.strictEqual(parsed.game.date, '2026-03-30');
  assert.strictEqual(parsed.game.tournamentId, undefined);
  assert(parsed.game.batting.some(row => row.name === '李嘉琪'));
  assert(parsed.game.oppBatting.some(row => row.name === '王竞先'));
  assert.strictEqual(parsed.game.metadata.source, 'gamechanger_pdf');
  assert.strictEqual(parsed.filenameInfo.home, '猎户座');
  console.log('GameChanger server import passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
