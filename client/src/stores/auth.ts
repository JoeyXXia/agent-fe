/**
 * 认证状态模块（Pinia Store）
 *
 * 职责：集中管理登录态（JWT、用户信息），并与 Vue Router、localStorage 协同。
 *
 * 为何用 Composition API 风格的 Store：
 * - `defineStore(id, () => { ... })` 是 Pinia 的「Setup Store」写法，与 Vue 3 `<script setup>` 一致，
 *   用 `ref`/`computed` 定义状态，逻辑可按函数拆分，便于类型推断与组合。
 *
 * 持久化策略：
 * - 刷新页面后仍需保持登录，故在初始化时从 localStorage 读取 token/user；
 * - 登录成功或登出时同步写入/清除 localStorage，避免仅内存有值而刷新丢失。
 *
 * 与路由的配合：
 * - 登录成功后跳转仪表盘、登出后回登录页，把「认证结果」与「导航」绑在一起，减少页面层重复逻辑。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import router from '../router'

export const useAuthStore = defineStore('auth', () => {
  // 从 localStorage 恢复 JWT；无则空字符串。供 axios 拦截器等读取同源持久化凭证。
  const token = ref(localStorage.getItem('token') || '')
  // 用户信息与服务端约定结构一致；JSON.parse 在首次无数据时用 'null' 字符串得到 null。
  const user = ref<{ id: number; username: string } | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  /**
   * 派生状态：是否已登录
   * 使用 computed 而非手写布尔字段，保证与 token 单一数据源同步，避免「token 有值但 isLoggedIn 未更新」的不一致。
   */
  const isLoggedIn = computed(() => !!token.value)

  /**
   * 登录：调用后端换取 token 与用户资料，再统一走 setAuth 落盘并导航。
   */
  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password })
    setAuth(data.token, data.user)
  }

  /**
   * 注册：与登录共用 setAuth，因注册成功后通常直接视为已登录会话。
   */
  async function register(username: string, password: string) {
    const { data } = await api.post('/auth/register', { username, password })
    setAuth(data.token, data.user)
  }

  /**
   * 写入认证状态（内存 + localStorage）并进入应用主界面
   * 抽成单一函数的原因：login/register 路径不同但「会话建立」行为相同，避免重复维护存储与路由。
   */
  function setAuth(t: string, u: { id: number; username: string }) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
    router.push('/dashboard')
  }

  /**
   * 清除会话并回到登录页
   * 同时清理 localStorage，防止残留 token 被下次启动误读为已登录。
   */
  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  // 对外暴露：ref/computed 在组件中会自动解包；方法保持引用即可。
  return { token, user, isLoggedIn, login, register, logout }
})
