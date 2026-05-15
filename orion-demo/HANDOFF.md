# 北京猎户座官网 · 接手快照

> 面向下一轮 Codex/Claude 接手。这里只保留当前状态、硬规则、关键契约和排障入口；逐轮历史已压缩，旧长版已备份到 `orion-demo/backups/`。

最后整理：2026-05-15  
本轮状态：仅压缩整理 `HANDOFF.md` 与 `../DESIGN_BRIEF.md`，未改功能代码，未部署。

---

## 0. 先读这几条

- 当前线上版本：`express-knlw-030-20260515114335`，2026-05-15 11:46 部署。
- 线上域名：`https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com`
- 云托管控制台：`https://cloud.weixin.qq.com/cloudrun/service/express-knlw`
- 部署必须走“本地预览 -> 用户确认 -> 云部署”。每一次部署都要用户本轮明确同意，不能沿用旧授权。
- 改功能代码后同步更新两份文档：本文件和 `/Users/jinjiangshan/Downloads/猎户网站项目/DESIGN_BRIEF.md`。
- 项目根目录已发布到 GitHub：`https://github.com/Ogawa228/Beijing-Orion-baseball-website`。
- 用户说“备份代码”时，默认含义是 `git commit` + `git push` 到 GitHub；不要再额外制作本地 zip、复制备份目录或生成一套本地代码副本，除非用户明确要求。
- `scripts/verify-wxcloud-deploy.js` / `npm run deploy:verify` 是本地部署校验工具，不影响线上运行。

---

## 1. 当前架构

项目已从“纯静态 + localStorage”升级为 Express + MySQL Serverless + COS：

```text
浏览器页面
  -> assets/js/db.js
     fetch client / cache / optimistic update / dbReady()
  -> Express server.js
     /api/auth / players / games / tournaments / events / hof / highlights
     /api/leaderboard / points / bind-codes / attendances / adjustments / notifications
     /api/site-settings/:key / upload
  -> MySQL Serverless: orion
  -> COS: 7072-prod-d5gtkxdyu7263e95b-1429688831
```

关键文件：

- 前端共享：`assets/js/db.js`、`assets/js/auth.js`、`assets/js/parser.js`
- 后端入口：`server.js`
- 路由：`server/routes/*.js`
- 鉴权：`server/auth-helpers.js`，PBKDF2 + HMAC cookie，兼容旧 admin 明文密码
- 中间件：`server/middleware.js`
- schema：`server/schema.sql`
- 部署：`Dockerfile`、`.dockerignore`、`wxcloud.config.json`、`package.json`

---

## 2. 部署状态

最新部署：

| 版本 | 时间 | 摘要 | 验证 |
|---|---:|---|---|
| `express-knlw-030-20260515114335` | 2026-05-15 11:46 | 球员页 `STARDUST` 高级粒子项、WebGL `three.core.js` 白名单、星阵热路径性能优化 | `deploy:verify` 通过；线上 `/api/health` 200；线上可访问 `three.core.js` |

重要里程碑：

| 版本 | 摘要 |
|---|---|
| `029` / `028` | 球员页 WebGL 粒子可见性与轻量 DOM 星尘兜底，管理员可切换星尘模式 |
| `027` | 顶部导航顺序：首页 / 球员 / 活动 / 比赛 / 积分榜 / 名人堂 / 联系 |
| `026` | 年份字阵、分层密度、粒子局部排斥打散、静态托管白名单 |
| `023` | `site_settings` 表与 `/api/site-settings/players-starfield`，管理员星阵配置全站发布 |
| `022` | 球员页星场重做、题字、管理员星阵面板、低动效、子页面深空背景、移动端 HUD 避让 |
| `020` | 后台 Match 数据确认/修订工作流、修订审计、头像金圈修复 |
| `018` | 合并球员、PDF 姓名核对、批量封面同目录匹配、COS 上传预检 |
| `017` | GameChanger footer parser 重构与 5 份真实 PDF 回归 |
| `015` | 忘记密码入口、admin 重置密码、上传 URL 改 `tcb.qcloud.la` |
| `004` / `003` | dashboard 双身份、积分系统、MySQL/API 基础迁移 |

