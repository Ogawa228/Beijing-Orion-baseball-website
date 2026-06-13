# 北京猎户座官网 · 接手快照

> 面向下一轮 Codex/Claude 接手。这里只保留当前状态、硬规则、关键契约和排障入口；逐轮历史已压缩，旧长版已备份到 `orion-demo/backups/`。

最后整理：2026-06-13

Claude Code 接手摘要（2026-06-12）：

- 工作区：`/Users/jinjiangshan/Downloads/猎户网站项目/orion-demo`；小程序源码在 `miniprogram/`，微信开发者工具项目为 `project.config.json`。
- 当前状态：线上为 `express-knlw-056`（2026-06-13 签到 500m 地理围栏 + 赛事地图选点 + 新建赛事保存后刷新；承接 `express-knlw-055` 的 Apple 风格按钮与 UI 居中优化）。小程序 AppID `wx8ad6ccfa1b8f040a` 已通过 `miniprogram-ci` 上传开发版本 `1.0.12`，robot `1`，备注为“2026-06-13 签到500m地理围栏、赛事地图选点、新建赛事保存后刷新”；尚未提交微信审核或发布正式版。后端/网页端 `express-knlw-056` 已通过 `deploy:verify`，线上 `/api/health` 200 且 DB OK。
- 云资源：小程序 AppID `wx8ad6ccfa1b8f040a` 已通过资源复用读取 `wx7dce60930ee10898` / `prod-d5gtkxdyu7263e95b` / `express-knlw`，不要另建孤岛数据库。请求层在 `miniprogram/utils/request.js`，使用 `new wx.cloud.Cloud({ resourceAppid, resourceEnv })` + `callContainer`，并保留已关联环境兜底。
- 本轮重点（2026-06-13）：保持猎户深蓝/金色，不做 Liquid Glass 大改；全局 `miniprogram/app.wxss` 重建 `.btn / .btn-primary / .btn-ghost / .btn-danger / .btn-small / .btn-pill`，所有按钮用 flex 水平/垂直居中、统一圆角、稳定 hover/disabled；赛事活动页主操作卡和“接龙 / 赛事 / 比赛”分段改成 Apple 式圆角 action tile / segmented control；管理台 tabs、球员档案分段、待办卡、快捷入口和小操作按钮统一圆角与居中；现场记分高频按钮、更多结果、底部模式切换、撤销/保存等按钮统一尺寸和圆角；比赛中心、接龙详情、发起接龙、个人页、赛事管理页等常用按钮同步收口。
- 验证状态：`node --check scripts/verify-miniprogram-preflight.js`、服务端 JS `node --check`、本地 `PORT=18080 NODE_ENV=production npm start` + `/api/health`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci`、`git diff --check`、小程序开发版本 `1.0.11` 上传、`wxcloud run:deploy` 创建并发布 `express-knlw-055`、`deploy:verify --expected-version express-knlw-055 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 均通过；线上 `/api/health` 200 且 DB OK。
- 接手优先级：下一步如要面向用户可见，需要在微信公众平台把开发版本 `1.0.11` 提交审核，审核通过后再发布正式版。注意：`express-knlw-043` 是在 `.dockerignore` 补 `.secrets/` 前创建的中间版本；`express-knlw-045` 曾因 `--envParamsJson` 只传 WeChat 变量而覆盖 DB 变量，已由 `express-knlw-046` 及后续版本修复，后续部署必须把 DB + WeChat 环境变量一起传入。保险起见，建议在微信后台重新生成小程序“代码上传密钥”。当前工作区仍有未提交改动，用户说"备份代码"时执行 commit + push。

2026-06-13（十）签到地理围栏、赛事地图选点与新建赛事刷新（已部署后端 `express-knlw-056`；已上传小程序开发版 `1.0.12`，robot `1`；尚未提交审核或发布）：修复用户反馈三个问题。① 选地点统一地图选点:赛事管理页 `pages/tournaments/tournament-manage` 地点字段从纯手动输入补“地图选择”按钮,调 `wx.chooseLocation`(复用活动接龙 `chooseEventLocation` 同款逻辑,回填地点名 + 记坐标供下次选点定位),与活动接龙地点选择一致;`app.json` 已声明 `chooseLocation`。② 签到 500 米地理围栏:此前签到前后端都无任何距离校验,任意地点都能签到。后端 `server/routes/checkins.js` POST `/checkins/direct` 新增 Haversine 距离校验——接龙 `metadata.location` 有地图选点坐标时,签到位置(`wx.getLocation` GCJ-02,与 chooseLocation 同坐标系)与目标点距离 >500m 返回 403 `too_far`(带实际距离),缺定位返回 400 `location_required`;无坐标的老接龙放行(无目标点无法围栏)。前端 `checkin.js` 经 `request.js`(statusCode≥400 抛 `data.message`)把后端距离提示显示给用户(现有 catch 已覆盖,无需改前端)。新增 `scripts/test-checkin-geofence-route.js`(mock db 端到端测远点 403/近点 201/缺定位 400)纳入 `test:miniprogram-ci`。③ 新建赛事“似乎不起作用”根因 = 创建本身成功(后端 POST `/tournaments` 本地实测 201 正常,字段匹配),但 `event-list onShow` 只 `syncTabBar` 不刷新,创建后返回列表看不到新赛事;已用 `orionEventHubDirty` storage 标志:赛事创建/编辑/删除、发起接龙成功后 `setStorageSync` 标志,`event-list onShow` 检测则 `load()` 刷新一次并清标志(平时不刷新以免切 tab 频闪)。验证:完整 `npm run test:miniprogram-ci` 17 项全绿、`node --check`、`git diff --check`、本地 `PORT=18080` 起服务实测 `/api/health` 200 / admin 登录 28 权限 / 创建赛事 201 / Haversine(298m 放行、1193m 拒绝)/ 围栏路由测试通过;`wxcloud run:deploy`(带 `--targetDir . --dockerfile Dockerfile --containerPort 80` + `NODE_OPTIONS=--no-experimental-webstorage`)发布 `express-knlw-056`,`deploy:verify --expected-version express-knlw-056` 通过(serviceNormal / latestVersionNormal / expectedVersionMatches / healthOk 全 true);小程序开发版 `1.0.12` 上传成功。

2026-06-13（九）小程序 Apple 风格按钮与 UI 居中优化（已部署后端/网页端 `express-knlw-055`；已上传小程序开发版 `1.0.11`，robot `1`；尚未提交审核或发布正式版）：① 保留深蓝/金色品牌，重建小程序全局按钮体系：`button` 和 `.btn` 默认 flex 居中，主按钮圆角 24rpx，小按钮 20rpx，胶囊按钮 999rpx，并补统一 hover/disabled 状态，避免按钮文字靠 `line-height` 顶偏或回到方角。② 赛事活动页三张主操作卡改为居中 action tile，“接龙 / 赛事 / 比赛”改为胶囊式 segmented control，“加载更多”和小操作按钮统一圆角与居中。③ 管理台顶部模块 tabs、球员档案分段、待办统计卡、权限组、快捷入口、`link/tiny-link` 等实际操作控件统一成圆角按钮或胶囊按钮，文字水平/垂直居中。④ 现场记分台的坏球/好球/界外球、更多结果、模式切换、撤销和垒位按钮统一圆角、尺寸和居中；比赛中心、发起接龙、接龙详情、比赛详情、比赛修订、数据导入、赛事管理页和个人页退出登录按钮同步收口，其中退出登录保持整宽危险操作按钮。⑤ `test:miniprogram-preflight` 增加按钮体系断言，保护全局 `.btn` flex 居中、主按钮圆角不低于标准、`button { border-radius: 0 }` 不回归，并检查赛事活动、管理台、现场记分台、个人页、赛事管理页重点按钮。验证：`node --check scripts/verify-miniprogram-preflight.js`、服务端 JS `node --check`、本地生产模式启动和 `/api/health`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci`、`git diff --check` 全部通过；上传 `1.0.11` 时在 Node 25 下需 `NODE_OPTIONS='--no-experimental-webstorage'` 关闭新版 WebStorage 兼容问题，开发版上传成功；云托管第一次创建 `express-knlw-054` 后构建失败，重试创建并发布 `express-knlw-055` 成功，CLI 最终输出“部署完成”；`deploy:verify --expected-version express-knlw-055 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，线上服务 normal、最新版本 normal、`/api/health` 200 且 DB OK。

2026-06-13（八）小程序赛事活动、赛事管理、时间选择与管理台 UI 优化（已部署后端/网页端 `express-knlw-053`；已上传小程序开发版 `1.0.10`，robot `1`；尚未提交审核或发布正式版）：① 底部 tab 排布不变，`pages/events/event-list` 改为“赛事活动”统一工作台，顶部按权限展示“开始记录比赛 / 新建赛事 / 发起活动接龙”三张主操作卡，下方分段为“接龙 / 赛事 / 比赛”；赛事卡展示赛事名、类型、项目、赛季、日期、地点、比赛数，并把“详情 / 编辑”放在卡片操作区，删除不放卡片上。② 新增 `pages/tournaments/tournament-manage`，从赛事活动页“新建赛事”和赛事卡“编辑”进入；表单字段对齐网页端赛事容器，包含赛事类型、项目、全称、简称、赛季、开始/结束日期、地点、封面/COS URL 和简介；编辑态增加“比赛归属整理”，可按未关联/当前赛事/全部比赛筛选，多选后调用 `/games/batch-reassign` 移动到当前赛事；删除赛事仅 `destructive:delete` 可见，需输入“删除赛事”，只删除赛事容器不删除比赛。③ 时间选择统一点选：赛事开始/结束日期、接龙活动日期/时间、比赛日期、签到/积分统计日期等需要确定日期或时刻的字段使用小程序 `picker`，默认当天；需要具体时刻时拆成日期 picker + 时间 picker；旧 `YYYY-MM-DD HH:mm` 数据打开时自动解析，保存继续兼容既有字段格式。④ 管理台重排为跨模块后台面板，顶部新增待办摘要（待审绑定、待审精彩时刻、近期接龙、未关联比赛），主模块保留绑定审批、球员档案、积分签到、账号权限、最近操作；球员档案拆成“球员池 / 新增球员 / 批量导入 / 合并档案”，移除隐藏在管理台里的赛事 CRUD 和批量比赛整理 UI，必要能力迁移到赛事管理页。⑤ 发起接龙页删除“一键导入帖子/小红书”、`xhsRaw`、`parseXhs*` 和相关样式；`sourceLink` 只作为“外部链接（可选）”；接龙详情保留并强化群接龙导入，按钮为“粘贴并识别群接龙 / 识别输入框内容”，识别结果展示已识别、已匹配、待人工确认，管理员可继续手动矫正名单状态。验证：相关 JS `node --check`、`npm run test:tournaments-audit`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci`、`git diff --check` 全部通过；上传使用 Codex 捆绑 Node 运行 `miniprogram-ci`，开发版本 `1.0.10` 上传成功；云托管全量部署备注“2026-06-13 赛事活动赛事管理和管理台优化”，创建并发布 `express-knlw-053`；`deploy:verify --expected-version express-knlw-053 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，线上服务 normal、最新版本 normal、`/api/health` 200 且 DB OK。

2026-06-13（七）小程序功能 UI 与慢投垒记分优化（已部署后端/网页端 `express-knlw-052`；已上传小程序开发版 `1.0.9`，robot `1`；尚未提交审核或发布正式版）：① 底部 tab 排布不变，`pages/events/event-list` 改成“赛事活动工作台”，顶部只放“开始记录比赛 / 查看比赛记录 / 发起活动接龙”，下面分区展示最近接龙和最近比赛。② `pages/games/game-list` 改成“比赛工作台”，`开始记录比赛` 为唯一主按钮，`导入 GameChanger`、筛选比赛、赛事赛季是次级操作；空状态给“开始记录第一场”。③ `pages/score/create` 改成“比赛信息 -> 出场名单 -> 守位确认”三步，接龙导入后展示“已识别 / 已绑定 / 需手动添加”，守位继续保留场地图并强调点选守位。④ `pages/score/live` 改成“现场记分台”：顶部比分/局数/出局/垒位/当前打者/球数/撤销固定成任务条，主屏只放坏球、好球、界外球、安打、出局、保送/上垒和更多结果；底部模式切换为“打席 / 跑垒 / 投手 / 阵容 / 日志 / 赛后”，低频结果收进“更多结果”。⑤ 慢投垒规则写入端上逻辑和保存 payload：`softball` 初始与新打席都是 `1-1`，界外球加好球，两好界外自动三振并轮到下一棒；`baseball` 保持 `0-0` 且两好界外不三振；新日志字段包含 `countBefore/countAfter/pitchCount/baseBefore/baseAfter/resultKey/resultLabel`，`metadata.scoreRules` 记录规则。⑥ 比赛详情能展示慢投垒规则、球数和垒位推进；`.tab-page` 底部避让更新为 `220rpx`；个人页退出登录继续保持全宽危险操作按钮。验证：相关 JS `node --check`、`npm run test:miniprogram-score`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci`、`git diff --check` 全部通过；上传使用 Codex 捆绑 Node 运行 `miniprogram-ci`，开发版本 `1.0.9` 上传成功；云托管全量部署备注“2026-06-13 功能UI和慢投垒记分优化”，创建并发布 `express-knlw-052`；`deploy:verify --expected-version express-knlw-052 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，线上服务 normal、最新版本 normal、`/api/health` 200 且 DB OK。

2026-06-13（六）小程序“赛事活动”入口、底部遮挡修复与云托管全量部署（已部署后端/网页端 `express-knlw-051`；已上传小程序开发版 `1.0.8`，robot `1`；尚未提交审核或发布正式版）：① 底部左侧 tab 改名为“赛事活动”，以一个入口承载活动与比赛；首页“近期活动”右侧入口同步改为“赛事活动”。② `pages/events/event-list` 从单纯活动接龙列表升级为赛事活动 hub：顶部先显示操作区，有权限用户可直接点“开始记录比赛”进入 `/pages/score/create/create`，同时保留“比赛中心”“发起接龙”“刷新”；记录权限规则与比赛中心保持一致，`events:write`、`games:draft`、`games:confirm` 或无细分权限的 admin 可见可用。③ 5 个 tab 页根节点统一加 `tab-page`，全局 `.tab-page` 用 `height: calc(100vh - 150rpx)` + `overflow-y:auto` 把内容滚动区域控制在固定 tabBar 之上，解决首页“最近比赛”等内容被底部 tabBar 盖住的问题。④ 个人页退出登录按钮改为 `btn-danger logout`，全宽 100%、96rpx 高，更接近常规 App 的危险操作按钮。⑤ 按用户“云托管部署，全部部署”要求补做云托管全量发布，`wxcloud run:deploy` 创建并发布 `express-knlw-051`。验证：完整 `npm run test:miniprogram-ci`、`node --check`、`git diff --check` 通过；上传使用 Codex 捆绑 Node 运行 `miniprogram-ci`，开发版本 `1.0.8` 上传成功，备注“2026-06-13 赛事活动入口、开始记录比赛、底部避让、退出登录按钮”；云托管部署命令备注“2026-06-13 赛事活动入口和底部遮挡修复”，CLI 仍有历史已知 `ResourceNotFound.TopicNotExist` 轮询噪声但最终输出“部署完成”；`deploy:verify --expected-version express-knlw-051 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，线上服务 normal、最新版本 normal、`/api/health` 200 且 DB OK。

2026-06-13（五）小程序比赛中心记分入口、绑定申请制与管理台精简（已部署后端 `express-knlw-050`；已上传小程序开发版 `1.0.7`，robot `1`；尚未提交审核或发布正式版）：① “开始记录比赛”主入口保留在比赛中心，活动中心列表只保留发起接龙/刷新；`events:write` 运营组及 `games:draft/games:confirm` 数据组可见可用；活动详情里的“开始记录比赛”仍可带接龙上下文进入，服务端 `POST /api/games` 改为 `games:confirm` 或 `events:write` 均可写入。② 底部 tabBar 避让改为纯 `240rpx` 全局 padding，避免 `rpx + env(px)` calc 在部分机型失效后内容压到固定 tabBar 下。③ 小程序端绑定统一走申请审批：管理台不再展示发送绑定邀请、绑定码中心、网页关联码、直接绑定/解绑、删除账号等入口；绑定码相关历史 action 在审计里降为历史操作文案，球员重名升级冲突提示改为“提交绑定申请，由管理员审核后合并”。④ 管理台首页改成模块 tabs：绑定审批、球员档案、积分签到、账号权限、最近操作；保留日常必要功能，移除星阵发布、赛事设置、接龙/比赛批量删除、名人堂授予等低频/高危面板的可见入口；常用入口保留“活动中心/发起接龙/数据导入”等，并提示开始记录比赛进入比赛中心。验证：完整 `npm run test:miniprogram-ci` 通过（含 preflight/request/events/tournaments/highlights/hof/leaderboard/notifications/admin-users/records/auth/games-linkage/players-import/flows/score），相关 `node --check`、`git diff --check` 通过；`deploy:verify --expected-version express-knlw-050 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；小程序开发版 `1.0.7` 上传成功。

2026-06-13（四）小程序 tabBar/登录三次反馈修复（已上传开发版本 `1.0.6`,robot `1`,备注"2026-06-13 修复tabBar重叠(padding兜底)/屏闪(CSS图标)/加退出登录";后端无改动,线上仍 `express-knlw-049`;尚未提交审核或发布）:体验 1.0.5 后用户截图反馈 tabBar 仍与内容重叠、切换仍屏闪、需要退出登录入口、登录按钮尺寸不合适。① 重叠根因再定位 = `.page` 的 `padding-bottom: calc(132rpx + env(...))` **混合 rpx + env(px) 单位在部分机型整体失效→padding 丢失**,内容延伸到固定 tabBar 下;改为纯 rpx fallback `200rpx` + `calc(150rpx + env(safe-area-inset-bottom))` 双声明(失效时退回 200rpx 仍足够避开 tabBar 主体 108rpx + 中央凸起钮)。② 屏闪进一步治理 = tabBar 图标从 `<image>` 组件改为 view 的 CSS `background-image`(`style="background-image:url('{{svg-data-uri}}')"`),消除每次切换页面新 tabBar 实例的 image 组件解码空白帧。③ 个人页:登录态底部新增"退出登录"按钮(btn-ghost 红色调,showModal 二次确认,调 `/auth/logout` + `session.clearSession()` + `setIdentity({user:null,player:null})` + 清页面状态);未登录态隐藏"绑定申请/近期报名"两个空 section(加 `wx:if="{{user}}"`),只留"未登录"卡 + 登录按钮;登录按钮加高 92rpx/字号 30rpx、文案"微信登录"更突出。验证:完整 `npm run test:miniprogram-ci` 16 项全绿、`node --check`、`git diff --check` 通过。⚠️ 若屏闪仍残留(所有 tab 切换都闪),属微信自定义 tabBar 每次切换重新挂载组件的固有现象,下一步可评估改 Skyline 渲染模式或取舍中央凸起大钮换原生 tabBar。

