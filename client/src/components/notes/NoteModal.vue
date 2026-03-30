<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-20 px-4">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="$emit('close')" />

      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 class="text-lg font-semibold text-gray-800">
            {{ isNew ? '新建笔记' : '编辑笔记' }}
          </h2>
          <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 transition text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <div v-if="!isNew && shareHint" class="text-xs rounded-lg px-3 py-2 bg-sky-50 text-sky-800 border border-sky-100">
            {{ shareHint }}
          </div>

          <div
            v-if="!isNew && note?.is_owner && shareWriteVisible"
            class="rounded-xl border border-gray-200 p-4 space-y-3"
          >
            <h3 class="text-sm font-semibold text-gray-800">共享与协作</h3>
            <p class="text-xs text-gray-500">
              添加用户的登录名后，对方可在笔记列表中看到该笔记；<strong>读写</strong>可与你一同实时编辑正文（需开启下方「实时协作」并连接成功）。
            </p>
            <div class="flex flex-wrap gap-2 items-end">
              <div class="flex-1 min-w-[140px]">
                <label class="block text-xs text-gray-500 mb-0.5">用户名</label>
                <input
                  v-model="shareUsername"
                  type="text"
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="对方的用户名"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">权限</label>
                <select
                  v-model="shareRole"
                  class="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="read">只读</option>
                  <option value="write">读写</option>
                </select>
              </div>
              <button
                type="button"
                @click="handleAddShare"
                :disabled="shareBusy || !shareUsername.trim()"
                class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                添加
              </button>
            </div>
            <p v-if="shareListError" class="text-xs text-red-500">{{ shareListError }}</p>
            <ul v-if="shareList.length" class="text-sm divide-y divide-gray-100 border border-gray-100 rounded-lg">
              <li
                v-for="s in shareList"
                :key="s.user_id"
                class="flex items-center justify-between px-3 py-2"
              >
                <span class="text-gray-700">{{ s.username }}</span>
                <span class="text-xs text-gray-500">{{ s.role === 'write' ? '读写' : '只读' }}</span>
                <button type="button" class="text-xs text-red-500 hover:underline" @click="handleRemoveShare(s.user_id)">
                  移除
                </button>
              </li>
            </ul>
          </div>

          <div
            v-if="!isNew && canCollab"
            class="flex flex-col gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 p-4"
          >
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input v-model="collabEnabled" type="checkbox" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <span class="text-sm font-medium text-emerald-900">实时协作（Yjs + WebSocket）</span>
            </label>
            <p class="text-xs text-emerald-800/80 leading-relaxed">
              开启后正文以协作文档为准；保存时仅提交标题与语言类型，避免与 CRDT 双写冲突。需后端可访问
              <code class="text-[11px] bg-white/80 px-1 rounded">/yjs</code>
              WebSocket（默认端口同 API）。
            </p>
            <p v-if="collabEnabled" class="text-xs text-emerald-900">
              <span v-if="wsStatus === 'connecting'">协同连接中…</span>
              <span v-else-if="wsStatus === 'connected' && !wsSynced">同步文档中…</span>
              <span v-else-if="wsStatus === 'connected' && wsSynced" class="text-emerald-700">已连接并同步</span>
              <span v-else class="text-amber-700">未连接（请检查网络与 VITE_WS_URL）</span>
            </p>
            <p v-if="presenceLine" class="text-xs text-gray-600">在线：{{ presenceLine }}</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              v-model="form.title"
              type="text"
              :readonly="titleReadonly"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm"
              :class="titleReadonly ? 'bg-gray-50 text-gray-600' : ''"
              placeholder="笔记标题"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">语言 / 类型</label>
            <select
              v-model="form.language"
              :disabled="languageDisabled"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm bg-white"
              :class="languageDisabled ? 'bg-gray-50' : ''"
            >
              <option v-for="lang in languages" :key="lang.value" :value="lang.value">
                {{ lang.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <textarea
              v-if="!useEditorSurface"
              v-model="form.content"
              :readonly="contentReadonly"
              rows="10"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm font-mono resize-y"
              :class="contentReadonly ? 'bg-gray-50' : ''"
              placeholder="在这里写下你的笔记、代码片段或技术总结..."
            />
            <div
              v-else
              class="w-full rounded-lg overflow-hidden border border-gray-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent min-h-[280px] h-[min(50vh,420px)] bg-[#0d1117]"
            >
              <MonacoEditor
                class="h-full min-h-[260px]"
                :model-value="form.content"
                :language="noteMonacoLanguage"
                :minimap="false"
                :readonly="contentReadonly"
                :collab="monacoCollab"
                @update:model-value="(v) => (form.content = v)"
              />
            </div>
          </div>

          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-purple-700">AI 智能分析</h3>
              <button
                @click="handleAI"
                :disabled="aiLoading || saving || !canAiAnalyze || aiDisabled"
                class="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <svg v-if="aiLoading" class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ aiLoading ? '分析中...' : 'AI 分析' }}
              </button>
            </div>

            <p v-if="!canAiAnalyze" class="text-xs text-purple-400">
              请填写标题和内容后再进行 AI 分析
            </p>
            <p v-else-if="!savedId" class="text-xs text-purple-400">
              尚未保存：点击「AI 分析」将先保存笔记再调用模型
            </p>

            <div v-if="aiSummary" class="mb-3">
              <p class="text-xs text-purple-500 mb-1 font-medium">摘要</p>
              <p class="text-sm text-gray-700 leading-relaxed">{{ aiSummary }}</p>
            </div>

            <div v-if="aiTags.length" class="flex flex-wrap gap-1.5">
              <span class="text-xs text-purple-500 font-medium mr-1">标签</span>
              <span
                v-for="tag in aiTags"
                :key="tag"
                class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
              >
                {{ tag }}
              </span>
            </div>

            <p v-if="aiError" class="text-xs text-red-500 mt-2">{{ aiError }}</p>
          </div>
        </div>

        <div class="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between rounded-b-2xl">
          <button
            v-if="!isNew && note?.is_owner"
            @click="handleDelete"
            :disabled="saving"
            class="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition"
          >
            删除
          </button>
          <div v-else />

          <div class="flex gap-2">
            <button @click="$emit('close')" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              取消
            </button>
            <button
              @click="() => handleSave()"
              :disabled="saving || !form.title.trim() || (!collabEnabled && !form.content.trim())"
              class="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <svg v-if="saving" class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ref, computed, onMounted, onUnmounted, watch, watchEffect, defineAsyncComponent } from 'vue'
import { useNotesStore, type Note } from '../../stores/notes'
import { useAuthStore } from '../../stores/auth'

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))

