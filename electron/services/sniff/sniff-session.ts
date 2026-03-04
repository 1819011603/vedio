/**
 * SniffSession - 基于 Electron 的嗅探会话
 *
 * 使用独立 session + webRequest 监听响应，结合 Response Sniffer 过滤
 */

import { BrowserWindow, session } from 'electron'
import type { SniffSiteConfig, SniffedCandidate, SniffResult } from './types'
import { isValidVideoStream, selectBestCandidate } from './response-sniffer'

export interface SniffSessionCallbacks {
  onCandidate?: (c: SniffedCandidate) => void
  onResult?: (r: SniffResult) => void
  onError?: (e: Error) => void
  onWindowClosed?: () => void
}

export class SniffSession {
  private win: BrowserWindow | null = null
  private sess: Electron.Session
  private clickTime = 0
  private candidates: SniffedCandidate[] = []
  private timeWindow: [number, number] = [500, 3000]
  private siteConfig: SniffSiteConfig | null = null
  constructor(partition = `sniff-${Date.now()}`) {
    this.sess = session.fromPartition(partition)
  }

  hasWindow(): boolean {
    return !!(this.win && !this.win.isDestroyed())
  }

  /**
   * 在已有窗口中加载新 URL（复用浏览器）
   */
  async loadUrl(pageUrl: string, siteConfig?: SniffSiteConfig): Promise<void> {
    if (!this.win || this.win.isDestroyed()) return
    if (siteConfig) {
      this.siteConfig = siteConfig
      this.candidates = []
    }
    try {
      await this.win.loadURL(pageUrl, { userAgent: this.getUserAgent() })
      if (siteConfig?.actionScript) {
        await this.win.webContents.executeJavaScript(siteConfig.actionScript)
      }
      this.win.show()
    } catch (e) {
      if (this.win && !this.win.isDestroyed()) this.win.show()
    }
  }

