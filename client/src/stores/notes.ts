/**
 * 笔记数据模块（Pinia Store）
 *
 * 职责：笔记列表与统计的拉取、创建/更新/删除、收藏切换、AI 分析结果写回。
 *
 * 数据流特点（与「乐观更新」的对比）：
 * - 本 Store 在多数写操作上是「等服务端成功返回后再更新本地 `notes`/`stats`」，
 *   保证列表与数据库一致；若需乐观更新，通常会先改 UI、失败再回滚，本实现未采用该模式。
 * - `createNote` 在 POST 成功后 `unshift` 新项，属于「确认成功后的即时列表更新」，用户体验仍较流畅。
 *
 * 为何单独维护 `stats`：
 * - 统计（总数、收藏、含 AI 摘要语言分布等）若每次从 `notes` 全量计算可能昂贵或与后端口径不一致；
 *   通过 `/notes/stats` 与列表解耦，在变更后 `fetchStats` 保持仪表盘数字准确。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

/** 单条笔记：字段名与后端/API 对齐（如 snake_case 的 is_favorite），便于直接赋值 */
export interface Note {
  id: number
  title: string
  content: string
  language: string
  tags: string[]
  summary: string
  is_favorite: boolean
  created_at: string
  updated_at: string
  /** 是否本人所有 */
  is_owner?: boolean
  share_role?: 'owner' | 'read' | 'write' | null
  /** 服务端是否已有 Yjs 快照（此后勿 REST 改 content） */
  has_yjs_state?: boolean
}

export interface NoteShare {
  user_id: number
  username: string
  role: 'read' | 'write'
}

/** 笔记聚合统计：用于概览页展示，与列表接口分离 */
export interface NoteStats {
  total: number
  favorites: number
  withAI: number
  languages: { language: string; count: number }[]
}

export const useNotesStore = defineStore('notes', () => {
  // 当前页/筛选条件下的笔记列表（由 fetchNotes 整体替换）
  const notes = ref<Note[]>([])
  const stats = ref<NoteStats>({
    total: 0,
    favorites: 0,
    withAI: 0,
    languages: [],
  })
  // 列表请求进行中标记，供 UI 显示加载态、防止重复提交
  const loading = ref(false)

  /**
   * 拉取笔记列表
   * @param params 可选查询参数（筛选、分页等由后端约定），透传给 axios `params`
   */
  async function fetchNotes(params?: Record<string, string>) {
    loading.value = true
    try {
      const { data } = await api.get('/notes', { params })
      notes.value = data
    } finally {
      // 无论成功失败都结束 loading，避免界面永久转圈
      loading.value = false
    }
  }

  /** 拉取统计信息，通常在列表大幅变更后调用以保持侧边栏/仪表盘同步 */
  async function fetchStats() {
    const { data } = await api.get('/notes/stats')
    stats.value = data
  }

  /**
   * 创建笔记：服务端生成 id 与时间戳后返回完整对象，再插入列表首部并刷新统计
   * unshift 使最新笔记出现在顶部，符合常见「时间倒序」交互
   */
  async function createNote(payload: {
    title: string
    content: string
    language?: string
  }) {
    const { data } = await api.post('/notes', payload)
    notes.value.unshift(data)
    await fetchStats()
    return data as Note
  }

  /**
   * 更新笔记：PUT 返回最新实体，按 id 定位数组项并替换，保持引用更新以触发视图刷新
   */
  async function updateNote(id: number, updates: Partial<Note>) {
    const { data } = await api.put(`/notes/${id}`, updates)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) notes.value[idx] = data
    return data as Note
  }

  /**
   * 删除笔记：先调 DELETE，成功后再从本地数组移除并刷新统计，避免「请求失败但 UI 已删」的不一致
   */
  async function deleteNote(id: number) {
    await api.delete(`/notes/${id}`)
    notes.value = notes.value.filter((n) => n.id !== id)
    await fetchStats()
  }

  /**
   * 切换收藏：先读当前项再取反，复用 updateNote 走统一更新与后端校验路径
   * `as any` 用于 Partial 与字段类型的窄化，仅传 is_favorite 补丁
   */
  async function toggleFavorite(id: number) {
    const note = notes.value.find((n) => n.id === id)
    if (!note) return
    return updateNote(id, { is_favorite: !note.is_favorite } as any)
  }

  /**
   * AI 分析：后端返回 summary/tags，就地更新列表中对应项并刷新统计（如 withAI 计数）
   * 仅更新必要字段，避免整表替换带来的滚动位置丢失等问题
   */
  async function aiAnalyze(id: number) {
    const { data } = await api.post(`/notes/${id}/ai-analyze`)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      notes.value[idx].summary = data.summary
      notes.value[idx].tags = data.tags
    }
    await fetchStats()
    return data as { summary: string; tags: string[] }
  }

  async function fetchNoteShares(noteId: number) {
    const { data } = await api.get<NoteShare[]>(`/notes/${noteId}/shares`)
    return data
  }

  async function addNoteShare(noteId: number, username: string, role: 'read' | 'write') {
    const { data } = await api.post<NoteShare>(`/notes/${noteId}/shares`, { username, role })
    return data
  }

  async function removeNoteShare(noteId: number, userId: number) {
    await api.delete(`/notes/${noteId}/shares/${userId}`)
  }

  return {
    notes,
    stats,
    loading,
    fetchNotes,
    fetchStats,
    createNote,
    updateNote,
    deleteNote,
    toggleFavorite,
    aiAnalyze,
    fetchNoteShares,
    addNoteShare,
    removeNoteShare,
  }
})
