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

/** 与编译输出无关：catalog 放在 server/data，便于 tsc 后仍能读取 */
function catalogPath() {
  return path.join(__dirname, '..', '..', 'data', 'pluginMarketplace', 'catalog.json')
}

export function loadMarketplaceCatalog(): MarketplaceCatalogEntry[] {
  if (cached) return cached
  const raw = fs.readFileSync(catalogPath(), 'utf-8')
  const parsed = JSON.parse(raw) as MarketplaceCatalogEntry[]
  cached = Array.isArray(parsed) ? parsed : []
  return cached
}

export function getCatalogEntry(pluginId: string): MarketplaceCatalogEntry | undefined {
  return loadMarketplaceCatalog().find((p) => p.id === pluginId)
}

