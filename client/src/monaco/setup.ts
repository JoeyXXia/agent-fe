/**
 * Monaco Web Worker 注册（Vite ESM：`?worker` 由 Vite 打包为独立 worker chunk）。
 * 必须在首次 `import * as monaco from 'monaco-editor'` 之前设置 `MonacoEnvironment`。
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let configured = false

export function configureMonacoWorkers() {
  if (configured) return
  configured = true

  ;(globalThis as unknown as { MonacoEnvironment?: { getWorker: (moduleId: string, label: string) => Worker } }).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case 'json':
          return new JsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new CssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new HtmlWorker()
        case 'typescript':
        case 'javascript':
        case 'tsx':
          return new TsWorker()
        default:
          return new EditorWorker()
      }
    },
  }
}
