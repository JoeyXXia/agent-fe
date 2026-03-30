/**
 * OpenAI 兼容的文本向量（Embedding）调用
 * 入库与查询须使用同一模型与维度；配置见 server/.env.example
 */

const MAX_INPUT_CHARS = 24000

function embeddingApiKey(): string | undefined {
  const dedicated = process.env.AI_EMBEDDING_API_KEY?.trim()
  if (dedicated) return dedicated
  return process.env.AI_API_KEY?.trim()
}

function embeddingBaseURL(): string {
  const u =
    process.env.AI_EMBEDDING_BASE_URL?.trim() ||
    process.env.AI_BASE_URL ||
    'https://api.openai.com/v1'
  return u.replace(/\/+$/, '')
}

export function embeddingModel(): string {
  return (
    process.env.AI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small'
  )
}

/** 是否具备发起 embedding 请求的配置（密钥 + 非强制关闭） */
export function isEmbeddingConfigured(): boolean {
  if (/^1|true|yes$/i.test(process.env.RAG_DISABLED?.trim() || '')) {
    return false
  }
  return !!embeddingApiKey()
}

export async function createEmbedding(text: string): Promise<number[]> {
  const key = embeddingApiKey()
  if (!key) {
    throw new Error('未配置 AI_EMBEDDING_API_KEY 或 AI_API_KEY，无法生成向量')
  }

  const input = text.slice(0, MAX_INPUT_CHARS)
  const base = embeddingBaseURL()
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input,
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Embedding API ${res.status}: ${t}`)
  }

  const data = (await res.json()) as {
    data?: { embedding?: number[] }[]
  }
  const vec = data.data?.[0]?.embedding
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Embedding API 返回无效向量')
  }
  return vec
}
