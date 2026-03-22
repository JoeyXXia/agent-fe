import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import router from '../router'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<{ id: number; username: string } | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  const isLoggedIn = computed(() => !!token.value)

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password })
    setAuth(data.token, data.user)
  }

  async function register(username: string, password: string) {
    const { data } = await api.post('/auth/register', { username, password })
    setAuth(data.token, data.user)
  }

  function setAuth(t: string, u: { id: number; username: string }) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
    router.push('/dashboard')
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  return { token, user, isLoggedIn, login, register, logout }
})
