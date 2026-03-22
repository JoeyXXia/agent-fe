<template>
  <!-- 全屏渐变背景 + 居中卡片：登录/注册入口 -->
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 px-4"
  >
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <!-- 品牌标题区 -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-800">AI DevStudio</h1>
        <p class="text-gray-500 mt-2 text-sm">智能开发工作台</p>
      </div>

      <!-- 登录 / 注册 模式切换：通过 mode 驱动同一表单的两种提交行为 -->
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

      <!-- 表单：@submit.prevent 阻止默认跳转，统一走 handleSubmit -->
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

        <!-- 服务端错误提示：仅在 error 有值时展示 -->
        <p v-if="error" class="text-red-500 text-sm bg-red-50 p-2 rounded">
          {{ error }}
        </p>

        <!-- 提交中禁用按钮，避免重复提交 -->
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
/**
 * 登录 / 注册页
 * - 使用单页内两种 mode（login | register），共用用户名与密码字段
 * - 通过 Pinia auth store 调用 login / register，与路由守卫配合完成会话
 */
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

/** 当前表单模式：决定提交时走登录还是注册 */
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
/** 接口或校验失败时的用户可见错误文案 */
const error = ref('')
/** 请求进行中，用于禁用按钮与展示 loading 状态 */
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
    // 后端统一错误结构：优先展示 response.data.error
    error.value = err.response?.data?.error || '操作失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>
