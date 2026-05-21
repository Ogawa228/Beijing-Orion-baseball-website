# 北京猎户座官网 · 设计 Brief

> 面向 Claude Design、设计师或下一轮前端重构。本文保留设计语言、页面职责、组件契约、数据边界和近期状态；逐轮流水账已压缩，旧长版已备份到 `orion-demo/backups/`。

最后整理：2026-05-21  
当前线上：`express-knlw-035-20260521140027`

部署状态：2026-05-21 14:03 已部署 `express-knlw-035-20260521140027`：首页 footer 合规/举报入口、球员页低动效遮罩居中修复、普通球员页省帧模式、注册入口合规增强、公开身份/真实身份磨砂化和跨公开页面脱敏均已上线。部署后仅本文档和 `orion-demo/HANDOFF.md` 有记录性更新。

---

## 1. 项目定位

北京猎户座棒垒球俱乐部的“队伍门面 + 队员个人面板 + 比赛数据中心”。

核心人群：

- 路人 / 招新：了解球队故事、阵容、活动、入队方式。
- 现役队员：登录后看个人数据、积分、比赛记录和高光。
- 管理员：维护球员、比赛、赛事、活动、名人堂；上传 GameChanger PDF；修订数据；管理积分和签到。

当前技术形态：纯 HTML/CSS/JS 页面 + Express API + MySQL Serverless + COS，部署在微信云托管。未来设计要兼顾 Web 与小程序复用。

---

## 2. 视觉方向

核心隐喻：以星辰之名，奔赴每一场比赛。

保留方向：

- 真实摄影优先：球队照片、月球地平线、深空全景是项目气质来源。
- 章节感：罗马数字 + 金线 + 中英双语 eyebrow，像一本球队年鉴。
- Navy / Blue / Gold：深海军蓝做背景，电蓝做活力色，香槟金做荣誉与成就语义。
- 数据密度：比赛、球员、积分页面可以密集，但要有清晰层级。
- 球员真实档案与公开展示分离：真实姓名/官方球员照用于后台、本人视角和数据匹配；球员页、积分榜、积分明细、比赛详情、赛事页、名人堂和公开个人面板对非正式用户展示球员本人设置的公开名称/公开头像，未设置时显示档案姓名和档案照的磨砂玻璃效果，并以轻量高光闪烁提示“可辨但不清晰”。

避免方向：

- 不要改成普通 SaaS 仪表盘。
- 不要用一堆紫蓝渐变光斑替代真实照片。
- 不要把球员页变成卡片墙首屏；当前首屏重点是星阵。
- 不要用营销落地页式 hero 取代真实产品页面。

---

## 3. 页面清单