const props = defineProps<{
  note: Note | null
}>()

const emit = defineEmits<{
  close: []
  saved: [opts?: { keepOpen?: boolean }]
  deleted: []
}>()

const notesStore = useNotesStore()
const authStore = useAuthStore()

const isNew = computed(() => !props.note)
const savedId = ref<number | null>(props.note?.id ?? null)

const form = ref({
  title: props.note?.title ?? '',
  content: props.note?.content ?? '',
  language: props.note?.language ?? 'plaintext',
})

const saving = ref(false)
const aiLoading = ref(false)
const aiSummary = ref(props.note?.summary ?? '')
const aiTags = ref<string[]>(props.note?.tags ?? [])
const aiError = ref('')

const shareUsername = ref('')
const shareRole = ref<'read' | 'write'>('read')
const shareList = ref<{ user_id: number; username: string; role: string }[]>([])
const shareBusy = ref(false)
const shareListError = ref('')

const collabEnabled = ref(false)
const ydoc = ref<Y.Doc | null>(null)
const wsProvider = ref<WebsocketProvider | null>(null)
const wsStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
const wsSynced = ref(false)

const canAiAnalyze = computed(
  () => !!(form.value.title.trim() && (collabActive.value || form.value.content.trim()))
)

const shareWriteVisible = computed(() => props.note?.is_owner === true)

const shareHint = computed(() => {
  if (!props.note || props.note.is_owner) return ''
  const r = props.note.share_role
  if (r === 'read') return '你只拥有只读权限：可查看正文，无法编辑或删除。'
  if (r === 'write') return '共享「读写」：可编辑标题、语言与正文；删除仅所有者可操作。'
  return ''
})

const titleReadonly = computed(() => props.note?.share_role === 'read')
const languageDisabled = computed(() => props.note?.share_role === 'read')
const contentReadonly = computed(() => props.note?.share_role === 'read')

const aiDisabled = computed(() => props.note?.share_role === 'read')

const canCollab = computed(() => {
  if (isNew.value || !savedId.value) return false
  if (props.note?.is_owner) return true
  return props.note?.share_role === 'read' || props.note?.share_role === 'write'
})

const collabActive = computed(() => collabEnabled.value && !!ydoc.value && !!wsProvider.value)

const languages = [
  { value: 'plaintext', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'shell', label: 'Shell' },
  { value: 'other', label: '其他' },
]

const CODE_EDITOR_LANGS = new Set([
  'javascript',
  'typescript',
  'html',
  'css',
  'python',
  'sql',
  'markdown',
  'json',
  'shell',
])

const useCodeEditor = computed(() => CODE_EDITOR_LANGS.has(form.value.language))
/** 协作时使用 Monaco 以挂载 y-monaco */
const useEditorSurface = computed(() => useCodeEditor.value || collabEnabled.value)

function mapNoteLanguageToMonaco(lang: string): string {
  if (lang === 'shell') return 'plaintext'
  return lang
}

const noteMonacoLanguage = computed(() => mapNoteLanguageToMonaco(form.value.language))

