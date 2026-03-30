/**
 * Vite 构建工具配置
 *
 * Vite 相比 Webpack 的优势：
 * - 开发阶段使用原生 ESM（无打包），启动速度极快
 * - 生产构建基于 Rollup，支持 Tree Shaking
 * - 内置 HMR（热模块替换），修改后毫秒级生效
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'       // Vue 3 SFC 编译插件
import { resolve } from 'path'

export default defineConfig({
  /** 插件列表：@vitejs/plugin-vue 负责编译 .vue 单文件组件 */
  plugins: [vue()],

  resolve: {
    /**
     * 路径别名：@ → src 目录
     * 使得 import 可以写成 '@/stores/auth' 而非 '../../stores/auth'
     * 需要同步配置 tsconfig.json 的 paths 字段
     */
    alias: { '@': resolve(__dirname, 'src') },
  },

  server: {
    port: 5173,
    /**
     * 开发代理：将 /api 请求转发到后端 Express 服务
     * changeOrigin: true —— 修改 Host 请求头为目标地址
     * 解决开发环境跨域问题（生产环境由 Nginx 或同域部署解决）
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      /** 协作 WebSocket：与后端同机时可设 VITE_WS_URL 直连 3001，否则可用 ws://localhost:5173/yjs */
      '/yjs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
