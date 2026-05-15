# GameChanger PDF 解析后端模块设计

## 目标

为 GameChanger 或同类棒垒球记录软件导出的 box score PDF 建立一套通用解析方案，而不是针对某一年、某个赛事、某几支球队或某个球员写特例。

解析器需要同时支持两类常见 PDF：

- 文本型 PDF：PDF 内部包含可抽取文字和坐标。典型方式是 `pdf.js getTextContent()` 或 `pdftohtml -xml` 可读到文本项。
- 图片型 PDF：整页是一张截图或图片，PDF 内部没有文字层。必须走图片渲染和 OCR。

最终目标是把 PDF 中可见的 box score 数据完整拆成结构化 JSON，经过校验和人工确认后再写入比赛数据库。

## 不应写死的内容

解析算法不得依赖以下固定值：

- 年份，例如 2025、2026。
- 赛事名称，例如奥体慢垒、猛虎杯。
- 球队名称，例如猎户座、猎户星、LHX。
- 球员名称，例如尹程。
- 文件路径、目录名或文件名格式。
- 固定页数。
- 固定左右队顺序。
- 固定表格行数。

这些信息只能作为外部输入、候选别名、校验辅助或人工确认字段，不能成为解析逻辑成立的前提。

## 总体架构

建议把 PDF 解析从前端 `parser.js` 升级为后端解析服务。

```text
Admin 上传 PDF
  -> POST /api/gamechanger/parse
    -> detectPdfKind()
      -> text PDF: parseTextPdf()
      -> image PDF: parseImagePdfWithOcr()
    -> normalizeGame()
    -> validateGame()
  -> 返回 parsedGame + warnings + rawEvidence
  -> Admin 预览确认
  -> 保存到 games
```

前端只做上传、预览、手动修正和确认。解析、OCR、校验、依赖系统工具的工作放在后端。

## 对当前项目实际 parser 的复用判断

当前项目实际运行的解析入口是：

- `orion-demo/admin.html`
- `orion-demo/assets/js/parser.js`

现状链路是：管理员在前端上传 PDF，浏览器通过 CDN 加载 `pdf.js`，再调用 `OrionParser.parsePdfFile(file, { orionName })`，解析完成后由 `DB.addGame(newGame)` 写入现有 `/api/games` 数据结构。

这个实现不是完全不能用。它里面已经有几块值得保留的成熟经验：

- `extractRowsFromPdf()`：用 `pdf.js getTextContent()` 抽取文字坐标，然后按 y 坐标归并成逻辑行。这对文本型 GameChanger PDF 是正确方向。
- `parseScoreHeader()` / `parseDate()` / `parseLineScore()`：比赛头、日期、逐局比分的识别思路可以继续沿用，但要放宽对文件名和固定行数的依赖。
- `detectLeftIsTeam1()`：通过表头附近的队名文字判断左右两栏归属，这个思路必须保留。
- `parseBattingTables()` 里最新的 footer 处理：per-side 分栏、进入 footer 状态后持续收集、再用 key-span 扫描 `2B/3B/HR/TB`。这是解决“尹程 HR 漏识别”的关键，应该作为新版 footer 层的基础。
- `parseFootersByKeySpan()`：不按逗号硬切，而是按下一个 key 的位置切 payload。这个设计正确，应保留。
- `applyHittingFootersToTable()`：把 `2B/3B/HR/TB` 回填到球员行，并用 TB 校验拆分结果。这个逻辑应保留并升级为后端校验层。
- `normalizeCJKText()` / `normalizeName()`：处理 PDF 中 CJK radical、空格、后缀、号码的归一化，这对中文球员名很重要，应继续使用。
- `assembleGame()`：最终输出已经贴合当前项目的 `games` 表结构，可以作为后端返回 `game` 的兼容层。

但它也有几个结构性缺口，不能只在原文件上继续小修：

- 它只适用于文本型 PDF。2025 猛虎杯这类整页图片 PDF，`getTextContent()` 基本没有文字层，前端 parser 必然识别不出来。
- 它在浏览器里跑，不能稳定调用 `pdftoppm`、`tesseract`、`pdftohtml` 这些系统工具，也不适合做批量 OCR。
- 它没有统一的 `sourceType`、`rawEvidence`、OCR 置信度、区域框、footer spans 等证据输出，出了错只能看 console。
- 批量导入时失败信息只在控制台，无法对每份 PDF 生成可追踪 warnings 和待人工确认项。
- 当前前端强依赖文件名模板 `<客队>_vs_<主队>_<Mon>_<DD>_<YYYY>.pdf`。文件名可以作为校验和覆盖输入，但不应成为通用解析算法成立的前提。
- 当前 parser 的投手 footer、fielding、baserunning、team batting detail 等额外数据还没有完整结构化保留。

因此最终方案不是“抛弃现有 parser”，而是“抽取现有 parser 里已经验证过的文本 PDF 算法，迁到后端模块，再补 OCR 分支、证据层和校验层”。

建议迁移关系如下：

```text
orion-demo/assets/js/parser.js
  extractRowsFromPdf              -> server/gamechanger/text-extract.js 或 parser.js 中的 extractTextRowsFromPdf
  parseScoreHeader                -> parseHeader
  parseDate                       -> parseDateFromRows
  parseLineScore                  -> parseLineScore
  detectLeftIsTeam1               -> detectSideOwnership
  parseBattingTables              -> parseSideBySideBatting
  parsePitchingTables             -> parseSideBySidePitching
  parseFootersByKeySpan           -> collectFooterSpans / parseFooterSpans
  applyHittingFootersToTable      -> applyFooterStatsToBatters
  normalizeCJKText / normalizeName -> normalizeText / normalizeName
  assembleGame                    -> assembleGame

新增：
  detectPdfKind
  parseImagePdfWithOcr
  OCR TSV word boxes
  region detection
  rawEvidence
  backend route /api/gamechanger/parse
```

保留现有前端 parser 作为短期兼容可以，但长期应让 `admin.html` 调后端 `/api/gamechanger/parse`。前端仍然负责预览、人工修正和确认保存。

## 当前核心算法漏判点与必须优化项

当前项目里的前端 parser 已经有坐标分行、左右分栏、footer key-span 等基础，但核心算法仍会漏判很多数据。必须补下面这些点。

### 1. 比赛头不能只认同一行标题

旧识别只适合：

```text
北京慧星棒垒球队 9 - 24 猎户座
```

但 GameChanger PDF 抽取后经常变成：

```text
9 - 24
北京慧星棒垒球队    猎户座
```

优化要求：

- 先保留同一行识别。
- 再增加“比分行 + 附近队名行”的识别。
- 队名行用 x 坐标最大间隔拆成左右两队。
- 文件名只能作为覆盖和校验，不能作为唯一来源。

### 2. footer 进入条件不能只看行首

旧逻辑只在本侧文本以 `2B:` / `3B:` / `HR:` / `TB:` 开头时进入 footer。实际 PDF 可能抽成：

```text
张三 2, 3B: 李四, HR: 尹程, TB: 尹程 5
```

这种情况下 `HR: 尹程` 不在行首，会被漏掉。

优化要求：

- 每一侧独立判断 footer。
- 本侧任意位置出现 footer key，就切入 footer 状态。
- 切入后，本侧后续行继续作为 footer 收集，直到 `PITCHING`。
- 左右两侧不能混在一起解析，否则左队 `TB:` 会吞右队 `2B:`。

### 3. footer payload 不能只按逗号拆

PDF 文本流不稳定，footer 可能有逗号，也可能没有逗号：

```text
TB: 靳江山 6, 韩绪 2
TB: 靳江山 6 韩绪 2 张睿奇 1
```

旧逻辑只按逗号拆，会把 `靳江山 6 韩绪 2 张睿奇 1` 当成一个名字，导致 TB、2B、3B、HR、SB 等大量漏判。

优化要求：

- 先用 key-span 切出 `TB:` 到下一个 key 之间的 payload。
- 再用当前 batting 表中已经解析出的球员姓名反向扫描 payload。
- 匹配到球员名后，读取球员名后面的可选数字。
- 如果球员名没有命中，再退回逗号拆分。
- 姓名匹配必须走 `normalizeName()` / `normalizeCJKText()`，处理 PDF 部首字、空格、号码、后缀。

### 4. footer 统计项的语义必须按“字段最终值”处理

GameChanger footer 里的统计项不是“事件日志”，而是“该字段对该球员的最终统计值”。

```text
TB: 靳江山 6
2B: 张三 2
HR: 李四 1
SB: 王五 3
```

含义是：

```text
靳江山.TB = 6
张三._2B = 2
李四.HR = 1
王五.SB = 3
```

不是：

```text
靳江山发生了 6 次 TB 事件
在已有 2B/HR/SB 上继续重复累加
```

因此回填规则必须统一：

- `1B/2B/3B/HR/TB/SB/CS/HBP/IBB/SF/SH/GIDP/E` 都应赋值为 PDF 给出的数值。
- 同一球员同一字段重复出现且数值一致，可以忽略重复。
- 同一球员同一字段重复出现且数值不一致，必须进入 warnings。
- 如果 PDF 没有给 `1B`，再用 `H - 2B - 3B - HR` 计算。
- 如果 PDF 明确给了 `1B`，应保留 PDF 值，并用 `H = 1B + 2B + 3B + HR` 校验。