2026-06-13（三）小程序 UI 二次反馈修复（已上传开发版本 `1.0.5`,robot `1`,备注"2026-06-13 修复tabBar重叠/频闪、未登录按钮、登录记住昵称二次一键登录";后端无改动,线上仍 `express-knlw-049`;尚未提交审核或发布）:用户体验 1.0.4 后反馈四点,逐一修复。① 底部 tabBar 矢量图标与页面内容重叠 + 切换频闪,根因 = 自定义 tabBar 组件根节点 `.orion-tabbar` **缺 `position: fixed`**,混在页面文档流里、随内容重排;已加 `position:fixed; left/right/bottom:0; z-index:1000`,并把全局 `.page` 底部 padding 从 56rpx 增到 `calc(132rpx + env(safe-area-inset-bottom))`,给固定 tabBar 留出避让空间(非 tab 页多出的底部留白顺便避开 home indicator,无副作用)。② 个人面板未登录态"登录按钮大小奇怪",根因 = 未登录时仍渲染 5 个快捷入口 cell、登录按钮淹没其中;已给 profile `.quick` 加 `wx:if="{{user}}"`,未登录只剩"未登录"卡 + 全宽登录按钮作焦点。③ 登录流程:不再每次手动输入昵称——新增 `orionLoginPrefs` 本地存储记住昵称与协议确认,login `onLoad` 预填并进入 `returning` 模式(显示"欢迎回来 {昵称}" + 一键登录,折叠昵称输入与协议勾选,保留"修改昵称 / 重新阅读协议"链接 `editAgain` 切回完整表单);登录成功 `setStorageSync` 记住,二次进入点一下即登录。首次登录仍走完整"输入昵称 + 勾选三项同意"。验证:完整 `npm run test:miniprogram-ci` 16 项全绿、`node --check`、`git diff --check` 通过。⚠️ 频闪如仍有残留(image data-uri 图标解码),下一步可把 tabBar 图标从 `<image>` 改 CSS `background-image`;本轮先验证 `position:fixed` 是否已解决。

2026-06-13（二）小程序 UI 视觉精修（已上传开发版本 `1.0.4`,robot `1`,备注"2026-06-13 UI精修:tabBar矢量图标/频闪修复/个人面板按钮/管理台溢出修复";后端无改动,线上仍 `express-knlw-049`;尚未提交审核或发布正式版）：针对用户反馈"切换频闪 / 个人面板按钮不清晰 / 管理台左右滑动超限 / 底部 tab 素材太普通不够高级 / 整体视觉再优化"逐条修复。① 底部 tabBar 重设计 `custom-tab-bar/`:emoji 图标全部换成内联 SVG 矢量线性图标(灰 `#7f8ca6` / 金 `#e4c77a` 两态,通过 `svgIcon()` 生成 `data:image/svg+xml` URI;活动=日历、数据=柱状、积分=奖杯、我的=用户),中央"签到"金色凸起圆钮内嵌矢量对勾(深色 `#0a1424`,stroke 2.6)。② 频闪根因两处:(a) tabBar 组件原 `data.active:1` 默认 + 页面 onShow 后置 `setActiveByRoute`,switchTab 进新页时先以 active=1 渲染再 setData 到目标 index → 选中态闪;改为组件 `attached` 即用 `getCurrentPages()` 取当前页 route 同步 active,首帧渲染就正确。(b) profile 原 onShow 每次无条件 `this.load()` + setData ~18 字段 + wx:if 区块反复折叠 → 整页重渲染抖动;改为 `onLoad` 首次加载、`onShow` 仅 syncTabBar + 增量同步 user + 5 秒节流静默 reload(下拉刷新仍绕过节流)。(c) home `.hero-bg` 补占位底色 `#0a1628`、event-list 补首屏骨架,消除图片 decode 白闪与列表高度跳变。③ 个人面板按钮重做:profile 5 个纯文字 `quick-card` 改为「圆形 emoji 图标 + 标题 + 副标题 + › 箭头」的清晰 cell(单列,`quick-cell/quick-ico/quick-cell-title/quick-cell-sub/quick-arrow`,带 hover 反馈);英文 eyebrow 中文化(My Orion→个人中心、Player Profile→球员绑定、bind 的 Player Profile→🔗 球员绑定、Verification→✅ 核验;home/login 的品牌英文副标作装饰保留)。④ 管理台横向滑动超限根因 = 多个 flex 标题容器(`.player-pool-title/.attendance-player-title/.history-title`)缺 `min-width:0`、内层球员名/别名裸 `<text>` 缺断行,长无空格英文名/别名撑破卡片导致整页可横拖;在 admin.wxss 末尾追加兜底规则:这三个 flex 容器加 `min-width:0`,并给 `.request-title/.overview-name/.point-game-label/.audit-title/.game-batch-title/.batch-player-text/.compact-title` 及上述容器内 `text` 统一 `min-width:0 + word-break:break-all`(微信对 `overflow-wrap:anywhere` 支持不稳,用 `break-all`)。⑤ 全局字阶统一:全站 wxss `font-weight` 非标准值(850/820/760/750→800,950/880→900)批量归档,只保留 300/600/700/800/900;`.card-title` 字号全站统一 30rpx。⑥ 测试:preflight 更新 tabBar 断言(SVG 图标 svgIcon/iconActive/checkinIcon、attached+getCurrentPages 防闪、image 图标 wxml、margin-top 负值正则)与 profile 断言(quick-cell 系列 + 无英文 eyebrow);完整 `npm run test:miniprogram-ci` 16 项全绿、`node --check`、`git diff --check` 通过。后端无改动,线上仍 `express-knlw-049`;本地代码已备份到 GitHub(commit 5f848d6 之后本轮新增)。

2026-06-13 小程序导航改版「驾驶舱 + 底部 tabBar」与 UI 全量排查收口（已随开发版本 `1.0.3` 上传，robot `1`，备注"2026-06-13 底部tabBar驾驶舱首页改版与UI三态防误修复"；上传走 Codex 捆绑 Node + `miniprogram-ci` CLI，包体约 1.1MB；后端无改动未部署，线上仍为 `express-knlw-049`；尚未提交审核或发布正式版）：应用户要求"首页按钮少一点、整页清爽"，主导航迁入自定义底部 tabBar，首页瘦身为数据中心。① `app.json` 声明 `tabBar.custom: true`，5 个 tab 依次为 `活动中心(event-list) / 数据中心(home) / 签到(checkin,居中) / 积分榜(points) / 我的(profile)`，启动仍落在 `pages[0]=home` 即数据中心；新增 `custom-tab-bar/` 组件——深蓝底栏 + 中央 108rpx 金色凸起"签到"大圆钮（深底描边融合、active 提亮、safe-area 适配），其余 tab 用中文+emoji 文字项，5 个 tab 页 `onShow` 调 `nav.syncTabBar(this)` 同步选中态。② 首页「驾驶舱」：删除五张快捷卡、加入区、名人堂与精彩时刻内容区、管理/个人按钮；保留小 hero（高度 360→280rpx，右侧登录态胶囊：未登录金色"登录"、已登录显示昵称、点击切到"我的"）+ 三个信息区块（下一场接龙 / 积分榜 Top3 / 最近比赛，区块标题右侧文字链接分别进活动中心 tab、积分榜 tab、比赛中心页）+ 页脚低频文字链接（球员阵容 / 名人堂 / 精彩时刻）；首页请求收敛为 4 个（auth/me、events?limit=1、leaderboard?limit=3、games?limit=3），不再拉名人堂与精彩时刻内容，flows 用例以"unexpected GET 即失败"锁住该收敛。旧"首页首屏五个主流程快捷卡"契约自本条起废止。③ 导航语义改造：新增 `utils/nav.js`（`TAB_PATHS/isTabPath/go/syncTabBar`，与 `app.json` tabBar.list 同步维护）；tab 页跳转一律 `switchTab`——contact"查看接龙"、checkin 成功页"查看我的积分"、event-create 返回接龙列表（原 `redirectTo` 不能进 tab 页）、profile/admin 的 `go()` data-url 智能分流、home 区块 navigator 加 `open-type="switchTab"`；接龙详情"接龙签到"深链因 switchTab 不能带参，改为 `orionPendingCheckinEventId` 写 storage + checkin `onShow` 消费后重载接龙候选并选中。④ 同轮落地 UI 全量排查（5 维度 31 条发现、反驳式核实 17 条确认）的全部确认项：points/notifications/bind/profile/event-detail 名单卡补 loading 门控与骨架（修复首屏闪"暂无…"假空态）、points 与 tournament-detail 增加 `loadError` + "重新加载"重试卡（`app.wxss` 新增全局 `.load-error`）、checkin 接龙列表失败不再静默吞错（showError + "重新加载接龙"按钮）、写操作补 saving 重入守卫与按钮 disabled（checkin 签到、highlights 投稿与审核钮、event-create 发起、event-detail 全部名单写操作含 importing、bind 提交、admin 名人堂授予/移出），杜绝双击产生重复签到/投稿/接龙/名单行/申请；admin 移出名人堂增加 confirmAction 二次确认；player-detail 精彩时刻与积分流水空态补 `!loading` 门控；通知页"加载更多球员"改全局 `btn btn-ghost load-more` 样式并和 event-list、各加载更多按钮统一补 `disabled`；空态文案统一"暂无…"口径（暂无活动/暂无报名/暂无匹配球员/暂无积分数据）。⑤ 测试：preflight 首页断言整体换为 tabBar/驾驶舱契约（custom tabBar 结构与签到居中第 3、组件文件与凸起样式 token、5 tab 页 onShow 同步、checkin 深链 storage 交接、首页瘦身负断言、管理入口断言移至 profile），flows 的 wx mock 补 `switchTab`、首页用例改为瘦身契约；完整 `npm run test:miniprogram-ci` 16 项全绿、受影响 JS `node --check`、`app.json` JSON 校验、`git diff --check` 通过；上传前重跑完整 CI 再次全绿。

2026-06-12 绑定申请微信身份显示与接龙权限部署：网页/后端发布到 `express-knlw-049`。修复点：`/admin/bind-requests` 返回 `hasWxIdentity`，网页后台和小程序管理台显示“微信登录已关联”；`contactTail/contact_tail` 不再标为“微信号”，统一显示为核验信息；小程序绑定页说明微信登录身份自动关联、备注仅选填；发起接龙按钮和创建页按 `events:write` 权限门控，普通用户只可查看/报名/签到。部署命令中 `wxcloud run:deploy` 在非 TTY 下必须显式传 `--targetDir . --dockerfile Dockerfile --containerPort 80`，否则会弹“请选择部署方式”并在 Node v25 下崩溃；本次创建 `express-knlw-049` 时 CLI 轮询阶段曾遇到本机 DNS `servicewechat.com` 解析失败退出，但版本任务已创建，随后 `deploy:verify --expected-version express-knlw-049 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务 normal、最新版本 normal、线上 `/api/health` 200 且 DB OK。小程序用 Codex 捆绑 Node 上传开发版本 `1.0.2`，robot `1`，备注“2026-06-12 绑定申请显示微信登录身份，限制发起接龙权限”；尚未提交审核或发布正式版。

2026-06-12 小程序上传与云托管部署：用户确认定位接口已开通并授权“上传代码和部署小程序”。本地将签到从 `wx.getFuzzyLocation` 切到 `wx.getLocation`，`app.json.requiredPrivateInfos` 改为 `chooseLocation` + `getLocation`，更新预检脚本和小程序流程测试；完整 `npm run test:miniprogram-ci` 通过。系统 Node v25 与 `miniprogram-ci@2.1.31` 不兼容，会在 `global.localStorage.getItem` 处报错；上传时使用 Codex 捆绑 Node `/Users/jinjiangshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node` 直接运行 `node_modules/miniprogram-ci/dist/cli/index.js upload` 成功。上传结果：开发版本 `1.0.0`、robot `1`、备注“2026-06-12 首版小程序上传：账号互通、管理台、接龙签到精确定位”。云托管先创建了 `express-knlw-043`，随后发现 `.dockerignore` 未排除 `.secrets/`，立即补规则并发布干净版本 `express-knlw-044` 全量覆盖；`deploy:verify` 显示服务 normal、最新版本 normal、线上 `/api/health` 200 且 DB OK。后续处理：提交审核/正式发布尚未执行；建议轮换小程序代码上传密钥。

2026-06-12 微信登录与“无需关联码”绑定申请流：小程序体验版微信登录弹“微信小程序 AppID/AppSecret 未配置”，线上 `/api/auth/wx-login` 最初返回 503 `wechat_config_missing`。排查确认不是数据库未连通，而是云托管服务缺少 `WECHAT_MINIPROGRAM_APP_ID` / `WECHAT_MINIPROGRAM_APP_SECRET`；首次补变量发布 `express-knlw-045` 时因 `--envParamsJson` 会覆盖环境变量导致 DB 配置丢失，随后用完整 DB + WeChat 环境变量发布 `express-knlw-046` 修复 DB。再排查云托管访问 `api.weixin.qq.com` 出现 fetch/cert 链问题，`server/routes/auth.js` 改为生产使用 IPv4 `https.request`，仅对微信 jscode2session 的证书链异常做一次 `rejectUnauthorized:false` 兜底；`express-knlw-048` 线上 `/api/health` 200 且 DB OK，假 code 登录返回微信 `invalid code` 401（预期结果，表示已实际请求到微信接口）。小程序登录页删除用户侧关联码入口：微信登录成功后未绑定正式球员档案的账号直接跳到 `/pages/bind/bind`，首页和个人页增加显眼“申请绑定正式球员档案”CTA，绑定页改成“选档案 / 填核验 / 等审核”三步申请；后端 `/api/auth/link-wechat` 仍保留为备用/管理路径，但不再作为普通小程序登录页主流程。已通过完整 `npm run test:miniprogram-ci`、`git diff --check`，并上传微信后台开发版本 `1.0.1`（robot `1`，备注“2026-06-12 修复微信登录并改为登录后直接申请绑定球员档案”）。

2026-06-08 上传前定位规则修正（已被 2026-06-12 权限开通后的精确定位路线取代）：当时微信 `miniprogram-ci` 编译明确报错 `requiredPrivateInfos 'getFuzzyLocation' is mutually exclusive with 'getLocation'`，因此临时可上传路线改为只声明 `chooseLocation` + `getFuzzyLocation`。2026-06-12 微信后台已开通 `getLocation` 后，当前小程序已切回 `chooseLocation` + `getLocation`，队员签到调用 `wx.getLocation({ type: 'gcj02' })`，不能同时声明 `getFuzzyLocation`。

2026-06-08 上传尝试状态：已重新通过 `WECHAT_MINIPROGRAM_UPLOAD_PRIVATE_KEY_PATH=.secrets/private.wx8ad6ccfa1b8f040a.key npm run test:miniprogram-ci` 和 `git diff --check`。`miniprogram-ci` 上传在编译打包后被微信接口拒绝：`invalid ip: 61.149.15.107`，需要把该公网 IP 加到小程序代码上传密钥白名单或关闭/调整白名单。随后尝试微信开发者工具 CLI 上传，工具要求开启“服务端口/CLI 调用能力”，这是本机安全授权，已按用户规则暂停，未代用户确认。当前仍未上传、未预览、未部署。

2026-06-09 补充：网页手机端登录后看不出已登录的问题已修复。原因是共享导航的移动端 CSS 在 768px 断点下强制隐藏 `.nav-hello`，登录后手机右上角只剩“退出”按钮，缺少用户名/已登录提示；`assets/js/auth.js` 现在给 nav 写入稳定的 `auth-state-*` 状态类和 `data-auth-state`，`assets/css/style.css` 在手机端保留用户名胶囊提示。已用 390px 手机视口验证：登录 cookie 状态下右上角显示“管理员 / 退出”，游客“登录 / 加入我们”入口隐藏，控制台无相关 error/warn；同时通过 `node --check assets/js/auth.js` 与 `git diff --check -- assets/js/auth.js assets/css/style.css`。

2026-06-09 补充：球员页星阵继续修复三项。`players.html` 的“成为正式球员后，可完整查看清晰头像与姓名”提示已改为游客态显示，登录后隐藏；新增 `diamond` / “棒球场钻石”星阵，网页星阵控制台、后端 `/site-settings/players-starfield` 白名单和小程序管理台星阵发布入口均可识别该 formation；球员星阵布局增加固定相邻规则，把 `p_jinjs`（江山/靳江山）与 `p_yujing`（虞婧）在散列、螺旋、环形、钻石、斜翼、年份等编队下保持近邻但不重叠。已用 390px 登录态验证：提示隐藏、钻石预设可选、两人跨多预设中心距约 55-59px，控制台无相关 error/warn；已通过 `npm run test:miniprogram-flows`。

2026-06-09 前次部署补充：用户明确要求“部署”后，已执行 `npm run deploy` 发布到微信云托管，版本为 `express-knlw-037`。`npm run deploy:verify -- --expected-version express-knlw-037 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过：服务 `express-knlw` 状态 `normal`，最新版本状态 `normal`，线上 `/api/health` 返回 200 且 DB OK。小程序源码仍未走预览/上传/真机。

2026-06-09 登录态挂载补充：继续排查“登录状态无法挂载”后确认后端账号和 session 本身正常，`POST /api/auth/login` 会设置 `orion_session`，同 cookie 请求 `/api/auth/me` 能返回 `u_admin`。真正风险在前端/缓存边界：线上 `/api/auth/me` 游客响应原来没有 `Cache-Control`，浏览器或云网关可能在登录后继续复用 `{ user: null }`；同时 `DB.reload()` 没有更新 `window.dbReady()` 等待的 Promise，受保护页可能按旧游客 preload 判定。当前修复：`server.js` 对全部 `/api` 响应加 `no-store/no-cache`；`assets/js/db.js` 的 fetch 加 `cache: 'no-store'`，`DB.reload()` 更新全局 `_preloadPromise`；`assets/js/auth.js` 的 `requireAuth()` 在准备跳转前强制刷新一次登录态并重渲染 nav。本地验证：`/api/auth/me` 和登录响应均带 no-store，登录后同 cookie 返回管理员；脚本验证 `DB.reload()` 后 `dbReady()` 指向新 Promise 且 `currentUser` 挂载为“管理员”；390px 浏览器本地验证 `players.html` 与 `admin.html` 显示“管理员 / 退出”、管理员入口可见、游客提示隐藏、无 console error/warn。已随 `express-knlw-038` 部署到云托管；线上验证 `/api/auth/me`、`/api/auth/login` 响应均透传 no-store，登录后同 cookie 请求 `/api/auth/me` 返回管理员。

2026-06-09 登录态挂载二次定位：用户反馈手机端访问 `www.猎户座棒垒球.cn` 仍会在欢迎页后重复登录。本地确认 `express-knlw-038` 仍有两个残留风险：所有 HTML 入口还引用 `assets/js/db.js?v=24` / `assets/js/auth.js?v=20`，移动端浏览器可能继续使用旧脚本；`orion_session` 为 host-only Cookie，`www.xn--4gsr8nf4ck7ihxnemb.cn` 与 `xn--4gsr8nf4ck7ihxnemb.cn` 之间不共享登录态，旧 host-only Cookie 还可能和新 Cookie 重名。当前修复：所有网页入口升到 `db.js?v=25` / `auth.js?v=21`；`server/auth-helpers.js` 对猎户座自定义域统一写 `Domain=xn--4gsr8nf4ck7ihxnemb.cn`，登录时先清当前 host 旧 Cookie，再写裸域 Cookie；`readSessionUserId()` 会遍历同名 Cookie 并跳过失效 token，避免旧坏值挡住新登录态；默认云托管域和 localhost 仍保持 host-only Cookie。本地验证：`www` 模拟域登录后，同一 cookie jar 请求裸域 `/api/auth/me` 返回 `u_admin`；重复 Cookie 中第一个为 invalid、第二个为有效 token 时 `/api/auth/me` 仍返回管理员；390px 浏览器本地验证 `players.html` 与 `admin.html` 最终显示“管理员 / 退出”，球员页游客提示隐藏、登录入口隐藏、无 console error/warn；已通过 `node --check server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js`、`git diff --check -- server/auth-helpers.js server/routes/auth.js *.html` 和 `npm run test:miniprogram-flows`。已随 `express-knlw-039` 部署到云托管；线上验证 `www` 页面加载 `db.js?v=25` / `auth.js?v=21`，`www` 登录响应会清 host-only 旧 Cookie 并写 `Domain=xn--4gsr8nf4ck7ihxnemb.cn` 的新 Cookie，同一 cookie jar 请求 `www` 与裸域 `/api/auth/me` 均返回管理员；默认云托管域登录仍保持 host-only Cookie；自定义域 logout 会同时清 host-only 和裸域 Cookie，退出后 `/api/auth/me` 返回 `{ user: null }`。

