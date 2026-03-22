import type { AgentTool, ToolResult, CodeBlock } from '@/types'
import { componentTemplates } from './templates'

const generateComponent: AgentTool = {
  name: 'generateComponent',
  description: '根据自然语言描述生成前端组件代码',
  icon: '🧩',
  parameters: [
    { name: 'description', type: 'string', description: '组件描述', required: true },
    { name: 'componentName', type: 'string', description: '组件名称', required: true },
    { name: 'framework', type: 'string', description: '框架 (vue/react)', required: false },
    { name: 'style', type: 'string', description: '样式方案', required: false },
  ],
  async execute(args): Promise<ToolResult> {
    const name = args.componentName as string
    const description = args.description as string
    const framework = (args.framework as string) || 'vue'

    const template = componentTemplates.findBestMatch(description, framework)
    const code = template.generate(name, description)

    const codeBlocks: CodeBlock[] = [
      {
        id: `cb_${Date.now()}`,
        language: framework === 'vue' ? 'vue' : 'tsx',
        code,
        filename: framework === 'vue' ? `${name}.vue` : `${name}.tsx`,
      },
    ]

    return {
      success: true,
      data: { componentName: name, code, framework },
      message: `成功生成 ${framework.toUpperCase()} 组件 \`${name}\``,
      codeBlocks,
    }
  },
}

const generateStyles: AgentTool = {
  name: 'generateStyles',
  description: '生成组件样式代码',
  icon: '🎨',
  parameters: [
    { name: 'description', type: 'string', description: '样式描述', required: true },
    { name: 'style', type: 'string', description: '样式方案 (tailwind/css/scss)', required: false },
  ],
  async execute(args): Promise<ToolResult> {
    const description = args.description as string
    const styleType = (args.style as string) || 'tailwind'

    const lowerDesc = description.toLowerCase()

    let styleCode: string
    if (styleType === 'tailwind') {
      styleCode = generateTailwindClasses(lowerDesc)
    } else {
      styleCode = generateCSSCode(lowerDesc)
    }

    return {
      success: true,
      data: { styleCode, type: styleType },
      message: `已生成 ${styleType} 样式方案`,
      codeBlocks: [
        {
          id: `style_${Date.now()}`,
          language: styleType === 'tailwind' ? 'html' : 'css',
          code: styleCode,
          filename: styleType === 'tailwind' ? undefined : 'styles.css',
        },
      ],
    }
  },
}

const analyzeCode: AgentTool = {
  name: 'analyzeCode',
  description: '分析代码结构、性能和最佳实践',
  icon: '🔍',
  parameters: [
    { name: 'description', type: 'string', description: '要分析的代码或问题描述', required: true },
  ],
  async execute(args): Promise<ToolResult> {
    const description = args.description as string
    const analysis = generateAnalysis(description)

    return {
      success: true,
      data: { analysis },
      message: analysis,
    }
  },
}

const refactorCode: AgentTool = {
  name: 'refactorCode',
  description: '提供代码重构建议和优化方案',
  icon: '♻️',
  parameters: [
    { name: 'description', type: 'string', description: '需要重构的代码描述', required: true },
  ],
  async execute(args): Promise<ToolResult> {
    const description = args.description as string

    const suggestions = [
      '**1. 组件拆分**: 将大组件拆分为更小的、可复用的子组件',
      '**2. 状态管理优化**: 使用 composable 函数提取共享逻辑',
      '**3. 性能优化**: 使用 `computed` 缓存计算结果，避免不必要的重渲染',
      '**4. 类型安全**: 添加完整的 TypeScript 类型定义',
      '**5. 错误处理**: 添加边界情况处理和错误恢复机制',
    ]

    return {
      success: true,
      data: { suggestions },
      message: suggestions.join('\n'),
    }
  },
}

function generateTailwindClasses(desc: string): string {
  const classes: string[] = []

  if (desc.includes('暗色') || desc.includes('dark')) {
    classes.push('bg-gray-900 text-white')
  } else {
    classes.push('bg-white text-gray-900')
  }

  if (desc.includes('圆角') || desc.includes('round')) {
    classes.push('rounded-xl')
  }

  if (desc.includes('阴影') || desc.includes('shadow')) {
    classes.push('shadow-lg')
  }

  if (desc.includes('渐变') || desc.includes('gradient')) {
    classes.push('bg-gradient-to-r from-blue-500 to-purple-600')
  }

  if (desc.includes('响应式') || desc.includes('responsive')) {
    classes.push('w-full md:w-1/2 lg:w-1/3')
  }

  classes.push('p-6 transition-all duration-200 hover:shadow-xl')

  return `<!-- Tailwind CSS 样式方案 -->\n<div class="${classes.join(' ')}">\n  <!-- 内容区域 -->\n</div>`
}

function generateCSSCode(desc: string): string {
  return `.component {
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: ${desc.includes('暗') ? '#1a1a2e' : '#ffffff'};
  color: ${desc.includes('暗') ? '#e2e8f0' : '#1a202c'};
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.component:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}`
}

function generateAnalysis(desc: string): string {
  const topics: string[] = []

  if (desc.includes('性能') || desc.includes('performance') || desc.includes('优化')) {
    topics.push(
      '**性能分析**:\n- 检查是否存在不必要的重渲染\n- 建议使用 `v-memo` 或 `useMemo` 优化列表渲染\n- 考虑使用虚拟滚动处理长列表'
    )
  }

  if (desc.includes('组件') || desc.includes('component')) {
    topics.push(
      '**组件结构分析**:\n- 组件职责是否单一\n- Props 设计是否合理\n- 事件通信方式是否恰当'
    )
  }

  if (desc.includes('状态') || desc.includes('state')) {
    topics.push(
      '**状态管理分析**:\n- 状态提升是否合理\n- 是否需要引入全局状态管理\n- 响应式数据粒度是否合适'
    )
  }

  if (topics.length === 0) {
    topics.push(
      '**代码质量分析**:\n- 代码结构清晰，模块化程度良好\n- 建议补充 TypeScript 类型定义\n- 建议添加单元测试覆盖核心逻辑\n- 考虑添加 JSDoc 注释提升可维护性'
    )
  }

  return topics.join('\n\n')
}

export const toolRegistry: AgentTool[] = [
  generateComponent,
  generateStyles,
  analyzeCode,
  refactorCode,
]
