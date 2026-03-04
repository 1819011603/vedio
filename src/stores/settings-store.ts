import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getDomainFromUrl, getOriginFromUrl } from '@/utils/url'

const KEY = 'video-downloader-settings'

export interface ImageHeaders {
  referer: string
  origin: string
}

export interface CookieConfig {
  type: 'none' | 'file' | 'browser'
  filePath?: string
  browser?: string
}

export interface SniffFilterRule {
  pattern: string
  enabled?: boolean
  isRegex?: boolean
}

/** 嗅探规则 - 按域名配置，独立于站点配置 */
export interface SniffRule {
  id: string
  domain: string
  jsSelector: string
  actionScript?: string
  sniffMinWaitMs: number
  sniffMaxWaitMs: number
  filterRules: SniffFilterRule[]
  /** 默认电视剧名称：选择器或手动，用于 SniffPanel */
  defaultSeriesName?: string
  /** 默认 URL 过滤，用于 SniffPanel 过滤输入框 */
  defaultUrlFilter?: string
}

/** 脚本提取规则 - 使用 Node.js 脚本批量获取视频链接 */
export interface ExtractScriptRule {
  id: string
  domain: string
  name: string
  /** 脚本路径，相对于项目根或绝对路径 */
  scriptPath: string
  /** 默认剧名，用于下载命名 */
  defaultSeriesName?: string
}

export interface SiteConfig {
  domain: string
  imageHeaders: ImageHeaders
  customParams: string
  customM3u8Params: string
  cookie: CookieConfig
}

const defaultSiteConfig = (domain: string): SiteConfig => ({
  domain,
  imageHeaders: { referer: '', origin: '' },
  customParams: '',
  customM3u8Params: '',
  cookie: { type: 'none', browser: 'chrome' },
})

const defaultSniffRule = (domain: string): SniffRule => ({
  id: `sniff-${domain}-${Date.now()}`,
  domain,
  jsSelector: 'a[href*=".m3u8"], video source',
  filterRules: [{ pattern: '\\.m3u8', isRegex: true, enabled: true }],
  sniffMinWaitMs: 500,
  sniffMaxWaitMs: 8000,
})

export interface DownloadSettings {
  downloadThreads: number
  speedLimit: string
  maxConcurrent: number
}

const defaultDownloadSettings = (): DownloadSettings => ({
  downloadThreads: 0,
  speedLimit: '',
  maxConcurrent: 1,
})

const defaultExtractScriptRule = (domain: string, name?: string): ExtractScriptRule => ({
  id: `extract-${domain}-${Date.now()}`,
  domain,
  name: name || domain,
  scriptPath: 'scripts/4kvm-extract-links.js',
  defaultSeriesName: '',
})

