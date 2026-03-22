<template>
  <div class="min-h-screen bg-gray-50">
    <Navbar />

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- 统计卡片：数据来自 notesStore.stats，由 computed 聚合成 statCards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div
          v-for="stat in statCards"
          :key="stat.label"
          class="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
        >
          <p class="text-2xl font-bold" :class="stat.color">{{ stat.value }}</p>
          <p class="text-xs text-gray-500 mt-1">{{ stat.label }}</p>
        </div>
      </div>

      <!-- 工具栏：搜索（防抖）+ 收藏筛选 + 新建 -->
      <div class="flex flex-col sm:flex-row gap-3 mb-6">
        <div class="relative flex-1">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            placeholder="搜索笔记标题或内容..."
            class="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm"
          />
        </div>

        <div class="flex gap-2">
          <button
            :class="[
              filterFavorite
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              'px-3 py-2.5 border rounded-lg text-sm transition whitespace-nowrap',
            ]"
            @click="toggleFilter"
          >
            {{ filterFavorite ? '&#9733; 收藏' : '&#9734; 收藏' }}
          </button>
          <button
            @click="openCreate"
            class="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium whitespace-nowrap"
          >
            + 新建笔记
          </button>
        </div>
      </div>

      <!-- 列表加载中 -->
      <div v-if="notesStore.loading" class="text-center py-20 text-gray-400 text-sm">
        加载中...
      </div>

      <!-- 空状态：无数据或搜索无结果 -->
      <div v-else-if="notesStore.notes.length === 0" class="text-center py-20">
        <div class="text-5xl mb-4 opacity-30">&#128221;</div>
        <p class="text-gray-400 mb-4">
          {{ searchQuery ? '没有找到匹配的笔记' : '还没有笔记，开始记录吧' }}
        </p>
        <button
          v-if="!searchQuery"
          @click="openCreate"
          class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
        >
          创建第一条笔记
        </button>
      </div>

      <!-- 笔记卡片网格 -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="note in notesStore.notes"
          :key="note.id"
          @click="openEdit(note)"
          class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition cursor-pointer group"
        >
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-semibold text-gray-800 group-hover:text-indigo-600 transition line-clamp-1">
              {{ note.title }}
            </h3>
            <!-- @click.stop 阻止冒泡到卡片，避免误触打开编辑 -->
            <button
              @click.stop="notesStore.toggleFavorite(note.id)"
              class="text-lg ml-2 flex-shrink-0"
              :class="note.is_favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'"
            >
              {{ note.is_favorite ? '&#9733;' : '&#9734;' }}
            </button>
          </div>

          <p class="text-sm text-gray-500 line-clamp-3 mb-3 leading-relaxed">
            {{ note.content }}
          </p>

          <div class="flex items-center justify-between">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="tag in note.tags.slice(0, 3)"
                :key="tag"
                class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs"
              >
                {{ tag }}
              </span>
            </div>
            <span class="text-xs text-gray-400">
              {{ formatDate(note.updated_at) }}
            </span>
          </div>

          <div v-if="note.summary" class="mt-3 pt-3 border-t border-gray-100">
            <p class="text-xs text-purple-600 flex items-center gap-1">
              <span class="font-medium">AI</span>
              <span class="text-gray-400">{{ note.summary.slice(0, 60) }}...</span>
            </p>
          </div>
        </div>
      </div>
    </main>

    <!-- 弹窗：编辑/新建由 editingNote 是否为 null 区分 -->
    <NoteModal
      v-if="modalOpen"
      :note="editingNote"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 笔记管理页（Dashboard）
 * - 展示统计、搜索（输入防抖）、收藏筛选、笔记列表与弹窗编辑
 * - 统计与列表数据来自 Pinia notesStore；statCards 用 computed 派生，依赖变化时自动缓存更新
 */
import { ref, computed, onMounted } from 'vue'
import { useNotesStore, type Note } from '../stores/notes'
import Navbar from '../components/Navbar.vue'
import NoteModal from '../components/notes/NoteModal.vue'

const notesStore = useNotesStore()

const searchQuery = ref('')
const filterFavorite = ref(false)
const modalOpen = ref(false)
const editingNote = ref<Note | null>(null)

/**
 * 统计卡片配置：computed 仅在 notesStore.stats 等依赖变化时重算，避免模板内重复计算
 */
const statCards = computed(() => [
  { label: '全部笔记', value: notesStore.stats.total, color: 'text-indigo-600' },
  { label: '收藏', value: notesStore.stats.favorites, color: 'text-amber-500' },
  { label: 'AI 已分析', value: notesStore.stats.withAI, color: 'text-purple-600' },
  {
    label: '语言类型',
    value: notesStore.stats.languages.length,
    color: 'text-emerald-600',
  },
])

/** 搜索防抖定时器句柄：每次 input 先 clear 再 setTimeout，实现 300ms 内只触发一次 loadNotes */
let searchTimer: ReturnType<typeof setTimeout>

function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadNotes()
  }, 300)
}

function toggleFilter() {
  filterFavorite.value = !filterFavorite.value
  loadNotes()
}

/** 组装查询参数并调用 store 拉取列表 */
function loadNotes() {
  const params: Record<string, string> = {}
  if (searchQuery.value) params.q = searchQuery.value
  if (filterFavorite.value) params.favorite = '1'
  notesStore.fetchNotes(params)
}

function openCreate() {
  editingNote.value = null
  modalOpen.value = true
}

function openEdit(note: Note) {
  editingNote.value = { ...note }
  modalOpen.value = true
}

function onSaved() {
  modalOpen.value = false
  loadNotes()
  notesStore.fetchStats()
}

function onDeleted() {
  modalOpen.value = false
  loadNotes()
  notesStore.fetchStats()
}

/** 相对时间展示：与 UTC 字符串拼接 'Z' 解析，避免本地时区偏差 */
function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'Z')
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString('zh-CN')
}

onMounted(() => {
  notesStore.fetchNotes()
  notesStore.fetchStats()
})
</script>
