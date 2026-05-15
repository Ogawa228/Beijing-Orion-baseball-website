# 北京猎户座棒垒球队官网

北京猎户座棒垒球俱乐部官网项目。当前应用代码位于 `orion-demo/`，形态为纯 HTML/CSS/JS 前端 + Express API + MySQL Serverless + COS，部署目标是微信云托管。

## 目录

- `orion-demo/`：可运行应用代码
- `DESIGN_BRIEF.md`：设计语言、页面职责、组件契约和重构边界
- `GAMECHANGER_PDF_PARSER_DESIGN.md`：GameChanger PDF 解析器设计说明
- `orion-demo/HANDOFF.md`：当前部署状态、接手说明和操作约束

## 本地运行

```bash
cd orion-demo
npm install
cp .env.example .env
npm start
```

本地需要在 `.env` 中配置数据库连接。`.env` 不会提交到 GitHub。

健康检查：

```bash
curl -s http://localhost:3000/api/health
```

## 常用命令

```bash
cd orion-demo
npm run test:gamechanger
npm run deploy:verify -- --expected-version express-knlw-NNN
```

云部署必须先本地预览并获得明确上线确认，详见 `orion-demo/HANDOFF.md`。

## 发布注意

仓库通过根目录 `.gitignore` 使用白名单发布：

- 会提交：`orion-demo/`、`README.md`、`DESIGN_BRIEF.md`、`GAMECHANGER_PDF_PARSER_DESIGN.md`
- 不提交：`.env`、`node_modules/`、备份、输出截图、原始素材包、赛季 PDF 数据、zip 文件和其他工作目录
