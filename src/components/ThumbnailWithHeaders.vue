<template>
  <div class="thumb-wrap">
    <img
      v-if="dataUrl"
      :src="dataUrl"
      alt=""
      class="thumb-img"
    />
    <div v-else-if="loading" class="thumb-placeholder">加载中...</div>
    <div v-else-if="error" class="thumb-placeholder thumb-error">加载失败</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings-store'

const props = defineProps<{
  src: string
  videoUrl?: string
}>()

const settingsStore = useSettingsStore()
const dataUrl = ref<string | null>(null)
const loading = ref(false)
const error = ref(false)

async function load() {
  if (!props.src) return
  loading.value = true
  error.value = false
  const headers = props.videoUrl ? settingsStore.getImageHeadersForUrl(props.videoUrl) : { referer: '', origin: '' }
  const url = await window.electronAPI?.fetchImageWithHeaders?.(props.src, headers.referer, headers.origin)
  dataUrl.value = url
  if (!url) error.value = true
  loading.value = false
}

watch(() => props.src, load, { immediate: true })
</script>

<style scoped>
.thumb-wrap {
  width: 120px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.thumb-error {
  color: var(--danger);
}
</style>
