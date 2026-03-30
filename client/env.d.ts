/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** 协作 WebSocket 基址，需含路径前缀 /yjs，如 ws://localhost:3001/yjs 或 ws://localhost:5173/yjs */
  readonly VITE_WS_URL?: string
  readonly VITE_AGENT_USE_LLM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
