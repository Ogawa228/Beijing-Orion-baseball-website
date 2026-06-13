# 北京猎户座官网 · 设计 Brief

> 面向 Claude Design、设计师或下一轮前端重构。本文保留设计语言、页面职责、组件契约、数据边界和近期状态；逐轮流水账已压缩，旧长版已备份到 `orion-demo/backups/`。

最后整理：2026-06-12
当前线上：`express-knlw-049`

Claude Design / Claude Code 接手摘要（2026-05-29）：

- 小程序视觉目标：继续和猎户座官网保持同一套深蓝、金色、星阵、圆形队徽与公开身份/磨砂隐私语义；这是队内工具，不做营销式 landing page。
- 当前产品状态：网页和云托管后端已部署到 `express-knlw-049`；小程序已上传微信后台开发版本 `1.0.2`（robot `1`），但尚未提交审核或发布正式版。小程序已覆盖活动接龙、报名、管理员粘贴微信群接龙识别、`wx.chooseLocation` 接龙选点、`wx.getLocation` 精确定位签到、微信登录后直接申请绑定正式球员档案、球员阵容/详情、积分榜、精彩时刻照片墙、比赛发起、拖拽棒次/守位、中文现场记分、比赛详情和 PDF 导出、管理台和站内通知。
- 最新设计/性能决策：移动端所有大候选列表都必须分页或后端 keyword 搜索，不能为了 picker、摘要或 meta 拉全量球员/比赛/赛事/精彩时刻。管理台积分关联比赛搜索只展示 `/games?includeAggregate=false&keyword=<关键词>&limit=40&offset=0` 的小候选，且不得影响批量移动/删除列表。
- 文案要求：面向中文队员，分类标签使用中文 + emoji，不回退到英文 chip；“高光图片”统一为“精彩时刻”；B站只提供复制/跳转语义，不在小程序内做外链播放器。
- 验证状态：小程序上传前完整 `npm run test:miniprogram-ci` 与 `git diff --check` 通过；微信后台开发版本 `1.0.2` 上传成功；云托管 `express-knlw-049` 已通过 `deploy:verify`，线上 `/api/health` 200 且 DB OK；线上 `admin.html` 已包含“微信登录已关联 / 核验信息”的绑定申请展示口径。后续视觉改动也要同步本文件与 `orion-demo/HANDOFF.md`。

2026-06-13（四）小程序 tabBar/登录三次反馈修复（仅本地,未上传）:① 页面底部避让 tabBar 的 padding 不能用 `calc(rpx + env())` 混合单位(部分机型失效),必须纯 rpx fallback + calc 双声明。② tabBar 图标用 CSS `background-image`(非 `<image>` 组件),避免切换页面时图标解码空白帧。③ 个人页口径:登录态底部固定"退出登录"按钮(二次确认 + 清 session/globalData/页面态);未登录态只展示登录引导,空 section 一律登录后才出现。验证:`npm run test:miniprogram-ci` 16 项全绿。

2026-06-13（三）小程序 UI 二次反馈修复（已上传开发版本 `1.0.5`,robot `1`）:① 自定义 tabBar 必须 `position:fixed` 固定底部(否则混入文档流与内容重叠、切换重排闪烁),页面 `.page` 底部须留出 `132rpx + 安全区` 避让;此为自定义 tabBar 的硬性布局口径。② 未登录态个人页只展示"未登录引导 + 登录按钮",快捷入口 cell 一律 `wx:if 登录` 后才出现。③ 登录体验口径:首次输入昵称 + 勾选三项同意;之后用 `orionLoginPrefs` 记住昵称与同意,二次进入显示"欢迎回来 + 一键登录"(可"修改昵称/重新阅读协议"切回完整表单),不再每次手填。验证:`npm run test:miniprogram-ci` 16 项全绿。

2026-06-13（二）小程序 UI 视觉精修（已上传开发版本 `1.0.4`,robot `1`;尚未提交审核或发布）:① 底部 tabBar 图标升级为矢量 SVG 线性图标(灰/金两态),中央"签到"金圆内嵌矢量对勾,告别 emoji 的廉价感;② 频闪治理三处——tabBar 组件 `attached` 即用 `getCurrentPages()` 定位选中态(不再首帧用默认值再 setData 闪)、profile onShow 改 5 秒节流静默刷新(不再每次切回整页 loading→数据 抖动)、home hero 图补占位底色 + event-list 补骨架;③ 个人面板入口范式确立:「圆形图标 + 标题 + 副标题 + › 箭头」单列 cell(替代纯文字按钮),清晰可点;④ 字阶口径:全站 `font-weight` 仅用 300/600/700/800/900 五档,标题统一 800、card-title 字号统一 30rpx,非标准值(850/820/760/750/950/880)一律归档;⑤ 长文本断行口径:承载用户可变长姓名/别名/比赛标题的 flex 容器必须 `min-width:0` + 内层文本 `word-break:break-all`,杜绝长无空格英文名撑破卡片导致整页横拖(管理台滑动超限根因);⑥ eyebrow 功能标签中文化,品牌英文副标(Beijing Orion Baseball Club / Orion Account)作装饰保留。验证:完整 `npm run test:miniprogram-ci` 16 项全绿。

2026-06-13 小程序导航改版「驾驶舱 + 底部 tabBar」（已上传开发版本 `1.0.3`，robot `1`；尚未提交审核或发布）：主导航迁入自定义底部 tabBar——`活动中心 / 数据中心 / 签到 / 积分榜 / 我的`，签到是中央 108rpx 金色凸起大圆钮（深蓝底栏描边融合、选中提亮 `#f0d692`、safe-area 适配），其余 tab 为中文+emoji 文字项（未选中 `#9aa9c4`、选中金色加粗）。启动落在"数据中心"即瘦身首页「驾驶舱」：小 hero（280rpx，右上登录态胶囊，未登录为金色"登录"钮）+ 下一场接龙卡 + 积分榜 Top3 + 最近比赛三个信息区块，次级入口全部化为区块标题右侧文字链接与页脚一行低频链接（球员阵容/名人堂/精彩时刻），全页零宫格零大按钮；旧"首屏五个主流程快捷卡"设计自此废止。交互口径：tab 页跳转一律 `switchTab`（统一走 `utils/nav.js`），接龙详情"接龙签到"深链用 storage 暂存 eventId 交接。同轮 UI 排查收口确立三条全站口径：列表页首屏一律 loading 门控 + 骨架（杜绝闪"暂无…"假空态），整页加载失败必须有"重新加载"重试卡（全局 `.load-error`），全部写操作按钮必须 saving 重入守卫 + `disabled`（杜绝双击重复提交）；空态文案统一"暂无…"。验证：完整 `npm run test:miniprogram-ci` 16 项全绿。

2026-06-12 绑定申请与权限口径更新：`express-knlw-049` 起后台绑定审批不再把核验备注误显示为“微信号”；网页后台和小程序管理台在申请元信息中显示“微信登录已关联”，备注显示为“核验信息/核验”。小程序绑定页文案改为“微信登录身份会自动关联；这里可补充管理员容易识别的信息”，输入框改为手机号后四位/备注选填。发起接龙入口和创建页按 `events:write` 权限门控，普通用户不能发起接龙。已上传开发版本 `1.0.2`，尚未提交审核或发布。

2026-06-12 小程序上传与定位口径更新：微信后台已开通 `wx.getLocation` 与 `wx.chooseLocation` 后，签到设计从 2026-06-08 的模糊定位上传路线切到精确定位路线。小程序只声明 `chooseLocation` + `getLocation`，不再声明 `getFuzzyLocation`；签到页文案为“使用微信定位确认到场签到”，调用 `wx.getLocation({ type: 'gcj02' })`，后端签到 metadata 记录 `type=precise/source=wx.getLocation`。上传到微信后台的是开发版本 `1.0.0`，尚未提交审核或发布。后端部署时 `.dockerignore` 已排除 `.secrets/`、申请材料、设计稿和小程序源码；`express-knlw-043` 是中间版本，`express-knlw-044` 为干净全量覆盖版本。保险起见，建议在微信后台轮换小程序代码上传密钥。

2026-06-12 小程序微信登录和绑定申请流更新：体验版曾因云托管缺少小程序 AppID/AppSecret 环境变量而无法微信登录，`express-knlw-048` 已补齐 DB + WeChat 环境变量，并把 jscode2session 请求改为 IPv4 `https.request` + 微信接口专属证书链兜底；线上假 code 返回微信 `invalid code` 401 属预期，说明服务已请求到微信接口。设计语义同步调整为“登录后直接申请绑定正式球员档案”：小程序普通用户不再复制或输入关联码，微信登录后如果没有 verified 球员档案，直接进入绑定申请页；首页和个人页用金色 CTA 明显提示“申请绑定正式球员档案”；绑定页首屏写明“不用关联码”，并把流程压成“选档案 / 填核验 / 等审核”三步。关联码保留为后台/备用账号互通能力，不再是小程序用户侧主路径。已上传开发版本 `1.0.1`，尚未提交审核或发布。

2026-06-08 上传前定位规则修正：微信 `miniprogram-ci` 编译要求 `getLocation` 与 `getFuzzyLocation` 互斥，当前小程序按个人认证可上传路线只声明 `chooseLocation` + `getFuzzyLocation`。管理员接龙地点继续用 `wx.chooseLocation`；队员签到只用 `wx.getFuzzyLocation`，不再在签到页调用 `wx.getLocation`。旧段落如仍写“优先 `wx.getLocation`，失败降级 `wx.getFuzzyLocation`”，以后续本条为准；若主体认证后恢复精确定位，需要重新确认微信后台权限并切换成单一 `getLocation` 路线。

2026-06-08 上传尝试状态：本地 CI 和 `git diff --check` 已通过；`miniprogram-ci` 上传被微信接口以 `invalid ip: 61.149.15.107` 拒绝，需要配置小程序代码上传密钥 IP 白名单。微信开发者工具 CLI 上传则要求开启本机“服务端口/CLI 调用能力”，该操作需要用户授权后继续。当前设计/代码状态仍是未预览、未上传、未部署。

2026-06-09 网页移动端登录态修复：手机端登录后必须在首屏导航直接显示已登录身份，不依赖横向滚动到“我的面板”。本轮把共享 nav 的登录状态同步到 `auth-state-*` 类和 `data-auth-state`，并在 768px 断点下保留 `.nav-hello` 用户名胶囊；移动端登录态表现为“用户名 + 退出”，游客态仍显示“登录 / 加入我们”。390px 视口已验证已登录状态下游客入口隐藏、用户名可见、控制台无相关 error/warn。

2026-06-09 球员页星阵修复：登录后不再显示“成为正式球员后，可完整查看清晰头像与姓名”游客提示；新增“棒球场钻石”星阵 formation，网页星阵控制台、站点配置后端白名单和小程序管理台发布入口同步识别；`p_jinjs`（江山/靳江山）与 `p_yujing`（虞婧）在散列、螺旋、环形、钻石、斜翼、年份等队形下强制保持近邻但避免重叠。移动端 390px 已验证跨预设距离约 55-59px，控制台无相关 error/warn；小程序管理台流程回归通过。

2026-06-09 前次部署状态：用户明确要求“部署”后，已发布微信云托管 `express-knlw-037`。`npm run deploy:verify -- --expected-version express-knlw-037 --domain https://express-knlw-255356-7-1429688831.sh.run.tcloudbase.com` 通过：服务和最新版本均为 `normal`，线上 `/api/health` 返回 200 且 DB OK。小程序源码仍未走预览、真机或正式上传。

2026-06-09 登录态挂载修复：移动端“登录后仍像游客态”的根因不是用户名胶囊样式，而是登录态数据边界。`/api/auth/me` 游客响应原来没有禁缓存，登录后可能继续拿到 `{ user: null }`；前端 `DB.reload()` 也没有刷新 `window.dbReady()` 的等待对象，受保护页可能按旧 preload 判定未登录。当前已把全部 `/api` 响应改为 `no-store/no-cache`，前端 `_api()` 显式 `cache: 'no-store'`，`DB.reload()` 更新全局 Promise，`requireAuth()` 在跳转前强制刷新一次登录态。视觉预期：登录后移动端 nav 必须显示“用户名 + 退出”，管理后台入口可见，球员页游客提示隐藏。已随 `express-knlw-038` 部署到云托管；线上验证 `/api/auth/me`、`/api/auth/login` 响应均透传 no-store，登录后同 cookie 请求 `/api/auth/me` 返回管理员。