| 页面 | 角色 | 当前职责 | 设计注意 |
|---|---|---|---|
| `index.html` | 首页 | Hero（月球/地球 + logo + 照片墙）、报刊式卷首、Quick Nav、积分规则、负责人/球队信息、联系邮箱 | Hero 与 Editorial 是首页核心；联系锚点为 `#contact` |
| `players.html` | 球员墙 | 首屏星阵头像节点、题字“猎户群星闪耀时”、点击节点弹 v2.4 球星卡、管理员星阵编队台；`?wallpaper=1` 可作为 Wallpaper Engine 动态壁纸源 | 星阵优先；非正式用户优先看公开名/公开头像，未设置时看磨砂玻璃化档案名/档案照，并有低成本玻璃高光闪烁；普通球员页启用省帧模式，保留视觉但减少常驻节点动画；低动效/暂停态不得出现磨砂遮罩偏移或粒子残影；球星卡只在点击后 modal 出现；壁纸模式隐藏操作 UI |
| `dashboard.html` | 个人面板 | 能力剖面、核心/进阶数据、趋势图、Game Log、高光、球员页公开展示资料设置 | 公开视角对未设置公开资料的档案姓名/档案照做磨砂玻璃化；本人/管理员可看真实档案并维护公开展示名称/头像；账号昵称/头像与公开展示资料分离 |
| `games.html` | 比赛索引 | 棒球 / 慢垒 tabs，按赛事卡片展示 | 等待 dbReady 后渲染 |
| `tournament.html` | 单赛事 | 赛事信息、全部场次、球员排行榜 | 排行榜需要可排序；头像/姓名走公开身份或磨砂化 |
| `game-detail.html` | 单场 | 比分、逐局、累计得分线图、双方对比、4 张 batting/pitching 表、MVP、高光 | 列头排序 + `tfoot` 合计不动是硬契约；MVP、表格姓名、高光球员名和图表标签不得向非正式用户清晰暴露真实姓名/真照 |
| `ranking.html` | 积分榜 | Top 3 领奖台、完整排行表、赛季筛选、跳积分明细 | 移动端隐藏部分拆解列；头像/姓名走公开身份或磨砂化 |
| `player-points.html` | 积分明细 | 头像、排名、总分、4 类构成、时间线筛选 | game 类时间线应能跳比赛/赛事；头像/姓名走公开身份或磨砂化 |
| `admin.html` | 后台 | CRUD、导入、确认、修订、合并、积分、签到、上传 | 更像操作面板，不要弱化“确认/修订/留痕” |
| `hall-of-fame.html` | 名人堂 | 入选球员或仪式感空状态 | 赛季奖项由 admin 录入；头像/姓名走公开身份或磨砂化 |
| `events.html` | 活动 | 占位待补 | 后续需重新设计活动形态 |
| `contact.html` | 遗留页 | 被首页 `#contact` 取代 | 可清理，但直接访问仍要兜底 |
| `legal.html` | 协议与个人信息保护规则 | 用户协议、隐私政策、个人信息处理规则、儿童规则、权利行使、法律依据 | 作为注册入口协议链接的完整公开页，需随注册/数据处理功能变化同步更新 |

Footer 合规与审美要求：

- 域名：`猎户座棒垒球.cn`。
- ICP 备案号：`京ICP备2026027592号-1`。
- 首页 footer 悬挂协议与个人信息保护规则链接：用户协议、隐私政策、个人信息处理规则、未成年人规则、个人信息权利。
- 首页 footer 悬挂违法和不良信息举报入口：中央网信办举报中心 `https://www.12377.cn/` 和公安部网络违法犯罪举报网站 `https://cyberpolice.mps.gov.cn/`。
- 首页 footer 悬挂 `Edited by 江山` 和 ICP 备案号，meta 信息保留版权 / 署名 / 备案号，备案号链接到工信部备案官网 `https://beian.miit.gov.cn/`。
- 其他子页按页面气质选择简洁 footer，目前只保留品牌 + 版权，不逐页堆叠备案号和署名。
- `players.html?wallpaper=1` 是动态壁纸源，保持隐藏 footer；普通 `players.html` 只显示简洁 footer。

首页球队信息：

- `靳江山` 显示为 `数据组 / 运维组 · DATA / DEVOPS`。这里的“运维组”指网站维护/技术运维署名，不等同于后台权限模型里的 `运营组`。

---

## 4. 设计 Token

颜色：

```css
--navy-950: #050B18;
--navy-900: #0A1628;
--navy-850: #0C1A30;
--navy-800: #0F1E38;
--navy-700: #17294A;
--navy-600: #1F3660;

--blue-500: #2E6BFF;
--blue-400: #5B8BFF;
--blue-300: #8FB0FF;
--blue-glow: rgba(46,107,255,.3);

--gold: #C9A961;
--gold-bright: #E4C77A;
--gold-glow: rgba(201,169,97,.25);

--text: #E8EEFA;
--text-dim: #9AA9C4;
--text-mute: #5E6E8C;

--line: rgba(255,255,255,.06);
--line-strong: rgba(255,255,255,.12);
--line-bright: rgba(255,255,255,.20);
--opponent-red: #ff8a8a;
```

字体：

```css
--font-display: "Playfair Display", "Noto Serif SC", Georgia, serif;
--font-body: "Inter", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
--font-orion-title: "OrionQijiTitle";
```

使用规则：

- `Playfair Display` / `Noto Serif SC` 只给 hero、章节标题、比分等展示文字。
- 正文、UI、表格用 Inter / 系统中文字体。
- `OrionQijiTitle` 只用于球员页题字，对应文件 `assets/img/fonts/huanglingdong-qiji-orion-title.woff`。

