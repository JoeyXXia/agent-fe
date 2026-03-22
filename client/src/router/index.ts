/**
 * Vue Router 4 应用路由定义与全局导航守卫。
 *
 * 职责：
 * - 使用 HTML5 History 模式（`createWebHistory`）配置路由表；
 * - 对需登录页使用 `meta.auth`，对「仅访客」页（如登录）使用 `meta.guest`；
 * - 通过 `beforeEach` 在每次导航前根据 token 决定是否放行、重定向到登录或仪表盘；
 * - 业务页面采用动态 `import()` 懒加载，减小首屏 bundle、按路由分包。
 *
 * 概念速览：
 * - 导航守卫：`beforeEach` 在路由确认前运行，可调用 `next()`、`next('/path')` 或 `next(false)` 控制去向；
 * - `meta`：路由元信息，供守卫与组件读取，本文件用其标记「需要鉴权」与「仅访客」；
 * - 懒加载：`component: () => import('...')` 返回 Promise，Vue Router 在首次进入该路由时再加载 chunk。
 */

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  /** 使用浏览器 History API，URL 无 `#`，需服务端对 SPA 做 fallback 配置（生产环境） */
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      /** 路由级代码分割：首次访问 `/login` 时才加载 Login 组件对应的 chunk */
      component: () => import('../pages/Login.vue'),
      /** 仅访客：已登录用户访问时应被重定向到主界面，避免重复登录页 */
      meta: { guest: true },
    },
    {
      path: '/dashboard',
      component: () => import('../pages/Dashboard.vue'),
      /** 需要登录：无 token 时守卫会重定向到 `/login` */
      meta: { auth: true },
    },
    {
      path: '/agent',
      component: () => import('../pages/AgentWorkbench.vue'),
      meta: { auth: true },
    },
  ],
})

/**
 * 全局前置守卫：任意路由切换前执行。
 *
 * - 目标路由声明了 `meta.auth` 且本地无 token → 重定向到 `/login`；
 * - 目标路由声明了 `meta.guest` 且已有 token → 重定向到 `/dashboard`（已登录不必再看登录页）；
 * - 其余情况 `next()` 放行。
 *
 * 第二个参数为 `from` 路由，此处用 `_` 省略未使用。
 */
router.beforeEach((to, _, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.auth && !token) return next('/login')
  if (to.meta.guest && token) return next('/dashboard')
  next()
})

export default router
