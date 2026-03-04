/**
 * 下载页工作状态 - 切换页面时保留解析、嗅探、选择等
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDownloadWorkStore = defineStore('downloadWork', () => {
  const urlInput = ref('')
  const savePath = ref('')
  const selectedIds = ref<Set<string>>(new Set())

  function toggleSelect(url: string) {
    const set = new Set(selectedIds.value)
    if (set.has(url)) set.delete(url)
    else set.add(url)
    selectedIds.value = set
  }

  function selectAll(urls: string[], checked: boolean) {
    selectedIds.value = checked ? new Set(urls) : new Set()
  }
  const customName = ref('')
  const nameTemplate = ref('{index}_{title}')
  const selectedFormat = ref('')
  const appliedName = ref('')
  const appliedTemplate = ref('')
  const lastParseUrl = ref('')
  const parseError = ref('')
  const sniffVisible = ref(false)
  const sniffCandidates = ref<Array<{ url: string; confidence: number; episodeLabel?: string }>>([])
  const sniffRuleDefaultSeriesName = ref('')
  const sniffRuleDefaultUrlFilter = ref('')

  function addSniffCandidate(c: { url: string; confidence: number; episodeLabel?: string }) {
    const list = sniffCandidates.value
    const key = c.episodeLabel ? `${c.url}::${c.episodeLabel}` : c.url
    const idx = list.findIndex((x) => (x.episodeLabel ? `${x.url}::${x.episodeLabel}` : x.url) === key)
    if (idx >= 0) {
      if (c.confidence > list[idx].confidence) {
        const next = [...list]
        next[idx] = { ...list[idx], ...c }
        sniffCandidates.value = next
      }
    } else {
      sniffCandidates.value = [...list, c]
    }
  }

  function addSniffCandidates(candidates: Array<{ url: string; confidence: number; episodeLabel?: string }>) {
    const map = new Map<string, { url: string; confidence: number; episodeLabel?: string }>()
    for (const c of sniffCandidates.value) {
      const k = c.episodeLabel ? `${c.url}::${c.episodeLabel}` : c.url
      map.set(k, c)
    }
    for (const c of candidates) {
      const k = c.episodeLabel ? `${c.url}::${c.episodeLabel}` : c.url
      const cur = map.get(k)
      if (!cur || c.confidence > cur.confidence) map.set(k, c)
    }
    sniffCandidates.value = Array.from(map.values())
  }

  function clearSniffCandidates() {
    sniffCandidates.value = []
  }

  function setSelectedIds(ids: Set<string>) {
    selectedIds.value = new Set(ids)
  }

  function setSniffVisible(v: boolean) {
    sniffVisible.value = v
  }

  function setSniffRuleDefaults(seriesName: string, urlFilter: string) {
    sniffRuleDefaultSeriesName.value = seriesName
    sniffRuleDefaultUrlFilter.value = urlFilter
  }

  return {
    toggleSelect,
    selectAll,
    urlInput,
    savePath,
    selectedIds,
    customName,
    nameTemplate,
    selectedFormat,
    appliedName,
    appliedTemplate,
    lastParseUrl,
    parseError,
    sniffVisible,
    sniffCandidates,
    sniffRuleDefaultSeriesName,
    sniffRuleDefaultUrlFilter,
    addSniffCandidate,
    addSniffCandidates,
    clearSniffCandidates,
    setSelectedIds,
    setSniffVisible,
    setSniffRuleDefaults,
  }
})
