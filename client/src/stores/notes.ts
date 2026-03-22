import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

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
}

export interface NoteStats {
  total: number
  favorites: number
  withAI: number
  languages: { language: string; count: number }[]
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const stats = ref<NoteStats>({
    total: 0,
    favorites: 0,
    withAI: 0,
    languages: [],
  })
  const loading = ref(false)

  async function fetchNotes(params?: Record<string, string>) {
    loading.value = true
    try {
      const { data } = await api.get('/notes', { params })
      notes.value = data
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    const { data } = await api.get('/notes/stats')
    stats.value = data
  }

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

  async function updateNote(id: number, updates: Partial<Note>) {
    const { data } = await api.put(`/notes/${id}`, updates)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) notes.value[idx] = data
    return data as Note
  }

  async function deleteNote(id: number) {
    await api.delete(`/notes/${id}`)
    notes.value = notes.value.filter((n) => n.id !== id)
    await fetchStats()
  }

  async function toggleFavorite(id: number) {
    const note = notes.value.find((n) => n.id === id)
    if (!note) return
    return updateNote(id, { is_favorite: !note.is_favorite } as any)
  }

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
  }
})
