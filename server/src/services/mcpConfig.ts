/**
 * MCP 运行时配置（自环境变量读取，不写死进仓库）
 * @see ai项目扩展/MCP-INTEGRATION.md
 */

export type McpStdioConfig = {
  kind: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
}

export type McpHttpConfig = {
  kind: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpResolvedConfig = McpStdioConfig | McpHttpConfig

function parseJsonObject(raw: string | undefined): Record<string, string> | undefined {
  const t = raw?.trim()
  if (!t) return undefined
  try {
    const o = JSON.parse(t) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined
    return Object.fromEntries(
      Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    )
  } catch {
    return undefined
  }
}

function parseStringArray(raw: string | undefined): string[] {
  const t = raw?.trim()
  if (!t) return []
  try {
    const p = JSON.parse(t) as unknown
    if (!Array.isArray(p)) return []
    return p.map((x) => String(x))
  } catch {
    return []
  }
}

/**
 * 若返回 null，表示未配置 MCP（API 可返回 configured: false，而非连接错误）
 */
export function getMcpConfig(): McpResolvedConfig | null {
  const transport = (process.env.MCP_TRANSPORT || 'stdio').trim().toLowerCase()

  if (transport === 'http' || transport === 'streamable-http') {
    const url = process.env.MCP_HTTP_URL?.trim()
    if (!url) return null
    const headers = parseJsonObject(process.env.MCP_HTTP_HEADERS_JSON)
    return { kind: 'http', url, headers }
  }

  const command = process.env.MCP_STDIO_COMMAND?.trim()
  if (!command) return null

  const args = parseStringArray(process.env.MCP_STDIO_ARGS)
  const env = parseJsonObject(process.env.MCP_STDIO_ENV_JSON)
  const cwd = process.env.MCP_STDIO_CWD?.trim() || undefined

  return { kind: 'stdio', command, args, env, cwd }
}

export function getMcpConnectTimeoutMs(): number {
  const n = Number(process.env.MCP_CONNECT_TIMEOUT_MS)
  if (Number.isFinite(n) && n > 0) return Math.min(n, 120000)
  return 15000
}

export function getMcpCallTimeoutMs(): number {
  const n = Number(process.env.MCP_CALL_TIMEOUT_MS)
  if (Number.isFinite(n) && n > 0) return Math.min(n, 300000)
  return 60000
}

export function getMcpArgMaxChars(): number {
  const n = Number(process.env.MCP_ARG_MAX_CHARS)
  if (Number.isFinite(n) && n > 0) return Math.min(n, 2_000_000)
  return 65536
}

export function isFileUriAllowed(): boolean {
  return /^1|true|yes$/i.test(process.env.MCP_ALLOW_FILE_URIS?.trim() || '')
}