2026-06-09 联系页面更新：联系页、首页联系人区和小程序联系页同步新增王斌，展示 `#110 / 外野`、邮箱 `478753480@qq.com` 和小红书 `609655049`；曹山和王斌标为联络人，洁哥标为球队经理；李斯然、黄强保留原微信 `Alan__1110`、`Deco_E`。联系提示改为“可以联系曹山或王斌”。本地 390px 浏览器验证联系页 5 张联系人卡、首页 7 张联系人卡均正常渲染且无 console error；完整 `npm run test:miniprogram-ci` 通过。已随 `express-knlw-040` 部署到云托管；线上 `www.猎户座棒垒球.cn` 的 `contact.html` 和 `index.html` 均包含新联系人信息，旧“杰哥/六位负责人”文案未出现。

2026-06-10 手机端登录态修复：用户截图显示手机端登录后仍停在游客态，地址栏为“不安全”，排查确认线上 `http://xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html` 和 `http://www.xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html` 曾直接返回 200，没有跳 HTTPS；生产 cookie 带 `Secure`，HTTP 页面无法保存登录 cookie，导致跳到 `dashboard.html` 后 `/api/auth/me` 仍是游客。当前修复：`server.js` 对猎户座自定义域且 `x-forwarded-proto=http` 的请求返回 308 到 HTTPS；`assets/js/auth.js` 前端兜底把自定义域 `http:` 页面替换到 `https:`；`POST /api/auth/register`、`/link-email`、`/login` 返回 `sessionToken`；`assets/js/db.js` 保存 `orion_web_session` 并对后续 API 带 `X-Orion-Session`，即使移动端 cookie 被拒也能挂载同一 HMAC session；logout 清除该兜底 token；全站 HTML 已升到 `db.js?v=26` / `auth.js?v=22`。本地验证：`node --check server.js server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js`、`git diff --check -- server.js server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js *.html`、本地 Host/x-forwarded-proto 模拟 308、`X-Orion-Session` 解析测试、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight` 和完整 `npm run test:miniprogram-ci` 均通过。已随 `express-knlw-041` 部署；线上验证 `deploy:verify --expected-version express-knlw-041` 通过，自定义域 HTTP 裸域和 `www` 均 308 到 HTTPS，HTTPS dashboard 加载 `db.js?v=26` / `auth.js?v=22`，线上 JS 资产包含 HTTPS 兜底和 `X-Orion-Session` 兜底逻辑。

2026-06-11 小程序 UI polish 与性能/卫生收口（仅本地，未预览、未上传、未部署）：按"性能/UI/契约/卫生"四维多智能体审计（23 条发现、核实 18 条）完成以下改动。① 现场记分 `pages/score/live`：`saveGame` 增加 `saving` 重入守卫且保存按钮 `disabled`，杜绝双击落库两场重复比赛；新增记分快照保护——每次打席/换局/垒位/撤销和 `onHide/onUnload` 把整页状态（除撤销栈）写入 `orionLiveScoreSnapshot`，`onLoad` 检测到同一场（按 rosterEventId/日期/对手/主客/运动指纹）未保存快照时弹窗询问恢复，拒绝或换场则丢弃；进入记分页调用 `wx.enableAlertBeforeUnload` 离开确认，保存成功清快照并解除拦截；所有 wx 新 API 均带能力检测，旧基础库自然降级。② 首页 `pages/home/home` 增加 `loading` 态与全局骨架屏样式（`app.wxss` 新增 `.skeleton-group/.skeleton-line`），五个区块的空态全部 `!loading` 门控，修复"积分数据读取中"在真空数据时伪装卡死的问题（现为"暂无积分数据"）；积分榜 `pts` 改中文"分"（球员阵容页同步）。③ 比赛详情 `pages/games/game-detail` 增加 `loading/loadError` 态：加载中显示骨架，失败显示"重新加载"重试卡，四块数据表加载完成前不再闪现"暂无…"假空态；逐局表表头 `Team` 改"队伍"；宽表横向滚动时球员名/队名列 `position: sticky` 锁定首列（不透明底色 + 右缘阴影），解决滑到 AVG/OPS/ERA 后看不清行归属的问题。④ setData 负载收敛：赛事详情把仅供排序重算的 `sourceGames/players/viewer` 改存 `this._*` 实例属性，球员详情把原始 `gameRecords/playerPool/publicHighlights` 同样下放实例属性、`buildGameState` 只返回渲染用派生字段，分页越翻 setData 不再越大；两页的 `/auth/me` 并入首屏 `Promise.all` 消掉一个串行 RTT。⑤ 分页收敛：`GET /api/bind-codes`、`GET /api/points-adjustments`、`GET /api/attendances` 支持 `limit/offset/hasMore/nextOffset`（bind-codes 另支持 `keyword`），不传 `limit` 保持旧版全量返回兼容网页端 `db.js` 整表读取；`GET /admin/bind-invitation-options` 支持 `limit/offset/keyword` 分页用户候选和 `includePlayers=false` 跳过无上限正式球员子查询，旧调用行为不变。小程序管理台绑定码中心改 50/页 +"加载更多绑定码"，绑定邀请用户候选改 50/页 +"加载更多可邀请用户"，邀请球员候选复用已分页的管理台球员池；管理台积分/签到记录改 `limit=8` 与 UI 实际渲染条数一致。⑥ 卫生：删除 `pages/checkin-token`、`components/orion-stat`、`components/orion-empty` 空目录；删除 `utils/format.js` 无引用的 `fmtDate/playerLabel`；`utils/player-identity.js` 只导出 `playerIdentity` 收紧公开身份唯一入口；签到页删除 fuzzy-only 后不可达的 `precise` 精度分支和恒空 `fallbackFrom/fallbackReason` 字段（后端 `/checkins/direct` 对缺省字段已有兼容）。⑦ 测试：新增 `npm run test:records-pagination`（三接口分页 + 旧版全量兼容）并纳入 `test:miniprogram-ci`；`test:admin-users-route` 增加 bind-invitation-options 分页/keyword/includePlayers 断言；`test:miniprogram-flows` 的管理台 mock 断言新分页参数；`test:miniprogram-score` 覆盖防双击只 POST 一次、快照写入/恢复/拒绝/错场丢弃/onHide 落地，并修复测试 harness `createPage` 多实例共享 `def.data` 的缺陷。本文件 9 处过时的"`wx.getLocation` 优先"定位描述已统一改为 fuzzy-only 现状。验证：完整 `npm run test:miniprogram-ci`、`node --check`、`git diff --check`、本地 `/api/health` 烟测全部通过。

2026-06-11 联系页成立时间修正（仅本地，未部署）：网页首页的球队信息口径为 `2013 年 9 月`；小程序联系页原先把成立时间硬编码为 `2010`，遗留 `contact.html` 也同步落了旧值。当前新增 `GET /api/team-info` 作为小程序联系页读取的统一球队信息接口（不依赖 DB 查询），小程序失败时才使用同口径兜底；`contact.html` 的训练时间和成立时间同步首页。已验证：`node --check server.js server/team-info.js miniprogram/pages/contact/contact.js scripts/test-miniprogram-flows.js scripts/verify-miniprogram-preflight.js`、完整 `npm run test:miniprogram-ci`、`git diff --check` 通过；本地 `/api/team-info` 返回 `2013 年 9 月`，`/api/health` 返回 DB OK。

2026-06-12 小程序 UI 比例专项排查（仅本地，未预览、未上传、未部署）：因子代理配额受限，本轮用确定性静态扫描代替多智能体审计——脚本核算了全部 wxss 的 grid 列数与求和、font-size 分布、px/rpx 混用、头像宽高、可点目标高度、image mode 和 sticky 列宽。结论：表格列数与 wxml 单元格全部对得上（game-detail 打击 15 列 1146rpx / 投手 11 列 930rpx / live 记分 8 列 682rpx，均在横向 scroll-view 内属设计）、无变形图片、无椭圆头像、px 仅出现在 `@media` 查询属正常。修复 3 处真实比例问题：① `game-detail.wxss` 逐局表 sticky 首列 `.cell.team` 由 180rpx 改 190rpx，与同页打击/投手表 `.name-cell` 首列同宽，三张上下排布的表格首列对齐；② `score/create.wxss` 两处低于全站 20-21rpx 小字底线的离群字号上调：场地图守位说明 `.field-label` 18→20rpx、顶部指标说明 `.metric-label` 19→21rpx；③ 排棒次高频操作 `.order-btn`（上移/下移）触控目标 48→60rpx、字号 24→26rpx、`.order-tools` 间距 8→12rpx 防误触（`.lineup-row` min-height 82rpx 可容纳）。紧凑型胶囊（`game-sport-chip`、`sort-chip`、`filter-chip` 等 48-54rpx）按 HANDOFF 既有设计保留。验证：完整 `npm run test:miniprogram-ci` 与 `git diff --check` 通过。

2026-06-12 账号互通反向关联（网页端与后端已随 `express-knlw-042` 部署；后续小程序用户侧关联码入口已被“登录后直接申请绑定正式档案”取代）：补上“网页先注册 → 小程序微信登录必然新建第二账号”的底层断点，方向与既有 `link-email` 对称。① 后端新增 `POST /api/auth/link-wechat`：要求与 `wx-login` 同样的三项法定同意；先验 `app_connect_code`（30 分钟一次性码，大小写不敏感）再消费 wx code，避免无效关联码烧掉一次性 jscode；`jscode2session` 换出的 openid/unionid 若已属于另一账号则 409 `wechat_already_linked`（提示联系管理员处理合并），否则 `attachWxIdentity` 挂到关联码对应账号、清码、写 `link_wechat_identity` 审计并返回 `sessionToken + linked: true`，不新建 user/player。② 小程序普通用户当前不再输入关联码；微信登录后未绑定正式档案即进入 `/pages/bind/bind` 申请绑定。`/api/auth/link-wechat` 和网页端“小程序关联码”仍保留为备用/管理员处理路径。③ 网页端配套：`assets/js/db.js` 新增 `DB.createAppConnectCode()` 调自助 `POST /api/auth/app-connect-code`；`dashboard.html` 保留关联码入口——已绑定球员的本人面板在姓名行“✏️ 编辑 / 设置公开展示”同排新增 `📱 小程序` 按钮，未绑定球员的登录账号在“申请绑定正式档案 / 输入绑定码”操作行新增 `📱 小程序关联码` 按钮，两处都打开专属 `miniConnectModal`：复用全站 modal 风格，金色等宽大号关联码 + 虚线金框 + 全宽“生成小程序关联码”主按钮，生成即自动复制并展示“30 分钟内有效”提示；注册弹窗 `link-email` 文案改为“小程序「个人」页可自助生成，也可向管理员索取”；因改动 `db.js`/`auth.js`，全站 13 个 HTML 升级 `db.js?v=27` / `auth.js?v=23`。④ 测试：新增 `npm run test:auth-link-wechat`（express 实挂路由 + stub `global.fetch` jscode2session + mock db，覆盖缺参/缺同意/无效码不烧 code/happy path 双身份写入与清码/微信已属他人 409 五种语义）并纳入 `test:miniprogram-ci`；preflight 保留 auth 路由、`db.js`、`dashboard.html` 的 link-wechat token 守护。验证：完整 `npm run test:miniprogram-ci`、相关 `node --check`、`git diff --check` 通过；本地预览实测 admin 登录 → dashboard 弹窗生成关联码（200，30 分钟）、`/auth/link-wechat` 无效码 404 / 缺同意 400，浏览器控制台无 error/warn，页面加载 `db.js?v=27`。注意：两个已存在的重复账号（网页一个 + 微信一个）的合并仍需管理员人工处理，本轮只阻止新增重复。

本轮状态：当前线上现为 `express-knlw-055`；微信后台开发版本已上传到 `1.0.11`，但尚未提交审核或发布正式版。小程序工程在 `miniprogram/`，AppID 为 `wx8ad6ccfa1b8f040a`。现有云托管资源环境归属记录为 `wx7dce60930ee10898` / `prod-d5gtkxdyu7263e95b` / 服务 `express-knlw`；小程序请求层已按官方云托管跨环境写法支持 `new wx.cloud.Cloud({ resourceAppid, resourceEnv })` + `callContainer`，并保留已关联环境下的 `wx.cloud.callContainer({ config: { env } })` 兜底。2026-05-27 资源复用授权后，开发者工具模拟器已确认 `wx8ad6ccfa1b8f040a` 可读取同一套云托管数据：首页 `/auth/me`、`/events`、`/games?includeAggregate=false`、`/leaderboard` 均 200，积分榜和最近比赛已渲染；原 `-601012 unauthorized env / 【资源复用】未获得该环境授权` blocker 已解除。编译面板剩余红错为开发工具运行时 `Error: timeout`，Network 未见失败请求；已将 `app.js` 的默认 `wx.cloud.init()` 调整为仅在直连本小程序环境或显式配置 `cloudInitEnv` 时执行，跨资源调用只初始化 `request.js` 的资源 Cloud 实例，避免无自有默认云环境时触发内部超时。小程序已覆盖首页、微信登录、登录后直接申请绑定正式球员档案、个人页账号资料/正式球员公开展示资料维护、球员阵容与球员详情、名人堂、精彩时刻照片墙/投稿/审核、活动接龙发起/报名/待定/取消、管理员 `wx.chooseLocation` 地图选点、管理员粘贴微信群接龙文本识别导入、一键签到（当前权限路线调用 `wx.getLocation` 精确定位）、球员绑定申请与审核状态查看、小程序管理台、积分榜、比赛列表/详情、赛事/赛季筛选、GameChanger PDF / Excel 数据导入预览、比赛发起、接龙名单导入/管理员手动补人的出场名单、拖动球员块调整棒次/守位、可视化位置排布和中文现场比赛记录（逐局、上/下半局、出局数、垒位、常见打席结果自动推进垒位/RBI/比分、打席后自动轮到下一棒、直接选择当前打者、现场阵容调整、事件日志、猎户打线、投手、对手统计、MVP、备注、撤销上一步）。按钮体系已统一为 Apple 式圆角、flex 居中、稳定 hover/disabled，`test:miniprogram-preflight` 会阻止 `button { border-radius: 0 }` 和核心按钮顶偏回归。新增小程序管理台 `pages/admin/admin`，管理员/数据组/运营组可从首页或个人面板进入；当前管理台按模块 tabs 收敛为绑定审批、球员档案、积分签到、账号权限和最近操作，保留新增/导入/合并球员、账号权限调整、手动积分、补录签到、最近审计摘要、精彩时刻待审统计和常用入口；不再展示主动绑定邀请、绑定码中心、网页关联码、直接绑定/解绑、账号删除、星阵发布、赛事设置、接龙/比赛批量删除和名人堂授予等旧入口。站内通知页支持有 `notifications:write` 权限的管理员按全队、正式球员、试训队员、管理员或指定球员发送通知。新增球员阵容页与网页端同源读取 `/players` 和 `/leaderboard`，展示正式球员、背号、守位、公开展示名/头像、积分和搜索筛选；球员详情页读取 `/players/:id`、`/players/:id/points` 和 `/games`，展示档案、积分拆分、能力概览、最近积分流水和相关比赛，比赛卡可跳转比赛详情；有 `players:write` 权限者可在球员详情页编辑姓名、背号、守位、左右打投、入队年份、口号、荣誉标签和别名，并可升级试训球员为正式球员，别名只用于统计归并不改写历史比赛 JSON。名人堂页 `pages/hall-of-fame/hall-of-fame` 读取 `/hall-of-fame?includePlayer=true`，用公开展示名/头像呈现入选年份和理由，并可点回球员详情；首页底部新增“猎户名人堂”荣誉区，不占用首屏五个主流程卡片。精彩时刻页 `pages/highlights/highlights` 复用 `/highlights`、`/players`、`/games`：非管理员只看 `published/approved` 图片，管理员/运营组可看待审图片并发布或退回；小程序只做图片预览，B站链接为可选字段并提供复制，不做外链播放器。比赛中心读取 `/games` + `/tournaments`，支持全部/慢垒/棒球以及赛事/赛季卡片筛选，兼容老数据的 season fallback。比赛详情页读取 `/players` 匹配猎户打击/投手行和 MVP，按公开展示名显示并可点回球员详情，未匹配的对手或临时姓名保持普通文本；小程序现场记分保存的比赛会显示“来自接龙”并可点回活动详情。签到成功页会显示本次积分变化、当前总积分和升级提示，积分页冷启动刷新 `/auth/me` 并展示个人积分流水。个人页近期报名已显示活动标题、时间地点、备注和中文状态；个人页/绑定页都能显示绑定申请 `待审核 / 已通过 / 已驳回`，绑定页会明确展示选中的正式球员，并随申请携带球衣号给管理员核验；`1.0.2` 起绑定审批界面显示“微信登录已关联”，核验备注不再误标为真实微信号。比赛详情小程序页已补 box score 回看：R/H/E、长打、守位、投手细项、对手统计、逐事件日志和 PDF 导出。当前 UI 预览 SVG 在 `design/miniprogram-game-flow-mockup.svg`。最新验证已通过完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:tournaments-audit`、相关 `node --check`、`git diff --check`、云托管 `deploy:verify --expected-version express-knlw-055` 和线上 `/api/health`。

2026-05-29 验证：本轮性能优化后已通过 `npm run test:miniprogram-ci`、相关 `node --check` 和 `git diff --check`；仅本地代码和 CI，未上传、未预览、未部署。新增优化：`/hall-of-fame` 支持 `includePlayer/limit` 并新增 `test:hof-route`，`/highlights` 支持 `includePlayer` 并由 `test:highlights-route` 覆盖，首页不再为名人堂/精彩时刻摘要拉取 `/players?limit=200`；列表头像、照片墙、图集和比赛封面缩略图统一启用 `lazy-load`。

2026-05-29 补充：小程序发起/编辑接龙页补齐网页后台“小红书帖子内容一键导入”能力。`pages/events/event-create` 新增帖子粘贴识别区，支持手动粘贴或读取剪贴板，自动填充标题、正文、中文 emoji 分类和原帖链接；日期、地点、封面仍由管理员确认，避免从帖子正文误写关键事实。该能力进入 `test:miniprogram-flows` 与 `test:miniprogram-preflight`。

2026-05-29 补充：小程序管理台“新增球员”补齐网页后台创建时上传真实照片。`pages/admin/admin` 的新增球员表单现在可粘贴图片 URL，或通过 `wx.chooseMedia` 选择压缩图片、`readFile(base64)` 后调用 `/api/upload/base64` 上传到 COS（`kind = player`），返回 URL 随 `POST /api/players` 写入 `players.photo`；创建过程中不把 base64 留在球员 payload，表单只保存 COS URL，创建完成自动清空。该能力进入 `test:miniprogram-flows` 和 `test:miniprogram-preflight`，未上传、未预览、未部署。

2026-05-29 补充：小程序管理台“批量导入球员”补齐网页后台批量照片匹配能力。管理员可先粘贴名单，再选择多张球员照片；小程序按照片文件名去掉扩展名作为球员姓名，逐张上传到 COS，只把“姓名 -> COS URL”映射随 `/players/import` 提交。后端 `POST /api/players/import` 新增 `photos/photoMap` 支持，按同一 `canonicalNameKey` 匹配写入 `players.photo`，忽略 data URL 和超长 URL，summary 返回 `photoMatched`，审计 metadata 记录 `matchedPhotoCount`。该能力进入 `test:players-import`、`test:miniprogram-flows` 和 `test:miniprogram-preflight`。

2026-05-29 补充：小程序管理台“赛事设置”补齐赛事封面图上传。管理员可在赛事容器表单里手动粘贴 COS 图片地址，也可用 `wx.chooseMedia` 选择压缩图片、`readFile(base64)` 后调用 `/api/upload/base64` 上传到 COS（`kind = tournament`），返回 URL 写入 `tournaments.cover`；表单显示封面预览并支持清空。赛事 payload 只保存 COS URL，不保存 base64，已纳入 `test:miniprogram-flows` 和 `test:miniprogram-preflight`。

