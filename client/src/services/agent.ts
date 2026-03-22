import type {
  Message,
  ThinkingStep,
  ToolCallRecord,
  AgentPlan,
  PlanStep,
  AgentTool,
  CodeBlock,
  StreamCallback,
} from '@/types'
import { toolRegistry } from './tools'
import { intentClassifier, planGenerator } from './planner'

let idCounter = 0
const uid = (prefix = 'id') => `${prefix}_${++idCounter}_${Date.now()}`

export class AgentCore {
  private tools: Map<string, AgentTool> = new Map()
  private conversationContext: Message[] = []

  constructor() {
    this.registerTools()
  }

  private registerTools() {
    for (const tool of toolRegistry) {
      this.tools.set(tool.name, tool)
    }
  }

  getRegisteredTools(): AgentTool[] {
    return Array.from(this.tools.values())
  }

  async run(
    userInput: string,
    onThinking?: (step: ThinkingStep) => void,
    onToolCall?: (record: ToolCallRecord) => void,
    onStream?: StreamCallback
  ): Promise<Message> {
    const thinkingSteps: ThinkingStep[] = []
    const toolCalls: ToolCallRecord[] = []
    const codeBlocks: CodeBlock[] = []

    // Phase 1: Intent Classification
    const planningStep: ThinkingStep = {
      id: uid('think'),
      type: 'planning',
      content: '正在分析用户意图...',
      timestamp: Date.now(),
    }
    thinkingSteps.push(planningStep)
    onThinking?.(planningStep)

    await sleep(400)

    const intent = intentClassifier(userInput)

    const reasoningStep: ThinkingStep = {
      id: uid('think'),
      type: 'reasoning',
      content: `识别到意图: ${intent.type}，置信度: ${(intent.confidence * 100).toFixed(0)}%`,
      timestamp: Date.now(),
    }
    thinkingSteps.push(reasoningStep)
    onThinking?.(reasoningStep)

    // Phase 2: Plan Generation
    await sleep(300)
    const plan = planGenerator(intent, userInput)

    const planStep: ThinkingStep = {
      id: uid('think'),
      type: 'planning',
      content: `制定执行计划: ${plan.steps.map((s) => s.description).join(' → ')}`,
      timestamp: Date.now(),
    }
    thinkingSteps.push(planStep)
    onThinking?.(planStep)

    // Phase 3: Tool Execution
    let resultContent = ''
    for (const step of plan.steps) {
      if (step.toolName) {
        const tool = this.tools.get(step.toolName)
        if (!tool) continue

        const toolCallRecord: ToolCallRecord = {
          id: uid('tool'),
          toolName: step.toolName,
          args: this.buildToolArgs(step, userInput, intent),
          result: null,
          status: 'running',
        }
        toolCalls.push(toolCallRecord)
        onToolCall?.(toolCallRecord)

        await sleep(600)

        const startTime = Date.now()
        try {
          const result = await tool.execute(toolCallRecord.args)
          toolCallRecord.result = result.data
          toolCallRecord.status = 'success'
          toolCallRecord.duration = Date.now() - startTime

          if (result.codeBlocks) {
            codeBlocks.push(...result.codeBlocks)
          }

          step.status = 'completed'
          step.result = result.message
        } catch (error) {
          toolCallRecord.status = 'error'
          toolCallRecord.duration = Date.now() - startTime
          step.status = 'completed'
          step.result = `执行失败: ${error}`
        }

        onToolCall?.(toolCallRecord)
      } else {
        step.status = 'completed'
      }
    }

    // Phase 4: Response Assembly + Reflection
    const reflectionStep: ThinkingStep = {
      id: uid('think'),
      type: 'reflection',
      content: '正在整理结果并生成回复...',
      timestamp: Date.now(),
    }
    thinkingSteps.push(reflectionStep)
    onThinking?.(reflectionStep)

    await sleep(300)

    resultContent = this.assembleResponse(plan, toolCalls, codeBlocks, intent)

    if (onStream) {
      await this.streamText(resultContent, onStream)
    }

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

  private assembleResponse(
    plan: AgentPlan,
    toolCalls: ToolCallRecord[],
    codeBlocks: CodeBlock[],
    intent: { type: string }
  ): string {
    const parts: string[] = []

    if (intent.type === 'generate_component') {
      parts.push('已根据你的描述生成了组件，以下是详细内容：\n')
    } else if (intent.type === 'explain_code') {
      parts.push('以下是对代码的分析：\n')
    } else if (intent.type === 'refactor') {
      parts.push('以下是重构建议和优化后的代码：\n')
    } else if (intent.type === 'debug') {
      parts.push('已分析可能的问题，以下是排查结果：\n')
    } else {
      parts.push('')
    }

    for (const tc of toolCalls) {
      if (tc.status === 'success' && tc.result) {
        const result = tc.result as { message?: string }
        if (result.message) {
          parts.push(result.message)
        }
      }
    }

    if (codeBlocks.length > 0) {
      for (const block of codeBlocks) {
        if (block.filename) {
          parts.push(`\n**${block.filename}**`)
        }
        parts.push(`\n\`\`\`${block.language}\n${block.code}\n\`\`\``)
      }
    }

    const summaryMap: Record<string, string> = {
      generate_component: '\n\n你可以将上面的代码直接复制到项目中使用。如需修改样式或功能，请继续告诉我。',
      explain_code: '\n\n如果你还有其他疑问，请继续提问。',
      refactor: '\n\n这些优化建议可以帮助提升代码质量和可维护性。',
      debug: '\n\n如果问题仍然存在，请提供更多上下文信息。',
      general: '\n\n还有什么我可以帮你的吗？',
    }
    parts.push(summaryMap[intent.type] || summaryMap.general)

    return parts.join('\n')
  }

  private async streamText(text: string, callback: StreamCallback) {
    const chars = text.split('')
    let buffer = ''
    for (const char of chars) {
      buffer += char
      callback(buffer)
      if (char === '\n') {
        await sleep(30)
      } else if (char === '。' || char === '，' || char === '.') {
        await sleep(20)
      } else {
        await sleep(8 + Math.random() * 12)
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const agentCore = new AgentCore()
