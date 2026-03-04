import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { getYtDlpPath } from './path-utils'
import { getM3u8DLPath } from './path-utils'

interface TaskInfo {
  id: string
  url: string
  customName?: string
  savePath: string
  format?: string
  isM3u8?: boolean
  m3u8Url?: string
  siteConfig?: any
  downloadThreads?: number
  speedLimit?: string
  process?: ChildProcess
  status: string
  progress: number
  speed: string
  eta: string
  downloaded: string
  total: string
  addTime?: number
  startTime?: number
  command?: string
}

export class DownloadService extends EventEmitter {
  private queue: TaskInfo[] = []
  private progressMap = new Map<string, TaskInfo>()
  private isPaused = false
  private currentTasks = new Set<TaskInfo>()
  private maxConcurrent = 1
  private resourcesPath = ''

  setMaxConcurrent(n: number) {
    this.maxConcurrent = Math.max(1, Math.floor(n))
  }

  setResourcesPath(p: string) {
    this.resourcesPath = p
  }

  onProgress(cb: (p: any) => void) {
    this.on('progress', cb)
  }

  async addTask(task: any): Promise<{ ok: boolean; error?: string }> {
    const t: TaskInfo = {
      id: task.id,
      url: task.url,
      customName: task.customName,
      savePath: task.savePath,
      format: task.format,
      isM3u8: task.isM3u8,
      m3u8Url: task.m3u8Url,
      siteConfig: task.siteConfig,
      downloadThreads: task.downloadThreads,
      speedLimit: task.speedLimit,
      status: 'pending',
      progress: 0,
      speed: '0 B/s',
      eta: '-',
      downloaded: '0 B',
      total: '-',
      addTime: Date.now(),
    }
    this.queue.push(t)
    this.progressMap.set(t.id, t)
    this.emitProgress()
    this.processQueue()
    return { ok: true }
  }

  pauseTask(id: string): boolean {
    const t = this.progressMap.get(id)
    if (!t) return false
    if (t.process) {
      t.process.kill('SIGSTOP')
      t.status = 'paused'
    } else {
      t.status = 'paused'
    }
    this.emitProgress()
    return true
  }

  resumeTask(id: string): boolean {
    const t = this.progressMap.get(id)
    if (!t || !t.process) return false
    try {
      (t.process as any).kill('SIGCONT')
      t.status = 'downloading'
      this.emitProgress()
      return true
    } catch (_) {
      return false
    }
  }

  cancelTask(id: string): boolean {
    const t = this.progressMap.get(id)
    if (!t) return false
    if (t.process) {
      t.process.kill('SIGKILL')
    }
    t.status = 'cancelled'
    this.queue = this.queue.filter((q) => q.id !== id)
    this.currentTasks.delete(t)
    this.emitProgress()
    this.processQueue()
    return true
  }

  getProgress() {
    return Array.from(this.progressMap.values()).map((t) => ({
      id: t.id,
      status: t.status,
      progress: t.progress,
      speed: t.speed,
      eta: t.eta,
      downloaded: t.downloaded,
      total: t.total,
      addTime: t.addTime,
      startTime: t.startTime,
      command: t.command,
    }))
  }

  async getDownloadCommand(id: string): Promise<string | null> {
    const t = this.progressMap.get(id)
    if (!t) return null
    if (t.command) return t.command
    return this.buildCommandForTask(t)
  }

  private async buildCommandForTask(t: TaskInfo): Promise<string> {
    const m3u8Url = t.m3u8Url || (t.isM3u8 ? t.url : '')
    const useM3u8 = !!m3u8Url && this.resourcesPath
    if (useM3u8) {
      const m3u8Path = getM3u8DLPath(this.resourcesPath)
      const saveName = (t.customName || m3u8Url.split('/').pop()?.replace(/\?.*$/, '') || 'video').replace(/\.\w+$/, '')
      const m3u8Extra = this.buildM3u8ExtraArgs(t.siteConfig)
      const args = [m3u8Url, '--save-dir', t.savePath, '--save-name', saveName]
      if (t.downloadThreads && t.downloadThreads > 0) args.push('--thread-count', String(t.downloadThreads))
      if (t.speedLimit?.trim()) args.push('--max-speed', t.speedLimit.trim())
      args.push(...m3u8Extra)
      return this.formatCommand(m3u8Path, args)
    }
    const ytDlpPath = await getYtDlpPath()
    const outputTmpl = t.customName ? join(t.savePath, t.customName) + '.%(ext)s' : join(t.savePath, '%(title)s.%(ext)s')
    const extra = this.buildExtraArgs(t.siteConfig, t.url)
    const args = ['-o', outputTmpl, '--newline', '--progress', '--no-part', ...extra]
    if (t.downloadThreads && t.downloadThreads > 0) args.push('--concurrent-fragments', String(t.downloadThreads))
    if (t.speedLimit?.trim()) args.push('--limit-rate', t.speedLimit.trim())
    if (t.format) args.push('-f', t.format)
    args.push(t.url)
    return this.formatCommand(ytDlpPath, args)
  }

