import type { DownloadTask, DownloadProgress, VideoInfo } from '@/types'

export interface ElectronAPI {
  setDebugOutputEnabled: (enabled: boolean) => Promise<void>
  onParseDownloadOutput: (cb: (data: { type: string; line: string; stream?: string }) => void) => (() => void) | undefined
  parseUrl: (url: string, opts?: { siteConfig?: any; showDebugOutput?: boolean }) => Promise<VideoInfo | null>
  parsePlaylist: (url: string, opts?: { siteConfig?: any; showDebugOutput?: boolean }) => Promise<VideoInfo | null>
  parseMultipleUrls: (urls: string[], opts?: { siteConfigs?: Record<string, any>; showDebugOutput?: boolean }) => Promise<VideoInfo[]>
  fetchImageWithHeaders: (url: string, referer?: string, origin?: string) => Promise<string | null>
  renameFile: (dirPath: string, oldName: string, newName: string) => Promise<{ ok: boolean; error?: string }>
  checkFilesExist: (files: Array<{ savePath: string; baseName: string; isM3u8?: boolean }>) => Promise<Array<{ savePath: string; baseName: string; existingPath: string }>>
  showFileExistsDialog: (existingPaths: string[]) => Promise<'cancel' | 'overwrite' | 'rename'>
  setDownloadSettings: (opts: { maxConcurrent?: number }) => Promise<void>
  download: (task: DownloadTask) => Promise<{ ok: boolean; error?: string }>
  pauseDownload: (id: string) => Promise<boolean>
  resumeDownload: (id: string) => Promise<boolean>
  cancelDownload: (id: string) => Promise<boolean>
  getDownloadProgress: () => Promise<DownloadProgress[]>
  getDownloadCommand: (id: string) => Promise<string | null>
  onDownloadProgress: (cb: (progress: DownloadProgress[]) => void) => void
  sniffStart: (pageUrl: string, siteConfig: any) => Promise<{ ok: boolean }>
  sniffClick: (selector: string, episodeLabel?: string) => Promise<{ ok: boolean; result?: any }>
  sniffTraverse: (selector: string, options?: { waitForVideo?: boolean; minWaitMs?: number; maxWaitMs?: number }) => Promise<{ ok: boolean; results?: any[] }>
  sniffGetTextFromSelector: (selector: string) => Promise<string>
  sniffStop: () => Promise<{ ok: boolean }>
  onSniffCandidate: (cb: (c: any) => void) => () => void
  onSniffResult: (cb: (r: any) => void) => () => void
  onSniffWindowClosed: (cb: () => void) => () => void
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<string | null>
  selectScriptFile: () => Promise<string | null>
  runExtractScript: (url: string, scriptPath: string) => Promise<{ ok: boolean; error?: string; title?: string; results?: Array<{ episode: number; type: string; url: string }> }>
  getAppPath: () => Promise<string>
  getResourcesPath: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
