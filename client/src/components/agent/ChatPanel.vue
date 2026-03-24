<script setup lang="ts">
/**
 * 聊天主面板
 * - 展示当前会话标题、消息列表（或空态 + 快捷建议）、底部输入区
 * - 子组件 MessageBubble 通过 emit('previewCode') 上抛，本组件用 @preview-code 监听并转调 chatStore.setPreview
 * - 使用 watch 监听消息数量、流式内容、思考步骤长度，配合 nextTick 滚动到底部
 */
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from './MessageBubble.vue'
import ThinkingIndicator from './ThinkingIndicator.vue'

const chatStore = useChatStore()
const inputText = ref('')
/** 消息滚动容器 ref，用于 scrollTop = scrollHeight */
const messagesContainer = ref<HTMLDivElement>()

/** 空会话时展示的快捷文案，点击后填入并发送 */
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

/** 子组件「预览」按钮通过 emit 上抛，此处写入 store 以打开右侧 CodePreview */
function handlePreviewCode(code: string, language: string) {
  chatStore.setPreview(code, language)
}

/** Enter 发送、Shift+Enter 换行（默认 textarea 行为） */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/** DOM 更新后再滚动，确保新消息已渲染进高度计算 */
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

/**
 * 监听三类变化以跟随滚动到底部：
 * - messages.length：新消息
 * - streamingContent：流式输出过程中内容变长
 * - currentThinking.length：思考步骤追加
 */
watch(() => chatStore.messages.length, scrollToBottom)
watch(() => chatStore.streamingContent, scrollToBottom)
watch(() => chatStore.currentThinking.length, scrollToBottom)
</script>

<template>
  <div class="flex-1 flex flex-col h-full">
    <!-- 顶栏：会话标题与消息条数 -->
    <div class="px-6 py-4 border-b border-dark-700/50 glass-panel flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-white">
          {{ chatStore.activeConversation?.title || '前端智能助手' }}
        </h2>
        <p class="text-xs text-dark-400 mt-0.5">
          服务端 LLM（与笔记共用配置）· 失败时回退本地 ReAct
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="chatStore.isProcessing"
          type="button"
          @click="chatStore.cancelAgentRequest()"
          class="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition"
        >
          停止
        </button>
        <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-dark-800 text-dark-300 border border-dark-700">
          {{ chatStore.messages.length }} 条消息
        </span>
      </div>
    </div>

    <!-- 消息区：空态（建议按钮）或有消息 + 处理中指示器 -->
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

          <!-- 快捷建议：点击即发送 -->
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

        <!-- Agent 处理中：展示实时思考与工具调用 -->
        <ThinkingIndicator
          v-if="chatStore.isProcessing"
          :steps="chatStore.currentThinking"
          :tool-calls="chatStore.currentToolCalls"
        />
      </template>
    </div>

    <!-- 底部输入：处理中禁用，避免并发发送 -->
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
