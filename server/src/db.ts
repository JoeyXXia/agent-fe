import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'devstudio.db')

let db: SqlJsDatabase

export async function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

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

    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON agent_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON agent_messages(session_id);
  `)

  persist()
  console.log('Database initialized at', DB_PATH)
}

function persist() {
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

export function run(sql: string, params: any[] = []): { lastID: number; changes: number } {
  db.run(sql, params)
  const changes = db.getRowsModified()
  const result = db.exec('SELECT last_insert_rowid() as id')
  const lastID = result.length > 0 ? (result[0].values[0][0] as number) : 0
  persist()
  return { lastID, changes }
}

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
