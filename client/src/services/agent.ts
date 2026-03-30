/**
 * AgentCore — ReAct Agent 主引擎
 *
 * 实现了完整的 ReAct（Reasoning + Acting）循环：
 * 意图识别 → 计划生成 → 工具执行 → 结果组装 → 流式输出
 *
 * 设计模式：模板方法（固定流程骨架）+ 策略模式（工具可替换）+ 观察者模式（回调通知 UI）
 */
import type {
  Message,
  ThinkingStep,
  ToolCallRecord,
  AgentPlan,
  PlanStep,
  AgentTool,
  CodeBlock,
  StreamCallback,
  UserPreferences,
} from '@/types'
import axios from 'axios'
import api from '@/api'
import { toolRegistry } from './tools'
import { intentClassifier, planGenerator } from './planner'

/** 传入服务端 LLM 时的会话消息（含当前用户消息） */
export type AgentConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AgentRunOptions = {
  conversationMessages?: AgentConversationMessage[]
  /** 终止本次请求（远程 HTTP、本地 ReAct 延迟与流式输出） */
  abortSignal?: AbortSignal
  /** 用户长期偏好（用于本地 fallback 的默认框架等） */
  userPreferences?: UserPreferences
}

export function isAbortLike(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const x = e as { name?: string; code?: string }
  if (x.name === 'AbortError' || x.name === 'CanceledError') return true
  if (x.code === 'ERR_CANCELED') return true
  if (typeof axios.isCancel === 'function' && axios.isCancel(e)) return true
  return false
}

