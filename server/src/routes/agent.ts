/**
 * Agent 会话与消息路由
 *
 * 提供 Agent 对话的持久化 RESTful API：
 *   - POST   /chat               —— 服务端多轮 LLM（密钥仅在后端，与智能笔记共用 provider 链）
 *   - GET    /sessions           —— 获取当前用户的所有会话列表
 *   - POST   /sessions           —— 创建新会话
 *   - DELETE /sessions/:id       —— 删除指定会话
 *   - GET    /sessions/:id/messages —— 获取某会话的消息列表
 *   - POST   /sessions/:id/messages —— 向某会话追加消息
 */
import { Router, Response } from 'express'
import { auth, AuthRequest } from '../middleware'
import { run, get, all } from '../db'
import { agentChatCompletion, type AgentChatMessage } from '../services/ai'

const router = Router()

/** 所有 Agent 路由都需要 JWT 认证 */
router.use(auth)

/**
 * POST /chat —— 多轮对话，body: { messages: { role, content }[] }
 * 与 `server/.env` 中 AI_* 配置一致；未配置密钥时返回 500
 */
router.post('/chat', async (req: AuthRequest, res: Response) => {
  const raw = req.body?.messages
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: 'messages 必填且为非空数组' })
    return
  }

  const allowed = new Set(['user', 'assistant', 'system'])
  const messages: AgentChatMessage[] = []
  for (const m of raw) {
    const role = m?.role
    if (!allowed.has(role)) {
      res.status(400).json({ error: 'messages[].role 须为 user / assistant / system' })
      return
    }
    messages.push({
      role,
      content: String(m.content ?? ''),
    })
  }

  if (messages.some((m) => !m.content.trim())) {
    res.status(400).json({ error: '每条消息 content 不能为空' })
    return
  }

  try {
    // 勿用 req.on('close') 去 abort：请求体读完后也会触发 close，易误杀上游导致误报 499
    const content = await agentChatCompletion(messages)
    res.json({ content })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Agent LLM 调用失败'
    if (!res.headersSent) res.status(500).json({ error: msg })
  }
})

/**
 * GET /sessions —— 获取当前用户的全部会话
 * 按 updated_at 倒序排列（最近活跃的在前）
 */
router.get('/sessions', (req: AuthRequest, res: Response) => {
  const sessions = all(
    'SELECT * FROM agent_sessions WHERE user_id = ? ORDER BY updated_at DESC',
    [req.userId!] // req.userId 由 auth 中间件注入，非空断言
  )
  res.json(sessions)
})

/**
 * POST /sessions —— 创建新会话
 * 201 Created：返回新建的会话对象
 */
router.post('/sessions', (req: AuthRequest, res: Response) => {
  const { title } = req.body
  const { lastID } = run(
    'INSERT INTO agent_sessions (user_id, title) VALUES (?, ?)',
    [req.userId!, title || 'New Chat'] // 标题为空时使用默认值
  )
  /** 插入后立即查询完整记录返回（包含 created_at、updated_at 默认值） */
  const session = get('SELECT * FROM agent_sessions WHERE id = ?', [lastID])
  res.status(201).json(session)
})

/**
 * DELETE /sessions/:id —— 删除会话
 * WHERE 同时限定 user_id 防止越权删除他人会话（水平权限控制）
 * 404：会话不存在或不属于当前用户
 */
router.delete('/sessions/:id', (req: AuthRequest, res: Response) => {
  const { changes } = run(
    'DELETE FROM agent_sessions WHERE id = ? AND user_id = ?',
    [Number(req.params.id), req.userId!]
  )
  if (!changes) { res.status(404).json({ error: '会话不存在' }); return }
  res.json({ ok: true })
})

/**
 * GET /sessions/:id/messages —— 获取某会话的全部消息
 * 先验证会话存在且属于当前用户（防越权）
 * 按 created_at 升序返回（聊天时间线）
 * metadata 字段存储为 JSON 字符串，读取时解析回对象
 */
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
  /** 将 metadata JSON 字符串反序列化为对象 */
  res.json(messages.map((m: any) => ({ ...m, metadata: JSON.parse(m.metadata || '{}') })))
})

/**
 * POST /sessions/:id/messages —— 向会话追加新消息
 * 400：缺少必填字段
 * 404：会话不存在
 * 201 Created：返回新消息（含解析后的 metadata）
 * 同时更新会话的 updated_at 时间戳
 */
router.post('/sessions/:id/messages', (req: AuthRequest, res: Response) => {
  /** 先验证会话归属 */
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

  /** metadata 序列化为 JSON 字符串存储 */
  const { lastID } = run(
    'INSERT INTO agent_messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)',
    [Number(req.params.id), role, content, JSON.stringify(metadata || {})]
  )

  /** 触碰会话的 updated_at 以反映最近活跃时间 */
  run("UPDATE agent_sessions SET updated_at = datetime('now') WHERE id = ?", [Number(req.params.id)])

  const msg = get('SELECT * FROM agent_messages WHERE id = ?', [lastID])
  res.status(201).json({ ...msg, metadata: JSON.parse(msg.metadata || '{}') })
})

export default router