间距 / 圆角 / 动效：

```css
--s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px; --s-5: 24px;
--s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px; --s-10: 128px;

--r-sm: 8px;
--r-md: 14px;
--r-lg: 20px;
--r-xl: 28px;

--ease: cubic-bezier(.2,.7,.2,1);
--ease-out: cubic-bezier(.16,1,.3,1);
```

---

## 5. 核心组件和模式

| 组件 / 模式 | 用途 | 约束 |
|---|---|---|
| `.theatre` section head | 全站章节 | 罗马数字、eyebrow、主标题、副标、金线要保留 |
| `.nav` / `auth.js` | 全站导航 | 当前顺序：首页 / 球员 / 活动 / 比赛 / 积分榜 / 名人堂 / 联系；中等宽度两行布局，中文不可逐字断行 |
| `.card` | 普通内容卡 | 深 navy + 克制金蓝高光，卡片不套卡片 |
| `.stats-table` | 数据表 | 表头可排序；球员行在 `tbody`，合计在 `tfoot`，排序只动 `tbody` |
| `.stats-chart-wrap` | game-detail 排序图 | 当前是 Chart.js 简单条形图，可重设视觉，但保留跟随排序列的交互 |
| `.cap-profile` | dashboard 能力剖面 | 5 轴 radar + 中心 OPS + slash 行 + 百分位拆解 |
| `.player-card-shell` | v2.4 球星卡 | Topps 1:1.4、3D flip、轻玻璃材质；不改统计来源和身份规则 |
| `.arm-node` / `.orion-arm-stage` | 球员页星阵 | 星点节点、路径闪耀、hover 粒子圈、点击弹卡；默认星阵优先 |
| `.arm-admin-panel` | 管理员星阵编队台 | 可发布全站配置；自定义模板保存在本机 |
| `.podium-card` | 积分榜 Top 3 | 迷你球星卡语言、头像 ring、积分大字 |
| `.pp-bd-card` / `.pp-tl-item` | 积分明细 | 4 类构成 + 时间线拆解；正负分颜色区分 |
| `.file-picker` | 上传 | 支持点击/拖拽，图片先压缩；批量导入保留子目录语义 |
| `.modal-mask` / `.modal` | 后台弹窗 | 暗背景 + 功能卡，关闭按钮不压内容 |
| `.toast` | 操作反馈 | success / error / info 三态 |

---

## 6. 素材库

```text
orion-demo/assets/img/
├── logo.jpg
├── backgrounds/
│   ├── moon-earthrise.jpg              # 首页 hero
│   ├── orion-deep-space-panorama.png   # 子页面与球员星场
│   ├── nasa-cosmic-cliffs-14575w.jpg   # 留档
│   ├── nasa-cosmic-cliffs-2400w.jpg    # 留档
│   └── earth-horizon.jpg / earth-iss.jpg / milky-way-arch.jpg
├── group/
├── photos/
├── players/
├── generated/orion-default-player-avatar.png # 缺少档案照时的兜底头像，OR + 星空金属队徽风格
├── fonts/huanglingdong-qiji-orion-title.woff
└── tournaments/
```

设计原则：

- 保留真实球队照片，不用插画替代。
- 首页 hero 继续用 `moon-earthrise.jpg`。
- 子页面和球员星场使用 `orion-deep-space-panorama.png`。
- 旧 NASA Cosmic Cliffs 留档，不是当前主背景。

---

## 7. 数据模型与接口边界

当前数据走 Express API + MySQL；不要新写 localStorage 数据源。`assets/js/db.js` 是前端唯一 fetch client 和 cache 层。

关键实体：

