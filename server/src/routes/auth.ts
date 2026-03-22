import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { run, get } from '../db'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'devnotes-jwt-secret-change-me'

router.post('/register', (req, res) => {
  const { username, password } = req.body

  if (!username?.trim() || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' })
    return
  }
  if (username.trim().length < 2 || username.trim().length > 20) {
    res.status(400).json({ error: '用户名长度 2-20 个字符' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' })
    return
  }

  const exists = get('SELECT id FROM users WHERE username = ?', [username.trim()])
  if (exists) {
    res.status(409).json({ error: '用户名已存在' })
    return
  }

  const hash = bcrypt.hashSync(password, 10)
  const { lastID } = run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username.trim(), hash]
  )

  const token = jwt.sign({ userId: lastID }, SECRET, { expiresIn: '7d' })
  res.status(201).json({ token, user: { id: lastID, username: username.trim() } })
})

router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' })
    return
  }

  const user = get('SELECT * FROM users WHERE username = ?', [username]) as any
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username } })
})

export default router
