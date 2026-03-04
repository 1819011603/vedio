/**
 * Response Sniffer - 核心过滤逻辑
 *
 * 基于 Content-Type 优先、二进制特征码、filterRules 的智能视频流识别
 */

import type { SniffFilterRule, SniffedCandidate } from './types'

/** HLS M3U8 的 Content-Type */
const HLS_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
]

/** MP4/视频 的 Content-Type */
const VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/x-mp4',
  'video/quicktime',
  'video/webm',
]

/** M3U8 文件魔数 */
const M3U8_MAGIC = '#EXTM3U'

/** 响应元数据（来自 Electron session.webRequest 或 CDP） */
export interface ResponseMeta {
  url: string
  statusCode?: number
  headers?: Record<string, string>
  /** 响应体前 N 字节（可选，用于二进制检测） */
  bodyPreview?: Buffer
  /** 响应时间戳 */
  responseTime?: number
}

/**
 * 检查 Content-Type 是否为 HLS 流
 */
export function isHlsByContentType(headers?: Record<string, string>): boolean {
  if (!headers) return false
  const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
  return HLS_CONTENT_TYPES.some((h) => ct.includes(h)) || ct.includes('mpegurl')
}

/**
 * 检查 Content-Type 是否为视频流（MP4/WebM 等）
 */
export function isVideoByContentType(headers?: Record<string, string>): boolean {
  if (!headers) return false
  const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
  return VIDEO_CONTENT_TYPES.some((h) => ct.includes(h)) || ct.startsWith('video/')
}

/**
 * 检查响应体前 16 字节是否包含 #EXTM3U
 */
export function isHlsByBinaryHeader(bodyPreview?: Buffer): boolean {
  if (!bodyPreview || bodyPreview.length < 7) return false
  const str = bodyPreview.slice(0, 16).toString('utf8', 0, 16)
  return str.includes(M3U8_MAGIC)
}

/**
 * 单条 filterRule 是否匹配 URL
 */
function matchFilterRule(url: string, rule: SniffFilterRule): boolean {
  if (rule.enabled === false) return false
  if (rule.isRegex) {
    try {
      const re = new RegExp(rule.pattern)
      return re.test(url)
    } catch {
      return false
    }
  }
  return url.includes(rule.pattern)
}

/**
 * 检查 URL 是否匹配任意启用的 filterRules
 */
export function matchFilterRules(url: string, rules: SniffFilterRule[]): { matched: boolean; matchedRule?: string } {
  if (!rules?.length) return { matched: true }
  for (const r of rules) {
    if (r.enabled === false) continue
    if (matchFilterRule(url, r)) return { matched: true, matchedRule: r.pattern }
  }
  return { matched: false }
}

/**
 * 检查 URL 是否像视频资源（.m3u8 / .mp4 / .m4s / .ts 等）
 */
function isVideoLikeUrl(url: string): boolean {
  return /\.(m3u8|mp4|m4s|ts|webm)(\?|$)/i.test(url) || /\/manifest\.m3u8/i.test(url)
}

/**
 * 计算置信度分数 (0-100)
 *
 * 规则：
 * - Content-Type HLS: +50
 * - Content-Type 视频: +45
 * - filterRules 匹配: +30
 * - 二进制 #EXTM3U: +40（当 Content-Type 缺失时）
 * - URL 含 .m3u8: +15
 * - URL 含 .mp4/.m4s/.ts: +15
 * - application/octet-stream 且 URL 像视频: +25
 */
export function computeConfidence(
  meta: ResponseMeta,
  filterRules: SniffFilterRule[]
): { confidence: number; reason: string } {
  let score = 0
  const reasons: string[] = []

  const ct = (meta.headers?.['content-type'] || meta.headers?.['Content-Type'] || '').toLowerCase()

  const ctHls = isHlsByContentType(meta.headers)
  if (ctHls) {
    score += 50
    reasons.push('Content-Type:HLS')
  }

  const ctVideo = isVideoByContentType(meta.headers)
  if (ctVideo) {
    score += 45
    reasons.push('Content-Type:video')
  }

  const filterMatch = matchFilterRules(meta.url, filterRules)
  if (filterMatch.matched) {
    score += 30
    reasons.push(`filter:${filterMatch.matchedRule || 'ok'}`)
  }

  const binaryMatch = meta.bodyPreview && isHlsByBinaryHeader(meta.bodyPreview)
  if (binaryMatch) {
    score += 40
    reasons.push('binary:#EXTM3U')
  }

  if (/\.m3u8(\?|$)/i.test(meta.url)) {
    score += 15
    reasons.push('url:.m3u8')
  }

  if (/\.(mp4|m4s|ts|webm)(\?|$)/i.test(meta.url)) {
    score += 15
    reasons.push('url:video-ext')
  }

  if ((ct.includes('octet-stream') || ct.includes('application/octet-stream')) && isVideoLikeUrl(meta.url)) {
    score += 25
    reasons.push('octet+video-url')
  }

  const reason = reasons.join(',') || 'unknown'
  return { confidence: Math.min(100, score), reason }
}

/**
 * 判断是否为有效视频流响应
 */
export function isValidVideoStream(
  meta: ResponseMeta,
  filterRules: SniffFilterRule[],
  options?: { requireFilterMatch?: boolean }
): SniffedCandidate | null {
  const { confidence, reason } = computeConfidence(meta, filterRules)

  if (options?.requireFilterMatch && filterRules.length > 0) {
    const { matched } = matchFilterRules(meta.url, filterRules)
    if (!matched) return null
  }

  const hasHls = isHlsByContentType(meta.headers) || (meta.bodyPreview && isHlsByBinaryHeader(meta.bodyPreview))
  const hasVideo = isVideoByContentType(meta.headers)
  const urlLooksVideo = isVideoLikeUrl(meta.url)
  const filterMatched = matchFilterRules(meta.url, filterRules).matched

  const strongSignal = hasHls || hasVideo || (urlLooksVideo && filterMatched)
  if (!strongSignal && confidence < 25) return null

  if (confidence < 15) return null

  return {
    url: meta.url,
    confidence,
    matchReason: reason,
    responseTime: meta.responseTime ?? Date.now(),
    contentType: meta.headers?.['content-type'] || meta.headers?.['Content-Type'],
  }
}

/**
 * 置信度排序 + 时间窗口去噪
 *
 * 在多个候选中选择最佳：
 * 1. 优先置信度高的
 * 2. 同置信度下优先响应时间在 [clickTime+500ms, clickTime+3000ms] 内的
 * 3. 取时间窗口内首个
 */
export function selectBestCandidate(
  candidates: SniffedCandidate[],
  clickTime: number,
  timeWindow: [number, number] = [500, 3000]
): SniffedCandidate | null {
  if (candidates.length === 0) return null

  const [minMs, maxMs] = timeWindow
  const now = Date.now()

  const withDelta = candidates.map((c) => {
    const delta = c.responseTime - clickTime
    const inWindow = delta >= minMs && delta <= maxMs
    return { c, delta, inWindow }
  })

  const inWindow = withDelta.filter((x) => x.inWindow)
  const sorted = (inWindow.length > 0 ? inWindow : withDelta)
    .sort((a, b) => {
      if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1
      if (b.c.confidence !== a.c.confidence) return b.c.confidence - a.c.confidence
      return a.delta - b.delta
    })

  return sorted[0]?.c ?? null
}
