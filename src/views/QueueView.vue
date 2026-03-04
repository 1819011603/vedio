<template>
  <div class="queue-view">
    <div class="header-row">
      <h2>下载队列</h2>
      <button
        v-if="cancelableCount > 0"
        class="btn btn-sm btn-danger"
        @click="downloadStore.cancelAll()"
      >
        全部取消
      </button>
    </div>
    <div v-if="downloadStore.progressList.length === 0 && downloadStore.completedTasks.length === 0" class="empty">
      暂无下载任务
    </div>
    <div v-else class="progress-list">
      <div
        v-for="p in downloadStore.progressList"
        :key="p.id"
        class="progress-card"
        :class="p.status"
      >
        <div class="card-header">
          <span class="status-badge">{{ statusText(p.status) }}</span>
          <span class="title">{{ p.title }}</span>
        </div>
        <div v-if="p.status !== 'completed'" class="progress-bar">
          <div class="progress-bar-fill" :style="{ width: p.progress + '%' }" />
        </div>
        <div v-if="p.status !== 'completed'" class="stats">
          <span>速度: {{ p.speed }}</span>
          <span>已下载: {{ p.downloaded }} / {{ p.total }}</span>
          <span>剩余: {{ p.eta }}</span>
        </div>
        <div class="stats time-stats">
          <span>添加于 {{ formatDuration(p.addTime) }} 前</span>
          <span v-if="['downloading', 'paused', 'failed'].includes(p.status) && p.startTime">已运行 {{ formatDuration(p.startTime, true) }}</span>
        </div>
        <div class="actions">
          <button
            v-if="p.status === 'downloading'"
            class="btn btn-sm"
            @click="downloadStore.pause(p.id)"
          >
            暂停
          </button>
          <button
            v-if="p.status === 'paused'"
            class="btn btn-sm"
            @click="downloadStore.resume(p.id)"
          >
            继续
          </button>
          <button
            v-if="['pending', 'downloading', 'paused'].includes(p.status)"
            class="btn btn-sm btn-danger"
            @click="downloadStore.cancel(p.id)"
          >
            取消
          </button>
          <button
            v-if="['pending', 'downloading', 'paused', 'failed'].includes(p.status)"
            class="btn btn-sm"
            @click="copyCommand(p.id)"
          >
            复制命令
          </button>
        </div>
      </div>
      <div
        v-for="c in downloadStore.completedTasks"
        :key="c.id"
        class="progress-card completed"
      >
        <div class="card-header">
          <span class="status-badge">已完成</span>
          <span class="title">{{ c.title }}</span>
        </div>
        <div class="actions">
          <button class="btn btn-sm" @click="copyCommandText(c.command)">复制命令</button>
          <button class="btn btn-sm" @click="openRename(c)">修改</button>
          <button class="btn btn-sm btn-danger" @click="downloadStore.removeCompleted(c.id)">移除</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="renameModal.show" class="modal-overlay" @click.self="renameModal.show = false">
    <div class="modal">
      <h4>修改文件名</h4>
      <input v-model="renameModal.newName" type="text" class="modal-input" />
      <div class="modal-actions">
        <button class="btn btn-sm" @click="renameModal.show = false">取消</button>
        <button class="btn btn-sm btn-primary" @click="confirmRename">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDownloadStore } from '@/stores/download-store'

const downloadStore = useDownloadStore()
const renameModal = ref<{ show: boolean; task: any; newName: string }>({ show: false, task: null, newName: '' })

const cancelableCount = computed(() =>
  downloadStore.progressList.filter((p) => ['pending', 'downloading', 'paused'].includes(p.status)).length
)

function openRename(task: { id: string; title: string; savePath: string; fileBaseName: string }) {
  renameModal.value = { show: true, task, newName: task.title }
}

async function confirmRename() {
  const { task, newName } = renameModal.value
  if (!task || !newName.trim()) return
  const result = await window.electronAPI?.renameFile?.(task.savePath, task.fileBaseName, newName.trim())
  if (result?.ok) {
    downloadStore.removeCompleted(task.id)
  } else {
    alert(result?.error || '重命名失败')
  }
  renameModal.value = { show: false, task: null, newName: '' }
}

function formatDuration(ts?: number, fromStart?: boolean): string {
  if (!ts) return '-'
  const now = Date.now()
  const sec = Math.floor((now - ts) / 1000)
  if (fromStart) {
    const s = Math.floor(sec % 60)
    const m = Math.floor(sec / 60) % 60
    const h = Math.floor(sec / 3600)
    if (h > 0) return `${h}小时${m}分${s}秒`
    if (m > 0) return `${m}分${s}秒`
    return `${s}秒`
  }
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟`
  return `${Math.floor(sec / 3600)}小时`
}

async function copyCommand(id: string) {
  const cmd = await window.electronAPI?.getDownloadCommand?.(id)
  await copyCommandText(cmd)
}

async function copyCommandText(cmd: string | null | undefined) {
  if (cmd) {
    await navigator.clipboard.writeText(cmd)
    alert('已复制到剪贴板')
  } else {
    alert('暂无命令')
  }
}

function statusText(s: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    downloading: '下载中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[s] || s
}
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.queue-view h2 {
  margin: 0;
  font-size: 1.25rem;
}
.empty {
  padding: 48px;
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px dashed var(--border);
}
.progress-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.progress-card {
  background: var(--bg-card);
  padding: 20px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.progress-card.completed { border-color: var(--accent); }
.progress-card.failed { border-color: var(--danger); }
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}
.progress-card.downloading .status-badge { background: rgba(0, 212, 170, 0.2); color: var(--accent); }
.progress-card.paused .status-badge { background: rgba(255, 193, 7, 0.2); color: var(--warning); }
.progress-card.completed .status-badge { background: rgba(0, 212, 170, 0.2); color: var(--accent); }
.progress-card.failed .status-badge { background: rgba(255, 107, 107, 0.2); color: var(--danger); }
.title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}
.stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.time-stats {
  gap: 16px;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 6px;
}
.btn-sm:hover { background: var(--bg-hover); }
.btn-danger { color: var(--danger); }
.btn-primary { background: var(--accent); color: #0a0a0f; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius);
  min-width: 320px;
}
.modal h4 { margin: 0 0 16px 0; }
.modal-input {
  width: 100%;
  padding: 10px;
  margin-bottom: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
