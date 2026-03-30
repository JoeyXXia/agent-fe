/**
 * 将已启用的市场插件转为 AgentTool（服务端 runtime 通过 /api/plugins/invoke 转发）
 */
import type { AgentTool, MarketplacePlugin, PlanStep, ToolResult } from '@/types'
import api from '@/api'
import type { PluginIntentPattern } from './planner'

export function buildPluginAgentTools(plugins: MarketplacePlugin[]): AgentTool[] {
  return plugins.map((p) => ({
    name: p.tool.name,
    description: p.tool.description,
    icon: p.tool.icon,
    parameters: p.tool.parameters,
    async execute(args): Promise<ToolResult> {
      const { data } = await api.post<{
        success?: boolean
        message?: string
        data?: unknown
        error?: string
      }>('/plugins/invoke', {
        pluginId: p.id,
        toolName: p.tool.name,
        args,
      })
      const ok = data?.success !== false && !data?.error
      return {
        success: ok,
        data: data?.data,
        message:
          (typeof data?.message === 'string' && data.message) ||
          (typeof data?.error === 'string' ? data.error : '插件调用失败'),
      }
    },
  }))
}

export function buildPlannerExtrasFromPlugins(plugins: MarketplacePlugin[]): {
  pluginPatterns: PluginIntentPattern[]
  planTemplates: Record<string, () => PlanStep[]>
} {
  const pluginPatterns: PluginIntentPattern[] = plugins.map((p) => ({
    type: p.intent.type,
    keywords: p.intent.keywords,
    extract: (input) => {
      const text = input.trim()
      const row: Record<string, string> = {}
      for (const param of p.tool.parameters) {
        row[param.name] = text
      }
      return row
    },
  }))

  const planTemplates: Record<string, () => PlanStep[]> = {}
  for (const p of plugins) {
    const tn = p.tool.name
    planTemplates[p.intent.type] = () => [
      {
        id: `plugin_${p.id}`,
        description: `调用插件：${p.displayName}`,
        toolName: tn,
        status: 'pending',
      },
    ]
  }

  return { pluginPatterns, planTemplates }
}
