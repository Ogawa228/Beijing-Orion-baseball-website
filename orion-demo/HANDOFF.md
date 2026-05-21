# 北京猎户座官网 · 接手快照

> 面向下一轮 Codex/Claude 接手。这里只保留当前状态、硬规则、关键契约和排障入口；逐轮历史已压缩，旧长版已备份到 `orion-demo/backups/`。

最后整理：2026-05-21  
本轮状态：`express-knlw-036-20260521142313` 已部署到微信云托管；首页 footer 的中央网信办举报中心和公安部网络违法犯罪举报网站增加轻量本地标识；面向中文域名 `猎户座棒垒球.cn` 补齐基础站内 SEO，包括 canonical、description / OG、结构化数据、`robots.txt` 和 `sitemap.xml`；`ranking.html`、`game-detail.html`、`tournament.html` 等公开页面的磨砂头像统一改用圆形 mask 和稳定尺寸，修复头像/光圈边缘偏移。注册弹窗现要求勾选用户协议、隐私政策、个人信息处理规则、必要个人信息处理单独同意和年龄/监护人确认；`legal.html` 作为完整规则页；正式球员可在个人面板设置公开展示名和公开头像，未设置时非正式用户在球员页、积分榜、积分明细、比赛详情、赛事页和名人堂看到档案姓名和档案照的磨砂玻璃效果。

---

## 0. 先读这几条