当前未部署内容：

- 本轮只整理文档，没有功能代码未部署。
- 如果后续改动只更新文档，一般不需要云部署；如果改 HTML/CSS/JS/server，按部署闸门执行。

---

## 3. 本地与云部署命令

本地预览：

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
npm start
curl -s http://localhost:3000/api/health
```

代码备份：

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目
git status
git add .
git commit -m "说明这次改了什么"
git push
```

备份边界：

- GitHub 备份代码、设计文档、交接文档和 parser 设计文档。
- GitHub 不备份 `.env`、`node_modules/`、备份目录、输出截图、原始素材包、赛季 PDF、zip、数据库真实数据和 COS 对象。
- 需要完整灾备时，代码走 GitHub；MySQL 和 COS/原始素材走单独备份。

常规校验：

```bash
node --check server.js
node --check assets/js/db.js
node --check assets/js/auth.js
npm run test:gamechanger
```

部署目标：

| 项 | 值 |
|---|---|
| AppID | `wx7dce60930ee10898` |
| 环境 ID | `prod-d5gtkxdyu7263e95b` |
| 服务名 | `express-knlw` |
| 容器端口 | 80 |
| 模式 | 微信云托管 Cloud Run |

部署步骤：

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
yes "" 2>/dev/null | npm run deploy
npm run deploy:verify -- --expected-version express-knlw-NNN
```

注意：

- `wxcloud --version` 应为 `@wxcloud/cli/2.3.3` 或更新；旧版本曾有上传体积限制。
- 首次或登录失效时，需要用户自己跑 `wxcloud login` 扫码。
- 非 TTY 下 `wxcloud` 会问上传方式，`yes "" | npm run deploy` 用默认“手动上传代码包”。
- 部署后必须更新本文件和 `../DESIGN_BRIEF.md`，写明版本、时间、验证结果、是否还有未部署本地改动。
- 回滚命令：`wxcloud run:rollback -e prod-d5gtkxdyu7263e95b -s express-knlw -v <旧版本号>`。

---

## 4. 数据库与对象存储

MySQL：

- 云上环境变量：`MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`
- 本地 `.env`：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- 库名：`orion`
- 表：`users`、`user_identities`、`players`、`tournaments`、`games`、`events`、`hall_of_fame`、`highlights`、`bind_codes`、`attendances`、`points_adjustments`、`admin_audit_logs`、`user_notifications`、`site_settings`、`_migrations`
- `server/db.js` 的 Serverless 自动重试不要去掉。
- `scripts/migrate.js` 是 localStorage -> MySQL 一次性迁移脚本，已经跑过，不要重跑，避免 TRUNCATE。

COS：

- bucket：`7072-prod-d5gtkxdyu7263e95b-1429688831`
- region：`ap-shanghai`
- 云上用 `cos-nodejs-sdk-v5` + `http://api.weixin.qq.com/_/cos/getauth` 临时凭证，返回浏览器可访问的 `https://<bucket>.tcb.qcloud.la/<key>`。
- 本地无 COS 凭证时 `/api/upload` 返回 503 是正常保护；不要把它误判成线上问题。
- 图片上传前端会压缩：普通图约 1280px / q=0.78，超大图约 1024px / q=0.7，>50 MB 拒绝。

账号：

- admin 邮箱：`admin@orion.cn`
- admin 密码：`Orion@2010`
- `SESSION_SECRET` 在云托管环境变量里，不要贴到聊天或文档。

---

## 5. 产品与数据契约

### 5.1 用户 / 球员双身份

```text
user 账号                         player 球员档案
display_name / avatar / role       name / photo / number / position
bound_player_id -----------------> player.id
```

- 公开页永远以真实球员档案为主：`player.name` + `player.photo`。
- 自己看 dashboard 时，可显示昵称/自定义头像，但真实球员身份仍为主；昵称只是“仅你可见”的辅助信息。
- casual 注册占位档案：`p_user_*`。
- verified 预置档案：如 `p_xute`、`p_lijiaqi`。
- 测试双身份：后台生成绑定码 -> 新账号兑换 -> dashboard 看真实球员主名 + 自己昵称辅助；公开 `dashboard.html?player=...` 仍显示真实球员。

