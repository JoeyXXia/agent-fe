export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  thinking?: ThinkingStep[]
  toolCalls?: ToolCallRecord[]
  codeBlocks?: CodeBlock[]
}

export interface ThinkingStep {
  id: string
  type: 'planning' | 'reasoning' | 'reflection'
  content: string
  timestamp: number
}

export interface ToolCallRecord {
  id: string
  toolName: string
  args: Record<string, unknown>
  result: unknown
  status: 'pending' | 'running' | 'success' | 'error'
  duration?: number
}

export interface CodeBlock {
  id: string
  language: string
  code: string
  filename?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AgentTool {
  name: string
  description: string
  icon: string
  parameters: ToolParameter[]
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  description: string
  required: boolean
}

export interface ToolResult {
  success: boolean
  data: unknown
  message: string
  codeBlocks?: CodeBlock[]
}

export interface AgentPlan {
  id: string
  goal: string
  steps: PlanStep[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
}

export interface PlanStep {
  id: string
  description: string
  toolName?: string
  status: 'pending' | 'running' | 'completed' | 'skipped'
  result?: string
}

export interface AgentConfig {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  baseUrl?: string
}

export type StreamCallback = (chunk: string) => void
