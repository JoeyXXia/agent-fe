<template>
  <nav class="bg-white border-b border-gray-200 sticky top-0 z-30">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <span class="text-xl font-bold text-indigo-600">AI DevStudio</span>
        <div class="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <router-link
            to="/dashboard"
            class="px-3 py-1 rounded-md text-xs font-medium transition-all"
            :class="$route.path === '/dashboard'
              ? 'bg-white shadow-sm text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'"
          >
            笔记
          </router-link>
          <router-link
            to="/agent"
            class="px-3 py-1 rounded-md text-xs font-medium transition-all"
            :class="$route.path === '/agent'
              ? 'bg-white shadow-sm text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'"
          >
            AI Agent
          </router-link>
        </div>
      </div>

      <div v-if="auth.isLoggedIn" class="flex items-center gap-3">
        <span class="text-sm text-gray-500 hidden sm:inline">
          {{ auth.user?.username }}
        </span>
        <button
          @click="auth.logout()"
          class="text-sm text-gray-500 hover:text-red-500 transition px-2 py-1 rounded hover:bg-red-50"
        >
          退出
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
</script>
