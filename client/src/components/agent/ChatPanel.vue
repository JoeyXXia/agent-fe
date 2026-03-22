<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from './MessageBubble.vue'
import ThinkingIndicator from './ThinkingIndicator.vue'

const chatStore = useChatStore()
const inputText = ref('')
const messagesContainer = ref<HTMLDivElement>()

const suggestions = [
  '帮我生成一个登录表单组件',
  '创建一个数据表格组件，带搜索功能',
  '写一个响应式导航栏组件',
  '生成一个 Todo List 组件',
  '帮我写一个卡片列表组件',
]

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  await chatStore.sendMessage(text)
}

function handleSuggestion(text: string) {
  inputText.value = text
  handleSend()
}

function handlePreviewCode(code: string, language: string) {
  chatStore.setPreview(code, language)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => chatStore.messages.length, scrollToBottom)
watch(() => chatStore.streamingContent, scrollToBottom)
watch(() => chatStore.currentThinking.length, scrollToBottom)
</script>

<template>
  <div class="flex-1 flex flex-col h-full">
    <div class="px-6 py-4 border-b border-dark-700/50 glass-panel flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-white">
          {{ chatStore.activeConversation?.title || '前端智能助手' }}
        </h2>
        <p class="text-xs text-dark-400 mt-0.5">
          ReAct 架构 · 支持组件生成 / 代码分析 / 重构建议
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-dark-800 text-dark-300 border border-dark-700">
          {{ chatStore.messages.length }} 条消息
        </span>
      </div>
    </div>

    <div ref="messagesContainer" class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
      <div v-if="chatStore.messages.length === 0" class="h-full flex flex-col items-center justify-center">
        <div class="text-center max-w-md">
          <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-xl shadow-primary-500/20">
            A
          </div>
          <h3 class="text-xl font-semibold text-white mb-2">你好，我是 FE-Agent</h3>
          <p class="text-dark-400 text-sm mb-8">
            我可以帮你生成前端组件、分析代码、提供重构建议。<br />
            描述你的需求，我会规划执行步骤并调用工具完成任务。
          </p>

          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              class="text-left px-4 py-3 rounded-xl bg-dark-800/50 border border-dark-700/50 text-sm text-dark-300 hover:bg-dark-800 hover:text-white hover:border-dark-600 transition-all duration-200"
              @click="handleSuggestion(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </div>

      <template v-else>
        <MessageBubble
          v-for="msg in chatStore.messages"
          :key="msg.id"
          :message="msg"
          @preview-code="handlePreviewCode"
        />

        <ThinkingIndicator
          v-if="chatStore.isProcessing"
          :steps="chatStore.currentThinking"
          :tool-calls="chatStore.currentToolCalls"
        />
      </template>
    </div>

    <div class="px-6 py-4 border-t border-dark-700/50">
      <div class="flex items-end gap-3">
        <div class="flex-1 relative">
          <textarea
            v-model="inputText"
            @keydown="handleKeydown"
            :disabled="chatStore.isProcessing"
            placeholder="描述你想要生成的组件，或粘贴需要分析的代码..."
            rows="1"
            class="input-base resize-none min-h-[48px] max-h-[160px] pr-4"
            style="field-sizing: content;"
          ></textarea>
        </div>
        <button
          @click="handleSend"
          :disabled="!inputText.trim() || chatStore.isProcessing"
          class="btn-primary h-12 w-12 flex items-center justify-center rounded-xl flex-shrink-0"
        >
          <svg v-if="!chatStore.isProcessing" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
          <svg v-else class="h-5 w-5 animate-spin" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </button>
      </div>
      <p class="text-xs text-dark-600 mt-2 text-center">
        Agent 采用 ReAct 模式：推理 → 规划 → 工具调用 → 反思
      </p>
    </div>
  </div>
</template>
