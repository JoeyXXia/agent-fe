/**
 * MCP 代理 API：JWT 鉴权；列举工具/资源；代理 call_tool / read_resource
 * @see ai项目扩展/MCP-INTEGRATION.md §5–§7
 */
import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { getMcpConfig, getMcpArgMaxChars, isFileUriAllowed } from '../services/mcpConfig'
import {
  McpNotConfiguredError,
  listMcpTools,
  listMcpResources,
  callMcpTool,
  readMcpResource,
} from '../services/mcpClient'

const router = Router()
router.use(auth)

function auditLog(userId: number, action: string, detail: Record<string, unknown>) {
  const safe = { ...detail }
  if (typeof safe.argsPreview === 'string' && safe.argsPreview.length > 500) {
    safe.argsPreview = `${(safe.argsPreview as string).slice(0, 500)}…`
  }
  console.info(`[MCP audit] user=${userId} action=${action}`, safe)
}

/**
 * GET /tools —— 已配置则尝试连接并返回工具名 + inputSchema；未配置则 configured: false
 */
router.get('/tools', async (req: AuthRequest, res: Response) => {
  const configured = getMcpConfig() !== null
  if (!configured) {
    res.status(200).json({
      configured: false,
      tools: [],
      transport: null,
      message:
        '未配置 MCP。可在服务端设置 MCP_STDIO_COMMAND、MCP_STDIO_ARGS（JSON 数组）或 MCP_HTTP_URL。',
    })
    return
  }

  const cfg = getMcpConfig()!
  try {
    const tools = await listMcpTools()
    auditLog(req.userId!, 'list_tools', { count: tools.length })
    res.json({
      configured: true,
      transport: cfg.kind,
      tools,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    auditLog(req.userId!, 'list_tools_failed', { error: msg })
    res.status(502).json({
      configured: true,
      transport: cfg.kind,
      tools: [],
      error: `列举 MCP 工具失败：${msg}`,
    })
  }
})

/**
 * GET /resources —— 列举资源（只读阶段）
 */
router.get('/resources', async (req: AuthRequest, res: Response) => {
  const configured = getMcpConfig() !== null
  if (!configured) {
    res.status(200).json({
      configured: false,
      resources: [],
      message:
        '未配置 MCP。可在服务端设置 MCP_STDIO_COMMAND、MCP_STDIO_ARGS 或 MCP_HTTP_URL。',
    })
    return
  }

  try {
    const resources = await listMcpResources()
    auditLog(req.userId!, 'list_resources', { count: resources.length })
    res.json({ configured: true, resources })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    auditLog(req.userId!, 'list_resources_failed', { error: msg })
    res.status(502).json({
      configured: true,
      resources: [],
      error: `列举 MCP 资源失败：${msg}`,
    })
  }
})

function assertToolName(name: unknown): string {
  const s = String(name ?? '').trim()
  if (!s || s.length > 128) throw new Error('tool name 无效或过长')
  if (!/^[a-zA-Z0-9_.-]+$/.test(s)) throw new Error('tool name 包含非法字符')
  return s
}

function assertArguments(args: unknown): Record<string, unknown> {
  if (args === null || args === undefined) return {}
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('arguments 须为 JSON 对象')
  }
  const json = JSON.stringify(args)
  const max = getMcpArgMaxChars()
  if (json.length > max) {
    throw new Error(`arguments JSON 过长（>${max} 字符），已拒绝`)
  }
  return args as Record<string, unknown>
}

function assertResourceUri(uri: unknown): string {
  const s = String(uri ?? '').trim()
  if (!s) throw new Error('uri 不能为空')
  const lower = s.toLowerCase()
  if (lower.startsWith('file:') && !isFileUriAllowed()) {
    throw new Error('file:// 资源未放行：服务端需设置 MCP_ALLOW_FILE_URIS=1（存在安全风险）')
  }
  return s
}

/**
 * POST /tools/call —— body: { name, arguments? }
 */
router.post('/tools/call', async (req: AuthRequest, res: Response) => {
  if (!getMcpConfig()) {
    res.status(503).json({ error: 'MCP 未配置' })
    return
  }

  let toolName: string
  let args: Record<string, unknown>
  try {
    toolName = assertToolName(req.body?.name)
    args = assertArguments(req.body?.arguments)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '参数无效' })
    return
  }

  auditLog(req.userId!, 'call_tool', {
    toolName,
    argKeys: Object.keys(args),
    argsPreview: JSON.stringify(args),
  })

  try {
    const result = await callMcpTool(toolName, args)
    res.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof McpNotConfiguredError) {
      res.status(503).json({ error: e.message })
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    auditLog(req.userId!, 'call_tool_failed', { toolName, error: msg })
    res.status(502).json({ ok: false, error: msg })
  }
})

/**
 * POST /resources/read —— body: { uri }
 */
router.post('/resources/read', async (req: AuthRequest, res: Response) => {
  if (!getMcpConfig()) {
    res.status(503).json({ error: 'MCP 未配置' })
    return
  }

  let uri: string
  try {
    uri = assertResourceUri(req.body?.uri)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '参数无效' })
    return
  }

  auditLog(req.userId!, 'read_resource', { uri })

  try {
    const out = await readMcpResource(uri)
    res.json({ ok: true, ...out })
  } catch (e) {
    if (e instanceof McpNotConfiguredError) {
      res.status(503).json({ error: e.message })
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    auditLog(req.userId!, 'read_resource_failed', { uri, error: msg })
    res.status(502).json({ ok: false, error: msg })
  }
})

export default router