TB 同时用于校验：

```text
1B = H - 2B - 3B - HR
computedTB = 1B + 2*2B + 3*3B + 4*HR
```

如果 `PDF_TB !== computedTB`，说明 footer 或安打拆分存在问题，必须提示管理员人工核对。

### 5. 回填字段不能只保留长打

当前网站积分主要用 `_1B/_2B/_3B/HR/RBI/BB/SO`，但 GameChanger PDF 里还有很多可结构化数据，不能解析后丢掉。

短期至少应回填到 batting 行：

```text
1B, 2B, 3B, HR, TB, SB, CS, HBP, IBB, SF, SH, GIDP, E
```

长期后端结构还应保留到 `teamStats`：

```text
Batting: RBI, 2-out RBI, LOB, Team LOB, Scoring position
Baserunning: SB, CS
Fielding: E, PB, DP
Pitching detail: BF, P-S, WP, HBP, Ground balls-fly balls
```

这些字段不一定都参与积分，但属于 PDF 可见数据，后端解析器应该拆出来。

### 6. 投手表扫描必须有边界

旧逻辑在投手表头后继续扫描多行，可能把这些 footer 续行误当成投手候选：

```text
W: 尹程, P-S: 尹程 124-80, BF: 尹程 53
E: 贾天义, 尹程
```

优化要求：

- 左右两侧分别扫描。
- 该侧遇到 `Totals` 或 `W:/L:/S:/P-S:/BF:/HBP:/WP:/BK:/E:` 后，该侧投手表结束。
- 两侧都结束后停止扫描。
- 不要只用固定 20 行、40 行做安全边界。

### 7. warnings 必须成为保存前流程的一部分

以下情况不能静默导入：

- footer 提到球员，但 batting 表没有这个人。
- `H !== 1B + 2B + 3B + HR`。
- `TB !== 1B + 2*2B + 3*3B + 4*HR`。
- 同一球员同一 footer 字段出现多个不同值。
- 解析到 0 个打者或 0 个投手。
- PDF 是图片型，需要 OCR。

管理员保存前必须看到 warnings，并能决定修正或继续。

## 推荐模块划分

```text
server/gamechanger/
  index.js                 # 对外入口 parseGameChangerPdf()
  detect.js                # PDF 类型识别
  text-extract.js           # 文本 PDF 坐标抽取
  image-extract.js          # PDF 渲染成图片
  ocr.js                   # OCR TSV 解析
  layout.js                # 版面/列/区域识别
  tables.js                # batting / pitching / linescore 表格解析
  footers.js               # footer grammar 解析
  normalize.js             # 姓名、队名、数字、CJK 部首归一化
  validate.js              # 合计校验和 warnings
  schema.js                # 输出结构约定

server/routes/gamechanger.js
```

## 输出数据结构

解析结果应保留比赛主体数据、球队扩展数据、解析证据和警告。

```json
{
  "sourceType": "text-pdf | image-ocr-pdf",
  "parserVersion": "gamechanger-v2",
  "game": {
    "date": "",
    "venue": "",
    "innings": 0,
    "home": "",
    "away": "",
    "homeScore": 0,
    "awayScore": 0,
    "linescore": {
      "home": [],
      "away": []
    },
    "homeTotals": {
      "R": 0,
      "H": 0,
      "E": 0
    },
    "awayTotals": {
      "R": 0,
      "H": 0,
      "E": 0
    },
    "batting": [],
    "oppBatting": [],
    "pitching": [],
    "oppPitching": [],
    "teamStats": {
      "home": {},
      "away": {}
    },
    "mvpPlayerName": "",
    "mvpNote": ""
  },
  "warnings": [],
  "rawEvidence": {
    "textRows": [],
    "ocrWords": [],
    "regions": {},
    "footerSpans": []
  }
}
```

`batting` 每行建议保留：

```json
{
  "name": "",
  "pos": "",
  "AB": 0,
  "R": 0,
  "H": 0,
  "RBI": 0,
  "BB": 0,
  "SO": 0,
  "_1B": 0,
  "_2B": 0,
  "_3B": 0,
  "HR": 0,
  "TB": 0,
  "SB": 0,
  "CS": 0
}
```

`pitching` 每行建议保留：

```json
{
  "name": "",
  "IP": 0,
  "H": 0,
  "R": 0,
  "ER": 0,
  "BB": 0,
  "SO": 0,
  "HR": 0,
  "decision": "",
  "WP": 0,
  "HBP": 0,
  "BF": 0,
  "pitches": 0,
  "strikes": 0,
  "GB": 0,
  "FB": 0
}
```

`teamStats` 建议保留：

```json
{
  "batting": {
    "RBI": [],
    "twoOutRBI": [],
    "scoringPosition": "",
    "LOB": 0
  },
  "baserunning": {
    "SB": [],
    "CS": []
  },
  "fielding": {
    "E": [],
    "PB": []
  },
  "pitchingDetail": {
    "WP": [],
    "HBP": [],
    "pitchesStrikes": [],
    "groundFly": [],
    "battersFaced": []
  },
  "misc": {
    "umpires": "",
    "time": "",
    "weather": ""
  }
}
```

## PDF 类型识别

识别不能只看文件名。应基于内容：

1. 抽取 PDF 文本项。
2. 如果文本项数量足够，并且能找到 box score 常见锚点，走文本解析。
3. 如果文本项为空、极少或没有表格锚点，走图片 OCR。

常见锚点包括：

- `AB R H RBI BB SO`
- `IP H R ER BB SO HR`
- `BATTING`
- `PITCHING`
- `Box score for`
- `R H E`

判断逻辑：

```text
if textItemCount >= threshold
   and has batting/pitching/linescore anchors:
       parse as text PDF
else:
       parse as image/OCR PDF
```

## 文本 PDF 解析策略

文本 PDF 应使用坐标，而不是只使用纯文本。

### 1. 抽取文字项

每个文字项保留：

- page
- x
- y
- width
- height
- text

然后按 y 坐标合并为逻辑行，行内按 x 坐标排序。

### 2. 识别比赛头部

支持多种头部格式：

```text
Team A 9 - 24 Team B
Team A Team B 9 - 24
Box score for AAA at BBB 11/16/25
```

如果无法稳定识别，应允许前端传入候选：

- homeTeam
- awayTeam
- date
- teamAliases

这些候选只用于补充或校验，不应成为唯一逻辑。

### 3. 识别 linescore

寻找包含局数与 `R H E` 的行。

支持：

```text
1 2 3 4 R H E
1 2 3 4 5 6 7 R H E
1 2 3 4 5 R H E L
```

注意：

- 有些 GameChanger box score 会带 `L` 或其他额外列。
- `X` 应作为半局未打保留。
- 队伍行不一定是中文全名，可能是缩写。

### 4. 识别左右表格

GameChanger 常见版式是左右两队并排。

打击表通过 `AB R H RBI BB SO` 定位列坐标。

投手表通过 `IP H R ER BB SO HR` 定位列坐标。

左右分割线不应写死页面中线，应由表头列坐标计算：

```text
leftLastStatX = left side 最后一列统计项 x
rightFirstStatX = right side 第一列统计项 x
rightTeamLabelX = 两组统计列之间的队名起点
splitX = midpoint(leftLastStatX, rightTeamLabelX)
```

每一行按 `splitX` 切成左队文本和右队文本，再分别解析。

### 5. 打击表行解析

基础行格式：

```text
Name (POS) AB R H RBI BB SO
Name POS AB R H RBI BB SO
Name AB R H RBI BB SO
```

解析规则：

- 末尾 6 个数字作为 `AB R H RBI BB SO`。
- 前缀拆为姓名和位置。
- 姓名需要做 CJK 部首归一化、空白归一化、编号清洗。
- 不要把 `Totals` 当球员。

### 6. 投手表行解析

基础行格式：

```text
Name IP H R ER BB SO HR
Name (W) IP H R ER BB SO HR
Name (L) IP H R ER BB SO HR
```

解析规则：

- 末尾 7 个数字作为 `IP H R ER BB SO HR`。
- 姓名前的 `(W)`、`(L)`、`(S)` 解析为 decision。
- 不要把 `Totals` 当球员。

## Footer 解析策略

这是当前算法最需要重做的部分。

GameChanger footer 常见内容：

```text
2B:
3B:
HR:
TB:
RBI:
2-out RBI:
Scoring position:
Team LOB:
SB:
CS:
E:
PB:
WP:
HBP:
Pitches-strikes:
Ground balls-fly balls:
Batters faced:
```

### 核心原则

1. Footer 必须按左右队分栏收集。
2. Footer 必须从 `Totals` 后持续收集到下一个大区块，例如 `PITCHING`。
3. 不要只收“行首是 key”的行。
4. 不要用逗号判断字段结束。
5. 应用 key-span 扫描：找到所有 key 的位置，当前 key 的值到下一个 key 前结束。

### key-span 解析

逻辑：

```text
输入：
  "2B: A, B 2, 3B: C, HR: D, TB: A 2, B 4, LOB: 8"

输出：
  [
    { key: "2B", value: "A, B 2" },
    { key: "3B", value: "C" },
    { key: "HR", value: "D" },
    { key: "TB", value: "A 2, B 4" },
    { key: "LOB", value: "8" }
  ]
```

### 回填原则

