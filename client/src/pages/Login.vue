<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 px-4"
  >
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-800">AI DevStudio</h1>
        <p class="text-gray-500 mt-2 text-sm">智能开发工作台</p>
      </div>

      <div class="flex mb-6 bg-gray-100 rounded-lg p-1">
        <button
          v-for="tab in ['login', 'register'] as const"
          :key="tab"
          @click="mode = tab"
          :class="[
            mode === tab
              ? 'bg-white shadow-sm text-indigo-600'
              : 'text-gray-500 hover:text-gray-700',
            'flex-1 py-2 rounded-md text-sm font-medium transition-all',
          ]"
        >
          {{ tab === 'login' ? '登录' : '注册' }}
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            placeholder="请输入用户名"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            placeholder="请输入密码（至少 6 位）"
          />
        </div>

        <p v-if="error" class="text-red-500 text-sm bg-red-50 p-2 rounded">
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span v-if="submitting" class="inline-flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            处理中...
          </span>
          <span v-else>{{ mode === 'login' ? '登录' : '注册' }}</span>
        </button>
      </form>

      <p class="text-center text-xs text-gray-400 mt-6">
        全栈演示项目 &middot; Vue 3 + Express + AI Agent
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function handleSubmit() {
  error.value = ''
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(username.value, password.value)
    } else {
      await auth.register(username.value, password.value)
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || '操作失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>
