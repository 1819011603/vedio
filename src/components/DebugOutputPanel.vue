<template>
  <div v-if="visible" class="debug-panel">
    <div class="panel-header">
      <span class="panel-title">调试输出</span>
      <div class="panel-actions">
        <button class="btn-icon" @click="clear" title="清空">清空</button>
        <button class="btn-icon" @click="collapsed = !collapsed" :title="collapsed ? '展开' : '收起'">
          {{ collapsed ? '展开' : '收起' }}
        </button>
      </div>
    </div>
    <div v-show="!collapsed" ref="logRef" class="log-content">
      <div v-for="(item, i) in lines" :key="i" :class="['log-line', item.stream]">
        <span class="log-type">[{{ item.type }}]</span>
        <span class="log-text">{{ item.line }}</span>
      </div>
      <div v-if="lines.length === 0 && !hasReceived" class="log-placeholder">
        解析或下载时将在此显示 yt-dlp 等命令的实时输出...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settings-store'

const settingsStore = useSettingsStore()
const lines = ref<Array<{ type: string; line: string; stream?: string }>>([])
const logRef = ref<HTMLDivElement | null>(null)
const collapsed = ref(false)
const hasReceived = ref(false)
const MAX_LINES = 500

const visible = computed(() => settingsStore.showParseDownloadOutput)

function append(data: { type: string; line: string; stream?: string }) {
  hasReceived.value = true
  lines.value.push(data)
  if (lines.value.length > MAX_LINES) {
    lines.value = lines.value.slice(-MAX_LINES)
  }
  nextTickScroll()
}

function clear() {
  lines.value = []
  hasReceived.value = false
}

function nextTickScroll() {
  nextTick(() => {
    const el = logRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

let unsubscribe: (() => void) | null | undefined = null

onMounted(() => {
  unsubscribe = window.electronAPI?.onParseDownloadOutput?.((data: { type: string; line: string; stream?: string }) => {
    if (visible.value) append(data)
  }) ?? null
})

onUnmounted(() => {
  unsubscribe?.()
})

watch(visible, (v) => {
  if (v) nextTickScroll()
  else clear()
})
</script>

<style scoped>
.debug-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 480px;
  max-height: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.panel-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}
.panel-actions {
  display: flex;
  gap: 8px;
}
.btn-icon {
  padding: 4px 10px;
  font-size: 0.8rem;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.btn-icon:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  max-height: 260px;
}
.log-line {
  margin-bottom: 2px;
  word-break: break-all;
}
.log-type {
  color: var(--accent);
  margin-right: 8px;
  flex-shrink: 0;
}
.log-text {
  color: var(--text-primary);
}
.log-line.stderr .log-text {
  color: #f59e0b;
}
.log-placeholder {
  color: var(--text-muted);
  font-style: italic;
}
</style>