2026-06-09 登录态挂载二次修复：`express-knlw-038` 仍可能在手机端 `www.猎户座棒垒球.cn` 出现重复登录，因为页面入口未刷新 `db/auth` 脚本版本号，且 `orion_session` 仍是 host-only Cookie，`www` 与裸域切换时登录态不共享。`express-knlw-039` 已把所有网页入口升到 `db.js?v=25` / `auth.js?v=21`，并让猎户座自定义域统一写裸域 Cookie `Domain=xn--4gsr8nf4ck7ihxnemb.cn`；登录时清当前 host 旧 Cookie，读取时跳过同名 Cookie 中的失效 token。390px 本地验证：球员页和后台页最终显示“管理员 / 退出”，游客入口隐藏，球员页游客提示隐藏；线上验证 `www` 页面加载新脚本，`www` 登录后请求 `www` 与裸域 `/api/auth/me` 均返回管理员，默认云托管域保持 host-only Cookie，logout 会清 host-only 和裸域 Cookie。

2026-06-09 联系页面更新：联系页、首页联系人区和小程序联系页同步新增王斌，展示 `#110 / 外野`、邮箱 `478753480@qq.com` 和小红书 `609655049`；曹山和王斌标为联络人，洁哥标为球队经理；李斯然、黄强保留原微信 `Alan__1110`、`Deco_E`。设计语义上，招新联系提示只指向曹山或王斌，李斯然/黄强仍作为球队联系人信息保留。390px 本地浏览器已验证联系页 5 张联系人卡、首页 7 张联系人卡正常渲染；线上 `www.猎户座棒垒球.cn` 源码检查通过。已部署为 `express-knlw-040`。

2026-06-10 手机端登录态修复：截图里地址栏显示“不安全”，线上确认 `http://xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html` 与 `http://www.xn--4gsr8nf4ck7ihxnemb.cn/dashboard.html` 曾直接 200 返回页面，没有强制 HTTPS；生产 cookie 带 `Secure`，HTTP 入口无法保存登录 cookie。当前视觉/交互预期：自定义域 HTTP 页面立即 308 到 HTTPS；登录后即使 cookie 被移动端浏览器拒绝，也会用后端返回的 `sessionToken` 保存为网页兜底 token，后续 API 带 `X-Orion-Session`，导航应显示已登录状态，`dashboard.html` 不再显示“请先登录后查看个人面板”。已部署为 `express-knlw-041`；线上验证裸域和 `www` HTTP 均 308 到 HTTPS，HTTPS dashboard 引用 `db.js?v=26` / `auth.js?v=22`，JS 资产包含 HTTPS 跳转和 `X-Orion-Session` 兜底逻辑。

2026-06-11 小程序 UI polish 与性能/卫生收口（仅本地，未预览、未上传、未部署）：本轮按四维审计（性能/UI/契约/卫生）收口小程序体验与数据访问。设计/交互预期：① 现场记分页“保存到比赛库”按钮在保存中必须 `loading + disabled`，双击只产生一场比赛；记分中每次打席/换局/垒位/撤销都把整页状态写入本地快照，误触左滑/返回或微信回收页面后重进同一场（按接龙/日期/对手/主客/运动指纹匹配）会弹“恢复未保存的记分”确认弹窗，换场或拒绝则丢弃快照，保存成功自动清快照；进入记分页启用 `wx.enableAlertBeforeUnload` 离开确认，旧基础库自然降级（仍有快照兜底）。② 首页与比赛详情首屏不再闪现“暂无…”假空态：加载中显示深色微光骨架条（`app.wxss` 全局 `.skeleton-line`，rgba 白 .07 底 + 1.3s 呼吸动画），加载完才显示真实空态；首页积分榜空态文案由“积分数据读取中”改为“暂无积分数据”；比赛详情加载失败显示“重新加载”重试卡。③ 移动端宽表体验：比赛详情四块数据表和逐局表横向滚动时，球员名/队名首列 `position: sticky; left: 0` 锁定，底色用卡片合成色 `#0a1527` 不透明实色 + 右缘阴影，保证滑到 AVG/OPS/ERA/WHIP 时行归属可读；逐局表表头“Team”改“队伍”，积分榜“pts”统一改中文“分”（首页 + 球员阵容页）。④ 性能契约延伸：`/bind-codes`、`/points-adjustments`、`/attendances` 支持 `limit/offset/hasMore/nextOffset`（bind-codes 另支持 `keyword`），`/admin/bind-invitation-options` 支持分页与 `includePlayers=false`；小程序管理台绑定码与可邀请用户改 50/页 + 加载更多，邀请球员复用已分页球员池，积分/签到记录按 UI 实际渲染条数 `limit=8` 读取；不传 `limit` 的旧调用（网页端）保持全量兼容。赛事详情与球员详情把仅供 JS 重算的原始比赛/球员数组移出 setData，`/auth/me` 并入首屏并行请求。⑤ 卫生：删除空目录 `pages/checkin-token`、`components/*`，删除 `utils/format.js` 死函数，`utils/player-identity.js` 只导出 `playerIdentity` 作为公开身份唯一入口，签到页清理 fuzzy-only 后的不可达精度分支。验证：完整 `npm run test:miniprogram-ci`（含新增 `test:records-pagination`）、`node --check`、`git diff --check`、本地 `/api/health` 烟测通过。

2026-06-11 联系页球队信息口径修正（仅本地，未预览、未上传、未部署）：成立时间以网页首页球队信息为准，为 `2013 年 9 月`；小程序联系页不再硬编码旧 `2010`，改为读取 `GET /api/team-info`，失败时使用同口径本地兜底。遗留 `contact.html` 的训练时间和成立时间同步首页口径。设计预期：小程序“球队信息”与网页首页一致，成立时间显示 `2013 年 9 月`，训练时间显示 `每周三、周五、周日 20:00 - 22:00（具体看群）`。已通过受影响文件 `node --check`、完整 `npm run test:miniprogram-ci`、`git diff --check`，本地 `/api/team-info` 和 `/api/health` 验证通过。

2026-06-12 小程序 UI 比例规范修正（仅本地，未预览、未上传、未部署）：静态核算全部 wxss 后确立三条比例口径并落地修复。① 同页上下排布的横向滚动数据表，sticky 首列必须同宽——比赛详情逐局表 `.cell.team` 与打击/投手表首列统一为 190rpx；② 全站正文外小字底线为 20-21rpx，不允许再出现 18/19rpx（比赛发起页场地图守位说明 18→20rpx、顶部指标说明 19→21rpx 已修）；③ 高频操作触控目标不低于 60rpx——排棒次上移/下移圆钮 48→60rpx、间距 8→12rpx；低频紧凑胶囊（运动筛选、排序、来源 chip,48-54rpx）维持既有紧凑设计不放大。表格列宽配比经核算全部与 wxml 单元格数一致,封面/照片墙固定 rpx 高度在各机型按宽度等比缩放,无需改动。验证：完整 `npm run test:miniprogram-ci`、`git diff --check` 通过。

2026-06-12 账号互通闭环（网页端与后端已随 `express-knlw-042` 上线；后续小程序用户侧入口已改为登录后直接申请绑定正式档案）：同一个 `user` 可同时持有 email 与微信登录身份，关联码保留为后台/备用桥。小程序普通用户当前不复制、不输入关联码；微信登录后如果没有 verified 球员档案，直接进入绑定申请页选择自己的正式球员档案并提交核验信息。网页端 dashboard 仍保留“小程序关联码”弹窗，供管理员或特殊账号互通场景使用；`POST /api/auth/link-wechat` 仍可把微信身份挂到已有网页账号，不新建第二个试训档案。关联码入口设计保留在网页本人面板和未绑定账号操作行，不再作为小程序登录页主入口。网页脚本版本升至 `db.js?v=27` / `auth.js?v=23`。验证：新增 `test:auth-link-wechat` 路由回归并纳入 CI，本地预览实测生成码与拒绝语义，控制台无 error/warn。

部署状态：当前线上为 2026-06-12 部署验证通过的 `express-knlw-049`（绑定申请微信登录身份显示 + 核验信息口径 + 发起接龙权限门控 + DB OK），小程序微信后台开发版本为 `1.0.2`，尚未提交审核或发布正式版。2026-05-26/27 本地新增微信小程序工程；小程序请求层支持官方云托管已关联环境调用，也支持 `wx8ad6ccfa1b8f040a` 通过 `resourceAppid: wx7dce60930ee10898` / `resourceEnv: prod-d5gtkxdyu7263e95b` 跨环境访问同一套 Express API + MySQL，不另建孤岛数据源，请求头带 `X-WX-SERVICE: express-knlw`。2026-05-27 资源复用授权后，开发者工具模拟器已确认小程序首页可读取同一套云托管数据：`/auth/me`、`/events`、`/games?includeAggregate=false`、`/leaderboard` 均 200，积分榜和最近比赛正常渲染；原 `-601012 unauthorized env / 【资源复用】未获得该环境授权` blocker 已解除。编译面板剩余 `Error: timeout` 定位为默认云实例初始化与跨资源实例混用导致的开发工具运行时超时风险，已调整为只有直连本小程序云环境或显式设置 `cloudInitEnv` 时才执行默认 `wx.cloud.init()`。最新本地验证已通过 `npm run test:miniprogram-ci`、`node --check` 和 `git diff --check`。小程序首页保留 `球员阵容` 入口，与网页端同源展示 `/players` + `/leaderboard` 的正式球员、背号、守位、公开展示名/头像、积分和搜索筛选；球员详情页继续串联 `/players/:id`、`/players/:id/points` 和 `/games`，展示档案、积分拆分、最近积分流水和相关比赛摘要；个人页可维护账号昵称/头像，并允许已绑定正式球员维护球员页公开展示名称/公开头像，继续保持账号资料、真实档案和公开展示资料分离；小程序新增 `pages/hall-of-fame/hall-of-fame` 名人堂页，并在首页下方荣誉区展示最近入选，不占用首屏五个主流程卡片；小程序新增 `pages/highlights/highlights` 精彩时刻页，复用 `/highlights`、`/players`、`/games`，支持图片投稿、图片预览、B站链接复制和管理员发布/退回待审图片，首页下方展示已发布图片但不改变首屏五个主流程；比赛中心同源读取 `/games` + `/tournaments`，支持全部/慢垒/棒球和赛事/赛季筛选，老比赛无 `tournamentId` 时用 `season` 兜底匹配；比赛详情页的猎户打击/投手行和 MVP 会匹配 `/players`，用公开展示名显示并可点回球员详情。队内接龙支持小程序卡片转发、管理员 `wx.chooseLocation` 地图选点和管理员粘贴微信群接龙文本识别导入；签到为一键定位（当前权限路线调用 `wx.getLocation` 精确定位），签到成功页显示本次积分变化、当前总积分和升级提示，积分页展示个人积分拆分和最近流水。小程序已有 `pages/admin/admin` 管理台，覆盖权限识别、待审绑定审批、手动积分调整、补录训练/活动签到、名人堂授予/移出、待审精彩时刻统计和常用入口，A 级账号权限调整、网页关联码、重置密码、直接绑定/解绑、账号删除、赛事设置、比赛批量移动、批量删除、已入库比赛数据修订、GameChanger PDF / Excel 数据导入预览、星阵全站发布和审计日志明细已进入小程序管理台。比赛发起页支持从活动接龙导入已绑定球员出场名单，也允许管理员继续手动补人、删人；棒次和守位以可拖动球员块为主，picker 兜底，拖到场地图会吸附到最近守位。比赛记录为中文现场操作页，覆盖逐局、上/下半局、出局数、垒位、常见打席结果自动推进垒位/RBI/比分、打席后自动轮到下一棒、直接选择当前打者、现场阵容调整、事件日志、打线、投手、对手统计、MVP、备注和撤销；保存后详情页按 box score 回看 R/H/E、长打、守位、投手细项、对手统计和逐事件日志，MVP 和可识别球员均可回到球员档案。微信登录后未绑定正式球员档案的用户会直接进入绑定申请页；绑定申请页明确展示选中的正式球员，申请中携带目标球员 ID 和球衣号供管理员核验；个人页和绑定页都显示绑定申请审核状态。

2026-05-28 补充：小程序公共 UI 中“精彩时刻”统一改名为“精彩时刻”。`pages/highlights/highlights` 与首页底部模块使用横向流动照片墙；每张卡只做图片预览和 B站链接复制，不做小程序内外链播放器，并通过 `playerId/gameId` 提供“看球员 / 看比赛”跳转。底层接口、权限和 `highlights` 表名保持不变。
2026-05-28 补充：小程序比赛发起页重排为“基础信息 / 阵容来源 / 阵容工作台”，名单选择改成可滚动紧凑列表，阵容工作台保留拖动调棒次、点选/拖到场地图改守位和 picker 兜底；比赛详情新增“导出 PDF”，调用 `/api/games/:id/export-pdf` 返回 base64 PDF 后写入本地并用 `wx.openDocument` 打开，PDF 覆盖比分、逐局、打击/投手表和事件日志。