### 5.2 试训到正式

| 路径 | 触发 | 行为 |
|---|---|---|
| 自动升级 | casual 满 8 次训练 | 不撞预置实名则升 verified；撞名则拒绝并提示走绑定码 |
| 绑定码合并 | admin 给 verified 球员生成绑定码 | casual 的签到/积分调整迁到目标 verified，删除 casual，用户绑定目标 |
| admin 强升级 | 球员池按钮 | 同自动升级，保留重名保护 |

新 inline `onclick` 函数如果写在 `admin.html` 的 IIFE 内，必须挂到 `window`，否则按钮会“点不动”。

### 5.3 积分系统

唯一入口：`DB.getPlayerPoints(playerId)` / 后端 `server/points.js`。

公式摘要：

- 训练 +5；活动 +5；友谊/训练赛 +10；联赛/杯赛 +15
- 1B +1；2B +2；3B +3；HR +10；RBI +2
- 投手 SO +3；投手 BB -3
- 单场 MVP +10
- 手动失误 E -3
- 赛季 MVP +100；金手套/最佳投手/银棒 +50；名人堂 +200

约束：

- 有 `_1B/_2B/_3B/HR` 就按分级安打算；没有时 `H` 全按 1B fallback。
- 展示侧规则卡、admin 快捷按钮和计算常量要同步改。
- 排行榜和积分明细入口：`ranking.html`、`player-points.html`、dashboard 顶部 badge、admin 调整列表。

### 5.4 借调规则

联赛允许同一球员最多在 3 个队伍上场。注册猎户球员可能出现在 `g.oppBatting` / `g.oppPitching`，这不是 parser bug。

- 赛季统计和积分只看 `g.batting` / `g.pitching`。
- 单场详情仍显示对手表真实数据，但对手表同名球员不渲染为猎户球员链接。

### 5.5 名字归一化

名字匹配必须使用项目现有 canonical / alias 入口，不能直接 `b.name === p.name`：

- `DB.getPlayerByName`
- `DB.playerCanonicalKey`
- `DB.playerNameKeys`
- `server/name-utils.js`

保留能力：

- CJK 部首归一，如 `⻰/⻜/⻩/⻢/⻘/⻦`
- 繁体转简体完整表
- CJK 字间空格压缩
- aliases 聚合，如 `靳江山` 归到注册名 `江山`

---

## 6. GameChanger PDF parser

硬契约：

- 文件名是 home/away/date 权威源：`<away>_vs_<home>_<Mon>_<DD>_<YYYY>.pdf`。
- 第一个队是客队，第二个队是主队。
- PDF header 若与文件名冲突，以文件名为准并成对翻转主客、比分、linescore、totals。
- `Totals/Team Totals/总计/合计/总和` 不能进入 batting/pitching 球员数组。
- 改 `assets/js/parser.js` 前先跑 `npm run test:gamechanger`；新增样本先扩回归脚本再改算法。

当前能力：

- 文本型 GameChanger PDF 已用 5 份真实样本回归，期望 5/5 passed 且 warning 为 0。
- 已处理 footer 分侧状态机、key-span 扫描、多行比分头、噪声行、PDF 漏字按球员池纠正、投手表边界。

待办：

- 慢垒 2026 春季联赛 03-29 神策 / 05-06 奥美老登两场旧数据没有 `_2B/_3B/HR` 分级字段；用户可在 admin 重新上传 PDF，用新 parser 生成。
- 图片型 PDF / 猛虎杯类需要 OCR，是独立大工程；不要混进普通 parser 小修。

---

## 7. 前端运行约束

- 页面自己读取 DB 前必须 `await window.dbReady()`；`auth.js` 只保证导航登录态。
- 公共搜索用 `DB.fuzzyMatch(query, ...fields)` + `DB.debounce(fn, 200)`；admin 选择器优先复用 `_attachSearchPicker`。
- `DB.isOrionTeam(name)` 同时识别棒球“猎户星”和慢垒“猎户座”，不要改窄。
- `game-detail.html` 4 张数据表保留：猎户/对手 batting + pitching；列头点击排序；`tfoot` 合计行永不参与排序。
- `players.html` 星阵配置通过 `site_settings` 发布；自定义模板仍在管理员本机 `localStorage`。
- 普通访客的低动效偏好优先于管理员发布配置。
- Three.js r184 需要静态放行 `three.module.js` 和 `three.core.js`，不要只白名单 module。

