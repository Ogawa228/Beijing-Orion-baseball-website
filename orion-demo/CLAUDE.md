# 北京猎户座棒垒球俱乐部官网（orion-demo）

**Express + MySQL Serverless + COS 全栈站点**。前端 HTML/CSS/JS（无构建），走 `assets/js/db.js` 的 fetch client；后端 `server.js` mount 路由到 `server/routes/*`。鉴权用 PBKDF2 + HMAC cookie。

部署到微信云托管（环境 `prod-d5gtkxdyu7263e95b`，服务 `express-knlw`，AppID `wx7dce60930ee10898`）。

**当前状态 + 未部署改动 + 双身份验证步骤** 详见 [HANDOFF.md](HANDOFF.md)；长期设计 token / 组件 / 模式见 [../DESIGN_BRIEF.md](../DESIGN_BRIEF.md)。

## 部署目标（微信云托管）

- AppID：`wx7dce60930ee10898`
- 环境 ID：`prod-d5gtkxdyu7263e95b`
- 服务名：`express-knlw`
- 监听端口：80
- 部署模式：`run`（容器化，Dockerfile 在仓库根目录）

## 部署工作流（每次都要走完）

**绝不能在没有用户明确许可的前提下跑 `npm run deploy`。** 完整流程：

1. 用户在 Claude Code 中说要改什么
2. Claude 用 Edit/Write 改代码（diff 由 Claude Code 默认权限流给用户审）
3. **Claude 启动/确认本地预览服务在跑**，告诉用户预览 URL（默认 `http://localhost:5173`）
4. **用户在浏览器测试改动**，确认没问题
5. **用户明确说"部署"/"推上去"/"OK 上线"之类**，Claude 才能跑 `npm run deploy`
6. 部署后立即跑 `npm run deploy:verify -- --expected-version <express-knlw-NNN>`，用 `wxcloud service:list --json` / `version:list --json` + 线上 `/api/health` 做机器可读校验
7. 部署日志和 `deploy:verify` JSON 摘要贴回给用户看，给出云托管访问 URL，并同步更新 `HANDOFF.md` 与 `../DESIGN_BRIEF.md`

绝对禁止的行为：
- 在用户还没测试时就部署
- 把"用户之前说过可以部署"当成永久授权——每一次部署都要重新点头
- 把 `--dryRun` 当部署许可——dryRun 不消耗服务，但真部署仍需用户口头同意

## 命令速查

```bash
# 本地预览（开发用 — 跑 Express + 连真 MySQL）
node server.js   # 监听 PORT=3000（本地默认）

# 健康检查
curl -s http://localhost:3000/api/health   # 期望 {"server":"ok","db":{"ok":1,...}}

# 部署到云托管（必须先获用户口头同意）
yes "" | npm run deploy  # 非 TTY 下喂回车选默认"手动上传代码包"
npm run deploy:verify -- --expected-version express-knlw-021
npm run deploy:dry       # 预演，看 CLI 打算干啥
wxcloud login            # 首次或登录失效后用户手动跑（需扫码）
```

## 关键文件

**前端页面**：`index.html` / `admin.html` / `dashboard.html` / `players.html` / `tournament.html` / `game-detail.html` / `hall-of-fame.html` / `ranking.html` / `player-points.html` / `games.html`。`events.html` 占位待补；`contact.html` 已被 `index.html#contact` 取代，仅作死代码留存。

**前端共享**：
- `assets/js/db.js` —— 670 行 fetch client + 内存 cache + 乐观更新；`DB.isOrionTeam(name)` 统一识别队名；`window.dbReady()` 返回 preload Promise，**所有页面顶部 inline JS 必须 `await window.dbReady()`**
- `assets/js/auth.js` —— 共享 nav（每页 `buildNav('key')` 即生效）+ 登录/注册 modal + 30s 心跳
- `assets/js/parser.js` —— pdf.js + xlsx.js 解析 GameChanger 比赛数据（动它前先看 DESIGN_BRIEF §11）

**后端**：
- `server.js` —— 主入口，mount `/api/*` 路由 + 静态托管 + dotenv 用绝对路径
- `server/db.js` —— mysql2 pool + 自动重试（Serverless 冷启动兼容，**不要去掉**）
- `server/auth-helpers.js` —— PBKDF2 哈希 + HMAC cookie 签名（老 admin 明文兼容）
- `server/middleware.js` —— `attachUser` / `requireAuth` / `requireAdmin` / `wrap`
- `server/routes/*.js` —— auth / players / tournaments / games / events / hof / highlights / bindcodes / attendances / adjustments / leaderboard / upload

## 部署相关文件（动这些之前先问用户）

- `Dockerfile` —— `node:18-alpine` + `npm install` + `npm start`
- `package.json` —— express + mysql2 + dotenv + multer + cos-nodejs-sdk-v5
- `wxcloud.config.json` —— `type: run`，`port: 80`
- `.dockerignore` —— 排除 `.env` / `node_modules` / `db.legacy.js.bak` / `scripts/` 等
