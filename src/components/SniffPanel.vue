<template>
  <div v-if="visible" class="sniff-panel">
    <div class="panel-header">
      <span class="panel-title">视频嗅探</span>
      <button class="btn-icon" @click="stopSniff">停止</button>
    </div>
    <div class="panel-body">
      <div class="naming-row">
        <div class="naming-field">
          <label>电视剧名称</label>
          <input
            v-model="seriesName"
            type="text"
            class="filter-input naming-input"
            placeholder="手动输入或 CSS 选择器如 h1.title"
          />
        </div>
        <div class="naming-field">
          <label>起始集数</label>
          <input
            v-model.number="startEpisode"
            type="number"
            min="1"
            class="filter-input episode-input"
            placeholder="默认 1"
          />
        </div>
      </div>
      <div class="filter-row">
        <input
          v-model.trim="filterInput"
          type="text"
          class="filter-input"
          placeholder="过滤 URL（正则或关键词，留空显示全部）"
        />
      </div>
      <div v-if="hiddenKeys.size > 0" class="restore-row">
        <button class="btn-link-sm" @click="restoreDeleted">
          恢复已删除 ({{ hiddenKeys.size }})
        </button>
      </div>
      <div class="candidates-list">
        <div
          v-for="item in filteredCandidates"
          :key="getItemKey(item.c, item.origIdx)"
          class="candidate-item"
          :class="{ selected: selectedKeys.has(getItemKey(item.c, item.origIdx)) }"
          @click="toggleSelect(getItemKey(item.c, item.origIdx))"
        >
          <span class="candidate-confidence">{{ item.c.confidence }}%</span>
          <span class="candidate-url" :title="item.c.url">{{ item.c.url }}</span>
          <span v-if="item.c.episodeLabel" class="candidate-ep">{{ item.c.episodeLabel }}</span>
          <button
            type="button"
            class="btn-delete"
            title="删除"
            @click.stop="hideCandidate(getItemKey(item.c, item.origIdx))"
          >
            ×
          </button>
        </div>
        <div v-if="filteredCandidates.length === 0" class="empty-hint">
          {{ displayCandidates.length ? '无匹配项' : '点击集数或自动遍历后，符合条件的链接将显示在此' }}
        </div>
      </div>
      <div class="panel-actions">
        <button
          class="btn btn-sm btn-ghost"
          :disabled="filteredCandidates.length === 0"
          @click="selectAll"
        >
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
        <button
          class="btn btn-sm btn-ghost"
          :disabled="selectedKeys.size === 0"
          title="复制选中链接到剪贴板"
          @click="copyLinks"
        >
          复制链接
        </button>
        <button class="btn btn-sm" :disabled="selectedKeys.size === 0" @click="addToDownload">
          加入下载 ({{ selectedKeys.size }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDownloadWorkStore } from '@/stores/download-work-store'

const props = defineProps<{
  visible: boolean
  candidates: Array<{ url: string; confidence: number; episodeLabel?: string }>
  pageUrl: string
}>()

const emit = defineEmits<{
  (e: 'addToDownload', payload: { urls: string[]; seriesName: string; startEpisode: number | null }): void
  (e: 'stop'): void
}>()

const { sniffRuleDefaultSeriesName, sniffRuleDefaultUrlFilter } = storeToRefs(useDownloadWorkStore())
const filterInput = ref('')
const seriesName = ref('')
const startEpisode = ref<number | ''>(1)
const selectedKeys = ref<Set<string>>(new Set())
const hiddenKeys = ref<Set<string>>(new Set())

function getItemKey(c: { url: string; episodeLabel?: string }, idx: number) {
  return c.episodeLabel ? `${c.url}::${c.episodeLabel}` : `${c.url}::${idx}`
}

const displayCandidates = computed(() =>
  props.candidates
    .map((c, i) => ({ c, origIdx: i }))
    .filter(({ c, origIdx }) => !hiddenKeys.value.has(getItemKey(c, origIdx)))
)

const filteredCandidates = computed(() => {
  const list = displayCandidates.value
  const raw = filterInput.value.trim()
  if (!raw) return list
  const isRegex = raw.startsWith('regex:')
  const pattern = isRegex ? raw.slice(6) : raw
  try {
    const re = new RegExp(pattern)
    return list.filter(({ c }) => re.test(c.url))
  } catch {
    return list.filter(({ c }) => c.url.includes(pattern))
  }
})

const allSelected = computed(() => {
  const list = filteredCandidates.value
  if (list.length === 0) return false
  return list.every((item) => selectedKeys.value.has(getItemKey(item.c, item.origIdx)))
})

/** 从 episodeLabel 如 "第78集" 或 "78" 解析出集数 */
function parseEpisodeFromLabel(label: string | undefined): number | null {
  if (!label) return null
  const m = label.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function selectAll() {
  const list = filteredCandidates.value
  if (allSelected.value) {
    selectedKeys.value = new Set()
  } else {
    selectedKeys.value = new Set(list.map((item) => getItemKey(item.c, item.origIdx)))
  }
}

function hideCandidate(key: string) {
  const set = new Set(hiddenKeys.value)
  set.add(key)
  hiddenKeys.value = set
  selectedKeys.value = new Set([...selectedKeys.value].filter((k) => k !== key))
}

function restoreDeleted() {
  hiddenKeys.value = new Set()
}

function toggleSelect(key: string) {
  const set = new Set(selectedKeys.value)
  if (set.has(key)) set.delete(key)
  else set.add(key)
  selectedKeys.value = set
}

function getSelectedUrls(): string[] {
  const order = filteredCandidates.value.filter((item) =>
    selectedKeys.value.has(getItemKey(item.c, item.origIdx))
  )
  return order.map((item) => item.c.url)
}

async function copyLinks() {
  const urls = getSelectedUrls()
  if (urls.length === 0) return
  try {
    await navigator.clipboard.writeText(urls.join('\n'))
  } catch (_) {}
}

function addToDownload() {
  const order = filteredCandidates.value.filter((item) =>
    selectedKeys.value.has(getItemKey(item.c, item.origIdx))
  )
  if (order.length === 0) return
  const urls = order.map((item) => item.c.url)
  const ep = startEpisode.value === '' ? 1 : Number(startEpisode.value)
  emit('addToDownload', {
    urls,
    seriesName: seriesName.value.trim(),
    startEpisode: !isNaN(ep) && ep >= 1 ? ep : 1,
  })
}

function stopSniff() {
  emit('stop')
}

watch(() => props.visible, (v) => {
  if (v) {
    seriesName.value = sniffRuleDefaultSeriesName.value || ''
    filterInput.value = sniffRuleDefaultUrlFilter.value || ''
  } else {
    selectedKeys.value = new Set()
    hiddenKeys.value = new Set()
  }
}, { immediate: true })

watch([sniffRuleDefaultSeriesName, sniffRuleDefaultUrlFilter], ([name, filter]) => {
  if (props.visible) {
    seriesName.value = (name as string) || ''
    filterInput.value = (filter as string) || ''
  }
})

watch(selectedKeys, () => {
  const order = filteredCandidates.value.filter((item) =>
    selectedKeys.value.has(getItemKey(item.c, item.origIdx))
  )
  if (order.length > 0) {
    const eps = order.map((item) => parseEpisodeFromLabel(item.c.episodeLabel)).filter((n): n is number => n != null)
    if (eps.length > 0) startEpisode.value = Math.min(...eps)
  }
}, { deep: true })
</script>

<style scoped>
.sniff-panel {
  margin-top: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.panel-title { font-weight: 500; }
.btn-icon {
  padding: 4px 10px;
  font-size: 0.85rem;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.btn-icon:hover { color: var(--danger); border-color: var(--danger); }
.panel-body { padding: 16px; }
.naming-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.naming-field {
  flex: 1;
  min-width: 0;
}
.naming-field label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.naming-input { width: 100%; }
.episode-input { width: 100%; min-width: 100px; }
.filter-row { margin-bottom: 8px; }
.restore-row { margin-bottom: 8px; }
.panel-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-link-sm {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-link-sm:hover { text-decoration: underline; }
.filter-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.9rem;
}
.candidates-list {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
}
.candidate-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.candidate-item:last-child { border-bottom: none; }
.candidate-item:hover { background: var(--bg-hover); }
.candidate-item.selected { background: rgba(0, 212, 170, 0.15); }
.candidate-confidence {
  flex-shrink: 0;
  width: 36px;
  color: var(--accent);
  font-weight: 500;
}
.candidate-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}
.candidate-ep {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.btn-delete {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
}
.btn-delete:hover {
  background: var(--bg-hover);
  color: var(--danger);
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}
</style>
