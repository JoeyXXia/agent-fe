import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'
/** 为 MessageBubble / CodePreview 的 hljs 高亮提供配色（否则仅有 class 无颜色、难以辨认） */
import 'highlight.js/styles/github-dark.min.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
