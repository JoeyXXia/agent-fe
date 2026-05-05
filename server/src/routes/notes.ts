/**
 * @file 笔记 REST API：列表/详情/增删改、统计、AI 分析、共享与协作（Yjs 由 WebSocket 同步）
 */

import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { run, get, all } from '../db'
import { generateSummary, generateTags } from '../services/ai'
import { ingestNote, deleteChunksForSource } from '../services/rag'
import { isEmbeddingConfigured } from '../services/embeddings'

const router = Router()
router.use(auth)

router.get('/stats', (req: AuthRequest, res: Response) => {
  const uid = req.userId!
  const total = (get('SELECT COUNT(*) as c FROM notes WHERE user_id = ?', [uid]) as any).c
  const favorites = (get('SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND is_favorite = 1', [uid]) as any).c
  const withAI = (
    get(
      "SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND LENGTH(TRIM(COALESCE(summary, ''))) > 0",
      [uid]
    ) as any
  ).c
  const languages = all(
    'SELECT language, COUNT(*) as count FROM notes WHERE user_id = ? GROUP BY language ORDER BY count DESC',
    [uid]
  )
  res.json({ total, favorites, withAI, languages })
})

router.get('/', (req: AuthRequest, res: Response) => {
  const { q, tag, favorite } = req.query
  const uid = req.userId!

  let sql = `SELECT n.*,
    (n.user_id = ?) as is_owner_mem,
    (SELECT role FROM note_shares WHERE note_id = n.id AND shared_user_id = ? LIMIT 1) as share_role
    FROM notes n
    WHERE n.user_id = ? OR EXISTS (
      SELECT 1 FROM note_shares s WHERE s.note_id = n.id AND s.shared_user_id = ?
    )`
  const params: any[] = [uid, uid, uid, uid]

  if (q) {
    sql += ' AND (n.title LIKE ? OR n.content LIKE ?)'
    params.push(`%${q}%`, `%${q}%`)
  }
  if (tag) {
    sql += ' AND n.tags LIKE ?'
    params.push(`%"${tag}"%`)
  }
  if (favorite === '1') {
    sql += ' AND n.is_favorite = 1'
  }

  sql += ' ORDER BY n.updated_at DESC'

  const rows = all(sql, params)
  res.json(rows.map((r) => parseNote(r)))
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
  const parsed = parseNote(note)
  if (isEmbeddingConfigured()) {
    void ingestNote(req.userId!, {
      id: parsed.id,
      title: String(parsed.title),
      content: String(parsed.content),
    }).catch((e) => console.error('[RAG] ingest after create failed', e))
  }
  res.status(201).json({ ...parsed, is_owner: true, share_role: 'owner' })
})

/** 共享成员列表（仅 owner） */
router.get('/:id/shares', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access !== 'owner') {
    res.status(403).json({ error: '只有所有者可查看共享列表' })
    return
  }
  const shares = all(
    `SELECT s.shared_user_id as user_id, u.username, s.role
     FROM note_shares s JOIN users u ON u.id = s.shared_user_id
     WHERE s.note_id = ? ORDER BY u.username`,
    [id]
  )
  res.json(shares)
})

/** 添加共享（仅 owner）；按用户名 */
router.post('/:id/shares', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access !== 'owner') {
    res.status(403).json({ error: '只有所有者可添加共享' })
    return
  }
  const { username, role } = req.body
  if (!username?.trim() || !['read', 'write'].includes(role)) {
    res.status(400).json({ error: '需要提供 username 与 role（read|write）' })
    return
  }
  const target = get('SELECT id FROM users WHERE username = ?', [username.trim()]) as { id: number } | undefined
  if (!target) {
    res.status(404).json({ error: '用户不存在' })
    return
  }
  if (target.id === req.userId!) {
    res.status(400).json({ error: '不能共享给自己' })
    return
  }
  const ownerId = acc.note.user_id
  if (target.id === ownerId) {
    res.status(400).json({ error: '不能与所有者重复共享' })
    return
  }
  try {
    run(
      'INSERT INTO note_shares (note_id, shared_user_id, role) VALUES (?, ?, ?)',
      [id, target.id, role]
    )
  } catch {
    res.status(409).json({ error: '已共享给该用户' })
    return
  }
  res.status(201).json({ user_id: target.id, username: username.trim(), role })
})

router.delete('/:id/shares/:userId', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const shareUid = Number(req.params.userId)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access !== 'owner') {
    res.status(403).json({ error: '只有所有者可移除共享' })
    return
  }
  run('DELETE FROM note_shares WHERE note_id = ? AND shared_user_id = ?', [id, shareUid])
  res.json({ ok: true })
})

