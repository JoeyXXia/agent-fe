/**
 * @file Express 应用入口
 * @description
 * 负责创建 HTTP 服务器、配置全局中间件链（CORS、JSON 解析）、挂载业务路由，
 * 并在启动时初始化数据库。错误处理采用 Express 四参数中间件 `errorHandler`，
 * 需放在路由之后以捕获路由内抛出的异常。
 */

import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import express from 'express'
import cors from 'cors'
import { initDB } from './db'
import { errorHandler } from './middleware'
import authRoutes from './routes/auth'
import noteRoutes from './routes/notes'
import agentRoutes from './routes/agent'
import mcpRoutes from './routes/mcp'
import pluginRoutes from './routes/plugins'
import { attachYjsWebSocket } from './collab/yjsWs'

export const app = express()
const PORT = process.env.PORT || 3001

function parseCorsOrigins(): string[] {
  const raw = process.env['CLIENT_URLS'] || process.env['CLIENT_URL'] || 'http://localhost:5173'
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

const corsOrigins = parseCorsOrigins()
// CORS：支持单域名 CLIENT_URL 或多域名 CLIENT_URLS（逗号分隔）
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (corsOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`CORS blocked origin: ${origin}`))
    },
  })
)
// body-parser：将 JSON 请求体解析为 req.body；limit 防止过大 payload 占用内存
app.use(express.json({ limit: '1mb' }))

// 健康检查：无鉴权，供负载均衡或监控探活（200 + JSON）
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// 业务路由挂载：路径前缀与路由模块解耦，便于版本演进与测试
app.use('/api/auth', authRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/mcp', mcpRoutes)
app.use('/api/plugins', pluginRoutes)

// 全局错误处理：必须注册在路由之后；Express 通过「四参数」识别错误处理中间件
app.use(errorHandler)

/**
 * 异步启动：先完成 SQLite（sql.js）初始化再监听端口，避免请求到达时数据库未就绪
 */
async function main() {
  await initDB()
  const server = http.createServer(app)
  const disableYjs =
    process.env['DISABLE_YJS'] === '1' || String(process.env['DISABLE_YJS']).toLowerCase() === 'true'
  if (!disableYjs) {
    try {
      await attachYjsWebSocket(server)
      console.log('Yjs WebSocket enabled at /yjs')
    } catch (err) {
      console.error('Yjs WebSocket init failed, continue without collaboration:', err)
    }
  } else {
    console.log('Yjs WebSocket disabled by DISABLE_YJS')
  }
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (HTTP + /yjs WebSocket)`)
  })
}

// 测试环境由 Vitest 注入 VITEST，避免启动监听与初始化 DB（健康检查路由不依赖 DB）
if (process.env['VITEST'] !== 'true') {
  main().catch((err) => {
    console.error('Fatal startup error:', err)
    process.exit(1)
  })
}
