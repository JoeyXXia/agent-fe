/**
 * 插件市场：目录、用户启用列表、与 AgentCore 工具表同步
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MarketplacePlugin } from '@/types'
import api from '@/api'
import { agentCore } from '@/services/agent'
import { baseToolRegistry } from '@/services/tools'
import {
  buildPluginAgentTools,
  buildPlannerExtrasFromPlugins,
} from '@/services/pluginTools'

export const usePluginsStore = defineStore('plugins', () => {
  const marketplace = ref<MarketplacePlugin[]>([])
  const enabledPluginIds = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')

  const enabledPlugins = computed(() =>
    marketplace.value.filter((p) => enabledPluginIds.value.includes(p.id))
  )

  async function fetchMarketplace() {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get<{ plugins: MarketplacePlugin[] }>(
        '/plugins/marketplace'
      )
      marketplace.value = Array.isArray(data?.plugins) ? data.plugins : []
    } catch (e: unknown) {
      error.value = '无法加载插件市场'
      marketplace.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchEnabled() {
    try {
      const { data } = await api.get<{ pluginIds: string[] }>('/plugins/enabled')
      enabledPluginIds.value = Array.isArray(data?.pluginIds) ? data.pluginIds : []
    } catch {
      enabledPluginIds.value = []
    }
  }

  function getPlannerExtras() {
    return buildPlannerExtrasFromPlugins(enabledPlugins.value)
  }

  function syncAgentTools() {
    const extra = buildPluginAgentTools(enabledPlugins.value)
    agentCore.syncTools([...baseToolRegistry, ...extra])
  }

  async function setEnabledIds(pluginIds: string[]) {
    const catalogIds = new Set(marketplace.value.map((p) => p.id))
    const next = pluginIds.filter((id) => catalogIds.has(id))
    await api.put('/plugins/enabled', { pluginIds: next })
    enabledPluginIds.value = next
    syncAgentTools()
  }

  async function togglePlugin(pluginId: string, on: boolean) {
    const set = new Set(enabledPluginIds.value)
    if (on) set.add(pluginId)
    else set.delete(pluginId)
    await setEnabledIds([...set])
  }

  /** 登录后或进入工作台时拉取目录与启用状态并注册工具 */
  async function hydrateForUser() {
    await fetchMarketplace()
    await fetchEnabled()
    syncAgentTools()
  }

  return {
    marketplace,
    enabledPluginIds,
    enabledPlugins,
    loading,
    error,
    fetchMarketplace,
    fetchEnabled,
    getPlannerExtras,
    syncAgentTools,
    setEnabledIds,
    togglePlugin,
    hydrateForUser,
  }
})
