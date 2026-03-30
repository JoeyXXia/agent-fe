<script setup lang="ts">
/**
 * Monaco 封装：创建/销毁、v-model、主题与只读；外部 modelValue 与编辑器不一致时 setValue（换文件、重新生成）。
 * 可选 Yjs：`collab` 传入时由 MonacoBinding 接管模型与多光标 awareness，勿与 v-model 双向争抢。
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { configureMonacoWorkers } from '@/monaco/setup'
import type * as Monaco from 'monaco-editor'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Monaco language id，如 typescript、html */
    language: string
    readonly?: boolean
    minimap?: boolean
    /** 传入则启用 y-monaco 协作绑定（与 modelValue 的 setValue 互斥） */
    collab?: { ytext: Y.Text; awareness: Awareness } | null
  }>(),
  {
    readonly: false,
    minimap: true,
    collab: null,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLElement | null>(null)
const editorRef = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
const monacoRef = shallowRef<typeof Monaco | null>(null)
const monacoBindingRef = shallowRef<{ destroy: () => void } | null>(null)

const editorLanguage = computed(() => props.language || 'plaintext')
const collabActive = computed(() => !!(props.collab && props.collab.ytext))

function detachCollabBinding() {
  monacoBindingRef.value?.destroy()
  monacoBindingRef.value = null
}

async function attachCollabBinding(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  ytext: Y.Text,
  awareness: Awareness
) {
  detachCollabBinding()
  const { MonacoBinding } = await import('y-monaco')
  const model = editor.getModel()
  if (!model) return
  monacoBindingRef.value = new MonacoBinding(ytext, model, new Set([editor]), awareness)
}

onMounted(async () => {
  configureMonacoWorkers()
  const monaco = await import('monaco-editor')
  monacoRef.value = monaco

  if (!container.value) return

  monaco.editor.defineTheme('devstudio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d1117',
    },
  })
  monaco.editor.setTheme('devstudio-dark')

  const editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: editorLanguage.value,
    readOnly: props.readonly,
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: 'on',
    minimap: { enabled: props.minimap },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 2,
  })
  editorRef.value = editor

  editor.onDidChangeModelContent(() => {
    if (collabActive.value) return
    emit('update:modelValue', editor.getValue())
  })
})

onBeforeUnmount(() => {
  detachCollabBinding()
  editorRef.value?.dispose()
  editorRef.value = null
})

watch(editorLanguage, (lang) => {
  const editor = editorRef.value
  const monaco = monacoRef.value
  if (!editor || !monaco) return
  const model = editor.getModel()
  if (model) monaco.editor.setModelLanguage(model, lang)
})

watch(
  () => props.readonly,
  (ro) => {
    editorRef.value?.updateOptions({ readOnly: ro })
  }
)

watch(
  () => props.minimap,
  (enabled) => {
    editorRef.value?.updateOptions({ minimap: { enabled } })
  }
)

watch(
  () => props.modelValue,
  (v) => {
    if (collabActive.value) return
    const editor = editorRef.value
    if (!editor) return
    const next = v ?? ''
    if (next === editor.getValue()) return
    editor.setValue(next)
  }
)

watch(
  () => [editorRef.value, props.collab] as const,
  ([editor, collab]) => {
    if (!editor || !monacoRef.value) return
    if (!collab) {
      detachCollabBinding()
      return
    }
    void attachCollabBinding(monacoRef.value, editor, collab.ytext, collab.awareness)
  }
)
</script>

<template>
  <div ref="container" class="monaco-editor-host h-full w-full min-h-[120px]" />
</template>

<style scoped>
.monaco-editor-host :deep(.monaco-editor) {
  padding-top: 4px;
}
</style>
