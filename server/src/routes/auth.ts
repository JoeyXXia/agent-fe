/**
 * @file 认证路由：注册与登录
 * @description
 * 使用 bcrypt 对密码进行单向哈希存储（`hashSync`/`compareSync`），永不存明文；
 * 使用 JWT 在登录/注册成功后签发短期访问令牌（本示例 7 天），客户端以 Bearer 方式携带。
 * HTTP 语义：400 请求参数错误、401 认证失败、409 资源冲突（用户名已占用）、201 创建成功。
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { run, get } from '../db'
import { JWT_SECRET } from '../middleware'

const router = Router()

/**
 * POST /register — 用户注册
 * - 201 Created：成功创建用户并返回 token（REST 惯例：新建资源用 201）
 * - 400 Bad Request：校验失败（缺字段、长度不合法）
 * - 409 Conflict：用户名已存在（与「新建」语义冲突）
 */
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

  // 预编译查询 + 参数绑定，防止 SQL 注入
  const exists = get('SELECT id FROM users WHERE username = ?', [username.trim()])
  if (exists) {
    res.status(409).json({ error: '用户名已存在' })
    return
  }

  // bcrypt 盐轮数 10：在安全性与耗时之间的常见折中；hashSync 同步阻塞，高并发可改异步 API
  const hash = bcrypt.hashSync(password, 10)
  const { lastID } = run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username.trim(), hash]
  )

  // JWT payload 仅含 userId；expiresIn 控制过期时间
  const token = jwt.sign({ userId: lastID }, JWT_SECRET, { expiresIn: '7d' })
  res.status(201).json({ token, user: { id: lastID, username: username.trim() } })
})

/**
 * POST /login — 登录
 * - 200 OK：成功返回 token（默认 res.json 状态码为 200）
 * - 400：参数缺失
 * - 401 Unauthorized：用户名不存在或密码与存储的 bcrypt 哈希比对失败（统一文案避免枚举用户名）
 */
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

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username } })
})

export default router
