import { spawn } from 'child_process'
import { getYtDlpPath } from './path-utils'

export interface SiteConfig {
  domain?: string
  customParams?: string
  cookie?: { type: string; filePath?: string; browser?: string }
}

export interface ParsedVideo {
  id?: string
  title: string
  url: string
  thumbnail?: string
  duration?: number
  durationStr?: string
  resolution?: string
  formats?: Array<{ id: string; ext: string; resolution?: string; note?: string; filesize?: number; filesizeStr?: string }>
  isPlaylist?: boolean
  entries?: ParsedVideo[]
  isM3u8?: boolean
  m3u8Url?: string
}

function getDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '').split('.').slice(-2).join('.')
  } catch {
    return ''
  }
}

function isBilibiliPlaylist(url: string): boolean {
  return /bilibili\.com\/(medialist|list|cheese|space)\//i.test(url) || /bilibili\.com\/.*\/(favlist|series)/i.test(url)
}

function isBilibili(url: string): boolean {
  return /bilibili\.com/i.test(url)
}

const BILIBILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function getDefaultHeadersForUrl(url: string): string[] {
  const args: string[] = []
  if (isBilibili(url)) {
    args.push('--add-header', 'Referer:https://www.bilibili.com/')
    args.push('--add-header', `User-Agent:${BILIBILI_UA}`)
    args.push('--add-header', 'Origin:https://www.bilibili.com')
  }
  return args
}

function getBilibiliDefaultCookie(siteConfig?: SiteConfig | null): string[] {
  if (siteConfig?.cookie?.type === 'file' && siteConfig.cookie.filePath) return []
  if (siteConfig?.cookie?.type === 'browser' && siteConfig.cookie.browser) return []
  const browser = process.platform === 'darwin' ? 'safari' : 'chrome'
  return ['--cookies-from-browser', browser]
}

function buildExtraArgs(siteConfig?: SiteConfig | null, url?: string): string[] {
  const args: string[] = []
  if (siteConfig) {
  if (siteConfig.cookie?.type === 'file' && siteConfig.cookie.filePath) {
    args.push('--cookies', siteConfig.cookie.filePath)
  }
  if (siteConfig.cookie?.type === 'browser' && siteConfig.cookie.browser) {
    args.push('--cookies-from-browser', siteConfig.cookie.browser)
  }
  if (siteConfig.customParams?.trim()) {
    const parts = siteConfig.customParams.trim().split(/\s+/)
    for (const p of parts) {
      if (p.startsWith('--')) {
        const eq = p.indexOf('=')
        if (eq > 0) {
          args.push(p.slice(0, eq), p.slice(eq + 1))
        } else {
          args.push(p)
        }
      } else if (args.length && args[args.length - 1].startsWith('--') && !args[args.length - 1].includes('=')) {
        args.push(p)
      }
    }
  }
  }
  const defaultHeaders = url ? getDefaultHeadersForUrl(url) : []
  const bilibiliCookie = (url && isBilibili(url)) ? getBilibiliDefaultCookie(siteConfig) : []
  return [...defaultHeaders, ...bilibiliCookie, ...args]
}

function toPlainObject<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export type ParseOutputCallback = (line: string, stream: 'stdout' | 'stderr') => void

