import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DownloadTask, DownloadProgress } from '@/types'
import { useHistoryStore } from './history-store'

declare const window: {
  electronAPI?: {
    download: (t: DownloadTask) => Promise<{ ok: boolean }>
    pauseDownload: (id: string) => Promise<boolean>
    resumeDownload: (id: string) => Promise<boolean>
    cancelDownload: (id: string) => Promise<boolean>
    getDownloadProgress: () => Promise<DownloadProgress[]>
    onDownloadProgress: (cb: (p: DownloadProgress[]) => void) => void
  }
}

export const useDownloadStore = defineStore('download', () => {
  const queue = ref<DownloadTask[]>([])
  const progressMap = ref<Record<string, DownloadProgress>>({})
  const taskMap = ref<Record<string, DownloadTask>>({})
  const completedTasks = ref<Array<{ id: string; title: string; savePath: string; fileBaseName: string; command?: string }>>([])

  const api = window.electronAPI
  if (api) {
    api.onDownloadProgress((list) => {
      progressMap.value = Object.fromEntries(list.map((p) => [p.id, p]))
    })
  }

  const historyStore = useHistoryStore()
  watch(progressMap, (map) => {
    Object.entries(map).forEach(([id, p]) => {
      if (p.status === 'completed') {
        const task = taskMap.value[id]
        if (task) {
          const fileBaseName = (task.customName || task.videoInfo?.title || '视频').replace(/[/\\?*:|"<>]/g, '_')
          historyStore.addRecord({
            id: task.id,
            url: task.url,
            title: task.customName || task.videoInfo?.title || '视频',
            savePath: task.savePath,
            completedAt: Date.now(),
            fileBaseName,
          })
          completedTasks.value.push({
            id: task.id,
            title: task.customName || task.videoInfo?.title || '视频',
            savePath: task.savePath,
            fileBaseName,
            command: (p as any).command,
          })
          delete taskMap.value[id]
        }
      }
    })
  }, { deep: true })

  const progressList = computed(() => Object.values(progressMap.value))
  const downloadingCount = computed(() =>
    progressList.value.filter((p) => p.status === 'downloading' || p.status === 'pending').length
  )

  async function addTask(task: DownloadTask) {
    queue.value.push(task)
    taskMap.value[task.id] = task
    return api?.download(task) ?? { ok: false }
  }

  async function pause(id: string) {
    return api?.pauseDownload(id) ?? false
  }

  async function resume(id: string) {
    return api?.resumeDownload(id) ?? false
  }

  async function cancel(id: string) {
    queue.value = queue.value.filter((t) => t.id !== id)
    return api?.cancelDownload(id) ?? false
  }

  async function cancelAll() {
    const ids = progressList.value
      .filter((p) => ['pending', 'downloading', 'paused'].includes(p.status))
      .map((p) => p.id)
    for (const id of ids) {
      queue.value = queue.value.filter((t) => t.id !== id)
      await api?.cancelDownload?.(id)
    }
  }

  async function refreshProgress() {
    const list = await api?.getDownloadProgress()
    if (list) progressMap.value = Object.fromEntries(list.map((p) => [p.id, p]))
  }

  const progressWithTask = computed(() =>
    progressList.value
      .filter((p) => p.status !== 'completed')
      .map((p) => ({
        ...p,
        title: taskMap.value[p.id]?.customName || taskMap.value[p.id]?.videoInfo?.title || p.id.slice(0, 24),
      }))
  )

  function removeCompleted(id: string) {
    completedTasks.value = completedTasks.value.filter((t) => t.id !== id)
  }

  return {
    queue,
    progressMap,
    progressList: progressWithTask,
    completedTasks,
    downloadingCount,
    addTask,
    pause,
    resume,
    cancel,
    cancelAll,
    refreshProgress,
    removeCompleted,
  }
})