2026-05-29 补充：小程序管理台接龙批量管理做性能收敛。`pages/admin/admin` 不再无上限读取 `/events`；首屏调用 `/events?limit=60&offset=0`，历史接龙多时通过“加载更多接龙”继续分页追加，并用 `mergeEventsById` 去重后再做批量选择/删除。这样保留误发接龙清理能力，同时避免管理台随着历史接龙累积变慢。

2026-05-29 补充：小程序比赛发起页继续性能收敛。`pages/score/create/create` 不再无上限读取 `/events`；接龙候选首屏只请求 `/events?limit=60&offset=0`，需要历史接龙时点“加载更多接龙候选”继续分页追加。若从活动详情 `eventId` 直达记分且该接龙不在首屏，会额外读取 `/events/:id` 补入候选，继续自动切到接龙来源、回填日期并载入已绑定报名名单。

2026-05-29 验证补充：比赛发起页接龙候选分页改动后，已通过 `node --check miniprogram/pages/score/create/create.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序比赛发起页球员候选继续性能收敛。`pages/score/create/create` 不再为了出场名单预取 `/players?include=all&limit=200`；首屏只读 `/players?include=all&limit=50&offset=0`，支持姓名/背号/守位搜索和“加载更多球员”。从接龙导入时，如果报名/待定成员的 `playerId` 不在当前候选页，会单独读取 `/players/:id` 补入候选，再进入 lineup，避免把已绑定球员误判为“需手动添加”。搜索页里勾选新球员不会清掉当前已选的隐藏 lineup。

2026-05-29 验证补充：比赛发起页球员候选分页搜索改动后，已通过 `node --check miniprogram/pages/score/create/create.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序球员详情能力概览继续性能收敛。`pages/players/player-detail` 不再为了单个球员详情读取 `/players?include=all&limit=200` 做花名册参考；能力概览的 AVG/OBP/SLG/OPS、进阶指标、近场趋势和百分位轴改为基于当前已加载的 `/games?includeAggregate=true&playerId=...&limit=30&offset=...` 相关比赛打击行生成参考池。点“加载更多相关比赛”后会用合并后的比赛记录重算参考池和能力轴，不额外拉完整球员表。

2026-05-29 验证补充：球员详情能力概览去球员池请求后，已通过 `node --check miniprogram/pages/players/player-detail/player-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序管理台球员池继续性能收敛。`pages/admin/admin` 不再首屏读取 `/players?include=all&limit=200`；管理台首屏球员候选只读 `/players?include=all&limit=50&offset=0`，球员档案管理区和积分/签到区都提供“加载更多球员/球员候选”。追加页按 id 合并后会同步刷新注册球员池、积分/签到 picker、批量出席名单、合并源/目标、直接绑定、绑定码球员和绑定码列表里的球员显示。

2026-05-29 验证补充：管理台球员池分页改动后，已通过 `node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序首页精彩时刻继续性能收敛。`/api/highlights` 新增 `includeGame=true`，会为当前页精彩时刻按 `game_id` 返回轻量 `highlight.game`（比分、日期、运动、主客队、赛事/接龙 id 等摘要），避免首页为了精彩时刻 meta 额外读取一批比赛。`pages/home/home` 最近比赛请求从 `/games?includeAggregate=false&limit=12` 收缩为 `limit=3`，精彩时刻仍取 12 张照片墙候选，但通过 `/highlights?public=true&includePlayer=true&includeGame=true&limit=12` 直接拿球员与比赛摘要。

2026-05-29 验证补充：首页精彩时刻 includeGame 和最近比赛 limit=3 改动后，已通过 `node --check server/routes/highlights.js`、`node --check miniprogram/pages/home/home.js`、`node --check scripts/test-highlights-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:highlights-route`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序精彩时刻页照片墙继续性能收敛。`pages/highlights/highlights` 的列表请求改为 `/highlights?includePlayer=true&includeGame=true&limit=60&offset=...`（普通用户追加 `public=true`），照片墙直接用 `highlight.player` 和 `highlight.game` 生成公开身份、比分 meta、球员/比赛跳转，不再依赖投稿比赛候选的首批 `/games`。未登录游客只浏览照片墙，不再拉 `/players` 或 `/games` 投稿候选；登录后投稿区仍按 `/players?include=all&limit=50&offset=...` 和 `/games?includeAggregate=false&limit=50&offset=...` 分页加载候选。

2026-05-29 验证补充：精彩时刻页 includeGame 和游客态跳过候选请求改动后，已通过 `node --check miniprogram/pages/highlights/highlights.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序球员阵容页积分摘要继续性能收敛。`/api/leaderboard` 新增 `playerIds` 参数，后端仍按全队积分排序后写入真实 `rank`，但响应只返回指定球员 id 的摘要。`pages/players/player-list` 首屏继续只读 `/players?limit=40&offset=0&includeTotal=true&includePositionCount=true`，顶部榜首单独读 `/leaderboard?limit=1`，当前页球员积分只读 `/leaderboard?playerIds=<当前页id>&limit=<当前页人数>`；加载更多球员时只为新追加页读取对应 id 的积分摘要，不再取 `/leaderboard?limit=200`。

2026-05-29 验证补充：球员阵容页排行榜摘要按当前页 id 读取后，已通过 `node --check server/routes/leaderboard.js`、`node --check miniprogram/pages/players/player-list/player-list.js`、`node --check scripts/test-leaderboard-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:leaderboard-route`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序管理台“手动调整积分”的关联比赛搜索继续性能收敛。`/api/games` 新增 `keyword/q` 轻量筛选（匹配 id、主客队、日期、场地、赛季、运动等字段），管理台初始比赛池仍按 `/games?includeAggregate=false&limit=80&offset=0` 分页；管理员在“关联比赛（可选）”里输入关键词时，只请求 `/games?includeAggregate=false&keyword=<关键词>&limit=40&offset=0` 的小候选并放入 `pointGameCandidateGames`，不污染批量移动/删除的 `visibleBatchGames`。清空搜索后回到已加载比赛池。

2026-05-29 验证补充：管理台积分关联比赛 keyword 搜索改动后，已通过 `node --check server/routes/games.js`、`node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-games-linkage-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:games-linkage`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci` 和 `git diff --check`。未上传、未预览、未部署。

2026-05-29 补充：小程序签到页继续性能收敛。`pages/checkin/checkin` 不再无上限读取 `/events`；接龙 picker 首屏只请求 `/events?limit=60&offset=0`，历史接龙通过“加载更多接龙”追加并按 id 去重。从接龙详情直达签到时，如果目标 `eventId` 不在首屏，会单独读取 `/events/:id` 补入候选并保持选中；当时签到说明后随 2026-06-08 临时定位路线统一为模糊定位，当前已被 2026-06-12 精确定位路线取代。

2026-05-29 验证补充：签到页接龙候选分页改动后，已通过 `node --check miniprogram/pages/checkin/checkin.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：赛事接口和比赛中心继续性能收敛。`/api/tournaments` 支持 `limit/offset/hasMore/nextOffset`，保留 `includeGameCount=true` 的赛事计数语义；`pages/games/game-list` 的赛事/赛季筛选首屏只请求 `/tournaments?includeGameCount=true&limit=30&offset=0`，历史赛事通过“加载更多赛事”追加并按 id 去重，比赛列表本身仍按 `/games?includeAggregate=false&limit=30&offset=...` 分页加载。

2026-05-29 验证补充：赛事接口分页和比赛中心赛事筛选分页改动后，已通过 `node --check server/routes/tournaments.js`、`node --check miniprogram/pages/games/game-list/game-list.js`、`node --check scripts/test-tournaments-audit-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:tournaments-audit`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序赛事详情球员链接继续性能收敛。`pages/tournaments/tournament-detail` 不再为了赛事内打击/投手排行榜拉 `/players?include=all&limit=200`；改为先按赛事内 batting/pitching 行已有 `playerId` 读取 `/players/:id`，再对未匹配姓名调用 `/players?include=all&keyword=<姓名>&limit=5&offset=0` 小候选查询。赛事详情仍通过 `/games?includeAggregate=true&tournamentId=<id>&includeSeasonFallback=true` 取该赛事比赛，老数据 season fallback、排行榜排序、公开身份和球员/比赛跳转不变。

2026-05-29 验证补充：赛事详情球员链接轻量查询改动后，已通过 `node --check miniprogram/pages/tournaments/tournament-detail/tournament-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序 GameChanger PDF / Excel 数据导入页继续性能收敛。`pages/games/game-import/game-import` 的赛事候选不再无上限读取 `/tournaments`；首屏请求 `/tournaments?limit=30&offset=0`，保留默认自动选中第一条真实赛事，历史赛事通过“加载更多赛事候选”追加并按 id 去重，多文件 PDF / Excel 队列解析和封面上传流程不变。

2026-05-29 验证补充：数据导入页赛事候选分页改动后，已通过 `node --check miniprogram/pages/games/game-import/game-import.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序比赛发起页的赛事候选也继续性能收敛。`pages/score/create/create` 的所属赛事 picker 不再无上限读取 `/tournaments`；首屏请求 `/tournaments?limit=30&offset=0`，历史赛事通过“加载更多赛事候选”追加并按 id 去重。选择第二页赛事后进入现场记录仍会把 `tournamentId/tournamentName` 写入 `orionGameDraft`，不影响接龙名单导入、拖拽棒次/守位和现场记分流程。

2026-05-29 验证补充：比赛发起页赛事候选分页改动后，已通过 `node --check miniprogram/pages/score/create/create.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序比赛修订页的赛事归属候选继续性能收敛。`pages/games/game-edit/game-edit` 不再无上限读取 `/tournaments`；首屏请求 `/tournaments?limit=30&offset=0`，当前比赛已关联赛事如果不在首屏，会单独读取 `/tournaments/:id` 补入候选并保持选中，历史赛事通过“加载更多赛事候选”追加并按 id 去重。保存修订仍写入选中赛事的 `tournamentId/season/seasonName`，封面上传、比分、打击、投手、MVP 和审计流程不变。

2026-05-29 验证补充：比赛修订页赛事候选分页改动后，已通过 `node --check miniprogram/pages/games/game-edit/game-edit.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序管理台“队内接龙管理”从纯批量删除入口补成维护入口。管理员可在已加载的分页接龙列表里按标题、分类、日期、地点搜索，并按全部/训练/比赛/杯赛联赛/活动筛选；每条接龙提供“详情”和“编辑”跳转，日常维护可直接进入接龙详情或发起/编辑页，批量删除仍保留确认口令和逐条审计。

2026-05-29 验证补充：接龙维护入口与筛选改动后，已通过 `node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序管理台“赛事设置”继续性能收敛。管理台不再无上限读取 `/tournaments`；有赛事管理、比赛修订或积分调整权限时首屏请求 `/tournaments?limit=30&offset=0`，历史赛事通过“加载更多赛事”追加并按 id 去重。若当前赛事表单、比赛批量移动目标或比赛筛选选择的赛事不在首屏，会单独读取 `/tournaments/:id` 补入候选，避免刷新后选择丢失；加载更多不会重置正在填写的赛事表单。

2026-05-29 验证补充：管理台赛事候选分页改动后，已通过 `node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序站内通知继续性能收敛。`GET /api/notifications` 支持 `limit/offset/hasMore/nextOffset/unreadCount`，默认按页读取并返回全量未读数；`pages/notifications/notifications` 首屏请求 `/notifications?limit=30&offset=0`，历史通知通过“加载更多通知”追加并按 id 去重，点击未读只本地更新该通知和未读数，不再整页重拉。新增 `test:notifications-route` 并纳入 `test:miniprogram-ci`。

2026-05-29 验证补充：站内通知分页改动后，已通过 `node --check server/routes/notifications.js`、`node --check miniprogram/pages/notifications/notifications.js`、`node --check scripts/test-notifications-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:notifications-route`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序站内通知指定球员发送继续性能收敛。管理员打开通知页时不再默认拉 `/players?include=all&limit=200`；只有目标切到“指定球员”才调用 `/players?include=all&limit=50&offset=0`，历史候选通过“加载更多球员”追加并按 id 去重。全队、正式球员、试训队员和管理员广播路径不读取球员池。

2026-05-29 验证补充：站内通知指定球员候选懒加载分页改动后，已通过 `node --check miniprogram/pages/notifications/notifications.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序积分页赛季筛选 fallback 继续性能收敛。正常路径仍优先读取轻量 `/games/seasons`；若旧后端缺该接口，`pages/points/points` 不再回退到无上限 `/games?includeAggregate=false`，而是按 `/games?includeAggregate=false&limit=100&offset=...` 分页收集年份，最多 20 页防止旧接口异常循环。新增 `testPointsSeasonFallbackFlow` 覆盖旧后端 fallback。

2026-05-29 验证补充：积分页赛季 fallback 分页改动后，已通过 `node --check miniprogram/pages/points/points.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序管理台账号管理继续性能收敛。`/api/admin/users` 支持 `limit/offset/hasMore/nextOffset`，不传 `limit` 时保持旧版全量返回兼容；`pages/admin/admin` 首屏只请求 50 个账号，历史账号通过“加载更多账号”追加并按 id 去重。现有账号搜索、身份/权限组/守位/绑定筛选和排序继续作用于已加载账号，权限调整、网页关联码、重置密码、直接绑定/解绑和账号删除仍沿用当前选中账号。

2026-05-29 验证补充：管理台账号分页改动后，已通过 `node --check server/routes/admin.js`、`node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-admin-users-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:admin-users-route`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序球员详情继续性能收敛。`pages/players/player-detail` 的相关比赛不再一次返回该球员全部历史比赛；首屏调用 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=0`，历史比赛通过“加载更多相关比赛”追加并按 id 去重。能力概览、相关比赛列表和球员精彩时刻 meta 都基于已加载比赛即时重算，页面显示“已加载最近 N 场/已加载 N 场相关比赛”，避免误以为首屏就是全部历史。

2026-05-29 验证补充：球员详情相关比赛分页改动后，已通过 `node --check miniprogram/pages/players/player-detail/player-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序比赛详情本场精彩时刻继续性能收敛。`pages/games/game-detail` 不再按 `gameId` 无上限读取 `/highlights`；首屏调用 `/highlights?gameId=<id>&limit=30&offset=0`，普通用户追加 `public=true`，管理员/有审核权限账号读取同一页全状态记录。页面通过“加载更多精彩时刻”追加历史图片并按 id 去重，`highlightImages` 只包含已加载图片，预览和 B站链接复制逻辑不变。

2026-05-29 验证补充：比赛详情精彩时刻分页改动后，已通过 `node --check miniprogram/pages/games/game-detail/game-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序比赛详情球员链接继续性能收敛。`pages/games/game-detail` 不再为了单场猎户打击/投手行、MVP 和事件日志拉 `/players?limit=200`；改为先按本场已有 `playerId` 单独读取 `/players/:id`，再对本场仍未匹配的猎户侧姓名调用 `/players?include=all&keyword=<姓名>&limit=5&offset=0` 小候选查询。对手打击/投手行仍不链接同名猎户球员；本场精彩时刻请求追加 `includePlayer=true`，优先使用接口返回的 `highlight.player` 输出公开身份 meta。

2026-05-29 验证补充：比赛详情本场球员链接轻量查询改动后，已通过 `node --check miniprogram/pages/games/game-detail/game-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序活动/接龙详情关联比赛继续性能收敛。`pages/events/event-detail` 不再按 `eventId` 无上限读取 `/games`；首屏调用 `/games?includeAggregate=false&eventId=<id>&limit=20&offset=0`，历史关联比赛通过“加载更多关联比赛”追加并按 id 去重。点击比赛详情、从接龙记分、报名/待定/管理员导入接龙名单等原有闭环不变。

2026-05-29 验证补充：活动详情关联比赛分页改动后，已通过 `node --check miniprogram/pages/events/event-detail/event-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序活动/接龙详情管理员增补名单继续性能收敛。`pages/events/event-detail` 不再为了管理员手动补人预取 `/players?include=all&limit=200`；首屏只读 `/players?include=all&limit=50&offset=0`，可按姓名/背号走后端 `keyword` 搜索，历史候选通过“加载更多球员”追加并按 id 去重。已建档球员继续关联 `playerId`，未建档成员仍只作为手动姓名，不进入比赛统计。

2026-05-29 验证补充：活动详情管理员增补名单分页搜索改动后，已通过 `node --check miniprogram/pages/events/event-detail/event-detail.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序名人堂页继续性能收敛。`/api/hall-of-fame` 支持 `limit/offset/hasMore/nextOffset`，不传 `limit` 时保持旧版全量兼容；`pages/hall-of-fame/hall-of-fame` 首屏调用 `/hall-of-fame?includePlayer=true&limit=30&offset=0`，历史入选记录通过“加载更多名人堂”追加并按 `playerId` 去重。公开身份、头像、入选理由和点回球员详情逻辑不变。

2026-05-29 验证补充：名人堂分页改动后，已通过 `node --check server/routes/hof.js`、`node --check miniprogram/pages/hall-of-fame/hall-of-fame.js`、`node --check scripts/test-hof-route.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:hof-route`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序绑定申请页继续性能收敛并中文化。`pages/bind/bind` 不再一次取 200 个正式球员；首屏调用 `/players?limit=50&offset=0`，搜索时用后端 `keyword` 参数，历史候选通过“加载更多球员”追加并按 `playerId` 去重。页面眉标统一为“🔗 球员绑定 / 📝 审核状态 / ✅ 已选球员”，不再显示英文 `Player Binding / Review Status / Selected Player`。

2026-05-29 验证补充：绑定申请候选分页改动后，已通过 `node --check miniprogram/pages/bind/bind.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序联系页继续性能收敛。`pages/contact/contact` 不再为了 3 个负责人头像读取 `/players?limit=200`；改为按负责人姓名分别调用 `/players?keyword=<姓名>&limit=5&offset=0`，只取小候选集后精确匹配公开头像/照片。主场、训练时间、邮箱、小红书、负责人微信、咨询内容复制、接龙和协议跳转不变。

2026-05-29 验证补充：联系页负责人头像轻量查询改动后，已通过 `node --check miniprogram/pages/contact/contact.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 补充：小程序精彩时刻页继续性能收敛。照片墙请求改为 `/highlights?includePlayer=true&limit=60&offset=...`，用接口返回的 `highlight.player` 生成公开身份、球员链接和 meta，不再要求先拿完整球员池才能点回球员；投稿关联球员 picker 从 `/players?include=all&limit=50&offset=0` 首屏加载，必要时点“加载更多球员候选”追加，`playerId` 直达投稿时若首屏未命中才单独补读 `/players/:id`。

2026-05-29 验证补充：精彩时刻页球员关联轻量查询改动后，已通过 `node --check miniprogram/pages/highlights/highlights.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-29 验证补充：赛事封面上传和接龙分页改动后，已通过 `node --check miniprogram/pages/admin/admin.js`、`node --check scripts/test-miniprogram-flows.js`、`node --check scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:miniprogram-ci` 和 `git diff --check`；未上传、未预览、未部署。

2026-05-28 补充：小程序“精彩时刻”已更名为“精彩时刻”。`pages/highlights/highlights` 和首页底部模块改为横向流动照片墙，仍只预览图片、不播放外链视频；每张时刻卡会根据 `/players` 和 `/games` 解析 `playerId/gameId`，显示公开身份 meta，并提供“看球员 / 看比赛”跳转。个人页、管理台、球员详情、比赛详情和导航标题同步改名；底层接口、权限名和 `highlights` 表保持不变，避免破坏现有数据。