const monacoCollab = computed(() => {
  if (!collabEnabled.value || !ydoc.value || !wsProvider.value) return null
  return {
    ytext: ydoc.value.getText('monaco'),
    awareness: wsProvider.value.awareness,
  }
})

function wsBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, '')
  const host = window.location.hostname
  return `ws://${host}:3001/yjs`
}

function startCollab() {
  const id = savedId.value
  if (!id || !authStore.user) return
  stopCollab()
  const doc = new Y.Doc()
  const token = localStorage.getItem('token') || ''
  const url = wsBaseUrl()
  const prov = new WebsocketProvider(url, `note:${id}`, doc, {
    params: { token },
  })
  prov.on('status', (ev: { status: string }) => {
    wsStatus.value = ev.status === 'connected' ? 'connected' : ev.status === 'connecting' ? 'connecting' : 'disconnected'
  })
  prov.on('sync', (synced: boolean) => {
    wsSynced.value = synced
  })
  prov.awareness.setLocalStateField('user', { name: authStore.user.username })
  ydoc.value = doc
  wsProvider.value = prov
}

function stopCollab() {
  wsProvider.value?.destroy()
  wsProvider.value = null
  ydoc.value = null
  wsStatus.value = 'disconnected'
  wsSynced.value = false
}

watch(collabEnabled, (on) => {
  if (on && canCollab.value) startCollab()
  else stopCollab()
})

const presenceLine = ref('')
watchEffect((onCleanup) => {
  const p = wsProvider.value
  if (!p || !collabEnabled.value) {
    presenceLine.value = ''
    return
  }
  const upd = () => {
    const states = p.awareness.getStates()
    const names = [...states.values()]
      .map((s: Record<string, unknown>) => (s.user as { name?: string } | undefined)?.name)
      .filter((n): n is string => Boolean(n))
    presenceLine.value = [...new Set(names)].join('、')
  }
  upd()
  p.awareness.on('update', upd)
  onCleanup(() => p.awareness.off('update', upd))
})

async function loadShares() {
  shareListError.value = ''
  if (!props.note?.is_owner || !savedId.value) return
  try {
    shareList.value = await notesStore.fetchNoteShares(savedId.value)
  } catch (e: unknown) {
    shareListError.value = (e as { response?: { data?: { error?: string } } }).response?.data?.error || '加载共享列表失败'
  }
}

async function handleAddShare() {
  if (!savedId.value || !shareUsername.value.trim()) return
  shareBusy.value = true
  shareListError.value = ''
  try {
    await notesStore.addNoteShare(savedId.value, shareUsername.value.trim(), shareRole.value)
    shareUsername.value = ''
    await loadShares()
  } catch (e: unknown) {
    shareListError.value = (e as { response?: { data?: { error?: string } } }).response?.data?.error || '添加失败'
  } finally {
    shareBusy.value = false
  }
}

async function handleRemoveShare(userId: number) {
  if (!savedId.value) return
  shareBusy.value = true
  shareListError.value = ''
  try {
    await notesStore.removeNoteShare(savedId.value, userId)
    await loadShares()
  } catch {
    shareListError.value = '移除失败'
  } finally {
    shareBusy.value = false
  }
}

function skipContentOnSave(): boolean {
  return !!(collabEnabled.value || props.note?.has_yjs_state)
}

async function handleSave(options?: { emitSaved?: boolean }) {
  const emitSaved = options?.emitSaved !== false
  saving.value = true
  try {
    if (savedId.value) {
      const payload: Record<string, unknown> = {
        title: form.value.title,
        language: form.value.language,
      }
      if (!skipContentOnSave()) payload.content = form.value.content
      await notesStore.updateNote(savedId.value, payload as any)
    } else {
      const created = await notesStore.createNote({
        title: form.value.title,
        content: form.value.content,
        language: form.value.language,
      })
      savedId.value = created.id
    }
    if (emitSaved) emit('saved')
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || '保存失败'
    alert(msg)
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!savedId.value || !props.note?.is_owner) return
  if (!confirm('确认删除这条笔记？')) return

  try {
    await notesStore.deleteNote(savedId.value)
    emit('deleted')
  } catch {
    alert('删除失败')
  }
}

async function handleAI() {
  if (!canAiAnalyze.value) return
  aiLoading.value = true
  aiError.value = ''
  try {
    if (!savedId.value) {
      await handleSave({ emitSaved: false })
      if (!savedId.value) return
    }
    const result = await notesStore.aiAnalyze(savedId.value)
    aiSummary.value = result.summary
    aiTags.value = result.tags
    emit('saved', { keepOpen: true })
  } catch (err: unknown) {
    aiError.value = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'AI 分析失败'
  } finally {
    aiLoading.value = false
  }
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  void loadShares()
})

onUnmounted(() => {
  document.body.style.overflow = ''
  stopCollab()
})
</script>
