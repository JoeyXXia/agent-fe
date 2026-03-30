/**
 * 意图分类器 + 任务规划器
 *
 * 职责：
 * 1. intentClassifier —— 基于关键词匹配的多分类器，识别用户意图
 * 2. planGenerator    —— 根据意图类型生成有序的执行计划（工厂方法模式）
 */
import type { AgentPlan, PlanStep } from '@/types'

/** 意图数据结构 */
interface Intent {
  type: string                      // 意图类型标识（generate_component / explain_code / ...）
  confidence: number                // 置信度 0~1
  params: Record<string, string>    // 从用户输入中提取的结构化参数
}

/**
 * 意图模式配置表
 * 每个意图包含：类型标识、匹配关键词列表、可选的参数提取函数
 * 支持中英文混合关键词
 */
const INTENT_PATTERNS: Array<{
  type: string
  keywords: string[]
  extract?: (input: string, ctx: { defaultFramework: string }) => Record<string, string>
}> = [
  {
    /** 初始化 / 多包仓库等「项目级」生成，区别于单文件组件 */
    type: 'generate_project',
    keywords: [
      // 强触发「项目级」生成的短语（避免仅命中「生成」而走组件链）
      '生成项目',
      '创建项目',
      '搭项目',
      '脚手架',
      'scaffold',
      '项目',
      '工程',
      '初始化',
      'starter',
      'boilerplate',
      '新建项目',
      '搭一个项目',
      'init project',
      'vite',
      '模板工程',
      'monorepo',
      'workspace',
      'pnpm',
      'turbo',
      'nx',
      'lerna',
      '仓库',
    ],
    extract: (input): Record<string, string> => {
      const m = input.match(/\b(vite-vue-ts|vite_vue_ts)\b/i)
      if (m) return { templateId: m[1].toLowerCase().replace(/_/g, '-') }
      return {}
    },
  },
  {
    type: 'generate_component',
    keywords: ['生成', '创建', '写一个', '做一个', '帮我写', '组件', 'component', '页面', '表单', '列表', '卡片', '按钮', '导航', '弹窗', 'modal', 'form', 'table', 'card', 'button', 'nav'],
    /** 参数提取：从输入中识别组件名和框架偏好 */
    extract: (input, ctx) => {
      // 正则匹配显式命名，如「叫 LoginForm」「名为 MyComp」
      const nameMatch = input.match(/(?:叫|名为|命名为|名字是)\s*["""]?(\w+)["""]?/)
      // 正则匹配框架偏好（本地工具仅保证 Vue；React 仅用于远程/提示）
      const frameworkMatch = input.match(/(vue|react)/i)
      return {
        componentName: nameMatch?.[1] || extractComponentName(input),
        framework: frameworkMatch?.[1]?.toLowerCase() || ctx.defaultFramework || 'vue',
      }
    },
  },
  {
    type: 'explain_code',
    keywords: ['解释', '说明', '什么意思', '怎么理解', '分析', 'explain', 'analyze'],
  },
  {
    type: 'refactor',
    keywords: ['重构', '优化', '改进', '改善', 'refactor', 'optimize', 'improve'],
  },
  {
    type: 'debug',
    keywords: ['报错', '错误', 'bug', '问题', '不工作', 'error', 'fix', '修复', '为什么'],
  },
  {
    type: 'style',
    keywords: ['样式', '颜色', '布局', '响应式', 'css', 'style', 'layout', 'responsive', 'tailwind'],
  },
]

/**
 * 组件名推断 —— 当用户未显式命名时，根据关键词自动推断
 * 使用关键词 → 组件名的映射表进行匹配
 */
function extractComponentName(input: string): string {
  const nameMap: Record<string, string> = {
    '登录': 'LoginForm',
    'login': 'LoginForm',
    '注册': 'RegisterForm',
    'register': 'RegisterForm',
    'signup': 'RegisterForm',
    '表单': 'FormComponent',
    'form': 'FormComponent',
    '表格': 'DataTable',
    'table': 'DataTable',
    '卡片': 'CardComponent',
    'card': 'CardComponent',
    '导航': 'NavBar',
    'nav': 'NavBar',
    'header': 'HeaderComponent',
    '弹窗': 'ModalDialog',
    'modal': 'ModalDialog',
    'dialog': 'ModalDialog',
    '列表': 'ListComponent',
    'list': 'ListComponent',
    '搜索': 'SearchBar',
    'search': 'SearchBar',
    '评论': 'CommentSection',
    'comment': 'CommentSection',
    '用户': 'UserProfile',
    'user': 'UserProfile',
    'profile': 'UserProfile',
    'dashboard': 'Dashboard',
    '仪表盘': 'Dashboard',
    'todo': 'TodoList',
    '待办': 'TodoList',
  }

  const lowerInput = input.toLowerCase()
  for (const [key, value] of Object.entries(nameMap)) {
    if (lowerInput.includes(key)) return value
  }

  return 'GeneratedComponent' // 兜底默认名
}