2026-05-28 补充：小程序比赛发起页 `pages/score/create/create` 已重新排版为“基础信息 / 阵容来源 / 阵容工作台”三块。基础信息用紧凑响应式表单，名单区用可滚动选择列表和已选人数提示，阵容工作台保留拖动球员块调棒次、点选/拖到场地图改守位和位置 picker 兜底，减少 iPad/宽屏下的拥挤感。比赛详情新增“导出 PDF”按钮：小程序调用 `GET /api/games/:id/export-pdf` 获取 base64 PDF，写入 `wx.env.USER_DATA_PATH` 后用 `wx.openDocument` 打开；后端 `server/pdf-export.js` 使用 PDF 内置中文 CID 字体生成轻量比赛记录，覆盖比分、逐局、猎户/对手打击投手表和事件日志。

2026-05-28 补充：小程序接龙地点和签到定位规则已调整。发起/编辑接龙页的地点字段新增“地图选择”，调用 `wx.chooseLocation` 回填球场名称、地址和经纬度，后端 `events.metadata.location` 保留选点来源；手动输入地点仍可用，但会标记为 `manual`。【已被 2026-06-12 精确定位路线取代】当前签到调用 `wx.getLocation({ type: 'gcj02' })`；`app.json.requiredPrivateInfos` 只声明 `chooseLocation` + `getLocation`，不能同时声明 `getFuzzyLocation`。

2026-05-28 补充：小程序管理台“球员档案管理”补齐网页后台的注册球员池。`pages/admin/admin` 现在在新增/导入/合并前先展示所有正式和试训球员，支持按姓名、别名、背号、守位搜索，按全部/正式/试训筛选；每行可直接进入球员档案、切到该球员的积分与签到记录、查看精彩时刻、设为合并源，试训球员可行内确认后调用 `/players/:id/upgrade` 升级为正式球员，正式球员还可一键生成并复制备用绑定码。

2026-05-28 补充：小程序管理台“积分与签到”补齐网页后台批量补录出席。`pages/admin/admin` 在补录签到区新增可搜索的批量出席名单，管理员可按球员、背号、守位筛选并勾选多人，一次为训练或活动逐人调用 `/api/attendances`；未勾选时仍沿用上方当前球员做单人补录。这样每个球员仍走原有 `attendances:write` 权限、试训满次升级和 `attendance_create` 审计，不新增绕过审计的批量写入路径。

2026-05-28 补充：小程序管理台“手动积分调整”补齐网页后台的可选关联比赛。管理员可搜索对手、日期、赛事或场地，在调整积分时选择一场已入库比赛；提交 `/api/points-adjustments` 时会带 `gameId`，后端继续写入 `points_adjust` 审计，积分流水后续可点回相关比赛。未选择比赛时保持原有“未关联比赛”的手动调整语义。

2026-05-28 补充：小程序比赛比分关联链已从 metadata 补强为顶层 `eventId` / `games.event_id`，后端支持 `/games?eventId=...` 按来源接龙筛选；保存或修订猎户侧打击/投手行时，后端会按 `playerId`、姓名和 aliases 归一化并补写 `playerId`，PDF / Excel 导入或手动修订也不会只靠姓名关联。`test:games-linkage` 已覆盖来源接龙、赛事、球员/MVP 和删除审计，并纳入 `test:miniprogram-ci`。

2026-05-28 补充：积分流水关联链向网页 `player-points.html` 对齐。后端 `server/points.js` 计算比赛积分时优先按 `playerId` 匹配猎户侧打击/投手行，姓名和 aliases 仅作兜底；比赛类流水 `detail` 会带 `gameId/tournamentId/tournamentName`，训练/活动签到流水带 `eventId/eventTitle`，手动积分如关联比赛也保留 `gameId`。小程序 `pages/points/points` 和 `pages/players/player-detail/player-detail` 的最近积分流水现在可直接点进比赛详情或对应接龙详情。

2026-05-28 补充：小程序球员详情补齐网页 dashboard 的“本人/管理员精彩时刻”语义。`pages/players/player-detail` 会合并 `/highlights?status=published/approved`，按球员真实名、公开名和 aliases 匹配精彩时刻图片，展示图片网格、支持 `wx.previewImage` 预览，B站链接只复制；“投稿”进入 `pages/highlights/highlights?playerId=...` 并自动预选当前球员，避免重复手动选择。

2026-05-28 补充：小程序公开身份展示向网页 `DB.publicPlayerIdentityForViewer()` 对齐。新增 `miniprogram/utils/player-identity.js`，统一处理 `publicDisplayName/publicAvatar`、管理员/本人/已绑定正式球员清晰查看、非正式用户未设置公开资料时的磨砂姓名/头像 fallback；已接入首页积分/名人堂摘要、球员阵容、球员详情、积分榜、名人堂、比赛详情和赛事详情。小程序端使用全局 `.identity-frosted-name` / `.identity-frosted-avatar`，继续不在公开 UI 中新增真实身份说明墙。

2026-05-28 补充：小程序活动详情页已把接龙和比赛比分做成可操作闭环。`pages/events/event-detail` 会读取 `/games?eventId=...` 列出同一接龙产生的比赛比分，点击可进入比赛详情；有比赛记录权限者可从“从接龙记分”直接进入 `pages/score/create/create?eventId=...`。记分页收到 `eventId` 后会自动切到“从活动接龙导入”、预选该接龙、回填接龙日期并载入已绑定报名名单，保存后仍写同一场次的 `games.event_id`。

2026-05-28 补充：小程序管理台账号管理已增加“生成网页关联码”、重置网页密码、直接绑定/解绑球员档案和删除账号。有 `users:app_connect_code` 权限的 A 级账号可为小程序先注册的用户调用 `/admin/users/:id/app-connect-code`，生成 30 分钟有效的网页关联码并自动复制，用于后续网页端把同一账号/球员档案串起来；有 `users:password_reset` 权限者可调用 `/admin/users/:id/reset-password` 重置邮箱网页登录密码；有 `users:bind_direct` 权限者可在管理员线下确认身份后调用 `/admin/users/:id/bind-player` / `/admin/users/:id/unbind-player` 修正账号和正式球员档案的绑定关系；有 `destructive:delete` 权限者在输入“删除账号”确认后可调用 `DELETE /admin/users/:id` 删除账号，所有者账号和当前登录账号仍由后端拒绝。

2026-05-28 补充：小程序管理台账号管理补齐网页后台账号筛选。`pages/admin/admin` 的账号 picker 现在可按身份（全部/管理员/A/B/C/普通队员）、权限组（全部/数据组/运营组/数据+运营/无权限组）、绑定球员位置（全部/投手/捕手/内野手/外野手/未设位置）和绑定状态（全部绑定/已绑定球员/未绑定账号）过滤 `/admin/users` 返回数据；筛选只影响移动端选择列表，不改变后端权限判定，后续生成网页关联码、重置密码、直接绑定/解绑、删除账号和保存权限仍走原有接口。

2026-05-29 补充：小程序管理台账号管理继续对齐网页后台搜索和排序。账号 picker 前新增搜索框，可按昵称、邮箱、绑定球员、背号、位置、账号 ID 和权限组在已加载 `/admin/users` 结果内本地搜索；同时新增排序 picker，支持“最近活跃 ↓ / 最早注册 ↑ / 昵称 A-Z”。该能力不新增后端请求，只影响移动端候选列表，已纳入 `test:miniprogram-flows` 和 `test:miniprogram-preflight`。

2026-05-28 补充：小程序管理台绑定审批补齐网页后台历史筛选。`pages/admin/admin` 默认仍显示“待审核”，但可切换到“全部申请 / 已通过 / 已驳回”，复用 `/admin/bind-requests?status=`；历史记录显示状态标签和审批备注，只有待审核申请保留批准/驳回按钮。管理台统计里的“待审绑定”继续单独读取 pending 数量，不会因为切到全部或历史筛选而把已处理申请算进待办。

2026-05-28 补充：修复开发者工具编译时报 `WXML file not found: ./pages/tournaments/tournament-detail/tournament-detail.wxml`。文件本身存在且本地页面完整性检查通过，问题来自微信开发者工具 Stable v2.01.2510290 / 基础库 3.16.1 在 `lazyCodeLoading: "requiredComponents"` 下没有正确索引新增深层页面；已从 `miniprogram/app.json` 移除 `lazyCodeLoading`，重新编译后首页正常渲染，控制台显示 `LazyCodeLoading: false`，WXML 缺失错误消失。`verify-miniprogram-ci` 和 `verify-miniprogram-preflight` 已加入保护，暂不允许重新启用 `requiredComponents`。

2026-05-28 补充：小程序管理台补齐网页后台“绑定码中心”。有 `bind_codes:manage` 权限者可在移动端读取 `/bind-codes` 查看并搜索已有绑定码，按正式球员调用 `POST /api/bind-codes` 生成备用绑定码，生成后自动复制；也可复制已有绑定码或调用 `DELETE /api/bind-codes/:code` 作废。站内信“发送绑定邀请”继续用于已注册账号，绑定码中心保留为管理员主动邀请/备用路径。

2026-05-28 补充：小程序管理台补齐网页后台“星阵全站发布”。有 `system:settings` 权限的 A 级账号可在 `pages/admin/admin` 读取 `/site-settings/players-starfield`，选择网页同名预设（OR 灯阵、星河散列、螺旋升空、环形巡航、斜翼队列、年份 2026），调整队形、路径、年份节点、速度、呼吸、摆动、间距和随机种子，并通过 `PUT /api/site-settings/players-starfield` 发布到全站；后端继续写 `site_setting_publish` 审计。小程序不复制网页粒子编队台，只提供移动端可靠发布入口。

2026-05-28 补充：GameChanger 文本型 PDF 和 Excel 工作簿已抽到后端 `server/gamechanger-import.js`，新增 `POST /api/games/import-gamechanger`，小程序 `pages/games/game-import/game-import` 通过 `wx.chooseMessageFile` 选择聊天 PDF / Excel（XLS / XLSX）、base64 传给云托管解析、按赛事回填 `tournamentId/season/seasonName/sport`，预览比分、局数、本队打击/投手和 warnings；现已支持一次选择多份文件形成队列，PDF 逐份解析，Excel 可从同一工作簿展开为多场比赛 draft，再逐场确认入库，队列未完成时留在导入页继续下一份/下一场，最后一场入库后再进入比赛详情。确认入库仍调用现有 `POST /api/games`，所以比赛、赛事、球员、比分、事件日志和后续修订继续共用同一张 `games` 表。PDF 路径依赖云托管镜像内可用 `pdftotext` / poppler；正式部署前需要确认镜像包含该命令或设置 `PDFTOTEXT`。Excel 路径依赖 `xlsx@0.18.5`。

2026-05-28 补充：小程序数据导入页已补“可选比赛封面图”。每个 PDF / Excel 队列项可单独通过 `wx.chooseMedia` 选图并调用 `/api/upload/base64` 上传到 COS（`kind = game`），返回 URL 会随当前 draft/payload 写入 `games.cover`；切换多文件队列或 Excel 展开的多场 draft 会恢复对应封面状态，未上传封面的比赛仍可正常解析和入库。

2026-05-28 补充：`games.cover` 在小程序比赛中心、比赛详情和比赛修订页已闭环。比赛列表卡片会显示封面缩略图，没有封面时回退中文运动标签；比赛详情顶部显示封面 hero；有 `games:revise` 权限者可在 `pages/games/game-edit/game-edit` 手动粘贴 COS 图片地址或重新选择图片上传 COS，保存后写回同一场比赛。

2026-05-28 补充：小程序补齐网页后台的单场比赛删除能力。`DELETE /api/games/:id` 现在会先读取原比赛并写 `delete_game` 审计；小程序比赛修订页对有 `destructive:delete` 权限者显示“危险操作”，必须输入“删除比赛”并二次确认后才调用删除。删除会移除比赛库中的比分、打击、投手和事件日志；如果只是数据错误，仍应优先走修订。

2026-05-28 补充：小程序管理台赛事设置补齐网页后台“批量删除比赛”。有 `games:revise` 且有 `destructive:delete` 权限者可在批量移动比赛列表中勾选多场比赛，输入“删除比赛”并二次确认后逐场调用 `DELETE /api/games/:id`；后端继续逐场写 `delete_game` 审计。该操作只作为高危清理入口，比分或球员数据错误仍优先进入比赛修订页。

2026-05-28 补充：赛事容器管理补齐后台审计。`POST /api/tournaments`、`PATCH /api/tournaments/:id` 和 `DELETE /api/tournaments/:id` 现在分别写 `tournament_create`、`tournament_update`、`tournament_delete` 审计，metadata 保留 after / before / changedKeys；小程序审计页可按“赛事”对象和对应动作筛选，管理台最近审计也用中文显示赛事动作。新增 `test:tournaments-audit` 并纳入 `test:miniprogram-ci`。

2026-05-28 补充：小程序管理台新增“合并球员档案”移动端入口，复用后端 `POST /api/players/merge` 和 `players:write` 权限。管理员可选择要并入的源球员和保留的目标档案，并决定是否把源姓名/别名加入目标别名；合并会迁移账号绑定、签到、积分调整、绑定码、名人堂和精彩时刻等关联数据，删除源档案，但不改写历史比赛 JSON 姓名，旧比赛仍通过目标 `aliases` 归并统计。

2026-05-28 补充：小程序管理台“球员档案管理”新增创建球员入口，复用后端 `POST /api/players` 和 `players:write` 权限。管理员可在移动端创建试训或正式球员，填写姓名、背号、守位、左右打投、入队年份、口号、荣誉标签和别名；创建后自动进入球员详情继续维护公开展示与历史比赛归并信息。

2026-05-28 补充：小程序管理台补齐网页后台的球员批量导入能力。新增后端 `POST /api/players/import`，管理员可在“球员档案管理”粘贴每行一个球员的名单（`姓名,球衣号,守位`，可选打席、投球、入队年份、别名），选择导入为试训或正式球员；接口会跳过已有姓名/别名和本次重复项，最多一次 100 人，并写 `player_batch_import` 审计。新增 `test:players-import`，并纳入 `test:miniprogram-ci`。

2026-05-28 补充：小程序球员详情管理区补齐网页后台“删除球员”高危入口。只有同时具备 `players:write` 和 `destructive:delete` 的账号会看到危险操作区，必须输入“删除球员”并二次确认后才调用 `DELETE /api/players/:id`；后端继续写 `player_delete` 审计。重复档案仍优先走“合并球员档案”，删除仅用于误建或高危清理。

2026-05-28 补充：小程序管理台最近审计和 `pages/admin/audit/audit` 已把 `player_delete` 纳入中文动作映射和动作筛选，球员删除日志显示为“删除球员”，并可按“球员”对象过滤查看。

2026-05-28 补充：活动接龙详情修复普通队员报名入口被管理员权限误包裹的问题，`我要报名 / 先待定 / 取消报名 / 转发到群` 现在随活动详情显示；管理员区新增手动增补和名单状态修正，复用新增后端 `POST /api/event-signups/admin-upsert` 与 `PATCH /api/event-signups/:id`，可按已建档球员或手动姓名加入名单，并把现有名单改为报名、待定或移出。手动增补的已建档球员候选按 50 条分页搜索加载；未建档手动姓名只保留为接龙名单，不进入比赛统计。

2026-05-28 补充：小程序活动接龙补齐网页活动管理的移动端维护能力。`pages/events/event-create/event-create` 现在同时支持新建和编辑：带 `id` 打开时读取 `/events/:id`，可修订标题、中文 emoji 分类、时间、地点、正文、原帖链接、封面图和最多 9 张接龙配图；封面图和配图可通过 `wx.chooseMedia` + `/api/upload/base64` 上传到 COS（`kind = event`），封面也可手动粘贴 COS URL。活动列表优先显示 `events.cover`，没有封面时用第一张 `events.images` 兜底；详情展示封面 hero 和配图九宫格，配图可点开预览，并可复制原帖链接；活动详情管理员区提供“编辑接龙”和单条“删除接龙”，删除前必须输入“删除接龙”并二次确认，报名名单会随接龙删除，已产生的签到/积分流水不会被批量改写。

2026-05-28 补充：小程序管理台补齐网页后台“批量删除活动/接龙”。有 `events:write` 权限的管理员可在 `pages/admin/admin` 勾选近期接龙，输入“删除接龙”并二次确认后逐条调用 `DELETE /api/events/:id`；后端继续逐条写 `event_delete` 审计并保留删除时的报名人数。该入口用于清理误发/测试接龙，日常修订仍优先进入接龙详情编辑。

2026-05-28 补充：`/api/events` 管理操作补齐后台审计。创建、更新和删除接龙分别写 `event_create`、`event_update`、`event_delete` 到 `admin_audit_logs`，metadata 保留 before/after、changedKeys 和删除时的报名人数；小程序管理台和审计详情页已能用中文显示这些动作，并可按“接龙”对象筛选。

2026-05-28 补充：小程序性能优化先收掉两个高频重复请求点。`/api/events` 列表现在通过聚合子查询一次返回 `signupCount / tentativeSignupCount / activeSignupCount`，`pages/events/event-list` 优先使用该字段，只有连接旧后端且字段缺失时才逐条回退请求 `/event-signups`，避免活动列表 N+1；`/api/highlights` 支持 `public=true` 和 `limit`，首页、精彩时刻、球员详情、比赛详情用一次请求取得 `published/approved` 图片，并继续在小程序端过滤待审/下架状态，避免旧后端误回包时展示非公开图片。

2026-05-28 补充：小程序比赛数据读取继续做性能优化。`/api/games` 现在支持 `limit` 和 `playerId`：首页读取最近比赛改成 `/games?includeAggregate=false&limit=12`，避免首屏拉全量比赛；球员详情读取 `/games?includeAggregate=true&playerId=<playerId>`，后端按球员 id、真实名、公开名、aliases、MVP 和事件日志过滤后再返回，保留能力概览/相关比赛/精彩时刻关联语义，同时减少小程序端传输和本地筛选量。

2026-05-29 补充：积分页赛季筛选也改成轻量读取。新增 `GET /api/games/seasons` 只返回非汇总比赛的年份列表，`pages/points/points` 优先用该接口生成赛季 picker；如果连接旧后端没有该接口，才回退到 `/games?includeAggregate=false` 全量读取。这样保留网页 `ranking/player-points` 的赛季筛选语义，同时避免积分页为一个下拉框拉完整比赛 JSON。

2026-05-29 补充：小程序性能优化继续收敛高频页面的全量读取。`/api/highlights` 新增 `includeTotal=true`，小程序管理台“待审时刻”只请求 `status=pending&limit=1&includeTotal=true` 获取总数，不再下载整面精彩时刻照片墙；管理台比赛候选改为 `/games?includeAggregate=false&limit=80&offset=0` 首屏分页，批量移动/删除和手动积分关联共用已加载比赛池，并提供“加载更多比赛/比赛候选”；`/api/events` 新增 `limit/offset/hasMore/nextOffset`，首页只取最近 1 条接龙，活动接龙列表按 30 条分页加载，签到页保持全量接龙读取以保证从旧接龙详情进入时能选中指定接龙。该轮只做本地代码和 CI，未上传、未预览、未部署。

2026-05-29 补充：小程序个人页补齐网页 dashboard 的轻量头像维护。`pages/profile/profile` 的账号资料和正式球员公开展示区现在都支持 `wx.chooseMedia` 选择图片、`readFile(base64)` 后调用 `/api/upload/base64` 上传到 COS，回填账号头像或公开头像 URL；手动粘贴图片地址和清空头像仍保留。`test:miniprogram-flows` 覆盖账号头像和公开头像上传 payload，`test:miniprogram-preflight` 增加页面入口保护。

2026-05-28 补充：小程序积分页已把 `/leaderboard` 返回的 `rules` 转成中文规则卡，按“出场积分 / 比赛表现 / 投手防守 / 荣誉”展示正负分值；页面不另写积分公式，权威仍以后端 `server/points.js` 和 `/points/rules` 语义为准。