- 当前线上版本：`express-knlw-036-20260521142313`，2026-05-21 14:26 部署并验证。
- 线上域名：`https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com`
- ICP / 合规链接：域名 `猎户座棒垒球.cn`，备案号 `京ICP备2026027592号-1`；首页 footer 悬挂协议与个人信息保护规则、违法和不良信息举报入口、署名和备案号，备案号链接 `https://beian.miit.gov.cn/`；举报入口带本地 CSS 小标识，不依赖外部图标资源；子页保持简洁 footer。
- 域名 SEO：公开索引页 canonical 指向 `https://xn--4gsr8nf4ck7ihxnemb.cn/` 及对应路径；`dashboard.html`、`game-detail.html`、`tournament.html`、`player-points.html`、`admin.html` 等动态/私密或参数页设置 noindex；根目录提供 `robots.txt` 和 `sitemap.xml`。
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
| `express-knlw-036-20260521142313` | 2026-05-21 14:26 | 首页 footer 举报入口新增 `12377` / `公安` 本地标识；全站 HTML 升级 `style.css?v=33`；面向 `猎户座棒垒球.cn` 增加 canonical、description / OG、首页 JSON-LD、`robots.txt`、`sitemap.xml`；公开身份头像共用圆形 mask，修复积分榜、比赛/赛事页磨砂头像与光圈边缘偏移 | 部署前 `node --check` 通过；HTML executable inline scripts + SEO blocks 通过；GameChanger 5/5；本地浏览器验证 `ranking.html` 和 `tournament.html?id=t_ot_slowpitch_2026` 的头像 wrapper 为稳定圆形 mask 且无 console error；`deploy:verify --expected-version express-knlw-036-20260521142313 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过；线上 `/api/health` 200 且 DB OK；线上首页含 footer 举报标识、JSON-LD 和 `style.css?v=33`；线上 `ranking.html` 含 canonical / OG / `style.css?v=33`；线上 `robots.txt` 和 `sitemap.xml` 正常；自定义域名 `https://xn--4gsr8nf4ck7ihxnemb.cn/` 返回同一 SEO 资源 |
| `express-knlw-035-20260521140027` | 2026-05-21 14:03 | 首页 footer 新增用户协议、隐私政策、个人信息处理规则、未成年人规则、个人信息权利、中央网信办举报中心和公安部网络违法犯罪举报网站；球员页暂停/低动效状态磨砂遮罩居中修复；普通球员页启用 `is-frame-saver`，减少常驻节点动画和过度 `will-change` 层 | 部署前 `node --check` 通过；HTML non-module inline scripts 通过；GameChanger 5/5；本地浏览器验证首页 footer 链接、`style.css?v=31`、球员页 52 节点、`is-frame-saver`、低动效遮罩居中且粒子隐藏、无 console error；`deploy:verify --expected-version express-knlw-035-20260521140027 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过；线上 `/api/health` 200 且 DB OK；线上 `index.html` 含合规/举报链接，`players.html` 含 `style.css?v=31`、`is-frame-saver`、低动效遮罩 transform 修复和 `is-perf-paused` 粒子隐藏规则 |
| `express-knlw-034-20260521133747` | 2026-05-21 13:40 | 球员页动效性能优化；注册入口合规增强；新增 `legal.html`；球员公开展示资料字段/API；非正式用户在球员页、积分榜、积分明细、比赛详情、赛事页、名人堂和公开 dashboard 看到公开身份或磨砂化档案资料；磨砂头像边缘对齐；离屏/隐藏态动画节流 | 部署前 `node --check` 通过；HTML non-module inline scripts 通过；GameChanger 5/5；`deploy:verify --expected-version express-knlw-034-20260521133747 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过；线上 `/api/health` 200 且 DB OK；线上 `players.html` 含 `style.css?v=30`、`db.js?v=24`、`auth.js?v=20`、`is-perf-paused`；`/api/players` 返回 52 人并含 `publicDisplayName/publicAvatar`；`legal.html`、`ranking.html`、默认头像资产 200 |
| `express-knlw-033-20260520141956` | 2026-05-20 14:22 | 首页 footer 一行 meta 排布，悬挂 `Edited by 江山` 与 `京ICP备2026027592号-1`；子页 footer 收回为简洁版权；首页球队信息标注靳江山为数据组 / 运维组 | `deploy:verify --expected-version express-knlw-033-20260520141956` 通过；线上 `/api/health` 200；线上首页源码含 `style.css?v=27`、`Edited by 江山`、`京ICP备2026027592号-1`；默认域名浏览器访问会先显示 CloudBase 风险提醒中间页 |
| `express-knlw-032` | 2026-05-15 16:28 | `players.html?wallpaper=1` 动态壁纸模式；全屏星阵；复用管理员全站发布的星阵/星尘动效；隐藏导航、筛选、HUD、弹卡和管理员面板 | `deploy:verify --expected-version express-knlw-032` 通过；线上 `/api/health` 200；线上 `players.html?wallpaper=1` 含 `wallpaper-mode`；浏览器实测 52 个节点、WebGL 运行中、操作 UI 隐藏 |
| `express-knlw-031-20260515155850` | 2026-05-15 16:01 | 管理员权限 A/B/C + 数据组/运营组权限点；后台按权限显示；账户列表三维筛选；A 级删除账户；注册绑定申请/网页关联码流程 | `deploy:verify` 通过；线上 `/api/health` 200；线上 `admin.html`/`db.js?v=18`/`auth.js?v=17` 资源检查通过 |
| `express-knlw-030-20260515114335` | 2026-05-15 11:46 | 球员页 `STARDUST` 高级粒子项、WebGL `three.core.js` 白名单、星阵热路径性能优化 | `deploy:verify` 通过；线上 `/api/health` 200；线上可访问 `three.core.js` |

重要里程碑：

| 版本 | 摘要 |
|---|---|
| `036` | footer 举报入口本地标识、域名基础 SEO、`robots.txt` / `sitemap.xml`、积分榜/比赛/赛事公开身份头像圆形 mask 修正 |
| `035` | 首页 footer 合规/举报链接；球员页暂停遮罩居中修复；普通球员页省帧模式，减少常驻节点动画和过度层提升 |
| `034` | 球员页性能、公开身份磨砂化、注册合规协议、公开展示资料 API、跨公开页面脱敏统一、磨砂边缘对齐和离屏/隐藏态节流 |
| `033` | 首页 footer 悬挂 ICP 和 `Edited by 江山`，子页简洁 footer，靳江山标注为数据组 / 运维组 |
| `032` | `players.html?wallpaper=1` 动态壁纸模式，复用管理员全站星阵发布配置 |
| `031` | 管理员权限分级、数据/运营权限组、账户筛选、A 级删除账户、绑定申请/网页关联码 |
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