2026-05-28 补充：小程序接龙地点与签到定位规则。发起/编辑接龙页地点字段提供“地图选择”，用 `wx.chooseLocation` 回填名称、地址和经纬度，后端保存到 `events.metadata.location`；手动输入仍可用但来源记为 `manual`。【已被 2026-06-12 权限开通后的精确定位路线取代】签到当前调用 `wx.getLocation({ type: 'gcj02' })`，签到流水记录 `type/source/accuracy`；`app.json.requiredPrivateInfos` 只声明 `chooseLocation` + `getLocation`，不能同时声明 `getFuzzyLocation`。

2026-05-28 补充：小程序管理台球员管理补齐“注册球员池”。移动端不只保留新增/导入/合并表单，顶部先提供可搜索、可按正式/试训筛选的球员池，每个球员行提供档案、积分与签到记录、精彩时刻、合并源、试训转正式升级和正式球员绑定码生成入口，继续复用 `/players`、`/points-adjustments`、`/attendances`、`/highlights`、`/players/:id/upgrade` 和 `/bind-codes`。

2026-05-28 补充：小程序管理台“积分与签到”补齐网页后台批量补录出席语义。补录签到区提供可搜索、可全选当前结果的出席名单，管理员可一次勾选多名正式或试训球员，为训练或活动逐人调用 `/api/attendances`；未勾选时仍按上方当前球员单人补录。批量操作不绕过权限、试训升级和审计，每名球员仍产生自己的 attendance 记录。

2026-05-28 补充：小程序管理台手动积分调整补齐“关联比赛（可选）”。移动端读取 `/games?includeAggregate=false`，支持按对手、日期、赛事和场地搜索已入库比赛，选中后提交 `/points-adjustments` 时带 `gameId`；未选择时仍保持普通手动调整。该字段会进入后端积分 timeline 的 `detail.gameId`，用于积分流水点回比赛详情。

2026-05-28 补充：小程序管理台账号管理新增“生成网页关联码”、重置网页密码、直接绑定/解绑球员档案和删除账号。有 `users:app_connect_code` 权限的 A 级账号可为小程序先注册用户调用 `/admin/users/:id/app-connect-code`，生成 30 分钟有效的网页关联码并自动复制，解决“小程序先注册，网页后关联同一账号/球员档案”的路径；有 `users:password_reset` 权限者可调用 `/admin/users/:id/reset-password` 重置邮箱网页登录密码；有 `users:bind_direct` 权限者可调用 `/admin/users/:id/bind-player` / `/admin/users/:id/unbind-player` 做线下确认后的账号绑定修正；有 `destructive:delete` 权限者在输入“删除账号”确认后可调用 `DELETE /admin/users/:id` 删除账号，所有者账号和当前登录账号仍由后端拒绝。
2026-05-28 补充：小程序管理台账号管理补齐网页后台账号筛选。账号 picker 前增加身份、权限组、绑定球员位置和绑定状态四个筛选器：身份覆盖全部/管理员/A/B/C/普通队员，权限组覆盖全部/数据组/运营组/数据+运营/无权限组，位置覆盖全部/投手/捕手/内野手/外野手/未设位置，绑定状态覆盖全部绑定/已绑定球员/未绑定账号；筛选只收敛移动端候选列表，不改变后端 `requirePermission(...)` 权限控制。
2026-05-29 补充：小程序管理台账号管理继续补齐网页后台账号搜索和排序。移动端在账号 picker 前提供搜索框，覆盖昵称、邮箱、绑定球员、背号、位置、账号 ID 和权限组；排序支持最近活跃、最早注册和昵称 A-Z。2026-05-29 起 `/admin/users` 支持 `limit/offset/hasMore/nextOffset`，小程序首屏只取 50 个账号，历史账号通过“加载更多账号”追加；搜索/筛选/排序仍作用于已加载账号，不为账号管理回退到首屏全量拉取。
2026-05-28 补充：小程序管理台绑定审批补齐网页后台历史筛选。移动端审批区默认看“待审核”，也能切到“全部申请 / 已通过 / 已驳回”，读取同一个 `/admin/bind-requests?status=`；已处理记录只展示状态和审批备注，不再显示批准/驳回按钮，待办统计仍只算 pending。
2026-05-28 补充：开发者工具编译修复。微信开发者工具 Stable v2.01.2510290 / 基础库 3.16.1 在 `lazyCodeLoading: "requiredComponents"` 下会把新增深层页面 `pages/tournaments/tournament-detail/tournament-detail.wxml` 误报为不存在；小程序已移除 `lazyCodeLoading`，保持 `LazyCodeLoading: false`，并在本地 CI / preflight 中禁止重新启用该配置，优先保证开发者工具可编译。
2026-05-28 补充：小程序管理台补齐网页后台“星阵全站发布”。有 `system:settings` 权限的 A 级账号可在移动端读取 `/site-settings/players-starfield`，选择网页同名预设并调整队形、路径、年份节点、速度、呼吸、摆动、间距和随机种子，再通过 `PUT /api/site-settings/players-starfield` 发布全站配置并写 `site_setting_publish` 审计。小程序不复制网页粒子编队台，只承担可靠发布入口。
2026-05-28 补充：小程序管理台赛事设置新增比赛批量移动。数据组/有 `games:revise` 权限者可在管理台读取 `/games?includeAggregate=false`，按全部、未关联或指定赛事筛选比赛，勾选后调用 `PATCH /api/games/batch-reassign` 批量归档到目标赛事；后端同步赛事、赛季字段并写入审计。
2026-05-28 补充：小程序管理台赛事设置补齐网页后台“批量删除比赛”。数据组/有 `games:revise` 且有 `destructive:delete` 权限者可在同一比赛列表勾选多场比赛，输入“删除比赛”并二次确认后逐场调用 `DELETE /api/games/:id`；后端逐场写 `delete_game` 审计。该入口只用于高危清理，比分或球员数据错误仍优先走比赛修订页。
2026-05-28 补充：赛事容器创建、编辑和删除也必须进入审计。`/api/tournaments` 已写 `tournament_create`、`tournament_update`、`tournament_delete`，metadata 保留 after / before / changedKeys；小程序审计页可按“赛事”对象和对应动作筛选，避免赛事结构调整只留在数据库里。
2026-05-28 补充：小程序比赛详情新增数据修订入口。数据组/有 `games:revise` 权限者可进入 `pages/games/game-edit/game-edit`，修订赛事归属、日期、场地、主客队、比分、R/H/E、MVP、备注、本队打击行和投手行，保存时必须填写修订原因并写 `revise_game_data` 审计。
2026-05-28 补充：小程序比赛封面已接入同一张 `games.cover`。PDF / Excel 数据导入可按每个队列项上传可选封面图到 COS；比赛中心列表显示封面缩略图或中文运动标签兜底；比赛详情顶部显示封面；比赛修订页可粘贴 COS 图片地址或重新上传封面，保存后仍写回同一场比赛。
2026-05-28 补充：小程序比分关联链补强为顶层 `eventId` / `games.event_id`，现场记分保存时直接关联来源接龙，后端支持 `/games?eventId=...` 筛选同一接龙产生的比赛记录；球员、MVP 和逐事件日志继续以 `playerId` 关联。后端保存或修订猎户侧打击/投手行时，能按 `playerId`、姓名和 aliases 匹配球员并补写 `playerId`，避免 PDF / Excel 导入或手动修订后的比赛统计只靠姓名串联。
2026-05-28 补充：积分明细跳转语义与网页 `player-points.html` 对齐。后端 `server/points.js` 的比赛积分优先按 `playerId` 匹配球员行，流水 `detail` 保留 `gameId/tournamentId/tournamentName`，训练/活动签到保留 `eventId/eventTitle`，手动积分如关联比赛也保留 `gameId`；小程序积分页和球员详情页的最近积分流水可点进比赛详情或对应接龙详情。
2026-05-28 补充：小程序积分页补齐网页 `ranking.html` / `player-points.html` 的筛选语义。`/leaderboard` 和 `/players/:id/points` 支持 `season=YYYY`，后端按同一条 timeline 重算总分和拆分；小程序从 `/games?includeAggregate=false` 提取年份赛季 picker，筛选后球队排行、我的积分和流水口径同步变化；我的流水提供“全部/比赛/训练/活动/奖项/名人堂/调整”来源 chip，仍保留比赛和接龙跳转。
2026-05-28 补充：小程序管理台“积分与签到”补齐网页后台全员积分总览和撤销能力。管理台读取同一个 `/leaderboard` 展示全员总分、出场/表现/奖项/手动拆分并可点回球员详情，不在小程序端另算积分；管理员选中球员后会读取 `/points-adjustments?playerId=...` 和 `/attendances?playerId=...` 展示最近手动积分与签到记录；录错时可二次确认后调用 `DELETE /api/points-adjustments/:id` 或 `DELETE /api/attendances/:id` 删除，后端继续写 `points_adjust_delete` / `attendance_delete` 审计，审计日志筛选页也按中文动作显示。
2026-05-28 补充：小程序 `pages/games/game-import/game-import` 支持聊天 PDF / Excel（XLS / XLSX）。PDF 按文件逐份解析，Excel 通过 `xlsx@0.18.5` 调用同一 parser，可从一个工作簿展开多场比赛 draft；每场仍需预览后单独确认入库，避免未复核数据直接污染 `games` 表。
2026-05-28 补充：小程序活动接龙补齐活动管理维护能力。`pages/events/event-create/event-create` 复用为新建/编辑页，编辑时读取 `/events/:id` 并 `PATCH /events/:id`，可维护标题、中文 emoji 分类、时间、地点、正文、原帖链接、封面图和最多 9 张接龙配图；封面图和配图通过 `/api/upload/base64` 上传 COS（`kind = event`），封面也可粘贴 COS URL。活动列表优先展示 `events.cover`，没有封面时用第一张 `events.images` 兜底；详情展示封面 hero 和配图九宫格，配图可点开预览，原帖链接只提供复制；管理员可从详情进入编辑，也可输入“删除接龙”并二次确认后单条删除活动记录。`/api/events` 的创建、更新和删除会写 `event_create`、`event_update`、`event_delete` 审计，metadata 保留 before/after、changedKeys 和删除时的报名人数。
2026-05-28 补充：小程序管理台补齐网页后台“批量删除活动/接龙”。有 `events:write` 权限的管理员可在 `pages/admin/admin` 勾选近期接龙，输入“删除接龙”并二次确认后逐条调用 `DELETE /api/events/:id`；后端继续逐条写 `event_delete` 审计。该入口只用于清理误发或测试接龙，日常修订优先进入接龙详情编辑。
2026-05-28 补充：小程序性能约束新增两条。活动列表不得按活动逐个请求报名人数，`/api/events` 负责一次返回 `signupCount / tentativeSignupCount / activeSignupCount`，小程序仅在旧后端缺字段时降级逐条取数；公开精彩时刻统一用 `/api/highlights?public=true`（首页可加 `limit`）一次读取 `published/approved` 图片，小程序端仍过滤非公开状态，避免旧后端误回包导致待审图片显示。
2026-05-28 补充：小程序比赛数据读取性能约束。`/api/games` 支持 `limit` 和 `playerId`，首页最近比赛只请求 `/games?includeAggregate=false&limit=12`，球员详情只请求 `/games?includeAggregate=true&playerId=<playerId>`；后端按球员 id、真实名、公开名、aliases、MVP 和事件日志过滤，保留能力概览、相关比赛和精彩时刻关联，不再让小程序端默认拉全量比赛做本地筛选。
2026-05-29 补充：积分页赛季筛选必须走轻量接口。`/api/games/seasons` 只返回非汇总比赛年份，`pages/points/points` 优先用它生成赛季 picker，只有旧后端缺接口时才回退 `/games?includeAggregate=false`；不要为了赛季下拉重新拉完整比赛 JSON。
2026-05-29 补充：赛事详情和球员详情继续性能收敛。赛事详情必须调用 `/games?includeAggregate=true&tournamentId=<id>&includeSeasonFallback=true`，由后端返回该赛事比赛并兼容老数据中 `tournament_id` 为空但 `season` 相同的比赛，不能重新拉全量比赛再端上过滤；赛事内打击/投手排行榜的球员链接只能按该赛事出现的 `playerId` 读取 `/players/:id`，再对未匹配姓名读 `/players?include=all&keyword=<姓名>&limit=5&offset=0`，不能拉完整球员池。球员详情的精彩时刻必须按真实名、公开名和 aliases 分别请求 `/highlights?public=true&playerName=...&limit=24` 后合并去重，避免为单个球员详情拉全站公开高光。
2026-05-29 补充：比赛中心继续性能收敛。`pages/games/game-list` 必须先用 `/tournaments?includeGameCount=true&limit=30&offset=0` 获取首批赛事轻量计数，历史赛事通过“加载更多赛事”追加；再按当前筛选调用 `/games?includeAggregate=false&sport=...&tournamentId=...&includeSeasonFallback=true&limit=30&offset=...` 分页加载；切换运动或赛事重新请求比赛第一页，触底/按钮加载下一页。不要为了赛事卡计数或本地筛选重新拉全量赛事或全量比赛 JSON。
2026-05-29 补充：精彩时刻页继续性能收敛。`pages/highlights/highlights` 的照片墙必须走 `/highlights?includePlayer=true&limit=60&offset=...` 分页加载，普通用户追加 `public=true` 且仍在端上过滤非公开状态；投稿关联球员 picker 必须走 `/players?include=all&limit=50&offset=...` 分页加载，投稿关联比赛 picker 必须走 `/games?includeAggregate=false&limit=50&offset=...` 加载最近比赛候选，并提供“加载更多球员候选 / 加载更多比赛候选”。不要为了投稿或照片墙一次拉全量图片、球员或比赛 JSON。
2026-05-29 补充：球员阵容和积分榜继续性能收敛。`/api/players` 支持 `limit/offset/includeTotal/includePositionCount`，`pages/players/player-list` 首屏只取 40 人并提供“加载更多球员”，总人数和守位覆盖由后端轻量 count 返回；`/api/leaderboard` 支持 `limit/offset/playerIds`，首页和小程序管理台积分概览只请求 Top 3，阵容页顶部榜首只读 `/leaderboard?limit=1`，已加载球员积分只读 `/leaderboard?playerIds=<当前页id>&limit=<当前页人数>`，后端仍返回全队真实 `rank`。积分页球队排行按 50 条一页加载。管理台球员池、球员详情能力概览和名人堂等球员映射/picker 请求必须带上限；绑定申请、比赛发起、精彩时刻投稿、比赛详情、赛事详情、接龙详情管理员增补名单和站内信指定球员发送已改为小候选或 50 条分页追加。后续若正式+试训球员继续增长，优先补服务端搜索/分页 picker，不回退到无上限全量拉取。不要为了首页、管理台概览、阵容首屏或积分页首屏拉完整球员池和完整排行榜。
2026-05-29 验证补充：球员阵容页排行榜摘要按当前页 id 读取后，已通过 leaderboard route、小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序管理台积分关联比赛搜索必须走后端小候选。`/api/games` 支持 `keyword/q`，可匹配 id、主客队、日期、场地、赛季和运动；管理台初始比赛池仍按 80 条分页，手动调整积分里的“关联比赛（可选）”输入关键词时只请求 `/games?includeAggregate=false&keyword=<关键词>&limit=40&offset=0`，搜索结果只进入 `pointGameCandidateGames`，不得污染批量移动/删除比赛列表。
2026-05-29 验证补充：管理台积分关联比赛 keyword 搜索改动后，已通过 games linkage route、小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`。仍未预览、上传或部署。
2026-05-29 补充：小程序管理台账号管理也必须分页读取。`/api/admin/users` 支持 `limit/offset/hasMore/nextOffset` 且保留不传 `limit` 的旧版兼容；移动端管理台首屏只读 50 个账号，加载更多后按 id 去重合并，避免注册账号积累后进入管理台变慢。账号权限、网页关联码、重置密码、直接绑定/解绑和账号删除继续基于当前 picker 选中账号执行。
2026-05-29 补充：小程序球员详情的相关比赛也必须分页读取。移动端首屏只读 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=0`，历史比赛通过“加载更多相关比赛”追加；能力概览、近场趋势、相关比赛列表和球员精彩时刻 meta 基于已加载比赛重算，并用“已加载最近 N 场/已加载 N 场相关比赛”提示当前统计口径。不要为了单个球员详情首屏拉完整历史比赛 JSON。
2026-05-29 补充：小程序比赛详情的本场精彩时刻也必须分页读取。移动端首屏只读 `/highlights?gameId=<id>&limit=30&offset=0`，普通用户追加 `public=true`，管理员/有审核权限账号读取同一页全状态记录；历史图片通过“加载更多精彩时刻”追加并按 id 去重。不要为了单场比赛详情首屏拉完整精彩时刻 JSON，预览图集只包含已加载图片。
2026-05-29 补充：小程序比赛详情的球员链接也必须轻量读取。移动端不要为了单场猎户打击/投手行、MVP 和事件日志拉 `/players?limit=200`；先按本场已有 `playerId` 单独读 `/players/:id`，再对本场仍未匹配的猎户侧姓名读 `/players?include=all&keyword=<姓名>&limit=5&offset=0`。本场精彩时刻请求必须带 `includePlayer=true`，优先用接口返回的 `highlight.player` 生成公开身份 meta；对手打击/投手行继续不链接同名猎户球员。
2026-05-29 补充：小程序活动/接龙详情的关联比赛也必须分页读取。移动端首屏只读 `/games?includeAggregate=false&eventId=<id>&limit=20&offset=0`，历史关联比赛通过“加载更多关联比赛”追加并按 id 去重；从接龙记分、点击比赛详情和管理员导入接龙名单流程不变。不要为了单条接龙详情拉完整比赛历史 JSON。
2026-05-29 补充：小程序活动/接龙详情管理员增补名单也必须分页搜索。移动端管理员区首屏只读 `/players?include=all&limit=50&offset=0`，可按姓名/背号走 `keyword` 搜索，历史候选通过“加载更多球员”追加；已建档成员写 `playerId`，未建档成员仍只能作为手动姓名，不进入比赛统计。不要为了单条接龙详情预取 200 人球员池。
2026-05-29 补充：小程序补齐网页 `contact.html` 公共联系面。新增 `pages/contact/contact`，复用网页已公开的主场、训练时间、邮箱、小红书和负责人微信，不新增未经确认的事实；负责人头像只按负责人姓名调用 `/players?keyword=<姓名>&limit=5&offset=0` 补公开资料，不为 3 个头像拉完整球员池。页面只做复制微信/邮箱/地点、生成试训咨询内容、跳转近期接龙和官网协议，不做站内留言入库或外链播放。首页只能在下方“加入北京猎户座”区块展示该入口，不把“联系我们”塞回首屏五个主流程快捷卡片。