export class ParseService {
  async parseUrl(url: string, siteConfig?: SiteConfig | null, onOutput?: ParseOutputCallback): Promise<ParsedVideo | null> {
    if (isBilibiliPlaylist(url)) {
      return this.parsePlaylist(url, siteConfig, onOutput)
    }
    const ytDlpPath = await getYtDlpPath()
    const extra = buildExtraArgs(siteConfig, url)
    return new Promise((resolve, reject) => {
      const args = ['-j', '--no-download', '--no-warnings', '--yes-playlist', ...extra, url]
      const proc = spawn(ytDlpPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      const emit = (d: Buffer, stream: 'stdout' | 'stderr') => {
        const s = d.toString()
        if (stream === 'stdout') stdout += s
        else stderr += s
        if (onOutput) s.split('\n').filter(Boolean).forEach((line) => onOutput(line, stream))
      }
      proc.stdout.on('data', (d) => emit(d, 'stdout'))
      proc.stderr.on('data', (d) => emit(d, 'stderr'))
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || '解析失败'))
          return
        }
        try {
          const lines = stdout.trim().split('\n').filter(Boolean)
          let result: ParsedVideo
          if (lines.length > 1) {
            const entries: ParsedVideo[] = []
            for (const line of lines) {
              try {
                const obj = JSON.parse(line)
                entries.push(this.parseYtDlpJson(obj, url))
              } catch (_) {}
            }
            result = { title: '视频选集', url, isPlaylist: true, entries }
          } else {
            const obj = JSON.parse(lines[0] || '{}')
            result = this.parseYtDlpJson(obj, url)
          }
          resolve(toPlainObject(result))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    })
  }

  private parseYtDlpJson(obj: any, url: string): ParsedVideo {
    const title = obj.title || '未知标题'
    const dur = obj.duration || 0
    const formats = (obj.formats || [])
      .filter((f: any) => !f.vcodec || f.vcodec !== 'none')
      .map((f: any) => ({
        id: f.format_id || f.id,
        ext: f.ext || 'mp4',
        resolution: f.resolution || (f.height ? `${f.width || '?'}x${f.height}` : undefined),
        note: f.format_note,
        filesize: f.filesize,
        filesizeStr: f.filesize ? this.formatSize(f.filesize) : undefined,
      }))
      .filter((f: any) => f.resolution || f.note)
      .slice(0, 30)
    const videoUrl = String(obj.url || obj.webpage_url || url)
    const m3u8Format = (obj.formats || []).find((f: any) => /\.m3u8|m3u8|hls/i.test(f.url || ''))
    const m3u8Url = m3u8Format?.url || (/\.m3u8|m3u8/i.test(videoUrl) ? videoUrl : undefined)
    const formatsClean = formats.map((f: { id: string; ext: string; resolution?: string; note?: string; filesize?: number; filesizeStr?: string }) => ({
      id: String(f.id),
      ext: String(f.ext),
      resolution: f.resolution ? String(f.resolution) : undefined,
      note: f.note ? String(f.note) : undefined,
      filesize: f.filesize,
      filesizeStr: f.filesizeStr,
    }))
    return {
      id: obj.id != null ? String(obj.id) : undefined,
      title,
      url: videoUrl,
      thumbnail: obj.thumbnail ? String(obj.thumbnail) : undefined,
      duration: dur,
      durationStr: dur > 0 ? this.formatDuration(dur) : undefined,
      resolution: obj.resolution ? String(obj.resolution) : undefined,
      formats: formatsClean,
      isM3u8: !!m3u8Url,
      m3u8Url: m3u8Url ? String(m3u8Url) : undefined,
    }
  }

  async parsePlaylist(url: string, siteConfig?: SiteConfig | null, onOutput?: ParseOutputCallback): Promise<ParsedVideo | null> {
    const ytDlpPath = await getYtDlpPath()
    const extra = buildExtraArgs(siteConfig, url)
    return new Promise((resolve, reject) => {
      const args = ['-j', '--flat-playlist', '--no-download', '--no-warnings', ...extra, url]
      const proc = spawn(ytDlpPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      const emit = (d: Buffer, stream: 'stdout' | 'stderr') => {
        const s = d.toString()
        if (stream === 'stdout') stdout += s
        else stderr += s
        if (onOutput) s.split('\n').filter(Boolean).forEach((line) => onOutput(line, stream))
      }
      proc.stdout.on('data', (d) => emit(d, 'stdout'))
      proc.stderr.on('data', (d) => emit(d, 'stderr'))
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || '解析播放列表失败'))
          return
        }
        try {
          const entries: ParsedVideo[] = []
          const lines = stdout.trim().split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const obj = JSON.parse(line)
              const entryUrl = String(obj.url || obj.webpage_url || url)
              const isM3u8 = /m3u8|hls/i.test(entryUrl)
              const e: ParsedVideo = {
                id: obj.id != null ? String(obj.id) : undefined,
                title: obj.title || '未知',
                url: entryUrl,
                thumbnail: obj.thumbnail ? String(obj.thumbnail) : undefined,
                duration: obj.duration,
                durationStr: obj.duration ? this.formatDuration(obj.duration) : undefined,
                isM3u8,
                m3u8Url: isM3u8 ? entryUrl : undefined,
              }
              entries.push(e)
            } catch (_) {}
          }
          const result = { title: '播放列表', url, isPlaylist: true, entries }
          resolve(toPlainObject(result))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    })
  }

  private formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  async parseMultipleUrls(urls: string[], siteConfigs?: Record<string, SiteConfig> | null, onOutput?: ParseOutputCallback): Promise<ParsedVideo[]> {
    const results: ParsedVideo[] = []
    for (const url of urls) {
      const u = url.trim()
      if (!u) continue
      try {
        const domain = getDomain(u)
        const config = siteConfigs?.[domain] || null
        const isPlaylist = /list=|playlist/i.test(u) || isBilibiliPlaylist(u)
        const r = isPlaylist ? await this.parsePlaylist(u, config, onOutput) : await this.parseUrl(u, config, onOutput)
        if (r) results.push(r)
      } catch (_) {}
    }
    return results
  }
}