- 无已知运行时代码未部署。
- 本文件和 `../DESIGN_BRIEF.md` 为部署后的记录性更新；不影响线上运行。
- 注意：当前自定义域名字段可能返回不带协议的 `www.xn--4gsr8nf4ck7ihxnemb.cn`，`npm run deploy:verify` 如自动取该域名会报 `Failed to parse URL`；本次已使用 `--domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 完成验证。
- 自定义域名待处理：中文域名 `猎户座棒垒球.cn` 的 Punycode / ASCII 形式是 `xn--4gsr8nf4ck7ihxnemb.cn`。微信云托管/CloudBase 绑定自定义域名若报 `invalid custom domain`，优先尝试填写 Punycode 形式，并确认 SSL 证书、ICP 备案、域名所有权校验和 CNAME/TXT 解析。

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
- `users` 保留 `role`，并新增 `admin_level`、`admin_permission_groups`、`admin_granted_by`、`admin_granted_at`；权限以 `requirePermission(...)` 为后端准绳。
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
- `admin@orion.cn` 强制为 A 全站级；B 队长级包含数据组 + 运营组；C 组员级可授予 `data` / `ops` 同级权限包。
- `SESSION_SECRET` 在云托管环境变量里，不要贴到聊天或文档。

---

## 5. 产品与数据契约

### 5.1 用户 / 球员双身份

```text
user 账号                         player 球员档案
display_name / avatar / role       name / photo / number / position
bound_player_id -----------------> player.id
                                  public_display_name / public_avatar
