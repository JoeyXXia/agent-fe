/**
 * 全应用共享的 TypeScript 类型定义（聊天、Agent 工具、计划等域模型）。
 *
 * 说明：
 * - 使用 `interface` 描述对象形状，便于扩展与合并；
 * - 使用字面量联合类型（如 `role: 'user' | 'assistant'`）约束取值集合；
 * - 使用 `?` 表示可选属性；使用 `Record<string, unknown>` 表示键值结构但值类型安全地放宽为 unknown；
 * - 函数类型（如 `execute`、`StreamCallback`）用于回调与异步工具契约。
 */

/** 单条聊天消息：可包含思维链、工具调用记录、代码块等可选扩展字段 */
export interface Message {
  id: string
  /** 字面量联合：消息角色仅能为 user / assistant / system 三者之一 */
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** 可选：模型「思考」步骤列表，用于 UI 展示推理过程 */
  thinking?: ThinkingStep[]
  /** 可选：本轮消息关联的工具调用记录 */
  toolCalls?: ToolCallRecord[]
  /** 可选：附带的代码片段（如助手回复中的代码块） */
  codeBlocks?: CodeBlock[]
}

/** 思维链中的一步：类型区分规划 / 推理 / 反思等阶段 */
export interface ThinkingStep {
  id: string
  type: 'planning' | 'reasoning' | 'reflection'
  content: string
  timestamp: number
}

/**
 * 一次工具调用的记录：`args` 使用 `Record<string, unknown>` 表示任意 JSON 对象形参，
 * 同时避免滥用 `any`；`result` 为未知结构，由具体工具在运行时决定。
 */
export interface ToolCallRecord {
  id: string
  toolName: string
  args: Record<string, unknown>
  result: unknown
  status: 'pending' | 'running' | 'success' | 'error'
  /** 可选：耗时（毫秒等），由调用方约定 */
  duration?: number
}

/** 代码块：语言、正文、可选文件名，用于高亮与展示 */
export interface CodeBlock {
  id: string
  language: string
  code: string
  filename?: string
}

/** 会话：标题、消息列表与时间戳 */
export interface Conversation {
  id: string
  title: string
  messages: Message[]
  /** 后端持久化的会话 ID（agent_sessions.id），用于把前端会话与后端对齐 */
  serverSessionId?: number
  createdAt: number
  updatedAt: number
}

export type UserReplyLanguage = 'zh' | 'en' | 'auto'
export type UserDefaultFramework = 'vue' | 'react'

/** 用户长期偏好：跨会话生效（绑定到 users.id） */
export interface UserPreferences {
  defaultFramework: UserDefaultFramework
  namingStyle: string
  replyLanguage: UserReplyLanguage
  defaultExpandCodePreview: boolean
  techStack: string[]
}

/**
 * Agent 可调用的工具定义：`execute` 接收任意 JSON 形参（Record），返回 Promise<ToolResult>，
 * 体现前端对「工具即异步函数」的抽象。
 */
export interface AgentTool {
  name: string
  description: string
  icon: string
  parameters: ToolParameter[]
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

/** 工具参数模式：名称、类型联合、说明、是否必填 */
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  description: string
  required: boolean
}

/** 工具执行结果：成功标志、载荷、提示信息，可选带回代码块 */
export interface ToolResult {
  success: boolean
  data: unknown
  message: string
  codeBlocks?: CodeBlock[]
}

/** Agent 计划：目标、步骤列表与计划整体状态 */
export interface AgentPlan {
  id: string
  goal: string
  steps: PlanStep[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
}

/** 计划中的单步：可绑定工具名、步骤级状态与可选结果摘要 */
export interface PlanStep {
  id: string
  description: string
  toolName?: string
  status: 'pending' | 'running' | 'completed' | 'skipped'
  result?: string
}

/** Agent / LLM 调用相关配置：模型名、采样参数、可选密钥与自定义 API 地址 */
export interface AgentConfig {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  baseUrl?: string
}

/**
 * 流式输出回调：`(chunk: string) => void`，用于逐段消费模型生成的文本。
 * 使用类型别名（type alias）为函数类型命名，便于在多处引用。
 */
export type StreamCallback = (chunk: string) => void
