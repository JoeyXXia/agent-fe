<script setup lang="ts">
import { ref, computed } from 'vue'
import hljs from 'highlight.js/lib/core'
import xml from 'highlight.js/lib/languages/xml'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'

hljs.registerLanguage('xml', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)

const props = defineProps<{
  code: string
  language: string
}>()

const emit = defineEmits<{
  close: []
}>()

const activeTab = ref<'code' | 'preview'>('code')
const copied = ref(false)

const highlightedCode = computed(() => {
  try {
    const lang = props.language === 'vue' || props.language === 'tsx' ? 'xml' : props.language
    return hljs.highlight(props.code, { language: lang }).value
  } catch {
    return escapeHtml(props.code)
  }
})

const previewHtml = computed(() => {
  const templateMatch = props.code.match(/<template>([\s\S]*?)<\/template>/)
  if (templateMatch) {
    return templateMatch[1].trim()
  }
  return `<div class="p-8 text-center text-gray-500">此类型的代码不支持实时预览</div>`
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback
  }
}

const lineCount = computed(() => props.code.split('\n').length)
</script>

<template>
  <div class="h-full flex flex-col glass-panel">
    <div class="flex items-center justify-between px-4 py-3 border-b border-dark-700/50">
      <div class="flex items-center gap-3">
        <div class="flex gap-1">
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
            @click="activeTab = 'preview'"
          >
            预览
          </button>
        </div>
        <span class="text-xs text-dark-500 font-mono">{{ language }} · {{ lineCount }} 行</span>
      </div>

      <div class="flex items-center gap-2">
        <button
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
        <button @click="emit('close')" class="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <div v-if="activeTab === 'code'" class="h-full overflow-auto p-4">
        <pre class="text-sm leading-relaxed font-mono"><code class="hljs" v-html="highlightedCode"></code></pre>
      </div>

      <div v-else class="h-full">
        <iframe
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
      </div>
    </div>
  </div>
</template>