export const useSettingsStore = defineStore('settings', () => {
  const siteConfigs = ref<Record<string, SiteConfig>>({})
  const sniffRules = ref<SniffRule[]>([])
  const extractScriptRules = ref<ExtractScriptRule[]>([])
  const showParseDownloadOutput = ref(false)
  const downloadSettings = ref<DownloadSettings>(defaultDownloadSettings())

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const o = JSON.parse(raw)
        if (o.siteConfigs) {
          const migrated: SniffRule[] = []
          siteConfigs.value = Object.fromEntries(
            Object.entries(o.siteConfigs).map(([k, v]: [string, any]) => {
              const base = { ...defaultSiteConfig(k), ...v, customM3u8Params: v.customM3u8Params ?? '' }
              delete (base as any).sniff
              const s = (v as any).sniff
              if (s && k) {
                migrated.push({
                  id: `sniff-${k}-${Date.now()}`,
                  domain: k,
                  jsSelector: s.jsSelector || 'a[href*=".m3u8"], video source',
                  actionScript: s.actionScript,
                  sniffMinWaitMs: s.sniffMinWaitMs ?? 500,
                  sniffMaxWaitMs: s.sniffMaxWaitMs ?? 8000,
                  filterRules: s.filterRules?.length ? s.filterRules : [{ pattern: '\\.m3u8', isRegex: true, enabled: true }],
                })
              }
              return [k, base]
            })
          )
          if (migrated.length > 0 && (!o.sniffRules || !o.sniffRules.length)) {
            sniffRules.value = migrated
          }
        }
        if (o.sniffRules?.length) {
          sniffRules.value = o.sniffRules.map((r: any) => ({
            ...defaultSniffRule(r.domain),
            ...r,
            sniffMinWaitMs: r.sniffMinWaitMs ?? 500,
            sniffMaxWaitMs: r.sniffMaxWaitMs ?? 8000,
          }))
        }
        if (o.extractScriptRules?.length) {
          extractScriptRules.value = o.extractScriptRules.map((r: any) => ({
            ...defaultExtractScriptRule(r.domain, r.name),
            ...r,
          }))
        }
        if (typeof o.showParseDownloadOutput === 'boolean') showParseDownloadOutput.value = o.showParseDownloadOutput
        if (o.downloadSettings) {
          downloadSettings.value = { ...defaultDownloadSettings(), ...o.downloadSettings, maxConcurrent: o.downloadSettings.maxConcurrent ?? 1 }
        }
      }
    } catch (_) {}
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify({
      siteConfigs: siteConfigs.value,
      sniffRules: sniffRules.value,
      extractScriptRules: extractScriptRules.value,
      showParseDownloadOutput: showParseDownloadOutput.value,
      downloadSettings: downloadSettings.value,
    }))
  }

  function getSniffRule(url: string): SniffRule | null {
    const domain = getDomainFromUrl(url)
    if (!domain) return null
    return sniffRules.value.find((r) => domain === r.domain || domain.endsWith('.' + r.domain)) ?? null
  }

  function addSniffRule(rule: Partial<SniffRule> & { domain: string }) {
    const r: SniffRule = {
      ...defaultSniffRule(rule.domain),
      ...rule,
      id: rule.id || `sniff-${rule.domain}-${Date.now()}`,
    }
    const idx = sniffRules.value.findIndex((x) => x.domain === rule.domain)
    if (idx >= 0) sniffRules.value[idx] = r
    else sniffRules.value.push(r)
    save()
    return r
  }

  function removeSniffRule(domain: string) {
    sniffRules.value = sniffRules.value.filter((r) => r.domain !== domain)
    save()
  }

  function getExtractScriptRule(url: string): ExtractScriptRule | null {
    const domain = getDomainFromUrl(url)
    if (!domain) return null
    return extractScriptRules.value.find((r) => domain === r.domain || domain.endsWith('.' + r.domain)) ?? null
  }

  function addExtractScriptRule(rule: Partial<ExtractScriptRule> & { domain: string }) {
    const r: ExtractScriptRule = {
      ...defaultExtractScriptRule(rule.domain, rule.name),
      ...rule,
      id: rule.id || `extract-${rule.domain}-${Date.now()}`,
    }
    const idx = extractScriptRules.value.findIndex((x) => x.domain === rule.domain)
    if (idx >= 0) extractScriptRules.value[idx] = r
    else extractScriptRules.value.push(r)
    save()
    return r
  }

  function removeExtractScriptRule(domain: string) {
    extractScriptRules.value = extractScriptRules.value.filter((r) => r.domain !== domain)
    save()
  }

  function setDownloadSettings(partial: Partial<DownloadSettings>) {
    downloadSettings.value = { ...downloadSettings.value, ...partial }
    save()
  }

  function setShowParseDownloadOutput(v: boolean) {
    showParseDownloadOutput.value = v
    save()
  }

  function getSiteConfig(url: string): SiteConfig {
    const domain = getDomainFromUrl(url)
    if (!domain) return defaultSiteConfig('')
    return siteConfigs.value[domain] || defaultSiteConfig(domain)
  }

  function getOrCreateSiteConfig(domain: string): SiteConfig {
    if (!siteConfigs.value[domain]) {
      siteConfigs.value[domain] = defaultSiteConfig(domain)
    }
    return siteConfigs.value[domain]
  }

  function setSiteConfig(domain: string, config: Partial<SiteConfig>) {
    const existing = getOrCreateSiteConfig(domain)
    siteConfigs.value[domain] = { ...existing, ...config }
    save()
  }

  function getImageHeadersForUrl(url: string): ImageHeaders {
    const cfg = getSiteConfig(url)
    const origin = getOriginFromUrl(url)
    return {
      referer: cfg.imageHeaders.referer || origin,
      origin: cfg.imageHeaders.origin || origin,
    }
  }

  const siteList = computed(() =>
    Object.values(siteConfigs.value).sort((a, b) => a.domain.localeCompare(b.domain))
  )

  return {
    siteConfigs,
    siteList,
    sniffRules,
    showParseDownloadOutput,
    downloadSettings,
    load,
    save,
    setShowParseDownloadOutput,
    setDownloadSettings,
    getSiteConfig,
    getOrCreateSiteConfig,
    setSiteConfig,
    getImageHeadersForUrl,
    getSniffRule,
    addSniffRule,
    removeSniffRule,
    extractScriptRules,
    getExtractScriptRule,
    addExtractScriptRule,
    removeExtractScriptRule,
  }
})
