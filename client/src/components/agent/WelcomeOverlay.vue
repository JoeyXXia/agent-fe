<script setup lang="ts">
/**
 * Agent 工作台欢迎层（无会话时全屏展示）
 * - 功能卡片区的 icon 为静态 SVG 字符串，通过 v-html 渲染；来源为前端常量，非用户输入，风险可控
 * - 已注册工具列表来自 agentCore.getRegisteredTools()；MCP 工具来自服务端 GET /api/mcp/tools（须登录）
 */
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { agentCore } from '@/services/agent'
import api from '@/api'

const tools = agentCore.getRegisteredTools()

type McpToolsResponse = {
  configured?: boolean
  transport?: string | null
  tools?: { name: string; description?: string }[]
  message?: string
  error?: string
}

const mcp = ref({
  loading: true as boolean,
  configured: false as boolean,
  transport: '' as string,
  tools: [] as { name: string; description?: string }[],
  message: '' as string,
  error: '' as string,
})

onMounted(() => {
  void (async () => {
    try {
      const { data } = await api.get<McpToolsResponse>('/mcp/tools')
      mcp.value = {
        loading: false,
        configured: Boolean(data.configured),
        transport: (data.transport as string) || '',
        tools: data.tools ?? [],
        message: data.message || '',
        error: data.error || '',
      }
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null
      const data = ax?.response?.data as McpToolsResponse | undefined
      mcp.value = {
        loading: false,
        configured: Boolean(data?.configured),
        transport: (data?.transport as string) || '',
        tools: data?.tools ?? [],
        message: data?.message || '',
        error:
          (typeof data?.error === 'string' && data.error) ||
          ax?.message ||
          '无法加载 MCP 工具列表',
      }
    }
  })()
})

const features = [
  {
    icon: `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`,
    title: '组件生成',
    desc: '自然语言描述需求，自动生成 Vue/React 组件',
  },
  {
    icon: `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>`,
    title: '任务规划',
    desc: '自动分解复杂任务，制定执行计划',
  },
  {
    icon: `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>`,
    title: '代码预览',
    desc: '实时预览生成的组件，即时查看效果',
  },
  {
    icon: `<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`,
    title: '工具调用',
    desc: 'Agent 自主选择并调用合适的工具完成任务',
  },
]
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center p-8">
    <div class="max-w-2xl w-full text-center">
      <!-- 品牌与简介 -->
      <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6 shadow-2xl shadow-primary-500/30">
        A
      </div>

      <h1 class="text-3xl font-bold text-white mb-3">
        AI DevStudio <span class="text-gradient">代码 Agent</span>
      </h1>
      <p class="text-dark-400 text-base mb-10 max-w-lg mx-auto">
        基于 ReAct 架构的 AI Agent，具备任务规划、工具调用和代码生成能力，<br />
        帮助你快速构建前端组件
      </p>

      <!-- 功能卡片网格：icon 使用 v-html（静态 SVG，见 script 说明） -->
      <div class="grid grid-cols-2 gap-4 mb-10">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="p-5 rounded-xl bg-dark-800/50 border border-dark-700/50 text-left hover:bg-dark-800 hover:border-dark-600 transition-all duration-200"
        >
          <div class="h-10 w-10 rounded-lg bg-primary-500/10 text-primary-400 flex items-center justify-center mb-3" v-html="feature.icon">
          </div>
          <h3 class="text-sm font-semibold text-white mb-1">{{ feature.title }}</h3>
          <p class="text-xs text-dark-400">{{ feature.desc }}</p>
        </div>
      </div>

      <!-- 已注册工具名称列表 -->
      <div>
        <h4 class="text-xs font-medium text-dark-500 uppercase tracking-wider mb-3">已注册工具</h4>
        <div class="flex items-center justify-center gap-3 flex-wrap">
          <span
            v-for="tool in tools"
            :key="tool.name"
            class="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700/50 text-xs text-dark-300 flex items-center gap-1.5"
          >
            <span>{{ tool.icon }}</span>
            <span class="font-mono">{{ tool.name }}</span>
          </span>
        </div>
      </div>

      <!-- MCP 扩展（服务端 Node Client，非浏览器直连） -->
      <div class="mt-10 max-w-lg mx-auto">
        <h4 class="text-xs font-medium text-dark-500 uppercase tracking-wider mb-3">
          MCP 扩展工具
        </h4>
        <p v-if="mcp.loading" class="text-xs text-dark-500">正在查询服务端 MCP…</p>
        <p v-else-if="mcp.error" class="text-xs text-amber-400/90">{{ mcp.error }}</p>
        <p v-else-if="!mcp.configured && mcp.message" class="text-xs text-dark-500">
          {{ mcp.message }}
        </p>
        <div v-else-if="mcp.tools.length" class="flex flex-wrap justify-center gap-2">
          <span
            v-for="t in mcp.tools"
            :key="t.name"
            :title="t.description || ''"
            class="px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-xs text-emerald-100/90 font-mono"
          >
            {{ t.name }}
          </span>
        </div>
        <p v-else class="text-xs text-dark-500">
          MCP 已连接但暂无工具，或当前 Server 未实现 list_tools。
        </p>
        <p v-if="mcp.configured && mcp.transport" class="text-[10px] text-dark-600 mt-2 text-center">
          传输：{{ mcp.transport }}
        </p>
      </div>
    </div>
  </div>
</template>
