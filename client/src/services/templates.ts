/**
 * 组件模板注册表
 *
 * 职责：存储预定义的 Vue 组件模板，供 generateComponent 工具按关键词匹配使用
 *
 * 设计模式：注册表模式（Registry）—— 将模板集中管理，按关键词匹配检索
 *          策略模式（Strategy）—— 不同模板实现相同的 generate 接口，由运行时决定使用哪个
 *
 * 扩展方式：在 vueTemplates 数组中新增 ComponentTemplate 对象即可
 */

/** 组件模板接口：关键词 + 框架标识 + 代码生成函数 */
interface ComponentTemplate {
  keywords: string[]  // 匹配关键词（中英文），用于 findBestMatch 评分
  framework: string   // 框架标识（vue / react），用于过滤
  generate: (name: string, description: string) => string  // 生成完整 SFC 代码
}

/**
 * Vue 内置模板库
 *
 * 每个模板包含：
 * - keywords：触发匹配的关键词列表（同时支持中英文）
 * - generate：接受组件名，返回完整的 Vue SFC 字符串
 *   （使用 ES6 模板字面量 `` ` `` 生成多行代码）
 */
const vueTemplates: ComponentTemplate[] = [
  // ━━━ 模板 1：登录/注册表单 ━━━
  // 触发词：登录、login、表单、form、注册、register
  // 包含：reactive 表单状态、校验规则、loading 状态、错误提示
  {
    keywords: ['登录', 'login', '表单', 'form', '注册', 'register'],
    framework: 'vue',
    generate: (name: string) => `<script setup lang="ts">
import { ref, reactive } from 'vue'

interface FormState {
  username: string
  password: string
}

const form = reactive<FormState>({
  username: '',
  password: '',
})

const loading = ref(false)
const errorMsg = ref('')

const rules = {
  username: (val: string) => val.length >= 3 || '用户名至少3个字符',
  password: (val: string) => val.length >= 6 || '密码至少6个字符',
}

async function handleSubmit() {
  errorMsg.value = ''

  const usernameCheck = rules.username(form.username)
  if (usernameCheck !== true) { errorMsg.value = usernameCheck; return }
  const passwordCheck = rules.password(form.password)
  if (passwordCheck !== true) { errorMsg.value = passwordCheck; return }

  loading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1500))
    console.log('提交成功:', form)
  } catch (e) {
    errorMsg.value = '提交失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">欢迎回来</h1>
        <p class="text-gray-500 mt-2">请登录你的账户</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
          <input v-model="form.username" type="text" placeholder="请输入用户名"
            class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input v-model="form.password" type="password" placeholder="请输入密码"
            class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition" />
        </div>
        <div v-if="errorMsg" class="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{{ errorMsg }}</div>
        <button type="submit" :disabled="loading"
          class="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
          <span v-if="loading" class="inline-flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            登录中...
          </span>
          <span v-else>登 录</span>
        </button>
      </form>
    </div>
  </div>
</template>`,
  },
  // ━━━ 模板 2：卡片列表 ━━━
  // 触发词：卡片、card、展示、信息
  // 包含：响应式网格布局、hover 动画、标签、图片
  {
    keywords: ['卡片', 'card', '展示', '信息'],
    framework: 'vue',
    generate: (name: string) => `<script setup lang="ts">
import { ref } from 'vue'

interface CardItem {
  id: number
  title: string
  description: string
  image: string
  tags: string[]
  date: string
}

const cards = ref<CardItem[]>([
  { id: 1, title: '深入理解 Vue 3 响应式', description: '探索 Proxy 与 Reflect 如何驱动 Vue 3 的响应式系统...', image: 'https://picsum.photos/400/200?random=1', tags: ['Vue', '源码'], date: '2025-03-15' },
  { id: 2, title: 'TypeScript 高级类型体操', description: '掌握条件类型、映射类型、模板字面量类型等进阶用法...', image: 'https://picsum.photos/400/200?random=2', tags: ['TypeScript', '进阶'], date: '2025-03-12' },
  { id: 3, title: '前端性能优化实战', description: '从构建优化到运行时优化的全链路性能提升方案...', image: 'https://picsum.photos/400/200?random=3', tags: ['性能', '实战'], date: '2025-03-10' },
])

const hoveredId = ref<number | null>(null)
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
    <div v-for="card in cards" :key="card.id"
      class="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer"
      :class="{ 'scale-[1.02]': hoveredId === card.id }"
      @mouseenter="hoveredId = card.id" @mouseleave="hoveredId = null">
      <div class="h-48 overflow-hidden">
        <img :src="card.image" :alt="card.title" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
      </div>
      <div class="p-5">
        <div class="flex gap-2 mb-3">
          <span v-for="tag in card.tags" :key="tag" class="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full">{{ tag }}</span>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">{{ card.title }}</h3>
        <p class="text-gray-500 text-sm line-clamp-2 mb-3">{{ card.description }}</p>
        <div class="text-xs text-gray-400">{{ card.date }}</div>
      </div>
    </div>
  </div>
</template>`,
  },
  // ━━━ 模板 3：数据表格 ━━━
  // 触发词：表格、table、数据、列表、list
  // 包含：搜索过滤（computed）、状态徽章、响应式表格
  {
    keywords: ['表格', 'table', '数据', '列表', 'list'],
    framework: 'vue',
    generate: (name: string) => `<script setup lang="ts">
import { ref, computed } from 'vue'

interface TableRow {
  id: number
  name: string
  email: string
  role: string
  status: '活跃' | '禁用' | '待审核'
}

const data = ref<TableRow[]>([
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: '管理员', status: '活跃' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: '编辑', status: '活跃' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: '访客', status: '待审核' },
  { id: 4, name: '赵六', email: 'zhaoliu@example.com', role: '编辑', status: '禁用' },
])

const searchQuery = ref('')
const filteredData = computed(() =>
  data.value.filter(row => row.name.includes(searchQuery.value) || row.email.includes(searchQuery.value))
)

const statusStyle: Record<string, string> = {
  '活跃': 'bg-green-100 text-green-700',
  '禁用': 'bg-red-100 text-red-700',
  '待审核': 'bg-yellow-100 text-yellow-700',
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
    <div class="p-4 border-b border-gray-200 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900">用户管理</h2>
      <input v-model="searchQuery" type="text" placeholder="搜索用户..."
        class="px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
    </div>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">邮箱</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            <th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="row in filteredData" :key="row.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">{{ row.name[0] }}</div>
                <span class="font-medium text-gray-900">{{ row.name }}</span>
              </div>
            </td>
            <td class="px-6 py-4 text-gray-500 text-sm">{{ row.email }}</td>
            <td class="px-6 py-4 text-gray-500 text-sm">{{ row.role }}</td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 text-xs font-medium rounded-full" :class="statusStyle[row.status]">{{ row.status }}</span>
            </td>
            <td class="px-6 py-4">
              <button class="text-blue-600 hover:text-blue-800 text-sm font-medium">编辑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>`,
  },
  // ━━━ 模板 4：导航栏 ━━━
  // 触发词：导航、nav、header、菜单、menu
  // 包含：响应式导航（桌面/移动端）、backdrop-blur、hamburger 切换
  {
    keywords: ['导航', 'nav', 'header', '菜单', 'menu'],
    framework: 'vue',
    generate: (name: string) => `<script setup lang="ts">
import { ref } from 'vue'

const menuOpen = ref(false)
const activeItem = ref('首页')
const navItems = ['首页', '产品', '关于', '联系我们']
</script>

<template>
  <nav class="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600"></div>
          <span class="text-xl font-bold text-gray-900">Brand</span>
        </div>
        <div class="hidden md:flex items-center gap-1">
          <button v-for="item in navItems" :key="item"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            :class="activeItem === item ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'"
            @click="activeItem = item">{{ item }}</button>
        </div>
        <div class="hidden md:flex items-center gap-3">
          <button class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition">登录</button>
          <button class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">注册</button>
        </div>
        <button class="md:hidden p-2" @click="menuOpen = !menuOpen">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path v-if="!menuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
    <div v-if="menuOpen" class="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
      <button v-for="item in navItems" :key="item"
        class="block w-full text-left px-3 py-2 rounded-lg text-sm"
        :class="activeItem === item ? 'bg-blue-50 text-blue-600' : 'text-gray-600'"
        @click="activeItem = item; menuOpen = false">{{ item }}</button>
    </div>
  </nav>
</template>`,
  },
  // ━━━ 模板 5：待办事项 ━━━
  // 触发词：todo、待办、任务、task
  // 包含：CRUD 操作、computed 过滤、checkbox 双向绑定
  {
    keywords: ['todo', '待办', '任务', 'task'],
    framework: 'vue',
    generate: (name: string) => `<script setup lang="ts">
import { ref, computed } from 'vue'

interface Todo {
  id: number
  text: string
  completed: boolean
  createdAt: Date
}

const todos = ref<Todo[]>([
  { id: 1, text: '完成项目方案设计', completed: true, createdAt: new Date() },
  { id: 2, text: '编写单元测试', completed: false, createdAt: new Date() },
  { id: 3, text: '代码 Review', completed: false, createdAt: new Date() },
])

const newTodo = ref('')
let nextId = 4

const filter = ref<'all' | 'active' | 'completed'>('all')

const filteredTodos = computed(() => {
  if (filter.value === 'active') return todos.value.filter(t => !t.completed)
  if (filter.value === 'completed') return todos.value.filter(t => t.completed)
  return todos.value
})

const remaining = computed(() => todos.value.filter(t => !t.completed).length)

function addTodo() {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({ id: nextId++, text, completed: false, createdAt: new Date() })
  newTodo.value = ''
}

function removeTodo(id: number) {
  todos.value = todos.value.filter(t => t.id !== id)
}
</script>

<template>
  <div class="max-w-lg mx-auto p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">待办事项</h1>
    <div class="flex gap-2 mb-6">
      <input v-model="newTodo" @keyup.enter="addTodo" type="text" placeholder="添加新任务..."
        class="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
      <button @click="addTodo" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition">添加</button>
    </div>
    <div class="flex gap-2 mb-4">
      <button v-for="f in (['all', 'active', 'completed'] as const)" :key="f"
        class="px-3 py-1 rounded-full text-sm font-medium transition"
        :class="filter === f ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'"
        @click="filter = f">{{ f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成' }}</button>
    </div>
    <div class="space-y-2">
      <div v-for="todo in filteredTodos" :key="todo.id"
        class="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 group hover:shadow-sm transition">
        <input type="checkbox" v-model="todo.completed" class="h-5 w-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span class="flex-1" :class="{ 'line-through text-gray-400': todo.completed }">{{ todo.text }}</span>
        <button @click="removeTodo(todo.id)" class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition">
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </div>
    <p class="text-sm text-gray-400 mt-4">{{ remaining }} 项待完成</p>
  </div>
</template>`,
  },
]