- `players`：含 `level: casual | verified`、`aliases`、球员身份字段。
- `users`：账号、角色、头像昵称、`bound_player_id`、在线状态。
- `games`：home/away、linescore、batting/pitching、oppBatting/oppPitching、MVP。
- `tournaments`、`events`、`hall_of_fame`、`highlights`。
- `bind_codes`、`attendances`、`points_adjustments`。
- `site_settings`：当前用于 `players-starfield` 全站视觉配置，只保存视觉参数，不改业务数据。
- `admin_audit_logs`：后台修订留痕。
- `user_notifications`：站内信 / 绑定邀请通知。
- `player_bind_requests`：用户申请绑定正式球员档案；admin 审批后才自动绑定。

注册与绑定申请语义：

- 网页和小程序注册都应先让用户选择 `试训队员` 或 `绑定正式球员档案`。
- 默认展示低复杂度字段：昵称、邮箱、密码、确认密码；没有邮箱验证时不要把注册入口做重。
- 试训注册时，`user.display_name` 与临时 `casual player.name` 都先使用昵称；后续可由管理员调整。
- 选择正式档案后才展开目标球员搜索、队内昵称、微信号、其他验证信息，不重复要求真实姓名或球衣号。
- 目标球员候选列表在表单内展开，不使用覆盖后续字段的浮层；搜索框下方保留说明小字，不使用“取消”按钮，再次点击搜索框、点击外部字段、点击下拉内空白、失焦或 Esc 均可收起。
- 正式档案绑定不能自动通过，必须进入 `player_bind_requests`，由 admin 批准或驳回。
- 小程序已注册用户后续绑定网页邮箱时，用一次性关联码增加 `user_identities.email`，避免创建第二套 user / casual player。
- 注册和网页邮箱关联入口必须保留协议确认：用户协议、隐私政策、个人信息处理规则、必要个人信息处理单独同意，以及未满 14 周岁监护人确认；完整文本在 `legal.html`，注册弹窗内只放重点摘要和链接。
- 注册入口必须显著提示球员页公开展示规则：正式球员可在个人面板设置公开名称/头像；未设置时非正式用户看到档案姓名和档案照的磨砂玻璃效果。

球员公开展示语义：

- `players.public_display_name` / `players.public_avatar` 是球员页公开展示资料。
- `player.name` / `player.photo` 仍是真实档案，服务于后台、本人视角、比赛统计和 alias-aware 匹配。
- 非正式用户（访客、试训、绑定待审）在 `players.html`、`ranking.html`、`player-points.html`、`game-detail.html`、`tournament.html`、`hall-of-fame.html` 和公开 `dashboard.html?id=...` 优先看公开展示资料；未设置时看到档案姓名和档案照的磨砂玻璃效果，不再显示 `XX` 或统一默认头像。图表 canvas 标签在非正式视角下不直接显示真实姓名。
- `assets/img/generated/orion-default-player-avatar.png?v=4` 仅作为缺少档案照时的兜底静态头像，不作为常规公开身份展示。

`site_settings/players-starfield` 当前字段语义：

- formation / path / year / yearLimit
- pathDuration / breatheDuration / sway / spread / randomSeed
- particleMode / particleDensity / particleOpacity / particleRepelRadius / particleRepelForce / particleReturnSpeed

---

## 8. 不要破坏的契约

1. 部署前必须本地预览并获得用户本轮明确同意。
2. 用户说“备份代码”时，默认就是提交并推送到 GitHub 仓库 `Ogawa228/Beijing-Orion-baseball-website`；不要额外做本地 zip/备份目录，除非用户明确要求。
3. GitHub 只备份代码和文档，不备份 `.env`、数据库真实数据、COS 对象、原始素材包、赛季 PDF、输出截图或 zip。
4. `DB.isOrionTeam(name)` 同时识别棒球“猎户星”和慢垒“猎户座”。
5. 所有页面自己的 DB 渲染必须先 `await window.dbReady()`。
6. GameChanger 文件名 `<away>_vs_<home>_<Mon>_<DD>_<YYYY>.pdf` 是导入权威源。
7. `Totals/总计/合计/总和` 行不得进入球员数组。
8. 改 `parser.js` 必跑 `npm run test:gamechanger`，当前覆盖 5 份真实 PDF。
9. 名字匹配要走 alias-aware canonical：`DB.getPlayerByName` / `DB.playerCanonicalKey` / `DB.playerNameKeys`。
10. 借调球员的对手队数据只在单场 box score 展示，不计入该球员赛季统计和积分。
11. 积分公式权威源是 `DB.POINTS_RULES` / 后端 points 语义；展示卡和 admin 快捷按钮也要同步。
12. 球员合并不得改写 `games` 原始 JSON 姓名；用 `players.aliases` 做统计归并。
13. `game-detail.html` 的 sortable table 只能排序 `tbody`，`tfoot` 永远钉在底部。
14. 批量导入封面图的语义边界是子文件夹，不要把不同子目录的 PDF/图片拍平成顶层错配。
15. COS 返回 URL 必须是 `tcb.qcloud.la` 可浏览器访问路径，不要用私有 COS raw origin。
16. Three.js r184 静态白名单必须包含 `three.module.js` 和 `three.core.js`。
17. 普通访客低动效偏好优先，管理员“强制 WebGL”只影响管理员本机即时预览。

