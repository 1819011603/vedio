import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setDebugOutputEnabled: (enabled: boolean) => ipcRenderer.invoke('set-debug-output-enabled', enabled),
  onParseDownloadOutput: (cb: (data: { type: string; line: string }) => void) => {
    const fn = (_: any, data: { type: string; line: string }) => cb(data)
    ipcRenderer.on('parse-download-output', fn)
    return () => ipcRenderer.removeListener('parse-download-output', fn)
  },
  parseUrl: (url: string, opts?: any) => ipcRenderer.invoke('parse-url', url, opts),
  parsePlaylist: (url: string, opts?: any) => ipcRenderer.invoke('parse-playlist', url, opts),
  parseMultipleUrls: (urls: string[], opts?: any) => ipcRenderer.invoke('parse-multiple-urls', urls, opts),
  fetchImageWithHeaders: (url: string, referer?: string, origin?: string) =>
    ipcRenderer.invoke('fetch-image-with-headers', url, referer, origin),
  renameFile: (dirPath: string, oldName: string, newName: string) =>
    ipcRenderer.invoke('rename-file', dirPath, oldName, newName),
  checkFilesExist: (files: Array<{ savePath: string; baseName: string; isM3u8?: boolean }>) =>
    ipcRenderer.invoke('check-files-exist', files),
  showFileExistsDialog: (existingPaths: string[]) => ipcRenderer.invoke('show-file-exists-dialog', existingPaths),
  setDownloadSettings: (opts: { maxConcurrent?: number }) => ipcRenderer.invoke('set-download-settings', opts),
  download: (task: DownloadTask) => ipcRenderer.invoke('download', task),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  getDownloadProgress: () => ipcRenderer.invoke('get-download-progress'),
  getDownloadCommand: (id: string) => ipcRenderer.invoke('get-download-command', id),
  sniffStart: (pageUrl: string, siteConfig: any) => ipcRenderer.invoke('sniff-start', pageUrl, siteConfig),
  sniffClick: (selector: string, episodeLabel?: string) => ipcRenderer.invoke('sniff-click', selector, episodeLabel),
  sniffTraverse: (selector: string, options?: { waitForVideo?: boolean; minWaitMs?: number; maxWaitMs?: number }) =>
    ipcRenderer.invoke('sniff-traverse', selector, options),
  sniffGetTextFromSelector: (selector: string) => ipcRenderer.invoke('sniff-get-text-from-selector', selector),
  sniffStop: () => ipcRenderer.invoke('sniff-stop'),
  onSniffCandidate: (cb: (c: any) => void) => {
    const fn = (_: any, c: any) => cb(c)
    ipcRenderer.on('sniff-candidate', fn)
    return () => ipcRenderer.removeListener('sniff-candidate', fn)
  },
  onSniffResult: (cb: (r: any) => void) => {
    const fn = (_: any, r: any) => cb(r)
    ipcRenderer.on('sniff-result', fn)
    return () => ipcRenderer.removeListener('sniff-result', fn)
  },
  onSniffWindowClosed: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('sniff-window-closed', fn)
    return () => ipcRenderer.removeListener('sniff-window-closed', fn)
  },
  onDownloadProgress: (cb: (progress: DownloadProgress) => void) => {
    ipcRenderer.on('download-progress', (_, p) => cb(p))
  },
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectScriptFile: () => ipcRenderer.invoke('select-script-file'),
  runExtractScript: (url: string, scriptPath: string) => ipcRenderer.invoke('run-extract-script', url, scriptPath),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getResourcesPath: () => ipcRenderer.invoke('get-resources-path'),
})

export interface DownloadTask {
  id: string
  url: string
  customName?: string
  savePath: string
  format?: string
  isM3u8?: boolean
  videoInfo?: VideoInfo
}

export interface VideoInfo {
  title: string
  thumbnail?: string
  duration?: number
  resolution?: string
  formats?: FormatInfo[]
}

export interface FormatInfo {
  id: string
  ext: string
  resolution?: string
  note?: string
}

export interface DownloadProgress {
  id: string
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress: number
  speed: string
  eta: string
  downloaded: string
  total: string
  error?: string
}
