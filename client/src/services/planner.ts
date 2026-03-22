import type { AgentPlan, PlanStep } from '@/types'

interface Intent {
  type: string
  confidence: number
  params: Record<string, string>
}

const INTENT_PATTERNS: Array<{
  type: string
  keywords: string[]
  extract?: (input: string) => Record<string, string>
}> = [
  {
    type: 'generate_component',
    keywords: ['生成', '创建', '写一个', '做一个', '帮我写', '组件', 'component', '页面', '表单', '列表', '卡片', '按钮', '导航', '弹窗', 'modal', 'form', 'table', 'card', 'button', 'nav'],
    extract: (input) => {
      const nameMatch = input.match(/(?:叫|名为|命名为|名字是)\s*["""]?(\w+)["""]?/)
      const frameworkMatch = input.match(/(vue|react|svelte)/i)
      return {
        componentName: nameMatch?.[1] || extractComponentName(input),
        framework: frameworkMatch?.[1]?.toLowerCase() || 'vue',
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

  return 'GeneratedComponent'
}

export function intentClassifier(input: string): Intent {
  const lowerInput = input.toLowerCase()
  let bestMatch = { type: 'general', confidence: 0.3, params: {} as Record<string, string> }

  for (const pattern of INTENT_PATTERNS) {
    const matchCount = pattern.keywords.filter((kw) => lowerInput.includes(kw)).length
    const confidence = Math.min(matchCount / 2, 1)

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        type: pattern.type,
        confidence,
        params: pattern.extract?.(input) || {},
      }
    }
  }

  return bestMatch
}

export function planGenerator(
  intent: Intent,
  userInput: string
): AgentPlan {
  const planTemplates: Record<string, () => PlanStep[]> = {
    generate_component: () => [
      { id: 's1', description: '分析组件需求', status: 'pending' },
      { id: 's2', description: '生成组件代码', toolName: 'generateComponent', status: 'pending' },
      { id: 's3', description: '生成样式代码', toolName: 'generateStyles', status: 'pending' },
      { id: 's4', description: '组装最终结果', status: 'pending' },
    ],
    explain_code: () => [
      { id: 's1', description: '解析代码结构', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '生成解释说明', status: 'pending' },
    ],
    refactor: () => [
      { id: 's1', description: '分析现有代码', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '生成重构建议', toolName: 'refactorCode', status: 'pending' },
    ],
    debug: () => [
      { id: 's1', description: '分析错误信息', toolName: 'analyzeCode', status: 'pending' },
      { id: 's2', description: '定位问题原因', status: 'pending' },
      { id: 's3', description: '生成修复方案', toolName: 'generateComponent', status: 'pending' },
    ],
    style: () => [
      { id: 's1', description: '分析样式需求', status: 'pending' },
      { id: 's2', description: '生成样式代码', toolName: 'generateStyles', status: 'pending' },
    ],
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