2026-05-29 补充：小程序精彩时刻页继续性能收敛。照片墙列表调用 `/highlights?includePlayer=true&includeGame=true&limit=60&offset=...`（普通用户追加 `public=true`），直接使用接口返回的 `highlight.player` 和 `highlight.game` 生成公开身份、比分 meta、球员详情链接和比赛详情链接；未登录游客只浏览照片墙，不再请求投稿用 `/players` 或 `/games` 候选。登录后投稿关联球员 picker 首屏改为 `/players?include=all&limit=50&offset=0`，通过“加载更多球员候选”分页追加，只有从球员详情直达投稿且首屏未命中该球员时才单独补读 `/players/:id`；投稿关联比赛 picker 仍按 `/games?includeAggregate=false&limit=50&offset=...` 分页追加。
2026-05-29 补充：小程序首页/名人堂摘要继续性能收敛。`/api/hall-of-fame` 支持 `includePlayer=true`、`limit/offset`、`hasMore/nextOffset`，名人堂页和首页荣誉区直接使用接口返回的 `entry.player`，不再额外拉 200 个球员做映射；名人堂页首屏只读 30 条，历史记录通过“加载更多名人堂”追加。`/api/highlights` 支持 `includePlayer=true`，首页精彩时刻用接口返回的 `highlight.player` 生成“看球员”链接。小程序列表头像、精彩时刻照片墙、接龙图集、比赛封面缩略图等非首屏图片必须启用 `lazy-load="{{true}}"`，首屏 hero/logo 可保持立即加载。
2026-05-29 补充：小程序绑定申请页也必须分页读取正式球员候选。`pages/bind/bind` 首屏只读 `/players?limit=50&offset=0`，搜索用后端 `keyword` 参数，历史候选通过“加载更多球员”追加并按 id 去重；页面文案使用“🔗 球员绑定 / 📝 审核状态 / ✅ 已选球员”，不要回到英文眉标。
2026-05-29 补充：小程序活动接龙创建页补齐网页后台的帖子粘贴导入。`pages/events/event-create` 提供“📕 一键导入帖子内容”，支持手动粘贴和剪贴板读取；只自动填充标题、正文、中文 emoji 分类和原帖链接，日期、地点、封面、配图仍由管理员确认后提交。不要把这做成自动抓取小红书网页或自动下载图片，小程序侧只承担安全的文本识别和表单预填。
2026-05-29 补充：小程序管理台新增球员表单也必须支持真实照片创建时上传，与网页后台添加球员对齐。移动端可粘贴 COS URL，也可选择图片上传到 `/api/upload/base64`（`kind = player`），只把返回 URL 随 `POST /api/players` 写入 `players.photo`；base64 不进入球员创建 payload，创建完成清空照片状态，避免管理台长时间保留大图数据。
2026-05-29 补充：小程序管理台批量导入球员也必须支持网页后台同款照片匹配，但实现上只传 COS URL。照片选择后按文件名匹配球员姓名，逐张上传到 COS，再把“姓名 -> URL”交给 `/api/players/import`；后端只接受短 URL，忽略 data URL，summary 返回匹配照片数，防止批量导入时把大图正文写入数据库或请求体。
2026-05-29 补充：小程序管理台赛事设置必须支持赛事封面图上传。移动端赛事容器表单保留手动粘贴 COS URL，也提供选择图片上传到 `/api/upload/base64`（`kind = tournament`）、预览和清空；提交赛事时只把返回的 COS URL 写入 `tournaments.cover`，不把 base64 写入表单状态之外或提交 payload。
2026-05-29 补充：小程序管理台接龙批量管理必须分页读取。不要为了删除误发接龙在管理台首屏无上限拉 `/events`；首屏只读 `limit=60&offset=0`，历史接龙通过“加载更多接龙”追加，移动端合并去重后再执行全选当前、清空和批量删除。
2026-05-29 补充：小程序比赛发起页接龙候选也必须分页读取。`pages/score/create/create` 首屏只读 `/events?limit=60&offset=0`，通过“加载更多接龙候选”追加历史接龙；从活动详情 `eventId` 直达记分时，如果首屏没有该接龙，只能单独补读 `/events/:id` 并合入候选，不能回退到无上限拉全量接龙。
2026-05-29 补充：小程序比赛发起页球员候选也必须分页搜索。移动端首屏只读 `/players?include=all&limit=50&offset=0`，支持姓名/背号/守位 `keyword` 搜索和“加载更多球员”；从接龙导入时，如果报名/待定成员的 `playerId` 不在当前候选页，只能按 `/players/:id` 单独补读并合入候选，不能为了接龙导入回退到 200 人或全量球员池。搜索页里勾选新球员不得清掉已经从接龙导入的隐藏 lineup。
2026-05-29 验证补充：比赛发起页接龙候选和球员候选分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序球员详情能力概览不得再读取完整球员池。`pages/players/player-detail` 只读取当前球员、积分和 `/games?includeAggregate=true&playerId=...&limit=30&offset=...` 相关比赛；AVG/OBP/SLG/OPS、ISO/BB%/K%、近场趋势和百分位轴的参考池从当前已加载比赛的猎户打击行生成，点“加载更多相关比赛”后用合并后的比赛记录重算。不要为了单个球员详情调用 `/players?include=all&limit=200`。
2026-05-29 验证补充：球员详情能力概览去球员池请求后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序管理台球员池也必须分页。`pages/admin/admin` 首屏只读 `/players?include=all&limit=50&offset=0`，通过“加载更多球员/球员候选”追加；追加后要同步注册球员池、积分/签到 picker、批量出席名单、合并源/目标、直接绑定、绑定码球员和绑定码列表里的球员显示。不要为了管理台首屏调用 `/players?include=all&limit=200`。
2026-05-29 验证补充：管理台球员池分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序首页精彩时刻必须由接口直接返回比赛摘要。`/api/highlights` 支持 `includeGame=true` 后，首页精彩时刻调用 `/highlights?public=true&includePlayer=true&includeGame=true&limit=12`，直接使用 `highlight.player` 和 `highlight.game` 生成照片墙身份、比赛比分和跳转；首页最近比赛只读 `/games?includeAggregate=false&limit=3`，不要为了精彩时刻 meta 拉 12 场比赛上下文。
2026-05-29 验证补充：首页精彩时刻 includeGame 和最近比赛 limit=3 改动后，已通过 highlights route、小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 验证补充：精彩时刻页 includeGame 和游客态跳过投稿候选请求改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序签到页接龙候选也必须分页读取。`pages/checkin/checkin` 首屏只读 `/events?limit=60&offset=0`，通过“加载更多接龙”追加历史接龙；从接龙详情 `eventId` 直达签到时，如果首屏没有该接龙，只能单独补读 `/events/:id` 并合入候选，保持当前接龙选中。签到说明必须与实际调用一致：2026-06-12 起当前路线调用 `wx.getLocation({ type: 'gcj02' })` 精确定位。
2026-05-29 验证补充：签到页接龙候选分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：赛事接口和比赛中心赛事筛选也必须分页读取。`/api/tournaments` 支持 `limit/offset/hasMore/nextOffset`，同时保留 `includeGameCount=true`；`pages/games/game-list` 首屏只读 `/tournaments?includeGameCount=true&limit=30&offset=0`，通过“加载更多赛事”追加历史赛事，比赛列表继续按 `/games?includeAggregate=false&limit=30&offset=...` 分页。
2026-05-29 验证补充：赛事接口分页和比赛中心赛事筛选分页改动后，已通过赛事接口审计测试、小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序数据导入页的赛事候选也必须分页读取。`pages/games/game-import/game-import` 首屏只读 `/tournaments?limit=30&offset=0`，默认仍自动选中第一条真实赛事，历史赛事通过“加载更多赛事候选”追加并按 id 去重；多文件 PDF / Excel 队列、封面上传和逐份入库流程不变。
2026-05-29 验证补充：数据导入页赛事候选分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序比赛发起页的赛事候选也必须分页读取。`pages/score/create/create` 的所属赛事 picker 首屏只读 `/tournaments?limit=30&offset=0`，通过“加载更多赛事候选”追加历史赛事；选择追加页里的赛事后，现场记录草稿仍必须写入对应 `tournamentId/tournamentName`。
2026-05-29 验证补充：比赛发起页赛事候选分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序比赛修订页的赛事归属候选也必须分页读取。`pages/games/game-edit/game-edit` 首屏只读 `/tournaments?limit=30&offset=0`；若当前比赛已关联赛事不在首屏，必须单独读取 `/tournaments/:id` 补入并保持选中；历史赛事通过“加载更多赛事候选”追加，保存修订时继续写回 `tournamentId/season/seasonName`。
2026-05-29 验证补充：比赛修订页赛事候选分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序管理台接龙列表也必须能维护，不只是删除。移动端在已加载分页结果内支持按标题、分类、日期、地点搜索，并按中文 emoji 分类筛选；每条接龙提供“详情 / 编辑”跳转，管理员日常应优先进入详情或编辑页修订，删除仍是误发/测试清理的高危入口。
2026-05-29 验证补充：接龙维护入口与筛选改动后，已通过小程序管理台流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序管理台赛事设置也必须分页读取。移动端首屏只读 `/tournaments?limit=30&offset=0`，通过“加载更多赛事”追加历史赛事；当前赛事表单、批量移动目标或比赛筛选所选赛事不在首屏时，只能单独补读 `/tournaments/:id` 合入候选，不能回退到无上限拉全量赛事。加载更多不得清空正在填写的赛事表单。
2026-05-29 验证补充：管理台赛事候选分页改动后，已通过小程序管理台流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序站内通知也必须分页读取。`/api/notifications` 返回 `limit/offset/hasMore/nextOffset/unreadCount`，移动端首屏只读 30 条，历史通知通过“加载更多通知”追加；未读总数必须使用后端 `unreadCount`，不能只按当前页估算。点击标记已读只更新当前通知和未读数，不应整页重拉。管理员发送站内信时，只有目标切到“指定球员”才读取 `/players?include=all&limit=50&offset=...`，并通过“加载更多球员”追加；全队、正式球员、试训队员和管理员广播不得为目标 picker 预加载球员池。
2026-05-29 验证补充：站内通知分页改动后，已通过通知路由回归、小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 补充：小程序积分页赛季筛选 fallback 也必须分页读取。正常路径优先 `/games/seasons`；旧后端缺该接口时，只能按 `/games?includeAggregate=false&limit=100&offset=...` 分页收集年份，不能回退到无上限全量比赛 JSON；分页 fallback 要有 offset 前进和页数上限，避免旧接口异常导致循环。
2026-05-29 验证补充：积分页赛季 fallback 分页改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 验证补充：联系页负责人头像与精彩时刻球员关联轻量查询改动后，已通过小程序流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
2026-05-29 验证补充：赛事封面上传和接龙分页改动后，已通过小程序管理台流程测试、preflight、完整 `npm run test:miniprogram-ci` 和 `git diff --check`；仍未预览、上传或部署。
小程序比赛流程预览稿：`orion-demo/design/miniprogram-game-flow-mockup.svg`，用于确认比赛发起、阵容排布、现场记录和赛后保存四屏方向。
预览工具状态：微信开发者工具 Stable ARM64 `2.01.2510290` 已安装在 `/Applications/wechatwebdevtools.app`；首次启动/扫码登录需要用户授权后再继续。
2026-05-28 补充：新增 `npm run test:miniprogram-ci` 作为安全的小程序本地 CI 入口，检查微信开发者工具 CLI、`miniprogram-ci`、项目配置、页面文件、定位接口声明和跨资源云托管配置，并串联小程序 preflight/request/flows/score 回归。该命令不触发 preview/upload；真正预览、上传或真机仍需用户明确批准。
2026-05-28 补充：小程序球员详情页的能力概览补齐网页 dashboard 的移动端语义，读取 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=...`，展示 AVG/OBP/SLG/OPS、核心数据、ISO/BB%/K%/BBK、基于已加载相关比赛打击行的参考百分位轴，以及近场单场 AVG / 累计 AVG 趋势；能力统计逐场记录优先、赛季汇总兜底，同一赛季/赛事已有逐场记录时不会叠加 aggregate 汇总，比赛汇总数据会标注“赛季汇总”。
2026-05-28 补充：小程序球员详情管理区补齐网页后台真实球员照片维护。管理员/展示资料权限账号可粘贴 COS URL、选择图片上传到 COS（`kind = player`）或清空照片，保存后写回同一 `players.photo`；该真实照片继续与 `players.public_avatar` 分离，公开头像仍由公开展示资料单独维护。
2026-05-28 补充：小程序球员详情管理区补齐网页后台“删除球员”高危能力。入口只给同时具备 `players:write` 和 `destructive:delete` 的账号显示，必须输入“删除球员”并二次确认后调用 `DELETE /api/players/:id`，后端写 `player_delete` 审计；重复档案优先合并，不用删除重建绕过审计。
2026-05-28 补充：小程序审计日志补齐 `player_delete` 中文展示和筛选。管理台最近审计和 `pages/admin/audit/audit` 都显示“删除球员”，并可按“球员”对象和“删除球员”动作过滤，避免高危删除在移动端露出英文 action。
2026-05-28 补充：小程序新增 `pages/tournaments/tournament-detail/tournament-detail` 对齐网页 `tournament.html`。比赛中心每个真实赛事卡有“详情”入口；赛事详情读取 `/tournaments/:id`、`/games?includeAggregate=true`，并按赛事内 `playerId` / 姓名小候选查询补球员身份，展示赛事封面/时间地点/战绩/得失分、全部场次、可排序打击排行榜和投手排行榜，比赛和已匹配球员都可点回详情；老比赛无 `tournamentId` 时继续用赛事 `season` 兜底纳入。
2026-05-28 补充：小程序比赛详情补齐网页单场精彩时刻语义。`pages/games/game-detail` 会按 `gameId` 读取 `/highlights`，普通用户只合并 `published/approved` 图片，管理员可看本场全部精彩时刻记录；页面展示精彩时刻网格、支持 `wx.previewImage` 预览，B站链接只提供复制，不在小程序内渲染视频播放器。
2026-05-28 补充：小程序球员详情补齐网页 dashboard 的球员精彩时刻区。`pages/players/player-detail` 按球员真实名、公开名和 aliases 匹配已发布/已审核精彩时刻，展示图片网格并支持预览；B站链接只复制，投稿入口跳到精彩时刻页并预选当前球员。
2026-05-28 补充：小程序公开身份展示规则集中到 `miniprogram/utils/player-identity.js`。首页、球员阵容、球员详情、积分榜、名人堂、比赛详情和赛事详情统一优先展示正式球员设置的公开名称/公开头像；管理员、本人和已绑定正式球员可清晰查看未设置公开资料的真实档案；非正式用户遇到未设置公开资料的球员时使用 `.identity-frosted-name` / `.identity-frosted-avatar` 磨砂 fallback，与网页公开身份语义保持一致。
2026-05-28 补充：比赛详情里的逐事件日志标题、日志“查看球员档案”提示、本场精彩时刻 meta，以及精彩时刻墙/球员详情精彩时刻 meta 都必须走同一套 `player-identity` 输出和 `metaClass/nameClass`，不能直接把 `gameLog.playerName` 或 `highlights.player_name` 清晰显示给非授权视角；本地 `test:miniprogram-ci` 已覆盖该防回退约束。
2026-05-28 补充：小程序比赛详情补齐网页 `game-detail.html` 的 sortable 表语义。猎户进攻、猎户投手、对手进攻、对手投手四块都提供中文指标 chip 排序，支持升降序切换，并用轻量横向指标条同步展示当前排序 Top；移动端不用 Chart.js，但保留“按指标排序 + 图表同步”的使用逻辑。猎户侧表格继续按 `playerId/name/aliases` 链接球员，对手表不链接同名猎户球员。

---

## 1. 项目定位

北京猎户座棒垒球俱乐部的“队伍门面 + 队员个人面板 + 比赛数据中心”。

核心人群：

- 路人 / 招新：了解球队故事、阵容、活动、入队方式。
- 现役队员：登录后看个人数据、积分、比赛记录和高光。
- 管理员：维护球员、比赛、赛事、活动、名人堂；上传 GameChanger PDF / Excel；修订数据；管理积分和签到。

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
| `tournament.html` | 单赛事 | 赛事信息、全部场次、球员排行榜 | 排行榜需要可排序；头像/姓名走公开身份或磨砂化；头像必须走统一圆形 mask，避免光圈和照片边缘错位 |
| `game-detail.html` | 单场 | 比分、逐局、累计得分线图、双方对比、4 张 batting/pitching 表、MVP、高光 | 列头排序 + `tfoot` 合计不动是硬契约；MVP、表格姓名、高光球员名和图表标签不得向非正式用户清晰暴露真实姓名/真照；公开头像不得出现半圆裁切或光圈偏移 |
| `ranking.html` | 积分榜 | Top 3 领奖台、完整排行表、赛季筛选、跳积分明细 | 移动端隐藏部分拆解列；头像/姓名走公开身份或磨砂化；Top 3 和列表头像都使用统一圆形 mask |
| `player-points.html` | 积分明细 | 头像、排名、总分、4 类构成、时间线筛选 | game 类时间线应能跳比赛/赛事；头像/姓名走公开身份或磨砂化 |
| `admin.html` | 后台 | CRUD、导入、确认、修订、合并、积分、签到、上传 | 更像操作面板，不要弱化“确认/修订/留痕” |
| `hall-of-fame.html` | 名人堂 | 入选球员或仪式感空状态 | 赛季奖项由 admin 录入；头像/姓名走公开身份或磨砂化 |
| `events.html` | 活动 | 占位待补 | 后续需重新设计活动形态 |
| `contact.html` | 遗留页 | 被首页 `#contact` 取代 | 可清理，但直接访问仍要兜底 |
| `legal.html` | 协议与个人信息保护规则 | 用户协议、隐私政策、个人信息处理规则、儿童规则、权利行使、法律依据 | 作为注册入口协议链接的完整公开页，需随注册/数据处理功能变化同步更新 |
| `miniprogram/` | 微信小程序 | 首页、微信登录、活动接龙发起/报名、一键签到、绑定申请、管理台、积分榜、名人堂、精彩时刻、比赛列表/详情、赛事详情、比赛发起、可视化阵容排布、中文实时比赛记录、比赛记录 PDF 导出 | 必须沿用 Navy / Blue / Gold 和真实队徽/月球视觉；所有业务写入同一套 API/MySQL；小程序只提交行为流水，不在端上重算积分总分；管理员模块尽量对齐网页后台，删除/改权/修订等高风险操作必须权限隔离、确认口令、二次确认和审计留痕 |

