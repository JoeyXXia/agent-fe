/**
 * 服务端插件工具分发：密钥与文件系统不暴露给浏览器；写入审计日志。
 */
import { randomUUID } from 'node:crypto'
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

/** 仅允许数字与四则运算符，避免任意代码执行 */
function evalSafeArithmetic(expression: string): number {
  const s = expression.replace(/\s/g, '')
  if (!s.length) throw new Error('empty')
  if (!/^[\d+\-*/().]+$/.test(s)) throw new Error('invalid chars')
  const result = Function(`"use strict"; return (${s})`)()
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('not finite')
  return result
}

function runBuiltin(entry: MarketplaceCatalogEntry, args: Record<string, unknown>): InvokeResult | null {
  switch (entry.id) {
    case 'com.devstudio.sample-echo': {
      const message = String(args.message ?? '').trim() || '(empty)'
      return {
        success: true,
        message: `[${entry.displayName}] ${message}`,
        data: { echoed: message },
      }
    }
    case 'com.devstudio.calc': {
      const expr = String(args.expression ?? args.expr ?? '').trim()
      if (!expr) return { success: false, message: '请提供 expression' }
      try {
        const result = evalSafeArithmetic(expr)
        return { success: true, message: `= ${result}`, data: { result } }
      } catch {
        return { success: false, message: '表达式无效或超出支持范围（仅数字与 + - * / ( )）' }
      }
    }
    case 'com.devstudio.datetime': {
      const d = new Date()
      return {
        success: true,
        message: d.toISOString(),
        data: {
          iso: d.toISOString(),
          locale: d.toLocaleString('zh-CN', { hour12: false }),
          unixMs: d.getTime(),
        },
      }
    }
    case 'com.devstudio.codec-base64': {
      const mode = String(args.mode ?? 'encode').toLowerCase()
      const text = String(args.text ?? '')
      if (mode === 'encode') {
        const b64 = Buffer.from(text, 'utf-8').toString('base64')
        return { success: true, message: b64, data: { base64: b64 } }
      }
      if (mode === 'decode') {
        try {
          const out = Buffer.from(text, 'base64').toString('utf-8')
          return { success: true, message: out, data: { text: out } }
        } catch {
          return { success: false, message: 'Base64 无效' }
        }
      }
      return { success: false, message: 'mode 须为 encode 或 decode' }
    }
    case 'com.devstudio.uuid': {
      const u = randomUUID()
      return { success: true, message: u, data: { uuid: u } }
    }
    case 'com.devstudio.json-format': {
      const text = String(args.text ?? '').trim()
      if (!text) return { success: false, message: '请提供 text' }
      try {
        const obj = JSON.parse(text) as unknown
        const pretty = JSON.stringify(obj, null, 2)
        return { success: true, message: '已格式化', data: { json: pretty } }
      } catch {
        return { success: false, message: 'JSON 无效' }
      }
    }
    default:
      return null
  }
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

  const builtin = runBuiltin(entry, args)
  if (builtin) return builtin

  if (entry.runtime === 'mcp') {
    return {
      success: true,
      message: `[${entry.displayName}] 声明式 / MCP 类插件：请配置 MCP 后在「MCP 扩展」中使用；此处仅为占位返回。`,
      data: { query: args.query },
    }
  }

  return { success: false, message: '该插件尚未提供服务端实现' }
}
