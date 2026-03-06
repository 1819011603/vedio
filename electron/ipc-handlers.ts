import { ipcMain, dialog, BrowserWindow } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { DownloadService } from './services/download-service'
import { ParseService } from './services/parse-service'
import { SniffSession } from './services/sniff'
import type { SniffResult } from './services/sniff/types'
import { runZiziysBrowserExtract } from './services/ziziys-browser-extract'
import { runNcat22BrowserExtract } from './services/ncat22-browser-extract'

const downloadService = new DownloadService()
const parseService = new ParseService()
let sniffSession: SniffSession | null = null
let debugOutputEnabled = false

function getResourcesPath() {
  return app.isPackaged ? join(process.resourcesPath) : join(process.cwd(), 'resources')
}

function sendOutput(webContents: Electron.WebContents, type: string, line: string, stream?: string) {
  if (webContents && !webContents.isDestroyed()) {
    webContents.send('parse-download-output', { type, line, stream })
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('set-debug-output-enabled', (_, enabled: boolean) => {
    debugOutputEnabled = enabled
  })

  ipcMain.handle('parse-url', async (event, url: string, options?: { siteConfig?: any; showDebugOutput?: boolean }) => {
    try {
      const siteConfig = options?.siteConfig && typeof options.siteConfig === 'object'
        ? JSON.parse(JSON.stringify(options.siteConfig))
        : null
      const onOutput = (options?.showDebugOutput && debugOutputEnabled)
        ? (line: string, stream: 'stdout' | 'stderr') => sendOutput(event.sender, 'parse', line, stream)
        : undefined
      return parseService.parseUrl(url, siteConfig, onOutput)
    } catch (e: any) {
      throw new Error(e?.message || '解析失败')
    }
  })

  ipcMain.handle('parse-playlist', async (event, url: string, options?: { siteConfig?: any; showDebugOutput?: boolean }) => {
    try {
      const siteConfig = options?.siteConfig && typeof options.siteConfig === 'object'
        ? JSON.parse(JSON.stringify(options.siteConfig))
        : null
      const onOutput = (options?.showDebugOutput && debugOutputEnabled)
        ? (line: string, stream: 'stdout' | 'stderr') => sendOutput(event.sender, 'parse', line, stream)
        : undefined
      return parseService.parsePlaylist(url, siteConfig, onOutput)
    } catch (e: any) {
      throw new Error(e?.message || '解析播放列表失败')
    }
  })

  ipcMain.handle('parse-multiple-urls', async (event, urls: string[], options?: { siteConfigs?: Record<string, any>; showDebugOutput?: boolean }) => {
    try {
      const siteConfigs = options?.siteConfigs && typeof options.siteConfigs === 'object'
        ? JSON.parse(JSON.stringify(options.siteConfigs))
        : null
      const onOutput = (options?.showDebugOutput && debugOutputEnabled)
        ? (line: string, stream: 'stdout' | 'stderr') => sendOutput(event.sender, 'parse', line, stream)
        : undefined
      return parseService.parseMultipleUrls(urls, siteConfigs, onOutput)
    } catch (e: any) {
      throw new Error(e?.message || '解析失败')
    }
  })

  ipcMain.handle('check-files-exist', (_, files: Array<{ savePath: string; baseName: string; isM3u8?: boolean }>) => {
    const path = require('path')
    const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.m4a', '.ts', '.flv', '.mov']
    const existing: Array<{ savePath: string; baseName: string; existingPath: string }> = []
    for (const f of files) {
      const base = (f.baseName || 'video').replace(/[/\\?*:|"<>]/g, '_').replace(/\.\w+$/, '')
      const exts = f.isM3u8 ? ['.mp4', '.ts'] : VIDEO_EXTS
      for (const ext of exts) {
        const full = path.join(f.savePath, base + ext)
        if (existsSync(full)) {
          existing.push({ savePath: f.savePath, baseName: base, existingPath: full })
          break
        }
      }
    }
    return existing
  })

  ipcMain.handle('show-file-exists-dialog', async (_, existingPaths: string[]) => {
    const names = existingPaths.map((p) => {
      const path = require('path')
      return path.basename(p)
    }).join('\n')
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: '文件已存在',
      message: '以下文件已存在，请选择操作：',
      detail: names,
      buttons: ['取消', '覆盖', '自动重命名(加时间戳)'],
      defaultId: 0,
      cancelId: 0,
    })
    return ['cancel', 'overwrite', 'rename'][result.response] as 'cancel' | 'overwrite' | 'rename'
  })

  ipcMain.handle('set-download-settings', (_, opts: { maxConcurrent?: number }) => {
    if (typeof opts?.maxConcurrent === 'number' && opts.maxConcurrent >= 1) {
      downloadService.setMaxConcurrent(opts.maxConcurrent)
    }
  })

  ipcMain.handle('download', async (_, task: any) => {
    return downloadService.addTask(task)
  })

  ipcMain.handle('pause-download', async (_, id: string) => {
    return downloadService.pauseTask(id)
  })

  ipcMain.handle('resume-download', async (_, id: string) => {
    return downloadService.resumeTask(id)
  })

  ipcMain.handle('cancel-download', async (_, id: string) => {
    return downloadService.cancelTask(id)
  })

  ipcMain.handle('get-download-progress', async () => {
    return downloadService.getProgress()
  })

  ipcMain.handle('get-download-command', async (_, id: string) => {
    return downloadService.getDownloadCommand(id)
  })

  downloadService.onProgress((progress) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.webContents) {
      win.webContents.send('download-progress', progress)
    }
  })

  downloadService.on('output', (data: { type: string; line: string; stream?: string }) => {
    if (!debugOutputEnabled) return
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.webContents) {
      sendOutput(win.webContents, data.type, data.line, data.stream)
    }
  })

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Cookie', extensions: ['txt'] }, { name: 'All', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-script-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JavaScript', extensions: ['js'] }, { name: 'All', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('get-app-path', () => app.getPath('downloads'))
  ipcMain.handle('fetch-image-with-headers', async (_, urlStr: string, referer?: string, origin?: string) => {
    try {
      const https = require('https')
      const http = require('http')
      const protocol = urlStr.startsWith('https') ? https : http
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
      if (referer) headers['Referer'] = referer
      if (origin) headers['Origin'] = origin
      const chunks: Buffer[] = []
      await new Promise<void>((resolve, reject) => {
        protocol.get(urlStr, { headers }, (res: any) => {
          res.on('data', (d: Buffer) => chunks.push(d))
          res.on('end', () => resolve())
          res.on('error', reject)
        }).on('error', reject)
      })
      const buf = Buffer.concat(chunks)
      const ct = 'image/jpeg'
      return `data:${ct};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
  ipcMain.handle('rename-file', async (_, dirPath: string, oldBaseName: string, newBaseName: string) => {
    try {
      const fs = require('fs')
      const path = require('path')
      const dir = path.resolve(dirPath)
      const files = fs.readdirSync(dir)
      const baseOld = oldBaseName.replace(/\.\w+$/, '').replace(/[/\\?*:|"<>]/g, '_')
      const newBase = newBaseName.replace(/\.\w+$/, '').replace(/[/\\?*:|"<>]/g, '_')
      const found = files.find((f: string) => {
        const nameWithoutExt = path.basename(f, path.extname(f))
        return nameWithoutExt === baseOld || f === oldBaseName
      })
      if (!found) return { ok: false, error: '未找到文件' }
      const ext = path.extname(found)
      const newPath = path.join(dir, newBase + ext)
      const oldPath = path.join(dir, found)
      fs.renameSync(oldPath, newPath)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || '重命名失败' }
    }
  })
  ipcMain.handle('get-resources-path', () => {
    const p = getResourcesPath()
    downloadService.setResourcesPath(p)
    return p
  })

  function getMainWindow(): Electron.BrowserWindow | null {
    return BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed() && !w.getTitle().includes('视频嗅探')
    ) ?? null
  }

  ipcMain.handle('sniff-start', async (event, pageUrl: string, siteConfig: any) => {
    const raw = String(pageUrl || '').trim()
    if (!raw) throw new Error('请先输入要嗅探的链接')
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const target = event.sender
    const sendCandidate = (c: { url: string; confidence: number; matchReason?: string }) => {
      if (target && !target.isDestroyed()) {
        try {
          target.send('sniff-candidate', c)
        } catch (_) {}
      }
    }
    const isDirectVideoUrl = /\.(m3u8|mp4|m4s|webm)(\?|$)/i.test(url) || /\/manifest\.m3u8/i.test(url)
    if (isDirectVideoUrl) {
      sendCandidate({ url, confidence: 95, matchReason: 'direct-url' })
    }
    if (sniffSession?.hasWindow()) {
      const cfg = {
        domain: siteConfig?.domain || '',
        jsSelector: siteConfig?.sniff?.jsSelector || 'a[href*=".m3u8"], video source',
        actionScript: siteConfig?.sniff?.actionScript,
        filterRules: siteConfig?.sniff?.filterRules || [
          { pattern: '\\.m3u8', isRegex: true, enabled: true },
          { pattern: '\\.mp4', isRegex: true, enabled: true },
          { pattern: 'mpegurl', isRegex: false, enabled: true },
          { pattern: '.m4s', isRegex: false, enabled: true },
          { pattern: 'manifest', isRegex: false, enabled: true },
        ],
      }
      await sniffSession.loadUrl(url, cfg)
      return { ok: true }
    }
    sniffSession?.stop()
    sniffSession = new SniffSession()
    const cfg = {
      domain: siteConfig?.domain || '',
      jsSelector: siteConfig?.sniff?.jsSelector || 'a[href*=".m3u8"], video source',
      actionScript: siteConfig?.sniff?.actionScript,
      filterRules: siteConfig?.sniff?.filterRules || [
        { pattern: '\\.m3u8', isRegex: true, enabled: true },
        { pattern: '\\.mp4', isRegex: true, enabled: true },
        { pattern: 'mpegurl', isRegex: false, enabled: true },
        { pattern: '.m4s', isRegex: false, enabled: true },
        { pattern: 'manifest', isRegex: false, enabled: true },
      ],
    }
    await sniffSession.start(url, cfg, {
      onCandidate: sendCandidate,
      onWindowClosed: () => {
        sniffSession = null
        if (target && !target.isDestroyed()) {
          try { target.send('sniff-window-closed') } catch (_) {}
        }
      },
    })
    return { ok: true }
  })

  ipcMain.handle('sniff-click', async (event, selector: string, episodeLabel?: string) => {
    if (!sniffSession) return { ok: false, error: '未启动嗅探' }
    const r = await sniffSession.clickAndSniff(selector, episodeLabel)
    const target = event.sender
    if (target && !target.isDestroyed()) {
      try { target.send('sniff-result', r) } catch (_) {}
    }
    return { ok: true, result: r }
  })

  ipcMain.handle('sniff-traverse', async (event, selector: string, options?: { waitForVideo?: boolean; minWaitMs?: number; maxWaitMs?: number }) => {
    if (!sniffSession) return { ok: false, error: '未启动嗅探' }
    const target = event.sender
    const results = await sniffSession.traverseAndSniff(selector, (r: SniffResult) => {
      if (target && !target.isDestroyed()) {
        try { target.send('sniff-result', r) } catch (_) {}
      }
    }, options)
    try {
      sniffSession?.stop()
    } finally {
      sniffSession = null
    }
    return { ok: true, results }
  })

  ipcMain.handle('sniff-get-text-from-selector', async (_, selector: string) => {
    if (!sniffSession) return ''
    return sniffSession.getTextFromSelector(selector)
  })

  ipcMain.handle('sniff-stop', () => {
    try {
      sniffSession?.stop()
    } finally {
      sniffSession = null
    }
    return { ok: true }
  })

  ipcMain.handle('run-extract-script', async (event, url: string, scriptPath: string, opts?: { startEp?: number; endEp?: number }) => {
    const u = String(url || '').trim()
    const target = event.sender
    const sendProgress = (msg: string) => {
      if (target && !target.isDestroyed()) {
        try { target.send('parse-download-output', { type: 'extract', line: msg }) } catch (_) {}
      }
    }
    if (/ziziys\.org/i.test(u) && /ziziys-extract-links\.js/i.test(scriptPath || '')) {
      try {
        const res = await runZiziysBrowserExtract(u, sendProgress, opts)
        return res.ok
          ? { ok: true, results: res.results, title: res.title }
          : { ok: false, error: res.error, results: [] }
      } catch (e: any) {
        const errMsg = e?.message || '提取失败'
        console.error('[ziziys] 提取异常:', errMsg, e)
        return { ok: false, error: errMsg, results: [] }
      }
    }
    if (/ncat2[23]\.com/i.test(u) && /ncat22-extract-links\.js/i.test(scriptPath || '')) {
      try {
        const res = await runNcat22BrowserExtract(u, sendProgress, opts)
        return res.ok
          ? { ok: true, results: res.results, title: res.title }
          : { ok: false, error: res.error, results: [] }
      } catch (e: any) {
        const errMsg = e?.message || '提取失败'
        console.error('[ncat22] 提取异常:', errMsg, e)
        return { ok: false, error: errMsg, results: [] }
      }
    }
    try {
      const appPath = app.isPackaged ? process.resourcesPath : process.cwd()
      const resolved = scriptPath.startsWith('/') || /^[A-Za-z]:\\/.test(scriptPath)
        ? scriptPath
        : join(appPath, scriptPath)
      const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node'
      const args: string[] = [resolved, url]
      const startEp = opts?.startEp
      const endEp = opts?.endEp
      if (startEp != null || endEp != null) {
        args.push(String(startEp != null && startEp >= 1 ? startEp : 0))
        args.push(String(endEp != null && endEp >= 1 ? endEp : 0))
      }
      const proc = spawn(nodeCmd, args, {
        cwd: appPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      await new Promise<void>((resolve, reject) => {
        proc.on('close', () => resolve())
        proc.on('error', reject)
      })
      let results: any[] = []
      let title = ''
      try {
        const parsed = JSON.parse(stdout.trim())
        if (Array.isArray(parsed)) {
          results = parsed
        } else if (parsed && Array.isArray(parsed.results)) {
          results = parsed.results
          title = parsed.title || ''
        }
      } catch {
        const lines = stdout.trim().split('\n')
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i])
            if (Array.isArray(parsed)) {
              results = parsed
              break
            }
            if (parsed?.results) {
              results = parsed.results
              title = parsed.title || ''
              break
            }
          } catch {}
        }
      }
      if (Array.isArray(results) && results.length > 0) {
        return { ok: true, results, title: title || undefined }
      }
      const errMsg = stderr.trim() || '脚本未返回有效链接'
      console.error('[extract] 脚本执行失败:', errMsg, 'stdout:', stdout?.slice(-500))
      return { ok: false, error: errMsg, results: [] }
    } catch (e: any) {
      const errMsg = e?.message || '脚本执行失败'
      console.error('[extract] 异常:', errMsg, e)
      return { ok: false, error: errMsg, results: [] }
    }
  })
}