Footer 合规与审美要求：

- 域名：`猎户座棒垒球.cn`。
- ICP 备案号：`京ICP备2026027592号-1`。
- 首页 footer 悬挂协议与个人信息保护规则链接：用户协议、隐私政策、个人信息处理规则、未成年人规则、个人信息权利。
- 首页 footer 悬挂违法和不良信息举报入口：中央网信办举报中心 `https://www.12377.cn/` 和公安部网络违法犯罪举报网站 `https://cyberpolice.mps.gov.cn/`；链接前使用轻量本地 CSS 标识 `12377` / `公安`，不引入外部徽标图片，避免额外请求和授权风险。
- 首页 footer 悬挂 `Edited by 江山` 和 ICP 备案号，meta 信息保留版权 / 署名 / 备案号，备案号链接到工信部备案官网 `https://beian.miit.gov.cn/`。
- 其他子页按页面气质选择简洁 footer，目前只保留品牌 + 版权，不逐页堆叠备案号和署名。
- `players.html?wallpaper=1` 是动态壁纸源，保持隐藏 footer；普通 `players.html` 只显示简洁 footer。

域名 SEO 基线：

- 首选公开域名为 `https://xn--4gsr8nf4ck7ihxnemb.cn/`，对应中文域名 `猎户座棒垒球.cn`。
- 首页、球员、比赛、积分榜、名人堂、活动、联系、规则页设置 `index,follow` 和 canonical；`dashboard.html`、`game-detail.html`、`tournament.html`、`player-points.html`、`admin.html` 等动态/参数/私密页面设置 noindex。
- 根目录提供 `robots.txt` 与 `sitemap.xml`；首页提供 SportsTeam / WebSite JSON-LD。后续新增公开页面必须同步 sitemap 和 canonical。

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
| `.identity-avatar-wrap` / `.podium-photo-clip` / `.pp-photo-wrap` | 公开身份头像容器 | 头像、磨砂层、光圈必须共用圆形 mask 和稳定宽高；动画只改 opacity / transform，不动态改变 blur / filter 半径 |
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
- `games`：home/away、linescore、batting/pitching、oppBatting/oppPitching、MVP；小程序现场记分会保存 `event_id` 和 `mvp_player_id`，猎户侧 batting/pitching 行优先保存 `playerId`，后端也会在 PDF / Excel 导入或手动修订时按 `playerId`、姓名和 aliases 归一化补写 `playerId`，并在 `games.metadata` 保存 `source = mini_scorebook`、`gameId`、接龙活动来源、`relatedEventId`、`relatedTournamentId`、出场名单球员 id、MVP 球员 id 和保存端信息，用于从比分直接回溯到接龙、场次、赛事和人员；GameChanger PDF / Excel 导入会保存 `source = gamechanger_pdf` / `gamechanger_excel`、原文件名和解析 warnings，确认入库后仍进入同一张比赛表。
- `games.cover`：小程序 PDF / Excel 数据导入可按每个队列项上传可选比赛封面图到 COS，返回 URL 随确认入库写入 `cover`；比赛中心列表展示封面缩略图，比赛详情展示封面 hero，比赛修订页可粘贴 COS 地址或重新上传；没有封面时不阻塞比分/统计入库。
- `tournaments`、`events`、`hall_of_fame`、`highlights`。
- `bind_codes`、`attendances`、`points_adjustments`。
- `site_settings`：当前用于 `players-starfield` 全站视觉配置，只保存视觉参数，不改业务数据。
- `admin_audit_logs`：后台修订留痕。
- `user_notifications`：站内信 / 绑定邀请通知。
- `player_bind_requests`：用户申请绑定正式球员档案；admin 审批后才自动绑定。
- `event_signups`：活动接龙报名；小程序/网页共享，用户可报名、待定或取消。管理员粘贴微信群接龙导入时，已匹配球员写 `player_id`，未匹配姓名写 `manual_name`，来源写 `source = wechat_group_paste`。
- `events.metadata.location`：小程序接龙发起/编辑页通过 `wx.chooseLocation` 选点时保存名称、地址、经纬度和来源；手动输入地点时来源为 `manual`。
- `attendances.metadata`：小程序一键签到的来源与定位信息，当前调用 `wx.getLocation({ type: 'gcj02' })`，后端保存 `type/source/accuracy`（旧 fuzzy/fallback 字段仍兼容）并防重复写 `attendances`，积分系统继续按 attendance 聚合。
- `events.cover/images/source_link`：小程序活动接龙新建/编辑页可维护封面图、最多 9 张接龙配图和原帖链接；封面图/配图统一上传 COS，封面也可粘贴 COS URL，列表优先展示封面、无封面时用第一张配图兜底，详情展示封面 hero 和配图九宫格预览；原帖链接在小程序中以复制链接处理，不做不可靠外链播放。

