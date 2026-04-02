<template>
  <div class="min-h-screen bg-gray-50">
    <Navbar />

    <main class="max-w-6xl mx-auto px-4 py-6">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">插件市场</h1>
          <p class="text-sm text-gray-500 mt-1">
            启用后工具会并入 Agent；服务端插件通过宿主 API 执行并记审计日志。
          </p>
        </div>
        <router-link
          to="/agent"
          class="text-sm text-indigo-600 hover:text-indigo-800"
        >
          返回 Agent →
        </router-link>
      </div>

      <div class="relative mb-6">
        <input
          v-model="q"
          type="search"
          placeholder="搜索名称、描述、权限…"
          class="w-full sm:max-w-md pl-4 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        />
      </div>

      <p v-if="pluginsStore.loading" class="text-center py-16 text-gray-400 text-sm">加载中…</p>
      <p v-else-if="pluginsStore.error" class="text-center py-16 text-amber-600 text-sm">
        {{ pluginsStore.error }}
      </p>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="p in filtered"
          :key="p.id"
          class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col hover:border-indigo-200 transition"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <h2 class="font-semibold text-gray-800 leading-snug">
              {{ p.displayName }}
            </h2>
            <span
              class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0"
            >
              {{ p.runtime }}
            </span>
          </div>
          <p class="text-xs text-gray-500 line-clamp-3 flex-1 mb-3">
            {{ p.description }}
          </p>
          <div class="flex flex-wrap gap-1 mb-3">
            <span
              v-for="perm in p.permissions.slice(0, 3)"
              :key="perm"
              class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800"
            >
              {{ perm }}
            </span>
            <span v-if="p.permissions.length > 3" class="text-[10px] text-gray-400">
              +{{ p.permissions.length - 3 }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <router-link
              :to="`/plugins/${encodeURIComponent(p.id)}`"
              class="text-xs text-indigo-600 hover:underline"
            >
              详情
            </router-link>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <span class="text-xs text-gray-500">启用</span>
              <input
                type="checkbox"
                class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                :checked="pluginsStore.enabledPluginIds.includes(p.id)"
                @change="onToggle(p.id, ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </article>
      </div>

      <p
        v-if="!pluginsStore.loading && !pluginsStore.error && filtered.length === 0"
        class="text-center py-12 text-gray-400 text-sm"
      >
        {{
          pluginsStore.marketplace.length === 0 && !q.trim()
            ? '暂无可用插件'
            : '无匹配插件'
        }}
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Navbar from '../components/Navbar.vue'
import { usePluginsStore } from '@/stores/plugins'
import type { MarketplacePlugin } from '@/types'

const pluginsStore = usePluginsStore()
const q = ref('')

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  const list = pluginsStore.marketplace
  if (!needle) return list
  return list.filter((p: MarketplacePlugin) => {
    const blob = [
      p.displayName,
      p.description,
      p.id,
      ...(p.permissions || []),
      p.category || '',
    ]
      .join(' ')
      .toLowerCase()
    return blob.includes(needle)
  })
})

async function onToggle(pluginId: string, on: boolean) {
  try {
    await pluginsStore.togglePlugin(pluginId, on)
  } catch {
    /* 401 由 api 拦截；其余忽略 */
  }
}

onMounted(() => {
  void pluginsStore.hydrateForUser()
})
</script>
