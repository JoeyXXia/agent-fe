import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { run, get, all } from '../db'

const router = Router()
router.use(auth)

router.get('/sessions', (req: AuthRequest, res: Response) => {
  const sessions = all(
    'SELECT * FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC',
    [req.userId!]
  )
  res.json(sessions)
})

router.post('/sessions', (req: AuthRequest, res: Response) => {
  const { title } = req.body
  const { lastID } = run(
    'INSERT INTO agent_sessions (user_id, title) VALUES (?, ?)',
    [req.userId!, title || 'New Chat']
  )
  const session = get('SELECT * FROM agent_sessions WHERE id = ?', [lastID])
  res.status(201).json(session)
})

router.delete('/sessions/:id', (req: AuthRequest, res: Response) => {
  const { changes } = run(
    'DELETE FROM agent_sessions WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!changes) { res.status(404).json({ error: '会话不存在' }); return }
  res.json({ ok: true })
})

router.get('/sessions/:id/messages', (req: AuthRequest, res: Response) => {
  const session = get(
    'SELECT * FROM agent_sessions WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }

  const messages = all(
    'SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC',
    [Number(req.params.id)]
  )
  res.json(messages.map((m: any) => ({ ...m, metadata: JSON.parse(m.metadata || '{}') })))
})

router.post('/sessions/:id/messages', (req: AuthRequest, res: Response) => {
  const session = get(
    'SELECT * FROM agent_sessions WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }

  const { role, content, metadata } = req.body
  if (!role || !content) {
    res.status(400).json({ error: 'role 和 content 不能为空' })
    return
  }

  const { lastID } = run(
    'INSERT INTO agent_messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)',
    [Number(req.params.id), role, content, JSON.stringify(metadata || {})]
  )

  run("UPDATE agent_sessions SET updated_at = datetime('now') WHERE id = ?", [Number(req.params.id)])

  const msg = get('SELECT * FROM agent_messages WHERE id = ?', [lastID])
  res.status(201).json({ ...msg, metadata: JSON.parse(msg.metadata || '{}') })
})

export default router