小程序设计语义：

- 小程序首屏不是营销页，而是队员操作台；首页快捷入口收敛为五个主流程：`队内接龙`（训练/比赛/活动报名、名单、发起接龙）、`接龙签到`、`球员阵容`、`比赛中心`（历史比赛、赛事/赛季筛选和数据回看）、`开始记分`（排棒次、守位、现场记录）。不要把“创建接龙”和“发起比赛”再作为并列首页卡片重复展示。快捷入口和比赛记录按钮组使用稳定 flex 两列/换行布局，避免 iPad 尺寸中按钮卡片 shrink 成窄块导致中文逐字换行；首页 section 右侧的 `全部 / 详情` 是文字链接，必须固定在右侧并与标题组垂直对齐，不能退回小程序默认按钮宽度；首页 `积分榜 Top 3` 与积分页球队排行都要能点击球员进入球员详情，保持和网页排行榜一致；活动列表标题和操作按钮要按窄屏优先排版，按钮不要挤出右边界；发起活动的分类标签使用预设选择，不做手动输入框。
- 小程序所有可见分类/项目标签必须是中文+emoji，统一通过 `miniprogram/utils/labels.js` 显示，例如 `🥎 慢垒`、`⚾ 棒球`、`🏋️ 训练`、`📅 活动`；UI 不直接展示 `softball`、`baseball`、`Training`、`Event` 等原始枚举。数据层枚举值仍保留原值，避免破坏网页/API 兼容。
- 小程序比分必须是可追溯的数据中心：打击/投手行优先保存 `playerId`，保存 payload 顶层写 `eventId` 并落库到 `games.event_id`，比赛记录 `metadata` 保存 `gameId`、接龙活动来源、`relatedEventId`、`relatedTournamentId` 和 `mvpPlayerId`，并把 MVP 同步到 `games.mvp_player_id`；逐事件日志中涉及猎户球员的记录要保存 `playerId/playerName/actionKey/actionType`，不能只留中文描述。现场垒位在能识别时保存跑者 `playerId/name`，1B/2B/3B/HR/BB 带回的分数要在日志里保存 `scoredRunners`，并同步球员 R / 打者 RBI。比赛详情里球员名、MVP、有球员关联的事件日志和得分跑者都要能回到球员语义，“来自接龙”可点回活动详情；活动详情也必须能反向列出同一 `eventId` 的比赛比分，并让有比赛记录权限的管理员/数据组从该接龙直接进入记分页。后端支持 `/games?eventId=...` 按来源接龙筛选。球员详情要从 `/games?includeAggregate=true&playerId=<id>&limit=30&offset=...` 汇总出能力概览（AVG/OBP/SLG/OPS、ISO/BB%/K%、已加载比赛行参考百分位轴与近场单场/累计 AVG 趋势），统计口径必须逐场优先、赛季汇总兜底，避免同一赛季/赛事重复计数，并和网页 dashboard 的数据语义保持一致。
- 球员详情页也是移动端轻量档案管理入口：有 `players:write` 权限者可编辑姓名、背号、守位、左右打投、入队年份、口号、荣誉标签和别名，并可升级无同名冲突的试训球员；同时具备 `destructive:delete` 时才可输入“删除球员”并二次确认后删除误建档案，后端必须写 `player_delete` 审计，重复档案优先合并。`players:display_write` 权限者至少可维护口号、公开展示名和公开头像。公开头像可以在小程序里选择图片并通过 `/api/upload/base64` 上传到 COS，再写入 `/players/:id/public-profile`；真实档案和公开展示资料必须继续分离。别名用于统计归并，不能批量改写历史比赛 JSON 姓名。
- 队内接龙是小程序自己的结构，不是自动读取微信群聊天：管理员在小程序发起训练 / 比赛 / 活动接龙，再把小程序卡片转发到微信群；队员点卡片进入接龙详情报名/待定/取消，签到也必须选择同一条接龙后再写 `attendances`。兼容微信群原生接龙时，只做“管理员复制文本 -> 小程序接龙详情点粘贴并识别 -> 解析导入名单”，不能设计成自动抓群聊消息内容。
- 接龙显示活动信息、报名状态和名单；报名/待定/取消写 `event_signups`，普通队员的报名按钮不能被管理员权限条件包裹。管理员粘贴导入要识别编号姓名、`待定`、`请假/取消` 和备注，按姓名/别名匹配正式球员，未匹配的姓名只作为手动名单项展示和供管理员后续处理，不直接生成统计球员。管理员还必须能单个手动增补已建档球员或手动姓名，并把名单状态修正为报名、待定或取消；已建档球员写 `player_id`，手动姓名只保留 `manual_name`。管理员可编辑同一条接龙的标题、分类、时间地点、正文、封面、配图和原帖链接；删除接龙必须输入“删除接龙”并二次确认，管理台也可勾选多条近期接龙批量删除，报名名单会随接龙删除，已产生的签到/积分流水不会被批量改写；创建、更新、删除接龙都必须进入 `admin_audit_logs`。签到页不再让用户先选“训练/活动类型”，而是先选接龙；训练接龙按 `training` 计入试训次数，比赛/活动接龙按 `event` 记到场，比赛出场和技术统计仍由比赛记录保存后计算。
- 签到不是静默提交：成功或重复签到后，页面要明确展示本次是否加分、当前总积分、试训训练次数进度和自动升级/绑定审批提示，并能跳转到“我的积分”查看流水。
- 小程序微信登录页必须保留官网协议入口，但不要做成一个重按钮；采用蓝色下划线 `navigator` 超链接文案“用户协议、隐私政策和个人信息处理规则”，进入 `pages/legal/legal` 后由 `web-view` 打开 `https://www.猎户座棒垒球.cn/legal.html`。正式环境可用前需在微信后台把 `www.猎户座棒垒球.cn` 配为业务域名。
- 小程序登录合规确认与网页保持一致：必须分别勾选用户协议/隐私政策/个人信息处理规则、必要个人信息处理单独同意、14 周岁或监护人确认；`/api/auth/wx-login` 缺失任一确认时返回 `legal_consent_required`，新用户 audit metadata 记录 `legalConsent`、协议版本和确认时间。
- 积分页必须能从冷启动直接进入：先刷新登录身份，再展示总分、基础/表现/荣誉/调整拆分、最近积分流水、球队排行和服务器积分规则；规则按“出场积分 / 比赛表现 / 投手防守 / 荣誉”中文分组展示，前端不另写积分公式，也不要出现 `Points` 这类英文眉标。比赛类流水点进比赛详情，训练/活动签到流水点回对应接龙详情；球员详情页的最近积分流水保持同一跳转语义。
- 名人堂必须复用 `/hall-of-fame?includePlayer=true&limit=30&offset=...`，展示入选年份、入选理由、公开展示名/头像，并能点回球员详情；历史入选记录通过“加载更多名人堂”分页追加。首页可展示荣誉摘要，但不要改变首屏五个主流程入口。
- 精彩时刻在小程序里按流动照片墙处理：复用 `/highlights`，投稿优先用 `wx.chooseMedia` 选图并调用 `/api/upload/base64` 上传到 COS，后端返回 `tcb.qcloud.la` 图片 URL 写入 `cover`；仍保留手动粘贴已上传图片地址兜底。`url` 只作为可选 B站链接保存；小程序内展示图片预览和复制B站链接，不做视频播放器，也不硬编码不可控外链跳转。普通用户只看 `published/approved` 图片，管理员/运营组可在 `pages/highlights/highlights` 发布或退回待审图片、下架已发布图片、重新发布已下架图片，也可删除记录；删除只移除 `highlights` 记录，不自动删除 COS 原图。首页只展示已发布精彩时刻摘要，并通过“看球员 / 看比赛”跳转到关联人员或比赛。
- 比赛记录分两层：已保存比赛走 `games/tournaments` 数据，比赛中心要能按全部/慢垒/棒球和赛事/赛季筛选；比赛中心顶部 `发起` 是紧凑右侧操作，项目筛选使用页面专属小胶囊 chip，不要做撑满整行的 full-width 三段控件，也不要复用通用 `filter/filter-btn` 类名，避免在 iPad/宽屏下拉成不协调的大按钮；比赛卡片优先展示 `games.cover` 缩略图，没有封面时用中文运动标签兜底；赛事卡优先按 `tournamentId` 匹配，老数据用 `season` 兜底；发起页先确定出场名单来源，可以从活动接龙导入报名/待定且已绑定球员档案的队员，也可以由管理员手动添加；从活动详情点“从接龙记分”进入时，记分页要自动切到接龙来源、预选该接龙、回填接龙日期并载入名单；从微信群粘贴导入但未匹配档案的成员只提示“需手动添加”，不能自动写成统计球员；日期用小程序日期选择器，默认当天；不要预先设置局数，比赛打几局由现场记录过程决定。之后再排棒次/守位并显示场地图预览，重复守位需要先处理。棒次/守位交互要优先使用可拖动球员块：上下拖动调整棒次，选中或拖到场上位置改守位；位置 picker 只是兜底。现场记录页以中文按钮记录逐局、上/下半局、出局数、垒位、猎户打线、投手 IP/H/R/ER/BB/SO/HR、对手统计、MVP 和备注，MVP 从出场名单选择并保存 `playerId`，支持直接选择当前打者，打席结果后自动轮到下一棒，1B/2B/3B/HR/BB 按常规跑垒自动推进垒位并联动比分/RBI，现场记录从第 1 局开始并随“下一局 / 换半局”动态扩展逐局比分，保存时根据实际 linescore 长度写 `innings`；现场阵容调整可记录换守位、换人、代打/代跑并写入事件日志，手动得分、手动打点、垒位开关和撤销用于特殊规则或赛后修正，保存时写 `/api/games`，权限仍由后端控制。
- 类 GameChanger 的现场细节不要只停留在汇总表：小程序记录页维护 `gameLog`，每条事件带 `gameId`、局次半局、当前进攻队、出局数、垒位、当时比分和可识别得分跑者；涉及猎户打击、投手或阵容调整的事件还必须带 `playerId/playerName/actionKey/actionType`。后端存入 `games.game_log`，比赛详情页可回看中文事件日志并从关联事件点进球员详情。
- 个人页报名记录必须面向队员可读：展示活动标题、时间地点、备注与 `已报名 / 待定 / 已取消`，不要暴露原始 eventId 或英文状态作为主信息。
- 个人页承担网页 dashboard 的轻量资料维护职责：账号昵称/头像调用 `/auth/me` 保存；账号头像和正式球员公开头像都应支持 `wx.chooseMedia` 选图并通过 `/api/upload/base64` 上传到 COS，手动粘贴图片地址只是兜底；已绑定正式球员可调用 `/players/:id/public-profile` 维护球员页公开展示名称/公开头像。账号资料、真实球员档案和公开展示资料保持分离；试训队员公开展示跟随账号资料。
- 正式球员绑定必须由用户先选择目标档案，并在页面中明确展示已选球员；候选正式球员通过 `/players?limit=50&offset=...&keyword=...` 分页搜索，不为绑定申请一次拉完整球员池；申请写入 `player_bind_requests`，携带目标球员 ID、球衣号、昵称/联系方式/说明，等待管理员审批。
- 小程序绑定不是“提交后消失”的单向表单：个人页和绑定页都要显示 `待审核 / 已通过 / 已驳回`，已通过后减少重复提交，已驳回后允许用户带补充说明重新提交。
- 小程序管理台是移动端高频操作面板，不是网页 `admin.html` 的完整复刻：管理员/数据组/运营组可从首页或个人面板进入，管理台显示权限标签和待办数据；可处理绑定审批、主动发送绑定码站内信邀请、绑定码中心、A 级账号权限调整、网页关联码生成、重置网页密码、直接绑定/解绑球员档案、删除账号、星阵全站发布、接龙批量删除、赛事创建/编辑/删除、比赛批量移动、批量删除比赛、已入库比赛数据修订/删除、GameChanger PDF / Excel 数据导入预览、手动积分调整、删除错误手动积分、补录训练/活动签到、删除错误签到、名人堂授予/移出，展示最近审计摘要，统计待审精彩时刻，并跳转发起接龙、新建比赛、数据导入、球员阵容、球员详情高危删除、名人堂、精彩时刻、站内通知和审计日志。有 `system:settings` 权限者可读取 `/site-settings/players-starfield`，选择网页同名预设并微调核心参数后发布到全站，后端写 `site_setting_publish` 审计；有 `events:write` 权限者可读取 `/events` 的近期接龙列表，勾选后输入“删除接龙”并二次确认，逐条调用 `DELETE /api/events/:id`，后端写 `event_delete` 审计；有 `bind_codes:manage` 权限者可调用 `/bind-codes` 查看/搜索已有绑定码，按正式球员调用 `POST /api/bind-codes` 生成并复制备用绑定码，也可复制或作废已有绑定码；给已注册用户的一键绑定仍优先用 `/admin/bind-invitations` 发送站内信邀请。A 级账号权限调整读取 `/admin/users`，保存时调用 `/admin/users/:id/admin-level`，移动端只做普通/C/B/A 与数据组/运营组设置；网页关联码调用 `/admin/users/:id/app-connect-code`，只给有 `users:app_connect_code` 权限的 A 级账号显示；重置密码调用 `/admin/users/:id/reset-password`，只影响邮箱网页登录身份；直接绑定调用 `/admin/users/:id/bind-player` / `/admin/users/:id/unbind-player`，用于管理员线下确认身份后的修正，常规路径仍优先走绑定申请审批；账号删除调用 `DELETE /admin/users/:id`，小程序端必须输入“删除账号”确认，后端继续禁止删除 `admin@orion.cn` 和当前登录账号；赛事设置读取 `/tournaments`，保存时调用 `POST /api/tournaments` 或 `PATCH /api/tournaments/:id`，删除既有赛事容器需输入“删除赛事”确认并调用 `DELETE /api/tournaments/:id`；有 `games:revise` 权限者可读取 `/games?includeAggregate=false`，按全部/未关联或指定赛事筛选比赛，勾选后调用 `PATCH /api/games/batch-reassign` 批量移动到目标赛事，后端同步 `tournament_id / season / season_name` 并写 `batch_reassign_games` 审计；同时有 `destructive:delete` 权限者可输入“删除比赛”并二次确认后逐场调用 `DELETE /api/games/:id` 批量删除选中比赛，后端逐场写 `delete_game` 审计；有 `games:draft` 且有 `games:confirm` 权限者可在 `pages/games/game-import/game-import` 选择赛事和一份或多份聊天 PDF / Excel（XLS / XLSX），调用 `/api/games/import-gamechanger` 做解析预览，可选封面图通过 `/api/upload/base64` 上传 COS 后随对应队列项入库，再逐份/逐场调用 `/api/games` 确认入库，多文件队列或 Excel 多场 draft 未完成时留在导入页继续下一项；比赛详情页向 `games:revise` 用户显示修订入口，`pages/games/game-edit/game-edit` 可修订赛事归属、日期、封面图、场地、主客队、比分、R/H/E、MVP、备注、本队打击行和投手行，封面图可粘贴 COS 图片地址或重新上传到 COS，MVP 可从本队行选择并保留 `mvpPlayerId`，保存必须填写修订原因并调用 `PATCH /api/games/:id`，后端写 `revise_game_data` 审计；有 `destructive:delete` 权限者可在同一修订页输入“删除比赛”并二次确认后调用 `DELETE /api/games/:id`，后端写 `delete_game` 审计。比赛删除是高危末端操作；比分、球员行、MVP 或封面错误优先修订，不应靠删除重建绕过审计。积分与签到区按选中球员读取 `/points-adjustments?playerId=...` 和 `/attendances?playerId=...`，可查看最近手动积分/签到记录并在二次确认后删除录错记录，后端写 `points_adjust_delete` / `attendance_delete` 审计。`pages/admin/audit/audit` 读取 `/admin/audit-logs`，支持 `limit/offset/targetType/action/q` 分页筛选、查看和复制 metadata 明细，能用中文显示接龙创建/更新/删除、比赛删除、球员删除、删除积分调整和删除签到审计；数据组只有 `audit:game_read` 时只看比赛审计，A/B 管理员有 `audit:read` 时可看全站审计。站内通知页普通队员看未读/已读列表；有 `notifications:write` 权限的管理员可按全队、正式球员、试训队员、管理员或指定球员发送站内信，后端写 `user_notifications` 并记录 audit。
- 小程序管理台的球员合并入口复用网页端语义和后端 `POST /api/players/merge`：只给有 `players:write` 权限的管理员显示，管理员选择源球员和目标球员后确认合并；账号绑定、签到、积分调整、绑定码、名人堂和精彩时刻等关联数据迁移到目标档案，源档案删除；源姓名和 aliases 可保留到目标 aliases，用于旧比赛、PDF / Excel 导入和现场记分的历史统计归并，但不得改写 `games` 原始 JSON 姓名。
- 小程序管理台的新增球员入口复用网页端语义和后端 `POST /api/players`：只给有 `players:write` 权限的管理员显示，管理员可创建试训队员或正式球员，并填写姓名、背号、守位、左右打投、入队年份、口号、荣誉标签和 aliases；创建后进入球员详情继续维护公开展示资料、别名和后续升级/合并。移动端新建试训球员不得绕过训练满次数与绑定审批语义，除非管理员明确选择“正式球员”。
- 小程序管理台的球员批量导入复用网页后台语义和后端 `POST /api/players/import`：只给有 `players:write` 权限的管理员显示，管理员可粘贴每行一个球员的名单（`姓名,球衣号,守位`，可选打席、投球、入队年份、别名），选择导入为试训或正式球员；后端按姓名和 aliases 跳过已有档案与本次重复项，一次最多 100 人，并写 `player_batch_import` 审计。批量导入不绕过试训升级/正式绑定语义，除非管理员明确选择“正式球员”。
- 小程序性能边界：首页、活动列表、活动/接龙详情、精彩时刻、比赛中心、比赛详情、比赛发起页、数据导入页、名人堂页、绑定申请页、联系页、球员详情和管理台不得为了摘要/计数/候选项拉完整大表。`/api/events` 支持 `limit/offset/hasMore/nextOffset`，首页只取最近 1 条接龙，活动列表按页加载，比赛发起页接龙候选也按页加载；从活动详情 `eventId` 直达记分只允许单独补读 `/events/:id`。比赛发起页球员候选通过 `/players?include=all&limit=50&offset=...&keyword=...` 分页搜索，接龙导入只对当前页缺失的已绑定 `playerId` 单独读取 `/players/:id`。`/api/tournaments` 支持 `limit/offset/hasMore/nextOffset`，比赛中心赛事筛选、数据导入页赛事候选和比赛发起页所属赛事候选首屏只取 30 条并通过“加载更多赛事/赛事候选”追加。`/api/highlights` 支持 `public=true`、`limit/offset`、`includePlayer=true`、`includeGame=true` 和 `includeTotal=true`，首页和精彩时刻照片墙直接用接口返回的关联球员/比赛摘要，不再额外拉球员池或 12 场比赛上下文；精彩时刻页未登录游客不得请求投稿用球员/比赛候选，登录后才按 `/players?include=all&limit=50&offset=...` 与 `/games?includeAggregate=false&limit=50&offset=...` 分页加载候选；首页最近比赛只读 `/games?includeAggregate=false&limit=3`。比赛详情按 `gameId` 分页读取本场精彩时刻并用 `includePlayer=true` 补关联球员；单场球员链接只能按本场 `playerId` 与姓名小候选查询，不得拉完整球员池。`/api/hall-of-fame` 支持 `includePlayer=true`、`limit/offset` 和 `hasMore/nextOffset`，首页荣誉区直接用 `entry.player`，名人堂页首屏只取 30 条并通过“加载更多名人堂”追加；`/api/games` 支持 `limit/offset/playerId/tournamentId/eventId/sport/keyword`，比赛中心、管理台比赛候选、球员详情相关比赛和活动详情关联比赛按页加载，管理台积分关联比赛搜索只取 `keyword + limit=40` 小候选并与批量移动列表隔离；球员详情能力概览的参考池从当前已加载相关比赛打击行生成，不调用 `/players?include=all&limit=200`；球员阵容页按 `/players?limit=40&offset=...&includeTotal=true&includePositionCount=true` 分页加载，积分摘要只读 `/leaderboard?limit=1` 和 `/leaderboard?playerIds=<当前页id>&limit=<当前页人数>`；管理台球员池调用 `/players?include=all&limit=50&offset=...` 分页加载，追加后同步积分/签到、合并、直接绑定和绑定码候选；接龙详情管理员增补名单通过 `/players?include=all&limit=50&offset=...&keyword=...` 分页搜索；绑定申请页通过 `/players?limit=50&offset=...&keyword=...` 分页搜索正式球员候选；联系页负责人头像只按负责人姓名查询 `/players?keyword=<姓名>&limit=5&offset=0`；积分页赛季下拉优先用 `/games/seasons`，只有旧后端缺接口时才回退全量比赛。非首屏图片列表必须启用 `lazy-load`。
- 小程序公开视觉与 Web 保持同一队伍品牌：深海军蓝背景、香槟金强调、队徽、月球地平线；不要改成普通表单工具。
- 小程序登录走 `wx.login`，后端换 openid 并返回 session token；端上用 Bearer token 调 API，保持和 Web cookie session 同源鉴权。
- 队员和管理员核心流程有回归测试保护：`npm run test:events-audit` 验证 `/api/events` 创建、编辑、删除接龙时写 `event_create/event_update/event_delete` 审计；`npm run test:tournaments-audit` 验证 `/api/tournaments` 创建、编辑、删除赛事容器时写 `tournament_create/tournament_update/tournament_delete` 审计；`npm run test:games-linkage` 验证 `/api/games` 保存小程序比赛时把来源接龙写入 `games.event_id`、保留球员/MVP/日志关联、支持 `/games?eventId=...` 筛选，并覆盖删除比赛写 `delete_game` 审计和积分流水保留 `gameId/tournamentId/eventId` 关联；`npm run test:players-import` 验证 `/api/players/import` 批量导入、重复跳过和 `player_batch_import` 审计；`npm run test:gamechanger-server` 验证后端 PDF / Excel 导入能用样例生成同源比赛 draft；`npm run test:miniprogram-ci` 作为小程序本地 CI 总入口，先检查微信开发者工具 CLI / miniprogram-ci / 项目配置 / 页面文件 / 云托管配置，再串联 preflight、request、events-audit、tournaments-audit、games-linkage、players-import、flows、score，且不上传不预览；`npm run test:miniprogram-request` 覆盖云托管跨环境/已关联环境/HTTP fallback 请求层和 `-601012` 授权错误提示；`npm run test:miniprogram-preflight` 保护跨资源模式下 `app.js` 不默认初始化 `wx.cloud`；`npm run test:miniprogram-flows` 必须覆盖活动接龙、接龙封面上传 COS、接龙编辑、原帖链接复制、活动详情关联比赛列表、从接龙直达记分、单条接龙删除确认、管理台批量删除接龙、接龙审计标签、管理员粘贴微信群接龙识别、管理员手动增补接龙名单和修改报名状态、比赛接龙/训练接龙签到积分反馈、积分页冷启动、服务器积分规则中文展示、积分流水点回比赛/接龙、球员阵容页同源读取/搜索筛选/公开展示资料、球员详情管理员编辑档案/别名/荣誉/公开展示资料、公开头像上传 COS、球员能力概览核心/进阶指标和近场趋势、升级试训球员、删除球员确认、名人堂展示和点回球员详情、精彩时刻公开浏览/选图上传 COS/投稿/B站链接复制/管理员发布、个人页账号资料和正式球员公开展示资料保存、站内通知未读/已读和管理员定向发送、球员详情的积分/比赛关联、比赛中心赛事/赛季筛选和封面图兜底、GameChanger PDF / Excel 选择赛事/多文件队列/封面图上传 COS/解析预览/逐份或逐场确认入库、比赛详情封面展示、打线/投手/MVP 和事件日志点回球员详情、比赛详情修订入口、比赛修订页原因必填与比分/RHE/打击/投手行/MVP/封面关联保存、比赛删除确认、绑定审核状态、小程序管理台绑定审批/绑定邀请/绑定码中心生成复制作废/星阵全站发布/新增球员/球员批量导入/球员合并/网页关联码/重置密码/直接绑定解绑/账号删除/账号权限调整/赛事创建编辑删除/批量删除比赛/手动调分/删除错误手动积分/补录签到/删除错误签到/名人堂授予/最近审计摘要、审计日志筛选/加载更多/metadata 详情、比赛发起从接龙导入出场名单、管理员手动补人、拖拽调棒次和拖到场地图吸附守位；`npm run test:miniprogram-score` 保护比赛现场记录、直接选择当前打者、自动轮棒、自动跑垒/RBI/比分、跑者得分归属、现场阵容调整、MVP `playerId`、垒位/半局、逐事件日志的球员/比赛/接龙关联和保存 payload。