2026-05-28 补充：小程序球员详情页的管理员编辑区新增公开展示资料维护。有 `players:display_write` 或 `players:write` 权限者可编辑公开展示名、公开头像 URL，并可直接选择图片调用 `/api/upload/base64` 上传到 COS 后写入 `/players/:id/public-profile`；保存基础档案仍走 `/players/:id`，公开展示资料走专用 public-profile 接口，保持真实档案和公开展示分离。

2026-05-28 补充：新增安全的小程序 CI 体检命令 `npm run test:miniprogram-ci`。该命令会检查微信开发者工具 CLI、`miniprogram-ci` devDependency、`project.config.json`、25 个页面文件、`chooseLocation/getFuzzyLocation` 隐私声明、跨资源云托管配置，并串联 `test:miniprogram-preflight/request/events-audit/games-linkage/players-import/flows/score`；它不会调用 preview/upload。当前 `miniprogram-ci@2.1.31` 仅作为开发依赖使用，官方依赖树较旧，`npm audit` 会报 dev 依赖漏洞，暂不做 `audit fix --force` 以免大范围破坏锁文件。

2026-05-28 补充：小程序球员详情页的能力概览向网页 `dashboard.html` 对齐。现在读取 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=...`，按球员 `playerId/name/aliases` 汇总 AVG/OBP/SLG/OPS、安打/得分/打点/HR、ISO/BB%/K%/BBK、基于已加载相关比赛打击行的参考百分位轴和近场逐场 AVG/累计 AVG 趋势；统计采用“逐场优先、赛季汇总兜底”，同一赛季/赛事已经有逐场记录时不再叠加 aggregate 汇总，避免重复计数。相关比赛继续可点进比赛详情，赛季汇总会标注“赛季汇总”。

---

## 0. 先读这几条

- 当前线上版本：`express-knlw-055`，2026-06-13 部署并验证（Apple 风格按钮与 UI 居中优化 + 小程序 `1.0.11` 同步全量部署 + DB OK）。
- 当前小程序开发版本：`1.0.11`，robot `1`，已上传到微信后台；尚未提交审核或发布正式版。
- 后续小程序预览、上传新开发版本、提交审核或发布正式版，都应先有用户明确授权；本地 CI 可直接跑。
- 小程序云调用：`wx8ad6ccfa1b8f040a` 已关联 `prod-d5gtkxdyu7263e95b` 资源复用环境，模拟器已能读取首页积分榜和最近比赛。后续仍需在用户确认后再做预览上传/真机/正式上传。
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
| `express-knlw-055` | 2026-06-13 21:16 | 与小程序 `1.0.11` 同步全量部署：小程序全局按钮 Apple 式圆角/flex 居中/hover-disabled 状态，赛事活动 action tile 与 segmented control，管理台 tabs/分段/快捷入口/小操作按钮统一圆角，现场记分、比赛中心、接龙详情、发起接龙、个人页退出登录等按钮居中收口 | 部署前 `node --check scripts/verify-miniprogram-preflight.js`、服务端 JS `node --check`、本地 `PORT=18080 NODE_ENV=production npm start` + `/api/health`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci`、`git diff --check` 通过；第一次 `wxcloud run:deploy` 创建 `express-knlw-054` 但构建失败，重试创建并发布 `express-knlw-055`，CLI 末尾仍有历史已知 `ResourceNotFound.TopicNotExist` 轮询噪声但最终输出“部署完成”；`deploy:verify --expected-version express-knlw-055 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK |
| `express-knlw-054` | 2026-06-13 21:09 | 同轮第一次 Apple 风格按钮与 UI 居中优化云托管部署尝试 | 版本状态 `build_failed`，未切流；随后重试发布 `express-knlw-055` 成功 |
| 小程序 `1.0.11` | 2026-06-13 21:07 | Apple 风格按钮与 UI 居中优化：全局 `.btn` 重建为 flex 居中和统一圆角，赛事活动、管理台、现场记分台、比赛中心、接龙详情、发起接龙、个人页等核心按钮统一圆角/居中/稳定高度 | 上传前完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、相关 `node --check`、`git diff --check` 通过；使用 `NODE_OPTIONS='--no-experimental-webstorage' node` 运行 `miniprogram-ci upload` 规避 Node 25 WebStorage 兼容问题，上传开发版本 `1.0.11`，robot `1`，备注“2026-06-13 Apple风格按钮与UI居中优化”；随后云托管已补发全量版本 `express-knlw-055` 并通过 `deploy:verify` |
| `express-knlw-053` | 2026-06-13 20:06 | 与小程序 `1.0.10` 同步全量部署：赛事活动统一工作台、赛事管理页、赛事创建/编辑/归属整理、日期/时间 picker、管理台待办摘要与球员档案分段、移除小红书识别并保留群接龙识别 | 部署前完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:tournaments-audit`、相关 `node --check`、`git diff --check` 通过；`wxcloud run:deploy . -e prod-d5gtkxdyu7263e95b -s express-knlw --targetDir . --dockerfile Dockerfile --containerPort 80 --releaseType FULL --noConfirm --remark "2026-06-13 赛事活动赛事管理和管理台优化"` 创建并发布 `express-knlw-053`，CLI 末尾有历史已知 `ResourceNotFound.TopicNotExist` 轮询噪声但输出“部署完成”；`deploy:verify --expected-version express-knlw-053 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK |
| 小程序 `1.0.10` | 2026-06-13 20:02 | 赛事活动/赛事管理/时间选择/管理台优化：统一赛事活动工作台、新增赛事管理页、所有确定日期或时刻改 picker、管理台待办摘要与球员档案分段、移除小红书识别并保留群接龙识别 | 上传前完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、`npm run test:tournaments-audit`、相关 `node --check`、`git diff --check` 通过；使用 Codex 捆绑 Node 运行 `miniprogram-ci upload` 上传开发版本 `1.0.10`，robot `1`，备注“2026-06-13 赛事活动/赛事管理/时间选择/管理台优化”；随后云托管已补发全量版本 `express-knlw-053` 并通过 `deploy:verify` |
| `express-knlw-052` | 2026-06-13 19:18 | 与小程序 `1.0.9` 同步全量部署：赛事活动工作台、比赛工作台、比赛发起三步流、现场记分台模式切换、慢投垒 `1-1` 初始球数和两好界外三振规则、比赛详情规则/球数/垒位回看、`.tab-page` 底部避让 `220rpx` | 部署前完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-score`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、相关 `node --check`、`git diff --check` 通过；`wxcloud run:deploy ... --remark "2026-06-13 功能UI和慢投垒记分优化"` 创建并发布 `express-knlw-052`，CLI 末尾有历史已知 `ResourceNotFound.TopicNotExist` 轮询噪声但输出“部署完成”；`deploy:verify --expected-version express-knlw-052 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；直接 `curl /api/health` 返回 200、`server: ok`、DB OK |
| 小程序 `1.0.9` | 2026-06-13 19:13 | 功能 UI 与慢投垒记分优化：赛事活动/比赛工作台、三步发起比赛、现场记分台、慢投垒 `1-1` 与界外球规则、比赛详情回看新增规则和球数信息 | 上传前完整 `npm run test:miniprogram-ci`、`npm run test:miniprogram-score`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、相关 `node --check`、`git diff --check` 通过；使用 Codex 捆绑 Node 运行 `miniprogram-ci upload` 上传开发版本 `1.0.9`，robot `1`，备注“2026-06-13 功能UI与慢投垒记分优化”；随后云托管已补发全量版本 `express-knlw-052` 并通过 `deploy:verify` |
| 小程序 `1.0.8` | 2026-06-13 18:22 | 底部左侧 tab 改为“赛事活动”；赛事活动页新增“开始记录比赛”显眼入口并保留比赛中心/发起接龙/刷新；tab 页统一安全滚动容器避免底部 tabBar 遮挡内容；个人页退出登录改为全宽危险操作按钮 | 上传前完整 `npm run test:miniprogram-ci`、相关 `node --check`、`git diff --check` 通过；使用 Codex 捆绑 Node 运行 `miniprogram-ci upload` 上传开发版本 `1.0.8`，robot `1`，备注“2026-06-13 赛事活动入口、开始记录比赛、底部避让、退出登录按钮”；随后云托管已补发全量版本 `express-knlw-051` 并通过 `deploy:verify` |
| `express-knlw-050` | 2026-06-13 | 小程序管理台精简为模块 tabs；比赛记录主入口回到比赛中心并改名“开始记录比赛”；活动中心列表只保留发起接龙/刷新；绑定统一走申请审批，不再展示绑定码、网页关联码、直接绑定/解绑、删除账号等旧入口；`POST /api/games` 允许 `games:confirm` 或 `events:write` 写入；底部 tabBar 避让改为纯 `240rpx` | 部署前完整 `npm run test:miniprogram-ci`、相关 `node --check`、`git diff --check` 通过；`wxcloud run:deploy ... --remark "2026-06-13 管理台精简和比赛中心记录入口"` 创建并发布 `express-knlw-050`，CLI 末尾有历史已知 `ResourceNotFound.TopicNotExist` 轮询噪声但输出“部署完成”；`deploy:verify --expected-version express-knlw-050 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；小程序开发版本 `1.0.7` 已上传，robot `1`，备注“2026-06-13 管理台精简/比赛中心开始记录比赛/绑定申请制” |
| `express-knlw-049` | 2026-06-12 16:30 | 绑定申请显示口径修复：后端绑定申请列表返回 `hasWxIdentity`；网页后台和小程序管理台显示“微信登录已关联”；`contactTail/contact_tail` 改为“核验信息”，不再误标为真实微信号；小程序绑定页说明微信登录身份自动关联、备注仅选填；小程序发起接龙入口和创建页按 `events:write` 权限门控 | 部署前完整 `npm run test:miniprogram-ci` 与 `git diff --check` 通过；`wxcloud run:deploy` 需显式 `--targetDir . --dockerfile Dockerfile --containerPort 80` 避免非 TTY 交互；本次 CLI 轮询阶段遇到本机 DNS `servicewechat.com` 解析失败退出，但版本任务已创建，随后 `deploy:verify --expected-version express-knlw-049 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；线上 `admin.html` 含“微信登录已关联”和“核验信息”；小程序开发版本 `1.0.2` 已上传，robot `1`，备注“2026-06-12 绑定申请显示微信登录身份，限制发起接龙权限” |
| `express-knlw-042` | 2026-06-12 01:03 | 账号互通反向关联：新增 `POST /api/auth/link-wechat`（关联码把微信身份挂到已有网页账号，先验码再消费 wx code，微信已属他人 409）；dashboard 个人面板显眼“📱 小程序关联码”入口与专属弹窗（本人面板姓名行 + 未绑定操作行两处）；`DB.createAppConnectCode()` 自助生成；注册弹窗 link-email 文案更新；全站 HTML 升级 `db.js?v=27` / `auth.js?v=23`。同包含 2026-06-11/12 本地轮的后端改动：`/bind-codes`、`/points-adjustments`、`/attendances` 分页参数、`/admin/bind-invitation-options` 分页、`GET /api/team-info` | 部署前 `node --check`、新增 `npm run test:auth-link-wechat`、完整 `npm run test:miniprogram-ci`、`git diff --check` 通过；本地预览实测 admin 登录 → dashboard 两处入口打开弹窗生成关联码（30 分钟、自动复制）、`/auth/link-wechat` 无效码 404 / 缺同意 400、控制台无 error/warn；`deploy:verify --expected-version express-knlw-042 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；线上 `dashboard.html` 含 `miniConnectModal` 并引用 `db.js?v=27` / `auth.js?v=23`，线上 `db.js?v=27` 含 `createAppConnectCode`，线上 `/api/auth/link-wechat` 无效码返回 404，自定义域 `xn--4gsr8nf4ck7ihxnemb.cn` 同步到新版 |
| `express-knlw-041` | 2026-06-10 13:08 | 修复手机端“不安全”HTTP 入口登录后仍游客态：自定义域 HTTP 访问 308 到 HTTPS；前端自定义域 `http:` 兜底跳 HTTPS；登录/注册/邮箱关联返回 `sessionToken`；前端保存 `orion_web_session` 并用 `X-Orion-Session` 作为 cookie 保存失败时的登录态兜底；全站 HTML 升级 `db.js?v=26` / `auth.js?v=22` | 部署前 `node --check server.js server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js`、`git diff --check -- server.js server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js *.html`、本地 Host/x-forwarded-proto 308 模拟、`X-Orion-Session` 解析测试、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight` 和完整 `npm run test:miniprogram-ci` 均通过；`deploy:verify --expected-version express-knlw-041 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；线上 `http://xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html` 与 `http://www.xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html?x=1` 均 308 到 HTTPS；线上 HTTPS 裸域和 `www` 的 `dashboard.html` 均引用 `db.js?v=26` / `auth.js?v=22`，对应 JS 资产包含 HTTPS 跳转和 `X-Orion-Session` 兜底逻辑 |
| `express-knlw-040` | 2026-06-09 19:52 | 联系页、首页联系人区和小程序联系页更新：新增王斌（#110，外野，邮箱 `478753480@qq.com`，小红书 `609655049`）；曹山和王斌为联络人，洁哥为球队经理；保留李斯然、黄强原联系方式；联系提示指向曹山或王斌 | 部署前 `node --check miniprogram/pages/contact/contact.js scripts/test-miniprogram-flows.js scripts/verify-miniprogram-preflight.js`、`git diff --check -- contact.html index.html assets/css/style.css miniprogram/pages/contact/contact.js scripts/test-miniprogram-flows.js scripts/verify-miniprogram-preflight.js`、`npm run test:miniprogram-flows`、`npm run test:miniprogram-preflight`、完整 `npm run test:miniprogram-ci` 均通过；390px 本地浏览器验证联系页 5 张联系人卡、首页 7 张联系人卡均包含王斌/李斯然/黄强/洁哥且无 console error；`deploy:verify --expected-version express-knlw-040 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；线上 `www.猎户座棒垒球.cn/contact.html` 和 `/index.html` 源码检查通过 |
| `express-knlw-039` | 2026-06-09 12:25 | 修复手机端 `www.猎户座棒垒球.cn` 登录后重复登录：全站 HTML 升级 `db.js?v=25` / `auth.js?v=21` 强制刷新移动端旧脚本；自定义域登录 Cookie 统一写 `Domain=xn--4gsr8nf4ck7ihxnemb.cn`；登录时清旧 host-only Cookie；读取同名 Cookie 时跳过失效 token；默认云托管域保持 host-only Cookie；logout 同时清 host-only 和裸域 Cookie | 部署前 `node --check server/auth-helpers.js server/routes/auth.js assets/js/db.js assets/js/auth.js`、`git diff --check -- server/auth-helpers.js server/routes/auth.js *.html`、`npm run test:miniprogram-flows` 通过；本地模拟 `www` 登录后裸域 `/api/auth/me` 返回 `u_admin`，重复 Cookie 中坏 token 不挡有效 token；390px 浏览器验证 `players.html` 与 `admin.html` 显示“管理员 / 退出”、游客入口和球员页游客提示隐藏、无 console error/warn；`deploy:verify --expected-version express-knlw-039 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过，服务和最新版本均 `normal`，线上 `/api/health` 200 且 DB OK；线上 `www` 页面加载 `db.js?v=25` / `auth.js?v=21`；线上 `www` 登录响应写裸域 Cookie，同一 cookie jar 请求 `www` 与裸域 `/api/auth/me` 均返回管理员；默认云托管域登录仍为 host-only Cookie；自定义域 logout 后 `/api/auth/me` 返回 `{ user: null }` |
| `express-knlw-038` | 2026-06-09 09:59 | 修复登录态挂载竞态：全部 `/api` 响应禁缓存，前端 API 请求显式 `cache: 'no-store'`，`DB.reload()` 更新全局 `dbReady` Promise，`requireAuth()` 在跳转前强制刷新登录态 | 部署前 `node --check`、`git diff --check`、`npm run test:miniprogram-flows` 通过；本地验证 `/api/auth/me` 和登录响应均带 no-store，登录后同 cookie 返回管理员；脚本验证 `DB.reload()` 后 `currentUser` 挂载为“管理员”；390px 浏览器验证 `players.html` 与 `admin.html` 显示“管理员 / 退出”、管理员入口可见、游客提示隐藏、无 console error/warn；`deploy:verify --expected-version express-knlw-038 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过；线上 `/api/health` 200 且 DB OK；线上 `/api/auth/me`、`/api/auth/login` 均透传 no-store，登录后同 cookie 请求 `/api/auth/me` 返回管理员；线上 `db.js` / `auth.js` 已包含登录态刷新修复 |
| `express-knlw-037` | 2026-06-09 09:25 | 修复网页手机端登录后缺少已登录提示；球员页登录后隐藏游客小字；新增“棒球场钻石”星阵；靳江山/江山与虞婧在各星阵下保持近邻不重叠；小程序管理台同步支持发布钻石星阵 | 部署前 `node --check`、`git diff --check`、`npm run test:miniprogram-flows` 通过；本地 390px 浏览器验证登录态 nav、游客提示隐藏、钻石预设和两人近邻关系无 console error/warn；`deploy:verify --expected-version express-knlw-037 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过；线上 `/api/health` 200 且 DB OK；服务和最新版本均为 `normal` |
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

小程序已上传内容摘要（当前开发版 `1.0.11`；尚未提交审核或发布正式版）：

- `miniprogram/` 微信小程序工程、`project.config.json`、小程序调用配置与页面源码；赛事活动工作台、赛事管理页、时间 picker、管理台分段、中文友好比赛记录页和 Apple 式圆角/居中按钮体系已随当前开发版 `1.0.11` 上传微信后台，比赛记录保存到现有 `/api/games` JSON 字段。
- `design/miniprogram-game-flow-mockup.svg` 小程序比赛流程预览稿，覆盖比赛发起、阵容排布、现场记录、赛后确认四屏。
- 小程序首页快捷入口已收敛为五个主流程：`队内接龙`、`接龙签到`、`球员阵容`、`比赛中心`、`开始记分`。`发起接龙` 留在活动接龙页，`发起/新建比赛记录` 留在开始记分页，避免首页出现“活动报名/创建接龙”“比赛记录/发起比赛”的重复感；`球员阵容` 为全宽入口，避免奇数卡片在 iPad/窄屏挤压。首页 section 右侧的 `全部 / 详情` 按文字链接固定右对齐，不使用小程序默认按钮宽度；首页 `积分榜 Top 3` 行可直接点进对应球员详情，不能只展示不可点的人名；活动列表头部按钮采用上下结构的等宽按钮，避免窄屏溢出；发起活动页的分类标签改为预设 picker，不让管理员手动输入。
- 小程序可见分类/项目标签统一走 `miniprogram/utils/labels.js` 映射，展示为中文+emoji，例如 `🥎 慢垒`、`⚾ 棒球`、`🏋️ 训练`、`📅 活动`；不要在 UI 中直接露出 `softball`、`baseball`、`Training`、`Event` 等原始枚举值。后端/存储枚举仍保持原值用于兼容。
- 小程序球员阵容页：`pages/players/player-list` 读取 `/players` + `/leaderboard`，展示正式球员、背号、守位、加入年份、口号、荣誉标签、积分排名，并优先使用 `publicDisplayName/publicAvatar`，保持和网页公开展示语义一致；点球员卡进入 `pages/players/player-detail`，详情页读取 `/players/:id`、`/players/:id/points` 和 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=...`，把档案、积分拆分、能力概览（AVG/OBP/SLG/OPS、ISO/BB%/K%、比赛行参考百分位轴和近场趋势）、最近积分流水、相关比赛打击/投手摘要串起来。能力统计采用逐场记录优先，只有没有同组逐场记录时才纳入赛季汇总行，避免 aggregate 与逐场数据重复计数；能力概览不再额外读取完整球员池，而是从当前已加载相关比赛打击行生成参考池，加载更多相关比赛后同步重算。管理员在详情页可调用 `PATCH /players/:id` 编辑基础档案、荣誉标签和别名，调用 `/players/:id/public-profile` 编辑公开展示名/公开头像，或调用 `/players/:id/upgrade` 将无重名冲突的试训球员升级为正式球员；公开头像可在小程序内选择图片上传 COS，别名用于历史比赛统计归并，不改写原始比赛 JSON。
- 小程序个人页：`pages/profile/profile` 可维护账号昵称/头像，调用 `/auth/me`；已绑定正式球员可维护球员页公开展示名称/公开头像，调用 `/players/:id/public-profile`。试训队员公开展示跟随账号资料，正式球员公开展示资料与真实档案姓名/照片分离，保持网页 dashboard 的双身份语义。
- 小程序名人堂页：`pages/hall-of-fame/hall-of-fame` 读取 `/hall-of-fame?includePlayer=true&limit=30&offset=...`，展示入选年份、公开展示名/头像、背号/守位和入选理由；历史记录通过“加载更多名人堂”分页追加，点击入选球员进入 `players/player-detail`。首页只增加下方荣誉区，不把“名人堂”塞进首屏五个主流程快捷卡片。
- 小程序精彩时刻页：`pages/highlights/highlights` 照片墙读取 `/highlights?includePlayer=true&limit=60&offset=...`，投稿候选按 `/players?include=all&limit=50&offset=...` 和 `/games?includeAggregate=false&limit=50&offset=...` 分页读取；非管理员只看 `published/approved` 的图片卡，管理员/有 `highlights:write` 权限者可看全部图片并发布待审图片、退回、下架已发布图片、重新发布已下架图片或删除记录；删除只删 `highlights` 记录，不自动删除 COS 原图。投稿优先用“选择图片并上传 COS”，小程序通过 `wx.chooseMedia` + `/api/upload/base64` 把图片写入同一套 COS 并把返回 URL 填入 `cover`；仍保留手动粘贴已上传图片地址作为兜底。B站链接 `url` 可选但只提供复制链接，不做小程序内视频播放或不可靠外链跳转；首页、个人页和管理台入口均显示“精彩时刻”。首页和列表页使用横向流动照片墙，卡片可点图预览，也可通过“看球员 / 看比赛”跳到关联正式球员或比赛详情。
- 小程序比赛中心：`pages/games/game-list` 同源读取 `/games` + `/tournaments`，顶部保留全部/慢垒/棒球筛选，下面新增赛事/赛季横向卡片；顶部 `开始记录比赛` 按钮必须是紧凑右侧操作，项目筛选使用页面专属 `game-sport-*` 小胶囊且固定内容宽度，不要使用通用 `filter/filter-btn`，也不要退回 full-width 三段条，否则 iPad/宽屏下会显得悬浮和失衡；赛事卡按 `tournamentId` 匹配比赛，老比赛没有 `tournamentId` 时用 `season` 兜底匹配，保证网页端赛事数据能在小程序里复用；比赛卡片优先显示 `games.cover` 缩略图，没有封面时显示中文运动标签兜底。真实赛事卡提供“详情”入口进入 `pages/tournaments/tournament-detail`，对齐网页 `tournament.html` 的赛事详情语义：展示赛事封面/时间地点/战绩/得失分、全部场次、可排序打击排行榜和投手排行榜；赛事内球员链接只按该赛事出现的 `playerId` 和姓名小候选查询，比赛与已匹配球员均可点回详情。
- 小程序比赛详情：`pages/games/game-detail` 按本场已有 `playerId` 读取 `/players/:id`，并对本场仍未匹配的猎户侧姓名调用 `/players?include=all&keyword=<姓名>&limit=5&offset=0` 小候选查询，用 `playerId/name/aliases/publicDisplayName` 匹配猎户侧 batting/pitching 行、MVP、事件日志和得分跑者；匹配成功的姓名用公开展示名显示并可点回 `players/player-detail`，未匹配行不跳转。小程序现场记分保存时会把 `eventId` 写入 `games.event_id`，把 `metadata.source = mini_scorebook`、`gameId`、`rosterEventId/relatedEventId`、`rosterEventTitle`、`relatedTournamentId`、`lineupPlayerIds`、`mvpPlayerId` 等一起写入 `/games`，并同步顶层 `mvpPlayerId` 到 `games.mvp_player_id`；能识别的垒上跑者用 `playerId/name` 保留，打席带回分数时 `gameLog.scoredRunners` 记录得分跑者并同步球员 R / 打者 RBI。比赛详情显示 `games.cover` 封面、“来自接龙”并可点回活动详情，事件日志会显示得分跑者；日志标题、日志“查看球员档案”提示和本场精彩时刻 meta 都走 `player-identity` 的公开展示名/磨砂 class，不直接清晰输出原始 `gameLog.playerName` 或 `highlights.player_name`；还会按 `gameId` 读取 `/highlights?includePlayer=true`，普通用户只展示 `published/approved` 精彩时刻，管理员可看本场全部记录，图片用 `wx.previewImage` 预览，B站链接只复制，不在小程序内播放视频；“导出 PDF”调用 `/games/:id/export-pdf` 生成并打开中文比赛记录 PDF。
- 后端新增 `wx-login`、网页关联码、活动报名和一键签到接口；`auth-helpers` 支持 Bearer session，便于小程序保存并发送登录态；`event_signups` 列表会联查活动标题、日期和地点，供个人页显示中文报名记录。`/api/events` 的 create/update/delete 会写 `event_create/event_update/event_delete` 审计；`/api/event-signups/import` 允许管理员粘贴微信群接龙文本，解析编号姓名、待定/请假等状态和备注，按球员姓名/别名匹配正式档案，匹配不到的写入 `manual_name` 并标记 `source = wechat_group_paste`；`/api/event-signups/admin-upsert` 和 `PATCH /api/event-signups/:id` 支持管理员单个补人、更新备注和调整报名/待定/取消状态；接龙详情页管理员区已支持从剪贴板一键粘贴识别，也支持手动增补、名单状态修正、编辑接龙、复制原帖链接和删除单条接龙。
- 小程序微信登录页已接入官网同一份协议页面 `https://www.猎户座棒垒球.cn/legal.html`：登录页用蓝色下划线 `navigator` 超链接进入 `pages/legal/legal`，该页通过 `web-view` 打开官网协议；正式环境可用前需在微信后台把 `www.猎户座棒垒球.cn` 配为业务域名。登录前必须勾选三项确认：用户协议/隐私政策/个人信息处理规则、必要个人信息处理单独同意、14 周岁或监护人确认。
- 小程序已补齐网页 `contact.html` 的公开联系功能：`pages/contact/contact` 复用网页现有主场、训练时间、邮箱、小红书和负责人微信信息，负责人头像按 `/players?keyword=<姓名>&limit=5&offset=0` 的小候选查询补齐公开球员资料；页面支持复制负责人微信/邮箱/地点、生成并复制试训咨询内容、跳转近期接龙和官网协议页。首页下方新增“加入北京猎户座”区块，个人页快捷入口新增“联系我们”，但不占用首页首屏五个主流程卡片。
- `/api/auth/wx-login` 会强制校验上述三项确认，缺失时返回 `legal_consent_required` 和协议链接；新微信用户自动创建试训队员档案时会在 audit metadata 记录 `legalConsent`、协议版本和确认时间。
- `/api/checkins/direct` 返回 `pointDelta`、当前 `points` 汇总和 `trialProgress`；重复签到 `pointDelta = 0`。签到页已经改为“接龙签到”：训练、比赛、活动都先在 `events` 里形成队内接龙，用户从接龙详情或签到页选择同一条接龙后定位签到；当前小程序调用 `wx.getLocation({ type: 'gcj02' })`，签到 payload 和 `attendances.metadata.location` 记录 `type/source/accuracy`（旧 fuzzy 字段仍兼容）。训练接龙按 `training` 计入试训次数，比赛/活动接龙按 `event` 记到场，比赛出场分仍以比赛记录保存为准。小程序不自动读取微信群聊天内容，正确形态是发起小程序接龙卡片并转发到群；兼容形态是管理员复制微信群原生接龙文本，点“粘贴并识别”导入接龙详情页。
- 试训升级逻辑与网页端保持一致：首次小程序微信登录先创建 `casual` 试训球员；训练签到累计满 8 次自动升级 `verified`；若与已有正式球员同名，则不自动升级，提示走正式球员绑定审批。
- 积分页先刷新 `/auth/me` 再拉 `/players/:id/points`，避免冷启动直接进入积分页时 `globalData.player` 为空；页面展示基础/表现/荣誉/调整拆分、最近 12 条积分流水、球队排行，并把服务器返回的 `rules` 按中文分组展示，前端不另写一套积分公式。积分页从 `/games?includeAggregate=false` 提取年份赛季 picker，调用 `/leaderboard?season=YYYY` 和 `/players/:id/points?season=YYYY` 同步筛选球队排行、我的总分和流水；我的流水提供“全部/比赛/训练/活动/奖项/名人堂/调整”来源 chip。比赛类流水可点进比赛详情，训练/活动签到流水可点回对应接龙详情；球员详情页的最近积分流水保持同一跳转语义。
- 绑定申请沿用 `player_bind_requests`：小程序用户自主选择正式球员档案，绑定页通过 `/players?limit=50&offset=...&keyword=...` 分页搜索正式球员候选，页面展示已选目标，申请中携带 `requestedPlayerId` 和球衣号，管理员批准后才自动绑定；个人页和绑定页都读取 `/api/bind-requests/mine`，以中文展示待审核、已通过和已驳回状态。
- 小程序管理台：`pages/admin/admin` 已注册到 `app.json` 和开发者工具条件编译；首页登录状态和个人面板会对有权限用户显示管理入口。当前管理台按模块 tabs 收敛为绑定审批、球员档案、积分签到、账号权限和最近操作；保留绑定申请审批、新增/批量导入/合并球员、账号权限调整、手动积分调整、删除错误手动积分、补录训练/活动签到、删除错误签到、待审精彩时刻统计、最近审计摘要、站内通知和常用跳转。不再展示发送绑定邀请、绑定码中心、网页关联码、直接绑定/解绑、删除账号、星阵发布、赛事设置、接龙/比赛批量删除和名人堂授予等旧入口；绑定统一走申请审批，旧绑定码/直绑相关 action 只作为历史审计文案展示。比赛详情页仍对有 `games:revise` 权限者显示“修订比赛数据”，单场修订/删除从 `pages/games/game-edit/game-edit` 进入并继续写审计；数据组只有 `audit:game_read` 时后端只返回比赛相关审计，A/B 管理员有 `audit:read` 时可看全站审计。`pages/notifications/notifications` 对普通队员展示站内信列表和未读数；有 `notifications:write` 权限的管理员可调用 `POST /api/notifications` 按全队、正式球员、试训队员、管理员或指定球员群发站内信，后端写 `user_notifications` 并记录 audit。
- 比赛发起页的出场名单支持两种来源：`管理员手动添加` 和 `从活动接龙导入`。页面结构为“比赛信息 -> 出场名单 -> 守位确认”三步，下一步/返回按钮固定在当前任务区底部；球员候选通过 `/players?include=all&limit=50&offset=...&keyword=...` 分页搜索，接龙导入读取 `/api/event-signups?eventId=...`，并在 UI 中显示“已识别 / 已绑定 / 需手动添加”；只把已绑定 `playerId` 的报名/待定队员直接导入 lineup，如果绑定球员不在当前候选页，会单独读取 `/players/:id` 补入，避免误判为未绑定。从微信群粘贴导入但未匹配档案的 `manualName` 会列为“需手动添加”，不能直接成为统计球员。管理员仍可继续勾选/取消球员并调整棒次、守位；守位排布继续保留场地图，拖动之外也支持先选球员再点场上守位。
- 阵容排布支持拖动块：球员块上下拖动可调整棒次；点选球员块后点场上位置可改守位；真机触点落在场地图内时会吸附到最近守位。位置 picker 仍保留为兜底，`test:miniprogram-flows` 已覆盖拖拽调棒次、点选守位和拖到场地图吸附守位。
- 小程序比赛记录新增 `eventId` / `games.event_id`、`mvpPlayerId` / `games.mvp_player_id`、`gameLog` / `games.game_log` 和 `games.metadata`：现场记录页维护上/下半局、出局数和垒位，能识别的垒上跑者用 `playerId/name` 保留；现场 UI 已重构为“现场记分台”，顶部比分条展示比分、局数、出局、垒位、当前打者、球数和撤销，底部模式切换为“打席 / 跑垒 / 投手 / 阵容 / 日志 / 赛后”；主屏高频按钮为坏球、好球、记录界外球、安打、出局、保送/上垒，二垒打、三垒打、本垒打、失误上垒、野选、牺牲打、双杀和手动修正收进“更多结果”。1B/2B/3B/HR/BB 会按常规跑垒自动推进垒位、写入比分，并在能带回分数时同步得分跑者 R 和打者 RBI，日志保存 `scoredRunners`；打席结果会自动轮到下一棒，记录员也可以通过 picker 或点击本队数据表直接切换当前打者；慢投垒 `softball` 的球数规则为初始和新打席均 `1-1`，界外球算好球，两好界外自动三振并轮到下一棒；棒球 `baseball` 保持 `0-0` 且两好界外不三振。现场阵容调整区可记录换守位、换人、代打/代跑等备注，更新 batting row 的 `pos` 并写入事件日志/保存 payload；手动得分、手动打点、垒位开关和撤销仍保留用于特殊规则或赛后修正。发起页日期使用小程序日期 picker，默认当天；不再预先填写局数，现场记录页从第 1 局开始，点“下一局 / 换半局”时按实际记录动态扩展逐局比分，保存时用实际 linescore 长度写入 `innings`。得分、打席、投手、阵容调整和对手统计会生成中文事件日志；涉及猎户球员的日志会同时保存 `gameId`、`playerId`、`playerName`、`actionKey/actionType`、`scoredRunners`、`countBefore/countAfter`、`pitchCount`、`baseBefore/baseAfter`、`resultKey/resultLabel` 和 `relatedEventId`，比赛详情页可从逐事件日志点回球员详情，并通过顶层 `eventId` 与 `metadata.scoreRules` 回溯接龙活动、赛事/场次来源、名单来源、MVP、出场球员 id 和本场计分规则。`server/routes/games.js` 在保存/修订时会懒加载补 `event_id` / `mvp_player_id` / `game_log` / `metadata` 列，支持 `/games?eventId=...` 按来源接龙筛选，并为能匹配到球员池的猎户侧打击/投手行补写 `playerId`。
- 小程序比赛详情继续对齐网页 `game-detail.html` 的数据表语义：逐局和 R/H/E 之后，猎户进攻、猎户投手、对手进攻、对手投手四块都有中文指标 chip，可按安打/打点/AVG/OPS 或 IP/SO/ERA/WHIP 等指标排序，重复点击同一指标切换升降序，并用轻量横向指标条同步展示当前排序 Top。猎户打击/投手行继续链接正式球员，对手打击/投手行不链接同名猎户球员；B站链接仍只复制，不做小程序内播放。精彩时刻墙、比赛详情精彩时刻和球员详情精彩时刻的 meta 文本均使用统一公开身份规则，`test:miniprogram-preflight` 会检查 `metaClass/nameClass` 防止回退。
- 小程序性能约束继续收敛：比赛中心不再一次拉取全量赛事或全量比赛，`pages/games/game-list` 先调用 `/tournaments?includeGameCount=true&limit=30&offset=0` 获取首批赛事轻量计数，历史赛事点“加载更多赛事”追加；再按当前运动/赛事筛选调用 `/games?includeAggregate=false&limit=30&offset=...` 分页加载，切换慢垒/棒球或赛事时重新请求比赛第一页，触底或点“加载更多比赛”再拉下一页。赛事详情不再拉取全量比赛再本地筛选，而是调用 `/games?includeAggregate=true&tournamentId=<id>&includeSeasonFallback=true`；后端会返回指定赛事比赛，并把老数据中没有 `tournament_id` 但 `season` 相同的比赛纳入，避免丢旧比赛；赛事内球员排行榜不再拉 `/players?include=all&limit=200`，而是按赛事内 `playerId` 读 `/players/:id`，并对未匹配姓名查 `/players?include=all&keyword=<姓名>&limit=5&offset=0`。比赛详情不再为单场链接球员拉 `/players?limit=200`，而是按本场 `playerId` 读 `/players/:id`，并对本场未匹配姓名查同样的小候选；本场精彩时刻调用 `/highlights?gameId=<id>&includePlayer=true&limit=30&offset=...`；管理台积分关联比赛搜索调用 `/games?includeAggregate=false&keyword=<关键词>&limit=40&offset=0`，搜索候选只进入积分 picker，不污染批量移动/删除列表。精彩时刻页不再一次拉全量图片、球员或全量比赛候选，照片墙调用 `/highlights?includePlayer=true&includeGame=true&limit=60&offset=...`（普通用户追加 `public=true`）分页加载，并直接用 `highlight.player/highlight.game` 输出公开身份、比分 meta 和跳转；未登录游客不拉投稿用 `/players` 或 `/games` 候选，登录后投稿关联球员 picker 才调用 `/players?include=all&limit=50&offset=...` 分页加载，投稿关联比赛 picker 才调用 `/games?includeAggregate=false&limit=50&offset=...` 加载最近候选并可继续加载更多。首页最近比赛只读 `/games?includeAggregate=false&limit=3`；首页精彩时刻调用 `/highlights?public=true&includePlayer=true&includeGame=true&limit=12`，由接口返回 `highlight.player` 和 `highlight.game`，不再为了照片墙 meta 拉 12 场比赛上下文。比赛发起页的接龙候选调用 `/events?limit=60&offset=...` 分页加载；比赛发起页球员候选调用 `/players?include=all&limit=50&offset=...&keyword=...` 分页搜索，从接龙导入时只对当前页缺失的已绑定 `playerId` 单独读 `/players/:id`；从接龙详情 `eventId` 直达时如首屏缺失该接龙，则单独补读 `/events/:id`，不为了直达入口回退全量接龙。活动/接龙详情的关联比赛调用 `/games?includeAggregate=false&eventId=<id>&limit=20&offset=...` 分页加载，不再为接龙详情拉完整比赛历史；接龙详情管理员增补名单调用 `/players?include=all&limit=50&offset=...` 并支持 `keyword` 搜索/加载更多，不再预取 200 人。名人堂页调用 `/hall-of-fame?includePlayer=true&limit=30&offset=...` 分页加载，不再一次拉完整名人堂记录。绑定申请页调用 `/players?limit=50&offset=...&keyword=...` 分页搜索正式球员候选，不再一次取 200 个球员。站内通知指定球员发送只在切到“指定球员”后调用 `/players?include=all&limit=50&offset=...` 分页候选，广播路径不预加载球员池。联系页负责人头像只按负责人姓名调用 `/players?keyword=<姓名>&limit=5&offset=0` 小候选查询，不再拉完整球员池。球员详情的精彩时刻也不再拉全站公开高光，而是按球员真实名、公开名和 aliases 分别请求 `/highlights?public=true&playerName=...&limit=24` 后合并去重；球员详情能力概览不再拉 `/players?include=all&limit=200`，改用当前已加载相关比赛打击行生成参考池。球员阵容页调用 `/players?limit=40&offset=...&includeTotal=true&includePositionCount=true` 分页加载，顶部榜首只读 `/leaderboard?limit=1`，当前页球员积分只读 `/leaderboard?playerIds=<当前页id>&limit=<当前页人数>`，由后端返回真实 `rank`；积分页球队排行调用 `/leaderboard?limit=50&offset=...` 分页加载；首页和管理台积分概览只请求 `/leaderboard?limit=3`；管理台球员池调用 `/players?include=all&limit=50&offset=...` 分页加载，追加后同步积分/签到、合并和账号权限候选。
- `npm run test:miniprogram-request` 覆盖小程序请求层：跨环境 `resourceAppid/resourceEnv`、已关联环境 `config.env` 兜底、HTTP fallback、Bearer session 写入和 `-601012 unauthorized env` 友好报错；`test:miniprogram-preflight` 同时保护 `app.js` 在跨资源模式下不默认初始化 `wx.cloud`。
- `npm run test:miniprogram-ci` 是小程序本地 CI 总入口：先做开发者工具 CLI / miniprogram-ci / 项目配置 / 页面文件 / 云托管配置体检，再串联 preflight、request、events-audit、tournaments-audit、highlights-route、hof-route、leaderboard-route、notifications-route、admin-users-route、records-pagination、games-linkage、players-import、flows、score；它不做上传或预览，适合每轮小程序改动后跑。
- `npm run test:records-pagination` 覆盖 `/api/bind-codes`、`/api/points-adjustments`、`/api/attendances` 的 `limit/offset/hasMore/nextOffset` 分页契约、bind-codes `keyword` 小候选和不传 `limit` 的旧版全量兼容（网页端 `db.js` 仍整表读取）；`test:admin-users-route` 同时覆盖 `/admin/bind-invitation-options` 的分页、keyword 和 `includePlayers=false` 跳过球员子查询。
- `npm run test:events-audit` 覆盖 `/api/events` 路由创建、编辑、删除接龙时写入 `event_create/event_update/event_delete` 审计，并校验删除审计保留报名人数。
- `npm run test:tournaments-audit` 覆盖 `/api/tournaments` 路由创建、编辑、删除赛事容器时写入 `tournament_create/tournament_update/tournament_delete` 审计，并校验 before/after/changedKeys。
- `npm run test:highlights-route` 覆盖 `/api/highlights` 的公开图片筛选、状态筛选、球员名筛选和 `limit/offset/hasMore/nextOffset` 分页契约，并已纳入 `test:miniprogram-ci`。
- `npm run test:games-linkage` 覆盖 `/api/games` 保存小程序比赛时把来源接龙写入 `games.event_id`、保留球员/MVP/日志关联，支持 `/games?eventId=...` 按来源接龙筛选，支持赛事详情的 `includeSeasonFallback=true` 轻量筛选，并校验删除比赛会写 `delete_game` 审计。
- `npm run test:miniprogram-flows` 覆盖小程序队员和管理员常用闭环：接龙报名/待定/取消、接龙封面上传 COS、接龙配图上传 COS、接龙图集预览、列表封面兜底、接龙编辑、原帖链接复制、单条接龙删除确认、管理台批量删除接龙、接龙审计标签、管理员粘贴微信群接龙文本识别、管理员手动增补接龙名单和改报名状态、比赛接龙/训练接龙签到 payload 与积分反馈、积分页冷启动身份刷新、赛季筛选、流水来源 chip、服务器积分规则中文展示、积分流水点回比赛/接龙、球员阵容页同源读取/搜索筛选/公开展示资料、分页加载更多和 Top/总数轻量指标、球员详情管理员编辑档案/别名/荣誉/真实球员照片、公开展示资料、真实照片和公开头像分别上传 COS、能力概览核心/进阶指标和近场趋势、升级试训球员、删除球员确认、名人堂展示与点回球员详情、精彩时刻公开浏览/选择图片上传 COS/投稿/B站链接复制/球员和比赛跳转/管理员发布/下架/重新发布/删除记录、个人页账号资料与正式球员公开展示资料保存、站内通知未读/已读和管理员定向发送、球员详情的积分/比赛关联、比赛中心赛事/赛季筛选和封面图兜底、赛事详情的战绩/场次/可排序打击排行榜/投手排行榜及球员跳转、GameChanger PDF / Excel 多文件队列、每个导入队列项可选封面上传 COS 并随入库写 `cover`、Excel 多场 draft 展开后逐场确认入库、比赛详情打线/投手/MVP 点回球员详情、封面展示、PDF 导出、四块数据表指标排序/指标条同步、本场精彩时刻预览/B站链接复制和修订入口、比赛修订页原因必填及比分/RHE/打击/投手行/MVP/封面关联保存、绑定审核状态与防重复提交、小程序管理台绑定审批/模块 tabs/新增球员/批量导入球员/合并球员/账号权限调整/手动调分/删除错误手动积分/补录签到/删除错误签到/最近审计摘要、审计日志筛选/加载更多/metadata 详情、比赛发起从接龙导入出场名单并由管理员手动补人、拖拽调棒次和拖到场地图吸附守位。后续改这些页面时必须跑它。
- `npm run test:miniprogram-score` 覆盖现场记录：慢投垒初始 `1-1`、新打席重置 `1-1`、界外球加好球、两好界外自动三振、棒球两好界外不三振、比分同步、半局/垒位、直接选择当前打者、常见打席结果自动推进垒位/RBI/比分、得分跑者 R 归属、打席后自动轮棒、撤销恢复当前打者、现场阵容调整、投手 IP、对手统计、逐事件日志的 `gameId/playerId/actionType/scoredRunners` 关联、`metadata.scoreRules` 和保存 payload。
- `server/schema.sql` 新增 `event_signups`、`attendances.metadata`、`games.event_id`、`games.mvp_player_id`、`games.game_log` 与 `games.metadata`；上线前需要让云数据库完成建表/加列，相关路由也会 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` 兜底。
- 本文件和 `../DESIGN_BRIEF.md` 已记录当前状态；线上网页端和 Express API 为微信云托管 `express-knlw-055`，小程序开发版本 `1.0.11` 已上传但尚未提交审核或发布正式版。当前运行时代码已部署/上传；文档同步改动本身不影响运行包，工作区仍有未提交改动，用户说“备份代码”时执行 commit + push。
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
wxcloud run:deploy . -e prod-d5gtkxdyu7263e95b -s express-knlw --targetDir . --dockerfile Dockerfile --containerPort 80 --releaseType FULL --noConfirm --remark "说明本次改动"
npm run deploy:verify -- --expected-version express-knlw-NNN
```