---

## 9. 球员页当前设计状态

线上版本 `032` 的球员页要点：

- 首屏是星阵头像节点，不是普通卡片网格。
- 题字“猎户群星闪耀时”使用黄令东齐伋体子集字体。
- 星点松散排布，避开搜索/筛选条与移动端 HUD。
- 在线状态不压头像小点，而是让星点外圈/光晕转绿。
- hover/focus 时头像 3D 浮起，粒子收束到头像金色边框附近。
- 点击星点从头像圆心弹出居中 v2.4 球星卡 modal。
- 右下角低动效按钮写入访客本机 `localStorage`。
- 管理员右侧“群星编队台”可收起，支持 FORMATION / MOTION / CUSTOM / STARDUST。
- `STARDUST` 高级项控制粒子密度、亮度、排斥半径、排斥力度、回弹速度，并显示实际渲染状态。
- WebGL 粒子是光标附近局部排斥打散，不是整片跟随鼠标。
- WebGL 初始化失败时有轻量 DOM 星尘兜底；也可关闭星尘。
- 性能优化已缓存比赛/球员运行态、路径分配、布局签名、粒子参数，并在稳定后跳过无效顶点遍历；2026-05-21 `express-knlw-034-20260521133747` 进一步把普通页面 WebGL 空闲态改为按需绘制，鼠标扰动、CSS 粒子兜底和 `?wallpaper=1` 壁纸模式才连续绘制，同时避免大量节点持续执行 filter/blur 动画；星阵离开视口或页面隐藏时通过 IntersectionObserver + Page Visibility 停止 JS 帧循环、暂停 CSS 动画、关闭 CSS 粒子的常驻 `will-change`，恢复可见前自动唤醒。
- 2026-05-21 `express-knlw-034-20260521133747` 新增公开身份磨砂化：星点、弹卡正反面和公开 dashboard 优先使用公开身份；未设置公开资料时对档案名/档案照加磨砂玻璃和轻量高光闪烁，动画只改 opacity，不改 blur/filter/scale；星点头像、磨砂层和光圈共用圆形尺寸变量，窄屏 30px 节点也保持圆心和边缘对齐；aria-label/alt 避免直接暴露真实姓名；链接改为 `dashboard.html?id=<playerId>`。
- 2026-05-21 `express-knlw-034-20260521133747` 扩展到积分榜、积分明细、比赛详情、赛事页和名人堂：所有球员头像/姓名统一走 `DB.publicPlayerIdentityForViewer()`；已绑定正式球员账号和管理员可清晰查看，非正式视角使用公开身份或磨砂化档案资料。
- 球员页搜索区下方有一行轻量提示：成为正式球员后，可完整查看清晰头像与姓名。
- `players.html?wallpaper=1` 进入全屏动态壁纸模式：隐藏导航、搜索、筛选、HUD、弹卡和管理员面板；继续读取 `site_settings/players-starfield`，并强制保留动态效果，供 Wallpaper Engine 加载。

设计重做时可以改视觉，但不要改以上交互语义和性能边界。

---

## 10. 后台与数据修订

后台当前是高密度操作面板：