`1B/2B/3B/HR/TB/SB/CS/HBP/IBB/SF/SH/GIDP/E` 回填到本队球员行。

这些字段在 footer 中是最终统计值，应赋值而不是累加。

不要跨两队全局匹配，防止同名球员串队。

`RBI/PB/WP/Pitches-strikes/Batters faced` 应作为团队扩展数据保留，同时可按球员名回填到对应行。

### TB 的作用

`TB` 不只是展示字段，也是长打拆分的校验字段。

校验公式：

```text
H = 1B + 2B + 3B + HR
TB = 1B + 2*2B + 3*3B + 4*HR
```

如果 PDF 给出的 TB 和拆分结果不一致，应进入 warnings，由管理员确认。

## 图片/OCR PDF 解析策略

图片 PDF 不应尝试用 `pdf.js getTextContent()` 解析。应走 OCR。

### 1. 渲染图片

用后端工具将 PDF 页面渲染成高分辨率图片。

建议：

```text
pdftoppm -r 220 -png -singlefile input.pdf output
```

### 2. OCR 输出 TSV

使用 OCR 的 TSV/word boxes，而不是纯文本。

每个词保留：

- text
- confidence
- left
- top
- width
- height

原因：

- 表格解析需要列坐标。
- 左右队需要区域分割。
- 低置信度词需要 warnings。

### 3. 图片预处理

成熟实现应包含：

- 放大到 220-300 DPI。
- 灰度化。
- 自适应二值化。
- 轻微锐化。
- 去除大块水印或页脚区域对表格识别的干扰。
- 对数字列单独 OCR 时使用数字白名单。

### 4. 版面区域识别

不要整页 OCR 后用正则硬拆。应先识别区域：

```text
Header / linescore
Left batting table
Right batting table
Left batting footers
Right batting footers
Left pitching table
Right pitching table
Left pitching footers
Right pitching footers
Misc footer
```

区域识别依据：

- `Box score for`
- `R H E`
- `AB R H RBI BB SO`
- `IP H R ER BB SO HR`
- `Batting`
- `Baserunning`
- `Fielding`
- `Pitchers`
- 页面宽度中线或由表头坐标推断出的 `splitX`

### 5. OCR 表格解析

表格解析不依赖整行 OCR 文本。

应从表头坐标建立列模型：

```text
AB column x
R column x
H column x
RBI column x
BB column x
SO column x
```

对每个球员行：

- 姓名区域：表格左边到 AB 列之前。
- 数字区域：按列 x 坐标归属。
- 行 y 坐标：按 word centerY 聚合。

数字列如果 OCR 混乱，应对单元格小区域做二次 OCR。

### 6. OCR 姓名纠错

OCR 对中文姓名会有误识别。需要一个通用纠错层：

- 上传时可传入 roster 候选。
- 项目中球员池也可作为候选。
- 使用 normalize 后的编辑距离或拼音相似度。
- 低置信或多候选进入 warnings。

不要把 roster 当硬规则；对手球员可能不在系统里。

## 校验层

所有解析结果都必须经过校验。

### 比赛级校验

```text
homeScore == homeTotals.R
awayScore == awayTotals.R
linescore sum == R
```

### 打击校验

```text
sum(batting.R) == team R
sum(batting.H) == team H
sum(batting.RBI) 合理但不一定等于 R
每个球员 H == 1B + 2B + 3B + HR
如果有 TB，TB == 1B + 2*2B + 3*3B + 4*HR
```

### 投手校验

```text
sum(pitching.H) == opponent H
sum(pitching.R) == opponent R
sum(pitching.ER) <= sum(pitching.R)
sum(pitching.HR) == opponent batting HR
```

### OCR 置信度校验

触发 warnings 的情况：

- OCR 字符置信度低。
- 数字列包含非数字字符。
- 姓名无法匹配。
- 表格合计不一致。
- footer 球员无法匹配。
- 同一 footer 球员匹配到多个候选。
- PDF 是图片型，需要人工确认。

## 后端依赖

建议后端环境安装：

```text
poppler-utils
tesseract
tesseract language data: eng, chi_sim
```

如果部署环境是 Alpine，Dockerfile 中类似：

```text
apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-chi_sim
```

如果云托管镜像无法稳定安装 OCR 依赖，应把 OCR 分支做成异步任务或单独 worker。

## API 设计

```http
POST /api/gamechanger/parse
Content-Type: multipart/form-data

file: PDF
orionName?: string
homeTeam?: string
awayTeam?: string
date?: string
teamAliases?: JSON
roster?: JSON
```

返回：

```json
{
  "sourceType": "text-pdf",
  "parserVersion": "gamechanger-v2",
  "game": {},
  "warnings": [],
  "rawEvidence": {}
}
```

保存比赛应仍走现有 `POST /api/games`，解析接口只负责解析和预览。

## Admin 交互建议

上传 PDF 后不要直接入库。

应展示：

- 识别出的比赛信息。
- 逐局比分。
- 两队打击表。
- 两队投手表。
- footer 拆出来的扩展数据。
- warnings。
- 原始 PDF 预览。

管理员确认后再保存。

对 OCR PDF，默认提示“需要人工确认”。

## 渐进落地顺序

第一阶段：重构文本 PDF parser。

- 加 `detectPdfKind()`。
- 文本 PDF 使用坐标行。
- 打击 footer 改为左右分栏。
- 使用 key-span 解析。
- 回填 `2B/3B/HR/TB/SB/CS`。
- 增加合计校验。

第二阶段：后端解析接口。

- 新增 `/api/gamechanger/parse`。
- 前端 admin 上传后先预览。
- 确认后再写 games。

第三阶段：OCR 分支。

- PDF 渲染成图片。
- OCR TSV。
- 区域识别。
- 表格列模型。
- 数字列二次 OCR。
- 姓名候选纠错。
- OCR warnings。

第四阶段：回归测试集。

建立 fixtures：

```text
fixtures/gamechanger/text-pdf/
fixtures/gamechanger/image-pdf/
fixtures/gamechanger/expected/
```

每份 PDF 保存 expected JSON，并测试：

- 能否识别 sourceType。
- 是否能识别比赛头。
- R/H/E 是否一致。
- H/1B/2B/3B/HR/TB 是否一致。
- OCR PDF warnings 是否出现。

## 关键设计结论

1. GameChanger PDF 不能只靠纯文本正则。
2. 可抽文本 PDF 也必须用坐标分栏。
3. 图片 PDF 必须走 OCR。
4. Footer 是独立语法层，应按队伍分栏后解析。
5. `TB` 必须保留，至少用于校验长打拆分。
6. 解析结果必须经过 warnings 和人工确认，不能静默入库。
7. 所有年份、赛事、队名、球员名都只能作为输入或校验辅助，不能写死在算法里。

---

# 成熟后端参考实现

下面代码是一个可落地的后端模块实现。它不是针对某几份 PDF 写特例，而是面向 GameChanger 这类 box score PDF 的通用解析器。

代码假设后端可调用这些系统工具：

- `pdftohtml`
- `pdftoppm`
- `tesseract`

调用方可通过请求参数提供辅助信息：

- `primaryTeamName`：当前网站关心的主队或我方队伍，用于把解析结果映射到 `batting/pitching`。
- `homeTeam` / `awayTeam`：当 OCR 标题只有缩写时辅助识别。
- `teamAliases`：缩写到队名的映射，例如 `{ "LHX": "猎户星" }`，由调用方传入，不写死在解析器里。
- `roster`：球员姓名候选，用于 OCR 姓名纠错。

## 文件 1：`server/gamechanger/parser.js`

