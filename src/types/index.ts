export interface VideoInfo {
  id?: string
  title: string
  url: string
  thumbnail?: string
  duration?: number
  durationStr?: string
  resolution?: string
  formats?: FormatInfo[]
  isPlaylist?: boolean
  entries?: VideoInfo[]
  isM3u8?: boolean
  m3u8Url?: string
}

export interface FormatInfo {
  id: string
  ext: string
  resolution?: string
  note?: string
  format?: string
  filesize?: number
  filesizeStr?: string
}

export interface SiteConfig {
  domain?: string
  customParams?: string
  cookie?: { type: string; filePath?: string; browser?: string }
}

export interface DownloadTask {
  id: string
  url: string
  customName?: string
  savePath: string
  format?: string
  isM3u8?: boolean
  m3u8Url?: string
  videoInfo?: VideoInfo
  index?: number
  siteConfig?: SiteConfig
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
  addTime?: number
  startTime?: number
  command?: string
}

export interface HistoryRecord {
  id: string
  url: string
  title: string
  savePath: string
  completedAt: number
  fileBaseName?: string
}