注意：

- `wxcloud --version` 应为 `@wxcloud/cli/2.3.3` 或更新；旧版本曾有上传体积限制。
- 首次或登录失效时，需要用户自己跑 `wxcloud login` 扫码。
- 非 TTY 下 `wxcloud` 会问上传方式；显式传 `--targetDir . --dockerfile Dockerfile --containerPort 80` 走“手动上传代码包”，不要依赖 `yes "" | npm run deploy`。
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
- 选择绑定正式档案时，才显示目标正式球员搜索、队内昵称和核验信息；不再重复要求填写真实姓名或球衣号。
- 目标球员搜索候选列表必须在表单流内展开，不能绝对定位覆盖后续字段；搜索框下方保留固定说明小字，不使用“取消”按钮，收起触发包括再次点击搜索框、点击外部字段、点击下拉内空白、输入框失焦和 Esc。
- 绑定申请写入 `player_bind_requests`，状态为 `pending / approved / rejected`；批准必须由 admin 执行，不能按姓名或球衣号自动通过。
- 批准时复用 `bindUserToPlayer`，把 casual 签到和手动积分迁移到 verified 球员；驳回时保留试训档案，用户可重新提交申请。
- 小程序先注册、网页后来注册的用户，使用 `users.app_connect_code` 关联网页邮箱身份；同一人只增加 `user_identities.email`，不新建第二个账号或第二个试训档案。

