<script setup lang="ts">
/**
 * Monaco 封装：创建/销毁、v-model、主题与只读；外部 modelValue 与编辑器不一致时 setValue（换文件、重新生成）。
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { configureMonacoWorkers } from '@/monaco/setup'
import type * as Monaco from 'monaco-editor'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Monaco language id，如 typescript、html */
    language: string
    readonly?: boolean
    minimap?: boolean
  }>(),
  {
    readonly: false,
    minimap: true,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLElement | null>(null)
const editorRef = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
const monacoRef = shallowRef<typeof Monaco | null>(null)

const editorLanguage = computed(() => props.language || 'plaintext')

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
    emit('update:modelValue', editor.getValue())
  })
})

onBeforeUnmount(() => {
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
    const editor = editorRef.value
    if (!editor) return
    const next = v ?? ''
    if (next === editor.getValue()) return
    editor.setValue(next)
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
