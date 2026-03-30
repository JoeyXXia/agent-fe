/**
 * RAG：笔记切块、入库、按用户隔离检索，供 Agent 在 LLM 前注入上下文
 */
import { run, get, all } from '../db'
import { createEmbedding, isEmbeddingConfigured } from './embeddings'

const DEFAULT_TOP_K = Math.min(
  20,
  Math.max(1, Number(process.env.RAG_TOP_K || 6))
)
const DEFAULT_MIN_SIM = Math.max(
  0,
  Math.min(1, Number(process.env.RAG_MIN_SIMILARITY ?? 0.22))
)

const CHUNK_MAX = 900
const CHUNK_OVERLAP = 120

export type RagCitation = {
  index: number
  title: string
  noteId: number
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

/** 固定字符 + 段落边界粗切分（重叠减少跨块丢召回） */
export function chunkNoteText(title: string, content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  const header = `《${title.trim()}》\n\n`
  const full = header + normalized
  if (full.length <= CHUNK_MAX) return full.length ? [full] : []

  const chunks: string[] = []
  let start = 0
  let guard = 0
  while (start < full.length && guard++ < 500) {
    let end = Math.min(start + CHUNK_MAX, full.length)
    if (end < full.length) {
      const slice = full.slice(start, end)
      const para = slice.lastIndexOf('\n\n')
      if (para > CHUNK_MAX * 0.45) end = start + para
      else {
        const nl = slice.lastIndexOf('\n')
        if (nl > CHUNK_MAX * 0.55) end = start + nl
      }
    }
    const piece = full.slice(start, end).trim()
    if (piece) chunks.push(piece)
    if (end >= full.length) break
    start = Math.max(0, end - CHUNK_OVERLAP)
  }
  return chunks
}

export function deleteChunksForSource(
  userId: number,
  sourceType: string,
  sourceId: number
) {
  run(
    'DELETE FROM rag_chunks WHERE user_id = ? AND source_type = ? AND source_id = ?',
    [userId, sourceType, sourceId]
  )
}

export async function ingestNote(
  userId: number,
  note: { id: number; title: string; content: string }
): Promise<void> {
  if (!isEmbeddingConfigured()) return

  deleteChunksForSource(userId, 'note', note.id)
  const parts = chunkNoteText(note.title, note.content)
  if (!parts.length) return

  for (let i = 0; i < parts.length; i++) {
    const embedding = await createEmbedding(parts[i])
    run(
      `INSERT INTO rag_chunks (user_id, source_type, source_id, chunk_index, title, text, embedding)
       VALUES (?, 'note', ?, ?, ?, ?, ?)`,
      [
        userId,
        note.id,
        i,
        note.title.slice(0, 500),
        parts[i],
        JSON.stringify(embedding),
      ]
    )
  }
}

export function countChunksForUser(userId: number): number {
  const row = get(
    'SELECT COUNT(*) as c FROM rag_chunks WHERE user_id = ?',
    [userId]
  ) as { c: number } | undefined
  return Number(row?.c ?? 0)
}

/** 当前用户全部 DevNotes 重建向量索引 */
export async function reindexAllNotesForUser(
  userId: number,
  notes: { id: number; title: string; content: string }[]
): Promise<{ indexed: number; failed: number }> {
  if (!isEmbeddingConfigured()) {
    return { indexed: 0, failed: 0 }
  }
  run('DELETE FROM rag_chunks WHERE user_id = ?', [userId])
  let indexed = 0
  let failed = 0
  for (const n of notes) {
    try {
      await ingestNote(userId, n)
      indexed++
    } catch (e) {
      failed++
      console.error('[RAG] reindex note failed', n.id, e)
    }
  }
  return { indexed, failed }
}

export type RagRetrieveResult = {
  contextBlock: string
  citations: RagCitation[]
}

/**
 * 对用户问题做 embedding，与本用户全部 chunk 比余弦相似度，取 Top-K 并过滤阈值
 */
export async function retrieveForQuery(
  userId: number,
  query: string,
  options?: { topK?: number; minSimilarity?: number }
): Promise<RagRetrieveResult | null> {
  if (!isEmbeddingConfigured()) return null
  const q = query.trim()
  if (q.length < 2) return null

  const rows = all(
    'SELECT source_id, chunk_index, title, text, embedding FROM rag_chunks WHERE user_id = ?',
    [userId]
  ) as {
    source_id: number
    chunk_index: number
    title: string
    text: string
    embedding: string
  }[]

  if (!rows.length) return null

  let queryVec: number[]
  try {
    queryVec = await createEmbedding(q)
  } catch (e) {
    console.error('[RAG] query embedding failed', e)
    return null
  }

  const topK = options?.topK ?? DEFAULT_TOP_K
  const minSim = options?.minSimilarity ?? DEFAULT_MIN_SIM

  const scored: { row: (typeof rows)[0]; sim: number }[] = []
  for (const row of rows) {
    let emb: number[]
    try {
      emb = JSON.parse(row.embedding) as number[]
    } catch {
      continue
    }
    const sim = cosineSimilarity(queryVec, emb)
    if (sim >= minSim) scored.push({ row, sim })
  }
  scored.sort((a, b) => b.sim - a.sim)
  const picked = scored.slice(0, topK)
  if (!picked.length) return null

  const lines: string[] = [
    '以下是知识库中与问题相关的片段（请优先依据这些内容作答事实性问题；若片段不足以回答，请明确说明不足，可再结合通用知识给出建议）：',
  ]
  const citations: RagCitation[] = []
  picked.forEach((p, i) => {
    const n = i + 1
    citations.push({
      index: n,
      title: p.row.title,
      noteId: Number(p.row.source_id),
    })
    lines.push(`[${n}] 来源：笔记《${p.row.title}》（相似度约 ${p.sim.toFixed(3)}）`)
    lines.push(p.row.text)
    lines.push('')
  })

  return {
    contextBlock: lines.join('\n').trim(),
    citations,
  }
}
