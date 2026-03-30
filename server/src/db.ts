/**
 * @file 基于 sql.js（SQLite WASM）的数据访问层
 * @description
 * - 在 Node 中使用编译为 WebAssembly 的 SQLite，无需原生二进制依赖。
 * - 通过 `?` 占位符与 `prepare`/`bind` 绑定参数，避免字符串拼接 SQL 导致的注入风险。
 * - 持久化策略：内存中的 `Database` 在每次写操作（`run`）后 `export` 整库写入磁盘文件，
 *   实现简单可靠的小型应用持久化（高并发写入场景需另行设计）。
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'devstudio.db')

let db: SqlJsDatabase

/**
 * 初始化数据库：创建数据目录、加载 WASM、打开或新建库文件、执行建表与索引、首次持久化
 */
export async function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  // initSqlJs 返回 SQL.js 模块，其上的 Database 构造函数用于打开内存库或从 Uint8Array 恢复
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  // 启用外键约束（SQLite 默认关闭，需显式 PRAGMA）
  db.run('PRAGMA foreign_keys = ON')

  // 一次性执行 DDL：IF NOT EXISTS 保证重复启动幂等；ON DELETE CASCADE 级联删除子表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'plaintext',
      tags TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT DEFAULT 'New Chat',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      default_framework TEXT NOT NULL DEFAULT 'vue',
      naming_style TEXT NOT NULL DEFAULT 'PascalCase 组件名 + camelCase 变量名',
      reply_language TEXT NOT NULL DEFAULT 'zh',
      default_expand_code_preview INTEGER NOT NULL DEFAULT 1,
      tech_stack TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'note',
      source_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, source_type, source_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_rag_chunks_user ON rag_chunks(user_id);
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(user_id, source_type, source_id);

    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON agent_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON agent_messages(session_id);

    CREATE TABLE IF NOT EXISTS note_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      shared_user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('read', 'write')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(note_id, shared_user_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_note_shares_shared_user ON note_shares(shared_user_id);
  `)

  migrateNotesYjsColumn()

  persist()
  console.log('Database initialized at', DB_PATH)
}

/**
 * 存量库补列：协作编辑用 Yjs 快照（BLOB）；新建库若已在完整 DDL 中声明可跳过
 */
function migrateNotesYjsColumn() {
  try {
    db.run('ALTER TABLE notes ADD COLUMN yjs_state BLOB')
  } catch {
    /* 列已存在 */
  }
}

/**
 * 将当前内存数据库导出为二进制并同步写入磁盘，保证进程崩溃前最后一次写操作已落盘（仍非事务日志级保证）
 */
function persist() {
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）；参数通过数组绑定，勿将用户输入拼进 SQL 字符串
 * @returns lastID 最后插入行 ROWID；changes 受影响行数（sql.js 语义）
 */
export function run(sql: string, params: any[] = []): { lastID: number; changes: number } {
  db.run(sql, params)
  const changes = db.getRowsModified()
  const result = db.exec('SELECT last_insert_rowid() as id')
  const lastID = result.length > 0 ? (result[0].values[0][0] as number) : 0
  persist()
  return { lastID, changes }
}

/**
 * 查询单行：使用预编译语句 + bind，防止 SQL 注入
 */
export function get(sql: string, params: any[] = []): any | undefined {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return undefined
}

/**
 * 查询多行：逐行 step，读完释放语句句柄
 */
export function all(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results: any[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}