- 球员池：正式/试训、合并、升级、编辑。
- 用户账户：绑定、角色、重置密码。
- 绑定码：给 verified 球员生成，支持 casual -> verified 合并。
- 积分管理：手动加减分、训练/活动签到、全员总览。
- Match：赛事设置 / 比赛数据 / 数据确认 / 数据修订。

权限模型采用“等级 + 权限包 + 权限点”，不要只依赖 `role='admin'`：

- A 全站级 / Owner：默认仅 `admin@orion.cn`。拥有全部权限，可授予/回收 B/C 权限、重置密码、生成网页关联码、直接绑定/解绑用户、查看全部审计日志、执行高风险删除、修改系统设置。球员页群星排列、`site_settings/players-starfield`、全站视觉配置只属于 A。
- B 队长级：包含数据组和运营组两个同级权限包，并额外拥有球队身份和成绩事实权限：审批绑定申请、生成绑定码、合并/升级/编辑球员、修改号码/位置/别名/正式状态、授予荣誉 title、管理名人堂、记录签到、调整积分。
- C 数据组：与运营组同级，负责比赛数据和统计流程：上传 GameChanger PDF、提交解析结果到待确认、确认入库、修订已入库比赛数据、修改 MVP / Game Log / 比赛统计、处理姓名匹配和解析警告、查看比赛相关修订记录。
- C 运营组：与数据组同级，负责内容和展示流程：新增/编辑活动、赛事基础信息、上传封面/活动图片/高光封面、审核/发布/下架高光、编辑球员展示性资料（头像、标语、展示 title）。
- A 包含全部；B 自动包含数据组 + 运营组；C 可单独授予 `data`、`ops` 或两者。前端隐藏无权限入口，但真正限制必须由后端 `requirePermission(...)` 控制。A 不应被其他管理员降级或删除。
- 账户管理页用户列表筛选分为三个不重复维度：`身份` 筛全部/管理员/A/B/C/普通，`权限组` 筛数据组/运营组/数据+运营，`球员位置` 筛投手/捕手/内野手/外野手/未设位置；位置以绑定球员档案 `players.position` 为准。
- 账户删除属于 A 全站级高风险能力：只显示给有 `destructive:delete` 权限的账号，禁止删除 `admin@orion.cn` 和当前登录账号；删除用户只清理账号侧数据，只有独占的试训档案会随账号删除，正式球员档案不删除。

导入流程：

- 单场上传极简为“赛事 + 封面图 + PDF”。
- 日期、主客场、对手名来自 PDF 文件名。
- 解析结果先进入“数据确认”，确认后入库。
- 已入库比赛通过“数据修订”修改，并要求修订原因。
- `PATCH /api/games/:id` 写入 `admin_audit_logs`，保留 before / after / changedKeys。

批量导入：

- 拖入文件夹时保留相对路径。
- 同一子文件夹内 PDF + 图片视为同一场候选。
- 同名匹配优先；否则按同目录唯一/最新/顺序猜测，并让 admin 在预览阶段确认。

---

## 11. GameChanger parser 设计要点

当前文本型 PDF 已解决：

- footer per-side state machine。
- key-span 扫描，不靠逗号硬切。
- 多行比分头识别。
- 文件名补全队名和主客翻转。
- noisy batting row fallback。
- 投手表边界。
- footer 字段赋值而非累加，并对冲突发 warning。
- 球员池真实姓名/aliases 纠正 PDF 漏字。

