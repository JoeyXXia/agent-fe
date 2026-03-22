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
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              v-model="form.title"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm"
              placeholder="笔记标题"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">语言 / 类型</label>
            <select
              v-model="form.language"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm bg-white"
            >
              <option v-for="lang in languages" :key="lang.value" :value="lang.value">
                {{ lang.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <textarea
              v-model="form.content"
              rows="10"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm font-mono resize-y"
              placeholder="在这里写下你的笔记、代码片段或技术总结..."
            />
          </div>

          <div class="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-purple-700">AI 智能分析</h3>
              <button
                @click="handleAI"
                :disabled="aiLoading || !savedId"
                class="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <svg v-if="aiLoading" class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ aiLoading ? '分析中...' : 'AI 分析' }}
              </button>
            </div>

            <p v-if="!savedId" class="text-xs text-purple-400">
              请先保存笔记后再进行 AI 分析
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
            v-if="!isNew"
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
              @click="handleSave"
              :disabled="saving || !form.title.trim() || !form.content.trim()"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNotesStore, type Note } from '../../stores/notes'

const props = defineProps<{
  note: Note | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
  deleted: []
}>()

const notesStore = useNotesStore()

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

async function handleSave() {
  saving.value = true
  try {
    if (savedId.value) {
      await notesStore.updateNote(savedId.value, {
        title: form.value.title,
        content: form.value.content,
        language: form.value.language,
      } as any)
    } else {
      const created = await notesStore.createNote({
        title: form.value.title,
        content: form.value.content,
        language: form.value.language,
      })
      savedId.value = created.id
    }
    emit('saved')
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!savedId.value) return
  if (!confirm('确认删除这条笔记？')) return

  try {
    await notesStore.deleteNote(savedId.value)
    emit('deleted')
  } catch {
    alert('删除失败')
  }
}

async function handleAI() {
  if (!savedId.value) return
  aiLoading.value = true
  aiError.value = ''
  try {
    const result = await notesStore.aiAnalyze(savedId.value)
    aiSummary.value = result.summary
    aiTags.value = result.tags
  } catch (err: any) {
    aiError.value = err.response?.data?.error || 'AI 分析失败'
  } finally {
    aiLoading.value = false
  }
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>
