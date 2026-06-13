const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_EXCEL_BYTES = 12 * 1024 * 1024;

let cachedParser = null;
let cachedPdftotext = null;
let cachedXlsx = null;

function resolvePdftotext() {
  if (cachedPdftotext) return cachedPdftotext;
  const candidates = [
    process.env.PDFTOTEXT,
    '/opt/homebrew/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    'pdftotext',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
      require('child_process').execFileSync(candidate, ['-v'], { stdio: 'ignore' });
      cachedPdftotext = candidate;
      return cachedPdftotext;
    } catch (_) {
      // Try the next candidate.
    }
  }
  const err = new Error('服务器未安装 pdftotext，暂时无法解析 GameChanger PDF');
  err.code = 'pdftotext_not_available';
  err.statusCode = 503;
  throw err;
}

function loadParser() {
  if (cachedParser) return cachedParser;
  const parserPath = path.join(ROOT, 'assets/js/parser.js');
  vm.runInThisContext(fs.readFileSync(parserPath, 'utf8'), { filename: parserPath });
  cachedParser = globalThis.OrionParser;
  if (!cachedParser) throw new Error('GameChanger parser failed to initialize');
  return cachedParser;
}

function loadXlsx() {
  if (cachedXlsx) return cachedXlsx;
  cachedXlsx = require('xlsx');
  globalThis.XLSX = cachedXlsx;
  return cachedXlsx;
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
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

function rowsFromBboxXml(xml) {
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

function parseVenue(rows) {
  for (const row of rows.slice(0, 20)) {
    if (/\bAway\b/i.test(row.text)) return 'Away';
    if (/\bHome\b/i.test(row.text)) return 'Home';
  }
  return 'Home';
}

function normalizeKnownPlayers(players) {
  return (players || []).map(player => ({
    id: player.id,
    name: player.name,
    aliases: parseAliases(player.aliases),
  })).filter(player => player.name);
}

function parseAliases(value) {
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

async function parseRowsFromPdfBuffer(buffer) {
  const pdftotext = resolvePdftotext();
  const tempName = [
    'orion-gamechanger',
    process.pid,
    Date.now(),
    Math.random().toString(36).slice(2),
  ].join('-') + '.pdf';
  const tempPath = path.join(os.tmpdir(), tempName);
  await fs.promises.writeFile(tempPath, buffer);
  try {
    const { stdout } = await execFileAsync(pdftotext, ['-bbox-layout', '-enc', 'UTF-8', tempPath, '-'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return rowsFromBboxXml(stdout);
  } finally {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

function validatePdfInput(buffer, fileName, parser) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('PDF 文件为空');
    err.statusCode = 400;
    err.code = 'empty_pdf';
    throw err;
  }
  if (buffer.length > MAX_PDF_BYTES) {
    const err = new Error('PDF 不能超过 12MB');
    err.statusCode = 413;
    err.code = 'pdf_too_large';
    throw err;
  }
  if (buffer.slice(0, 4).toString('utf8') !== '%PDF') {
    const err = new Error('请选择 GameChanger 导出的 PDF 文件');
    err.statusCode = 400;
    err.code = 'invalid_pdf';
    throw err;
  }
  if (!parser.parseGameFilename(fileName)) {
    const err = new Error('PDF 文件名应为：客队_vs_主队_Mon_DD_YYYY.pdf');
    err.statusCode = 400;
    err.code = 'invalid_game_filename';
    throw err;
  }
}

async function parseGameChangerPdfBuffer(buffer, options = {}) {
  const parser = loadParser();
  const fileName = String(options.fileName || '').trim();
  validatePdfInput(buffer, fileName, parser);
  globalThis.OrionParserKnownPlayers = normalizeKnownPlayers(options.knownPlayers || []);

  const rows = await parseRowsFromPdfBuffer(buffer);
  const hdr = parser._applyFilenameHeaderHint(parser._parseScoreHeader(rows), fileName);
  if (!hdr) {
    const err = new Error('无法识别比赛标题');
    err.statusCode = 422;
    err.code = 'game_header_not_found';
    throw err;
  }

  const lineScore = parser._parseLineScore(rows, hdr.team1, hdr.team2, hdr.rowIdx);
  if (!lineScore) {
    const err = new Error('无法识别逐局比分');
    err.statusCode = 422;
    err.code = 'line_score_not_found';
    throw err;
  }

  const batting = parser._parseBattingTables(rows, lineScore.endIdx, hdr.team1, hdr.team2);
  const pitching = parser._parsePitchingTables(rows, batting.endIdx, hdr.team1, hdr.team2);
  const fieldingWarnings = [
    ...parser._applyFieldingErrorsToTable(batting.table1, pitching.fieldingE1, hdr.team1),
    ...parser._applyFieldingErrorsToTable(batting.table2, pitching.fieldingE2, hdr.team2),
  ];

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
  }, options.orionName || '猎户座');
  parser.applyFilenameGameOverride(game, fileName, { orionName: options.orionName || '猎户座' });

  const warnings = [...(batting.warnings || []), ...fieldingWarnings];
  game.warnings = warnings;
  game.metadata = {
    ...(game.metadata || {}),
    source: 'gamechanger_pdf',
    originalFileName: fileName,
    parser: 'pdftotext_bbox',
    parsedAt: new Date().toISOString(),
    importWarnings: warnings,
  };
  return {
    game,
    filenameInfo: parser.parseGameFilename(fileName),
    rows,
    warnings,
  };
}

function validateExcelInput(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('Excel 文件为空');
    err.statusCode = 400;
    err.code = 'empty_excel';
    throw err;
  }
  if (buffer.length > MAX_EXCEL_BYTES) {
    const err = new Error('Excel 不能超过 12MB');
    err.statusCode = 413;
    err.code = 'excel_too_large';
    throw err;
  }
  if (!/\.(xlsx|xls)$/i.test(String(fileName || ''))) {
    const err = new Error('请选择 Excel 文件（.xls / .xlsx）');
    err.statusCode = 400;
    err.code = 'invalid_excel';
    throw err;
  }
}

async function parseGameChangerExcelBuffer(buffer, options = {}) {
  const parser = loadParser();
  loadXlsx();
  const fileName = String(options.fileName || '').trim();
  validateExcelInput(buffer, fileName);
  globalThis.OrionParserKnownPlayers = normalizeKnownPlayers(options.knownPlayers || []);

  const parsed = await parser.parseExcelFile({
    name: fileName,
    arrayBuffer: async () => bufferToArrayBuffer(buffer),
  }, {
    orionName: options.orionName || '猎户座',
  });
  const games = (Array.isArray(parsed?.games) ? parsed.games : [parsed])
    .filter(Boolean)
    .map(game => {
      const warnings = game.warnings || parsed.warnings || [];
      return {
        ...game,
        metadata: {
          ...(game.metadata || {}),
          source: 'gamechanger_excel',
          originalFileName: fileName,
          parser: 'sheetjs_workbook',
          parsedAt: new Date().toISOString(),
          sourceType: parsed.sourceType || game.sourceType || '',
          sourceGameId: game.sourceGameId || '',
          importWarnings: warnings,
        },
        warnings,
      };
    });
  if (!games.length) {
    const err = new Error('未解析到任何比赛');
    err.statusCode = 422;
    err.code = 'excel_game_not_found';
    throw err;
  }
  return {
    games,
    warnings: parsed.warnings || games.flatMap(game => game.warnings || []),
    sourceType: parsed.sourceType || 'excel',
  };
}

module.exports = {
  MAX_EXCEL_BYTES,
  MAX_PDF_BYTES,
  parseGameChangerExcelBuffer,
  parseGameChangerPdfBuffer,
  resolvePdftotext,
};
