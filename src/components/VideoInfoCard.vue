<template>
  <div class="video-info-card">
    <div v-if="info.isPlaylist" class="playlist-header">
      <h3>{{ info.title }}</h3>
      <span class="meta">共 {{ info.entries?.length || 0 }} 集</span>
      <label class="select-all">
        <input type="checkbox" :checked="allSelected" @change="(e) => $emit('select-all', (e.target as HTMLInputElement).checked)" />
        全选
      </label>
    </div>
    <div v-else class="single-header">
      <ThumbnailWithHeaders
        v-if="info.thumbnail"
        :src="info.thumbnail"
        :video-url="info.url"
      />
      <div class="meta-block">
        <h3>{{ info.title }}</h3>
        <div class="meta-row">
          <span v-if="info.durationStr">时长 {{ info.durationStr }}</span>
          <span v-if="info.resolution">{{ info.resolution }}</span>
          <span v-if="info.isM3u8" class="tag">m3u8</span>
        </div>
        <div v-if="info.formats?.length" class="format-select">
          <label>格式选择:</label>
          <select
            :value="selectedFormat || defaultFormat"
            @change="emit('selectFormat', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="f in info.formats" :key="f.id" :value="f.id">
              {{ f.resolution || f.note || f.id }} {{ f.filesizeStr ? `(${f.filesizeStr})` : '' }}
            </option>
          </select>
        </div>
      </div>
    </div>
    <div v-if="info.isPlaylist && info.entries" class="entries-list">
      <div
        v-for="(entry, i) in info.entries"
        :key="entry.url"
        class="entry-item"
        :class="{ selected: selectedIds.has(entry.url) }"
        @click="$emit('toggle', entry.url)"
      >
        <input type="checkbox" :checked="selectedIds.has(entry.url)" @change="$emit('toggle', entry.url)" />
        <span class="index">{{ i + 1 }}</span>
        <span class="title">{{ entry.title }}</span>
        <span class="dur">{{ entry.durationStr || '-' }}</span>
        <span v-if="entry.isM3u8" class="tag">m3u8</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VideoInfo } from '@/types'
import ThumbnailWithHeaders from './ThumbnailWithHeaders.vue'

const props = defineProps<{
  info: VideoInfo
  selectedIds: Set<string>
  selectedFormat?: string
}>()

const emit = defineEmits<{
  toggle: [url: string]
  selectAll: [checked: boolean]
  selectFormat: [formatId: string]
}>()

const defaultFormat = computed(() => {
  const formats = props.info.formats
  if (!formats?.length) return undefined
  const withRes = formats.filter((f) => f.resolution)
  if (!withRes.length) return formats[0]?.id
  const sorted = [...withRes].sort((a, b) => {
    const parse = (s?: string) => {
      const m = s?.match(/(\d+)/)
      return m ? parseInt(m[1], 10) : 0
    }
    return parse(b.resolution) - parse(a.resolution)
  })
  return sorted[0]?.id
})

const allSelected = computed(() => {
  const entries = props.info.entries
  if (!entries?.length) return false
  return entries.every((e) => props.selectedIds.has(e.url))
})
</script>

<style scoped>
.video-info-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.playlist-header,
.single-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
}
.meta-block {
  flex: 1;
}
.meta-block h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
}
.meta-row {
  display: flex;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.tag {
  background: var(--accent);
  color: #0a0a0f;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}
.select-all {
  margin-left: auto;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.entries-list {
  max-height: 320px;
  overflow-y: auto;
}
.entry-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s;
}
.entry-item:hover,
.entry-item.selected {
  background: var(--bg-hover);
}
.entry-item .index {
  width: 28px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.entry-item .title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-item .dur {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.format-select {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.format-select label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.format-select select {
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  min-width: 180px;
}
</style>
