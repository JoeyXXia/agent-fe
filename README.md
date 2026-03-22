# AI DevStudio — 基于 ReAct Agent 的全栈智能开发工作台

> 自然语言驱动的 AI 开发助手，集成智能笔记管理 + 代码生成 Agent，展示完整的全栈工程能力与 AI Agent 架构设计。

## 项目定位

AI DevStudio 是一个面向开发者的 AI 增强工作台，包含两大核心模块：

- **智能笔记（DevNotes）**：全栈 CRUD + AI 自动摘要与标签生成，展示标准的 RESTful 全栈开发能力
- **代码 Agent（FE-Agent）**：基于 ReAct 模式的前端代码生成 Agent，自然语言 → 意图识别 → 任务规划 → 工具调用 → 流式输出

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 (Composition API + `<script setup>`) + TypeScript |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 样式 | Tailwind CSS 3 |
| 构建工具 | Vite 6 |
| 后端框架 | Node.js + Express + TypeScript |
| 数据库 | SQLite (sql.js WASM) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| AI 集成 | OpenAI 兼容 API（支持 Mock 离线运行） |
| 代码渲染 | highlight.js + marked + DOMPurify |
| 代码预览 | iframe 沙箱（sandbox + srcdoc） |

## 项目结构

```
ai-devstudio/
├── README.md
│
├── client/                              # 前端应用
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                   # Vite 配置 + API 代理
│   ├── tailwind.config.js               # 自定义主题色 & 动画
│   ├── postcss.config.js
│   ├── env.d.ts
│   │
│   └── src/
│       ├── main.ts                      # 应用入口，挂载 Pinia / Router
│       ├── App.vue                      # 根布局
│       │
│       ├── api/
│       │   └── index.ts                 # Axios 实例，请求拦截器注入 JWT，401 自动登出
│       │
│       ├── router/
│       │   └── index.ts                 # 路由表 + 导航守卫（guest / auth）
│       │
│       ├── stores/
│       │   ├── auth.ts                  # 用户认证状态 & Token 管理
│       │   ├── notes.ts                 # 笔记列表、筛选、AI 分析状态
│       │   └── chat.ts                  # Agent 会话管理 & 消息流
│       │
│       ├── types/
│       │   └── index.ts                 # 全局 TS 类型（Message / AgentTool / Plan 等）
│       │
│       ├── pages/
│       │   ├── Login.vue                # 登录 / 注册页
│       │   ├── Dashboard.vue            # 笔记管理主界面（搜索 / 筛选 / 统计）
│       │   └── AgentWorkbench.vue       # AI Agent 工作台（三栏布局）
│       │
│       ├── components/
│       │   │── Navbar.vue               # 全局顶部导航（笔记 / Agent 切换）
│       │   │
│       │   │── notes/
│       │   │   └── NoteModal.vue        # 笔记编辑 / AI 分析弹窗
│       │   │
│       │   └── agent/
│       │       ├── Sidebar.vue          # Agent 会话列表侧边栏
│       │       ├── ChatPanel.vue        # 对话主面板（输入 + 消息流）
│       │       ├── MessageBubble.vue    # 消息气泡（支持思考过程 / 工具调用展示）
│       │       ├── ThinkingIndicator.vue # Agent 推理状态指示器
│       │       ├── CodePreview.vue      # 代码高亮 + iframe 实时预览
│       │       └── WelcomeOverlay.vue   # 引导页 & 示例 Prompt
│       │
│       ├── services/                    # ★ Agent 核心引擎
│       │   ├── agent.ts                 # AgentCore — ReAct 主循环（Reason → Act → Observe）
│       │   ├── planner.ts               # 意图分类器 + 多步任务规划器
│       │   ├── tools.ts                 # 工具注册表 + 内置工具实现
│       │   └── templates.ts             # 组件 / 样式模板库
│       │
│       └── styles/
│           └── main.css                 # Tailwind 层级扩展 & 自定义动画
│
└── server/                              # 后端服务
    ├── package.json
    ├── tsconfig.json
    ├── .env.example                     # 环境变量模板
    │
    └── src/
        ├── index.ts                     # Express 入口，CORS / 路由 / 错误处理
        ├── db.ts                        # SQLite 初始化 + CRUD 封装 + 写后持久化
        ├── middleware.ts                # JWT 认证中间件 + 全局错误处理
        │
        ├── routes/
        │   ├── auth.ts                  # POST /register, /login（bcrypt + JWT 签发）
        │   ├── notes.ts                 # 笔记 REST API + AI 摘要 / 标签
        │   └── agent.ts                 # Agent 会话历史 CRUD
        │
        ├── services/
        │   └── ai.ts                    # LLM 调用层（摘要 / 标签 / Agent 推理）
        │
        └── data/                        # 运行时 SQLite 数据文件
            └── devstudio.db
```