```js
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const PARSER_VERSION = 'gamechanger-v2';

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const FOOTER_KEYS = [
  'Pitches-strikes',
  'Ground balls-fly balls',
  'Batters faced',
  'Scoring position',
  'Team LOB',
  '2-out RBI',
  'Pitchers',
  'Baserunning',
  'Fielding',
  'Batting',
  '1B',
  '2B',
  '3B',
  'HR',
  'TB',
  'RBI',
  'SB',
  'CS',
  'LOB',
  'E',
  'PB',
  'WP',
  'HBP',
  'BF',
  'P-S',
  'SAC',
  'SF',
  'SH',
  'IBB',
  'GIDP',
  'DP',
];

const CJK_RADICAL_MAP = {
  '⺁': '厂', '⺄': '卜', '⺈': '刂', '⺋': '匚', '⺌': '匸',
  '⺎': '卩', '⺒': '又', '⺔': '女', '⺕': '子', '⺖': '宀',
  '⺡': '弓', '⺢': '彐', '⺨': '忄', '⺪': '扌', '⺮': '氵',
  '⺱': '灬', '⺷': '王', '⺹': '见', '⺺': '示', '⺼': '纟',
  '⻂': '艹', '⻊': '走', '⻑': '长', '⻓': '长', '⻔': '门',
  '⻗': '阝', '⻘': '青', '⻜': '飞', '⻝': '食', '⻢': '马',
  '⻥': '见', '⻦': '鸟', '⻧': '鱼', '⻩': '黄', '⻫': '齐',
  '⻰': '龙', '⻲': '龟',
};

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-parser-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXmlText(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

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
  let n = normalizeCJKText(raw);
  n = n.replace(/^[.\u00B7·•]+\s*/, '');
  n = n.replace(/^\d+(?:\.\d+)?\s+(?=\S)/, '');
  n = n.replace(/\s+(asst|sub|mgr|coach|alt)\s*$/i, '');
  n = n.replace(/\s+pro\s*$/i, ' pro');
  n = n.replace(/\s+#?\d{1,3}\s*$/, '');
  return n.trim();
}

function compactKey(raw) {
  return normalizeCJKText(raw).replace(/\s+/g, '').toLowerCase();
}

function nameKey(raw) {
  return normalizeName(raw).replace(/\s+/g, '').toLowerCase();
}

function parseNumber(raw) {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[§S]/g, '5')
    .replace(/[^\d.-]/g, '');

  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateToken(monthOrDate, day, year) {
  if (!monthOrDate) return '';

  const monthKey = String(monthOrDate).slice(0, 3);
  const mon = MONTHS[monthKey.charAt(0).toUpperCase() + monthKey.slice(1).toLowerCase()];

  if (mon && day && year) {
    return `${year}-${mon}-${String(day).padStart(2, '0')}`;
  }

  const slash = String(monthOrDate).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${y}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }

  return '';
}

async function extractTextRowsFromPdf(pdfPath) {
  return withTempDir(async dir => {
    const outBase = path.join(dir, 'doc');
    await execFileP('pdftohtml', ['-xml', '-i', pdfPath, outBase]);
    const xml = await fs.readFile(`${outBase}.xml`, 'utf8');
    return parsePopplerXmlRows(xml);
  });
}

function parsePopplerXmlRows(xml) {
  const pages = [...xml.matchAll(/<page[^>]*number="(\d+)"[\s\S]*?<\/page>/g)];
  const rows = [];
  let textItemCount = 0;

  for (const pageMatch of pages) {
    const page = Number(pageMatch[1]);
    const body = pageMatch[0];
    const bands = [];

    for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const attrs = m[1];
      const str = decodeXmlText(m[2]);
      if (!str) continue;

      const x = Number((attrs.match(/left="([^"]+)"/) || [])[1] || 0);
      const y = Number((attrs.match(/top="([^"]+)"/) || [])[1] || 0);
      const width = Number((attrs.match(/width="([^"]+)"/) || [])[1] || 0);
      const height = Number((attrs.match(/height="([^"]+)"/) || [])[1] || 0);

      textItemCount++;
      let band = bands.find(b => Math.abs(b.y - y) <= 3);
      if (!band) {
        band = { y, cells: [] };
        bands.push(band);
      }
      band.cells.push({ x, y, width, height, str });
    }

    bands.sort((a, b) => a.y - b.y);
    for (const band of bands) {
      band.cells.sort((a, b) => a.x - b.x);
      rows.push({
        page,
        y: band.y,
        cells: band.cells,
        text: band.cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return { rows, textItemCount };
}

function detectPdfKind(textDoc) {
  const joined = textDoc.rows.map(r => r.text).join('\n');
  const hasBattingHeader = /AB\s+R\s+H\s+RBI\s+BB\s+SO/i.test(joined);
  const hasPitchingHeader = /IP\s+H\s+R\s+ER\s+BB\s+SO\s+HR/i.test(joined);
  const hasBoxScoreAnchor = /BATTING|PITCHING|Box score for|R\s+H\s+E/i.test(joined);

  if (textDoc.textItemCount >= 30 && hasBoxScoreAnchor && (hasBattingHeader || hasPitchingHeader)) {
    return 'text-pdf';
  }
  return 'image-ocr-pdf';
}

function parseTextHeader(rows, opts = {}) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const txt = normalizeCJKText(rows[i].text);

    let m = txt.match(/^(\D+?)\s*(\d+)\s*[-–]\s*(\d+)\s+(\D.+?)$/);
    if (m) {
      return {
        team1: normalizeCJKText(m[1]),
        team2: normalizeCJKText(m[4]),
        score1: Number(m[2]),
        score2: Number(m[3]),
        rowIdx: i,
      };
    }

    m = txt.match(/^(.+?)\s+(.+?)\s+(\d+)\s*[-–]\s*(\d+)$/);
    if (m && !/^\d+$/.test(m[1]) && !/^\d+$/.test(m[2])) {
      return {
        team1: normalizeCJKText(m[1]),
        team2: normalizeCJKText(m[2]),
        score1: Number(m[3]),
        score2: Number(m[4]),
        rowIdx: i,
      };
    }

    m = txt.match(/Box score for\s+(.+?)\s+at\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (m) {
      const away = resolveTeamAlias(m[1], opts);
      const home = resolveTeamAlias(m[2], opts);
      return {
        team1: away,
        team2: home,
        score1: 0,
        score2: 0,
        rowIdx: i,
        date: parseDateToken(m[3]),
      };
    }
  }
  return null;
}

function resolveTeamAlias(raw, opts = {}) {
  const s = normalizeCJKText(raw);
  const aliases = opts.teamAliases || {};
  return aliases[s] || aliases[s.toUpperCase()] || s;
}

function parseDateFromRows(rows) {
  for (const r of rows.slice(0, 30)) {
    const txt = normalizeCJKText(r.text);

    const m = txt.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m) return parseDateToken(m[2], m[3], m[4]);

    const m2 = txt.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;

    const m3 = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m3) return parseDateToken(m3[0]);
  }
  return '';
}

function parseVenueFromRows(rows) {
  for (const r of rows.slice(0, 30)) {
    if (/\bAway\b/i.test(r.text)) return 'Away';
    if (/\bHome\b/i.test(r.text)) return 'Home';
  }
  return '';
}

function parseLineScore(rows, team1, team2, startIdx = 0) {
  let headerIdx = -1;

  for (let i = startIdx; i < Math.min(rows.length, startIdx + 50); i++) {
    const cells = rows[i].text.split(/\s+/).filter(Boolean);
    const hasInnings = cells[0] === '1' && cells[1] === '2';
    const hasTotals = cells.includes('R') && cells.includes('H');
    if (hasInnings && hasTotals) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) return null;

  const hdrCells = rows[headerIdx].text.split(/\s+/).filter(Boolean);
  const rIdx = hdrCells.indexOf('R');
  const innings = rIdx > 0 ? rIdx : hdrCells.filter(x => /^\d+$/.test(x)).length;

  const teamLines = [];
  let endIdx = headerIdx + 1;

  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 12); i++) {
    const parsed = parseLineScoreTeamRow(rows[i], [team1, team2], innings);
    if (parsed) {
      teamLines.push(parsed);
      endIdx = i + 1;
      if (teamLines.length === 2) break;
    }
  }

  if (teamLines.length < 2) return null;
  return {
    innings,
    line1: teamLines[0],
    line2: teamLines[1],
    endIdx,
  };
}

function parseLineScoreTeamRow(row, teams, innings) {
  let txt = normalizeCJKText(row.text);
  let name = '';

  for (const team of teams) {
    if (!team) continue;
    const flex = new RegExp(`^${escapeRegex(team).replace(/\s+/g, '\\s*')}`);
    const m = txt.match(flex);
    if (m) {
      name = team;
      txt = txt.slice(m[0].length).trim();
      break;
    }

    if (compactKey(txt).startsWith(compactKey(team))) {
      name = team;
      const m2 = txt.match(/^([^\d]+?)\s+(\d|X)/);
      if (m2) txt = txt.slice(m2[1].length).trim();
      break;
    }
  }

  if (!name) {
    const m = txt.match(/^([^\d]+?)\s+(\d|X)/);
    if (!m) return null;
    name = normalizeCJKText(m[1]);
    txt = txt.slice(m[1].length).trim();
  }

  const cells = txt.split(/\s+/).filter(Boolean);
  if (cells.length < innings + 3) return null;

  return {
    name,
    linescore: cells.slice(0, innings).map(v => /^\d+$/.test(v) ? Number(v) : v),
    totals: {
      R: parseNumber(cells[innings]),
      H: parseNumber(cells[innings + 1]),
      E: parseNumber(cells[innings + 2]),
    },
  };
}

function columnXsFromHeader(row, statNames) {
  const xs = {};
  for (const cell of row.cells || []) {
    const text = String(cell.str).trim();
    if (!statNames.includes(text)) continue;
    if (!xs[text]) xs[text] = [];
    xs[text].push(cell.x);
  }
  for (const key of Object.keys(xs)) xs[key].sort((a, b) => a - b);
  return xs;
}

function computeSplitX(headerRow, columnXs, statNames) {
  const firstXs = columnXs[statNames[0]] || [];
  if (firstXs.length < 2) return null;

  let leftMaxStatX = -Infinity;
  let rightMinStatX = Infinity;

  for (const statName of statNames) {
    const xs = columnXs[statName] || [];
    if (xs.length < 2) continue;
    leftMaxStatX = Math.max(leftMaxStatX, xs[0]);
    rightMinStatX = Math.min(rightMinStatX, xs[1]);
  }

  if (!Number.isFinite(leftMaxStatX) || !Number.isFinite(rightMinStatX)) {
    return (firstXs[0] + firstXs[1]) / 2;
  }

  let rightTeamLabelX = rightMinStatX;
  const statSet = new Set(statNames);

  for (const cell of headerRow.cells || []) {
    const text = String(cell.str).trim();
    if (statSet.has(text)) continue;
    if (cell.x > leftMaxStatX + 2 && cell.x < rightMinStatX - 2) {
      rightTeamLabelX = Math.min(rightTeamLabelX, cell.x);
    }
  }

  return (leftMaxStatX + rightTeamLabelX) / 2;
}

function detectLeftIsTeam1(headerRow, columnXs, statNames, team1, team2) {
  const firstXs = (columnXs[statNames[0]] || []).slice().sort((a, b) => a - b);
  if (firstXs.length < 2) return true;

  const leftStatStart = firstXs[0];
  const rightStatStart = firstXs[1];
  const statSet = new Set(statNames);

  let leftText = '';
  let rightText = '';

  for (const cell of headerRow.cells || []) {
    const text = String(cell.str).trim();
    if (statSet.has(text)) continue;
    if (cell.x < leftStatStart - 2) leftText += text;
    else if (cell.x > leftStatStart && cell.x < rightStatStart - 2) rightText += text;
  }

  const left = compactKey(leftText);
  const right = compactKey(rightText);
  const t1 = compactKey(team1);
  const t2 = compactKey(team2);

  function score(a, b) {
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return 20;
    let n = 0;
    for (let i = 0; i + 2 <= a.length; i++) {
      if (b.includes(a.slice(i, i + 2))) n++;
    }
    return n;
  }

  return score(left, t1) + score(right, t2) >= score(left, t2) + score(right, t1);
}

function hasFooterKey(text) {
  const s = normalizeCJKText(text);
  return FOOTER_KEYS.some(key => new RegExp(`\\b${escapeRegex(key)}\\s*:`, 'i').test(s));
}

function parseKeySpans(text) {
  const cleaned = normalizeCJKText(text);
  if (!cleaned) return [];

  const keys = FOOTER_KEYS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  const re = new RegExp(`(?:^|[\\s,;])(${keys.join('|')})\\s*:`, 'gi');
  const marks = [];
  let m;

  while ((m = re.exec(cleaned)) !== null) {
    marks.push({
      key: m[1].toUpperCase(),
      start: m.index,
      valueStart: re.lastIndex,
    });
  }

  return marks.map((mark, i) => ({
    key: mark.key,
    value: cleaned
      .slice(mark.valueStart, marks[i + 1]?.start ?? cleaned.length)
      .replace(/^[,;]\s*/, '')
      .replace(/[,;]\s*$/, '')
      .trim(),
  })).filter(span => span.value);
}

function splitNameCountList(value) {
  const cleaned = normalizeCJKText(value)
    .replace(/[，、；;]/g, ',')
    .replace(/\.\./g, '')
    .replace(/[•·]/g, '')
    .trim();

  return cleaned
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => {
      let text = item.replace(/\([^)]*\)/g, '').trim();
      let count = 1;

      let m = text.match(/^(.+?)\s*[（(]\s*(\d+)\s*[）)]$/);
      if (m) {
        text = m[1].trim();
        count = Number(m[2]) || 1;
      } else {
        m = text.match(/^(.+?)\s+(\d+)$/);
        if (m) {
          text = m[1].trim();
          count = Number(m[2]) || 1;
        }
      }

      return { name: normalizeName(text), count };
    })
    .filter(item => item.name && !/^\d+$/.test(item.name));
}

function footerNameKey(value) {
  return nameKey(normalizeName(value)).replace(/[,\s，、:：]/g, '');
}

function findFooterTarget(teamRows, rawName) {
  const key = footerNameKey(rawName);
  if (!key) return null;

  const candidates = teamRows
    .map(row => ({ row, key: footerNameKey(row.name) }))
    .filter(item => item.key);

  return candidates.find(item => item.key === key)?.row
    || candidates.find(item => key.length >= 2 && (item.key.includes(key) || key.includes(item.key)))?.row
    || null;
}

function extractFooterItems(value, teamRows) {
  const payload = normalizeCJKText(value || '').replace(/[，、；;]/g, ',');
  const candidates = teamRows
    .map(row => ({ name: row.name, key: footerNameKey(row.name) }))
    .filter(item => item.key && item.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);

  const used = [];
  const found = [];
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;

  for (const candidate of candidates) {
    let from = 0;
    while (from < payload.length) {
      const start = payload.indexOf(candidate.key, from);
      if (start < 0) break;

      const hit = { start, end: start + candidate.key.length };
      from = start + Math.max(1, candidate.key.length);
      if (used.some(item => overlaps(item, hit))) continue;

      const after = payload.slice(hit.end);
      const m = after.match(/^\s*(?:[（(]\s*(\d+)\s*[）)]|(\d+))?/);
      const count = m && (m[1] || m[2]) ? Number(m[1] || m[2]) || 1 : 1;

      used.push(hit);
      found.push({ name: candidate.name, count, _start: start });
    }
  }

  if (found.length) {
    return found.sort((a, b) => a._start - b._start);
  }

  return splitNameCountList(value);
}

function assignFooterStat(row, field, value, warnings, label, statName) {
  if (!row._footerAssignedStats) {
    Object.defineProperty(row, '_footerAssignedStats', {
      value: {},
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  if (row._footerAssignedStats[field] && row[field] !== value) {
    warnings.push(`${label} ${row.name} ${statName} 重复且数值不一致：${row[field]} / ${value}`);
  }

  row._footerAssignedStats[field] = true;
  row[field] = value;
}

function parseBattingRow(text) {
  const txt = normalizeCJKText(text);
  if (!txt || /(?:^|\s)(totals?|总计|合计)(?:\s|$)/i.test(txt)) return null;

  const tailMatch = txt.match(/([-\d.]+(?:\s+[-\d.]+){5,7})\s*$/);
  if (!tailMatch) return null;

  const stats = tailMatch[1].split(/\s+/).map(parseNumber).slice(-6);
  if (stats.length !== 6 || stats.some(n => !Number.isFinite(n))) return null;

  let prefix = txt.slice(0, txt.length - tailMatch[0].length).trim();
  let pos = '';

  const parenPos = prefix.match(/\(([^)]+)\)\s*$/);
  if (parenPos) {
    pos = parenPos[1].trim();
    prefix = prefix.slice(0, parenPos.index).trim();
  } else {
    const inlinePos = prefix.match(/^(.+?)\s+([a-z0-9-]{1,10})$/i);
    if (inlinePos && /^(p|c|1b|2b|3b|ss|lf|cf|rf|sf|dh|of)(-|$)/i.test(inlinePos[2])) {
      prefix = inlinePos[1].trim();
      pos = inlinePos[2].trim();
    }
  }

  const name = normalizeName(prefix);
  if (!name) return null;

  return {
    name,
    pos,
    AB: stats[0] || 0,
    R: stats[1] || 0,
    H: stats[2] || 0,
    RBI: stats[3] || 0,
    BB: stats[4] || 0,
    SO: stats[5] || 0,
  };
}

function parsePitchingRow(text) {
  const txt = normalizeCJKText(text);
  if (!txt || /(?:^|\s)(totals?|总计|合计)(?:\s|$)/i.test(txt)) return null;

  const tailMatch = txt.match(/([\d.]+(?:\s+[-\d.]+){6,8})\s*$/);
  if (!tailMatch) return null;

  const stats = tailMatch[1].split(/\s+/).map(parseNumber).slice(-7);
  if (stats.length !== 7 || stats.some(n => !Number.isFinite(n))) return null;

  let prefix = txt.slice(0, txt.length - tailMatch[0].length).trim();
  let decision = '';

  const decisionMatch = prefix.match(/\(([WLS])\)\s*$/i);
  if (decisionMatch) {
    decision = decisionMatch[1].toUpperCase();
    prefix = prefix.slice(0, decisionMatch.index).trim();
  }

  const name = normalizeName(prefix);
  if (!name) return null;

  return {
    name,
    IP: stats[0] || 0,
    H: stats[1] || 0,
    R: stats[2] || 0,
    ER: stats[3] || 0,
    BB: stats[4] || 0,
    SO: stats[5] || 0,
    HR: stats[6] || 0,
    decision,
  };
}

function applyRosterCorrection(name, roster, warnings, context) {
  if (!roster || !Array.isArray(roster) || !roster.length) return name;

  const key = nameKey(name);
  const exact = roster.find(r => nameKey(typeof r === 'string' ? r : r.name) === key);
  if (exact) return typeof exact === 'string' ? exact : exact.name;

  let best = null;
  for (const candidate of roster) {
    const candidateName = typeof candidate === 'string' ? candidate : candidate.name;
    const d = editDistance(key, nameKey(candidateName));
    if (!best || d < best.distance) best = { name: candidateName, distance: d };
  }

  if (best && best.distance <= 1) {
    warnings.push(`${context} OCR 姓名自动纠正：${name} -> ${best.name}`);
    return best.name;
  }

  return name;
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function applyBattingFooters(teamRows, footerSpans, warnings, label, opts = {}) {
  for (const row of teamRows) {
    row.name = applyRosterCorrection(row.name, opts.roster, warnings, `${label}打者`);
    row._1B = row._1B || 0;
    row._2B = row._2B || 0;
    row._3B = row._3B || 0;
    row.HR = row.HR || 0;
  }

  const byName = new Map(teamRows.map(row => [nameKey(row.name), row]));
  const teamStats = {
    batting: {},
    baserunning: {},
    fielding: {},
    pitchingDetail: {},
    raw: footerSpans,
  };

  for (const span of footerSpans) {
    const key = span.key;

    if (['1B', '2B', '3B', 'HR', 'TB', 'SB', 'CS', 'HBP', 'IBB', 'SF', 'SH', 'SAC', 'GIDP', 'E'].includes(key)) {
      for (const item of extractFooterItems(span.value, teamRows)) {
        const row = findFooterTarget(teamRows, item.name) || byName.get(nameKey(item.name));
        if (!row) {
          warnings.push(`${label} footer 未匹配球员：${key} ${item.name}`);
          continue;
        }

        if (key === '1B') assignFooterStat(row, '_1B', item.count, warnings, label, '1B');
        if (key === '2B') assignFooterStat(row, '_2B', item.count, warnings, label, '2B');
        if (key === '3B') assignFooterStat(row, '_3B', item.count, warnings, label, '3B');
        if (key === 'HR') assignFooterStat(row, 'HR', item.count, warnings, label, 'HR');
        if (key === 'TB') {
          assignFooterStat(row, 'TB', item.count, warnings, label, 'TB');
        }
        if (key === 'SB') assignFooterStat(row, 'SB', item.count, warnings, label, 'SB');
        if (key === 'CS') assignFooterStat(row, 'CS', item.count, warnings, label, 'CS');
        if (key === 'HBP') assignFooterStat(row, 'HBP', item.count, warnings, label, 'HBP');
        if (key === 'IBB') assignFooterStat(row, 'IBB', item.count, warnings, label, 'IBB');
        if (key === 'SF') assignFooterStat(row, 'SF', item.count, warnings, label, 'SF');
        if (key === 'SH' || key === 'SAC') assignFooterStat(row, 'SH', item.count, warnings, label, key);
        if (key === 'GIDP') assignFooterStat(row, 'GIDP', item.count, warnings, label, 'GIDP');
        if (key === 'E') assignFooterStat(row, 'E', item.count, warnings, label, 'E');
      }
      continue;
    }

    if (['RBI', '2-OUT RBI', 'SCORING POSITION', 'TEAM LOB', 'LOB'].includes(key)) {
      teamStats.batting[key] = span.value;
    } else if (['E', 'PB'].includes(key)) {
      teamStats.fielding[key] = span.value;
    } else if (['WP', 'HBP', 'PITCHES-STRIKES', 'GROUND BALLS-FLY BALLS', 'BATTERS FACED', 'BF', 'P-S'].includes(key)) {
      teamStats.pitchingDetail[key] = span.value;
    }
  }

  for (const row of teamRows) {
    const computed1B = Math.max(0, (row.H || 0) - (row._2B || 0) - (row._3B || 0) - (row.HR || 0));
    if (row._footerAssignedStats && row._footerAssignedStats._1B) {
      if (row._1B !== computed1B) {
        warnings.push(`${label} ${row.name} 1B 校验不一致：PDF=${row._1B}，H-2B-3B-HR=${computed1B}`);
      }
    } else {
      row._1B = computed1B;
    }

    const hitParts = row._1B + row._2B + row._3B + row.HR;
    if (hitParts !== row.H) {
      warnings.push(`${label} ${row.name} H 拆分不一致：H=${row.H}，1B/2B/3B/HR=${row._1B}/${row._2B}/${row._3B}/${row.HR}`);
    }

    const computedTB = row._1B + row._2B * 2 + row._3B * 3 + row.HR * 4;
    if (row.TB != null && row.TB !== computedTB) {
      warnings.push(`${label} ${row.name} TB 校验不一致：PDF=${row.TB}，计算=${computedTB}`);
    }
    if (row.TB == null) row.TB = computedTB;
  }

  return teamStats;
}

function parseSideBySideBatting(rows, startIdx, team1, team2, opts = {}) {
  const warnings = [];
  let battingIdx = -1;

  for (let i = startIdx; i < rows.length; i++) {
    if (/^BATTING\b/i.test(rows[i].text) || /^Batting\b/i.test(rows[i].text)) {
      battingIdx = i;
      break;
    }
  }

  if (battingIdx < 0) {
    warnings.push('未找到打击区');
    return emptyBattingResult(startIdx, warnings);
  }

  let headerIdx = -1;
  for (let i = battingIdx; i < Math.min(rows.length, battingIdx + 15); i++) {
    if (/AB\s+R\s+H\s+RBI\s+BB\s+SO/i.test(rows[i].text)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    warnings.push('未找到打击表头 AB R H RBI BB SO');
    return emptyBattingResult(battingIdx, warnings);
  }

  const headerRow = rows[headerIdx];
  const statNames = ['AB', 'R', 'H', 'RBI', 'BB', 'SO'];
  const columnXs = columnXsFromHeader(headerRow, statNames);
  const splitX = computeSplitX(headerRow, columnXs, statNames);

  const left = createTableSide();
  const right = createTableSide();

  function consume(side, text) {
    const normalized = normalizeCJKText(text);
    if (!normalized) return;

    if (/^Totals\b/i.test(normalized) || /^\d+\s+\d+/.test(normalized)) {
      side.done = true;
      return;
    }

    if (!side.done) {
      const parsed = parseBattingRow(normalized);
      if (parsed) {
        side.rows.push(parsed);
        return;
      }

      if (hasFooterKey(normalized)) {
        side.done = true;
        side.footerParts.push(normalized);
        return;
      }
    }

    if (side.done || hasFooterKey(normalized)) {
      side.done = true;
      side.footerParts.push(normalized);
    }
  }

  let endIdx = rows.length;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (/^PITCHING\b/i.test(row.text) || /^Pitchers\b/i.test(row.text)) {
      endIdx = i;
      break;
    }

    if (splitX == null) {
      consume(left, row.text);
      continue;
    }

    const leftText = row.cells.filter(c => c.x < splitX).map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();
    const rightText = row.cells.filter(c => c.x >= splitX).map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();

    consume(left, leftText);
    consume(right, rightText);
  }

  const leftFooters = parseKeySpans(left.footerParts.join(' '));
  const rightFooters = parseKeySpans(right.footerParts.join(' '));

  const leftStats = applyBattingFooters(left.rows, leftFooters, warnings, '左队', opts);
  const rightStats = applyBattingFooters(right.rows, rightFooters, warnings, '右队', opts);

  const leftIsTeam1 = splitX == null ? true : detectLeftIsTeam1(headerRow, columnXs, statNames, team1, team2);

  return {
    team1Rows: leftIsTeam1 ? left.rows : right.rows,
    team2Rows: leftIsTeam1 ? right.rows : left.rows,
    team1Stats: leftIsTeam1 ? leftStats : rightStats,
    team2Stats: leftIsTeam1 ? rightStats : leftStats,
    endIdx,
    warnings,
    evidence: {
      splitX,
      leftFooters,
      rightFooters,
    },
  };
}

function emptyBattingResult(endIdx, warnings) {
  return {
    team1Rows: [],
    team2Rows: [],
    team1Stats: {},
    team2Stats: {},
    endIdx,
    warnings,
    evidence: {},
  };
}

function createTableSide() {
  return {
    rows: [],
    footerParts: [],
    done: false,
  };
}

function parseSideBySidePitching(rows, startIdx, team1, team2, opts = {}) {
  const warnings = [];
  let pitchIdx = -1;

  for (let i = startIdx; i < rows.length; i++) {
    if (/^PITCHING\b/i.test(rows[i].text) || /^Pitchers\b/i.test(rows[i].text)) {
      pitchIdx = i;
      break;
    }
  }

  if (pitchIdx < 0) {
    warnings.push('未找到投手区');
    return { team1Rows: [], team2Rows: [], warnings, evidence: {} };
  }

  let headerIdx = -1;
  for (let i = pitchIdx; i < Math.min(rows.length, pitchIdx + 20); i++) {
    if (/IP\s+H\s+R\s+ER\s+BB\s+SO\s+HR/i.test(rows[i].text)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    warnings.push('未找到投手表头 IP H R ER BB SO HR');
    return { team1Rows: [], team2Rows: [], warnings, evidence: {} };
  }

  const headerRow = rows[headerIdx];
  const statNames = ['IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR'];
  const columnXs = columnXsFromHeader(headerRow, statNames);
  const splitX = computeSplitX(headerRow, columnXs, statNames);

  const left = [];
  const right = [];
  const pitchFooterRe = /\b(?:W|L|S|WP|HBP|P-S|BF|Pitches-strikes|Ground balls|Batters faced|BK|E)\s*:/i;

  if (splitX == null) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (/^(BATTING|HIGHLIGHTS|Umpires|Weather|T:)\b/i.test(row.text)) break;
      if (/^Totals\b/i.test(row.text) || pitchFooterRe.test(row.text)) {
        if (left.length) break;
        continue;
      }

      const parsed = parsePitchingRow(row.text);
      if (parsed) left.push(parsed);
    }
  } else {
    let leftDone = false;
    let rightDone = false;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (/^(BATTING|HIGHLIGHTS|Umpires|Weather|T:)\b/i.test(row.text)) break;

      const leftText = row.cells.filter(c => c.x < splitX).map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();
      const rightText = row.cells.filter(c => c.x >= splitX).map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();

      if (!leftDone && (/^Totals\b/i.test(leftText) || pitchFooterRe.test(leftText))) leftDone = true;
      if (!rightDone && (/^Totals\b/i.test(rightText) || pitchFooterRe.test(rightText))) rightDone = true;

      if (!leftDone) {
        const l = parsePitchingRow(leftText);
        if (l) left.push(l);
      }
      if (!rightDone) {
        const r = parsePitchingRow(rightText);
        if (r) right.push(r);
      }

      if (leftDone && rightDone && (left.length || right.length)) break;
    }
  }

  for (const row of [...left, ...right]) {
    row.name = applyRosterCorrection(row.name, opts.roster, warnings, '投手');
  }

  const leftIsTeam1 = splitX == null ? true : detectLeftIsTeam1(headerRow, columnXs, statNames, team1, team2);

  return {
    team1Rows: leftIsTeam1 ? left : right,
    team2Rows: leftIsTeam1 ? right : left,
    warnings,
    evidence: { splitX },
  };
}

async function parseTextPdf(pdfPath, opts = {}) {
  const textDoc = await extractTextRowsFromPdf(pdfPath);
  const rows = textDoc.rows;
  const warnings = [];

  const header = parseTextHeader(rows, opts);
  if (!header) throw new Error('文本 PDF：无法识别比赛头部');

  const date = opts.date || header.date || parseDateFromRows(rows);
  const venue = opts.venue || parseVenueFromRows(rows) || 'Home';

  const lineScore = parseLineScore(rows, header.team1, header.team2, header.rowIdx);
  if (!lineScore) throw new Error('文本 PDF：无法识别逐局记分牌');

  if (!header.score1 && !header.score2) {
    header.score1 = lineScore.line1.totals.R;
    header.score2 = lineScore.line2.totals.R;
  }

  const batting = parseSideBySideBatting(rows, lineScore.endIdx, header.team1, header.team2, opts);
  const pitching = parseSideBySidePitching(rows, batting.endIdx, header.team1, header.team2, opts);

  warnings.push(...batting.warnings, ...pitching.warnings);

  validateParsedTeams({
    team1: header.team1,
    team2: header.team2,
    line1: lineScore.line1,
    line2: lineScore.line2,
    bat1: batting.team1Rows,
    bat2: batting.team2Rows,
    pit1: pitching.team1Rows,
    pit2: pitching.team2Rows,
    warnings,
  });

  return assembleGame({
    sourceType: 'text-pdf',
    header,
    date,
    venue,
    innings: lineScore.innings,
    line1: lineScore.line1,
    line2: lineScore.line2,
    bat1: batting.team1Rows,
    bat2: batting.team2Rows,
    pit1: pitching.team1Rows,
    pit2: pitching.team2Rows,
    teamStats1: batting.team1Stats,
    teamStats2: batting.team2Stats,
    warnings,
    rawEvidence: {
      textItemCount: textDoc.textItemCount,
      footer: batting.evidence,
      pitching: pitching.evidence,
    },
  }, opts);
}

async function renderPdfFirstPage(pdfPath, dir, dpi = 220) {
  const outBase = path.join(dir, 'page');
  await execFileP('pdftoppm', ['-r', String(dpi), '-png', '-singlefile', pdfPath, outBase]);
  return `${outBase}.png`;
}

async function runTesseractTsv(imagePath, opts = {}) {
  const lang = opts.lang || 'chi_sim+eng';
  const psm = opts.psm || '6';
  const { stdout } = await execFileP('tesseract', [imagePath, 'stdout', '-l', lang, '--psm', psm, 'tsv']);
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split('\t');

  return lines.map(line => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cols[index];
    });

    return {
      level: Number(row.level),
      page: Number(row.page_num),
      block: Number(row.block_num),
      par: Number(row.par_num),
      line: Number(row.line_num),
      word: Number(row.word_num),
      x: Number(row.left),
      y: Number(row.top),
      width: Number(row.width),
      height: Number(row.height),
      conf: Number(row.conf),
      str: row.text || '',
    };
  }).filter(w => w.level === 5 && w.str.trim());
}

function groupOcrWordsIntoRows(words) {
  const rows = [];

  for (const word of words) {
    const centerY = word.y + word.height / 2;
    let row = rows.find(r => Math.abs(r.centerY - centerY) <= 14);
    if (!row) {
      row = { page: word.page || 1, centerY, y: word.y, cells: [] };
      rows.push(row);
    }
    row.cells.push(word);
  }

  rows.sort((a, b) => a.centerY - b.centerY);
  for (const row of rows) {
    row.cells.sort((a, b) => a.x - b.x);
    row.text = row.cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows;
}

function parseOcrHeader(rows, opts = {}) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const text = normalizeCJKText(rows[i].text);

    const box = text.match(/Box\s+score\s+for\s+(.+?)\s+at\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (box) {
      return {
        team1: opts.awayTeam || resolveTeamAlias(box[1], opts),
        team2: opts.homeTeam || resolveTeamAlias(box[2], opts),
        date: opts.date || parseDateToken(box[3]),
        rowIdx: i,
      };
    }

    const score = text.match(/^(.+?)\s+(.+?)\s+(\d+)\s*[-–]\s*(\d+)$/);
    if (score) {
      return {
        team1: opts.awayTeam || resolveTeamAlias(score[1], opts),
        team2: opts.homeTeam || resolveTeamAlias(score[2], opts),
        score1: Number(score[3]),
        score2: Number(score[4]),
        date: opts.date || '',
        rowIdx: i,
      };
    }
  }

  if (opts.awayTeam && opts.homeTeam) {
    return {
      team1: opts.awayTeam,
      team2: opts.homeTeam,
      date: opts.date || '',
      rowIdx: 0,
    };
  }

  throw new Error('OCR PDF：无法识别比赛头部。请在上传时提供 awayTeam/homeTeam/date 或 teamAliases。');
}

function parseOcrLineScore(rows, header, warnings) {
  const topRows = rows.slice(0, 16);
  const numericRows = topRows.filter(row => row.cells.filter(c => /^\d+$/.test(c.str)).length >= 3);

  const teamRows = numericRows.filter(row => {
    const text = compactKey(row.text);
    return text.includes(compactKey(header.team1)) ||
      text.includes(compactKey(header.team2)) ||
      row.cells.some(c => compactKey(c.str) === compactKey(header.team1)) ||
      row.cells.some(c => compactKey(c.str) === compactKey(header.team2));
  });

  function parseTeam(row, fallbackName) {
    const nums = row.cells
      .filter(c => c.x > 200)
      .map(c => parseNumber(c.str))
      .filter(n => Number.isFinite(n));

    if (nums.length < 3) return null;
    const totalStart = Math.max(0, nums.length - 3);
    return {
      name: fallbackName,
      linescore: nums.slice(0, totalStart),
      totals: {
        R: nums[totalStart] || 0,
        H: nums[totalStart + 1] || 0,
        E: nums[totalStart + 2] || 0,
      },
    };
  }

  const line1 = teamRows[0] ? parseTeam(teamRows[0], header.team1) : null;
  const line2 = teamRows[1] ? parseTeam(teamRows[1], header.team2) : null;

  if (!line1 || !line2) {
    warnings.push('OCR 未能可靠识别逐局记分牌，比分和 R/H/E 需要人工确认');
    return {
      innings: 0,
      line1: { name: header.team1, linescore: [], totals: { R: header.score1 || 0, H: 0, E: 0 } },
      line2: { name: header.team2, linescore: [], totals: { R: header.score2 || 0, H: 0, E: 0 } },
    };
  }

  return {
    innings: Math.max(line1.linescore.length, line2.linescore.length),
    line1,
    line2,
  };
}

function ocrRowsToTextRows(ocrRows) {
  return ocrRows.map(row => ({
    page: row.page,
    y: row.y,
    text: row.text,
    cells: row.cells.map(cell => ({
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      str: cell.str,
      conf: cell.conf,
    })),
  }));
}

async function parseImagePdfWithOcr(pdfPath, opts = {}) {
  return withTempDir(async dir => {
    const imagePath = await renderPdfFirstPage(pdfPath, dir, opts.dpi || 220);
    const words = await runTesseractTsv(imagePath, opts.ocr || {});
    const lowConfidence = words.filter(w => w.conf >= 0 && w.conf < 45).length;
    const ocrRows = groupOcrWordsIntoRows(words);
    const rows = ocrRowsToTextRows(ocrRows);
    const warnings = ['图片 PDF 使用 OCR 解析，保存前必须人工确认'];

    if (lowConfidence > 0) {
      warnings.push(`OCR 低置信词数量：${lowConfidence}`);
    }

    const header = parseOcrHeader(rows, opts);
    const lineScore = parseOcrLineScore(rows, header, warnings);
    header.score1 = header.score1 ?? lineScore.line1.totals.R;
    header.score2 = header.score2 ?? lineScore.line2.totals.R;

    const batting = parseSideBySideBatting(rows, 0, header.team1, header.team2, opts);
    const pitching = parseSideBySidePitching(rows, batting.endIdx, header.team1, header.team2, opts);

    warnings.push(...batting.warnings, ...pitching.warnings);

    validateParsedTeams({
      team1: header.team1,
      team2: header.team2,
      line1: lineScore.line1,
      line2: lineScore.line2,
      bat1: batting.team1Rows,
      bat2: batting.team2Rows,
      pit1: pitching.team1Rows,
      pit2: pitching.team2Rows,
      warnings,
    });

    return assembleGame({
      sourceType: 'image-ocr-pdf',
      header,
      date: opts.date || header.date || '',
      venue: opts.venue || 'Home',
      innings: lineScore.innings,
      line1: lineScore.line1,
      line2: lineScore.line2,
      bat1: batting.team1Rows,
      bat2: batting.team2Rows,
      pit1: pitching.team1Rows,
      pit2: pitching.team2Rows,
      teamStats1: batting.team1Stats,
      teamStats2: batting.team2Stats,
      warnings,
      rawEvidence: {
        imagePath: opts.keepTempFiles ? imagePath : undefined,
        ocrWordCount: words.length,
        lowConfidence,
        footer: batting.evidence,
        pitching: pitching.evidence,
      },
    }, opts);
  });
}

function validateParsedTeams(data) {
  const { team1, team2, line1, line2, bat1, bat2, pit1, pit2, warnings } = data;

  validateBattingTotals(team1, bat1, line1?.totals, warnings);
  validateBattingTotals(team2, bat2, line2?.totals, warnings);
  validatePitchingTotals(team1, pit1, line2?.totals, warnings);
  validatePitchingTotals(team2, pit2, line1?.totals, warnings);
}

function validateBattingTotals(teamName, batting, totals, warnings) {
  if (!batting || !batting.length || !totals) return;

  const sumR = batting.reduce((sum, row) => sum + (row.R || 0), 0);
  const sumH = batting.reduce((sum, row) => sum + (row.H || 0), 0);

  if (totals.R && sumR !== totals.R) {
    warnings.push(`${teamName} 打击 R 合计不一致：打者表=${sumR}，记分牌=${totals.R}`);
  }
  if (totals.H && sumH !== totals.H) {
    warnings.push(`${teamName} 打击 H 合计不一致：打者表=${sumH}，记分牌=${totals.H}`);
  }
}

function validatePitchingTotals(teamName, pitching, opponentTotals, warnings) {
  if (!pitching || !pitching.length || !opponentTotals) return;

  const sumH = pitching.reduce((sum, row) => sum + (row.H || 0), 0);
  const sumR = pitching.reduce((sum, row) => sum + (row.R || 0), 0);

  if (opponentTotals.H && sumH !== opponentTotals.H) {
    warnings.push(`${teamName} 投手 H 合计不一致：投手表=${sumH}，对手 H=${opponentTotals.H}`);
  }
  if (opponentTotals.R && sumR !== opponentTotals.R) {
    warnings.push(`${teamName} 投手 R 合计不一致：投手表=${sumR}，对手 R=${opponentTotals.R}`);
  }
}

function assembleGame(parsed, opts = {}) {
  const primaryTeamName = opts.primaryTeamName || opts.orionName || '';
  const {
    sourceType,
    header,
    date,
    venue,
    innings,
    line1,
    line2,
    bat1,
    bat2,
    pit1,
    pit2,
    teamStats1,
    teamStats2,
    warnings,
    rawEvidence,
  } = parsed;

  const primaryIsTeam1 = decidePrimaryTeam(header.team1, header.team2, primaryTeamName);

  const homeAway = decideHomeAway({
    team1: header.team1,
    team2: header.team2,
    score1: header.score1 ?? line1?.totals?.R ?? 0,
    score2: header.score2 ?? line2?.totals?.R ?? 0,
    venue,
    primaryIsTeam1,
  });

  const team1Pack = {
    name: header.team1,
    linescore: line1.linescore,
    totals: line1.totals,
    batting: bat1,
    pitching: pit1,
    stats: teamStats1,
  };
  const team2Pack = {
    name: header.team2,
    linescore: line2.linescore,
    totals: line2.totals,
    batting: bat2,
    pitching: pit2,
    stats: teamStats2,
  };

  const primaryPack = primaryIsTeam1 ? team1Pack : team2Pack;
  const opponentPack = primaryIsTeam1 ? team2Pack : team1Pack;

  const mvp = primaryPack.batting
    .slice()
    .filter(row => row.H > 0)
    .sort((a, b) => (b.H - a.H) || ((b.TB || 0) - (a.TB || 0)) || (b.RBI - a.RBI))[0];

  return {
    sourceType,
    parserVersion: PARSER_VERSION,
    game: {
      date,
      venue: venue || '',
      innings,
      home: homeAway.home,
      away: homeAway.away,
      homeScore: homeAway.homeScore,
      awayScore: homeAway.awayScore,
      linescore: {
        home: homeAway.homeIsTeam1 ? line1.linescore : line2.linescore,
        away: homeAway.homeIsTeam1 ? line2.linescore : line1.linescore,
      },
      homeTotals: homeAway.homeIsTeam1 ? line1.totals : line2.totals,
      awayTotals: homeAway.homeIsTeam1 ? line2.totals : line1.totals,
      batting: primaryPack.batting,
      oppBatting: opponentPack.batting,
      pitching: primaryPack.pitching,
      oppPitching: opponentPack.pitching,
      teamStats: {
        team1: team1Pack,
        team2: team2Pack,
      },
      mvpPlayerName: mvp ? mvp.name : '',
      mvpNote: mvp ? `${mvp.H} 安打 · ${mvp.RBI} 打点` : '',
    },
    warnings,
    rawEvidence,
  };
}

function decidePrimaryTeam(team1, team2, primaryTeamName) {
  if (!primaryTeamName) return true;
  const p = compactKey(primaryTeamName);
  const t1 = compactKey(team1);
  const t2 = compactKey(team2);
  if (t1.includes(p) || p.includes(t1)) return true;
  if (t2.includes(p) || p.includes(t2)) return false;
  return true;
}

function decideHomeAway({ team1, team2, score1, score2, venue, primaryIsTeam1 }) {
  if (venue === 'Home' || venue === 'Away') {
    const primaryIsHome = venue === 'Home';
    const homeIsTeam1 = primaryIsTeam1 ? primaryIsHome : !primaryIsHome;
    return {
      homeIsTeam1,
      home: homeIsTeam1 ? team1 : team2,
      away: homeIsTeam1 ? team2 : team1,
      homeScore: homeIsTeam1 ? score1 : score2,
      awayScore: homeIsTeam1 ? score2 : score1,
    };
  }

  return {
    homeIsTeam1: false,
    home: team2,
    away: team1,
    homeScore: score2,
    awayScore: score1,
  };
}

async function parseGameChangerPdf(pdfPath, opts = {}) {
  const textDoc = await extractTextRowsFromPdf(pdfPath);
  const kind = detectPdfKind(textDoc);

  if (kind === 'text-pdf') {
    return parseTextPdf(pdfPath, opts);
  }

  return parseImagePdfWithOcr(pdfPath, opts);
}

module.exports = {
  parseGameChangerPdf,
  parseTextPdf,
  parseImagePdfWithOcr,
  parseKeySpans,
  normalizeCJKText,
  normalizeName,
};
```

