<template>
  <div class="download-view">
    <section class="url-section">
      <div class="input-row">
        <input
          v-model="urlInput"
          type="text"
          class="url-input"
          placeholder="粘贴视频或播放列表链接，支持多行多个链接..."
          @keydown.enter="handleParse"
        />
        <button class="btn btn-primary" :disabled="parsing" @click="handleParse">
          {{ parsing ? '解析中...' : '解析' }}
        </button>
        <button class="btn btn-secondary" :disabled="parsing || sniffStarting || !urlInput.trim()" @click="startSniffDirect">
          嗅探
        </button>
        <button
          v-if="extractRule"
          class="btn btn-secondary"
          :disabled="parsing || extractRunning || !effectiveUrl"
          @click="showExtractDialog"
        >
          {{ extractRunning ? '提取中...' : '脚本提取' }}
        </button>
      </div>
      <div v-if="parseError" class="error-msg">
        {{ parseError }}
        <button v-if="lastParseUrl" class="btn-link" @click="startSniff">尝试嗅探</button>
      </div>
      <div v-if="scriptFallbackToast" class="toast-overlay">
        <div class="toast-msg">脚本未获取到链接，正在打开浏览器...</div>
      </div>
    </section>

    <section v-if="currentResult" class="result-section">
      <VideoInfoCard
        :info="currentResult"
        :selected-ids="selectedIds"
        :selected-format="selectedFormat"
        @toggle="toggleSelect"
        @select-all="selectAll"
        @select-format="setSelectedFormat"
      />
      <div class="naming">
        <div v-if="selectedItems.length === 1" class="naming-row">
          <label>自定义文件名 (留空使用解析标题):</label>
          <div class="naming-input-wrap">
            <input v-model="customName" type="text" class="name-input" placeholder="可选" />
            <button type="button" class="btn btn-apply" @click="applyCustomName">修改</button>
          </div>
        </div>
        <div v-else class="naming-row">
          <label>命名模板:</label>
          <div class="naming-input-wrap">
            <input v-model="nameTemplate" type="text" class="name-input" placeholder="{index}_{title}" />
            <button type="button" class="btn btn-apply" @click="applyTemplate">修改</button>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" @click="openFolderDialog">
          选择保存路径: {{ savePath || '未选择' }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="!savePath || selectedItems.length === 0"
          @click="startDownload"
        >
          开始下载 ({{ selectedItems.length }})
        </button>
      </div>
    </section>

    <ParseQueue v-if="parseStore.parseQueue.length" :queue="parseStore.parseQueue" />

    <SniffPanel
      v-if="downloadWork.sniffVisible"
      :visible="downloadWork.sniffVisible"
      :candidates="downloadWork.sniffCandidates"
      :page-url="downloadWork.lastParseUrl || ''"
      @add-to-download="onAddSniffedToDownload"
      @stop="onStopSniff"
    />

    <ExtractSettingsDialog
      :visible="extractDialogVisible"
      @confirm="onExtractConfirm"
      @cancel="extractDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useParseStore } from '@/stores/parse-store'
import { useDownloadStore } from '@/stores/download-store'
import { useDownloadWorkStore } from '@/stores/download-work-store'
import { useSettingsStore } from '@/stores/settings-store'
import VideoInfoCard from '@/components/VideoInfoCard.vue'
import ParseQueue from '@/components/ParseQueue.vue'
import SniffPanel from '@/components/SniffPanel.vue'
import ExtractSettingsDialog from '@/components/ExtractSettingsDialog.vue'

defineOptions({ name: 'DownloadView' })

const parseStore = useParseStore()
const downloadStore = useDownloadStore()
const downloadWork = useDownloadWorkStore()
const settingsStore = useSettingsStore()
const {
  urlInput,
  savePath,
  selectedIds,
  customName,
  nameTemplate,
  selectedFormat,
  lastParseUrl,
  parseError,
  appliedName,
  appliedTemplate,
} = storeToRefs(downloadWork)
const parsing = ref(false)
const sniffStarting = ref(false)
const extractRunning = ref(false)
const scriptFallbackToast = ref(false)
const extractDialogVisible = ref(false)

const effectiveUrl = computed(() => {
  const u = (urlInput.value || lastParseUrl.value || '').trim()
  return u ? (u.startsWith('http') ? u : `https://${u}`) : ''
})

const extractRule = computed(() =>
  effectiveUrl.value ? settingsStore.getExtractScriptRule(effectiveUrl.value) : null
)

const currentResult = computed(() => parseStore.currentResult)

function getDefaultFormat(info: { formats?: Array<{ id: string; resolution?: string }> } | null) {
  const formats = info?.formats?.filter((f) => f.resolution)
  if (!formats?.length) return info?.formats?.[0]?.id || ''
  const sorted = [...formats].sort((a, b) => {
    const parse = (s?: string) => (s?.match(/(\d+)/)?.[1] ? parseInt(s.match(/(\d+)/)![1], 10) : 0)
    return parse(b.resolution) - parse(a.resolution)
  })
  return sorted[0]?.id || ''
}

watch(currentResult, (info) => {
  if (info && !selectedFormat.value) selectedFormat.value = getDefaultFormat(info)
}, { immediate: true })

const selectedItems = computed(() => {
  const info = currentResult.value
  if (!info) return []
  if (info.isPlaylist && info.entries) {
    return info.entries.filter((e) => selectedIds.value.has(e.url))
  }
  return info ? [info] : []
})

function toggleSelect(url: string) {
  downloadWork.toggleSelect(url)
}

function selectAll(checked: boolean) {
  const info = currentResult.value
  if (!info?.entries) return
  downloadWork.selectAll(info.entries.map((e) => e.url), checked)
}

function setSelectedFormat(v: string) {
  selectedFormat.value = v
}

async function handleParse() {
  const input = urlInput.value.trim()
  if (!input) return
  parsing.value = true
  parseError.value = ''
  lastParseUrl.value = input.split(/[\n\r]+/)[0]?.trim() || ''
  try {
    await parseStore.parseUrl(input)
  } catch (e: any) {
    parseError.value = e?.message || '解析失败'
    startSniff()
  } finally {
    parsing.value = false
  }
}

function startSniffDirect() {
  const input = urlInput.value.trim()
  if (!input) return
  lastParseUrl.value = input.split(/[\n\r]+/)[0]?.trim() || ''
  startSniff()
}

async function startSniff() {
  if (!lastParseUrl.value) return
  if (sniffStarting.value) return
  sniffStarting.value = true
  parseError.value = ''
  try {
    const rule = settingsStore.getExtractScriptRule(effectiveUrl.value)
    if (rule?.scriptPath) {
      const res = await window.electronAPI?.runExtractScript?.(effectiveUrl.value, rule.scriptPath)
      if (res?.ok && res.results?.length) {
        downloadWork.clearSniffCandidates()
        const title = res.title || rule.defaultSeriesName || ''
        downloadWork.setSniffRuleDefaults(title, '')
        for (const r of res.results) {
          downloadWork.addSniffCandidate({
            url: r.url,
            confidence: 95,
            episodeLabel: res.results.length > 1 ? `第${r.episode}集` : undefined,
          })
        }
        downloadWork.setSniffVisible(true)
        lastParseUrl.value = effectiveUrl.value
        return
      }
      scriptFallbackToast.value = true
      await new Promise((r) => setTimeout(r, 1500))
      scriptFallbackToast.value = false
    }
    await doStartSniff()
  } finally {
    sniffStarting.value = false
  }
}

async function doStartSniff() {
  if (!lastParseUrl.value) return
  const rule = settingsStore.getSniffRule(lastParseUrl.value)
  const siteConfig = settingsStore.getSiteConfig(lastParseUrl.value)
  const sniff = rule || {
    jsSelector: 'a[href*=".m3u8"], video source',
    actionScript: undefined,
    filterRules: [{ pattern: '\\.m3u8', isRegex: true, enabled: true }],
    sniffMinWaitMs: 500,
    sniffMaxWaitMs: 8000,
  }
  const cfg = JSON.parse(JSON.stringify({
    domain: siteConfig.domain,
    sniff: {
      jsSelector: sniff.jsSelector,
      actionScript: sniff.actionScript,
      filterRules: sniff.filterRules,
      sniffMinWaitMs: sniff.sniffMinWaitMs ?? 500,
      sniffMaxWaitMs: sniff.sniffMaxWaitMs ?? 8000,
    },
  }))
  downloadWork.clearSniffCandidates()
  downloadWork.setSniffRuleDefaults(rule?.defaultSeriesName ?? '', rule?.defaultUrlFilter ?? '')
  downloadWork.setSniffVisible(true)
  await window.electronAPI?.sniffStart?.(lastParseUrl.value, cfg)
  window.electronAPI?.sniffTraverse?.(cfg.sniff.jsSelector, {
    waitForVideo: true,
    minWaitMs: cfg.sniff.sniffMinWaitMs,
    maxWaitMs: cfg.sniff.sniffMaxWaitMs,
  })
}

function showExtractDialog() {
  extractDialogVisible.value = true
}

async function onExtractConfirm(opts: { startEp?: number; endEp?: number }) {
  extractDialogVisible.value = false
  const url = effectiveUrl.value
  const rule = extractRule.value
  if (!url || !rule?.scriptPath || extractRunning.value) return
  extractRunning.value = true
  try {
    const res = await window.electronAPI?.runExtractScript?.(url, rule.scriptPath, opts)
    if (!res?.ok || !res.results?.length) {
      parseError.value = res?.error || '脚本未返回有效链接'
      return
    }
    downloadWork.clearSniffCandidates()
    const title = res.title || rule.defaultSeriesName || ''
    downloadWork.setSniffRuleDefaults(title, '')
    for (const r of res.results) {
      downloadWork.addSniffCandidate({
        url: r.url,
        confidence: 95,
        episodeLabel: `第${r.episode}集`,
      })
    }
    downloadWork.setSniffVisible(true)
    lastParseUrl.value = url
  } catch (e: any) {
    parseError.value = e?.message || '脚本执行失败'
  } finally {
    extractRunning.value = false
  }
}

async function openFolderDialog() {
  const path = await window.electronAPI?.selectFolder?.()
  if (path) savePath.value = path
}

function applyCustomName() {
  appliedName.value = customName.value.trim().replace(/[/\\?*:|"<>]/g, '_')
}

function applyTemplate() {
  appliedTemplate.value = nameTemplate.value || '{index}_{title}'
}

function generateName(info: { title: string }, index?: number) {
  const base = info.title.replace(/[/\\?*:|"<>]/g, '_')
  if (selectedItems.value.length === 1) {
    const name = appliedName.value || customName.value.trim()
    if (name) return name.replace(/[/\\?*:|"<>]/g, '_')
  }
  if (selectedItems.value.length > 1) {
    const tpl = appliedTemplate.value || nameTemplate.value || '{index}_{title}'
    return tpl
      .replace('{index}', String((index ?? 0) + 1))
      .replace('{title}', base)
      .replace('{date}', new Date().toISOString().slice(0, 10))
  }
  return base
}

async function startDownload() {
  if (!savePath.value || selectedItems.value.length === 0) return
  const tasks: any[] = []
  for (let i = 0; i < selectedItems.value.length; i++) {
    const item = selectedItems.value[i]
    const customName = generateName(item, selectedItems.value.length > 1 ? i : undefined)
    const siteConfig = settingsStore.getSiteConfig(item.url)
    const ds = settingsStore.downloadSettings
    tasks.push({
      id: `dl_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
      url: item.url,
      customName,
      savePath: savePath.value,
      format: selectedFormat.value || undefined,
      isM3u8: item.isM3u8,
      m3u8Url: item.m3u8Url,
      videoInfo: JSON.parse(JSON.stringify(item)),
      siteConfig: siteConfig.domain ? JSON.parse(JSON.stringify({
        customParams: siteConfig.customParams,
        customM3u8Params: siteConfig.customM3u8Params,
        cookie: siteConfig.cookie,
      })) : undefined,
      downloadThreads: ds.downloadThreads,
      speedLimit: ds.speedLimit,
    })
  }
  const resolved = await resolveFileConflicts(tasks)
  if (!resolved) return
  for (const t of resolved) await downloadStore.addTask(t)
  parseStore.clearResult()
  urlInput.value = ''
  downloadWork.setSelectedIds(new Set())
}

async function onAddSniffedToDownload(payload: { urls: string[]; seriesName: string; startEpisode: number | null }) {
  let { urls, seriesName, startEpisode } = payload
  if (!savePath.value || urls.length === 0) return
  const rawName = seriesName.trim()
  if (rawName) {
    const fromPage = await window.electronAPI?.sniffGetTextFromSelector?.(rawName) ?? ''
    seriesName = fromPage || rawName
  }
  const ds = settingsStore.downloadSettings
  const base = seriesName.replace(/[/\\?*:|"<>]/g, '_').trim()
  const tasks: any[] = []
  urls.forEach((url, i) => {
    let customName: string
    if (base && startEpisode != null) {
      customName = `${base}-第${startEpisode + i}集`
    } else if (base) {
      customName = `${base}_${i + 1}`
    } else {
      customName = `嗅探_${i + 1}`
    }
    const siteConfig = settingsStore.getSiteConfig(url)
    const isM3u8 = /\.m3u8|mpegurl|m3u8/i.test(url) || /\/manifest\.m3u8/i.test(url)
    tasks.push({
      id: `dl_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
      url,
      customName,
      savePath: savePath.value,
      isM3u8,
      m3u8Url: isM3u8 ? url : undefined,
      videoInfo: { title: `嗅探 ${i + 1}`, url },
      siteConfig: siteConfig.domain ? JSON.parse(JSON.stringify({ customM3u8Params: siteConfig.customM3u8Params, cookie: siteConfig.cookie })) : undefined,
      downloadThreads: ds.downloadThreads,
      speedLimit: ds.speedLimit,
    })
  })
  const resolved = await resolveFileConflicts(tasks)
  if (!resolved) return
  resolved.forEach((t) => downloadStore.addTask(t))
  onStopSniff()
}

function onStopSniff() {
  window.electronAPI?.sniffStop?.()
  downloadWork.setSniffVisible(false)
}

async function resolveFileConflicts<T extends { savePath: string; customName: string; isM3u8?: boolean }>(tasks: T[]): Promise<T[] | null> {
  const files = JSON.parse(JSON.stringify(tasks.map((t) => ({
    savePath: t.savePath,
    baseName: (t.customName || 'video').replace(/\.\w+$/, ''),
    isM3u8: t.isM3u8,
  }))))
  const existing = await window.electronAPI?.checkFilesExist?.(files) ?? []
  if (existing.length === 0) return tasks
  const choice = await window.electronAPI?.showFileExistsDialog?.(existing.map((e) => e.existingPath))
  if (choice === 'cancel') return null
  if (choice === 'overwrite') return tasks
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const conflictSet = new Set(existing.map((e) => e.baseName))
  return tasks.map((t) => {
    const base = (t.customName || 'video').replace(/\.\w+$/, '')
    if (conflictSet.has(base)) {
      return { ...t, customName: `${base}_${ts}` }
    }
    return t
  })
}

onMounted(async () => {
  const path = await window.electronAPI?.getAppPath?.()
  if (path && !savePath.value) savePath.value = path
})
</script>

<style scoped>
.download-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.url-section {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.input-row {
  display: flex;
  gap: 12px;
}
.url-input {
  flex: 1;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.95rem;
}
.url-input:focus {
  outline: none;
  border-color: var(--accent);
}
.error-msg {
  margin-top: 12px;
  color: var(--danger);
  font-size: 0.9rem;
}
.toast-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}
.toast-msg {
  padding: 16px 24px;
  background: var(--bg-card);
  border-radius: var(--radius);
  font-size: 1rem;
  color: var(--text-primary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
.btn-link {
  margin-left: 8px;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: underline;
}
.btn-link:hover { color: var(--accent-hover); }
.result-section {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.naming {
  margin-top: 16px;
}
.naming-row {
  margin-bottom: 12px;
}
.naming-row label {
  display: block;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.naming-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.naming .name-input {
  flex: 1;
  max-width: 400px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}
.btn-apply {
  padding: 8px 16px;
  background: var(--bg-secondary);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
}
.btn-apply:hover {
  background: rgba(0, 212, 170, 0.1);
}
.actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  align-items: center;
}
.btn {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-primary {
  background: var(--accent);
  color: #0a0a0f;
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  background: var(--bg-hover);
}
</style>