## 核心功能

### 模块一：智能笔记（DevNotes）

| 功能 | 说明 |
|------|------|
| 笔记 CRUD | 创建、编辑、删除、收藏，支持编程语言标记 |
| 全文搜索 | 按标题 / 内容 / 标签模糊搜索 |
| AI 摘要 | 调用 LLM 自动生成笔记摘要 |
| AI 标签 | 智能提取技术关键词作为标签 |
| 数据统计 | 笔记总数、收藏数、AI 分析数、语言分布 |

### 模块二：代码 Agent（FE-Agent）

| 功能 | 说明 |
|------|------|
| 自然语言生成组件 | 描述需求 → 生成 Vue / React 组件代码 |
| 代码分析 | 结构分析、性能评估、最佳实践检查 |
| 重构建议 | 识别 Code Smell，给出优化方案 |
| 样式生成 | 根据描述生成 Tailwind / CSS 样式 |
| 实时预览 | iframe 沙箱内实时渲染生成的组件 |
| 可解释推理 | 完整展示 Agent 的规划 → 推理 → 反思过程 |

## 架构设计

### 全栈请求流程

```
浏览器
  ↓ Axios (JWT in Header)
Vue Router Guard ──→ Login Page (guest)
  ↓ (authenticated)
Pinia Store ──→ API Layer ──→ Vite Dev Proxy (/api)
                                    ↓
                              Express Server
                                    ↓
                         ┌──────────┼──────────┐
                    Auth Routes  Note Routes  Agent Routes
                         ↓          ↓            ↓
                      bcrypt    SQLite(sql.js)  AI Service
                      + JWT     read/write      ↓
                                            OpenAI API
```

### ReAct Agent 架构

```
用户输入
  ↓
┌─────────────────────────────────────────┐
│          AgentCore (ReAct Loop)          │
│                                         │
│  ① Classify ──→ 意图识别                │
│       ↓          (组件生成/代码分析/重构) │
│  ② Plan    ──→ 任务规划                 │
│       ↓          (拆解为有序子任务)       │
│  ③ Act     ──→ 工具调用                 │
│       ↓          (Tool Registry 分发)    │
│  ④ Observe ──→ 结果收集                 │
│       ↓                                 │
│  ⑤ Reflect ──→ 质量自检 & 补充          │
│       ↓                                 │
│  ⑥ Stream  ──→ 流式输出到 UI            │
└─────────────────────────────────────────┘
         ↓ callbacks
   onThinking / onToolCall / onStream
         ↓
     ChatPanel → MessageBubble (渲染)
```

### 工具注册表（可扩展）

```typescript
interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, ParameterSchema>;
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

// 注册新工具只需实现接口并注册
toolRegistry.register({
  name: 'generateComponent',
  description: '根据描述生成前端组件',
  parameters: { description: { type: 'string', required: true } },
  execute: async (params) => { /* ... */ }
});
```

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | — |
| POST | `/api/auth/login` | 用户登录，返回 JWT | — |
| GET | `/api/notes` | 笔记列表（支持 `q` / `tag` / `favorite` 筛选） | JWT |
| GET | `/api/notes/stats` | 笔记统计（总数 / 收藏 / AI分析数 / 语言分布） | JWT |
| GET | `/api/notes/:id` | 笔记详情 | JWT |
| POST | `/api/notes` | 创建笔记 | JWT |
| PUT | `/api/notes/:id` | 更新笔记 | JWT |
| DELETE | `/api/notes/:id` | 删除笔记 | JWT |
| POST | `/api/notes/:id/ai-analyze` | AI 摘要 + 标签生成 | JWT |
| GET | `/api/agent/sessions` | Agent 会话列表 | JWT |
| POST | `/api/agent/sessions` | 创建 Agent 会话 | JWT |
| GET | `/api/agent/sessions/:id/messages` | 会话消息历史 | JWT |
| GET | `/api/health` | 健康检查 | — |

