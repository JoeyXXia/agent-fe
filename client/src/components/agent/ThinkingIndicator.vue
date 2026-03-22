<script setup lang="ts">
/**
 * 流式「进行中」气泡：展示当前思考步骤与工具调用状态，底部为加载动画点
 * - 仅通过 defineProps 接收 steps / toolCalls，无本地状态；父组件 ChatPanel 在 isProcessing 时挂载
 * - 与 MessageBubble 内嵌的「已完成」思考块结构对应，便于用户区分历史与实时
 */
import type { ThinkingStep, ToolCallRecord } from '@/types'

defineProps<{
  steps: ThinkingStep[]
  toolCalls: ToolCallRecord[]
}>()
</script>

<template>
  <div class="flex gap-3 animate-slide-up">
    <div class="flex-shrink-0">
      <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 text-white flex items-center justify-center text-sm font-medium shadow-lg shadow-primary-500/20">
        A
      </div>
    </div>

    <!-- 实时思考与工具：与 chatStore.currentThinking / currentToolCalls 绑定 -->
    <div class="bg-dark-800 rounded-2xl rounded-tl-md border border-dark-700/50 px-4 py-3 max-w-[80%]">
      <div v-if="steps.length > 0" class="space-y-2 mb-3">
        <div
          v-for="step in steps"
          :key="step.id"
          class="flex items-start gap-2 text-xs animate-fade-in"
        >
          <span class="flex-shrink-0 mt-0.5">
            <span v-if="step.type === 'planning'" class="text-blue-400 font-mono">Plan</span>
            <span v-else-if="step.type === 'reasoning'" class="text-yellow-400 font-mono">Think</span>
            <span v-else class="text-green-400 font-mono">Check</span>
          </span>
          <span class="text-dark-300">{{ step.content }}</span>
        </div>
      </div>

      <div v-if="toolCalls.length > 0" class="space-y-1.5 mb-3">
        <div
          v-for="tc in toolCalls"
          :key="tc.id"
          class="flex items-center gap-2 text-xs animate-fade-in"
        >
          <span
            class="h-1.5 w-1.5 rounded-full flex-shrink-0"
            :class="{
              'bg-green-400': tc.status === 'success',
              'bg-red-400': tc.status === 'error',
              'bg-yellow-400 animate-pulse': tc.status === 'running',
              'bg-dark-500': tc.status === 'pending',
            }"
          ></span>
          <span class="text-dark-300 font-mono">{{ tc.toolName }}</span>
          <span v-if="tc.status === 'running'" class="text-dark-500">执行中...</span>
          <span v-else-if="tc.duration" class="text-dark-500">{{ tc.duration }}ms</span>
        </div>
      </div>

      <!-- 等待下一轮输出时的占位动画 -->
      <div class="flex items-center gap-1.5">
        <div class="thinking-dot h-2 w-2 rounded-full bg-primary-400"></div>
        <div class="thinking-dot h-2 w-2 rounded-full bg-primary-400"></div>
        <div class="thinking-dot h-2 w-2 rounded-full bg-primary-400"></div>
      </div>
    </div>
  </div>
</template>