function extractCodeBlocksFromMarkdown(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const re = /```(\w+)?\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(content)) !== null) {
    blocks.push({
      id: `code_${Date.now()}_${i++}`,
      language: (m[1] || 'plaintext').trim(),
      code: m[2].trim(),
    })
  }
  return blocks
}

/** 全局自增 ID 计数器，配合时间戳确保唯一性 */
let idCounter = 0
const uid = (prefix = 'id') => `${prefix}_${++idCounter}_${Date.now()}`

/** 本地 fallback（无服务端 LLM）时使用的短期上下文窗口 */
const LOCAL_SHORT_TERM_MESSAGE_LIMIT = 10
const LOCAL_SHORT_TERM_MESSAGE_CHAR_LIMIT = 600

export class AgentCore {
  /** 工具注册表：Map<工具名, 工具实例>，支持 O(1) 名称查找 */
  private tools: Map<string, AgentTool> = new Map()
  /** 对话上下文历史，为多轮对话保留记忆（当前版本未使用，为扩展预留） */
  private conversationContext: Message[] = []

  constructor() {
    this.registerTools()
  }

  /** 将 toolRegistry 数组中的工具逐个注册到 Map 中 */
  private registerTools() {
    for (const tool of toolRegistry) {
      this.tools.set(tool.name, tool)
    }
  }

  /** 为意图识别/本地工具参数构建短期上下文输入（只保留最近 N 条） */
  private buildShortTermContextInput(
    userInput: string,
    conversationMessages?: AgentConversationMessage[]
  ): string {
    const conv = (conversationMessages || []).filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    )
    if (!conv.length) return userInput

    // 只保留最近 N 条消息，避免上下文无限增长
    const recent = conv.slice(-LOCAL_SHORT_TERM_MESSAGE_LIMIT)

    // store 已把 userInput 作为最后一条 user 消息传进来，所以这里要避免重复拼接
    const last = recent[recent.length - 1]
    let history = recent
    if (
      last?.role === 'user' &&
      last.content.trim() === userInput.trim()
    ) {
      history = recent.slice(0, -1)
    }

    const historyLines = history.map((m) => {
      const label = m.role === 'user' ? '用户' : '助手'
      const content = this.truncateText(m.content, LOCAL_SHORT_TERM_MESSAGE_CHAR_LIMIT)
      return `${label}：${content}`
    })

    const latestUser = this.truncateText(userInput, LOCAL_SHORT_TERM_MESSAGE_CHAR_LIMIT)
    if (!historyLines.length) return latestUser

    return `最近对话（仅供理解上下文）：\n${historyLines.join(
      '\n'
    )}\n\n用户最新消息：${latestUser}`
  }

  private truncateText(text: string, maxLen: number): string {
    const s = String(text ?? '')
    if (s.length <= maxLen) return s
    return s.slice(0, Math.max(0, maxLen - 1)) + '...'
  }

  /** 对外暴露已注册工具列表（WelcomeOverlay 组件用于展示工具徽章） */
  getRegisteredTools(): AgentTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * ReAct 主循环 —— Agent 的核心执行方法
   *
   * @param userInput  用户输入的自然语言文本
   * @param onThinking 思考步骤回调 —— 每产生一个推理步骤时通知 UI 实时展示
   * @param onToolCall 工具调用回调 —— 工具状态变化时通知 UI（running → success/error）
   * @param onStream   流式输出回调 —— 逐字符输出最终回复，实现打字机效果
   * @returns          完整的助手消息（包含思考步骤、工具调用记录、代码块）
   */
  async run(
    userInput: string,
    onThinking?: (step: ThinkingStep) => void,
    onToolCall?: (record: ToolCallRecord) => void,
    onStream?: StreamCallback,
    options?: AgentRunOptions
  ): Promise<Message> {
    /** 三个收集器：分别收集推理步骤、工具调用记录、生成的代码块 */
    const thinkingSteps: ThinkingStep[] = []
    const toolCalls: ToolCallRecord[] = []
    const codeBlocks: CodeBlock[] = []

    const useRemoteLLM =
      import.meta.env.VITE_AGENT_USE_LLM !== 'false' &&
      options?.conversationMessages &&
      options.conversationMessages.length > 0

    if (useRemoteLLM) {
      const waitStep: ThinkingStep = {
        id: uid('think'),
        type: 'planning',
        content:
          '正在请求服务端模型（推理可能需数十秒；本地 Ollama 冷启动会更久），请稍候…',
        timestamp: Date.now(),
      }
      onThinking?.(waitStep)

      try {
        const { data } = await api.post<{ content: string }>(
          '/agent/chat',
          { messages: options!.conversationMessages },
          {
            timeout: 200000,
            signal: options?.abortSignal,
          }
        )
        const content = (data?.content ?? '').trim()
        if (!content) throw new Error('empty response')

        const planningStep: ThinkingStep = {
          id: uid('think'),
          type: 'planning',
          content: '已使用服务端大模型生成回复',
          timestamp: Date.now(),
        }
        thinkingSteps.push(planningStep)
        onThinking?.(planningStep)

        const blocks = extractCodeBlocksFromMarkdown(content)
        if (onStream)
          await this.streamText(content, onStream, options?.abortSignal)

        const message: Message = {
          id: uid('msg'),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          thinking: thinkingSteps,
          toolCalls: [],
          codeBlocks: blocks.length ? blocks : undefined,
        }
        return message
      } catch (e) {
        if (isAbortLike(e)) throw e
        // 未登录、未配置 LLM 或超时：回退到本地 ReAct
      }
    }

    const sig = options?.abortSignal

    // ━━━━━━━━━━ Phase 1: 意图识别（Intent Classification）━━━━━━━━━━
    const contextAwareInput = this.buildShortTermContextInput(
      userInput,
      options?.conversationMessages
    )

    // 本地工具模板目前只支持 Vue 生成；若用户偏好为 React，fallback 时仍使用 Vue 兜底。
    const localDefaultFramework: 'vue' | 'react' =
      options?.userPreferences?.defaultFramework === 'react'
        ? 'vue'
        : options?.userPreferences?.defaultFramework || 'vue'
    const planningStep: ThinkingStep = {
      id: uid('think'),
      type: 'planning',
      content: '正在分析用户意图...',
      timestamp: Date.now(),
    }
    thinkingSteps.push(planningStep)
    onThinking?.(planningStep) // 可选链调用：回调存在才执行

    await sleep(400, sig) // 延迟 400ms，让用户看到「分析中」的 UI 状态

    /** 调用意图分类器：关键词匹配 → 返回意图类型 + 置信度 + 提取的参数 */
    // 优先使用「当前用户输入」判定意图，降低历史上下文导致的误判风险；
    // 只有当置信度较低或落到兜底 general 时，才用上下文重新推断。
    const currentIntent = intentClassifier(userInput, { defaultFramework: localDefaultFramework })
    const intent =
      currentIntent.type === 'general' || currentIntent.confidence < 0.6
        ? intentClassifier(contextAwareInput, { defaultFramework: localDefaultFramework })
        : currentIntent

    const reasoningStep: ThinkingStep = {
      id: uid('think'),
      type: 'reasoning',
      content: `识别到意图: ${intent.type}，置信度: ${(intent.confidence * 100).toFixed(0)}%`,
      timestamp: Date.now(),
    }
    thinkingSteps.push(reasoningStep)
    onThinking?.(reasoningStep)

    // ━━━━━━━━━━ Phase 2: 计划生成（Plan Generation）━━━━━━━━━━
    await sleep(300, sig)
    /** 根据意图类型查找对应的计划模板，生成有序的执行步骤 */
    const plan = planGenerator(intent, userInput)

    const planStep: ThinkingStep = {
      id: uid('think'),
      type: 'planning',
      content: `制定执行计划: ${plan.steps.map((s) => s.description).join(' → ')}`,
      timestamp: Date.now(),
    }
    thinkingSteps.push(planStep)
    onThinking?.(planStep)

    // ━━━━━━━━━━ Phase 3: 工具执行（Tool Execution）━━━━━━━━━━
    let resultContent = ''
    for (const step of plan.steps) {
      if (step.toolName) {
        /** 从注册表中按名称查找工具 */
        const tool = this.tools.get(step.toolName)
        if (!tool) continue // 工具不存在则跳过（容错）

        /** 创建工具调用记录，初始状态为 running */
        const toolCallRecord: ToolCallRecord = {
          id: uid('tool'),
          toolName: step.toolName,
          args: this.buildToolArgs(step, contextAwareInput, intent),
          result: null,
          status: 'running',
        }
        toolCalls.push(toolCallRecord)
        onToolCall?.(toolCallRecord) // 通知 UI：工具开始执行

        await sleep(600, sig) // 模拟工具执行延迟

        const startTime = Date.now()
        try {
          /** 调用工具的 execute 方法 */
          const result = await tool.execute(toolCallRecord.args)
          toolCallRecord.result = result.data
          toolCallRecord.status = 'success'
          toolCallRecord.duration = Date.now() - startTime

          /** 如果工具返回了代码块（如组件代码），收集到 codeBlocks 数组 */
          if (result.codeBlocks) {
            codeBlocks.push(...result.codeBlocks)
          }

          step.status = 'completed'
          step.result = result.message
        } catch (error) {
          /** 工具执行失败：标记 error 但不中断整个流程 */
          toolCallRecord.status = 'error'
          toolCallRecord.duration = Date.now() - startTime
          step.status = 'completed'
          step.result = `执行失败: ${error}`
        }

        onToolCall?.(toolCallRecord) // 通知 UI：工具执行完毕（更新状态）
      } else {
        /** 无工具绑定的纯推理步骤，直接标记完成 */
        step.status = 'completed'
      }
    }

    // ━━━━━━━━━━ Phase 4: 结果组装 + 反思（Assembly + Reflection）━━━━━━━━━━
    const reflectionStep: ThinkingStep = {
      id: uid('think'),
      type: 'reflection',
      content: '正在整理结果并生成回复...',
      timestamp: Date.now(),
    }
    thinkingSteps.push(reflectionStep)
    onThinking?.(reflectionStep)

    await sleep(300, sig)

    /** 将计划结果、工具输出、代码块组装为最终的回复文本 */
    resultContent = this.assembleResponse(plan, toolCalls, codeBlocks, intent)

    // ━━━━━━━━━━ Phase 5: 流式输出（Stream Output）━━━━━━━━━━
    if (onStream) {
      await this.streamText(resultContent, onStream, sig)
    }

    /** 构建最终 Message，附带完整的推理痕迹（thinking + toolCalls + codeBlocks） */
    const message: Message = {
      id: uid('msg'),
      role: 'assistant',
      content: resultContent,
      timestamp: Date.now(),
      thinking: thinkingSteps,
      toolCalls,
      codeBlocks,
    }

    this.conversationContext.push(message)
    return message
  }

  /**
   * 构建工具参数 —— 合并用户输入和意图提取的结构化参数
   */
  private buildToolArgs(
    step: PlanStep,
    userInput: string,
    intent: { type: string; params: Record<string, string> }
  ): Record<string, unknown> {
    return {
      description: userInput,
      componentName: intent.params.componentName || 'MyComponent',
      framework: intent.params.framework || 'vue',
      style: intent.params.style || 'tailwind',
      ...intent.params,
    }
  }

  /**
   * 结果组装 —— 拼装人类友好的回复文本
   * 结构：引导语 + 工具输出 + 代码块（Markdown 格式）+ 结尾建议
   */
  private assembleResponse(
    plan: AgentPlan,
    toolCalls: ToolCallRecord[],
    codeBlocks: CodeBlock[],
    intent: { type: string }
  ): string {
    const parts: string[] = []

    /** 根据意图类型添加开头引导语 */
    if (intent.type === 'generate_component') {
      parts.push('已根据你的描述生成了组件，以下是详细内容：\n')
    } else if (intent.type === 'generate_scaffold') {
      parts.push('已根据你的描述生成项目脚手架，各文件如下：\n')
    } else if (intent.type === 'explain_code') {
      parts.push('以下是对代码的分析：\n')
    } else if (intent.type === 'refactor') {
      parts.push('以下是重构建议和优化后的代码：\n')
    } else if (intent.type === 'debug') {
      parts.push('已分析可能的问题，以下是排查结果：\n')
    } else {
      parts.push('')
    }

    /** 收集所有成功工具调用的输出消息 */
    for (const tc of toolCalls) {
      if (tc.status === 'success' && tc.result) {
        const result = tc.result as { message?: string }
        if (result.message) {
          parts.push(result.message)
        }
      }
    }

    /** 将代码块格式化为 Markdown 代码围栏 */
    if (codeBlocks.length > 0) {
      for (const block of codeBlocks) {
        if (block.filename) {
          parts.push(`\n**${block.filename}**`)
        }
        parts.push(`\n\`\`\`${block.language}\n${block.code}\n\`\`\``)
      }
    }

    /** 添加意图对应的结尾引导文本 */
    const summaryMap: Record<string, string> = {
      generate_component: '\n\n你可以将上面的代码直接复制到项目中使用。如需修改样式或功能，请继续告诉我。',
      generate_scaffold:
        '\n\n可将各文件保存到对应相对路径后执行 `npm install` 与 `npm run dev`。如需换栈或加依赖，请说明。',
      explain_code: '\n\n如果你还有其他疑问，请继续提问。',
      refactor: '\n\n这些优化建议可以帮助提升代码质量和可维护性。',
      debug: '\n\n如果问题仍然存在，请提供更多上下文信息。',
      general: '\n\n还有什么我可以帮你的吗？',
    }
    parts.push(summaryMap[intent.type] || summaryMap.general)

    return parts.join('\n')
  }

  /**
   * 流式文本输出 —— 模拟 LLM 打字效果
   * 逐字符输出，根据字符类型动态调节延迟：
   *   换行 → 30ms | 标点 → 20ms | 普通字符 → 8~20ms 随机
   */
  private async streamText(
    text: string,
    callback: StreamCallback,
    signal?: AbortSignal
  ) {
    const chars = text.split('')
    let buffer = ''
    for (const char of chars) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      buffer += char
      callback(buffer) // 每次传递累积文本（而非单字符），方便 UI 直接渲染
      if (char === '\n') {
        await sleep(30, signal)
      } else if (char === '。' || char === '，' || char === '.') {
        await sleep(20, signal)
      } else {
        await sleep(8 + Math.random() * 12, signal)
      }
    }
  }
}

/** 延迟；若传入 abortSignal 且已 abort，则抛出 AbortError */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort)
  })
}

/** 导出全局单例 —— 整个应用共用一个 Agent 实例 */
export const agentCore = new AgentCore()