  /**
   * 启动嗅探：创建浏览器窗口并加载页面
   */
  async start(
    pageUrl: string,
    siteConfig: SniffSiteConfig,
    callbacks: SniffSessionCallbacks = {}
  ): Promise<void> {
    this.candidates = []
    this.siteConfig = siteConfig
    this.timeWindow = [500, 3000]

    const opts: Electron.BrowserWindowConstructorOptions = {
      width: 1280,
      height: 800,
      show: false,
      backgroundColor: '#1a1a1a',
      title: '视频嗅探 - 正在监听网络请求',
      webPreferences: {
        session: this.sess,
        nodeIntegration: false,
        contextIsolation: true,
      },
    }
    this.win = new BrowserWindow(opts)
    this.win.webContents.setAudioMuted(true)
    this.win.once('ready-to-show', () => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.show()
      }
    })
    this.win.webContents.on('did-finish-load', () => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.executeJavaScript('window.close = function(){}').catch(() => {})
      }
    })
    this.win.on('closed', () => {
      this.win = null
      this.siteConfig = null
      onWindowClosed?.()
    })

    const { onCandidate, onError, onWindowClosed } = callbacks
    const rules = siteConfig.filterRules

    this.sess.webRequest.onResponseStarted(
      { urls: ['*://*/*'] },
      (details) => {
        if (!this.siteConfig) return
        const headers: Record<string, string> = {}
        const rh = details.responseHeaders || {}
        for (const k of Object.keys(rh)) {
          const v = rh[k]
          headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : String(v)
        }
        const meta = {
          url: details.url,
          statusCode: details.statusCode,
          headers,
          responseTime: Date.now(),
        }
        const c = isValidVideoStream(meta, this.siteConfig.filterRules)
        if (c) {
          this.candidates.push(c)
          onCandidate?.(c)
        }
      }
    )

    try {
      await this.win.loadURL(pageUrl, { userAgent: this.getUserAgent() })
      if (siteConfig.actionScript && this.win && !this.win.isDestroyed()) {
        await this.win.webContents.executeJavaScript(siteConfig.actionScript)
      }
      await this.wait(4000)
      if (this.win && !this.win.isDestroyed()) {
        this.win.show()
      }
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)))
      if (this.win && !this.win.isDestroyed()) this.win.show()
    }
  }

  /**
   * 点击指定选择器元素，并开始监听时间窗口内的响应
   */
  async clickAndSniff(
    selector: string,
    episodeLabel?: string
  ): Promise<SniffResult> {
    if (!this.win?.webContents) {
      return { candidates: [], episodeLabel }
    }
    this.clickTime = Date.now()
    this.candidates = []

    const sel = JSON.stringify(selector)
    const ok = await this.win.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector(${sel})
        if (el && el instanceof HTMLElement) { el.click(); return true }
        return false
      })()
    `)

    if (!ok) {
      return { candidates: [], episodeLabel }
    }

    await this.wait(2500)

    const best = selectBestCandidate(this.candidates, this.clickTime, this.timeWindow)
    return {
      best: best ?? undefined,
      candidates: [...this.candidates],
      episodeLabel,
    }
  }

  /**
   * 等待视频加载：收到候选或超时
   * @param maxWaitMs 最大等待毫秒
   * @param minWaitMs 最小等待毫秒（点击后至少等这么久）
   */
  async waitForVideoLoad(maxWaitMs = 8000, minWaitMs = 500): Promise<boolean> {
    await this.wait(minWaitMs)
    const start = Date.now()
    while (Date.now() - start < maxWaitMs - minWaitMs) {
      if (this.candidates.length > 0) {
        await this.wait(300)
        return true
      }
      await this.wait(200)
    }
    return this.candidates.length > 0
  }

  /**
   * 遍历所有匹配选择器的元素，依次点击、等待视频加载、再点下一集
   */
  async traverseAndSniff(
    selector: string,
    onEach?: (r: SniffResult, index: number) => void,
    options?: { waitForVideo?: boolean; minWaitMs?: number; maxWaitMs?: number }
  ): Promise<SniffResult[]> {
    if (!this.win?.webContents) return []

    const waitForVideo = options?.waitForVideo !== false
    const minWaitMs = options?.minWaitMs ?? 500
    const maxWaitMs = options?.maxWaitMs ?? 8000

    const sel = JSON.stringify(selector)
    const items = await this.win.webContents.executeJavaScript(`
      (function() {
        const nodes = document.querySelectorAll(${sel})
        return Array.from(nodes).map((el, i) => ({
          index: i,
          text: (el.innerText || '').slice(0, 80) || ('ep' + (i + 1))
        }))
      })()
    `) as Array<{ index: number; text: string }>

    const results: SniffResult[] = []
    if (items.length === 0) {
      await this.wait(minWaitMs)
      const start = Date.now()
      while (Date.now() - start < maxWaitMs - minWaitMs && this.candidates.length === 0) {
        await this.wait(300)
      }
      if (this.candidates.length > 0) {
        const best = selectBestCandidate(this.candidates, 0, [0, 999999])
        const r: SniffResult = {
          best: best ?? undefined,
          candidates: [...this.candidates],
          episodeLabel: '当前',
        }
        results.push(r)
        onEach?.(r, 0)
      }
      return results
    }
    for (const item of items) {
      const ok = await this.win.webContents.executeJavaScript(`
        (function() {
          const nodes = document.querySelectorAll(${sel})
          const el = nodes[${item.index}]
          if (el && el instanceof HTMLElement) { el.click(); return true }
          return false
        })()
      `)
      if (ok) {
        this.clickTime = Date.now()
        this.candidates = []
        if (waitForVideo) {
          await this.waitForVideoLoad(maxWaitMs, minWaitMs)
        } else {
          await this.wait(2500)
        }
        const best = selectBestCandidate(this.candidates, this.clickTime, this.timeWindow)
        const r: SniffResult = {
          best: best ?? undefined,
          candidates: [...this.candidates],
          episodeLabel: item.text,
        }
        results.push(r)
        onEach?.(r, item.index)
      }
      await this.wait(600)
    }
    return results
  }

  /**
   * 从嗅探页面获取选择器对应的文本（用于剧名等）
   */
  async getTextFromSelector(selector: string): Promise<string> {
    if (!this.win?.webContents) return ''
    const sel = JSON.stringify(selector)
    const text = await this.win.webContents.executeJavaScript(`
      (function() {
        try {
          const el = document.querySelector(${sel})
          return el ? (el.innerText || el.textContent || '').trim().slice(0, 200) : ''
        } catch { return '' }
      })()
    `)
    return typeof text === 'string' ? text : ''
  }

  /**
   * 在 iframe 中执行选择器（若主文档无匹配）
   */
  async clickInFrame(
    frameSelector: string,
    elementSelector: string,
    episodeLabel?: string
  ): Promise<SniffResult> {
    if (!this.win?.webContents) return { candidates: [], episodeLabel }

    const fs = JSON.stringify(frameSelector)
    const es = JSON.stringify(elementSelector)
    const ok = await this.win.webContents.executeJavaScript(`
      (function() {
        const iframe = document.querySelector(${fs})
        if (!iframe || !iframe.contentDocument) return false
        const el = iframe.contentDocument.querySelector(${es})
        if (el && el instanceof HTMLElement) { el.click(); return true }
        return false
      })()
    `)

    if (!ok) return { candidates: [], episodeLabel }
    this.clickTime = Date.now()
    this.candidates = []
    await this.wait(2500)
    const best = selectBestCandidate(this.candidates, this.clickTime, this.timeWindow)
    return {
      best: best ?? undefined,
      candidates: [...this.candidates],
      episodeLabel,
    }
  }

  stop(): void {
    this.siteConfig = null
    if (this.win && !this.win.isDestroyed()) {
      this.win.setTitle('视频嗅探 - 已完成，可手动关闭')
    }
    this.win = null
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  private getUserAgent(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}