```

- `user.display_name/avatar` 是账号资料；`player.public_display_name/public_avatar` 是球员页公开展示资料；`player.name/photo` 是真实档案。
- `players.html`、`ranking.html`、`player-points.html`、`game-detail.html`、`tournament.html`、`hall-of-fame.html` 和普通公开 `dashboard.html?id=...` 对非正式用户优先展示公开名/公开头像；未设置时展示档案姓名和档案照的磨砂玻璃效果，头像/姓名有轻量高光闪烁，避免 `XX` 和默认头像带来的生硬观感。
- 已绑定正式球员账号和管理员可清晰查看公开页面的真实档案；正式球员本人和管理员在 dashboard 可设置公开展示名/头像；账号昵称/头像不自动等同于球员页公开展示资料。
- casual 注册占位档案：`p_user_*`。
- verified 预置档案：如 `p_xute`、`p_lijiaqi`。
- 公开入口优先使用 `dashboard.html?id=<playerId>`，避免 URL 暴露真实姓名；旧 `?player=` 仅为兼容。

### 5.1b 注册 / 绑定申请

- 注册入口提供两条主路径：`试训队员` 与 `绑定正式球员档案`；默认是试训，减少表单复杂度。
- 基础字段始终是昵称、邮箱、密码、确认密码；没有邮箱验证，注册入口保持轻量。
- 试训注册时，`user.display_name` 与临时 `casual player.name` 都先使用昵称；后续可由管理员调整，不影响已记录的签到和积分。
- 选择绑定正式档案时，才显示目标正式球员搜索、队内昵称、微信号、其他验证信息；不再重复要求填写真实姓名或球衣号。
- 目标球员搜索候选列表必须在表单流内展开，不能绝对定位覆盖后续字段；搜索框下方保留固定说明小字，不使用“取消”按钮，收起触发包括再次点击搜索框、点击外部字段、点击下拉内空白、输入框失焦和 Esc。
- 绑定申请写入 `player_bind_requests`，状态为 `pending / approved / rejected`；批准必须由 admin 执行，不能按姓名或球衣号自动通过。
- 批准时复用 `bindUserToPlayer`，把 casual 签到和手动积分迁移到 verified 球员；驳回时保留试训档案，用户可重新提交申请。
- 小程序先注册、网页后来注册的用户，使用 `users.app_connect_code` 关联网页邮箱身份；同一人只增加 `user_identities.email`，不新建第二个账号或第二个试训档案。

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
- `players.html` 星阵配置通过 `site_settings` 发布；自定义模板仍在管理员本机 `localStorage`。群星排列 / 全站视觉配置属于 A 全站级权限。
- 普通访客的低动效偏好优先于管理员发布配置；`players.html?wallpaper=1` 是例外，壁纸模式强制保留动态效果以便 Wallpaper Engine 使用。
- Three.js r184 需要静态放行 `three.module.js` 和 `three.core.js`，不要只白名单 module。

---

## 8. 当前页面状态

| 页面 | 当前状态 |
|---|---|
| `index.html` | 首页 Hero + 报刊式卷首 + Quick Nav + 积分规则 + 负责人/球队信息；联系锚点为 `#contact` |
| `players.html` | 星阵首屏、题字、管理员编队台、`STARDUST` 高级项、点击星点弹 v2.4 球星卡；`?wallpaper=1` 进入全屏动态壁纸模式 |
| `dashboard.html` | 个人能力剖面；公开视角对未设置公开资料的档案姓名/档案照做磨砂玻璃化；本人/管理员可维护公开展示资料 |
| `games.html` / `tournament.html` | 赛事索引与赛事详情，排行榜可排序 |
| `game-detail.html` | box score、逐局、图表、4 张 sortable 表、MVP、highlights |
| `ranking.html` / `player-points.html` | 积分榜、积分构成和时间线；公开身份统一走公开名/公开头像或磨砂化档案资料 |
| `admin.html` | 按权限显示后台：A 管账号权限/系统设置，B 管球员/绑定/积分/荣誉，数据组管比赛数据，运营组管活动/高光/展示资料 |
| `hall-of-fame.html` | 名人堂，空状态有仪式感；入选球员头像/姓名同样走公开身份展示 |
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
- 保留现有 `user -> bound_player_id -> player` 双身份模型：公开优先看球员页公开展示资料，未设置时看磨砂玻璃化档案资料，自己可看真实档案和账号昵称/头像。
- 小程序端不优先使用绑定码。用户注册/登录后，可以从正式注册球员列表中自主选择“申请绑定这个球员”。
- 后台 admin 收到绑定审批提示，核对微信身份/头像/姓名备注与注册球员是否一致；批准后后端自动写 `users.bound_player_id`，必要时合并 casual 试训档案的签到和积分流水。
- 建议新增 `player_bind_requests` 或等价表：`user_id`、`requested_player_id`、`status(pending/approved/rejected)`、`note`、`reviewed_by`、`reviewed_at`、`created_at`。
- 可复用 `user_notifications`：用户提交后通知管理员；管理员批准/驳回后通知用户。
- 网页端后续按 A 方案升级：邮箱注册后也允许用户提交“绑定注册球员申请”，选择目标 registered/verified player，并填写队内昵称、微信号、其他验证信息等辅助核验信息。
- 网页端申请同样进入 `player_bind_requests`，必须由 admin 审批后才自动绑定；不能因为姓名或邮箱相似就自动通过。
- 绑定码在网页端保留为备用/管理员主动邀请路径，不再作为唯一高效路径。原因是网页邮箱注册缺少微信 openid 身份上下文，审批流比用户自绑更安全。

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
3. 球员绑定申请：小程序自选注册球员 -> admin 审批 -> 自动绑定；网页端也按 A 方案提交绑定申请并经 admin 审批，绑定码保留为备用邀请路径。
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
