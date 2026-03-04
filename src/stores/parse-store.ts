import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { VideoInfo } from '@/types'
import { useSettingsStore } from './settings-store'
import { isBilibiliPlaylistUrl, getDomainFromUrl } from '@/utils/url'


export const useParseStore = defineStore('parse', () => {
  const parseQueue = ref<Array<{ id: string; url: string; status: 'pending' | 'parsing' | 'done' | 'error'; result?: VideoInfo | null; error?: string }>>([])
  const currentResult = ref<VideoInfo | null>(null)
  const settingsStore = useSettingsStore()

  const api = window.electronAPI

  function toPlain<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj ?? {}))
  }

  async function parseSingle(url: string): Promise<VideoInfo | null> {
    const id = `parse_${Date.now()}_${Math.random().toString(36).slice(2)}`
    parseQueue.value.push({ id, url, status: 'parsing' })
    const siteConfig = settingsStore.getSiteConfig(url)
    const opts = {
      siteConfig: toPlain(siteConfig),
      showDebugOutput: settingsStore.showParseDownloadOutput,
    }
    try {
      const isPlaylist = /list=|playlist/i.test(url) || isBilibiliPlaylistUrl(url)
      const result = isPlaylist
        ? await api?.parsePlaylist(url, opts) ?? null
        : await api?.parseUrl(url, opts) ?? null
      const item = parseQueue.value.find((q) => q.id === id)
      if (item) {
        item.status = 'done'
        item.result = result
      }
      currentResult.value = result
      return result
    } catch (e: any) {
      const item = parseQueue.value.find((q) => q.id === id)
      if (item) {
        item.status = 'error'
        item.error = e?.message || '解析失败'
      }
      throw e
    }
  }

  async function parseUrl(urlInput: string): Promise<VideoInfo | null> {
    const urls = urlInput.split(/[\n\r]+/).map((u) => u.trim()).filter(Boolean)
    if (urls.length === 0) return null
    if (urls.length === 1) return parseSingle(urls[0])
    try {
      const siteConfigs: Record<string, any> = {}
      urls.forEach((u) => {
        const d = getDomainFromUrl(u)
        if (d) siteConfigs[d] = toPlain(settingsStore.getSiteConfig(u))
      })
      const results = await api?.parseMultipleUrls?.(urls, {
        siteConfigs,
        showDebugOutput: settingsStore.showParseDownloadOutput,
      }) ?? []
      if (results.length === 0) return null
      const entries = results.flatMap((r) => (r.isPlaylist && r.entries ? r.entries : [r]))
      const merged: VideoInfo = {
        title: '多视频解析',
        url: urls[0],
        isPlaylist: true,
        entries,
      }
      currentResult.value = merged
      return merged
    } catch (e: any) {
      throw e
    }
  }

  function clearResult() {
    currentResult.value = null
  }

  function removeFromQueue(id: string) {
    parseQueue.value = parseQueue.value.filter((q) => q.id !== id)
  }

  function clearQueue() {
    parseQueue.value = []
  }

  return {
    parseQueue,
    currentResult,
    parseUrl,
    clearResult,
    removeFromQueue,
    clearQueue,
  }
})
