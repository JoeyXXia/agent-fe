declare module '@y/websocket-server/utils' {
  import type { IncomingMessage } from 'http'
  import type { WebSocket } from 'ws'
  import type * as Y from 'yjs'

  export class WSSharedDoc extends Y.Doc {
    name: string
  }

  export function setPersistence(
    persistence:
      | {
          bindState: (docname: string, ydoc: WSSharedDoc) => void
          writeState: (docname: string, ydoc: WSSharedDoc) => Promise<unknown>
          provider: unknown
        }
      | null
  ): void

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void
}
