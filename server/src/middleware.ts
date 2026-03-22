import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'devnotes-jwt-secret-change-me'

export interface AuthRequest extends Request {
  userId?: number
}

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录或 token 缺失' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as { userId: number }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: 'token 无效或已过期' })
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Error]', err)
  res.status(500).json({ error: '服务器内部错误' })
}
