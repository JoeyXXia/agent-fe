/**
 * @file 全局中间件：JWT 鉴权与集中式错误处理
 * @description
 * - `auth`：解析 `Authorization: Bearer <token>`，使用与服务端签发相同的密钥验证 JWT，
 *   将 `userId` 注入请求对象供下游路由使用；失败返回 401（未认证）。
 * - `errorHandler`：Express 约定的四参数错误中间件，捕获同步/异步链中传递到 `next(err)` 的异常，
 *   向客户端统一返回 500，避免堆栈泄露（生产环境可扩展为错误码映射）。
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// 须与签发 token 的路由（如 auth）使用同一密钥；生产环境务必通过环境变量配置强随机密钥
const SECRET = process.env.JWT_SECRET || 'devnotes-jwt-secret-change-me'

/** 扩展 Request，在通过 auth 后携带当前用户主键 */
export interface AuthRequest extends Request {
  userId?: number
}

/**
 * JWT 鉴权中间件：验证 HS256 签名与有效期，成功则 `next()`，否则 JSON 错误体 + 401
 * - 401 Unauthorized：未提供凭证或凭证无效（HTTP 语义：需重新登录获取 token）
 */
export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录或 token 缺失' })
    return
  }
  try {
    // slice(7) 去掉 "Bearer " 前缀；payload 须与 jwt.sign 时字段一致
    const payload = jwt.verify(header.slice(7), SECRET) as { userId: number }
    req.userId = payload.userId
    next()
  } catch {
    // 签名错误、过期等均视为未授权，不区分细节以免辅助攻击面探测
    res.status(401).json({ error: 'token 无效或已过期' })
  }
}

/**
 * 全局错误处理中间件：必须有 4 个参数，Express 据此识别为错误处理器
 * - 500 Internal Server Error：服务器未捕获异常时的统一对外表述
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Error]', err)
  res.status(500).json({ error: '服务器内部错误' })
}
