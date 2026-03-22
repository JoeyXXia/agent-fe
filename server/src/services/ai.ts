export async function generateSummary(
  title: string,
  content: string
): Promise<string> {
  const prompt = `请用 2-3 句话简洁总结以下开发者笔记的核心内容：\n\n标题：${title}\n内容：${content}\n\n总结：`
  return callLLM(prompt)
}

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

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AI_MODEL || 'gpt-3.5-turbo'

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
