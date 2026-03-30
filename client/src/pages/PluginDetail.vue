<template>
  <div class="min-h-screen bg-gray-50">
    <Navbar />

    <main v-if="plugin" class="max-w-3xl mx-auto px-4 py-6">
      <router-link to="/plugins" class="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← 插件列表
      </router-link>

      <header class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ plugin.displayName }}</h1>
            <p class="text-xs text-gray-400 font-mono mt-1">{{ plugin.id }} · v{{ plugin.version }}</p>
            <p class="text-sm text-gray-600 mt-3">{{ plugin.description }}</p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">runtime: {{ plugin.runtime }}</span>
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-sm text-gray-600">启用插件</span>
              <input
                type="checkbox"
                class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                :checked="pluginsStore.enabledPluginIds.includes(plugin.id)"
                @change="toggle(($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </div>
      </header>

      <section class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 class="text-sm font-semibold text-gray-800 mb-2">权限摘要</h2>
        <ul class="list-disc list-inside text-sm text-gray-600 space-y-1">
          <li v-for="perm in plugin.permissions" :key="perm">{{ perm }}</li>
        </ul>
      </section>

      <section class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 class="text-sm font-semibold text-gray-800 mb-2">工具：{{ plugin.tool.name }}</h2>
        <p class="text-sm text-gray-600 mb-3">{{ plugin.tool.description }}</p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs text-left">
            <thead>
              <tr class="border-b border-gray-200 text-gray-500">
                <th class="py-2 pr-4">参数</th>
                <th class="py-2 pr-4">类型</th>
                <th class="py-2">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="param in plugin.tool.parameters" :key="param.name" class="border-b border-gray-100">
                <td class="py-2 pr-4 font-mono">{{ param.name }}</td>
                <td class="py-2 pr-4">{{ param.type }}</td>
                <td class="py-2 text-gray-600">{{ param.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="plugin.readme" class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 class="text-sm font-semibold text-gray-800 mb-2">README</h2>
        <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ plugin.readme }}</p>
      </section>
    </main>

    <main v-else class="max-w-3xl mx-auto px-4 py-20 text-center text-gray-500 text-sm">
      未找到该插件
      <router-link to="/plugins" class="block mt-4 text-indigo-600">返回市场</router-link>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from '../components/Navbar.vue'
import { usePluginsStore } from '@/stores/plugins'

const route = useRoute()
const pluginsStore = usePluginsStore()

const pluginId = computed(() => decodeURIComponent(String(route.params.id || '')))

const plugin = computed(() =>
  pluginsStore.marketplace.find((p) => p.id === pluginId.value)
)

async function toggle(on: boolean) {
  if (!plugin.value) return
  await pluginsStore.togglePlugin(plugin.value.id, on)
}

onMounted(() => {
  void pluginsStore.hydrateForUser()
})
</script>
