/**
 * 插件市场 API：目录、用户启用列表、服务端 invoke
 */
import { Router } from 'express'
import { auth, AuthRequest } from '../middleware'
import { all, run } from '../db'
import { getCatalogEntry, loadMarketplaceCatalog } from '../services/pluginMarketplace'
import { invokePluginTool } from '../services/pluginInvoke'

const router = Router()

/** 公开：市场列表（不含用户态） */
router.get('/marketplace', (_req, res) => {
  res.json({ plugins: loadMarketplaceCatalog() })
})

/** 当前用户启用的插件 id 列表 */
router.get('/enabled', auth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const rows = all(
    'SELECT plugin_id FROM user_enabled_plugins WHERE user_id = ? ORDER BY plugin_id',
    [userId]
  ) as { plugin_id: string }[]
  res.json({ pluginIds: rows.map((r) => r.plugin_id) })
})

/**
 * 全量替换启用列表（校验 id 均在目录中存在）
 */
router.put('/enabled', auth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const body = req.body || {}
  const ids = Array.isArray(body.pluginIds) ? body.pluginIds.map(String) : null
  if (!ids) {
    res.status(400).json({ error: 'pluginIds 须为数组' })
    return
  }

  const catalogIds = new Set(loadMarketplaceCatalog().map((p) => p.id))
  const unknown = ids.filter((id: string) => !catalogIds.has(id))
  if (unknown.length) {
    res.status(400).json({ error: '未知插件', unknown })
    return
  }

  run('DELETE FROM user_enabled_plugins WHERE user_id = ?', [userId])
  for (const pluginId of ids) {
    run('INSERT INTO user_enabled_plugins (user_id, plugin_id) VALUES (?, ?)', [
      userId,
      pluginId,
    ])
  }

  res.json({ ok: true, pluginIds: ids })
})

/** 服务端插件执行（须已启用） */
router.post('/invoke', auth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const { pluginId, toolName, args } = req.body || {}
  if (!pluginId || !toolName) {
    res.status(400).json({ error: '缺少 pluginId 或 toolName' })
    return
  }

  const enabled = all(
    'SELECT 1 as ok FROM user_enabled_plugins WHERE user_id = ? AND plugin_id = ?',
    [userId, String(pluginId)]
  )
  if (!enabled.length) {
    res.status(403).json({ error: '插件未启用' })
    return
  }

  const entry = getCatalogEntry(String(pluginId))
  if (!entry) {
    res.status(404).json({ error: '插件不存在' })
    return
  }

  const safeArgs =
    args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {}

  const result = invokePluginTool(userId, entry, String(toolName), safeArgs)
  if (!result.success) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

export default router
