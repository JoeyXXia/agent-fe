/**
 * 插件市场目录：编译期/包内 JSON，可演进为远程注册表或私有 npm。
 */
import fs from 'fs'
import path from 'path'

export type CatalogToolParam = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  description: string
  required: boolean
}

export type MarketplaceCatalogEntry = {
  id: string
  version: string
  displayName: string
  description: string
  runtime: 'browser' | 'server' | 'mcp'
  permissions: string[]
  author?: string
  category?: string
  readme?: string
  entry?: string
  compat?: { aiDevStudio?: string }
  tool: {
    name: string
    description: string
    icon: string
    parameters: CatalogToolParam[]
  }
  intent: {
    type: string
    keywords: string[]
  }
}

let cached: MarketplaceCatalogEntry[] | null = null

/**
 * 目录与 `server/.gitignore` 中的 `data/` 分离：`data/` 仅放本地 DB 等不提交文件；
 * catalog 放在 `server/catalog/`，随仓库部署，避免生产读盘失败导致 500。
 */
function catalogPath() {
  return path.join(__dirname, '..', '..', 'catalog', 'pluginMarketplace', 'catalog.json')
}

export function loadMarketplaceCatalog(): MarketplaceCatalogEntry[] {
  if (cached) return cached
  try {
    const raw = fs.readFileSync(catalogPath(), 'utf-8')
    const parsed = JSON.parse(raw) as MarketplaceCatalogEntry[]
    cached = Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[pluginMarketplace] catalog 读取失败，使用空列表:', err)
    cached = []
  }
  return cached
}

export function getCatalogEntry(pluginId: string): MarketplaceCatalogEntry | undefined {
  return loadMarketplaceCatalog().find((p) => p.id === pluginId)
}