## 文件 2：`server/routes/gamechanger.js`

```js
const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { wrap, requireAdmin } = require('../middleware');
const { parseGameChangerPdf } = require('../gamechanger/parser');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});

router.post('/parse', requireAdmin, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'missing_file' });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orion-gamechanger-upload-'));
  const safeName = path.basename(req.file.originalname || 'gamechanger.pdf');
  const tmpPdf = path.join(tmpDir, safeName);

  try {
    await fs.writeFile(tmpPdf, req.file.buffer);

    const opts = {
      fileName: req.file.originalname || '',
      primaryTeamName: req.body.primaryTeamName || req.body.orionName || '',
      orionName: req.body.orionName || '',
      homeTeam: req.body.homeTeam || '',
      awayTeam: req.body.awayTeam || '',
      date: req.body.date || '',
      venue: req.body.venue || '',
      teamAliases: parseJsonField(req.body.teamAliases, {}),
      roster: parseJsonField(req.body.roster, []),
      dpi: req.body.dpi ? Number(req.body.dpi) : undefined,
      ocr: parseJsonField(req.body.ocr, undefined),
    };

    const result = await parseGameChangerPdf(tmpPdf, opts);
    res.json(result);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}));

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { router };
```

## 文件 3：`server.js` 挂载路由

在后端入口中加入：

```js
const gamechangerRoutes = require('./server/routes/gamechanger');

app.use('/api/gamechanger', gamechangerRoutes.router);
```

## Dockerfile 依赖

如果使用 Alpine 镜像：

```dockerfile
RUN apk add --no-cache \
  poppler-utils \
  tesseract-ocr \
  tesseract-ocr-data-eng \
  tesseract-ocr-data-chi_sim
```

如果使用 Debian/Ubuntu 镜像：

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
  poppler-utils \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-chi-sim \
  && rm -rf /var/lib/apt/lists/*
```

## 前端调用方式

```js
async function parseGameChangerPdf(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('primaryTeamName', document.querySelector('#orionName').value || '');
  form.append('teamAliases', JSON.stringify({}));
  form.append('roster', JSON.stringify(DB.getPlayers().map(p => p.name)));

  const res = await fetch('/api/gamechanger/parse', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error('解析失败');
  return res.json();
}
```

## 保存策略

解析接口只返回结构化结果，不直接写数据库。

前端需要展示：

- 比赛信息
- 两队打击表
- 两队投手表
- teamStats
- warnings
- 原始 PDF 或渲染图

管理员确认后，再把 `result.game` 交给现有 `POST /api/games` 保存。
