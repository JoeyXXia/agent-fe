<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import Sidebar from '../components/agent/Sidebar.vue'
import ChatPanel from '../components/agent/ChatPanel.vue'
import CodePreview from '../components/agent/CodePreview.vue'
import WelcomeOverlay from '../components/agent/WelcomeOverlay.vue'

const chatStore = useChatStore()
const auth = useAuthStore()
const router = useRouter()

const showWelcome = computed(
  () => !chatStore.activeConversation && chatStore.conversations.length === 0
)
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden bg-dark-950">
    <!-- Agent Sidebar -->
    <aside class="w-64 h-full flex flex-col glass-panel">
      <div class="p-4 border-b border-dark-700/50">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary-500/20">
              A
            </div>
            <div>
              <h1 class="text-base font-bold text-white">AI DevStudio</h1>
              <p class="text-xs text-dark-400">代码 Agent</p>
            </div>
          </div>
        </div>
        <div class="flex gap-2 mb-3">
          <button
            @click="router.push('/dashboard')"
            class="flex-1 px-3 py-1.5 text-xs text-dark-300 hover:text-white hover:bg-dark-800 rounded-lg transition"
          >
            笔记
          </button>
          <button
            class="flex-1 px-3 py-1.5 text-xs bg-dark-700 text-white rounded-lg"
          >
            Agent
          </button>
        </div>
        <button @click="chatStore.createConversation()" class="w-full btn-primary flex items-center justify-center gap-2 text-sm">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建对话
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-1">
        <div
          v-for="conv in chatStore.conversations"
          :key="conv.id"
          class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group flex items-center justify-between cursor-pointer"
          :class="conv.id === chatStore.activeConversationId
            ? 'bg-dark-700 text-white'
            : 'text-dark-300 hover:bg-dark-800 hover:text-white'"
          @click="chatStore.setActiveConversation(conv.id)"
        >
          <span class="truncate flex-1">{{ conv.title }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-dark-600 transition"
            @click.stop="chatStore.deleteConversation(conv.id)"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>

        <div v-if="chatStore.conversations.length === 0" class="text-center py-8">
          <p class="text-dark-500 text-sm">暂无对话</p>
          <p class="text-dark-600 text-xs mt-1">点击上方按钮开始</p>
        </div>
      </div>

      <div class="p-4 border-t border-dark-700/50 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs text-dark-500">
          <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          <span>Agent 就绪</span>
        </div>
        <button
          @click="auth.logout()"
          class="text-xs text-dark-500 hover:text-red-400 transition"
        >
          退出
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex overflow-hidden">
      <WelcomeOverlay v-if="showWelcome" />

      <template v-else>
        <ChatPanel class="flex-1 min-w-0" />

        <transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="w-0 opacity-0"
          enter-to-class="w-[45%] opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="w-[45%] opacity-100"
          leave-to-class="w-0 opacity-0"
        >
          <div v-if="chatStore.showPreview" class="w-[45%] flex-shrink-0 border-l border-dark-700/50">
            <CodePreview
              :code="chatStore.previewCode"
              :language="chatStore.previewLanguage"
              @close="chatStore.closePreview()"
            />
          </div>
        </transition>
      </template>
    </main>
  </div>
</template>
