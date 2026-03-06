<template>
  <div class="app">
    <DebugOutputPanel />
    <aside class="sidebar">
      <div class="logo">
        <img src="/icon.svg" alt="logo" class="logo-img" />
        <h1>视频下载器</h1>
      </div>
      <nav class="nav">
        <router-link to="/" class="nav-link">下载</router-link>
        <router-link to="/queue" class="nav-link">下载队列</router-link>
        <router-link to="/history" class="nav-link">历史记录</router-link>
        <router-link to="/settings" class="nav-link">设置</router-link>
      </nav>
    </aside>
    <main class="main">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['DownloadView']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings-store'
import { useDownloadWorkStore } from '@/stores/download-work-store'
import DebugOutputPanel from '@/components/DebugOutputPanel.vue'

const settings = useSettingsStore()
const downloadWork = useDownloadWorkStore()
let sniffUnsub: (() => void)[] = []

onMounted(() => {
  window.electronAPI?.getResourcesPath?.()
  settings.load()
  window.electronAPI?.setDebugOutputEnabled?.(settings.showParseDownloadOutput)
  window.electronAPI?.setDownloadSettings?.({ maxConcurrent: settings.downloadSettings.maxConcurrent })

  sniffUnsub = [
    window.electronAPI?.onSniffCandidate?.((c) => {
      downloadWork.addSniffCandidate(c)
    }) ?? (() => {}),
    window.electronAPI?.onSniffResult?.((r) => {
      if (r.candidates?.length) {
        const withLabel = r.candidates.map((c) => ({
          ...c,
          episodeLabel: c.episodeLabel ?? r.episodeLabel,
        }))
        downloadWork.addSniffCandidates(withLabel)
      }
    }) ?? (() => {}),
    window.electronAPI?.onSniffWindowClosed?.(() => {
      sniffUnsub.forEach((f) => f())
      sniffUnsub = []
    }) ?? (() => {}),
  ].filter(Boolean) as (() => void)[]
})

onUnmounted(() => {
  sniffUnsub.forEach((f) => f())
  sniffUnsub = []
})
</script>

<style scoped>
.app {
  display: flex;
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.sidebar {
  width: 200px;
  padding: 20px 0;
  background: var(--bg-header);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
}
.logo-img {
  width: 36px;
  height: 36px;
}
.logo h1 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-link {
  padding: 10px 20px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.nav-link:hover,
.nav-link.router-link-active {
  background: var(--bg-hover);
  color: var(--accent);
}
.main {
  flex: 1;
  padding: 24px;
  overflow: auto;
}
</style>
