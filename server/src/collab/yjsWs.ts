/**
 * Yjs WebSocket：房间名 `note:{id}`，路径 `/yjs/note:…`，鉴权 query `token`（JWT）。
 * 持久化：内存房间在最后一连接断开时写入 notes.yjs_state 与 content 明文（供搜索/RAG）。
 */
import http from 'http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { get, run } from '../db'
import { verifyToken } from '../middleware'

const ROOM = /^note:(\d+)$/

let configured = false
type WSSharedDocLike = Y.Doc & { getText: (name?: string) => Y.Text }
type YwsUtils = {
  setPersistence: (persistence: {
    bindState: (docname: string, ydoc: WSSharedDocLike) => void
    writeState: (docname: string, ydoc: WSSharedDocLike) => Promise<unknown>
    provider: unknown
  } | null) => void
  setupWSConnection: (
    conn: import('ws').WebSocket,
    req: import('http').IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ) => void
}
let ywsUtils: YwsUtils | null = null

async function ensureYwsUtils(): Promise<YwsUtils> {
  if (ywsUtils) return ywsUtils
  // Force ESM path via dynamic import to avoid CJS/ESM mismatch on Render.
  const mod = await import('@y/websocket-server/utils')
  ywsUtils = mod as unknown as YwsUtils
  return ywsUtils
}

async function ensurePersistence() {
  if (configured) return
  const { setPersistence } = await ensureYwsUtils()
  configured = true
  setPersistence({
    bindState: (docname: string, ydoc: WSSharedDocLike) => {
      const m = ROOM.exec(docname)
      if (!m) return
      const nid = Number(m[1])
      const row = get('SELECT content, yjs_state FROM notes WHERE id = ?', [nid]) as
        | { content: string; yjs_state: ArrayBuffer | Uint8Array | null }
        | undefined
      if (!row) return
      const blob = row.yjs_state
      if (blob && blob.byteLength > 0) {
        Y.applyUpdate(ydoc, new Uint8Array(blob))
      } else {
        const t = String(row.content ?? '')
        if (t.length) ydoc.getText('monaco').insert(0, t)
      }
    },
    writeState: async (docname: string, ydoc: WSSharedDocLike) => {
      const m = ROOM.exec(docname)
      if (!m) return
      const nid = Number(m[1])
      const snapshot = Y.encodeStateAsUpdate(ydoc)
      const plain = ydoc.getText('monaco').toString()
      run(
        "UPDATE notes SET yjs_state = ?, content = ?, updated_at = datetime('now') WHERE id = ?",
        [snapshot, plain, nid]
      )
    },
    provider: null,
  })
}

function canAccessNoteRoom(noteId: number, userId: number): boolean {
  const row = get(
    `SELECT n.user_id as owner,
      (SELECT role FROM note_shares WHERE note_id = n.id AND shared_user_id = ? LIMIT 1) as share_role
     FROM notes n WHERE n.id = ?`,
    [userId, noteId]
  ) as { owner: number; share_role: string | null } | undefined
  if (!row) return false
  if (Number(row.owner) === userId) return true
  return row.share_role === 'read' || row.share_role === 'write'
}

export async function attachYjsWebSocket(server: http.Server) {
  await ensurePersistence()
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    if (!ywsUtils) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    const host = request.headers.host || 'localhost'
    let u: URL
    try {
      u = new URL(request.url || '/', `http://${host}`)
    } catch {
      socket.destroy()
      return
    }
    if (!u.pathname.startsWith('/yjs/')) {
      return
    }
    const rawName = u.pathname.slice('/yjs/'.length)
    const docName = decodeURIComponent(rawName)
    if (!ROOM.test(docName)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }
    const session = verifyToken(u.searchParams.get('token'))
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const noteId = Number(ROOM.exec(docName)![1])
    if (!canAccessNoteRoom(noteId, session.userId)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ywsUtils!.setupWSConnection(ws, request, { docName, gc: true })
    })
  })
}
