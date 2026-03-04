<template>
  <div class="history-view">
    <div class="header-row">
      <h2>历史记录</h2>
      <button class="btn btn-sm" @click="historyStore.clearHistory">清空</button>
    </div>
    <div v-if="historyStore.list.length === 0" class="empty">
      暂无历史记录
    </div>
    <div v-else class="history-list">
      <div
        v-for="r in historyStore.recentList"
        :key="r.id"
        class="history-item"
      >
        <div class="info">
          <span class="title">{{ r.title }}</span>
          <span class="path">{{ r.savePath }}</span>
          <span class="time">{{ formatTime(r.completedAt) }}</span>
        </div>
        <div class="actions">
          <button class="btn btn-sm" @click="openRename(r)">修改</button>
          <button class="btn btn-sm btn-danger" @click="historyStore.removeRecord(r.id)">删除</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useHistoryStore } from '@/stores/history-store'
import { format } from 'date-fns'
import type { HistoryRecord } from '@/types'

const historyStore = useHistoryStore()
const renameModal = ref<{ show: boolean; record: HistoryRecord | null; newName: string }>({
  show: false,
  record: null,
  newName: '',
})

function formatTime(ts: number) {
  return format(new Date(ts), 'yyyy-MM-dd HH:mm')
}

function openRename(r: HistoryRecord) {
  renameModal.value = { show: true, record: r, newName: r.title }
}

async function confirmRename() {
  const { record, newName } = renameModal.value
  if (!record || !newName.trim()) return
  const baseName = (record.fileBaseName || record.title).replace(/[/\\?*:|"<>]/g, '_')
  const result = await window.electronAPI?.renameFile?.(record.savePath, baseName, newName.trim())
  if (result?.ok) {
    historyStore.updateTitle(record.id, newName.trim())
  } else {
    alert(result?.error || '重命名失败')
  }
  renameModal.value = { show: false, record: null, newName: '' }
}
</script>

<style scoped>
.history-view h2 { margin: 0; font-size: 1.25rem; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.empty {
  padding: 48px;
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px dashed var(--border);
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.history-item .info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-item .title {
  font-weight: 500;
}
.history-item .path,
.history-item .time {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.history-item .actions {
  display: flex;
  gap: 8px;
}
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
.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 6px;
}
.btn-sm:hover { background: var(--bg-hover); }
.btn-danger { color: var(--danger); }
</style>
