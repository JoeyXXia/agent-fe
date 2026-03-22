/**
 * 前端 HTTP 客户端模块（Axios 封装）。
 *
 * 职责：
 * - 统一 API 基础地址、超时等默认配置；
 * - 通过请求拦截器在链路上自动附加 JWT（Bearer），避免每个业务请求手写鉴权头；
 * - 通过响应拦截器集中处理 401（未授权），清理本地会话并跳转登录页。
 *
 * 设计说明（责任链 / 拦截器链）：
 * Axios 的请求与响应各有一条「拦截器链」，请求按注册顺序正向执行，响应在成功/失败分支上
 * 依次处理。这与「责任链」思想类似：每个拦截器只处理自己关心的部分，再交给下一环；
 * 本模块将「注入 Token」与「401 统一登出」从业务代码中抽离，保持 API 调用的单一职责。
 */

import axios from 'axios'

/** 预配置的 Axios 实例，供全应用 `import api from '@/api'` 使用 */
const api = axios.create({
  // Vite 环境变量：开发/生产可指向不同后端；未配置时回退到同源 `/api`（常配合 dev 代理）
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

/**
 * 请求拦截器：在请求发出前同步执行。
 * 若 localStorage 中存在 `token`，则为本次请求设置 `Authorization: Bearer <token>`。
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * 响应拦截器：
 * - 成功分支：原样返回响应（`res => res`），不做变形；
 * - 失败分支：若 HTTP 状态为 401，则视为登录失效或无权访问，清除本地凭证并整页跳转到 `/login`，
 *   最后仍将 Promise 置为 rejected，便于调用方按需处理错误（如提示）。
 */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
