# AI DevStudio 部署到 Vercel（详细指南）

本文提供一套可直接落地的部署方案，目标是：

- 前端 `client` 部署到 Vercel
- 后端 `server` 部署到支持常驻服务的平台（推荐 Railway / Render）
- 两端通过 HTTPS API 互通

---

## 0. 先确认部署边界（很重要）

这个仓库是典型的前后端分离架构：

- `client`：Vue 3 + Vite，适合部署到 Vercel（静态站点）
- `server`：Express + SQLite + WebSocket（`/yjs`）

`server` **不建议部署到 Vercel Serverless**，原因：

- 使用了 WebSocket（`/yjs`）实时协作，Serverless 不适合常驻连接
- 使用 SQLite 文件持久化，Serverless 实例文件系统非持久

因此最佳实践是：

1. Vercel 只部署前端
2. 后端部署到 Railway/Render/Fly.io 等支持长连接和持久磁盘的平台
3. 前端通过 `VITE_API_URL` / `VITE_WS_URL` 指向后端公网地址

---

## 1. 准备工作

在仓库根目录执行一次本地验证（可选但强烈建议）：

```bash
# 前端
cd client
npm install
npm run build

# 后端
cd ../server
npm install
npm run build
```

确保本地构建都通过后再上云，能显著减少排查成本。

---

## 2. 先部署后端（Railway / Render）

> 如果你已有可用后端地址，可跳过本节，直接看第 3 节。

### 2.1 后端环境变量（最低必填）

在后端平台上配置：

```env
PORT=3001
CLIENT_URL=https://<your-vercel-domain>
JWT_SECRET=<a-strong-random-secret>
AI_API_KEY=<optional>
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

说明：

- `CLIENT_URL` 要写前端实际域名（例如 `https://ai-devstudio.vercel.app`）
- 若暂时不配置 `AI_API_KEY`，笔记 AI 功能会走本地 Mock，仍可演示基础流程

### 2.2 启动命令建议

- Build Command: `npm run build`
- Start Command: `npm run start`
- Root Directory: `server`

部署成功后，记下后端公网域名，例如：

- `https://ai-devstudio-api.up.railway.app`

并验证健康接口：

- `GET https://<your-backend-domain>/api/health` 返回 `status: ok`

---

## 3. 在 Vercel 部署前端 `client`

### 3.1 导入仓库

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 `Add New... -> Project`
3. 选择该 GitHub 仓库
4. 在 Project Settings 中设置：
   - Framework Preset: `Vite`
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`

### 3.2 配置前端环境变量（必须）

在 Vercel -> Project -> Settings -> Environment Variables 添加：

```env
VITE_API_URL=https://<your-backend-domain>/api
VITE_WS_URL=wss://<your-backend-domain-host>/yjs
VITE_AGENT_USE_LLM=true
```

示例：

```env
VITE_API_URL=https://ai-devstudio-api.up.railway.app/api
VITE_WS_URL=wss://ai-devstudio-api.up.railway.app/yjs
```

注意：

- `VITE_API_URL` 结尾要包含 `/api`
- `VITE_WS_URL` 指向后端 `/yjs`（不要带 `/api`）
- 如果你的后端只支持 HTTP（不安全），则 `VITE_WS_URL` 应写 `ws://...`；生产建议全站 HTTPS + WSS

### 3.3 首次部署与验证

点击 Deploy 后，重点验证：

1. 页面可访问
2. 登录/注册正常
3. `Network` 面板里 API 请求发往后端公网域名而不是 `/api`
4. `GET /api/health` 正常
5. 协作功能使用 `wss://.../yjs`

---

## 4. 处理 Vue Router 刷新 404（必须）

生产环境中，Vue Router `history` 模式需要重写规则。仓库已提供 `client/vercel.json`：

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

这会把非静态资源请求回退到 `index.html`，避免 `/dashboard`、`/agent` 等路由刷新 404。

---

## 5. 用 GitHub Actions 触发 Vercel 自动部署（可选）

仓库已有 `.github/workflows/deploy.yml`，支持通过 Deploy Hook 触发 Vercel。

### 5.1 在 Vercel 生成 Deploy Hook

1. 进入 Vercel Project -> Settings -> Git -> Deploy Hooks
2. 新建一个 Hook，复制 URL

### 5.2 写入 GitHub Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 新增：

- `VERCEL_DEPLOY_HOOK_URL=<your-hook-url>`

推送到 `main` 且 CI 成功后会自动触发 `deploy-client` job。

---

## 6. 常见问题排查

### 6.1 页面能打开，但 API 全部 401/跨域失败

检查：

- 后端 `CLIENT_URL` 是否等于当前 Vercel 域名（协议也要一致）
- 前端是否把请求发到正确的 `VITE_API_URL`

### 6.2 登录后立刻被踢回登录页

通常是 Token 校验失败或请求打错后端地址：

- 检查浏览器 `Network` 中 `Authorization` 头是否已带 `Bearer <token>`
- 检查后端 `JWT_SECRET` 是否部署后发生变化（变更后老 token 会失效）

### 6.3 路由刷新 404

确认 `client/vercel.json` 已生效并重新部署。

### 6.4 协作功能不可用

检查：

- `VITE_WS_URL` 是否是后端真实可访问地址
- 是否使用 `wss://`（HTTPS 站点中通常不能连 `ws://`）
- 后端平台是否支持 WebSocket（Railway/Render 通常可用）

### 6.5 后端在 Vercel 上“偶尔可用但不稳定”

这是架构不匹配，不建议继续硬调。请把后端迁移到常驻服务平台。

---

## 7. 推荐上线配置清单（Checklist）

- [ ] 后端先部署成功，`/api/health` 可访问
- [ ] 后端 `CLIENT_URL` 指向 Vercel 域名
- [ ] Vercel Root Directory 设置为 `client`
- [ ] Vercel 环境变量已配置：`VITE_API_URL`、`VITE_WS_URL`
- [ ] 已启用 `client/vercel.json` 重写规则
- [ ] 首次部署后验证登录、笔记、Agent、协作链路
- [ ] （可选）`VERCEL_DEPLOY_HOOK_URL` 已写入 GitHub Secrets

---

## 8. 快速复制模板

### 8.1 Vercel（前端）环境变量模板

```env
VITE_API_URL=https://your-backend-domain/api
VITE_WS_URL=wss://your-backend-domain/yjs
VITE_AGENT_USE_LLM=true
```

### 8.2 后端平台环境变量模板

```env
PORT=3001
CLIENT_URL=https://your-project.vercel.app
JWT_SECRET=replace-with-a-long-random-string

AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

如果只想快速演示，可先不填 `AI_API_KEY`，确认主流程通了再补。
