# AI DevStudio 后端部署指南（Express + SQLite + WebSocket）

本文专门讲 `server` 目录如何部署到生产环境，适用于：

- Railway（推荐）
- Render（可用）
- 其他支持 **Node 常驻进程 + WebSocket + 持久磁盘** 的平台

---

## 1. 后端部署前提

本项目后端特性：

- Express API（`/api/*`）
- Yjs WebSocket 协作（`/yjs/*`）
- SQLite 文件存储（`server/src/data/devstudio.db`）

因此平台必须满足：

1. 支持长连接（WebSocket）
2. 支持持久文件（避免重启丢数据库）
3. 支持自定义环境变量

> 不建议将该后端部署到纯 Serverless 场景（例如无状态函数）。

---

## 2. 必要环境变量

至少配置以下变量：

```env
PORT=3001
CLIENT_URL=https://your-frontend-domain.vercel.app
JWT_SECRET=replace-with-a-long-random-string
```

### 可选 AI 变量（不配也能跑）

```env
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

说明：

- 不填 `AI_API_KEY` 时，笔记 AI 会走 Mock 降级模式
- `CLIENT_URL` 必须与你前端线上域名一致（含 `https://`）
- `JWT_SECRET` 建议长度 >= 32，使用随机字符串

---

## 3. 部署命令配置

后端项目位于 `server` 子目录，推荐如下：

- Root Directory: `server`
- Build Command: `npm run build`
- Start Command: `npm run start`
- Node Version: `20`

项目脚本来源（`server/package.json`）：

- `build` -> `tsc`
- `start` -> `node dist/index.js`

补充：

- 仓库已在 `server/package.json` 中声明 `engines.node = 20.x`
- 若平台仍使用 Node 22，请在平台环境变量中显式设置 `NODE_VERSION=20`

---

## 4. Railway 部署（推荐）

### 4.1 创建服务

1. 登录 Railway，新建 Project
2. 连接 GitHub 仓库
3. 选择该仓库并设置 Root Directory 为 `server`

### 4.2 填写 Variables

在 Railway Variables 页面填写第 2 节环境变量。

### 4.3 检查健康接口

部署完成后访问：

- `GET https://<your-backend-domain>/api/health`

返回 `{"status":"ok"...}` 即成功。

### 4.4 持久化建议

SQLite 是文件数据库，建议：

- 开启 Railway 持久卷（Volume）
- 将数据库文件目录挂载到持久卷路径
- 每次重启后确认数据未丢失

---

## 5. Render 部署（可用）

### 5.1 创建 Web Service

1. 在 Render 选择 New -> Web Service
2. 连接 GitHub 仓库
3. 配置：
   - Root Directory: `server`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm run start`

并在 Render 环境变量中增加：

- `NODE_VERSION=20`

仓库也已提供 Render Blueprint（根目录 `render.yaml`），可直接 `Blueprint` 导入，避免手动填错。

### 5.2 设置环境变量

同第 2 节。

### 5.3 WebSocket 与持久盘

- 确认服务实例支持 WebSocket
- 若计划长期使用 SQLite，请配置 Persistent Disk（避免实例重建数据丢失）

---

## 6. 与前端联调（Vercel）

前端需要指向后端公网地址：

```env
VITE_API_URL=https://your-backend-domain/api
VITE_WS_URL=wss://your-backend-domain/yjs
```

后端同时要配置：

```env
CLIENT_URL=https://your-frontend-domain.vercel.app
```

这是跨域可用的关键组合。

---

## 7. 验收清单（上线前）

- [ ] `GET /api/health` 正常
- [ ] 前端能注册/登录
- [ ] JWT 请求带 `Authorization: Bearer ...`
- [ ] 刷新页面后会话仍可读取
- [ ] WebSocket 协作链路可连（`wss://.../yjs`）
- [ ] 服务重启后 SQLite 数据不丢失

---

## 8. 常见问题排查

### 8.1 CORS 报错

现象：浏览器报 `CORS policy`。

排查：

- `CLIENT_URL` 是否与前端域名完全一致（协议、域名都一致）
- 前端是否真的从该域名发起请求

### 8.2 登录后 401

排查：

- `JWT_SECRET` 是否变更过（变更后旧 token 失效）
- 前端请求头是否携带 `Authorization: Bearer <token>`

### 8.3 WebSocket 连接失败

排查：

- 前端是否使用 `wss://.../yjs`
- 平台是否支持 WebSocket
- 是否被反向代理或防火墙中断 Upgrade

### 8.4 部署后数据丢失

根因通常是 SQLite 文件写在临时磁盘。

解决：

- 配置平台持久卷 / 持久磁盘
- 或改造为托管数据库（Postgres/MySQL）

### 8.5 Render 显示 `Node.js v22.x` 后退出（status 1）

这是常见的运行时版本不匹配问题，按下面顺序处理：

1. 确认 Render 已设置 `NODE_VERSION=20`
2. 确认 Build Command 使用 `npm ci && npm run build`
3. 触发一次 Clear build cache + Redeploy
4. 若仍失败，查看部署日志里第一条 `npm ERR!`（而不是最后的 `Exited with status 1`）

补充：当前项目已添加以下版本约束，建议确保 Render 已读取到最新提交后再重试：

- `server/package.json` -> `engines.node: 20.x`
- `server/.node-version` -> `20`
- `server/.nvmrc` -> `20`
- `render.yaml` -> `NODE_VERSION=20`

---

## 9. 生产建议（可选增强）

- 使用外部数据库替代 SQLite（提升并发和可靠性）
- 为 `/api/health` 接入平台健康检查
- 增加日志聚合（请求日志、错误日志）
- 对 `JWT_SECRET`、`AI_API_KEY` 使用平台 Secret 管理
- 启用自动部署后，至少保留一个可回滚版本

---

## 10. 相关文档

- 前端 + Vercel 说明：`docs/DEPLOY_VERCEL.md`
- 总览文档：`README.md`