---

## 8. 当前页面状态

| 页面 | 当前状态 |
|---|---|
| `index.html` | 首页 Hero + 报刊式卷首 + Quick Nav + 积分规则 + 负责人/球队信息；联系锚点为 `#contact` |
| `players.html` | 星阵首屏、题字、管理员编队台、`STARDUST` 高级项、点击星点弹 v2.4 球星卡 |
| `dashboard.html` | 个人能力剖面、真实身份优先、昵称/自定义头像为 own-view 辅助 |
| `games.html` / `tournament.html` | 赛事索引与赛事详情，排行榜可排序 |
| `game-detail.html` | box score、逐局、图表、4 张 sortable 表、MVP、highlights |
| `ranking.html` / `player-points.html` | 积分榜、积分构成和时间线 |
| `admin.html` | CRUD、GameChanger 导入、数据确认/修订、合并球员、积分管理、签到、上传 |
| `hall-of-fame.html` | 名人堂，空状态有仪式感 |
| `events.html` | 占位待补 |
| `contact.html` | 已被 `index.html#contact` 取代，仅直接访问兜底 |

---

## 9. 后续 TODO

优先级从高到低：

1. 任何新部署都先本地预览，用户确认后再推云。
2. parser 新样本先纳入 `scripts/gamechanger-pdf-regression.js`，再改算法。
3. 重新上传 03-29 神策、05-06 奥美老登 PDF 以生成安打分级数据。
4. 小程序线：用户已确认走 `wx.login`，活动接龙/报名 + 动态扫码签到 + 积分共享 MySQL。具体方案见 §10。
5. 微信网页登录 SDK 暂搁置，需备案域名与开放平台资质。
6. COS 历史 base64 图片可做一次性迁移。
7. Andy -> 林立欣真实数据合并需要用户明确授权，功能已在 admin 球员池。
8. 清理死代码：`contact.html`、旧 `.wall/.poster` CSS 等，注意别删仍在用的 `.cp-avatar/.contact-person`。
9. 全站 dbReady race audit。
10. 图片型 PDF OCR 单独立项。

---

## 10. 小程序与多端数据同步计划

目标：小程序不是另一套孤岛数据，而是 Web、后台和小程序共用同一个 Express API + MySQL 数据源。不要回到小程序本地 storage 当主数据源。

### 10.1 总体架构

```text
Web 页面 / Admin 后台 / 微信小程序
  -> 同一套 HTTPS API
  -> Express server.js
  -> MySQL Serverless: orion
  -> COS / 微信云存储
```

原则：

- MySQL 是唯一业务事实源；Web 和小程序只做本地缓存/乐观 UI。
- 积分不由小程序端计算后写总分，继续由后端/共享 points 语义从比赛、签到、活动、奖项、手动调整流水实时计算。
- 小程序端只提交“行为流水”：报名、签到、取消报名、上传资料、绑定账号等。
- 后台 admin 仍是最终修订和纠错入口。

### 10.2 登录与身份绑定

第一阶段走 `wx.login`：

- 小程序调用 `wx.login()` 拿 code。
- 后端新增或扩展 auth 接口，把 code 换 openid/session，并写入 `user_identities`，例如 `type='wechat_openid'`。
- 保留现有 `user -> bound_player_id -> player` 双身份模型：公开仍看真实球员档案，自己可看昵称/头像。
- 小程序端不优先使用绑定码。用户注册/登录后，可以从正式注册球员列表中自主选择“申请绑定这个球员”。
- 后台 admin 收到绑定审批提示，核对微信身份/头像/姓名备注与注册球员是否一致；批准后后端自动写 `users.bound_player_id`，必要时合并 casual 试训档案的签到和积分流水。
- 建议新增 `player_bind_requests` 或等价表：`user_id`、`requested_player_id`、`status(pending/approved/rejected)`、`note`、`reviewed_by`、`reviewed_at`、`created_at`。
- 可复用 `user_notifications`：用户提交后通知管理员；管理员批准/驳回后通知用户。
- 网页端继续保留绑定码方案。原因是网页端主要是邮箱注册，缺少微信 openid 这种身份上下文，很难核对“注册账号的人”和“注册球员本人”的一致性；让管理员预先发绑定码更可控。

