/**
 * Node 侧 MCP Client：连接、列举工具/资源、调用工具、读资源
 * 每次请求独立 connect/close，避免多用户共享同一 stdio 子进程（见 MCP-INTEGRATION §7）
 */
import { createRequire } from 'module'
import {
  getMcpConfig,
  getMcpConnectTimeoutMs,
  getMcpCallTimeoutMs,
  type McpResolvedConfig,
} from './mcpConfig'

const mcpRequire = createRequire(__filename)
const { Client } = mcpRequire('@modelcontextprotocol/sdk/client') as {
  Client: new (
    info: { name: string; version: string },
    opts?: Record<string, unknown>
  ) => McpClientInstance
}
const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/sdk/client/stdio.js') as {
  StdioClientTransport: new (params: {
    command: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
  }) => { close(): Promise<void> }
}
const { StreamableHTTPClientTransport } = mcpRequire(
  '@modelcontextprotocol/sdk/client/streamableHttp.js'
) as {
  StreamableHTTPClientTransport: new (
    url: URL,
    opts?: { requestInit?: { headers?: Record<string, string> } }
  ) => { close(): Promise<void> }
}

/** 仅包含本模块用到的 Client 方法，避免对 SDK 做完整类型依赖 */
type McpClientInstance = {
  connect: (transport: unknown) => Promise<void>
  close: () => Promise<void>
  listTools: () => Promise<{ tools?: McpToolRow[] }>
  listResources: () => Promise<{ resources?: McpResourceRow[] }>
  callTool: (params: {
    name: string
    arguments?: Record<string, unknown>
  }) => Promise<{ content?: unknown; isError?: boolean }>
  readResource: (params: { uri: string }) => Promise<{ contents?: unknown }>
}

type McpToolRow = { name: string; description?: string; inputSchema?: unknown }
type McpResourceRow = {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export class McpNotConfiguredError extends Error {
  constructor() {
    super(
      'MCP 未配置：请设置 MCP_STDIO_COMMAND + MCP_STDIO_ARGS（JSON 数组）或 MCP_HTTP_URL，参见 server/.env.example'
    )
    this.name = 'McpNotConfiguredError'
  }
}

function createTransport(config: McpResolvedConfig): unknown {
  if (config.kind === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
    })
  }
  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超过 ${ms}ms 未返回`)), ms)
    ),
  ])
}

export async function withMcpClient<T>(fn: (client: McpClientInstance) => Promise<T>): Promise<T> {
  const config = getMcpConfig()
  if (!config) throw new McpNotConfiguredError()

  const client = new Client({ name: 'ai-devstudio-mcp', version: '1.0.0' }, {}) as McpClientInstance
  const transport = createTransport(config)
  const connectMs = getMcpConnectTimeoutMs()
  const opMs = getMcpCallTimeoutMs()

  try {
    await withTimeout(client.connect(transport), connectMs, 'MCP 连接')
    return await withTimeout(fn(client), opMs, 'MCP 操作')
  } finally {
    try {
      await client.close()
    } catch {
      /* ignore */
    }
  }
}

export type McpToolSummary = {
  name: string
  description?: string
  inputSchema?: unknown
}

export async function listMcpTools(): Promise<McpToolSummary[]> {
  return withMcpClient(async (client) => {
    const res = await client.listTools()
    const tools = res.tools ?? []
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
  })
}

export type McpResourceSummary = {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export async function listMcpResources(): Promise<McpResourceSummary[]> {
  return withMcpClient(async (client) => {
    const res = await client.listResources()
    const resources = res.resources ?? []
    return resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }))
  })
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: unknown; isError?: boolean }> {
  return withMcpClient(async (client) => {
    const result = await client.callTool({
      name,
      arguments: args,
    })
    return {
      content: result.content,
      isError: result.isError,
    }
  })
}

export async function readMcpResource(uri: string): Promise<{ contents?: unknown }> {
  return withMcpClient(async (client) => {
    return client.readResource({ uri })
  })
}
