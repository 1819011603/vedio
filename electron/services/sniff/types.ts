/**
 * 视频嗅探系统 - 类型定义
 */

/** 站点嗅探配置 */
export interface SniffSiteConfig {
  /** 站点域名，如 bilibili.com */
  domain: string
  /** 用于定位集数按钮的 CSS/JS 选择器 */
  jsSelector: string
  /** 页面加载后执行的自定义脚本（如跳过广告、修改播放器） */
  actionScript?: string
  /** URL 过滤规则，支持正则，多选匹配 */
  filterRules: SniffFilterRule[]
}

/** 单条过滤规则 */
export interface SniffFilterRule {
  /** 正则表达式或关键词 */
  pattern: string
  /** 是否启用 */
  enabled?: boolean
  /** 是否为正则（否则按关键词 contains 匹配） */
  isRegex?: boolean
}

/** 嗅探到的候选 URL */
export interface SniffedCandidate {
  url: string
  /** 置信度 0-100 */
  confidence: number
  /** 匹配原因 */
  matchReason: string
  /** 响应时间戳 */
  responseTime: number
  /** 关联的集数文本（点击时） */
  episodeLabel?: string
  /** Content-Type */
  contentType?: string
}

/** 嗅探会话选项 */
export interface SniffSessionOptions {
  /** 页面 URL */
  pageUrl: string
  /** 站点配置 */
  siteConfig: SniffSiteConfig
  /** 点击后监听时间窗口 [minMs, maxMs]，默认 [500, 3000] */
  timeWindow?: [number, number]
  /** 是否自动遍历所有集数 */
  autoTraverse?: boolean
}

/** 嗅探结果 */
export interface SniffResult {
  /** 最佳候选（置信度最高且在时间窗口内） */
  best?: SniffedCandidate
  /** 所有候选 */
  candidates: SniffedCandidate[]
  /** 关联的集数 */
  episodeLabel?: string
}
