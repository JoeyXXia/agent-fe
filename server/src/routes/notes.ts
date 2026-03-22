import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { run, get, all } from '../db'
import { generateSummary, generateTags } from '../services/ai'

const router = Router()
router.use(auth)

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

router.get('/:id', (req: AuthRequest, res: Response) => {
  const note = findNote(Number(req.params.id), req.userId!)
  if (!note) { res.status(404).json({ error: '笔记不存在' }); return }
  res.json(parseNote(note))
})

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
    run(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values)
  }

  const updated = get('SELECT * FROM notes WHERE id = ?', [id])
  res.json(parseNote(updated))
})

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const { changes } = run(
    'DELETE FROM notes WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!changes) { res.status(404).json({ error: '笔记不存在' }); return }
  res.json({ ok: true })
})

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

function findNote(id: number, userId: number) {
  return get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId])
}

function parseNote(note: any) {
  if (!note) return note
  return {
    ...note,
    tags: JSON.parse(note.tags || '[]'),
    is_favorite: !!note.is_favorite,
  }
}

export default router