注册与绑定申请语义：

- 网页和小程序注册都应先让用户选择 `试训队员` 或 `绑定正式球员档案`；小程序微信首次登录默认先创建 `casual` 试训档案。
- 默认展示低复杂度字段：昵称、邮箱、密码、确认密码；没有邮箱验证时不要把注册入口做重。
- 试训注册时，`user.display_name` 与临时 `casual player.name` 都先使用昵称；后续可由管理员调整。
- 试训升级规则：训练签到累计满 8 次自动升级为 `verified`；如果与已有正式球员同名，则不自动升级，提示走正式球员绑定审批。
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
- 公开头像组件必须先固定容器尺寸，再对真实照片/公开头像做 cover；不要在子图上叠加额外外边距、独立圆角或不等比例缩放，否则移动端会出现半圆裁切、光圈偏移或磨砂层错位。
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
11. 积分公式权威源是 `DB.POINTS_RULES` / 后端 points 语义；网页展示卡、小程序积分规则卡和 admin 快捷按钮都要同步。
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
- 2026-05-21 `express-knlw-036-20260521142313` 修复跨页面头像边缘：`.identity-avatar-wrap`、`.podium-photo-clip`、`.pp-photo-wrap` 统一圆形 mask、hidden overflow 和固定尺寸；积分榜列表、Top 3、比赛详情 MVP、赛事球员卡不得再用页面局部样式覆盖成半圆裁切。
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
- C 数据组：与运营组同级，负责比赛数据和统计流程：上传 GameChanger PDF / Excel、提交解析结果到待确认、确认入库、修订已入库比赛数据、修改 MVP / Game Log / 比赛统计、处理姓名匹配和解析警告、查看比赛相关修订记录。
- C 运营组：与数据组同级，负责内容和展示流程：新增/编辑活动、赛事基础信息、上传封面/活动图片/精彩时刻封面、审核/发布/下架精彩时刻、编辑球员展示性资料（头像、标语、展示 title）。
- A 包含全部；B 自动包含数据组 + 运营组；C 可单独授予 `data`、`ops` 或两者。前端隐藏无权限入口，但真正限制必须由后端 `requirePermission(...)` 控制。A 不应被其他管理员降级或删除。
- 账户管理页用户列表筛选分为四个不重复维度：`身份` 筛全部/管理员/A/B/C/普通，`权限组` 筛数据组/运营组/数据+运营，`球员位置` 筛投手/捕手/内野手/外野手/未设位置，`绑定状态` 筛已绑定球员/未绑定账号；位置以绑定球员档案 `players.position` 为准。
- 账户删除属于 A 全站级高风险能力：只显示给有 `destructive:delete` 权限的账号，禁止删除 `admin@orion.cn` 和当前登录账号；删除用户只清理账号侧数据，只有独占的试训档案会随账号删除，正式球员档案不删除。

