<script setup lang="ts">
/**
 * 单条聊天消息气泡
 * - 根据 role 区分用户 / 助手样式；助手消息可含思考过程、工具调用与 Markdown 风格正文
 * - 使用 highlight.js 的 core + 按需 register 语言子模块，减小打包体并只高亮用到的语言
 * - 正文通过 computed 生成 HTML 字符串，由 v-html 渲染；动态代码块上的「预览」用事件委托，避免为每段代码单独绑定监听器
 *
 * v-html 安全说明：内容来自服务端/Agent 返回；模板内已对代码做 escapeHtml 回退与高亮输出。
 * 用户消息通常不含 HTML；若需严格 CSP，可改为仅信任白名单标签或使用 sanitizer。
 */
import { computed } from 'vue'
import type { Message, CodeBlock } from '@/types'
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
  message: Message
}>()

/** 声明向父组件抛出的事件：单段预览 / 多文件预览 */
const emit = defineEmits<{
  previewCode: [code: string, language: string]
  previewBlocks: [blocks: CodeBlock[]]
}>()

const isUser = computed(() => props.message.role === 'user')

/**
 * 将原始 Markdown 风格文本转为可 v-html 的字符串：
 * -  fenced 代码块：hljs.highlight；失败则 escapeHtml
 * - 预览按钮：data-code（encodeURIComponent）与 data-lang，供父级点击委托解析
 * - **粗体**、行内 `code`、换行转 <br />
 * computed 缓存：仅当 message.content 等依赖变化时重算
 */
const renderedContent = computed(() => {
  let content = props.message.content

  content = content.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const language = lang || 'plaintext'
      let highlighted: string
      try {
        highlighted = hljs.highlight(code.trim(), { language: language === 'vue' ? 'xml' : language }).value
      } catch {
        highlighted = escapeHtml(code.trim())
      }
      return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-dark-700">
        <div class="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-dark-700">
          <span class="text-xs text-dark-400 font-mono">${language}</span>
          <button class="preview-btn text-xs text-primary-400 hover:text-primary-300 transition" data-code="${encodeURIComponent(code.trim())}" data-lang="${language}">预览</button>
        </div>
        <pre class="p-4 overflow-x-auto bg-dark-900 text-sm leading-relaxed"><code class="hljs">${highlighted}</code></pre>
      </div>`
    }
  )

  content = content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
  content = content.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-dark-700 rounded text-primary-300 text-sm font-mono">$1</code>')
  content = content.replace(/\n/g, '<br />')

  return content
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 事件委托：点击冒泡到气泡根节点，仅当目标为 .preview-btn 时读取 dataset 并 emit
 * 这样 v-for 渲染的多条代码块无需每个按钮单独 @click
 */
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.classList.contains('preview-btn')) {
    const code = decodeURIComponent(target.dataset.code || '')
    const lang = target.dataset.lang || 'vue'
    emit('previewCode', code, lang)
  }
}
</script>

<template>
  <div
    class="flex gap-3 animate-slide-up"
    :class="isUser ? 'flex-row-reverse' : 'flex-row'"
    @click="handleClick"
  >
    <div class="flex-shrink-0">
      <div
        class="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-medium"
        :class="isUser
          ? 'bg-primary-500/20 text-primary-400'
          : 'bg-gradient-to-br from-primary-500 to-purple-500 text-white shadow-lg shadow-primary-500/20'"
      >
        {{ isUser ? 'U' : 'A' }}
      </div>
    </div>

    <div
      class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
      :class="isUser
        ? 'bg-primary-600 text-white rounded-tr-md'
        : 'bg-dark-800 text-dark-200 rounded-tl-md border border-dark-700/50'"
    >
      <!-- 助手消息：历史思考步骤（与流式区 ThinkingIndicator 互补） -->
      <div
        v-if="message.thinking && message.thinking.length > 0 && !isUser"
        class="mb-3 pb-3 border-b border-dark-700/50"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="h-3.5 w-3.5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs text-purple-400 font-medium">思考过程</span>
        </div>
        <div class="space-y-1">
          <div
            v-for="step in message.thinking"
            :key="step.id"
            class="text-xs text-dark-400 flex items-start gap-2"
          >
            <span class="flex-shrink-0 mt-0.5">
              <span v-if="step.type === 'planning'" class="text-blue-400">Plan</span>
              <span v-else-if="step.type === 'reasoning'" class="text-yellow-400">Think</span>
              <span v-else class="text-green-400">Check</span>
            </span>
            <span>{{ step.content }}</span>
          </div>
        </div>
      </div>

      <!-- 助手消息：工具调用摘要 -->
      <div
        v-if="message.toolCalls && message.toolCalls.length > 0 && !isUser"
        class="mb-3 pb-3 border-b border-dark-700/50"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="h-3.5 w-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs text-amber-400 font-medium">工具调用</span>
        </div>
        <div class="space-y-1.5">
          <div
            v-for="tc in message.toolCalls"
            :key="tc.id"
            class="flex items-center gap-2 text-xs"
          >
            <span
              class="h-1.5 w-1.5 rounded-full flex-shrink-0"
              :class="{
                'bg-green-400': tc.status === 'success',
                'bg-red-400': tc.status === 'error',
                'bg-yellow-400 animate-pulse': tc.status === 'running',
                'bg-dark-500': tc.status === 'pending',
              }"
            ></span>
            <span class="text-dark-300 font-mono">{{ tc.toolName }}</span>
            <span v-if="tc.duration" class="text-dark-500">{{ tc.duration }}ms</span>
          </div>
        </div>
      </div>

      <!-- 正文：HTML 由 computed 生成；见 script 顶部的安全说明 -->
      <div v-html="renderedContent"></div>

      <!-- 结构化多文件（如脚手架）：与 Markdown 内嵌代码块互补 -->
      <div
        v-if="!isUser && message.codeBlocks && message.codeBlocks.length > 0"
        class="mt-3 pt-3 border-t border-dark-700/50"
      >
        <button
          type="button"
          class="text-xs text-primary-400 hover:text-primary-300 font-medium"
          @click.stop="emit('previewBlocks', message.codeBlocks!)"
        >
          {{
            message.codeBlocks.length > 1
              ? `在右侧打开预览（${message.codeBlocks.length} 个文件）`
              : '在右侧打开预览'
          }}
        </button>
      </div>
    </div>
  </div>
</template>