  private formatCommand(exe: string, args: string[]): string {
    const quote = (s: string) => /[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
    return [quote(exe), ...args.map(quote)].join(' ')
  }

  private emitProgress() {
    this.emit('progress', this.getProgress())
  }

  private parseSize(s: string): number {
    const m = s.trim().match(/^(\d+\.?\d*)\s*([KMGT]?)(i?)(B)$/i)
    if (!m) return 0
    let n = parseFloat(m[1])
    const unit = (m[2] || 'B').toUpperCase()
    const binary = (m[3] || '').toLowerCase() === 'i'
    const k = binary ? 1024 : 1000
    if (unit === 'K') n *= k
    else if (unit === 'M') n *= k * k
    else if (unit === 'G') n *= k * k * k
    else if (unit === 'T') n *= k * k * k * k
    return Math.round(n)
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MiB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GiB'
  }

  private buildExtraArgs(siteConfig?: any, url?: string): string[] {
    const args: string[] = []
    if (url && /bilibili\.com/i.test(url)) {
      args.push('--add-header', 'Referer:https://www.bilibili.com/')
      args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      args.push('--add-header', 'Origin:https://www.bilibili.com')
      if (!siteConfig?.cookie?.type || siteConfig.cookie.type === 'none' ||
          (siteConfig.cookie.type === 'file' && !siteConfig.cookie.filePath) ||
          (siteConfig.cookie.type === 'browser' && !siteConfig.cookie.browser)) {
        const browser = process.platform === 'darwin' ? 'safari' : 'chrome'
        args.push('--cookies-from-browser', browser)
      }
    }
    if (!siteConfig) return args
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
    return args
  }

  private async processQueue() {
    while (this.currentTasks.size < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.find((q) => q.status === 'pending')
      if (!next) break
      this.currentTasks.add(next)
      next.status = 'downloading'
      next.startTime = Date.now()
      this.emitProgress()

      const m3u8Url = next.m3u8Url || (next.isM3u8 ? next.url : '')
      const useM3u8 = !!m3u8Url && this.resourcesPath
      const doDownload = async () => {
        try {
          if (useM3u8) {
            next.url = m3u8Url
            await this.downloadWithM3u8(next)
          } else {
            await this.downloadWithYtDlp(next)
          }
        } finally {
          this.currentTasks.delete(next)
          this.emitProgress()
          if (next.status === 'completed') {
            this.progressMap.delete(next.id)
            this.emitProgress()
          }
          this.processQueue()
        }
      }
      doDownload()
    }
  }

  private async downloadWithYtDlp(t: TaskInfo): Promise<void> {
    const ytDlpPath = await getYtDlpPath()
    const outputTmpl = t.customName
      ? join(t.savePath, t.customName) + '.%(ext)s'
      : join(t.savePath, '%(title)s.%(ext)s')
    const extra = this.buildExtraArgs(t.siteConfig, t.url)
    const args = [
      '-o', outputTmpl,
      '--newline',
      '--progress',
      '--no-part',
      ...extra,
    ]
    if (t.downloadThreads && t.downloadThreads > 0) {
      args.push('--concurrent-fragments', String(t.downloadThreads))
    }
    if (t.speedLimit?.trim()) {
      args.push('--limit-rate', t.speedLimit.trim())
    }
    if (t.format) args.push('-f', t.format)
    args.push(t.url)
    t.command = this.formatCommand(ytDlpPath, args)

    return new Promise((resolve) => {
      const proc = spawn(ytDlpPath, args, {
        cwd: t.savePath,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      t.process = proc

      const parseProgress = (line: string) => {
        // 格式1: [download] 78.6% of 88.07MiB at 929.62KiB/s ETA 00:20
        const ofMatch = line.match(/\[download\].*?(\d+\.?\d*)%\s+of\s+(\d+\.?\d*\s*[KMGT]?i?B)\s+at\s+(\d+\.?\d*\s*[KMGT]?i?B\/s)\s+ETA\s+(\d+:\d+:\d+|\d+:\d+)/)
        if (ofMatch) {
          t.progress = parseFloat(ofMatch[1])
          t.total = ofMatch[2]
          const totalBytes = this.parseSize(ofMatch[2])
          if (totalBytes > 0) {
            t.downloaded = this.formatSize(Math.round(totalBytes * t.progress / 100))
          } else {
            t.downloaded = `${t.progress}%`
          }
          t.speed = ofMatch[3]
          t.eta = ofMatch[4]
          this.emitProgress()
          return
        }
        // 格式2: [download] XX% of A/B at C ETA D (旧格式)
        const slashMatch = line.match(/\[download\].*?(\d+\.?\d*)%.*?(\d+\.?\d*\s*[KMGT]?i?B)\/(\d+\.?\d*\s*[KMGT]?i?B).*?(\d+\.?\d*\s*[KMGT]?i?B\/s).*?ETA\s+(\d+:\d+:\d+|\d+:\d+)/)
        if (slashMatch) {
          t.progress = parseFloat(slashMatch[1])
          t.downloaded = slashMatch[2]
          t.total = slashMatch[3]
          t.speed = slashMatch[4]
          t.eta = slashMatch[5]
          this.emitProgress()
        }
      }

      const emitOutput = (buf: Buffer, stream: 'stdout' | 'stderr') => {
        const lines = buf.toString().split('\n')
        lines.forEach(parseProgress)
        lines.filter(Boolean).forEach((line) => this.emit('output', { type: 'download', line, stream }))
      }
      proc.stdout.on('data', (d) => emitOutput(d, 'stdout'))
      proc.stderr.on('data', (d) => emitOutput(d, 'stderr'))
      proc.on('close', (code, signal) => {
        t.process = undefined
        if (signal === 'SIGSTOP') return
        if (code === 0) t.status = 'completed'
        else t.status = 'failed'
        resolve()
      })
    })
  }

  private buildM3u8ExtraArgs(siteConfig?: any): string[] {
    const args: string[] = []
    if (!siteConfig?.customM3u8Params?.trim()) return args
    const parts = siteConfig.customM3u8Params.trim().split(/\s+/)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (p.startsWith('--') || p.startsWith('-')) {
        const eq = p.indexOf('=')
        if (eq > 0) {
          args.push(p.slice(0, eq), p.slice(eq + 1))
        } else if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          args.push(p, parts[++i])
        } else {
          args.push(p)
        }
      }
    }
    return args
  }

  private async downloadWithM3u8(t: TaskInfo): Promise<void> {
    const m3u8Path = getM3u8DLPath(this.resourcesPath)
    const saveName = (t.customName || t.url.split('/').pop()?.replace(/\?.*$/, '') || 'video').replace(/\.\w+$/, '')
    const m3u8Extra = this.buildM3u8ExtraArgs(t.siteConfig)
    const args = [
      t.url,
      '--save-dir', t.savePath,
      '--save-name', saveName,
    ]
    if (t.downloadThreads && t.downloadThreads > 0) {
      args.push('--thread-count', String(t.downloadThreads))
    }
    if (t.speedLimit?.trim()) {
      args.push('--max-speed', t.speedLimit.trim())
    }
    args.push(...m3u8Extra)
    t.command = this.formatCommand(m3u8Path, args)

    return new Promise((resolve) => {
      const proc = spawn(m3u8Path, args, {
        cwd: t.savePath,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      t.process = proc

      const parseProgress = (line: string) => {
        let updated = false
        // N_m3u8DL-RE 格式: 1.59% 21.21MB/1.30GB 1.43MBps 00:25:14
        const m3u8Match = line.match(/(\d+\.?\d*)%\s+(\d+\.?\d*\s*[KMGT]?i?B)\/(\d+\.?\d*\s*[KMGT]?i?B)\s+(\d+\.?\d*\s*[KMGT]?i?[Bb](?:ps?|\/s))\s+(\d+:\d+:\d+|\d+:\d+)\s*$/i)
        if (m3u8Match) {
          t.progress = parseFloat(m3u8Match[1])
          t.downloaded = m3u8Match[2]
          t.total = m3u8Match[3]
          t.speed = m3u8Match[4]
          t.eta = m3u8Match[5]
          this.emitProgress()
          return
        }
        const pct = line.match(/(\d+\.?\d*)%/)
        if (pct) {
          t.progress = parseFloat(pct[1])
          updated = true
        }
        const speed = line.match(/(\d+\.?\d*\s*[KMGT]?i?[Bb]\/s|\d+\.?\d*\s*[KMGT]?i?[Bb]ps?)/i)
        if (speed) {
          t.speed = speed[1]
          updated = true
        }
        const eta = line.match(/(?:ETA[:\s]+)?(\d+:\d+:\d+|\d+:\d+)\s*$/)
        if (eta) {
          t.eta = eta[1]
          updated = true
        }
        const ofMatch = line.match(/(\d+\.?\d*)%\s+of\s+(\d+\.?\d*\s*[KMGT]?i?B)/i)
        if (ofMatch) {
          t.total = ofMatch[2]
          const totalBytes = this.parseSize(ofMatch[2])
          if (totalBytes > 0) {
            t.downloaded = this.formatSize(Math.round(totalBytes * t.progress / 100))
          }
          updated = true
        }
        const slashMatch = line.match(/(\d+\.?\d*\s*[KMGT]?i?B)\/(\d+\.?\d*\s*[KMGT]?i?B)/i)
        if (slashMatch) {
          t.downloaded = slashMatch[1]
          t.total = slashMatch[2]
          updated = true
        }
        if (updated) this.emitProgress()
      }

      const emitOutput = (buf: Buffer, stream: 'stdout' | 'stderr') => {
        const lines = buf.toString().split('\n')
        lines.forEach(parseProgress)
        lines.filter(Boolean).forEach((line) => this.emit('output', { type: 'download', line, stream }))
      }
      proc.stdout.on('data', (d) => emitOutput(d, 'stdout'))
      proc.stderr.on('data', (d) => emitOutput(d, 'stderr'))
      proc.on('close', (code, signal) => {
        t.process = undefined
        if (signal === 'SIGSTOP') return
        t.status = code === 0 ? 'completed' : 'failed'
        resolve()
      })
    })
  }
}

function join(...parts: string[]): string {
  const path = require('path')
  return path.join(...parts)
}
