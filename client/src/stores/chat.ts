import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, Conversation, ThinkingStep, ToolCallRecord } from '@/types'
import { agentCore } from '@/services/agent'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const isProcessing = ref(false)
  const streamingContent = ref('')
  const currentThinking = ref<ThinkingStep[]>([])
  const currentToolCalls = ref<ToolCallRecord[]>([])
  const showPreview = ref(false)
  const previewCode = ref('')
  const previewLanguage = ref('vue')

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) || null
  )

  const messages = computed(() => activeConversation.value?.messages || [])

  function createConversation(title?: string): Conversation {
    const conv: Conversation = {
      id: `conv_${Date.now()}`,
      title: title || '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    activeConversationId.value = conv.id
    return conv
  }

  function setActiveConversation(id: string) {
    activeConversationId.value = id
    showPreview.value = false
    previewCode.value = ''
  }

  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value[0]?.id || null
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isProcessing.value) return

    if (!activeConversation.value) {
      createConversation(content.slice(0, 20) + (content.length > 20 ? '...' : ''))
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    activeConversation.value!.messages.push(userMessage)
    activeConversation.value!.updatedAt = Date.now()

    isProcessing.value = true
    streamingContent.value = ''
    currentThinking.value = []
    currentToolCalls.value = []

    try {
      const response = await agentCore.run(
        content,
        (step) => {
          currentThinking.value = [...currentThinking.value, step]
        },
        (record) => {
          const idx = currentToolCalls.value.findIndex((tc) => tc.id === record.id)
          if (idx >= 0) {
            currentToolCalls.value[idx] = record
          } else {
            currentToolCalls.value = [...currentToolCalls.value, record]
          }
        },
        (chunk) => {
          streamingContent.value = chunk
        }
      )

      activeConversation.value!.messages.push(response)
      activeConversation.value!.updatedAt = Date.now()

      if (response.codeBlocks && response.codeBlocks.length > 0) {
        const block = response.codeBlocks[0]
        previewCode.value = block.code
        previewLanguage.value = block.language
        showPreview.value = true
      }

      if (activeConversation.value!.title === '新对话' || activeConversation.value!.title.endsWith('...')) {
        activeConversation.value!.title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
      }
    } catch (error) {
      const errorMsg: Message = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: '抱歉，处理你的请求时出现了问题。请稍后重试。',
        timestamp: Date.now(),
      }
      activeConversation.value!.messages.push(errorMsg)
    } finally {
      isProcessing.value = false
      streamingContent.value = ''
      currentThinking.value = []
      currentToolCalls.value = []
    }
  }

  function setPreview(code: string, language: string) {
    previewCode.value = code
    previewLanguage.value = language
    showPreview.value = true
  }

  function closePreview() {
    showPreview.value = false
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    isProcessing,
    streamingContent,
    currentThinking,
    currentToolCalls,
    showPreview,
    previewCode,
    previewLanguage,
    createConversation,
    setActiveConversation,
    deleteConversation,
    sendMessage,
    setPreview,
    closePreview,
  }
})
