import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HistoryRecord } from '@/types'

const STORAGE_KEY = 'video-downloader-history'
const MAX_HISTORY = 200

export const useHistoryStore = defineStore('history', () => {
  const list = ref<HistoryRecord[]>(loadHistory())

  const recentList = computed(() => list.value.slice(0, 50))

  function loadHistory(): HistoryRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  function saveHistory() {
    try {
      const toSave = list.value.slice(0, MAX_HISTORY)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (_) {}
  }

  function addRecord(record: HistoryRecord) {
    list.value = [record, ...list.value.filter((r) => r.id !== record.id)].slice(0, MAX_HISTORY)
    saveHistory()
  }

  function removeRecord(id: string) {
    list.value = list.value.filter((r) => r.id !== id)
    saveHistory()
  }

  function updateTitle(id: string, newTitle: string) {
    const r = list.value.find((x) => x.id === id)
    if (r) {
      r.title = newTitle
      r.fileBaseName = newTitle
      saveHistory()
    }
  }

  function clearHistory() {
    list.value = []
    saveHistory()
  }

  return {
    list,
    recentList,
    addRecord,
    removeRecord,
    updateTitle,
    clearHistory,
  }
})
