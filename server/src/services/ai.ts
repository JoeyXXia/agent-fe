/**
 * @file 大语言模型调用封装（OpenAI 兼容 Chat Completions）
 * @description
 * - Prompt 工程：为「摘要」「标签」任务分别构造明确指令、输出格式约束与中文语境；
 * - 无 API Key 时走 `mockResponse` 本地启发式回复，保证开发/演示环境可离线运行；
 * - 标签结果优先 JSON 解析，失败则回退到按分隔符拆分，体现防御式解析与降级模式。
 */

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

/**
 * 统一 LLM 调用：优先请求 OpenAI 兼容接口；无密钥则直接 mock，避免抛错中断业务
 */
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AI_MODEL || 'gpt-3.5-turbo'

  // 无 API Key：降级为本地模拟，保持与「有网+密钥」相同的异步接口形态
  if (!apiKey) return mockResponse(prompt)

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    }),
  })

  if (!res.ok) throw new Error(`LLM API ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as any
  return data.choices?.[0]?.message?.content?.trim() || ''
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