回归入口：

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
npm run test:gamechanger
```

长期 roadmap：

- 文本型 PDF：继续通过新增真实样本扩回归。
- 图片型 PDF：需要 OCR，可能涉及 `poppler-utils` + `tesseract` 或第三方 OCR，独立立项。
- 后端化 parser：等 OCR 或批量解析真的需要 server-side 能力时再做。

---

## 12. 小程序适配提示

- 登录改 `wx.login` + 后端 session。
- 小程序球员绑定采用“用户自主选择注册球员 -> 管理员审批 -> 自动绑定”的申请流；后台收到审批提示，核对微信身份/头像/姓名备注后批准或驳回。
- 网页端按 A 方案升级为“申请绑定 + 管理员审批”：邮箱注册后也可以选择目标注册球员，并填写队内昵称、微信号、其他验证信息等核验内容；后台批准后自动绑定。
- 注册表单采用渐进式可见性：默认只显示低复杂度基础字段，用户选择绑定正式球员档案后再展开目标球员搜索和核验信息。
- 目标球员搜索候选列表不得遮挡后续输入框，必须有清晰的收起路径；不放“取消”按钮，依赖点击空白、失焦、再次点击搜索框和 Esc 关闭。
- 网页端不能自动通过绑定申请，因为邮箱注册缺少微信 openid 这样的身份上下文；绑定码保留为管理员主动邀请/备用路径。
- 建议新增 `player_bind_requests` 或等价表；审批结果可复用 `user_notifications` 通知用户和管理员。
- 小程序、Web、Admin 必须共用同一个 Express API + MySQL，不新增一套小程序本地事实源。
- 多端同步以服务器为准：小程序可缓存，但进入页面/下拉刷新要重新拉取 API；写操作只提交行为流水。
- 积分共享现有 points 语义：小程序展示积分和触发签到/活动参与，不在端上重算或直接写总分。
- 活动从“占位页”升级为活动接龙/报名：`events` 主表 + 报名流水表；小程序负责报名/取消/查看名单，后台负责创建、关闭、导出和人工修正。
- 动态签到用短时效 QR token：后端校验活动/训练、用户身份、时间窗和重复签到，再写 attendance 或活动参与流水。
- 可复用 `user_notifications` 做绑定申请、审批结果、活动提醒、报名成功和签到成功。
- 首页 hero 图需压到小程序首屏可承受大小。
- 照片墙拖拽改 swiper。
- drag & drop 上传改点击选取 + `wx.chooseMessageFile`。
- Chart.js 全部替换为小程序图表库，保留排序/合计行契约。
- Box Score 宽表需要横向滚动或横屏方案。
- 上传必须接 COS / 云存储，不能回到本地路径或 base64。
- admin 上传心智模型保留“选赛事 + 文件，其他由文件名/解析自动识别”。

---

## 13. 近期改动索引

只保留仍影响设计/实现的近期状态：

- 2026-05-15 `032`：`players.html?wallpaper=1` 动态壁纸模式上线，复用管理员全站发布的球员星阵动效。
- 2026-05-15 `031`：管理员权限改为 A/B/C + 数据组/运营组权限包，后台 UI 按权限隐藏入口，账户列表三维筛选，A 级删除账户，绑定申请/网页关联码流程上线。
- 2026-05-15 `030`：球员页 STARDUST 高级项、WebGL `three.core.js` 白名单、星阵性能优化。
- 2026-05-15 `029/028`：WebGL 粒子可见性与轻量星尘兜底，管理员可切换粒子模式。
- 2026-05-15 `027`：全站公共导航顺序稳定。
- 2026-05-15 `026`：年份字阵、粒子局部打散、静态托管白名单。
- 2026-05-15 `023`：`site_settings` 与球员星阵全站发布。
- 2026-05-15 `022`：球员页星场、题字、管理员面板、低动效、移动端 HUD、子页面深空背景。
- 2026-05-14 `021`：球星卡 v2.4 轻玻璃材质收敛。
- 2026-05-14 `020`：后台数据确认/修订、修订留痕、头像金圈填充。
- 2026-05-12 `018`：合并球员、批量封面同目录匹配、COS 上传生产预检、头像/高光压缩。
- 2026-05-12 `017`：GameChanger parser 真实 PDF 回归。
- 2026-05-11：双身份 dashboard、积分系统、排行榜、player-points、首页 Editorial、导航与 dbReady 稳定。

---

## 14. 改进优先级

1. 活动页从占位改为可用的信息架构。
2. game-detail 的 4 张排序图表重设计，保留排序和合计契约。
3. 后台 admin 信息密度与操作分组优化。
4. 小程序一期：`wx.login`、多端共用 MySQL/API、活动接龙/报名、动态扫码签到、积分共享。
5. 清理遗留 `contact.html` 和旧照片墙 CSS。
6. OCR 图片型 PDF 作为单独项目。