### 10.3 多端同步

同步策略：

- 读：小程序页面拉取现有 `/api/*`，必要时新增轻量 endpoint，不复制一套小程序专属数据。
- 写：所有写操作走后端事务，返回更新后的记录或可重新拉取的版本。
- 缓存：小程序可用本地缓存提升首屏，但进入页面或下拉刷新必须以 API 返回为准。
- 冲突：比赛数据、积分调整、活动状态以服务器 `updated_at` 和 admin 审计记录为准；小程序不做离线合并。
- 通知：可复用 `user_notifications` 做绑定邀请、活动提醒、签到结果等站内信。

### 10.4 积分共享

小程序需要展示和触发积分，但不重新定义公式：

- 展示：直接调用排行榜、球员积分明细、积分规则 API。
- 训练签到：扫码或 admin 记录后写 `attendances`，积分自动体现。
- 活动签到：活动报名/签到也写 attendance 或活动参与流水，按现有“活动 +5”规则进入积分。
- 手动加减分：仍只在 admin 后台操作，写 `points_adjustments`。
- 赛季奖项/名人堂：仍由 admin 管理，避免小程序端直接发奖。

### 10.5 活动接龙 / 报名 / 签到

建议新增活动报名能力，而不是只做静态 `events.html`：

- `events` 保持活动主表：标题、时间、地点、封面、正文、状态、容量、报名截止时间。
- 新增 `event_signups` 或等价表：`event_id`、`user_id`、`player_id`、`status`、`note`、`created_at`、`updated_at`。
- 小程序活动页：活动列表、活动详情、报名/取消、报名名单、我的报名状态。
- 后台活动页：创建活动、查看报名名单、导出、手动增删报名、关闭报名。
- 动态签到：后台为某次训练/活动生成短时效 QR token；小程序扫码后后端校验 token、身份、时间窗、防重复，再写签到流水。
- 二维码不要长期固定，避免截图转发后无限签到。

### 10.6 建议实施顺序

1. API 盘点：确认现有 auth/player/events/points/attendance 哪些可直接给小程序用。
2. 小程序登录骨架：`wx.login` -> 后端 session -> `me`。
3. 球员绑定申请：小程序自选注册球员 -> admin 审批 -> 自动绑定；网页端绑定码逻辑保留。
4. 活动列表和详情：先只读 API，替换 `events.html` 的占位。
5. 活动报名表：新增报名表和后台报名管理。
6. 动态扫码签到：训练/活动两类都走同一 token 校验模型。
7. 积分页复用：排行榜、积分明细、我的积分。
8. 通知：绑定申请、审批结果、活动提醒、报名成功、签到成功。
9. 小程序 UI polish：再做首屏、图表替换、移动端表格体验。

---

## 11. 接手 sanity check

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
npm start

curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/players | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))"
curl -s http://localhost:3000/api/leaderboard | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).slice(0,3).map(x=>`${x.player.name}:${x.total}`).join(' / ')))"
npm run test:gamechanger
```

预期：

- `/api/health` 返回 `server:"ok"` 且 DB ping OK。
- 球员数约 53。
- GameChanger 回归 5/5 passed。

---

## 12. 文件地图

```text
orion-demo/
├── server.js
├── server/
│   ├── db.js
│   ├── auth-helpers.js
│   ├── middleware.js
│   ├── name-utils.js
│   ├── points.js
│   ├── schema.sql
│   └── routes/
├── assets/
│   ├── js/db.js
│   ├── js/auth.js
│   ├── js/parser.js
│   ├── css/style.css
│   └── img/
├── scripts/
│   ├── gamechanger-pdf-regression.js
│   └── verify-wxcloud-deploy.js
├── *.html
├── package.json
├── Dockerfile
├── wxcloud.config.json
└── HANDOFF.md
```
