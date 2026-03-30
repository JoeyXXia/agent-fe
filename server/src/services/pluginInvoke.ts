/**
 * 服务端插件工具分发：密钥与文件系统不暴露给浏览器；写入审计日志。
 */
import { run } from '../db'
import type { MarketplaceCatalogEntry } from './pluginMarketplace'

export type InvokeResult = {
  success: boolean
  message: string
  data?: unknown
}

function audit(
  userId: number,
  pluginId: string,
  toolName: string,
  args: Record<string, unknown>
) {
  run(
    `INSERT INTO plugin_audit_log (user_id, plugin_id, tool_name, args_json) VALUES (?, ?, ?, ?)`,
    [userId, pluginId, toolName, JSON.stringify(args)]
  )
}

export function invokePluginTool(
  userId: number,
  entry: MarketplaceCatalogEntry,
  toolName: string,
  args: Record<string, unknown>
): InvokeResult {
  if (entry.tool.name !== toolName) {
    return { success: false, message: '工具名称与清单不一致' }
  }

  audit(userId, entry.id, toolName, args)

  if (entry.id === 'com.devstudio.sample-echo' && toolName === 'pluginSampleEcho') {
    const message = String(args.message ?? '').trim() || '(empty)'
    return {
      success: true,
      message: `[${entry.displayName}] ${message}`,
      data: { echoed: message },
    }
  }

  if (entry.runtime === 'mcp') {
    return {
      success: true,
      message: `[${entry.displayName}] 声明式 / MCP 类插件：请配置 MCP 后在「MCP 扩展」中使用；此处仅为占位返回。`,
      data: { query: args.query },
    }
  }

  return { success: false, message: '该插件尚未提供服务端实现' }
}
