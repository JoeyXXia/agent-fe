/**
 * Agent 对话模块（Pinia Store）
 *
 * 职责：多会话管理、当前会话与消息列表、发送消息时与 `agentCore` 协作，
 * 并维护「流式/中间态」UI 所需状态：思考步骤、工具调用、流式文本片段、代码预览等。
 *
 * 设计要点：
 * - `conversations` + `activeConversationId`：列表与当前选中分离，便于切换会话而不丢其他会话数据。
 * - `activeConversation`、`messages`：用 computed 从 id 与列表派生，单一数据源，避免消息数组重复存储。
 * - 回调模式：`agentCore.run` 通过多个回调推送 thinking / toolCalls / streaming chunk，
 *   Store 内聚这些副作用，组件只需订阅 ref/computed 即可响应式更新界面。
 * - `finally` 中清空 streaming/thinking/toolCalls：一轮请求结束后重置「进行中」UI，防止残留到下一轮。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, Conversation, ThinkingStep, ToolCallRecord } from '@/types'
import { agentCore, isAbortLike } from '@/services/agent'

export const useChatStore = defineStore('chat', () => {
  // 所有会话保存在内存；刷新页面会丢失（若需持久化可另行对接 localStorage 或后端）
  const conversations = ref<Conversation[]>([])
  // 当前选中的会话 id；null 表示未选中或列表为空
  const activeConversationId = ref<string | null>(null)
  // Agent 是否正在处理当前用户消息（禁用发送、显示加载等）
  const isProcessing = ref(false)
  // 当前轮次流式输出的累积或最新片段（由 agent 回调写入，完成后在 finally 清空）
  const streamingContent = ref('')
  // 当前轮次模型「思考」步骤列表，供 UI 展示推理过程
  const currentThinking = ref<ThinkingStep[]>([])
  // 当前轮次工具调用记录（含进行中/完成状态），id 相同则更新同一条
  const currentToolCalls = ref<ToolCallRecord[]>([])
  const showPreview = ref(false)
  const previewCode = ref('')
  const previewLanguage = ref('vue')
  /** 终止当前一轮 Agent 请求（远程 / 本地 ReAct / 流式输出） */
  const agentAbortController = ref<AbortController | null>(null)

  /**
   * 当前激活的会话对象
   * 由 id 在 conversations 中查找；找不到时为 null，发送消息前会据此决定是否新建会话
   */
  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) || null
  )

  /**
   * 当前会话下的消息列表
   * 使用可选链与默认空数组，避免 activeConversation 为 null 时组件侧反复判空
   */
  const messages = computed(() => activeConversation.value?.messages || [])

  /**
   * 新建会话并设为当前会话
   * id 用时间戳前缀保证客户端唯一；新会话插在列表头部便于用户快速看到
   */
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

  /**
   * 切换当前会话，并关闭代码预览、清空预览内容，避免上一会话的预览误显示在新会话下
   */
  function setActiveConversation(id: string) {
    activeConversationId.value = id
    showPreview.value = false
    previewCode.value = ''
  }

  /**
   * 删除会话；若删的是当前选中项，则自动 fallback 到列表中第一个会话或 null
   */
  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value[0]?.id || null
    }
  }

  /**
   * 发送用户消息并驱动 Agent 执行一轮回复
   *
   * 流程概要：
   * 1. 无激活会话时用首条消息摘要作为标题创建会话。
   * 2. 追加用户消息到当前会话 messages，更新 updatedAt。
   * 3. 置 isProcessing，清空上一轮 streaming/thinking/toolCalls。
   * 4. 调用 agentCore.run：通过回调实时更新思考、工具调用、流式内容。
   * 5. 成功则将完整 assistant 消息入列；若有代码块则打开预览。
   * 6. 失败则插入固定错误文案消息；finally 统一结束处理态并清空中间态 ref。
   */
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

    const ac = new AbortController()
    agentAbortController.value = ac

    try {
      const response = await agentCore.run(
        content,
        // 思考回调：每次追加新步骤，使用展开新数组以触发响应式更新（依赖替换引用）
        (step) => {
          currentThinking.value = [...currentThinking.value, step]
        },
        // 工具调用回调：同 id 更新已有项，否则追加；更新项时替换整条以反映状态变化
        (record) => {
          const idx = currentToolCalls.value.findIndex((tc) => tc.id === record.id)
          if (idx >= 0) {
            currentToolCalls.value[idx] = record
          } else {
            currentToolCalls.value = [...currentToolCalls.value, record]
          }
        },
        // 流式内容回调：当前实现将 chunk 直接赋给 streamingContent（由 agent 层约定语义）
        (chunk) => {
          streamingContent.value = chunk
        },
        {
          conversationMessages: activeConversation.value!.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          abortSignal: ac.signal,
        }
      )

      activeConversation.value!.messages.push(response)
      activeConversation.value!.updatedAt = Date.now()

      // 若回复中含代码块，默认展示第一段并打开预览面板
      if (response.codeBlocks && response.codeBlocks.length > 0) {
        const block = response.codeBlocks[0]
        previewCode.value = block.code
        previewLanguage.value = block.language
        showPreview.value = true
      }

      // 标题仍为占位「新对话」或由首条消息生成的省略标题时，用本次发送内容再更新一次标题
      if (activeConversation.value!.title === '新对话' || activeConversation.value!.title.endsWith('...')) {
        activeConversation.value!.title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
      }
    } catch (error) {
      if (isAbortLike(error)) {
        const stopMsg: Message = {
          id: `msg_stop_${Date.now()}`,
          role: 'assistant',
          content: '已停止生成。',
          timestamp: Date.now(),
        }
        activeConversation.value!.messages.push(stopMsg)
      } else {
        const errorMsg: Message = {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: '抱歉，处理你的请求时出现了问题。请稍后重试。',
          timestamp: Date.now(),
        }
        activeConversation.value!.messages.push(errorMsg)
      }
    } finally {
      agentAbortController.value = null
      isProcessing.value = false
      streamingContent.value = ''
      currentThinking.value = []
      currentToolCalls.value = []
    }
  }

  function cancelAgentRequest() {
    agentAbortController.value?.abort()
  }

  /** 手动打开预览并指定代码与高亮语言 */
  function setPreview(code: string, language: string) {
    previewCode.value = code
    previewLanguage.value = language
    showPreview.value = true
  }

  /** 仅关闭预览面板，不清空代码（便于再次打开时仍保留内容，视产品需求而定） */
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
    cancelAgentRequest,
    setPreview,
    closePreview,
  }
})