## 数据库设计

```sql
-- 用户表
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    DEFAULT (datetime('now'))
);

-- 笔记表
CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  content     TEXT    DEFAULT '',
  language    TEXT    DEFAULT 'plaintext',
  tags        TEXT    DEFAULT '[]',       -- JSON array
  summary     TEXT    DEFAULT '',
  is_favorite INTEGER DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- Agent 会话表
CREATE TABLE agent_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    DEFAULT 'New Chat',
  created_at TEXT    DEFAULT (datetime('now')),
  updated_at TEXT    DEFAULT (datetime('now'))
);

-- Agent 消息表
CREATE TABLE agent_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL,            -- 'user' | 'assistant' | 'tool'
  content    TEXT    NOT NULL,
  metadata   TEXT    DEFAULT '{}',        -- JSON: tool_calls, thinking, plan
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_user    ON notes(user_id);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX idx_messages_session ON agent_messages(session_id);
```

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/yourname/ai-devstudio.git
cd ai-devstudio

# 2. 启动后端
cd server
cp .env.example .env          # 编辑 .env 配置 JWT_SECRET 和可选的 AI_API_KEY
npm install
npm run dev                   # http://localhost:3001

# 3. 启动前端（新终端）
cd client
npm install
npm run dev                   # http://localhost:5173
```

### 环境变量

```env
PORT=3001
CLIENT_URL=http://localhost:5173
JWT_SECRET=change-me-to-a-random-string

# AI 配置（可选，不配置则使用 Mock 模式）
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-3.5-turbo
```

## 项目亮点

1. **ReAct Agent 架构**：完整实现 Reasoning + Acting 循环，Agent 具备意图识别、多步规划、工具调用、结果反思能力，对标业界 AI Agent 设计范式
2. **可扩展工具系统**：基于注册表模式的 Tool Registry，新增工具只需实现 `AgentTool` 接口并注册，零改动即插即用
3. **全栈工程闭环**：前端 Vue 3 + 后端 Express + SQLite，JWT 认证链路完整，RESTful API 规范，覆盖从注册登录到数据持久化的全流程
4. **AI 能力分层**：LLM 调用抽象为独立 Service 层，支持真实 API / Mock 模式无缝切换，便于本地开发与演示
5. **Agent 推理可视化**：完整展示 Agent 的思考过程、任务规划、工具调用链，提升可解释性和用户信任度
6. **安全实践**：JWT 认证 + bcrypt 密码哈希 + Axios 拦截器自动登出 + iframe sandbox 代码隔离 + DOMPurify XSS 防护

## 扩展路线（Roadmap）

> 以下特性已在架构中预留扩展点，可在 GitHub 上持续迭代：

- [ ] **接入真实 LLM**：对接 OpenAI / Claude / DeepSeek / 本地 Ollama 模型
- [ ] **Agent 记忆系统**：短期对话记忆 + 长期用户偏好存储
- [ ] **多文件项目生成**：从单组件扩展到完整项目脚手架生成
- [ ] **Monaco Editor 集成**：替换简易编辑器为 VS Code 同款编辑体验
- [ ] **多框架支持**：扩展 React / Svelte / Solid 组件生成模板
- [ ] **MCP 协议对接**：支持 Model Context Protocol，接入外部工具和数据源
- [ ] **RAG 知识库**：结合向量数据库为 Agent 注入项目上下文
- [ ] **协作编辑**：WebSocket 实时协作 + 操作冲突解决
- [ ] **CI/CD 集成**：GitHub Actions 自动化测试与部署
- [ ] **插件市场**：社区贡献工具插件，丰富 Agent 能力生态

## License

MIT
