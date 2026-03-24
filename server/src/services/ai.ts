/**
 * @file 大语言模型调用封装
 * @description
 * - 主通道：OpenAI 兼容 `POST .../chat/completions`（DeepSeek、Azure、Ollama 等）；
 * - 可选备用：OpenAI 兼容、Anthropic Claude、本地 Ollama（OpenAI 兼容 `/v1`）；
 * - 按配置顺序依次尝试，全部失败则抛出最后一次错误；无可用密钥时走 `mockResponse`。
 */

type OpenAICompatProvider = {
  kind: 'openai'
  label: string
  apiKey: string
  baseURL: string
  model: string
}

type AnthropicProvider = {
  kind: 'anthropic'
  label: string
  apiKey: string
  baseURL: string
  model: string
}

type LLMProvider = OpenAICompatProvider | AnthropicProvider

/**
 * 根据标题与正文生成短摘要；prompt 要求 2–3 句中文概括，便于用户快速浏览
 */
export async function generateSummary(
  title: string,
  content: string
): Promise<string> {
  const prompt = `请用 2-3 句话简洁总结以下开发者笔记的核心内容：\n\n标题：${title}\n内容：${content}\n\n总结：`
  return callLLM(prompt)
}

/**
 * 生成 3–5 个技术标签；要求模型仅输出 JSON 数组，便于程序解析
 * 若模型返回非合法 JSON，则退化为按逗号/空白切分并截断长度
 */
export async function generateTags(
  title: string,
  content: string
): Promise<string[]> {
  const prompt = `根据以下开发者笔记，生成 3-5 个相关技术标签。只返回 JSON 数组格式，不要其他内容。\n\n标题：${title}\n内容：${content}\n\n标签：`

  const result = await callLLM(prompt)
  try {
    const arr = JSON.parse(result)
    if (Array.isArray(arr)) return arr.map(String).slice(0, 5)
  } catch {
    /* parse failed, fallback below */
  }
  return result
    .split(/[,，\s]+/)
    .filter(Boolean)
    .slice(0, 5)
}

/** 是否启用链尾的本地 Ollama 备用：`AI_OLLAMA_BACKUP=1` 或已填写 `AI_OLLAMA_BACKUP_BASE_URL` */
function isOllamaBackupEnabled(): boolean {
  const flag = process.env.AI_OLLAMA_BACKUP?.trim()
  if (flag && /^1|true|yes$/i.test(flag)) return true
  return !!process.env.AI_OLLAMA_BACKUP_BASE_URL?.trim()
}

/** 组装调用链：主配置 → OpenAI 备用 → Claude 备用 → 本地 Ollama（可选） */
function buildProviderChain(): LLMProvider[] {
  const chain: LLMProvider[] = []

  if (process.env.AI_API_KEY?.trim()) {
    chain.push({
      kind: 'openai',
      label: 'primary',
      apiKey: process.env.AI_API_KEY.trim(),
      baseURL: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(
        /\/+$/,
        ''
      ),
      model: process.env.AI_MODEL || 'gpt-3.5-turbo',
    })
  }

  if (process.env.AI_OPENAI_BACKUP_API_KEY?.trim()) {
    chain.push({
      kind: 'openai',
      label: 'openai-backup',
      apiKey: process.env.AI_OPENAI_BACKUP_API_KEY.trim(),
      baseURL: (
        process.env.AI_OPENAI_BACKUP_BASE_URL || 'https://api.openai.com/v1'
      ).replace(/\/+$/, ''),
      model: process.env.AI_OPENAI_BACKUP_MODEL || 'gpt-4o-mini',
    })
  }

  if (process.env.AI_ANTHROPIC_API_KEY?.trim()) {
    chain.push({
      kind: 'anthropic',
      label: 'claude-backup',
      apiKey: process.env.AI_ANTHROPIC_API_KEY.trim(),
      baseURL: (
        process.env.AI_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'
      ).replace(/\/+$/, ''),
      model:
        process.env.AI_ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    })
  }

  if (isOllamaBackupEnabled()) {
    chain.push({
      kind: 'openai',
      label: 'ollama-backup',
      apiKey:
        process.env.AI_OLLAMA_BACKUP_API_KEY?.trim() || 'ollama-local',
      baseURL: (
        process.env.AI_OLLAMA_BACKUP_BASE_URL ||
        'http://127.0.0.1:11434/v1'
      ).replace(/\/+$/, ''),
      model: process.env.AI_OLLAMA_BACKUP_MODEL || 'llama3.2',
    })
  }

  return chain
}

async function callOpenAICompatible(
  p: OpenAICompatProvider,
  prompt: string
): Promise<string> {
  const res = await fetch(`${p.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`[${p.label}] LLM API ${res.status}: ${t}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function callAnthropicMessages(
  p: AnthropicProvider,
  prompt: string
): Promise<string> {
  const res = await fetch(`${p.baseURL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`[${p.label}] LLM API ${res.status}: ${t}`)
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const block = data.content?.find((c) => c.type === 'text')
  return (block?.text ?? '').trim()
}

async function invokeProvider(p: LLMProvider, prompt: string): Promise<string> {
  if (p.kind === 'openai') return callOpenAICompatible(p, prompt)
  return callAnthropicMessages(p, prompt)
}

/**
 * 统一 LLM 调用：按链路由尝试；无可用密钥则 mock
 */
async function callLLM(prompt: string): Promise<string> {
  const chain = buildProviderChain()
  if (chain.length === 0) return mockResponse(prompt)

  let lastErr: Error | null = null
  for (const p of chain) {
    try {
      return await invokeProvider(p, prompt)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw lastErr ?? new Error('LLM 调用失败')
}

/**
 * 离线/无密钥时的占位实现：从 prompt 中解析标题等线索，对「总结」「标签」分支返回合理伪造内容
 * 标签分支返回 JSON 字符串以配合上层 `JSON.parse` 路径
 */
function mockResponse(prompt: string): string {
  const titleMatch = prompt.match(/标题[：:]\s*(.+)/m)
  const title = titleMatch?.[1]?.trim() || '未知'

  if (prompt.includes('总结')) {
    const contentMatch = prompt.match(
      /内容[：:]\s*([\s\S]*?)(?=\n\n总结|$)/m
    )
    const len = contentMatch?.[1]?.trim().length || 0
    return `本笔记「${title}」记录了相关技术要点与实现思路，内容约 ${len} 字，涵盖了核心概念与实践方案。适合作为开发参考文档使用。`
  }

  if (prompt.includes('标签')) {
    const text = prompt.toLowerCase()
    const techMap: Record<string, string> = {
      react: 'React',
      vue: 'Vue',
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      node: 'Node.js',
      css: 'CSS',
      html: 'HTML',
      api: 'API',
      database: '数据库',
      docker: 'Docker',
      webpack: 'Webpack',
      vite: 'Vite',
      express: 'Express',
      sql: 'SQL',
      git: 'Git',
      test: '测试',
      hook: 'Hooks',
      component: '组件化',
      performance: '性能优化',
    }
    const found = Object.entries(techMap)
      .filter(([key]) => text.includes(key))
      .map(([, val]) => val)

    return JSON.stringify(
      found.length >= 2
        ? found.slice(0, 4)
        : ['开发笔记', '技术总结', '学习记录']
    )
  }

  return 'AI 分析完成'
}
