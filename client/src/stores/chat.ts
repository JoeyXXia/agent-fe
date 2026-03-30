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
import type {
  Message,
  Conversation,
  ThinkingStep,
  ToolCallRecord,
  UserPreferences,
  CodeBlock,
} from '@/types'
import api from '@/api'
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
  /** 右侧预览：多文件时为多条；单文件时长度为 1 */
  const previewBlocks = ref<CodeBlock[]>([])
  const previewFileIndex = ref(0)
  /** 终止当前一轮 Agent 请求（远程 / 本地 ReAct / 流式输出） */
  const agentAbortController = ref<AbortController | null>(null)
  /** 短期记忆窗口：只保留最近 N 条消息给 LLM / 本地 ReAct */
  const SHORT_TERM_MESSAGE_LIMIT = 12

  const DEFAULT_PREFERENCES: UserPreferences = {
    defaultFramework: 'vue',
    namingStyle: 'PascalCase 组件名 + camelCase 变量名',
    replyLanguage: 'zh',
    defaultExpandCodePreview: true,
    techStack: ['Vue', 'TypeScript', 'Tailwind'],
  }

  /** 用户长期偏好：绑定账号、跨会话生效 */
  const preferences = ref<UserPreferences>(DEFAULT_PREFERENCES)

  /** 后端会话同步是否已完成（页面刷新后会重新拉取） */
  const backendSessionsLoaded = ref(false)
  const backendSessionsLoadInFlight = ref<Promise<void> | null>(null)
  /** 单个会话消息加载中的去重，避免并发重复请求 */
  const messagesLoadInFlight = new Map<number, Promise<void>>()

  /** 偏好加载是否完成（页面刷新后会重新拉取） */
  const backendPreferencesLoaded = ref(false)
  const backendPreferencesLoadInFlight = ref<Promise<void> | null>(null)

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

  function convToServerTitle(title?: string) {
    // 后端在 title 为空时用默认 'New Chat'
    return title || '新对话'
  }

  async function syncBackendSessions() {
    if (backendSessionsLoaded.value) return
    if (backendSessionsLoadInFlight.value) return backendSessionsLoadInFlight.value

    backendSessionsLoadInFlight.value = (async () => {
      try {
        const { data } = await api.get('/agent/sessions')
        const rows = Array.isArray(data) ? data : []

        conversations.value = rows.map((r: any) => {
          const id = Number(r.id)
          return {
            id: `conv_${id}`,
            serverSessionId: Number.isFinite(id) ? id : undefined,
            title: String(r.title || '新对话'),
            messages: [],
            createdAt: Date.parse(String(r.created_at || '')) || Date.now(),
            updatedAt: Date.parse(String(r.updated_at || '')) || Date.now(),
          } satisfies Conversation
        })

        activeConversationId.value =
          conversations.value[0]?.id ?? null
      } finally {
        backendSessionsLoaded.value = true
        backendSessionsLoadInFlight.value = null
      }
    })()

    return backendSessionsLoadInFlight.value
  }

  async function ensureBackendSessionForConversation(
    conv: Conversation
  ): Promise<number | null> {
    if (conv.serverSessionId && Number.isFinite(conv.serverSessionId)) return conv.serverSessionId

    const { data } = await api.post('/agent/sessions', {
      title: convToServerTitle(conv.title),
    })

    const serverId = Number((data as any)?.id)
    if (Number.isFinite(serverId)) {
      conv.serverSessionId = serverId
      return serverId
    }
    return null
  }

  async function ensureMessagesLoaded(conv: Conversation) {
    if (!conv.serverSessionId || conv.messages.length > 0) return

    const serverId = conv.serverSessionId
    if (messagesLoadInFlight.has(serverId)) {
      await messagesLoadInFlight.get(serverId)!
      return
    }

    const p = (async () => {
      const { data } = await api.get(`/agent/sessions/${serverId}/messages`)
      const rows = Array.isArray(data) ? data : []

      const mapped: Message[] = rows.map((m: any) => {
        const metadata = (m.metadata && typeof m.metadata === 'object' ? m.metadata : {}) as {
          thinking?: ThinkingStep[]
          toolCalls?: ToolCallRecord[]
          codeBlocks?: Array<{
            id: string
            language: string
            code: string
            filename?: string
          }>
        }

        return {
          id: String(m.id),
          role: m.role as Message['role'],
          content: String(m.content ?? ''),
          timestamp: Date.parse(String(m.created_at || '')) || Date.now(),
          thinking: metadata.thinking,
          toolCalls: metadata.toolCalls,
          codeBlocks: metadata.codeBlocks,
        } satisfies Message
      })

      conv.messages = mapped
      conv.updatedAt = Date.now()
    })()

    messagesLoadInFlight.set(serverId, p)
    try {
      await p
    } finally {
      messagesLoadInFlight.delete(serverId)
    }
  }

  /**
   * 拉取后端用户偏好：用于跨会话的个性化默认行为
   */
  async function loadBackendPreferences() {
    if (backendPreferencesLoaded.value) return
    if (backendPreferencesLoadInFlight.value) return backendPreferencesLoadInFlight.value

    backendPreferencesLoadInFlight.value = (async () => {
      try {
        const { data } = await api.get('/agent/preferences')
        const pf = data || {}
        preferences.value = {
          defaultFramework: pf.defaultFramework === 'react' ? 'react' : 'vue',
          namingStyle:
            typeof pf.namingStyle === 'string' && pf.namingStyle.trim()
              ? pf.namingStyle.trim().slice(0, 200)
              : DEFAULT_PREFERENCES.namingStyle,
          replyLanguage: pf.replyLanguage === 'en' || pf.replyLanguage === 'auto' || pf.replyLanguage === 'zh' ? pf.replyLanguage : 'zh',
          defaultExpandCodePreview: Boolean(pf.defaultExpandCodePreview),
          techStack: Array.isArray(pf.techStack) ? pf.techStack.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 30) : DEFAULT_PREFERENCES.techStack,
        }
      } catch {
        preferences.value = DEFAULT_PREFERENCES
      } finally {
        backendPreferencesLoaded.value = true
        backendPreferencesLoadInFlight.value = null
      }
    })()

    return backendPreferencesLoadInFlight.value
  }

  async function appendMessageToBackend(
    serverSessionId: number,
    message: Message
  ): Promise<{ id: number; role: Message['role']; content: string; createdAt: number }> {
    const { data } = await api.post(`/agent/sessions/${serverSessionId}/messages`, {
      role: message.role,
      content: message.content,
      metadata: {
        thinking: message.thinking,
        toolCalls: message.toolCalls,
        codeBlocks: message.codeBlocks,
      },
    })

    const msgId = Number((data as any)?.id)
    const createdAt =
      Date.parse(String((data as any)?.created_at || '')) || Date.now()

    return {
      id: Number.isFinite(msgId) ? msgId : 0,
      role: (data as any)?.role as Message['role'],
      content: String((data as any)?.content ?? message.content),
      createdAt,
    }
  }

  /**
   * 切换当前会话，并关闭代码预览、清空预览内容，避免上一会话的预览误显示在新会话下
   */
  function setActiveConversation(id: string) {
    activeConversationId.value = id
    showPreview.value = false
    previewBlocks.value = []
    previewFileIndex.value = 0
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) void ensureMessagesLoaded(conv)
  }

  /**
   * 删除会话；若删的是当前选中项，则自动 fallback 到列表中第一个会话或 null
   */
  async function deleteConversation(id: string) {
    const conv = conversations.value.find((c) => c.id === id)
    const serverId = conv?.serverSessionId

    if (serverId) {
      await api.delete(`/agent/sessions/${serverId}`)
    }

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

    const conv = activeConversation.value!
    // 如果当前是默认标题，第一次发送时用用户输入生成一个更可读的标题；
    // 这样后端创建 session 时也能持久化该标题（无需额外“更新标题”接口）。
    if (conv.serverSessionId == null && (conv.title === '新对话' || conv.title === 'New Chat')) {
      conv.title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
    }
    // 先确保后端 session 与消息就绪，保证 LLM 上下文“对齐到后端短期记忆”
    const serverSessionId = await ensureBackendSessionForConversation(conv)
    if (!serverSessionId) throw new Error('failed to create backend session')
    await ensureMessagesLoaded(conv)

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    conv.messages.push(userMessage)
    conv.updatedAt = Date.now()

    isProcessing.value = true
    streamingContent.value = ''
    currentThinking.value = []
    currentToolCalls.value = []

    const ac = new AbortController()
    agentAbortController.value = ac

    try {
      // 先把用户消息落盘到后端
      const persistedUser = await appendMessageToBackend(serverSessionId, userMessage)
      userMessage.id = String(persistedUser.id)
      userMessage.timestamp = persistedUser.createdAt

      const shortTermMessages = activeConversation.value!.messages.slice(
        -SHORT_TERM_MESSAGE_LIMIT
      )
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
          conversationMessages: shortTermMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          abortSignal: ac.signal,
          userPreferences: preferences.value,
        }
      )

      conv.messages.push(response)
      conv.updatedAt = Date.now()

      // 再把助手消息落盘到后端，并修正 message.id/timestamp 以和后端对齐
      const persistedAssistant = await appendMessageToBackend(
        serverSessionId,
        response
      )
      response.id = String(persistedAssistant.id)
      response.timestamp = persistedAssistant.createdAt

      // 若回复中含代码块，打开预览（多文件时右侧可切换 / 打包下载）
      if (response.codeBlocks && response.codeBlocks.length > 0) {
        setPreviewBlocks(response.codeBlocks)
        showPreview.value = preferences.value.defaultExpandCodePreview
      }
    } catch (error) {
      if (isAbortLike(error)) {
        const stopMsg: Message = {
          id: `msg_stop_${Date.now()}`,
          role: 'assistant',
          content: '已停止生成。',
          timestamp: Date.now(),
        }
        try {
          const persistedStop = await appendMessageToBackend(serverSessionId, stopMsg)
          stopMsg.id = String(persistedStop.id)
          stopMsg.timestamp = persistedStop.createdAt
        } catch {
          // 中止/异常时不强制影响 UI：后端失败则只是刷新后少一条提示消息
        }
        conv.messages.push(stopMsg)
        conv.updatedAt = Date.now()
      } else {
        const errorMsg: Message = {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: '抱歉，处理你的请求时出现了问题。请稍后重试。',
          timestamp: Date.now(),
        }
        try {
          const persistedErr = await appendMessageToBackend(serverSessionId, errorMsg)
          errorMsg.id = String(persistedErr.id)
          errorMsg.timestamp = persistedErr.createdAt
        } catch {
          // 同上：后端失败不阻断前端展示
        }
        conv.messages.push(errorMsg)
        conv.updatedAt = Date.now()
      }
    } finally {
      agentAbortController.value = null
      isProcessing.value = false
      streamingContent.value = ''
      currentThinking.value = []
      currentToolCalls.value = []
    }

    // 保持侧边栏按最近更新排序（先前后端已更新 updated_at，这里做前端排序对齐）
    conversations.value.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }

  function cancelAgentRequest() {
    agentAbortController.value?.abort()
  }

  /** 手动打开预览：单段代码（如从 Markdown 气泡「预览」按钮） */
  function setPreview(code: string, language: string, filename?: string) {
    previewBlocks.value = [
      {
        id: `pv_${Date.now()}`,
        code,
        language,
        filename,
      },
    ]
    previewFileIndex.value = 0
    showPreview.value = true
  }

  /** 多文件预览（脚手架等） */
  function setPreviewBlocks(blocks: CodeBlock[]) {
    if (!blocks.length) return
    previewBlocks.value = blocks
    previewFileIndex.value = 0
    showPreview.value = true
  }

  /** 仅关闭预览面板并清空，避免切换会话后误显旧文件 */
  function closePreview() {
    showPreview.value = false
    previewBlocks.value = []
    previewFileIndex.value = 0
  }

  function setPreviewFileIndex(i: number) {
    const max = Math.max(0, previewBlocks.value.length - 1)
    previewFileIndex.value = Math.min(Math.max(0, i), max)
  }

  /** 右侧预览内联编辑：同步到当前 previewBlocks，供预览 Tab / 复制 / ZIP 一致 */
  function updatePreviewBlockCode(index: number, code: string) {
    const blocks = previewBlocks.value
    if (index < 0 || index >= blocks.length) return
    const block = blocks[index]
    if (block.code === code) return
    block.code = code
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    preferences,
    isProcessing,
    streamingContent,
    currentThinking,
    currentToolCalls,
    showPreview,
    previewBlocks,
    previewFileIndex,
    setPreviewFileIndex,
    updatePreviewBlockCode,
    createConversation,
    setActiveConversation,
    deleteConversation,
    sendMessage,
    cancelAgentRequest,
    setPreview,
    setPreviewBlocks,
    closePreview,
    syncBackendSessions,
    loadBackendPreferences,
  }
})