/**
 * 兜底模板 —— 当没有任何关键词匹配时使用
 * 生成一个最简单的可关闭卡片组件
 */
const defaultVueTemplate: ComponentTemplate = {
  keywords: [],
  framework: 'vue',
  generate: (name: string, description: string) => `<script setup lang="ts">
import { ref } from 'vue'

const title = ref('${name}')
const isVisible = ref(true)
</script>

<template>
  <div v-if="isVisible" class="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-gray-900">{{ title }}</h2>
      <button @click="isVisible = false" class="p-1 rounded-lg hover:bg-gray-100 transition">
        <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
    <div class="text-gray-600">
      <p>这是通过 AI Agent 自动生成的组件。</p>
      <p class="mt-2 text-sm text-gray-400">你可以根据需要修改此组件的内容和样式。</p>
    </div>
  </div>
</template>`,
}

/**
 * 组件模板注册表 —— 管理所有模板，提供关键词匹配查询
 *
 * findBestMatch 算法：
 * 1. 过滤出目标框架的模板
 * 2. 对每个模板，统计描述中命中的关键词数（评分）
 * 3. 取评分最高的模板；如果全部为 0，返回 defaultVueTemplate
 */
class ComponentTemplateRegistry {
  private templates: ComponentTemplate[] = [...vueTemplates]

  findBestMatch(description: string, framework: string): ComponentTemplate {
    const lowerDesc = description.toLowerCase()
    let bestMatch: ComponentTemplate | null = null
    let bestScore = 0

    for (const template of this.templates) {
      if (template.framework !== framework) continue // 框架不匹配则跳过
      const score = template.keywords.filter((kw) => lowerDesc.includes(kw)).length
      if (score > bestScore) {
        bestScore = score
        bestMatch = template
      }
    }

    return bestMatch || defaultVueTemplate // 无匹配时使用兜底模板
  }
}

/** 导出单例供 generateComponent 工具使用 */
export const componentTemplates = new ComponentTemplateRegistry()
