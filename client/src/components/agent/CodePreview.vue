<script setup lang="ts">
/**
 * 右侧代码预览面板
 * - 支持单文件或多文件（`blocks[]`）：多文件时顶栏增加文件 Tab 切换，仍用当前选中项驱动高亮与预览
 * - 「代码」：highlight.js；「预览」：仅当选中文件为含 `<template>` 的 Vue SFC 时可用
 * - 「下载 ZIP」：JSZip 打包全部 `filename` + 内容，便于本地解压后 npm install
 */
import { ref, computed, watch } from 'vue'
import type { CodeBlock } from '@/types'
import JSZip from 'jszip'
import hljs from 'highlight.js/lib/core'
import xml from 'highlight.js/lib/languages/xml'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('xml', xml)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)

const props = defineProps<{
  blocks: CodeBlock[]
  fileIndex: number
}>()

const emit = defineEmits<{
  'update:fileIndex': [index: number]
  close: []
}>()

const activeTab = ref<'code' | 'preview'>('code')
const copied = ref(false)
const zipLoading = ref(false)

const safeIndex = computed(() => {
  const len = props.blocks.length
  if (!len) return 0
  return Math.min(Math.max(0, props.fileIndex), len - 1)
})

watch(
  () => props.blocks.length,
  (len) => {
    if (len && props.fileIndex >= len) emit('update:fileIndex', 0)
  }
)

const current = computed(() => props.blocks[safeIndex.value])

const highlightedCode = computed(() => {
  const code = current.value?.code ?? ''
  const rawLang = current.value?.language ?? 'plaintext'
  try {
    const lang =
      rawLang === 'vue' || rawLang === 'tsx'
        ? 'xml'
        : rawLang === 'markdown'
          ? 'plaintext'
          : rawLang
    return hljs.highlight(code, { language: lang }).value
  } catch {
    return escapeHtml(code)
  }
})

const previewHtml = computed(() => {
  const code = current.value?.code ?? ''
  const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/)
  if (templateMatch) {
    return templateMatch[1].trim()
  }
  return `<div class="p-8 text-center text-gray-500">此类型的代码不支持实时预览</div>`
})

const canIframePreview = computed(() => {
  const lang = current.value?.language
  return lang === 'vue' && /<template>/.test(current.value?.code ?? '')
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(current.value?.code ?? '')
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // 剪贴板不可用等情况静默失败
  }
}

async function downloadZip() {
  if (!props.blocks.length) return
  zipLoading.value = true
  try {
    const zip = new JSZip()
    props.blocks.forEach((b, i) => {
      const name = b.filename || `file-${i}.txt`
      zip.file(name, b.code)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'project-scaffold.zip'
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    zipLoading.value = false
  }
}

function selectFile(i: number) {
  emit('update:fileIndex', i)
  activeTab.value = 'code'
}

const lineCount = computed(() => (current.value?.code ?? '').split('\n').length)

function shortName(path: string) {
  if (path.length <= 28) return path
  return '…' + path.slice(-26)
}
</script>

<template>
  <div class="h-full flex flex-col glass-panel">
    <!-- 多文件：横向 Tab -->
    <div
      v-if="blocks.length > 1"
      class="flex-shrink-0 px-2 py-2 border-b border-dark-700/50 overflow-x-auto flex gap-1"
    >
      <button
        v-for="(b, i) in blocks"
        :key="b.id"
        type="button"
        class="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono max-w-[200px] truncate transition"
        :class="
          i === safeIndex
            ? 'bg-primary-600/40 text-white border border-primary-500/50'
            : 'text-dark-400 hover:text-white hover:bg-dark-700/80 border border-transparent'
        "
        :title="b.filename || b.language"
        @click="selectFile(i)"
      >
        {{ b.filename ? shortName(b.filename) : b.language }}
      </button>
    </div>

    <!-- 顶栏：代码/预览 Tab、语言与行数、复制、下载 ZIP、关闭 -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-dark-700/50 flex-shrink-0 gap-2">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="flex gap-1 flex-shrink-0">
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition"
            :class="activeTab === 'code' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'"
            @click="activeTab = 'code'"
          >
            代码
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition"
            :class="activeTab === 'preview' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'"
            :disabled="!canIframePreview"
            @click="canIframePreview && (activeTab = 'preview')"
          >
            预览
          </button>
        </div>
        <span class="text-xs text-dark-500 font-mono truncate" :title="current?.filename">
          {{ current?.filename || current?.language }} · {{ lineCount }} 行
          <span v-if="blocks.length > 1" class="text-dark-600">（{{ safeIndex + 1 }}/{{ blocks.length }}）</span>
        </span>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="blocks.length >= 1"
          type="button"
          :disabled="zipLoading"
          class="px-3 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition disabled:opacity-50"
          @click="downloadZip"
        >
          {{ zipLoading ? '打包中…' : '下载 ZIP' }}
        </button>
        <button
          type="button"
          @click="copyCode"
          class="px-3 py-1.5 rounded-lg text-xs text-dark-400 hover:text-white hover:bg-dark-700 transition flex items-center gap-1.5"
        >
          <svg v-if="!copied" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <svg v-else class="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button type="button" @click="emit('close')" class="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden min-h-0">
      <div v-if="activeTab === 'code'" class="h-full overflow-auto p-4">
        <pre class="text-sm leading-relaxed font-mono"><code class="hljs" v-html="highlightedCode"></code></pre>
      </div>

      <div v-else class="h-full">
        <iframe
          v-if="canIframePreview"
          :srcdoc="`<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <script src='https://cdn.tailwindcss.com'><\/script>
  <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0;}</style>
</head>
<body class='bg-gray-50 min-h-screen'>
  ${previewHtml}
</body>
</html>`"
          class="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
        <div v-else class="h-full flex items-center justify-center text-dark-500 text-sm px-4 text-center">
          请切换到「.vue」且含 &lt;template&gt; 的文件以使用实时预览
        </div>
      </div>
    </div>
  </div>
</template>