### 5.2 试训到正式

| 路径 | 触发 | 行为 |
|---|---|---|
| 自动升级 | casual 满 8 次训练 | 不撞预置实名则升 verified；撞名则拒绝并提示提交绑定申请，由管理员审核后合并 |
| 绑定申请合并 | 用户申请绑定正式档案，admin 批准 | casual 的签到/积分调整迁到目标 verified，删除 casual，用户绑定目标 |
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
- 后端 `/leaderboard` 和 `/players/:id/points` 支持 `season=YYYY`，按 timeline 过滤后重算 total/breakdown；小程序积分页使用同一参数，保证球队排行、我的积分和流水筛选口径一致。

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

## 6. GameChanger PDF / Excel parser

硬契约：

- 文件名是 home/away/date 权威源：`<away>_vs_<home>_<Mon>_<DD>_<YYYY>.pdf`。
- 第一个队是客队，第二个队是主队。
- PDF header 若与文件名冲突，以文件名为准并成对翻转主客、比分、linescore、totals。
- `Totals/Team Totals/总计/合计/总和` 不能进入 batting/pitching 球员数组。
- 改 `assets/js/parser.js` 前先跑 `npm run test:gamechanger`；新增样本先扩回归脚本再改算法。

当前能力：

- 文本型 GameChanger PDF 已用 5 份真实样本回归，期望 5/5 passed 且 warning 为 0。
- Excel 工作簿走同一 `assets/js/parser.js` 的 `parseExcelFile`，服务端通过 `xlsx@0.18.5` 注入 `globalThis.XLSX` 后解析，可从一份工作簿返回多场比赛 draft。
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
| `game-detail.html` | box score、逐局、图表、4 张 sortable 表、MVP、highlights；小程序详情用指标 chip + 轻量横向条承接同一排序/图表语义 |
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
4. 小程序线：首版源码和配套 API 已完成并已上传开发版本 `1.0.11`；活动签到为一键定位签到（当前调用 `wx.getLocation({ type: 'gcj02' })`），赛事活动已统一承载接龙、赛事容器和比赛场次，比赛记录为中文现场记分台，并已加入常见打席结果自动跑垒/RBI/比分联动、慢投垒 `1-1` 初始球数和两好界外三振规则；按钮体系已统一为 Apple 式圆角、flex 居中、稳定 hover/disabled。微信开发者工具 Stable ARM64 `2.01.2510290` 已安装到 `/Applications/wechatwebdevtools.app`，CLI 位于 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`。后续提交审核、发布正式版、再次上传开发版本或真机预览都需要用户明确授权。资源复用已关联到 `prod-d5gtkxdyu7263e95b` 并在模拟器读取到首页云数据；云托管 `express-knlw-055` 已配置小程序 AppID/AppSecret，假 code 登录返回微信 `invalid code` 属预期。具体方案见 §10。
5. 微信网页登录 SDK 暂搁置，需备案域名与开放平台资质。
6. COS 历史 base64 图片可做一次性迁移。
7. Andy -> 林立欣真实数据合并需要用户明确授权，功能已在 admin 球员池。
8. 清理死代码：`contact.html`、旧 `.wall/.poster` CSS 等，注意别删仍在用的 `.cp-avatar/.contact-person`。
9. 全站 dbReady race audit。
10. 图片型 PDF OCR 单独立项。

---

## 10. 小程序与多端数据同步计划

目标：小程序不是另一套孤岛数据，而是 Web、后台和小程序共用同一个 Express API + MySQL 数据源。不要回到小程序本地 storage 当主数据源。

当前本地实现：

- 小程序工程路径：`orion-demo/miniprogram/`；开发者工具打开 `orion-demo/project.config.json`。
- 微信开发者工具：官方稳定版 `2.01.2510290` ARM64 已下载自微信开放文档动态配置并安装到 `/Applications/wechatwebdevtools.app`；DMG 保存在本地忽略目录 `/Users/jinjiangshan/Downloads/猎户网站项目/tools/`，SHA-256 为 `555d6a36fc128ab1eb3b5e9bc72ad8a1a5825e962e285180e51803d8d4dde9b5`。`spctl` 显示 Notarized Developer ID，签名主体 Tencent Technology。
- 小程序调用后端：`miniprogram/utils/request.js` 支持两种官方云托管调用：已关联环境下直接 `wx.cloud.callContainer({ config: { env } })`；当前 AppID 与资源 AppID 不一致时使用 `new wx.cloud.Cloud({ resourceAppid: "wx7dce60930ee10898", resourceEnv: "prod-d5gtkxdyu7263e95b" })` 后再 `callContainer`。请求头带 `X-WX-SERVICE: express-knlw`。`wx8ad6ccfa1b8f040a` 的资源复用已在模拟器验证可读数据；`app.js` 不再默认初始化 `wx.cloud`，除非直连本小程序云环境或显式设置 `cloudInitEnv`。
- 小程序登录态：`/api/auth/wx-login` 返回 HMAC session token；小程序本地保存后用 `Authorization: Bearer <token>` 调 API。
- 首版页面：`home`、`login`、`events/event-list`、`events/event-detail`、`events/event-create`、`checkin`、`players/player-list`、`players/player-detail`、`hall-of-fame/hall-of-fame`、`games/game-list`、`games/game-detail`、`tournaments/tournament-detail`、`score/create`、`score/live`、`profile`、`bind`、`points`、`notifications`、`admin`。
- 首版业务：活动接龙发起、`wx.chooseLocation` 地图选点、活动报名/待定/取消、报名名单、一键定位签到（`wx.getLocation` 精确定位）、球员阵容/详情、个人账号资料、正式球员公开展示资料维护、管理员真实球员照片维护、名人堂展示、精彩时刻照片墙/投稿/审核、绑定正式球员申请、小程序管理台绑定审批/模块 tabs/新增球员/批量导入球员/合并球员/账号权限调整/积分调整/补录签到/待审精彩时刻统计/审计日志明细筛选、站内通知阅读和管理员定向发送、排行榜/我的积分、比赛列表/详情、赛事详情/赛事内排行榜、赛事/赛季筛选、比赛发起、阵容/守位排布、场地图预览、重复守位提示、中文友好实时比赛记录（逐局比分、猎户打线、直接选打者、打席后自动轮棒、常见打席结果自动跑垒/RBI/比分、现场阵容调整、投手 IP/H/R/ER/BB/SO/HR、对手统计、MVP、备注、撤销上一步），保存比赛到 `/api/games`；保存后详情页展示 R/H/E、猎户进攻、猎户投手、对手进攻、对手投手、四块表格指标排序/轻量指标条、事件日志和 PDF 导出，数据组可从详情页进入修订页并带原因保存。
- 预览前先跑：`npm run test:miniprogram-ci`，并保留 `npm run test:gamechanger` / `npm run test:gamechanger-server` 作为 Web/parser 和后端 PDF / Excel 导入回归；2026-05-28 小程序 CI 体检、四项小程序回归、`node --check` 和 `git diff --check` 已全部通过。还做了 Express 烟测：`npm start` 后 `/api/health`、`/api/events`、`/api/games` 返回 200，未登录 `/api/event-signups/mine` 返回 401，服务随后已关闭。

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
- 后端 `/api/auth/wx-login` 把 code 换 openid/session，并写入 `user_identities.type='wx_openid'`；如果拿到 unionid，也写入 `wx_unionid`。
- 保留现有 `user -> bound_player_id -> player` 双身份模型：公开优先看球员页公开展示资料，未设置时看磨砂玻璃化档案资料，自己可看真实档案和账号昵称/头像。
- 小程序端不使用绑定码。用户注册/登录后，可以从正式注册球员列表中自主选择“申请绑定这个球员”。
- 后台 admin 收到绑定审批提示，核对微信身份/头像/姓名备注与注册球员是否一致；批准后后端自动写 `users.bound_player_id`，必要时合并 casual 试训档案的签到和积分流水。
- 建议新增 `player_bind_requests` 或等价表：`user_id`、`requested_player_id`、`status(pending/approved/rejected)`、`note`、`reviewed_by`、`reviewed_at`、`created_at`。
- 可复用 `user_notifications`：用户提交后通知管理员；管理员批准/驳回后通知用户。
- 网页端后续按 A 方案升级：邮箱注册后也允许用户提交“绑定注册球员申请”，选择目标 registered/verified player，并填写队内昵称、微信号、其他验证信息等辅助核验信息。
- 网页端申请同样进入 `player_bind_requests`，必须由 admin 审批后才自动绑定；不能因为姓名或邮箱相似就自动通过。
- 绑定码不再作为小程序绑定路径；当前小程序和后续网页端都以“用户申请 -> 管理员审批”为主。原因是网页邮箱注册缺少微信 openid 身份上下文，审批流比用户自绑更安全。

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
- 训练签到：小程序一键调用 `wx.getFuzzyLocation` 后写 `attendances`，积分自动体现；admin 仍可后台补录。
- 活动签到：活动报名/签到也写 attendance 或活动参与流水，按现有“活动 +5”规则进入积分。
- 手动加减分：仍只在 admin 后台操作，写 `points_adjustments`。
- 赛季奖项/名人堂：仍由 admin 管理，避免小程序端直接发奖。

### 10.5 活动接龙 / 报名 / 签到

建议新增活动报名能力，而不是只做静态 `events.html`：

- `events` 保持活动主表：标题、时间、地点、封面、正文、状态、容量、报名截止时间。
- 新增 `event_signups` 或等价表：`event_id`、`user_id`、`player_id`、`status`、`note`、`created_at`、`updated_at`。
- 小程序活动页：活动列表、活动详情、报名/取消、报名名单、我的报名状态。
- 后台活动页：创建活动、查看报名名单、导出、手动增删报名、关闭报名。
- 一键签到：小程序选择一条队内接龙（训练 / 比赛 / 活动），调用 `wx.getFuzzyLocation` 模糊定位（2026-06-08 修正：主体认证前不声明 `getLocation`），再由 `/api/checkins/direct` 校验身份、防重复并写签到流水。这里不是读取微信群原生文字接龙，微信群内应转发小程序接龙卡片，队员点卡片进入报名/待定/签到。

### 10.6 建议实施顺序

1. API 盘点：确认现有 auth/player/events/points/attendance 哪些可直接给小程序用。
2. 小程序登录骨架：`wx.login` -> 后端 session -> `me`。
3. 球员绑定申请：小程序自选注册球员 -> admin 审批 -> 自动绑定；网页端也按 A 方案提交绑定申请并经 admin 审批。
4. 活动列表和详情：先只读 API，替换 `events.html` 的占位。
5. 活动报名表：新增报名表和后台报名管理。
6. 一键签到：训练/比赛/活动都先走队内接龙，签到选择接龙后调用 `wx.getFuzzyLocation`，再走 `/api/checkins/direct`，后端防重复并写 `attendances`。
7. 积分页复用：排行榜、积分明细、我的积分。
8. 比赛发起和记录：发起页绑定球员数据排棒次/守位，显示场地图预览并提示重复守位；现场记录页中文操作，覆盖逐局、打线、投手、对手统计、MVP、备注和撤销。
9. 通知：绑定申请、审批结果、活动提醒、报名成功、签到成功。
10. 小程序 UI polish：再做首屏、图表替换、移动端表格体验。

---

## 11. 接手 sanity check

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
npm start

curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/players | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).players.length))"
curl -s 'http://localhost:3000/api/leaderboard?limit=3' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).leaderboard.map(x=>`${x.player.name}:${x.total}`).join(' / ')))"
npm run test:gamechanger
npm run test:gamechanger-server
npm run test:miniprogram-request
npm run test:miniprogram-flows
npm run test:miniprogram-score
npm run test:miniprogram-preflight
npm run test:miniprogram-ci
```

预期：

- `/api/health` 返回 `server:"ok"` 且 DB ping OK。
- 球员数约 53。
- GameChanger 回归 5/5 passed。
- 后端 GameChanger 导入样例可解析，并保留 `metadata.source = gamechanger_pdf` / `gamechanger_excel`。
- 小程序比赛记录回归通过，覆盖得分同步逐局、撤销、投手 IP、MVP `playerId` 关联和保存载荷。
- 小程序预检通过，覆盖页面清单、云托管调用、`chooseLocation/getFuzzyLocation` 声明（fuzzy-only）和 QR 签到残留。

---

## 12. 文件地图

```text
orion-demo/
├── server.js
├── server/
│   ├── db.js
│   ├── auth-helpers.js
│   ├── middleware.js
│   ├── gamechanger-import.js
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
│   ├── test-gamechanger-server-import.js
│   └── verify-wxcloud-deploy.js
├── *.html
├── package.json
├── Dockerfile
├── wxcloud.config.json
└── HANDOFF.md
```