router.get('/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  res.json(parseNote(acc.note, acc.access))
})

router.put('/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access === 'read') {
    res.status(403).json({ error: '只读共享无法修改笔记' })
    return
  }

  const { title, content, language, tags, summary, is_favorite } = req.body
  const raw = acc.note as any
  const hasYjs = raw.yjs_state != null && raw.yjs_state.byteLength > 0

  if (content !== undefined && hasYjs) {
    res.status(409).json({
      error: '已启用协作编辑（存在 Yjs 状态）。正文请通过实时协作同步，勿用 REST 提交 content。',
    })
    return
  }

  const updates: string[] = []
  const values: any[] = []

  if (title !== undefined) {
    updates.push('title = ?')
    values.push(title)
  }
  if (content !== undefined) {
    updates.push('content = ?')
    values.push(content)
  }
  if (language !== undefined) {
    updates.push('language = ?')
    values.push(language)
  }
  if (tags !== undefined) {
    updates.push('tags = ?')
    values.push(JSON.stringify(tags))
  }
  if (summary !== undefined) {
    updates.push('summary = ?')
    values.push(summary)
  }
  if (is_favorite !== undefined) {
    updates.push('is_favorite = ?')
    values.push(is_favorite ? 1 : 0)
  }

  const ownerId = raw.user_id as number
  const touchedBody = content !== undefined || title !== undefined

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    values.push(id, ownerId)
    run(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values)
  }

  const updated = get('SELECT * FROM notes WHERE id = ?', [id])
  const parsed = parseNote(updated, acc.access)
  if (isEmbeddingConfigured() && touchedBody) {
    void ingestNote(ownerId, {
      id: parsed.id,
      title: String(parsed.title),
      content: String(parsed.content),
    }).catch((e) => console.error('[RAG] ingest after update failed', e))
  }
  res.json(parsed)
})

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const nid = Number(req.params.id)
  const uid = req.userId!
  const acc = getNoteAccess(nid, uid)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access !== 'owner') {
    res.status(403).json({ error: '只有所有者可删除笔记' })
    return
  }
  deleteChunksForSource(uid, 'note', nid)
  run('DELETE FROM notes WHERE id = ? AND user_id = ?', [nid, uid])
  res.json({ ok: true })
})

router.post('/:id/ai-analyze', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id)
  const acc = getNoteAccess(id, req.userId!)
  if (!acc) {
    res.status(404).json({ error: '笔记不存在' })
    return
  }
  if (acc.access === 'read') {
    res.status(403).json({ error: '只读共享无法使用 AI 分析' })
    return
  }

  const note = acc.note as any

  try {
    const [summary, tags] = await Promise.all([
      generateSummary(note.title, note.content),
      generateTags(note.title, note.content),
    ])

    const ownerId = note.user_id as number
    run(
      "UPDATE notes SET summary = ?, tags = ?, updated_at = datetime('now') WHERE id = ?",
      [summary, JSON.stringify(tags), note.id]
    )

    res.json({ summary, tags })
  } catch (err: any) {
    res.status(500).json({ error: 'AI 分析失败: ' + err.message })
  }
})

type NoteAccess = { note: any; access: 'owner' | 'read' | 'write' }

function getNoteAccess(noteId: number, userId: number): NoteAccess | null {
  const note = get('SELECT * FROM notes WHERE id = ?', [noteId]) as any
  if (!note) return null
  if (note.user_id === userId) return { note, access: 'owner' }
  const share = get(
    'SELECT role FROM note_shares WHERE note_id = ? AND shared_user_id = ?',
    [noteId, userId]
  ) as { role: string } | undefined
  if (!share) return null
  return { note, access: share.role as 'read' | 'write' }
}

function parseNote(row: any, access?: 'owner' | 'read' | 'write') {
  if (!row) return row
  const has_yjs_state = !!(row.yjs_state && row.yjs_state.byteLength > 0)
  const copy = { ...row }
  delete copy.yjs_state
  delete copy.is_owner_mem

  const is_owner_mem = row.is_owner_mem
  let is_owner: boolean | undefined
  let share_role: string | null | undefined

  if (access === 'owner') {
    is_owner = true
    share_role = 'owner'
  } else if (access === 'read' || access === 'write') {
    is_owner = false
    share_role = access
  } else if (is_owner_mem != null) {
    is_owner = !!is_owner_mem
    share_role = is_owner ? 'owner' : row.share_role || null
  }

  return {
    ...copy,
    tags: JSON.parse(row.tags || '[]'),
    is_favorite: !!row.is_favorite,
    is_owner,
    share_role: share_role ?? null,
    has_yjs_state,
  }
}

export default router
