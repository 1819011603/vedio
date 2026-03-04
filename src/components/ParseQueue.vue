<template>
  <div class="parse-queue">
    <h4>解析队列</h4>
    <div v-for="item in queue" :key="item.id" class="queue-item">
      <span class="status" :class="item.status">{{ statusText(item.status) }}</span>
      <span class="url">{{ item.url }}</span>
      <span v-if="item.error" class="error">{{ item.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  queue: Array<{ id: string; url: string; status: string; error?: string }>
}>()

function statusText(s: string) {
  const map: Record<string, string> = {
    pending: '等待',
    parsing: '解析中',
    done: '完成',
    error: '失败',
  }
  return map[s] || s
}
</script>

<style scoped>
.parse-queue {
  background: var(--bg-card);
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.parse-queue h4 {
  margin: 0 0 12px 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.queue-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  font-size: 0.85rem;
}
.queue-item .url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}
.queue-item .status.done { color: var(--accent); }
.queue-item .status.error { color: var(--danger); }
.queue-item .error { color: var(--danger); }
</style>