/**
 * 意图分类主函数
 *
 * 算法：遍历所有意图模式，统计关键词命中数 → 计算置信度 → 取最高分
 * 置信度公式：confidence = min(matchCount / 2, 1)
 *   - 命中 1 个关键词 → 50%
 *   - 命中 2 个及以上 → 100%
 */
export function intentClassifier(
  input: string,
  opts?: { defaultFramework?: string }
): Intent {
  const lowerInput = input.toLowerCase()
  const defaultFramework = opts?.defaultFramework === 'react' ? 'react' : 'vue'
  // 默认值：general 意图，置信度 0.3（兜底）
  let bestMatch = { type: 'general', confidence: 0.3, params: {} as Record<string, string> }

  for (const pattern of INTENT_PATTERNS) {
    /** 统计输入文本中命中的关键词数量 */
    const matchCount = pattern.keywords.filter((kw) => lowerInput.includes(kw)).length
    const confidence = Math.min(matchCount / 2, 1)

    /** 保留置信度最高的意图 */
    if (confidence > bestMatch.confidence) {
      bestMatch = {
        type: pattern.type,
        confidence,
        params: pattern.extract?.(input, { defaultFramework }) || {}, // 可选链：有 extract 函数才调用
      }
    }
  }

  return bestMatch
}

/**
 * 计划生成器（工厂方法模式）
 *
 * 根据意图类型查找对应的计划模板，生成有序的执行步骤。
 * 每个步骤可以绑定一个工具名（toolName），AgentCore 会在执行阶段调用对应工具。
 * 使用函数工厂 (() => PlanStep[]) 确保每次调用生成全新对象，避免状态共享。
 */
export function planGenerator(
  intent: Intent,
  userInput: string
): AgentPlan {
  const planTemplates: Record<string, () => PlanStep[]> = {
    /**
     * 项目脚手架：选型 → 多文件生成 → README（README 含于模板输出中的 README.md）
     * 若仅需单步工具调用，可改为只保留带 generateProjectScaffold 的一步。
     */
    generate_project: () => [
      { id: 's1', description: '选型：根据描述匹配模板与技术栈', status: 'pending' },
      {
        id: 's2',
        description: '生成项目脚手架（多文件）',
        toolName: 'generateProjectScaffold',
        status: 'pending',
      },
      { id: 's3', description: '生成 README 与使用说明（见输出中的 README.md）', status: 'pending' },
    ],
    /** 组件生成：分析 → 生成代码 → 生成样式 → 组装 */
    generate_component: () => [
      { id: 's1', description: '分析组件需求', status: 'pending' },
      { id: 's2', description: '生成组件代码', toolName: 'generateComponent', status: 'pending' },
      { id: 's3', description: '生成样式代码', toolName: 'generateStyles', status: 'pending' },
      { id: 's4', description: '组装最终结果', status: 'pending' },
    ],
    /** 代码解释：分析结构 → 生成说明 */
    explain_code: () => [
      { id: 's1', description: '解析代码结构', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '生成解释说明', status: 'pending' },
    ],
    /** 代码重构：分析 → 生成建议 */
    refactor: () => [
      { id: 's1', description: '分析现有代码', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '生成重构建议', toolName: 'refactorCode', status: 'pending' },
    ],
    /** 调试排错：分析错误 → 定位原因 → 生成修复 */
    debug: () => [
      { id: 's1', description: '分析错误信息', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '定位问题原因', status: 'pending' },
      { id: 's3', description: '生成修复方案', toolName: 'generateComponent', status: 'pending' },
    ],
    /** 样式生成：分析需求 → 生成样式 */
    style: () => [
      { id: 's1', description: '分析样式需求', status: 'pending' },
      { id: 's2', description: '生成样式代码', toolName: 'generateStyles', status: 'pending' },
    ],
    /** 通用对话（兜底） */
    general: () => [
      { id: 's1', description: '理解问题', status: 'pending' },
      { id: 's2', description: '生成回复', status: 'pending' },
    ],
  }

  const steps = (planTemplates[intent.type] || planTemplates.general)()

  return {
    id: `plan_${Date.now()}`,
    goal: userInput,
    steps,
    status: 'executing',
  }
}
