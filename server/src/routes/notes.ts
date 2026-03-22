/**
 * @file 笔记 REST API：列表/详情/增删改、统计、AI 分析
 * @description
 * 全路由经 `auth` 中间件保护，仅操作 `user_id` 与当前 JWT 用户一致的行，防止水平越权。
 * 查询条件通过 `?` 占位符与参数数组传入，避免 SQL 注入；动态拼接的片段仅为固定关键字与占位符。
 * HTTP：200 成功读取/更新、201 创建、400 参数错误、404 资源不存在、500 服务端错误（AI 失败）。
 */

import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { run, get, all } from '../db'
import { generateSummary, generateTags } from '../services/ai'

const router = Router()
// 子路由级中间件：本文件内所有请求必须先通过 JWT 校验
router.use(auth)

/** GET /stats — 当前用户笔记聚合统计（200） */
router.get('/stats', (req: AuthRequest, res: Response) => {
  const uid = req.userId!
  const total = (get('SELECT COUNT(*) as c FROM notes WHERE user_id = ?', [uid]) as any).c
  const favorites = (get('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND is_favorite = 1', [uid]) as any).c
  const withAI = (get('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND summary != ""', [uid]) as any).c
  const languages = all(
    'SELECT language, COUNT(*) as count FROM notes WHERE user_id = ? GROUP BY language ORDER BY count DESC',
    [uid]
  )
  res.json({ total, favorites, withAI, languages })
})

/**
 * GET / — 列表，支持 query：q 关键词、tag 标签、favorite=1 仅收藏；按 updated_at 降序
 * 模糊搜索使用 LIKE + 绑定参数；注意 tag 为 JSON 字符串子串匹配的设计局限
 */
router.get('/', (req: AuthRequest, res: Response) => {
  const { q, tag, favorite } = req.query

  let sql = 'SELECT * FROM notes WHERE user_id = ?'
  const params: any[] = [req.userId!]

  if (q) {
    sql += ' AND (title LIKE ? OR content LIKE ?)'
    params.push(`%${q}%`, `%${q}%`)
  }
  if (tag) {
    sql += ' AND tags LIKE ?'
    params.push(`%"${tag}"%`)
  }
  if (favorite === '1') {
    sql += ' AND is_favorite = 1'
  }

  sql += ' ORDER BY updated_at DESC'

  const notes = all(sql, params)
  res.json(notes.map(parseNote))
})

/** GET /:id — 单条详情；404 表示不存在或无权访问（统一不泄露是否存在他人笔记） */
router.get('/:id', (req: AuthRequest, res: Response) => {
  const note = findNote(Number(req.params.id), req.userId!)
  if (!note) { res.status(404).json({ error: '笔记不存在' }); return }
  res.json(parseNote(note))
})

/**
 * POST / — 新建笔记
 * - 201 Created：返回新建资源表示
 * - 400：标题或内容为空
 */
router.post('/', (req: AuthRequest, res: Response) => {
  const { title, content, language } = req.body

  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: '标题和内容不能为空' })
    return
  }

  const { lastID } = run(
    'INSERT INTO notes (user_id, title, content, language) VALUES (?, ?, ?, ?)',
    [req.userId!, title.trim(), content.trim(), language || 'plaintext']
  )

  const note = get('SELECT * FROM notes WHERE id = ?', [lastID])
  res.status(201).json(parseNote(note))
})

/** PUT /:id — 部分字段更新；无有效字段时仍可返回当前行（200） */
router.put('/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const note = findNote(id, req.userId!)
  if (!note) { res.status(404).json({ error: '笔记不存在' }); return }

  const { title, content, language, tags, summary, is_favorite } = req.body
  const updates: string[] = []
  const values: any[] = []

  if (title !== undefined) { updates.push('title = ?'); values.push(title) }
  if (content !== undefined) { updates.push('content = ?'); values.push(content) }
  if (language !== undefined) { updates.push('language = ?'); values.push(language) }
  if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)) }
  if (summary !== undefined) { updates.push('summary = ?'); values.push(summary) }
  if (is_favorite !== undefined) { updates.push('is_favorite = ?'); values.push(is_favorite ? 1 : 0) }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    values.push(id, req.userId!)
    // WHERE 同时带 id 与 user_id，确保只能改自己的笔记
    run(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values)
  }

  const updated = get('SELECT * FROM notes WHERE id = ?', [id])
  res.json(parseNote(updated))
})

/** DELETE /:id — 删除；changes 为 0 时 404 */
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { changes } = run(
    'DELETE FROM notes WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!changes) { res.status(404).json({ error: '笔记不存在' }); return }
  res.json({ ok: true })
})

/**
 * POST /:id/ai-analyze — 调用 LLM 生成摘要与标签并写回数据库
 * - 200：返回 summary 与 tags
 * - 404：笔记不存在
 * - 500：LLM 或持久化异常
 */
router.post('/:id/ai-analyze', async (req: AuthRequest, res: Response) => {
  const note = findNote(Number(req.params.id), req.userId!) as any
  if (!note) { res.status(404).json({ error: '笔记不存在' }); return }

  try {
    const [summary, tags] = await Promise.all([
      generateSummary(note.title, note.content),
      generateTags(note.title, note.content),
    ])

    run(
      "UPDATE notes SET summary = ?, tags = ?, updated_at = datetime('now') WHERE id = ?",
      [summary, JSON.stringify(tags), note.id]
    )

    res.json({ summary, tags })
  } catch (err: any) {
    res.status(500).json({ error: 'AI 分析失败: ' + err.message })
  }
})

/** 按主键与用户 ID 查询单行，用于鉴权下的资源定位 */
function findNote(id: number, userId: number) {
  return get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId])
}

/** 将存储层的 JSON 字符串 tags、整型 is_favorite 转为 API 友好形态 */
function parseNote(note: any) {
  if (!note) return note
  return {
    ...note,
    tags: JSON.parse(note.tags || '[]'),
    is_favorite: !!note.is_favorite,
  }
}

export default router