导入流程：

- 单场上传极简为“赛事 + 封面图 + 比赛文件”；小程序 PDF / Excel 数据导入也要保留这个语义，封面图可选但一旦上传必须随该场比赛写入 `games.cover`。
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
- 后端 `server/gamechanger-import.js` 复用同一 parser，通过 `pdftotext -bbox-layout` 解析文本型 PDF，通过 `xlsx@0.18.5` 解析 Excel 工作簿，`POST /api/games/import-gamechanger` 返回待确认 draft；小程序数据导入页只负责选文件、选赛事、可选封面图上传、预览和确认，不另建比赛数据源；移动端可一次选多份聊天 PDF / Excel（XLS / XLSX）形成队列，PDF 逐份解析，Excel 可展开多场 draft，但仍逐份/逐场确认，避免未复核数据直接批量污染 `games` 表。

回归入口：

```bash
cd /Users/jinjiangshan/Downloads/猎户网站项目/orion-demo
npm run test:gamechanger
npm run test:gamechanger-server
npm run test:miniprogram-request
npm run test:miniprogram-flows
npm run test:miniprogram-score
npm run test:miniprogram-preflight
npm run test:miniprogram-ci
```

长期 roadmap：

- 文本型 PDF：继续通过新增真实样本扩回归。
- 图片型 PDF：需要 OCR，可能涉及 `poppler-utils` + `tesseract` 或第三方 OCR，独立立项。
- 后端化 parser 已完成文本型 PDF 路径；云托管镜像需要包含 `pdftotext` / poppler，或通过 `PDFTOTEXT` 指定可执行文件。

---

## 12. 小程序适配提示

- 登录改 `wx.login` + 后端 session。
- 小程序球员绑定采用“用户自主选择注册球员 -> 管理员审批 -> 自动绑定”的申请流；后台收到审批提示，核对微信身份/头像/姓名备注后批准或驳回。
- 网页端按 A 方案升级为“申请绑定 + 管理员审批”：邮箱注册后也可以选择目标注册球员，并填写队内昵称、微信号、其他验证信息等核验内容；后台批准后自动绑定。
- 注册表单采用渐进式可见性：默认只显示低复杂度基础字段，用户选择绑定正式球员档案后再展开目标球员搜索和核验信息。
- 目标球员搜索候选列表不得遮挡后续输入框，必须有清晰的收起路径；不放“取消”按钮，依赖点击空白、失焦、再次点击搜索框和 Esc 关闭。
- 网页端不能自动通过绑定申请，因为邮箱注册缺少微信 openid 这样的身份上下文；绑定码保留为管理员主动邀请/备用路径，网页后台和小程序管理台都可以由有 `bind_codes:manage` 权限的管理员给已注册用户发送站内绑定邀请。
- 建议新增 `player_bind_requests` 或等价表；审批结果可复用 `user_notifications` 通知用户和管理员。
- 小程序、Web、Admin 必须共用同一个 Express API + MySQL，不新增一套小程序本地事实源。
- 多端同步以服务器为准：小程序可缓存，但进入页面/下拉刷新要重新拉取 API；写操作只提交行为流水。
- 积分共享现有 points 语义：小程序展示积分和触发签到/活动参与，不在端上重算或直接写总分。
- 活动从“占位页”升级为活动接龙/报名：`events` 主表 + 报名流水表；小程序负责报名/取消/查看名单，后台负责创建、关闭、导出和人工修正。
- 签到不用二维码，也不自动抓微信群文字接龙：训练、比赛、活动都先发小程序队内接龙并转发到群，管理员可用 `wx.chooseLocation` 选择球场，用户点接龙卡片报名/待定，再在同一接龙下调用 `wx.getFuzzyLocation` 模糊定位签到（2026-06-08 修正：主体认证前不声明 `getLocation`）；如果群里已经用了微信原生接龙，管理员可以复制文本粘贴导入名单，由后端解析匹配球员或保留手动姓名；后端校验用户身份、接龙 ID 和重复签到，写 attendance 或活动参与流水。
- 比赛记录要中文友好和现场友好：少跳转，按钮用“安打/二垒打/打点/得分/三振/出局/保送/责失”等中文语义，同时保留 1B/RBI/IP/SO 等棒垒球缩写；误触必须有撤销入口。
- 可复用 `user_notifications` 做绑定申请、审批结果、活动提醒、报名成功和签到成功；小程序通知页已经复用该表，管理员定向发送时必须写 audit，不在端上维护另一套通知数据。
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
- 2026-05-12 `018`：合并球员、批量封面同目录匹配、COS 上传生产预检、头像/精彩时刻压缩。
- 2026-05-12 `017`：GameChanger parser 真实 PDF 回归。
- 2026-05-11：双身份 dashboard、积分系统、排行榜、player-points、首页 Editorial、导航与 dbReady 稳定。

---

## 14. 改进优先级

1. 活动页从占位改为可用的信息架构。
2. game-detail 的 4 张排序图表重设计，保留排序和合计契约。
3. 后台 admin 信息密度与操作分组优化。
4. 小程序一期：`wx.login`、多端共用 MySQL/API、活动接龙发起/报名、`wx.chooseLocation` 选点、一键定位签到（`wx.getLocation` 精确定位）、积分共享、中文现场比赛记录。
5. 清理遗留 `contact.html` 和旧照片墙 CSS。
6. OCR 图片型 PDF 作为单独项目。
