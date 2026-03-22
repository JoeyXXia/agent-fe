import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      component: () => import('../pages/Login.vue'),
      meta: { guest: true },
    },
    {
      path: '/dashboard',
      component: () => import('../pages/Dashboard.vue'),
      meta: { auth: true },
    },
    {
      path: '/agent',
      component: () => import('../pages/AgentWorkbench.vue'),
      meta: { auth: true },
    },
  ],
})

router.beforeEach((to, _, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.auth && !token) return next('/login')
  if (to.meta.guest && token) return next('/dashboard')
  next()
})

export default router
