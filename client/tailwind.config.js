/**
 * Tailwind CSS 配置
 *
 * Tailwind v3 默认启用 JIT（Just-In-Time）编译模式：
 * - 按需生成 CSS，只生成项目中实际用到的工具类
 * - 支持任意值（arbitrary values），如 w-[37px]
 * - 开发体验接近零配置，生产包体积极小
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  /**
   * content —— 扫描范围
   * Tailwind 会扫描这些文件中的类名，按需生成对应 CSS
   * 必须覆盖所有使用 Tailwind 类的文件
   */
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],

  theme: {
    extend: {
      /**
       * 自定义色板
       * primary（蓝色系）：主品牌色，用于按钮、链接、高亮等
       * dark（灰色系）  ：深色背景、文本层次、Agent 工作台配色
       * 数字 50-950 对应从浅到深的色阶
       */
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },

      /**
       * 自定义动画
       * pulse-slow —— 慢速脉冲（用于 ThinkingIndicator 加载态）
       * slide-up   —— 从下方滑入（消息气泡入场）
       * fade-in    —— 淡入（通用入场动画）
       */
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      /** 自定义关键帧 */
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },

  plugins: [],
}
