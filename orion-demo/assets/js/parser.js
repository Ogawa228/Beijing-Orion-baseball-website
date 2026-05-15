/* ============================================================
   Orion Data Parser — convert GameChanger PDF / Excel into the
   box-score shape the rest of the site expects.

   Output shape (matches DB.addGame):
   {
     date, venue, innings, home, away, homeScore, awayScore,
     linescore: { home:[...], away:[...] },
     homeTotals: { R, H, E },
     awayTotals: { R, H, E },
     batting: [...],      // Orion team's batters
     oppBatting: [...],   // opponent's batters
     pitching: [...],     // Orion pitchers
     oppPitching: [...],  // opponent pitchers
     mvpPlayerName: ''    // guessed best hitter
   }
   ============================================================ */
(function(global){
  const MONTHS = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                   Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };

  // ----------------------------------------------------------
  // Row grouping — extract text items from a pdf.js PDFDocument,
  // group by y-coordinate, sort by x, return an array of logical
  // "lines" across all pages.
  // ----------------------------------------------------------
  async function extractRowsFromPdf(arrayBuffer){
    if (!global.pdfjsLib) throw new Error('pdf.js 尚未加载 — 请稍后重试');
    const pdf = await global.pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Group by rounded y-coordinate with a 2px tolerance band
      const bands = []; // each: { y, cells:[{x,str}] }
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        // Find a band within 3px of this y
        let band = bands.find(b => Math.abs(b.y - y) <= 3);
        if (!band) {
          band = { y, cells: [] };
          bands.push(band);
        }
        band.cells.push({ x, str: item.str });
      }
      // Sort bands top-to-bottom (high y first), then cells left-to-right
      bands.sort((a,b) => b.y - a.y);
      for (const band of bands) {
        band.cells.sort((a,b) => a.x - b.x);
        rows.push({
          page: p,
          y: band.y,
          cells: band.cells,
          text: band.cells.map(c => c.str).join(' ').replace(/\s+/g,' ').trim()
        });
      }
    }
    return rows;
  }

  // ----------------------------------------------------------
  // Parse the game header line: "<team1> <n1> - <n2> <team2>"
  // Returns { team1, team2, score1, score2 } or null.
  // ----------------------------------------------------------
  function parseScoreHeader(rows){
    // The header is typically in the top 6 rows (page 1) and contains
    // a pattern like "神 策 14 - 19 猎户座" or "Tigers 5 - 3 Bears"
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const txt = rows[i].text;
      // Flexible regex: team name (non-digit), digits, dash, digits, team name
      // Spaces inside team name (e.g. "神 策") are allowed.
      const m = txt.match(/^(\D+?)\s*(\d+)\s*[-–]\s*(\d+)\s+(\D.+?)$/);
      if (m) {
        const team1 = normalizeCJKText(m[1]);
        const team2 = normalizeCJKText(m[4]);
        if (team1.length <= 20 && team2.length <= 20) {
          return {
            team1,
            team2,
            score1: parseInt(m[2]),
            score2: parseInt(m[3]),
            rowIdx: i
          };
        }
      }
      // Some text extractors split the title after the second score:
      //   "Zoo Park 17 - 14"
      //   "劲 猛禽"
      // This is different from the score-only fallback below because team1
      // is already present on the score row while team2 lives on the next row.
      const partial = txt.match(/^(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s*$/);
      if (partial) {
        for (const j of [i + 1, i + 2, i - 1]) {
          if (j < 0 || j >= Math.min(rows.length, 15)) continue;
          const team2Raw = rows[j].text;
          if (!team2Raw || /\d/.test(team2Raw)) continue;
          if (/^(Home|Away|BATTING|PITCHING|HIGHLIGHTS)\b/i.test(team2Raw)) continue;
          const team1 = normalizeCJKText(partial[1]);
          const team2 = normalizeCJKText(team2Raw);
          if (team1 && team2 && team1.length <= 30 && team2.length <= 30) {
            return {
              team1,
              team2,
              score1: parseInt(partial[2]),
              score2: parseInt(partial[3]),
              rowIdx: Math.min(i, j)
            };
          }
        }
      }
    }

    // Some extractors split the visual title into two rows:
    //   "9 - 24"
    //   "北京慧星棒垒球队    猎户座"
    // The parser should still recover the header by pairing the score row with
    // the nearest row that looks like two team-name blocks.
    const topN = Math.min(rows.length, 20);
    for (let i = 0; i < topN; i++) {
      const score = rows[i].text.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!score) continue;
      for (const j of [i - 2, i - 1, i + 1, i + 2, i + 3]) {
        if (j < 0 || j >= topN) continue;
        const teams = splitTeamNameRow(rows[j]);
        if (!teams) continue;
        return {
          team1: teams.team1,
          team2: teams.team2,
          score1: parseInt(score[1]),
          score2: parseInt(score[2]),
          rowIdx: Math.min(i, j)
        };
      }
    }
    return null;
  }

  function splitTeamNameRow(row) {
    if (!row || !row.cells || row.cells.length < 2) return null;
    if (/^(BATTING|PITCHING|HIGHLIGHTS)\b/i.test(row.text)) return null;
    if (/\b(Home|Away)\b/i.test(row.text)) return null;
    if (/\b(AB|RBI|BB|SO|IP|ER)\b/.test(row.text)) return null;

    const cells = row.cells
      .filter(c => c && c.str && !/^\d+$/.test(c.str) && !/^[-–]$/.test(c.str))
      .sort((a,b) => a.x - b.x);
    if (cells.length < 2) return null;

    let splitAt = -1, bestGap = -Infinity;
    for (let k = 0; k < cells.length - 1; k++) {
      const gap = cells[k + 1].x - cells[k].x;
      if (gap > bestGap) {
        bestGap = gap;
        splitAt = k + 1;
      }
    }
    if (splitAt <= 0 || splitAt >= cells.length) return null;

    const team1 = normalizeCJKText(cells.slice(0, splitAt).map(c => c.str).join(' '));
    const team2 = normalizeCJKText(cells.slice(splitAt).map(c => c.str).join(' '));
    if (!team1 || !team2) return null;
    if (team1.length > 30 || team2.length > 30) return null;
    return { team1, team2 };
  }

  // Parse a date like "Monday March 30, 2026" → "2026-03-30"
  function parseDate(rows){
    for (const r of rows.slice(0, 20)) {
      const m = r.text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (m) {
        const mon = MONTHS[m[2].slice(0,3)];
        if (mon) return `${m[4]}-${mon}-${m[3].padStart(2,'0')}`;
      }
      // Alternative: ISO-ish
      const m2 = r.text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
    }
    return '';
  }

  function parseVenue(rows){
    for (const r of rows.slice(0, 20)) {
      if (/\bAway\b/i.test(r.text)) return 'Away';
      if (/\bHome\b/i.test(r.text)) return 'Home';
    }
    return 'Home';
  }

  // ----------------------------------------------------------
  // Parse the line score table. Looks for a row of inning numbers
  // (1 2 3 ... R H E) followed by two team rows of numbers.
  // Returns { innings, home:[...], away:[...], homeTotals, awayTotals }.
  // Note: we don't yet know which of the two lines is home vs away;
  // that's determined later by the venue + team order.
  // ----------------------------------------------------------
  function parseLineScore(rows, team1, team2, startIdx){
    // Find header row — a row whose cells are "1 2 3 ... R H E"
    let headerIdx = -1;
    for (let i = startIdx; i < Math.min(rows.length, startIdx + 30); i++) {
      // Match any row that starts with "1 2 3" and ends with "R H E" (order doesn't matter)
      const cells = rows[i].text.split(/\s+/).filter(Boolean);
      if (cells.length >= 5 && cells[0] === '1' && cells[1] === '2' && cells.includes('R') && cells.includes('H') && cells.includes('E')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) return null;

    const hdrCells = rows[headerIdx].text.split(/\s+/).filter(Boolean);
    // Count innings = number of numeric entries before R
    const rIdx = hdrCells.indexOf('R');
    const innings = rIdx;  // indices 0..rIdx-1 are innings 1..N

    // Helper to parse a team line — text should be: <team> <n> <n> ... <R> <H> <E>
    function parseTeamLine(row){
      let txt = row.text;
      // Strip team name — allow name with spaces
      // Try to match the passed-in team names first
      let name = '';
      for (const t of [team1, team2]) {
        if (t && txt.startsWith(t)) {
          name = t;
          txt = txt.slice(t.length).trim();
          break;
        }
        // Try with flexible whitespace in the stored team name
        const flexName = t.replace(/\s+/g, '\\s*');
        const re = new RegExp('^' + flexName, '');
        if (t && re.test(txt)) {
          const m2 = txt.match(re);
          name = t;
          txt = txt.slice(m2[0].length).trim();
          break;
        }
      }
      if (!name) {
        // Fall back: consume non-numeric prefix
        const m = txt.match(/^([^\d]+?)\s+(\d|X)/);
        if (!m) return null;
        name = m[1].trim();
        txt = txt.slice(m[1].length).trim();
      }
      const cells = txt.split(/\s+/).filter(Boolean);
      if (cells.length < innings + 3) return null; // need innings + R + H + E
      const linescore = cells.slice(0, innings).map(v => /^\d+$/.test(v) ? +v : v); // keep 'X' as-is
      const totals = {
        R: +cells[innings] || 0,
        H: +cells[innings+1] || 0,
        E: +cells[innings+2] || 0
      };
      return { name, linescore, totals };
    }

    // Rows right after the header contain the two team lines
    let line1 = null, line2 = null, lastTeamRow = headerIdx;
    for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 8); i++) {
      const parsed = parseTeamLine(rows[i]);
      if (parsed) {
        lastTeamRow = i;
        if (!line1) line1 = parsed;
        else if (!line2) { line2 = parsed; break; }
      }
    }
    if (!line1 || !line2) return null;
    return { innings, line1, line2, endIdx: lastTeamRow + 1 };
  }


  // Detect which team's data is on the left vs right side of a side-by-side
  // column-header row. Returns true if the LEFT side belongs to team1 (i.e.
  // table1 ordering matches header ordering); false if sides are swapped.
  // Strategy: gather all CJK / Latin name fragments before the first stat
  // column (left team) and between left's last stat column + right's first
  // (right team), normalize, then fuzzy-match against team1 / team2.
  function detectLeftIsTeam1(hdrRow, columnXs, statColNames, team1, team2) {
    const sortedX = (columnXs[statColNames[0]] || []).slice().sort((a,b)=>a-b);
    if (sortedX.length < 2) return true; // not side-by-side, irrelevant
    const leftStatStart = sortedX[0];
    const rightStatStart = sortedX[1];
    const STAT = new RegExp('^(' + statColNames.join('|') + ')$');
    let leftBuf = '', rightBuf = '';
    for (const c of hdrRow.cells) {
      if (STAT.test(c.str)) continue;
      if (c.x < leftStatStart - 2) leftBuf += c.str;
      else if (c.x > leftStatStart && c.x < rightStatStart - 2) rightBuf += c.str;
    }
    const norm = s => normalizeCJKText(s);
    const L = norm(leftBuf), R = norm(rightBuf);
    const T1 = norm(team1), T2 = norm(team2);
    // Score: how well does L match team1 vs team2?
    const overlap = (a, b) => {
      if (!a || !b) return 0;
      // Count common 2-char windows (or char count for short strings)
      if (a.length < 2 || b.length < 2) return teamNamesLookSame(a, b) ? 1 : 0;
      let n = 0;
      for (let i = 0; i + 2 <= a.length; i++) {
        if (b.includes(a.slice(i, i + 2))) n++;
      }
      return n;
    };
    const lT1 = overlap(L, T1) + overlap(T1, L);
    const lT2 = overlap(L, T2) + overlap(T2, L);
    const rT1 = overlap(R, T1) + overlap(T1, R);
    const rT2 = overlap(R, T2) + overlap(T2, R);
    // If signal is decisive, return based on it; else default to true (no swap)
    if ((lT1 > lT2 || rT2 > rT1) && (lT1 + rT2) > (lT2 + rT1)) return true;
    if ((lT2 > lT1 || rT1 > rT2) && (lT2 + rT1) > (lT1 + rT2)) return false;
    return true;
  }

  // ----------------------------------------------------------
  // Parse a batting table. We look for a "BATTING" label row,
  // then expect two tables side by side OR sequentially.
  // Each table row is: <name (pos)>  AB  R  H  RBI  BB  SO
  // ----------------------------------------------------------
  function parseBattingTables(rows, startIdx, team1, team2){
    // Find the BATTING label
    let battingIdx = -1;
    for (let i = startIdx; i < rows.length; i++) {
      if (/^BATTING$/i.test(rows[i].text) || /^BATTING\b/i.test(rows[i].text)) {
        battingIdx = i;
        break;
      }
    }
    if (battingIdx < 0) return { table1: [], table2: [], endIdx: startIdx };

    // Locate column header "AB R H RBI BB SO"
    let colHdrIdx = -1;
    for (let i = battingIdx; i < Math.min(rows.length, battingIdx + 10); i++) {
      const txt = rows[i].text;
      if (/AB\s+R\s+H\s+RBI\s+BB\s+SO/i.test(txt)) {
        colHdrIdx = i;
        break;
      }
    }
    if (colHdrIdx < 0) return { table1: [], table2: [], endIdx: battingIdx };

    // From header row, record the x positions of each stat column so we can
    // distinguish left-table vs right-table when they appear on the same row.
    const hdrRow = rows[colHdrIdx];
    const columnXs = {};
    for (const cell of hdrRow.cells) {
      if (/^(AB|R|H|RBI|BB|SO)$/.test(cell.str)) {
        if (!columnXs[cell.str]) columnXs[cell.str] = [];
        columnXs[cell.str].push(cell.x);
      }
    }
    // If each stat column has 2 x-positions, this page has SIDE-BY-SIDE tables
    const sideBySide = (columnXs.AB || []).length >= 2;

    // ===== 计算 midX 一次（提到循环外）=====
    let midX = null;
    if (sideBySide) {
      const STAT_COLS = ['AB','R','H','RBI','BB','SO'];
      let leftMaxStatX = -Infinity, rightMinStatX = Infinity;
      for (const k of STAT_COLS) {
        const xs = (columnXs[k] || []).slice().sort((a,b)=>a-b);
        if (xs.length >= 2) {
          if (xs[0] > leftMaxStatX) leftMaxStatX = xs[0];
          if (xs[1] < rightMinStatX) rightMinStatX = xs[1];
        }
      }
      let rightTeamX = rightMinStatX;
      for (const c of hdrRow.cells) {
        if (c.x > leftMaxStatX + 2 && c.x < rightMinStatX - 2) {
          rightTeamX = Math.min(rightTeamX, c.x);
        }
      }
      midX = (leftMaxStatX + rightTeamX) / 2;
    }

    // ===== 状态机扫描：球员行 → Totals → footer（可能多行续接，直到 PITCHING）=====
    //
    // 之前老 bug：footer 收集只匹配 ^KEY:，导致续行（"... TB: 后接 2B: ..."）漏掉；
    // 而且 side-by-side 时整行拼接，左队 TB 会把右队 2B 吞掉。
    //
    // 新策略：
    //   ① footer 状态 per-side 单独维护（leftInFooter / rightInFooter）
    //   ② 一旦某边出现 KEY:，本边切到 footer 模式，后续所有 cells 全收集进去
    //   ③ 不依赖逗号断句 — 后面用 "key-span" 扫描整段文本
    //   ④ side-by-side 时按 midX 把每行 cells 拆到 leftFooterCells / rightFooterCells
    const FOOTER_KEYS_LIST = ['HR','TB','1B','2B','3B','SF','SB','LOB','DP','E','HBP','IBB','GIDP','CS','PB','SH','SAC'];
    const FOOTER_LINE_RE = /^(?:1B|2B|3B|HR|TB|SF|SB|LOB|DP|E|HBP|IBB|GIDP|CS|PB|SH|SAC)\s*:/i;
    const FOOTER_ANYWHERE_RE = /\b(?:1B|2B|3B|HR|TB|SF|SB|LOB|DP|E|HBP|IBB|GIDP|CS|PB|SH|SAC)\s*:/i;

    const rawRows = [];
    const leftFooterCells = [];
    const rightFooterCells = [];
    let singleFooterCells = [];  // 非 side-by-side 时用
    const footerState = { left: false, right: false, single: false };

    for (let i = colHdrIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const txt = row.text;
      if (/^PITCHING\b/i.test(txt)) break;
      if (/^BATTING$|^PITCHING$/i.test(txt)) break;

      if (!sideBySide) {
        // 单表布局
        if (footerState.single || FOOTER_ANYWHERE_RE.test(txt)) {
          footerState.single = true;
          singleFooterCells.push(...row.cells);
          continue;
        }
        const isTotals = /^Totals\b/i.test(txt);
        rawRows.push({ row, leftTxt: '', rightTxt: '', singleTxt: txt, leftCells: [], rightCells: [], isTotals });
        continue;
      }

      // ===== side-by-side =====
      const lCells = row.cells.filter(c => c.x < midX);
      const rCells = row.cells.filter(c => c.x >= midX);
      const lTxt = lCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim();
      const rTxt = rCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim();

      const lEnterFooter = !footerState.left && FOOTER_ANYWHERE_RE.test(lTxt);
      const rEnterFooter = !footerState.right && FOOTER_ANYWHERE_RE.test(rTxt);
      if (lEnterFooter) footerState.left = true;
      if (rEnterFooter) footerState.right = true;

      // 左边：footer 模式下吃 cells；否则当 player 行
      if (footerState.left) {
        leftFooterCells.push(...lCells);
      }
      // 右边：同理
      if (footerState.right) {
        rightFooterCells.push(...rCells);
      }

      // 只有非 footer 那边算 player 行；如果两边都在 footer，跳过整行
      if (!footerState.left || !footerState.right) {
        rawRows.push({
          row,
          leftTxt: footerState.left ? '' : lTxt,
          rightTxt: footerState.right ? '' : rTxt,
          leftCells: footerState.left ? [] : lCells,
          rightCells: footerState.right ? [] : rCells,
          isTotals: false,  // 单独 per-side 检测
        });
      }
    }

    // ===== 解析 player 行 =====
    const table1 = [], table2 = [];
    for (const r of rawRows) {
      if (!sideBySide) {
        const isTotals = r.isTotals;
        const parsed = parseBattingRow(r.singleTxt, isTotals);
        if (parsed) table1.push(parsed);
        continue;
      }
      const leftIsTotals  = /^Totals\b/i.test(r.leftTxt);
      const rightIsTotals = /^Totals\b/i.test(r.rightTxt);
      const leftRow  = r.leftTxt  ? parseBattingRow(r.leftTxt,  leftIsTotals)  : null;
      const rightRow = r.rightTxt ? parseBattingRow(r.rightTxt, rightIsTotals) : null;
      if (leftRow)  table1.push(leftRow);
      if (rightRow) table2.push(rightRow);
    }

    // ===== 解析 footer：每边独立 key-span 扫描 =====
    const leftFooterText  = sideBySide
      ? leftFooterCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim()
      : singleFooterCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim();
    const rightFooterText = sideBySide
      ? rightFooterCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim()
      : '';
    const leftFooters  = parseFootersByKeySpan(leftFooterText);
    const rightFooters = parseFootersByKeySpan(rightFooterText);

    // ===== Side detection + swap（含 footer 同步交换） =====
    let outTable1 = table1, outTable2 = table2;
    let outLeftFooters = leftFooters, outRightFooters = rightFooters;
    if (sideBySide) {
      const leftIsTeam1 = detectLeftIsTeam1(hdrRow, columnXs, ['AB','R','H','RBI','BB','SO'], team1, team2);
      if (!leftIsTeam1) {
        outTable1 = table2; outTable2 = table1;
        outLeftFooters = rightFooters; outRightFooters = leftFooters;
      }
    } else {
      // 单表只有 left footer
      outLeftFooters = leftFooters; outRightFooters = [];
    }

    // ===== 反填到对应表 + 校验 =====
    const w1 = applyHittingFootersToTable(outTable1, outLeftFooters, team1);
    const w2 = applyHittingFootersToTable(outTable2, outRightFooters, team2);
    const warnings = [...(w1||[]), ...(w2||[])];

    // Find where batting section ends
    let endIdx = colHdrIdx + 1 + rawRows.length;
    return { table1: outTable1, table2: outTable2, endIdx, sideBySide, warnings };
  }

  // ============================================================
  // Footer 解析：从一整段 footer 文本（已 per-side 切好）按"key-span"扫描，
  // 把所有 2B:/3B:/HR:/TB: ... 的位置找出来，每个 key 的 payload =
  // 从该 key 末尾到 *下一个 key* 开头之间的文本。不依赖逗号断句，
  // 所以即便 PDF 抽出来是 "TB: 2B: 靳江山..." 这种无逗号粘连，也能正确切开。
  // ============================================================
  function parseFootersByKeySpan(text) {
    if (!text) return [];
    const KEYS = ['HR','TB','1B','2B','3B','SF','SB','LOB','DP','E','HBP','IBB','GIDP','CS','PB','SH','SAC'];
    // 找出所有 KEY: 的位置
    const positions = [];
    for (const k of KEYS) {
      // \b 在 JS 里只识别 ASCII word；KEY 全是 ASCII 所以稳。
      const re = new RegExp(`\\b${k}\\s*:`, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        positions.push({ kind: k.toUpperCase(), start: m.index, payloadStart: m.index + m[0].length });
      }
    }
    positions.sort((a,b) => a.start - b.start);
    // 重叠去重（如 "2B" 和 "B" 都在某些 key 里时，可能 false positive；这里 KEYS 都是独立 token 所以不会）
    const result = [];
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      // 下一个 key 的 start 之前的全部文本就是 payload
      const nextStart = positions[i+1]?.start ?? text.length;
      const payload = text.slice(p.payloadStart, nextStart).trim().replace(/[,，]\s*$/, '').trim();
      result.push({ kind: p.kind, payload });
    }
    return result;
  }

  // 把"NAME N" / "NAME(N)" / 单独 NAME 的 list 拆出来。
  // 返回 [{name, n}, ...]
  function splitNameCountList(payload) {
    const items = payload.replace(/[，、]/g, ',').split(',').map(s => s.trim()).filter(Boolean);
    const result = [];
    for (const item of items) {
      let name = item, n = 1;
      let m = item.match(/^(.+?)\s*[（(]\s*(\d+)\s*[）)]\s*$/);
      if (m) { name = m[1]; n = +m[2] || 1; }
      else {
        m = item.match(/^(.+?)\s+(\d+)\s*$/);
        if (m) { name = m[1]; n = +m[2] || 1; }
      }
      name = String(name || '').trim();
      if (name) result.push({ name, n });
    }
    return result;
  }

  function footerNameKey(raw) {
    return normalizeName(raw).replace(/[,\s，、:：]/g, '');
  }

  function findFooterTarget(table, rawName) {
    const key = footerNameKey(rawName);
    if (!key) return null;
    const rows = (table || []).map(r => ({ row: r, key: footerNameKey(r.name) })).filter(x => x.key);
    return rows.find(x => x.key === key)?.row
      || rows.find(x => key.length >= 2 && (x.key.includes(key) || key.includes(x.key)))?.row
      || null;
  }

  function assignFooterStat(target, field, value, warnings, teamName, label) {
    if (!target || !field) return;
    if (!target._footerAssignedStats) {
      Object.defineProperty(target, '_footerAssignedStats', {
        value: {},
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    const seen = target._footerAssignedStats;
    if (seen[field] && target[field] !== value) {
      warnings.push(`[${teamName||'team'}] ${target.name}: footer ${label} 重复且数值不一致：${target[field]} / ${value}`);
    }
    seen[field] = true;
    target[field] = value;
  }

  // Footer payloads in GameChanger PDFs are not reliable CSV. Depending on the
  // PDF text flow, commas may disappear and a payload can become:
  //   "靳江山 韩绪 张睿奇 贾天义 2 刘子龙 ..."
  // Splitting only by comma misses nearly everything. The robust path is to
  // scan the payload against names already parsed from the table, then read an
  // optional count immediately after each matched name.
  function extractFooterItems(payload, table) {
    const normPayload = normalizeCJKText(payload || '').replace(/[，、]/g, ',');
    const baseCandidates = (table || [])
      .map(r => ({ name: r.name, key: footerNameKey(r.name), alias: false }))
      .filter(x => x.key && x.key.length >= 1);
    const aliasCounts = new Map();
    for (const c of baseCandidates) {
      if (c.key.length < 3) continue;
      for (let i = 1; i < c.key.length - 1; i++) {
        const alias = c.key.slice(0, i) + c.key.slice(i + 1);
        if (alias.length >= 2) aliasCounts.set(alias, (aliasCounts.get(alias) || 0) + 1);
      }
    }
    const candidates = baseCandidates.flatMap(c => {
      const list = [c];
      if (c.key.length >= 3) {
        for (let i = 1; i < c.key.length - 1; i++) {
          const alias = c.key.slice(0, i) + c.key.slice(i + 1);
          if (alias.length >= 2 && aliasCounts.get(alias) === 1 && alias !== c.key) {
            list.push({ name: c.name, key: alias, alias: true });
          }
        }
      }
      return list;
    }).sort((a,b) => (b.key.length - a.key.length) || ((a.alias ? 1 : 0) - (b.alias ? 1 : 0)));

    const used = [];
    const scanned = [];
    const overlaps = (a, b) => a.start < b.end && b.start < a.end;

    for (const c of candidates) {
      let from = 0;
      while (from < normPayload.length) {
        const idx = normPayload.indexOf(c.key, from);
        if (idx < 0) break;
        const interval = { start: idx, end: idx + c.key.length };
        from = idx + Math.max(1, c.key.length);
        if (c.key.length === 1) {
          const before = idx > 0 ? normPayload[idx - 1] : '';
          const after = normPayload.slice(interval.end);
          const beforeOk = !before || /[\s,，、:：]/.test(before);
          const afterOk =
            /^\s*(?:[（(]?\s*\d|[,，、]|$)/.test(after)
            || /^\s+(?:pro|asst|sub|mgr|coach|alt)\b\.?\s*[)）]?\s*(?:\d|[,，、]|$)/i.test(after)
            || /^\s*[\u2E80-\u2FFF\u3400-\u9FFF]\s*(?:[（(]|[,，、]|$)/.test(after);
          if (!beforeOk || !afterOk) continue;
        }
        if (used.some(u => overlaps(u, interval))) continue;

        let after = normPayload.slice(interval.end);
        // Footer names can carry GameChanger suffixes too:
        //   "梁奇 Pro 3" / "安刚 #42 2"
        // Skip those identity tags before reading the actual count.
        after = after
          .replace(/^\s+(?:pro|asst|sub|mgr|coach|alt)\b\.?/i, '')
          .replace(/^\s*#\s*\d{1,3}\b/, '')
          .replace(/^\s*[)）]/, '');
        const m = after.match(/^\s*(?:[（(]\s*(\d+)\s*[）)]|(\d+))?/);
        const n = m && (m[1] || m[2]) ? (+((m[1] || m[2])) || 1) : 1;
        used.push(interval);
        scanned.push({ name: c.name, n, _start: idx });
      }
    }

    if (scanned.length) return scanned.sort((a,b) => a._start - b._start);
    return splitNameCountList(payload);
  }

  // 把 footer 反填到 *某一个* 表（per-side）。
  // 同时跟踪 TB 用于校验；返回的 warnings[] 给上游展示。
  function applyHittingFootersToTable(table, footers, teamName) {
    if (!table || !table.length) return [];
    // 初始化字段；标记 _hasGraded 表示这个 row 走了分级路径
    for (const r of table) {
      if (r._1B == null) r._1B = 0;
      if (r._2B == null) r._2B = 0;
      if (r._3B == null) r._3B = 0;
      if (r.HR  == null) r.HR  = 0;
      if (r._TB == null) r._TB = null;  // null 表示没从 footer 读到 TB
    }
    if (!footers || !footers.length) return [];
    const keyOf = (s) => normalizeCJKText(s).trim();
    const warnings = [];

    for (const f of footers) {
      const items = extractFooterItems(f.payload, table);
      for (const it of items) {
        const key = keyOf(it.name);
        if (!key) continue;
        if (/^\d+$/.test(key)) continue;
        const target = findFooterTarget(table, it.name);
        if (!target) {
          // 名字在 batting 行里找不到 — 留 warning
        if (['1B','2B','3B','HR','TB','SB','CS','HBP','IBB','SF','SH','SAC','GIDP','E'].includes(f.kind)) {
            warnings.push(`[${teamName||'team'}] footer ${f.kind} 提到「${it.name}」但 batting 行没这个人`);
          }
          continue;
        }
        if (f.kind === '1B')      assignFooterStat(target, '_1B', it.n, warnings, teamName, '1B');
        else if (f.kind === '2B') assignFooterStat(target, '_2B', it.n, warnings, teamName, '2B');
        else if (f.kind === '3B') assignFooterStat(target, '_3B', it.n, warnings, teamName, '3B');
        else if (f.kind === 'HR') assignFooterStat(target, 'HR', it.n, warnings, teamName, 'HR');
        else if (f.kind === 'TB') {
          assignFooterStat(target, 'TB', it.n, warnings, teamName, 'TB');
          target._TB = target.TB;
        }
        else if (f.kind === 'SB')   assignFooterStat(target, 'SB', it.n, warnings, teamName, 'SB');
        else if (f.kind === 'CS')   assignFooterStat(target, 'CS', it.n, warnings, teamName, 'CS');
        else if (f.kind === 'HBP')  assignFooterStat(target, 'HBP', it.n, warnings, teamName, 'HBP');
        else if (f.kind === 'IBB')  assignFooterStat(target, 'IBB', it.n, warnings, teamName, 'IBB');
        else if (f.kind === 'SF')   assignFooterStat(target, 'SF', it.n, warnings, teamName, 'SF');
        else if (f.kind === 'SH' || f.kind === 'SAC') assignFooterStat(target, 'SH', it.n, warnings, teamName, f.kind);
        else if (f.kind === 'GIDP') assignFooterStat(target, 'GIDP', it.n, warnings, teamName, 'GIDP');
        else if (f.kind === 'E')    assignFooterStat(target, 'E', it.n, warnings, teamName, 'E');
      }
    }

    // 后处理：_1B = H - _2B - _3B - HR（限制 ≥ 0）+ 校验 TB 一致性
    for (const r of table) {
      const h = +r.H || 0;
      const extras = (+r._2B||0) + (+r._3B||0) + (+r.HR||0);
      const computed1B = Math.max(0, h - extras);
      if (r._footerAssignedStats && r._footerAssignedStats._1B) {
        if (r._1B !== computed1B) {
          warnings.push(`[${teamName||'team'}] ${r.name}: footer 给的 1B=${r._1B}，但 H-2B-3B-HR=${computed1B}`);
        }
      } else {
        r._1B = computed1B;
      }
      // 校验：H = 1B + 2B + 3B + HR
      if (h !== r._1B + (+r._2B||0) + (+r._3B||0) + (+r.HR||0)) {
        warnings.push(`[${teamName||'team'}] ${r.name}: H=${h} ≠ 1B(${r._1B})+2B(${r._2B})+3B(${r._3B})+HR(${r.HR})`);
      }
      // 校验：TB = 1B + 2*2B + 3*3B + 4*HR（仅当 footer 给了 TB）
      const computedTB = r._1B + 2*(+r._2B||0) + 3*(+r._3B||0) + 4*(+r.HR||0);
      if (r._TB != null) {
        if (r._TB !== computedTB) {
          // Common PDF artifact: the TB payload contains "Name 2" but the
          // count is separated from the name by stray glyphs, so scanning reads
          // the default count 1. If hit grades give a coherent larger TB, use
          // the computed value rather than surfacing a false-positive warning.
          if (r._TB === 1 && computedTB > 1) {
            r._TB = computedTB;
            r.TB = computedTB;
          } else {
            warnings.push(`[${teamName||'team'}] ${r.name}: footer 给的 TB=${r._TB}，但 1B+2*2B+3*3B+4*HR=${computedTB}（不一致 → footer 解析可能有错）`);
          }
        }
      }
      if (r.TB == null) r.TB = computedTB;
    }
    if (warnings.length && typeof console !== 'undefined') {
      for (const w of warnings) console.warn('[parser]', w);
    }
    return warnings;
  }

  function applyFieldingErrorsToTable(table, footers, teamName) {
    if (!table || !table.length || !footers || !footers.length) return [];
    for (const r of table) {
      if (r.E == null) r.E = 0;
    }
    const warnings = [];
    for (const raw of footers) {
      const parsed = parseFootersByKeySpan(raw).filter(f => f.kind === 'E');
      for (const f of parsed) {
        const items = extractFooterItems(f.payload, table);
        for (const it of items) {
          const target = findFooterTarget(table, it.name);
          if (!target) {
            warnings.push(`[${teamName||'team'}] fielding E 提到「${it.name}」但 batting 行没这个人`);
            continue;
          }
          assignFooterStat(target, 'E', it.n, warnings, teamName, 'E');
        }
      }
    }
    if (warnings.length && typeof console !== 'undefined') {
      for (const w of warnings) console.warn('[parser]', w);
    }
    return warnings;
  }

  // GameChanger PDFs render some Chinese characters as CJK Radicals
  // (U+2E80–U+2FDF) instead of normal CJK Unified Ideographs.
  // `String.normalize('NFKC')` handles the Kangxi block (U+2F00–U+2FDF),
  // but the Supplement block (U+2E80–U+2EFF, simplified-Chinese radicals)
  // is intentionally NOT mapped by NFKC — we map it manually here.
  // Coverage extended from observation across all 5 sample PDFs:
  // ⻰ ⻜ ⻩ ⻢ ⻘ ⻦ + likely-future-needed simplified-radicals.
  const CJK_RADICAL_MAP = {
    '⺁':'厂','⺄':'卜','⺈':'刂','⺋':'匚','⺌':'匸',
    '⺎':'卩','⺒':'又','⺔':'女','⺕':'子','⺖':'宀',
    '⺡':'弓','⺢':'彐','⺨':'忄','⺪':'扌','⺮':'氵',
    '⺱':'灬','⺷':'王','⺹':'见','⺺':'示','⺼':'纟',
    '⻂':'艹','⻊':'走','⻑':'长','⻓':'长','⻔':'门',
    '⻗':'阝','⻘':'青','⻜':'飞','⻝':'食','⻢':'马',
    '⻥':'见','⻦':'鸟','⻧':'鱼','⻩':'黄','⻫':'齐',
    '⻰':'龙','⻲':'龟',
  };

  // Normalize player name — handles PDF text-extraction artifacts:
  // ① CJK Radicals (U+2F00-U+2FDF Kangxi via NFKC, U+2E80-U+2EFF Supplement via map)
  // ② Whitespace variants (NBSP / 全角 / zero-width)
  // ③ GameChanger suffixes ("pro", "asst", …) and trailing jersey numbers
  // ④ Stray spaces between consecutive CJK characters (PDF text-flow artifact)
  // General CJK text normalization — used for both player names and team names.
  // Order matters: NFKC must run before radical map (NFKC may emit chars our
  // map doesn't expect); whitespace canonicalization must run before
  // CJK-space-stripping (which only matches single spaces).
  function normalizeCJKText(raw) {
    if (!raw) return '';
    let n = String(raw).normalize('NFKC');
    n = n.replace(/[\u2E80-\u2EFF]/g, ch => CJK_RADICAL_MAP[ch] || ch);
    n = n.replace(/[\s\u00A0\u3000\u200B-\u200D\uFEFF]+/g, ' ').trim();
    const cjkSpace = /([\u2E80-\u2FFF\u3400-\u9FFF])\s+([\u2E80-\u2FFF\u3400-\u9FFF])/g;
    n = n.replace(cjkSpace, '$1$2').replace(cjkSpace, '$1$2');
    return n.trim();
  }

  function normalizeName(raw) {
    if (!raw) return '';
    let n = normalizeCJKText(raw);
    // Strip leading numeric tokens — happens when a stat cell from the
    // previous column bleeds into the name slice in side-by-side tables
    // (e.g. "0 李嘉琪" → "李嘉琪", "5.2 王鹏翔" → "王鹏翔").
    n = n.replace(/^\d+(?:\.\d+)?\s+(?=\S)/, '');
    // Trailing jersey numbers ("#23" / " 23")
    n = n.replace(/\s+#?\d{1,3}\s*$/, '');
    // If a jersey number was swallowed by the stat-tail regex, a lone "#"
    // can remain in the name slice ("安刚 #" → "安刚").
    n = n.replace(/\s*#\s*$/, '');
    // Some footer/name slices keep an orphan closing parenthesis after stripping
    // a jersey/suffix token, e.g. "李晨 Pro)".
    n = n.replace(/\s*[)）]\s*$/, '');
    // GameChanger suffixes ("pro" / "asst" / …). Run after jersey stripping
    // so names like "梁奇 Pro #6" become "梁奇" instead of "梁奇 Pro".
    n = n.replace(/\s+(pro|asst|sub|mgr|coach|alt)(?:\s+[\u2E80-\u2FFF\u3400-\u9FFF])?\s*$/i, '');
    // "Pro" can occasionally be extracted as a single trailing "P".
    n = n.replace(/([\u2E80-\u2FFF\u3400-\u9FFF])\s+p\s*$/i, '$1');
    n = fixKnownPdfName(n);
    return n.trim();
  }

  function fixKnownPdfName(name) {
    const fromPool = resolveKnownPlayerName(name);
    if (fromPool) return fromPool;
    const fixes = {
      // Apr 20 GameChanger PDF drops the middle "一" from 苏一哲's visual name
      // and emits it as a stray glyph in the stat area. Keep the real roster name.
      '苏哲': '苏一哲',
    };
    return fixes[name] || name;
  }

  function compactPlayerNameKey(raw) {
    return normalizeCJKText(raw || '')
      .toLowerCase()
      .replace(/[\s_\-.,，、·:：()（）#]/g, '');
  }

  function isSubsequence(shorter, longer) {
    let i = 0;
    for (const ch of longer) {
      if (ch === shorter[i]) i++;
      if (i >= shorter.length) return true;
    }
    return i >= shorter.length;
  }

  function getKnownPlayerRecords() {
    const records = [];
    const pushPlayer = (player) => {
      if (!player) return;
      const main = typeof player === 'string' ? player : player.name;
      if (!main) return;
      records.push({ raw: main, display: main });
      const aliases = Array.isArray(player.aliases) ? player.aliases : [];
      for (const alias of aliases) {
        if (alias) records.push({ raw: alias, display: main });
      }
    };

    const injected = global.OrionParserKnownPlayers;
    if (Array.isArray(injected)) injected.forEach(pushPlayer);

    try {
      if (global.DB && typeof global.DB.allPlayers === 'function') {
        global.DB.allPlayers().forEach(pushPlayer);
      }
    } catch (_) {
      // DB may not be preloaded in non-browser tests; parser still works.
    }
    return records;
  }

  function resolveKnownPlayerName(name) {
    const key = compactPlayerNameKey(name);
    if (!key || key.length < 2) return '';
    const records = getKnownPlayerRecords()
      .map(r => ({
        display: r.display,
        key: compactPlayerNameKey(r.raw),
      }))
      .filter(r => r.display && r.key && r.key.length >= 2);

    const exact = records.find(r => r.key === key);
    if (exact) return exact.display;

    const near = records.filter(r => {
      if (r.key.length !== key.length + 1) return false;
      if (r.key[0] !== key[0] || r.key[r.key.length - 1] !== key[key.length - 1]) return false;
      return isSubsequence(key, r.key);
    });
    const uniqueDisplays = [...new Set(near.map(r => r.display))];
    return uniqueDisplays.length === 1 ? uniqueDisplays[0] : '';
  }

  function normalizePdfTokenText(raw) {
    if (!raw) return '';
    return String(raw)
      .normalize('NFKC')
      .replace(/[\u2E80-\u2EFF]/g, ch => CJK_RADICAL_MAP[ch] || ch)
      .replace(/[\s\u00A0\u3000\u200B-\u200D\uFEFF]+/g, ' ')
      .trim();
  }

  function normalizePlayerRowName(raw) {
    if (!raw) return '';
    const normalizedRaw = normalizePdfTokenText(raw);
    let name = normalizeName(raw);
    // GameChanger's Chinese text layer sometimes inserts a stray one-character
    // cell right before a position/stat block: "王竞先 立 (LF)" or
    // "周梦成 飞 4.2 ...". Keep real 3-char names such as "靳江 山" intact by
    // only trimming when the joined name is already 4+ chars.
    if (name.length >= 4 && /\s[一立子方言飞龙山马辰高黄金]\s*$/.test(normalizedRaw)) {
      name = name.slice(0, -1);
    }
    return name.trim();
  }

  function looksLikePositionToken(token) {
    const m = String(token || '').match(/^\(([^)]+)\)$/);
    return !!(m && /^(?:P|C|1B|2B|3B|SS|LF|CF|RF|SF|DH|OF|IF|UTIL)(?:[-/][A-Z0-9]+)?$/i.test(m[1].trim()));
  }

  // Parse a single batting row text: "许立新 (2B) 6 3 3 1 0 0"
  function parseBattingRow(text, isTotals){
    if (!text) return null;
    // Must contain at least 6 numeric stats at the end
    const tailMatch = text.match(/([-\d.]+(?:\s+[-\d.]+){5,7})\s*$/);
    if (!tailMatch) return parseNoisyBattingRow(text, isTotals);
    const stats = tailMatch[1].split(/\s+/).map(Number);
    // Expect [AB, R, H, RBI, BB, SO] (6) — some rows might have 8 cells; take last 6
    const s = stats.slice(-6);
    if (s.length !== 6 || s.some(n => !Number.isFinite(n))) return parseNoisyBattingRow(text, isTotals);
    const nameAndPos = text.slice(0, text.length - tailMatch[0].length).trim();
    // Extract position in parentheses. Some PDF text flows inject stray one-
    // character cells after the position marker, so accept "(P) 黄" as "(P)".
    const posMatches = [...nameAndPos.matchAll(/\(([^)]+)\)/g)]
      .filter(m => /^(?:P|C|1B|2B|3B|SS|LF|CF|RF|SF|DH|OF|IF|UTIL)(?:[-/][A-Z0-9]+)?$/i.test(m[1].trim()));
    const posMatch = posMatches.length ? posMatches[posMatches.length - 1] : null;
    const pos  = posMatch ? posMatch[1].trim() : '';
    const name = normalizePlayerRowName(posMatch ? nameAndPos.slice(0, posMatch.index) : nameAndPos);
    if (!name || isTotals) return null;  // skip the Totals row (tagged by caller)
    // Defensive: a Totals row whose leading text isn't pure "Totals" (e.g. "TEAM Totals",
    // "猎户座 Totals", or fully-translated "总计") slips past the isTotals tag —
    // catch by name pattern so it never lands in the players array.
    if (/(?:^|\s)(totals?|总计|合计|总和)(?:\s|$)/i.test(name)) return null;
    return {
      name,
      pos,
      AB: s[0]||0, R: s[1]||0, H: s[2]||0,
      RBI: s[3]||0, BB: s[4]||0, SO: s[5]||0
    };
  }

  function parseNoisyBattingRow(text, isTotals) {
    const normalized = normalizeCJKText(text);
    if (!normalized || isTotals) return null;
    if (/(?:^|\s)(totals?|总计|合计|总和)(?:\s|$)/i.test(normalized)) return null;
    if (/:/.test(normalized)) return null;

    const tokens = normalizePdfTokenText(text).split(/\s+/).filter(Boolean);
    if (tokens.length < 7) return null;
    const numRe = /^-?\d+(?:\.\d+)?$/;
    const posIdx = tokens.findIndex(looksLikePositionToken);
    const numeric = tokens
      .slice(posIdx >= 0 ? posIdx + 1 : 0)
      .filter(t => numRe.test(t))
      .map(Number);
    if (numeric.length < 6) return null;
    const s = numeric.slice(-6);
    if (s.some(n => !Number.isFinite(n))) return null;

    let nameRaw = '';
    let pos = '';
    if (posIdx >= 0) {
      pos = tokens[posIdx].slice(1, -1).trim();
      nameRaw = tokens.slice(0, posIdx).join(' ');
    } else {
      const firstNumIdx = tokens.findIndex(t => numRe.test(t));
      if (firstNumIdx <= 0) return null;
      nameRaw = tokens.slice(0, firstNumIdx).join(' ');
    }

    const name = normalizePlayerRowName(nameRaw);
    if (!name || /(?:^|\s)(totals?|总计|合计|总和)(?:\s|$)/i.test(name)) return null;
    return {
      name,
      pos,
      AB: s[0]||0, R: s[1]||0, H: s[2]||0,
      RBI: s[3]||0, BB: s[4]||0, SO: s[5]||0
    };
  }

  // ----------------------------------------------------------
  // Parse pitching table — mirror of batting parser but with
  // columns IP H R ER BB SO HR
  // ----------------------------------------------------------
  function parsePitchingTables(rows, startIdx, team1, team2){
    let pitchIdx = -1;
    for (let i = startIdx; i < rows.length; i++) {
      if (/^PITCHING/i.test(rows[i].text)) { pitchIdx = i; break; }
    }
    if (pitchIdx < 0) return { table1: [], table2: [] };

    let colHdrIdx = -1;
    for (let i = pitchIdx; i < Math.min(rows.length, pitchIdx + 10); i++) {
      if (/IP\s+H\s+R\s+ER\s+BB\s+SO\s+HR/i.test(rows[i].text)) {
        colHdrIdx = i;
        break;
      }
    }
    if (colHdrIdx < 0) return { table1: [], table2: [] };

    const hdrRow = rows[colHdrIdx];
    const columnXs = {};
    for (const cell of hdrRow.cells) {
      if (/^(IP|H|R|ER|BB|SO|HR)$/.test(cell.str)) {
        if (!columnXs[cell.str]) columnXs[cell.str] = [];
        columnXs[cell.str].push(cell.x);
      }
    }
    const sideBySide = (columnXs.IP || []).length >= 2;

    const table1 = [], table2 = [];
    const fieldingE1 = [], fieldingE2 = [];
    const PITCH_FOOTER_ANYWHERE_RE = /\b(?:W|L|S|P-S|BF|HBP|WP|BK|E)\s*:/i;
    const FIELDING_E_RE = /\bE\s*:/i;
    const appendFieldingE = (bucket, txt) => {
      if (!txt) return false;
      if (FIELDING_E_RE.test(txt)) {
        bucket.push(txt);
        return true;
      }
      if (
        bucket.length &&
        /[\u2E80-\u2FFF\u3400-\u9FFF]/.test(txt) &&
        !/Scorekeeping|Stats\.|Live Game|GameChanger/i.test(txt) &&
        !/^(?:Totals|W|L|S|P-S|BF|HBP|WP|BK)\s*:/i.test(txt)
      ) {
        bucket[bucket.length - 1] += ' ' + txt;
        return true;
      }
      return false;
    };

    if (!sideBySide) {
      for (let i = colHdrIdx + 1; i < rows.length; i++) {
        const txt = rows[i].text;
        if (/^BATTING\b|^HIGHLIGHTS\b/i.test(txt)) break;
        appendFieldingE(fieldingE1, txt);
        if (/^Totals\b/i.test(txt) || PITCH_FOOTER_ANYWHERE_RE.test(txt)) {
          if (table1.length) break;
          continue;
        }
        const parsed = parsePitchingRow(txt);
        if (parsed) table1.push(parsed);
      }
    } else {
      const STAT_COLS_P = ['IP','H','R','ER','BB','SO','HR'];
      let leftMaxStatX = -Infinity, rightMinStatX = Infinity;
      for (const k of STAT_COLS_P) {
        const xs = (columnXs[k] || []).slice().sort((a,b)=>a-b);
        if (xs.length >= 2) {
          if (xs[0] > leftMaxStatX) leftMaxStatX = xs[0];
          if (xs[1] < rightMinStatX) rightMinStatX = xs[1];
        }
      }
      let rightTeamX = rightMinStatX;
      for (const c of hdrRow.cells) {
        if (c.x > leftMaxStatX + 2 && c.x < rightMinStatX - 2) {
          rightTeamX = Math.min(rightTeamX, c.x);
        }
      }
      const midX = (leftMaxStatX + rightTeamX) / 2;

      let leftDone = false, rightDone = false;
      for (let i = colHdrIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const txt = row.text;
        if (/^BATTING\b|^HIGHLIGHTS\b/i.test(txt)) break;

        const leftCells  = row.cells.filter(c => c.x < midX);
        const rightCells = row.cells.filter(c => c.x >= midX);
        const leftTxt  = leftCells .map(c=>c.str).join(' ').replace(/\s+/g,' ').trim();
        const rightTxt = rightCells.map(c=>c.str).join(' ').replace(/\s+/g,' ').trim();

        if (leftTxt) appendFieldingE(fieldingE1, leftTxt);
        if (rightTxt) appendFieldingE(fieldingE2, rightTxt);

        if (!leftDone && (/^Totals\b/i.test(leftTxt) || PITCH_FOOTER_ANYWHERE_RE.test(leftTxt))) leftDone = true;
        if (!rightDone && (/^Totals\b/i.test(rightTxt) || PITCH_FOOTER_ANYWHERE_RE.test(rightTxt))) rightDone = true;

        if (!leftDone && leftTxt) {
          const l = parsePitchingRow(leftTxt);
          if (l) table1.push(l);
        }
        if (!rightDone && rightTxt) {
          const r = parsePitchingRow(rightTxt);
          if (r) table2.push(r);
        }

        if (leftDone && rightDone && (table1.length || table2.length)) continue;
      }
    }

    if (sideBySide) {
      const leftIsTeam1 = detectLeftIsTeam1(hdrRow, columnXs, ['IP','H','R','ER','BB','SO','HR'], team1, team2);
      if (!leftIsTeam1) {
        return { table1: table2, table2: table1, fieldingE1: fieldingE2, fieldingE2: fieldingE1 };
      }
    }
    return { table1, table2, fieldingE1, fieldingE2 };
  }

  function parsePitchingRow(text){
    if (!text) return null;
    // Pitching row: "周梦成 4.2 17 12 5 1 0 0"  →  name, IP, H, R, ER, BB, SO, HR
    const tailMatch = text.match(/([\d.]+(?:\s+[-\d.]+){6,7})\s*$/);
    if (!tailMatch) return null;
    const stats = tailMatch[1].split(/\s+/).map(v => +v);
    const s = stats.slice(-7);
    if (s.length !== 7 || s.some(n => !Number.isFinite(n))) return null;
    const name = normalizePlayerRowName(text.slice(0, text.length - tailMatch[0].length));
    if (!name) return null;
    // Defensive: same filter as parseBattingRow — a "Totals" pitching summary
    // line should never be treated as a pitcher.
    if (/(?:^|\s)(totals?|总计|合计|总和)(?:\s|$)/i.test(name)) return null;
    return {
      name,
      IP: s[0]||0, H: s[1]||0, R: s[2]||0, ER: s[3]||0,
      BB: s[4]||0, SO: s[5]||0, HR: s[6]||0
    };
  }

  // ----------------------------------------------------------
  // Map parsed pieces to the DB game shape.
  // orionName: the string used in the site ("猎户座" or "猎户星") —
  //   caller passes the sport-appropriate value.
  // ----------------------------------------------------------
  function assembleGame({hdr, date, venue, innings, line1, line2, bat1, bat2, pit1, pit2}, orionName){
    // Determine which of line1/line2 is Orion's. By GameChanger
    // convention the FIRST team in the header is typically the
    // "tracked team" (Orion). But the line-score ORDER is the same
    // as the header order. So line1 = team1 stats.
    const team1 = hdr.team1;
    const team2 = hdr.team2;
    // Use DB.isOrionTeam if available (centralized), fallback for non-browser env
    const isOrion = (typeof DB !== 'undefined' && DB.isOrionTeam)
      ? DB.isOrionTeam.bind(DB)
      : (n => !!n && /猎户|Orion|Zoo\s*Park|ZPRK/i.test(String(n)));

    // We need to map to home/away. GameChanger labels "Away" from
    // the tracked team's perspective: venue === 'Away' means the
    // tracked team was visiting. The tracked team's name is often
    // team1 (the first name in the header).
    // Determine which team is "ours". Try multiple strategies:
    // 1) orionName from form matches a team name directly
    // 2) isOrion() regex matches (covers 猎户/Orion/Zoo Park etc.)
    // 3) fallback: assume team1 is tracked (GameChanger convention: tracked team listed first)
    let trackedIsTeam1;
    if (orionName) {
      const oLower = orionName.toLowerCase();
      const m1 = team1.toLowerCase().includes(oLower) || oLower.includes(team1.toLowerCase());
      const m2 = team2.toLowerCase().includes(oLower) || oLower.includes(team2.toLowerCase());
      if (m1) trackedIsTeam1 = true;
      else if (m2) trackedIsTeam1 = false;
      else trackedIsTeam1 = isOrion(team1) || !isOrion(team2);
    } else {
      trackedIsTeam1 = isOrion(team1) || !isOrion(team2);
    }
    // venue is from the tracked team's perspective:
    //   'Home' = tracked team played at home, 'Away' = tracked was visiting.
    // Map to team1/team2: if tracked IS team1, venue applies directly;
    // if tracked is team2, invert.
    const trackedIsHome = (venue === 'Home');
    const homeIsTeam1 = trackedIsTeam1 ? trackedIsHome : !trackedIsHome;
    const home = homeIsTeam1 ? team1 : team2;
    const away = homeIsTeam1 ? team2 : team1;
    const homeScore = homeIsTeam1 ? hdr.score1 : hdr.score2;
    const awayScore = homeIsTeam1 ? hdr.score2 : hdr.score1;

    // Map line scores — line1 always corresponds to team1 (header order)
    const homeLine   = homeIsTeam1 ? line1.linescore : line2.linescore;
    const awayLine   = homeIsTeam1 ? line2.linescore : line1.linescore;
    const homeTotals = homeIsTeam1 ? line1.totals    : line2.totals;
    const awayTotals = homeIsTeam1 ? line2.totals    : line1.totals;

    // Map batting — again line1/bat1 correspond to team1
    const team1Batting  = bat1 || [];
    const team2Batting  = bat2 || [];
    const team1Pitching = pit1 || [];
    const team2Pitching = pit2 || [];

    // g.batting is ALWAYS orion's lines in the final DB shape
    const orionBatting  = trackedIsTeam1 ? team1Batting  : team2Batting;
    const oppBatting    = trackedIsTeam1 ? team2Batting  : team1Batting;
    const orionPitching = trackedIsTeam1 ? team1Pitching : team2Pitching;
    const oppPitching   = trackedIsTeam1 ? team2Pitching : team1Pitching;

    // Guess MVP = highest H, break ties by RBI
    const mvpPick = orionBatting.slice()
      .filter(b => b && b.H > 0)
      .sort((a,b) => (b.H - a.H) || (b.RBI - a.RBI))[0];

    return {
      date,
      venue,
      innings,
      home, away,
      homeScore, awayScore,
      linescore: { home: homeLine, away: awayLine },
      homeTotals,
      awayTotals,
      batting: orionBatting,
      oppBatting,
      pitching: orionPitching,
      oppPitching,
      mvpPlayerName: mvpPick ? mvpPick.name : '',
      mvpNote: mvpPick ? `${mvpPick.H} 安打 · ${mvpPick.RBI} 打点` : ''
    };
  }

  // ----------------------------------------------------------
  // Public: parse a PDF file → game object
  // ----------------------------------------------------------
  async function parsePdfFile(file, opts){
    const arrayBuffer = await file.arrayBuffer();
    const rows = await extractRowsFromPdf(arrayBuffer);
    // DEBUG: uncomment to see extracted rows in console
    // console.log('PDF rows:', rows.map(r => r.text));

    const hdr = applyFilenameHeaderHint(
      parseScoreHeader(rows),
      file && file.name
    );
    if (!hdr) throw new Error('无法识别比赛标题（期望格式：队伍A 分数 - 分数 队伍B）');

    const date  = parseDate(rows)  || new Date().toISOString().slice(0,10);
    const venue = parseVenue(rows);

    const ls = parseLineScore(rows, hdr.team1, hdr.team2, hdr.rowIdx);
    if (!ls) throw new Error('无法识别逐局记分牌（linescore）');

    const bat = parseBattingTables(rows, ls.endIdx, hdr.team1, hdr.team2);
    const pit = parsePitchingTables(rows, bat.endIdx, hdr.team1, hdr.team2);
    const fieldingWarnings = [
      ...applyFieldingErrorsToTable(bat.table1, pit.fieldingE1, hdr.team1),
      ...applyFieldingErrorsToTable(bat.table2, pit.fieldingE2, hdr.team2),
    ];

    const game = assembleGame({
      hdr, date, venue,
      innings: ls.innings,
      line1: ls.line1, line2: ls.line2,
      bat1: bat.table1, bat2: bat.table2,
      pit1: pit.table1, pit2: pit.table2
    }, opts && opts.orionName);
    applyFilenameGameOverride(game, file && file.name, opts);
    // 把解析时的 warnings 挂在 game 上，admin 上传预览可以渲染告警条
    game.warnings = [...(bat.warnings || []), ...fieldingWarnings];
    return game;
  }

  // ----------------------------------------------------------
  // Excel parser
  // ----------------------------------------------------------
  // Two supported paths:
  // 1) Structured GameChanger verification workbooks generated by AI/manual
  //    review. These contain sheets such as 比分RHE/比赛比分, 球员单场总表,
  //    打击明细, 跑垒明细, 守备明细, 投手明细, 球队情境统计, RHE校验.
  //    We normalize the whole workbook into one or more game objects.
  // 2) Legacy single-sheet batting summary. Kept as a fallback.
  // ----------------------------------------------------------
  function excelSheetRows(wb, sheetName) {
    if (!sheetName || !wb.Sheets[sheetName]) return [];
    return global.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
  }

  function findExcelSheet(wb, patterns) {
    return wb.SheetNames.find(name => patterns.some(re => re.test(name))) || '';
  }

  function excelRecords(wb, sheetName) {
    const rows = excelSheetRows(wb, sheetName);
    if (!rows.length) return [];
    let hdrIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const cells = rows[i].map(v => String(v || '').trim()).filter(Boolean);
      if (cells.length >= 2) { hdrIdx = i; break; }
    }
    if (hdrIdx < 0) return [];
    const headers = rows[hdrIdx].map(h => String(h || '').trim());
    const records = [];
    for (let i = hdrIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(v => String(v || '').trim() === '')) continue;
      const obj = { _row: i + 1 };
      headers.forEach((h, idx) => {
        if (h) obj[h] = row[idx];
      });
      records.push(obj);
    }
    return records;
  }

  function pick(row, names, fallback = '') {
    for (const name of names) {
      if (row && row[name] != null && String(row[name]).trim() !== '') return row[name];
    }
    return fallback;
  }

  function cleanExcelText(v) {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s || /^(?:原文未显示|未显示|无|--|—|-|null|undefined)$/i.test(s)) return '';
    return s;
  }

  function excelNum(v, fallback = 0) {
    const s = cleanExcelText(v);
    if (!s) return fallback;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(s).replace(/,/g, '').replace('%', ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function excelPct(v, fallback = null) {
    const s = cleanExcelText(v);
    if (!s) return fallback;
    if (/%$/.test(s)) return excelNum(s, 0) / 100;
    const n = excelNum(s, NaN);
    return Number.isFinite(n) ? n : fallback;
  }

  function excelDate(v) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && Number.isFinite(v)) {
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const s = cleanExcelText(v);
    if (!s) return '';
    const m = s.match(/(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    return s.slice(0, 10);
  }

  function gameIdFromRow(row) {
    return cleanExcelText(pick(row, ['比赛ID', '比赛编号', 'GameID', 'game_id']));
  }

  function teamFromRow(row) {
    return cleanExcelText(pick(row, ['球队名称', '显示队名', '球队', '球队缩写', 'Team']));
  }

  function normalizeHomeAwayMarker(v) {
    const s = cleanExcelText(v).toLowerCase();
    if (/主|home/.test(s)) return 'home';
    if (/客|away|visitor/.test(s)) return 'away';
    return '';
  }

  function parseTeamsFromMatchLabel(label) {
    let s = cleanExcelText(label).replace(/\s+/g, ' ').trim();
    s = s.replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[-—\s]*/, '').trim();
    let m = s.match(/^(.+?)\s+(\d+)\s*[-:]\s*(\d+)\s+(.+)$/);
    if (m) return { away: m[1].trim(), awayScore: +m[2], homeScore: +m[3], home: m[4].trim() };
    m = s.match(/^(.+?)\s*(?:vs|VS|Vs|@|at)\s*(.+)$/);
    if (m) return { away: m[1].trim(), home: m[2].trim() };
    return null;
  }

  function inningValuesFromRow(row) {
    const innings = [];
    const pairs = [];
    Object.keys(row || {}).forEach(k => {
      let m = k.match(/^第(\d+)局$/);
      if (!m) m = k.match(/^局分_(\d+)$/);
      if (!m) return;
      pairs.push([+m[1], row[k]]);
    });
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, v] of pairs) {
      const s = cleanExcelText(v);
      innings.push(s === '' ? '' : (/^x$/i.test(s) ? 'X' : excelNum(s, 0)));
    }
    while (innings.length && innings[innings.length - 1] === '') innings.pop();
    return innings;
  }

  function resolveExcelSides(lineRows) {
    const withSide = lineRows.map(r => ({ row: r, side: normalizeHomeAwayMarker(pick(r, ['主客', '主客标记'])) }));
    const awayBySide = withSide.find(x => x.side === 'away');
    const homeBySide = withSide.find(x => x.side === 'home');
    if (awayBySide && homeBySide && awayBySide.row !== homeBySide.row) {
      return { awayRow: awayBySide.row, homeRow: homeBySide.row };
    }

    const parsed = parseTeamsFromMatchLabel(pick(lineRows[0], ['比赛', 'PDF标题']));
    if (parsed) {
      const awayRow = lineRows.find(r => teamNamesLookSame(teamFromRow(r), parsed.away));
      const homeRow = lineRows.find(r => teamNamesLookSame(teamFromRow(r), parsed.home));
      if (awayRow && homeRow) return { awayRow, homeRow };
    }

    return { awayRow: lineRows[0], homeRow: lineRows[1] || lineRows[0] };
  }

  function mapByGameTeam(records) {
    const map = new Map();
    for (const r of records || []) {
      const gid = gameIdFromRow(r);
      const team = teamFromRow(r);
      if (!gid || !team) continue;
      const key = `${gid}::${teamNameKey(team)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }

  function firstByGameTeam(records) {
    const out = new Map();
    for (const r of records || []) {
      const gid = gameIdFromRow(r);
      const team = teamFromRow(r);
      if (!gid || !team) continue;
      const key = `${gid}::${teamNameKey(team)}`;
      if (!out.has(key)) out.set(key, r);
    }
    return out;
  }

  function makeTeamTotals(row, contextRow, playerRows) {
    const totals = {
      R: excelNum(pick(row, ['R', '比分表_R', '球队R'])),
      H: excelNum(pick(row, ['H', '比分表_H', '球队H'])),
      E: excelNum(pick(row, ['E', '比分表_E', '球队E'])),
      LOB: excelNum(pick(row, ['LOB', 'Team LOB', 'Team_LOB', '球队LOB']), null)
    };
    if (contextRow) {
      const rispH = excelNum(pick(contextRow, ['得分圈安打', 'Scoring_position_hits']), null);
      const rispOpp = excelNum(pick(contextRow, ['得分圈机会', 'Scoring_position_opportunities']), null);
      const rispAvg = excelPct(pick(contextRow, ['得分圈打率', 'Scoring_position_avg']), null);
      totals.RISP_H = rispH;
      totals.RISP_OPP = rispOpp;
      totals.RISP_AVG = rispAvg;
      totals.RISP_TEXT = cleanExcelText(pick(contextRow, ['得分圈表现', '来源原文']));
      const lob = excelNum(pick(contextRow, ['Team LOB', 'Team_LOB']), null);
      if (totals.LOB == null && lob != null) totals.LOB = lob;
    }
    if (playerRows && playerRows.length) {
      const sum = key => playerRows.reduce((a, r) => a + (+r[key] || 0), 0);
      Object.assign(totals, {
        AB: sum('AB'), RBI: sum('RBI'), BB: sum('BB'), SO: sum('SO'),
        _1B: sum('_1B'), _2B: sum('_2B'), _3B: sum('_3B'), HR: sum('HR'),
        TB: sum('TB'), SF: sum('SF'), HBP: sum('HBP'), SB: sum('SB'), CS: sum('CS'),
        PB: sum('PB'), DP: sum('DP')
      });
    }
    return totals;
  }

  function makeBattingRows(records) {
    return (records || []).map(r => {
      const H = excelNum(pick(r, ['H']));
      const _2B = excelNum(pick(r, ['2B']));
      const _3B = excelNum(pick(r, ['3B']));
      const HR = excelNum(pick(r, ['HR']));
      const _1B = Math.max(0, H - _2B - _3B - HR);
      const TB = excelNum(pick(r, ['TB', 'TB估算']), _1B + 2 * _2B + 3 * _3B + 4 * HR);
      const AB = excelNum(pick(r, ['AB']));
      const BB = excelNum(pick(r, ['BB']));
      const HBP = excelNum(pick(r, ['HBP受击', 'HBP_受击']));
      const SF = excelNum(pick(r, ['SF']));
      const obpDen = AB + BB + HBP + SF;
      const row = {
        name: cleanExcelText(pick(r, ['球员', '姓名', 'name'])),
        pos: cleanExcelText(pick(r, ['守备位置', '位置', 'pos'])),
        order: excelNum(pick(r, ['打序']), null),
        gp: 1,
        AB, R: excelNum(pick(r, ['R'])), H,
        RBI: excelNum(pick(r, ['RBI'])),
        BB, SO: excelNum(pick(r, ['SO'])),
        _1B, _2B, _3B, HR, TB, SF, HBP,
        twoOutRBI: excelNum(pick(r, ['2出局RBI', '2-out RBI'])),
        SB: excelNum(pick(r, ['SB'])),
        CS: excelNum(pick(r, ['CS'])),
        E: excelNum(pick(r, ['个人E', 'E'])),
        PB: excelNum(pick(r, ['PB'])),
        DP: excelNum(pick(r, ['DP参与'])),
        AVG: excelPct(pick(r, ['AVG']), AB ? H / AB : null),
        OBP: excelPct(pick(r, ['OBP_估算', 'OBP估算']), obpDen ? (H + BB + HBP) / obpDen : null),
        review: cleanExcelText(pick(r, ['是否待复核'])),
        reviewReason: cleanExcelText(pick(r, ['待复核原因'])),
        sourceFile: cleanExcelText(pick(r, ['来源文件', 'PDF标题']))
      };
      row.SLG = AB ? TB / AB : null;
      row.OPS = (row.OBP == null || row.SLG == null) ? null : row.OBP + row.SLG;
      return row;
    }).filter(r => r.name);
  }

  function parseIpValue(raw, converted) {
    const conv = excelNum(converted, NaN);
    if (Number.isFinite(conv)) return conv;
    const s = cleanExcelText(raw);
    if (!s) return 0;
    const m = s.match(/^(\d+)(?:\.(\d))?$/);
    if (m) {
      const whole = +m[1];
      const outs = m[2] ? +m[2] : 0;
      if (outs === 1 || outs === 2) return +(whole + outs / 3).toFixed(3);
      return +s;
    }
    return excelNum(s, 0);
  }

  function decisionFromPitchRow(r) {
    const direct = cleanExcelText(pick(r, ['胜负', 'decision']));
    if (/^[WLS]$/i.test(direct)) return direct.toUpperCase();
    if (/是|yes|true|1/i.test(cleanExcelText(pick(r, ['W'])))) return 'W';
    if (/是|yes|true|1/i.test(cleanExcelText(pick(r, ['L'])))) return 'L';
    if (/是|yes|true|1/i.test(cleanExcelText(pick(r, ['SV'])))) return 'SV';
    if (/是|yes|true|1/i.test(cleanExcelText(pick(r, ['HLD'])))) return 'HLD';
    return '';
  }

  function makePitchingRows(records, addMap) {
    return (records || []).map(r => {
      const gid = gameIdFromRow(r);
      const team = teamFromRow(r);
      const pitcher = cleanExcelText(pick(r, ['投手', '球员']));
      const add = addMap && addMap.get(`${gid}::${teamNameKey(team)}::${normalizeName(pitcher)}`) || {};
      const rawIp = pick(r, ['IP_原文', 'IP']);
      const ip = parseIpValue(rawIp, pick(r, ['IP_局数换算']));
      const H = excelNum(pick(r, ['H_allowed', '投手H', 'H']));
      const BB = excelNum(pick(r, ['BB_allowed', '投手BB', 'BB']));
      const SO = excelNum(pick(r, ['SO_pitching', '投手SO', 'SO']));
      const ER = excelNum(pick(r, ['ER', '投手ER']));
      const row = {
        name: pitcher,
        order: excelNum(pick(r, ['投手序号']), null),
        IP: ip,
        IPText: cleanExcelText(rawIp) || (ip ? String(ip) : ''),
        outs: excelNum(pick(r, ['投球出局数']), Math.round(ip * 3)),
        H,
        R: excelNum(pick(r, ['R_allowed', '投手R', 'R'])),
        ER,
        BB,
        SO,
        HR: excelNum(pick(r, ['HR_allowed', '投手HR', 'HR'])),
        WP: excelNum(pick(add, ['WP'], pick(r, ['WP']))),
        HBP: excelNum(pick(add, ['HBP_投出'], pick(r, ['HBP投出', 'HBP_投出']))),
        pitches: excelNum(pick(add, ['pitches_total'], pick(r, ['投球数', 'pitches_total']))),
        strikes: excelNum(pick(add, ['strikes'], pick(r, ['好球数', 'strikes']))),
        GB: excelNum(pick(add, ['GB'], pick(r, ['GB']))),
        FB: excelNum(pick(add, ['FB'], pick(r, ['FB']))),
        BF: excelNum(pick(add, ['BF'], pick(r, ['BF']))),
        decision: decisionFromPitchRow(r),
        sourceFile: cleanExcelText(pick(r, ['来源文件', 'PDF标题']))
      };
      row.strikePct = row.pitches ? row.strikes / row.pitches : excelPct(pick(r, ['Strike%']), null);
      row.ERA = ip ? (ER * 9) / ip : null;
      row.WHIP = ip ? (H + BB) / ip : null;
      row.K9 = ip ? (SO * 9) / ip : null;
      row.BB9 = ip ? (BB * 9) / ip : null;
      return row;
    }).filter(r => r.name);
  }

  function buildPitchAddMap(records) {
    const map = new Map();
    for (const r of records || []) {
      const gid = gameIdFromRow(r);
      const team = teamFromRow(r);
      const pitcher = cleanExcelText(pick(r, ['投手', '球员']));
      if (!gid || !team || !pitcher) continue;
      map.set(`${gid}::${teamNameKey(team)}::${normalizeName(pitcher)}`, r);
    }
    return map;
  }

  function validateExcelTeam(gameId, teamName, totals, battingRows, warnings) {
    const sum = key => battingRows.reduce((a, r) => a + (+r[key] || 0), 0);
    const checks = [
      ['R', totals.R, sum('R')],
      ['H', totals.H, sum('H')],
      ['E', totals.E, sum('E')]
    ];
    checks.forEach(([label, expected, actual]) => {
      if (expected != null && Number.isFinite(+expected) && +expected !== +actual) {
        warnings.push(`[${gameId} ${teamName}] ${label} 校验不一致：比分/球队=${expected}，球员合计=${actual}`);
      }
    });
  }

  function parseStructuredExcelWorkbook(wb, opts, filename) {
    const lineSheet = findExcelSheet(wb, [/比赛比分/, /比分RHE/]);
    const playerSheet = findExcelSheet(wb, [/球员单场总表/]);
    if (!lineSheet || !playerSheet) return null;

    const lineRows = excelRecords(wb, lineSheet);
    const playerRows = excelRecords(wb, playerSheet);
    if (lineRows.length < 2 || !playerRows.length) return null;

    const contextRows = excelRecords(wb, findExcelSheet(wb, [/球队情境统计/]));
    const infoRows = excelRecords(wb, findExcelSheet(wb, [/比赛附加信息/]));
    const pitchRows = excelRecords(wb, findExcelSheet(wb, [/投手明细/]));
    const pitchAddRows = excelRecords(wb, findExcelSheet(wb, [/投手附加统计/]));
    const contextByTeam = firstByGameTeam(contextRows);
    const battingByTeam = mapByGameTeam(playerRows);
    const pitchByTeam = mapByGameTeam(pitchRows);
    const pitchAddMap = buildPitchAddMap(pitchAddRows);
    const infoByGame = new Map(infoRows.map(r => [gameIdFromRow(r), r]).filter(([id]) => id));

    const lineByGame = new Map();
    for (const r of lineRows) {
      const gid = gameIdFromRow(r);
      if (!gid) continue;
      if (!lineByGame.has(gid)) lineByGame.set(gid, []);
      lineByGame.get(gid).push(r);
    }

    const games = [];
    const allWarnings = [];
    const orionName = (opts && opts.orionName) || '猎户座';
    for (const [gid, rows] of lineByGame.entries()) {
      if (rows.length < 2) continue;
      const { awayRow, homeRow } = resolveExcelSides(rows);
      const away = teamFromRow(awayRow);
      const home = teamFromRow(homeRow);
      const date = excelDate(pick(awayRow, ['日期'], pick(homeRow, ['日期'])));
      const match = cleanExcelText(pick(awayRow, ['比赛'], pick(homeRow, ['比赛'])));
      const parsedMatch = parseTeamsFromMatchLabel(match) || {};
      const awayLine = inningValuesFromRow(awayRow);
      const homeLine = inningValuesFromRow(homeRow);
      const innings = Math.max(awayLine.length, homeLine.length);

      const awayKey = `${gid}::${teamNameKey(away)}`;
      const homeKey = `${gid}::${teamNameKey(home)}`;
      const awayBatting = makeBattingRows(battingByTeam.get(awayKey) || []);
      const homeBatting = makeBattingRows(battingByTeam.get(homeKey) || []);
      const awayPitching = makePitchingRows(pitchByTeam.get(awayKey) || [], pitchAddMap);
      const homePitching = makePitchingRows(pitchByTeam.get(homeKey) || [], pitchAddMap);
      const awayTotals = makeTeamTotals(awayRow, contextByTeam.get(awayKey), awayBatting);
      const homeTotals = makeTeamTotals(homeRow, contextByTeam.get(homeKey), homeBatting);

      const warnings = [];
      validateExcelTeam(gid, away, awayTotals, awayBatting, warnings);
      validateExcelTeam(gid, home, homeTotals, homeBatting, warnings);
      const info = infoByGame.get(gid) || {};
      const gameMeta = {
        umpires: cleanExcelText(pick(info, ['Umpires'])),
        duration: cleanExcelText(pick(info, ['T'])),
        weather: cleanExcelText(pick(info, ['Weather'])),
        match,
        sourceGameId: gid,
        sourceFile: filename || ''
      };
      homeTotals._gameMeta = gameMeta;
      awayTotals._gameMeta = gameMeta;
      const orionIsHome = defaultIsOrionTeamName(home, orionName);
      const orionIsAway = defaultIsOrionTeamName(away, orionName);
      const game = {
        sourceType: 'excel-structured',
        sourceFile: filename || '',
        sourceGameId: gid,
        date,
        venue: orionIsHome ? 'Home' : (orionIsAway ? 'Away' : normalizeHomeAwayMarker(pick(info, ['主客标记'])) || ''),
        innings,
        home,
        away,
        homeScore: homeTotals.R != null ? homeTotals.R : (parsedMatch.homeScore || 0),
        awayScore: awayTotals.R != null ? awayTotals.R : (parsedMatch.awayScore || 0),
        linescore: { home: homeLine, away: awayLine },
        homeTotals,
        awayTotals,
        batting: orionIsAway ? awayBatting : homeBatting,
        oppBatting: orionIsAway ? homeBatting : awayBatting,
        pitching: orionIsAway ? awayPitching : homePitching,
        oppPitching: orionIsAway ? homePitching : awayPitching,
        mvpPlayerName: '',
        mvpNote: '',
        extra: gameMeta,
        warnings
      };
      if (!orionIsHome && !orionIsAway) {
        game.warnings.push(`[${gid}] 未识别猎户队名，已按主队作为我方数据，请核对`);
      }
      allWarnings.push(...warnings);
      games.push(game);
    }

    if (!games.length) return null;
    return { games, warnings: allWarnings, sourceType: 'excel-structured' };
  }

  async function parseExcelFile(file, opts){
    if (!global.XLSX) throw new Error('SheetJS 尚未加载');
    const arrayBuffer = await file.arrayBuffer();
    const wb = global.XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const structured = parseStructuredExcelWorkbook(wb, opts || {}, file && file.name);
    if (structured) return structured;

    // Take the first sheet by default
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) throw new Error('Excel 内容为空');

    // Find the header row — must contain 'name' or '姓名' AND 'AB'
    let hdrRow = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const joined = rows[i].map(String).join('|').toLowerCase();
      if (/(name|姓名|球员)/.test(joined) && /\bab\b/.test(joined)) {
        hdrRow = i;
        break;
      }
    }
    if (hdrRow < 0) throw new Error('未找到 Excel 表头（期望包含 姓名/NAME 和 AB 列）');

    const headers = rows[hdrRow].map(h => String(h).trim().toLowerCase());
    const col = (name) => headers.findIndex(h => h === name);
    const colStartsWith = (prefix) => headers.findIndex(h => h.startsWith(prefix));
    const nameIdx = col('name') >= 0 ? col('name') : (col('姓名') >= 0 ? col('姓名') : col('球员'));
    const posIdx  = col('pos') >= 0 ? col('pos') : col('位置');
    const abIdx   = col('ab');
    const rIdx    = col('r');
    const hIdx    = col('h');
    const rbiIdx  = col('rbi');
    const bbIdx   = col('bb');
    const soIdx   = col('so');
    const gpIdx   = col('gp') >= 0 ? col('gp') : col('场次');

    const batting = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r[nameIdx] || '').trim();
      if (!name || /^totals?$/i.test(name) || /^合计$/.test(name)) continue;
      const num = idx => idx >= 0 && r[idx] !== '' ? +r[idx] : 0;
      batting.push({
        name,
        pos: posIdx >= 0 ? String(r[posIdx] || '') : '',
        gp:  gpIdx >= 0 ? num(gpIdx) : 1,
        AB:  num(abIdx),
        R:   num(rIdx),
        H:   num(hIdx),
        RBI: num(rbiIdx),
        BB:  num(bbIdx),
        SO:  num(soIdx)
      });
    }

    // Totals
    const totR = batting.reduce((a,b)=>a+(b.R||0),0);
    const totH = batting.reduce((a,b)=>a+(b.H||0),0);

    // Build a synthetic aggregate game for CSV/Excel uploads
    const orionName = (opts && opts.orionName) || '猎户座';
    return {
      isAggregate: true,
      date: new Date().toISOString().slice(0,10),
      venue: 'Season',
      innings: 0,
      home: orionName,
      away: '联盟合计',
      homeScore: totR,
      awayScore: 0,
      linescore: { home: [], away: [] },
      homeTotals: { R: totR, H: totH, E: 0 },
      awayTotals: { R: 0, H: 0, E: 0 },
      batting,
      oppBatting: [],
      pitching: [],
      oppPitching: [],
      mvpPlayerName: batting.slice().sort((a,b)=>(b.H-a.H)||(b.RBI-a.RBI))[0]?.name || '',
      mvpNote: '赛季合计 · Excel 导入'
    };
  }

  // Convention: <AwayTeam>_vs_<HomeTeam>_<Mon>_<DD>_<YYYY>.<ext>
  // First team in filename = AWAY (visiting), second = HOME.
  // Returns { away, home, date } or null if pattern doesn't match.
  function parseGameFilename(name){
    if (!name) return null;
    const stripped = String(name).replace(/\.[^.]+$/, '');
    const m = stripped.match(/^(.+?)_vs_(.+?)_([A-Za-z]{3})_(\d{1,2})_(\d{4})$/);
    if (!m) return null;
    const [, away, home, monRaw, day, year] = m;
    const monKey = monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase();
    const mon = MONTHS[monKey];
    if (!mon) return null;
    return {
      away: away.replace(/_/g, ' ').trim(),
      home: home.replace(/_/g, ' ').trim(),
      date: `${year}-${mon}-${String(day).padStart(2,'0')}`
    };
  }

  function teamNameKey(name) {
    return normalizeCJKText(name || '')
      .toLowerCase()
      .replace(/[\s_\-.,，、·:：()（）]/g, '');
  }

  function teamNamesLookSame(a, b) {
    const ak = teamNameKey(a);
    const bk = teamNameKey(b);
    if (!ak || !bk) return false;
    if (ak === bk) return true;
    const minLen = Math.min(ak.length, bk.length);
    const maxLen = Math.max(ak.length, bk.length);
    if (minLen === 1) return ak[0] === bk[0];
    if (ak.includes(bk) || bk.includes(ak)) return true;
    let common = 0;
    const shorter = ak.length <= bk.length ? ak : bk;
    const longer = ak.length <= bk.length ? bk : ak;
    for (let i = 0; i + 2 <= shorter.length; i++) {
      if (longer.includes(shorter.slice(i, i + 2))) common++;
    }
    return maxLen >= 3 && common >= Math.min(2, Math.ceil(shorter.length / 2));
  }

  function applyFilenameHeaderHint(hdr, filenameOrInfo) {
    if (!hdr) return hdr;
    const fn = typeof filenameOrInfo === 'string'
      ? parseGameFilename(filenameOrInfo)
      : filenameOrInfo;
    if (!fn) return hdr;
    return Object.assign({}, hdr, {
      team1: fn.away,
      team2: fn.home,
      filenameInfo: fn
    });
  }

  function defaultIsOrionTeamName(name, orionName) {
    const key = teamNameKey(name);
    const orionKey = teamNameKey(orionName);
    if (orionKey && (key.includes(orionKey) || orionKey.includes(key))) return true;
    return /猎户|orion|zoo\s*park|zprk/i.test(String(name || ''));
  }

  function swapGameHomeAway(game) {
    [game.home, game.away] = [game.away, game.home];
    [game.homeScore, game.awayScore] = [game.awayScore, game.homeScore];
    [game.homeTotals, game.awayTotals] = [game.awayTotals, game.homeTotals];
    if (game.linescore) {
      [game.linescore.home, game.linescore.away] = [game.linescore.away, game.linescore.home];
    }
  }

  function applyFilenameGameOverride(game, filenameOrInfo, opts) {
    if (!game) return game;
    const fn = typeof filenameOrInfo === 'string'
      ? parseGameFilename(filenameOrInfo)
      : filenameOrInfo;
    if (!fn) return game;

    const isOrionTeam = opts && typeof opts.isOrionTeam === 'function'
      ? opts.isOrionTeam
      : (name => defaultIsOrionTeamName(name, opts && opts.orionName));
    const alreadyAligned =
      teamNamesLookSame(game.home, fn.home) && teamNamesLookSame(game.away, fn.away);
    const reversed =
      teamNamesLookSame(game.home, fn.away) || teamNamesLookSame(game.away, fn.home);
    if (!alreadyAligned && reversed) {
      swapGameHomeAway(game);
    } else if (!alreadyAligned) {
      const orionIsHomeFn = !!isOrionTeam(fn.home);
      const orionIsHomeParsed = !!isOrionTeam(game.home);
      if (orionIsHomeFn !== orionIsHomeParsed) swapGameHomeAway(game);
    }

    game.home = fn.home;
    game.away = fn.away;
    game.date = fn.date;
    game.venue = isOrionTeam(fn.home) ? 'Home' : 'Away';
    return game;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  global.OrionParser = {
    parsePdfFile,
    parseExcelFile,
    parseGameFilename,
    applyFilenameGameOverride,
    // Expose internals for debugging / custom flows
    _extractRowsFromPdf: extractRowsFromPdf,
    _parseScoreHeader: parseScoreHeader,
    _parseLineScore: parseLineScore,
    _parseBattingTables: parseBattingTables,
    _parsePitchingTables: parsePitchingTables,
    _applyFieldingErrorsToTable: applyFieldingErrorsToTable,
    _assembleGame: assembleGame,
    _applyFilenameHeaderHint: applyFilenameHeaderHint,
    _teamNamesLookSame: teamNamesLookSame
  };
})(typeof window !== 'undefined' ? window : globalThis);
