'use strict';

const PAGE = { width: 842, height: 595, margin: 42 };

function safeText(value, fallback = '') {
  const text = String(value == null ? fallback : value).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sportText(value) {
  if (value === 'softball') return '慢垒';
  if (value === 'baseball') return '棒球';
  return '综合';
}

function venueText(value) {
  if (value === 'Home') return '猎户主场';
  if (value === 'Away') return '猎户客场';
  return safeText(value, '未记录');
}

function utf16BeHex(text) {
  const buf = Buffer.from(`\ufeff${safeText(text)}`, 'utf16le');
  for (let i = 0; i < buf.length; i += 2) {
    const b = buf[i];
    buf[i] = buf[i + 1];
    buf[i + 1] = b;
  }
  return buf.toString('hex').toUpperCase();
}

function textUnits(text) {
  return Array.from(safeText(text)).reduce((sum, ch) => sum + (/[\x00-\x7F]/.test(ch) ? 0.58 : 1), 0);
}

function clipText(text, maxUnits) {
  const chars = Array.from(safeText(text));
  let units = 0;
  let out = '';
  for (const ch of chars) {
    const next = /[\x00-\x7F]/.test(ch) ? 0.58 : 1;
    if (units + next > maxUnits) return `${out}...`;
    units += next;
    out += ch;
  }
  return out;
}

function linesFor(text, maxUnits) {
  const chars = Array.from(safeText(text));
  const lines = [];
  let units = 0;
  let line = '';
  chars.forEach(ch => {
    const next = /[\x00-\x7F]/.test(ch) ? 0.58 : 1;
    if (line && units + next > maxUnits) {
      lines.push(line);
      line = ch;
      units = next;
    } else {
      line += ch;
      units += next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function pdfString(text) {
  return `<${utf16BeHex(text)}>`;
}

class PdfBuilder {
  constructor() {
    this.objects = [];
    this.catalogId = this.reserve();
    this.pagesId = this.reserve();
    this.fontId = this.reserve();
    this.cidFontId = this.reserve();
    this.fontDescriptorId = this.reserve();
    this.pages = [];
  }

  reserve() {
    this.objects.push('');
    return this.objects.length;
  }

  set(id, content) {
    this.objects[id - 1] = content;
  }

  addPage(content) {
    const contentId = this.reserve();
    const pageId = this.reserve();
    const stream = Buffer.from(content, 'utf8');
    this.set(contentId, `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`);
    this.set(pageId, [
      '<< /Type /Page',
      `/Parent ${this.pagesId} 0 R`,
      `/MediaBox [0 0 ${PAGE.width} ${PAGE.height}]`,
      `/Resources << /Font << /F1 ${this.fontId} 0 R >> >>`,
      `/Contents ${contentId} 0 R`,
      '>>',
    ].join('\n'));
    this.pages.push(pageId);
  }

  render() {
    this.set(this.catalogId, `<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`);
    this.set(this.pagesId, `<< /Type /Pages /Kids [${this.pages.map(id => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    this.set(this.fontId, `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${this.cidFontId} 0 R] >>`);
    this.set(this.cidFontId, [
      '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >>',
      `/FontDescriptor ${this.fontDescriptorId} 0 R`,
      '>>',
    ].join('\n'));
    this.set(this.fontDescriptorId, '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');

    let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    this.objects.forEach((object, index) => {
      offsets[index + 1] = Buffer.byteLength(pdf, 'binary');
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'binary');
    pdf += `xref\n0 ${this.objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= this.objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${this.catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'binary');
  }
}

class GamePdfLayout {
  constructor() {
    this.builder = new PdfBuilder();
    this.content = [];
    this.y = PAGE.height - PAGE.margin;
  }

  finishPage() {
    this.builder.addPage(this.content.join('\n'));
    this.content = [];
    this.y = PAGE.height - PAGE.margin;
  }

  ensure(height) {
    if (this.y - height >= PAGE.margin) return;
    this.finishPage();
  }

  text(text, x, y, size = 10, color = '0 0 0') {
    this.content.push(`BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm ${pdfString(text)} Tj ET`);
  }

  line(y) {
    this.content.push(`0.75 w 0.78 0.78 0.78 RG ${PAGE.margin} ${y.toFixed(1)} m ${PAGE.width - PAGE.margin} ${y.toFixed(1)} l S`);
  }

  heading(text) {
    this.ensure(38);
    this.text(text, PAGE.margin, this.y, 14, '0.08 0.12 0.18');
    this.y -= 18;
    this.line(this.y);
    this.y -= 16;
  }

  paragraph(text, size = 10) {
    linesFor(text, 82).forEach(line => {
      this.ensure(18);
      this.text(line, PAGE.margin, this.y, size, '0.18 0.22 0.3');
      this.y -= 16;
    });
  }

  table(title, columns, rows) {
    this.heading(title);
    const headerHeight = 18;
    this.ensure(headerHeight + 18);
    let x = PAGE.margin;
    columns.forEach(col => {
      this.text(col.label, x, this.y, 9, '0.36 0.4 0.48');
      x += col.width;
    });
    this.y -= headerHeight;
    this.line(this.y + 6);
    (rows.length ? rows : [[]]).forEach(row => {
      this.ensure(18);
      x = PAGE.margin;
      if (!row.length) {
        this.text('暂无记录', x, this.y, 10, '0.45 0.48 0.54');
      } else {
        columns.forEach(col => {
          const maxUnits = Math.max(4, (col.width / 10) * 1.55);
          this.text(clipText(row[col.key], maxUnits), x, this.y, 9, '0.12 0.16 0.22');
          x += col.width;
        });
      }
      this.y -= 18;
    });
    this.y -= 8;
  }

  build() {
    if (this.content.length) this.finishPage();
    return this.builder.render();
  }
}

function lineScoreRows(game) {
  const home = game.linescore?.home || [];
  const away = game.linescore?.away || [];
  const innings = Math.max(home.length, away.length, num(game.innings), 1);
  const rows = [
    { team: game.away, score: game.awayScore, totals: game.awayTotals || {}, values: away },
    { team: game.home, score: game.homeScore, totals: game.homeTotals || {}, values: home },
  ];
  return { innings, rows };
}

function rowValue(row, key) {
  if (key === 'name') return row.displayName || row.name || row.playerName || '';
  if (key === 'pos') return row.pos || row.position || '-';
  return row[key] == null || row[key] === '' ? '0' : String(row[key]);
}

function statsRows(rows, keys) {
  return (rows || []).map(row => keys.reduce((acc, key) => {
    acc[key] = rowValue(row, key);
    return acc;
  }, {}));
}

function logRows(rows) {
  return (rows || []).slice(0, 80).map(row => ({
    inning: row.inningLabel || row.halfLabel || '',
    event: row.label || row.actionLabel || row.actionKey || '比赛记录',
    bases: row.baseSummary || row.bases || '',
    score: row.score || '',
  }));
}

function createGameRecordPdf(game) {
  const layout = new GamePdfLayout();
  const title = `${safeText(game.away, '客队')} vs ${safeText(game.home, '主队')}`;
  layout.text('北京猎户座棒垒球 · 比赛记录', PAGE.margin, layout.y, 18, '0.08 0.12 0.18');
  layout.y -= 28;
  layout.text(title, PAGE.margin, layout.y, 22, '0.08 0.12 0.18');
  layout.y -= 28;
  layout.paragraph([
    `日期：${safeText(game.date, '未记录')}`,
    `项目：${sportText(game.sport)}`,
    `场地：${venueText(game.venue)}`,
    `赛事：${safeText(game.seasonName || game.season, '未关联赛事')}`,
  ].join('    '), 10);
  layout.paragraph(`比分：${safeText(game.away)} ${game.awayScore ?? 0} - ${game.homeScore ?? 0} ${safeText(game.home)}`, 12);
  if (game.mvpPlayerName || game.mvpNote) {
    layout.paragraph(`MVP：${safeText(game.mvpPlayerName, '未记录')}    备注：${safeText(game.mvpNote, '无')}`, 10);
  }
  layout.y -= 8;

  const line = lineScoreRows(game);
  const lineColumns = [{ key: 'team', label: '队伍', width: 120 }];
  for (let i = 1; i <= line.innings; i += 1) lineColumns.push({ key: `i${i}`, label: String(i), width: 34 });
  lineColumns.push({ key: 'R', label: 'R', width: 38 }, { key: 'H', label: 'H', width: 38 }, { key: 'E', label: 'E', width: 38 });
  layout.table('逐局比分', lineColumns, line.rows.map(row => {
    const record = { team: row.team, R: row.score ?? 0, H: row.totals.H ?? 0, E: row.totals.E ?? 0 };
    for (let i = 1; i <= line.innings; i += 1) record[`i${i}`] = row.values[i - 1] ?? '';
    return record;
  }));

  const battingKeys = ['name', 'pos', 'AB', 'R', 'H', '_2B', '_3B', 'HR', 'RBI', 'BB', 'SO', 'E'];
  const battingColumns = [
    { key: 'name', label: '球员', width: 104 },
    { key: 'pos', label: '守位', width: 46 },
    { key: 'AB', label: 'AB', width: 44 },
    { key: 'R', label: 'R', width: 38 },
    { key: 'H', label: 'H', width: 38 },
    { key: '_2B', label: '2B', width: 38 },
    { key: '_3B', label: '3B', width: 38 },
    { key: 'HR', label: 'HR', width: 42 },
    { key: 'RBI', label: 'RBI', width: 46 },
    { key: 'BB', label: 'BB', width: 42 },
    { key: 'SO', label: 'SO', width: 42 },
    { key: 'E', label: 'E', width: 38 },
  ];
  layout.table('猎户进攻', battingColumns, statsRows(game.batting, battingKeys));

  const pitchingKeys = ['name', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'decision'];
  const pitchingColumns = [
    { key: 'name', label: '投手', width: 112 },
    { key: 'IP', label: 'IP', width: 48 },
    { key: 'H', label: 'H', width: 42 },
    { key: 'R', label: 'R', width: 42 },
    { key: 'ER', label: 'ER', width: 42 },
    { key: 'BB', label: 'BB', width: 42 },
    { key: 'SO', label: 'SO', width: 42 },
    { key: 'HR', label: 'HR', width: 42 },
    { key: 'decision', label: '决胜', width: 58 },
  ];
  layout.table('投手记录', pitchingColumns, statsRows(game.pitching, pitchingKeys));
  layout.table('对手进攻', battingColumns, statsRows(game.oppBatting, battingKeys));
  layout.table('对手投手', pitchingColumns, statsRows(game.oppPitching, pitchingKeys));
  layout.table('事件日志', [
    { key: 'inning', label: '局面', width: 122 },
    { key: 'event', label: '事件', width: 280 },
    { key: 'bases', label: '垒位', width: 110 },
    { key: 'score', label: '比分', width: 70 },
  ], logRows(game.gameLog));

  layout.paragraph(`导出时间：${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, 8);
  return layout.build();
}

function exportFileName(game) {
  const date = safeText(game.date, 'game');
  const away = safeText(game.away, 'away').replace(/[\\/:*?"<>|]/g, '_');
  const home = safeText(game.home, 'home').replace(/[\\/:*?"<>|]/g, '_');
  return `${date}_${away}_vs_${home}_比赛记录.pdf`;
}

module.exports = {
  createGameRecordPdf,
  exportFileName,
};
