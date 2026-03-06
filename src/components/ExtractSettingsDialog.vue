<template>
  <div v-if="visible" class="extract-dialog-overlay" @click.self="cancel">
    <div class="extract-dialog">
      <div class="dialog-header">
        <span class="dialog-title">脚本提取设置</span>
        <button type="button" class="btn-close" @click="cancel">×</button>
      </div>
      <div class="dialog-body">
        <div class="episode-range-row">
          <div class="field">
            <label>起始集</label>
            <input
              v-model.number="startEp"
              type="number"
              min="1"
              class="ep-input"
              placeholder="留空=第 1 集"
            />
          </div>
          <span class="range-sep">至</span>
          <div class="field">
            <label>结束集</label>
            <input
              v-model.number="endEp"
              type="number"
              min="1"
              class="ep-input"
              placeholder="留空=最后一集"
            />
          </div>
        </div>
        <p class="hint">留空表示全部集数；填写范围可只提取指定集（如 50–60 集）</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" @click="cancel">取消</button>
        <button type="button" class="btn btn-primary" @click="confirm">开始提取</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm', opts: { startEp?: number; endEp?: number }): void
  (e: 'cancel'): void
}>()

const startEp = ref<number | ''>('')
const endEp = ref<number | ''>('')

function confirm() {
  const s = startEp.value === '' ? undefined : (Number(startEp.value) || undefined)
  const e = endEp.value === '' ? undefined : (Number(endEp.value) || undefined)
  if (s !== undefined && (s < 1 || !Number.isInteger(s))) return
  if (e !== undefined && (e < 1 || !Number.isInteger(e))) return
  if (s !== undefined && e !== undefined && s > e) return
  emit('confirm', { startEp: s, endEp: e })
}

function cancel() {
  emit('cancel')
}
</script>

<style scoped>
.extract-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}
.extract-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.dialog-title {
  font-weight: 500;
  font-size: 1rem;
}
.btn-close {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
}
.btn-close:hover {
  color: var(--text-primary);
}
.dialog-body {
  padding: 20px;
}
.episode-range-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.field {
  flex: 1;
  min-width: 0;
}
.field label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.ep-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.95rem;
}
.ep-input:focus {
  outline: none;
  border-color: var(--accent);
}
.range-sep {
  flex-shrink: 0;
  padding-bottom: 10px;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.hint {
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
.btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.btn-primary {
  background: var(--accent);
  color: #0a0a0f;
  border: none;
}
.btn-primary:hover {
  background: var(--accent-hover);
}
</style>
