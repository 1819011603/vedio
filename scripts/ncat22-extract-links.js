#!/usr/bin/env node
/**
 * ncat22/ncat23 等站点自动提取视频链接（电视剧/电影）
 * 用法：node scripts/ncat22-extract-links.js <URL> [集数]
 *
 * 域名灵活：从 URL 自动识别，支持 ncat22.com、ncat23.com 等同源站点
 *
 * 示例：
 *   node scripts/ncat22-extract-links.js "https://www.ncat22.com/play/293634-36-537460.html"   # 电影
 *   node scripts/ncat22-extract-links.js "https://ncat23.com/play/293634-36-1.html" 10       # 电视剧
 *
 * 页面结构：playSource = { src: "https://xxx/index.m3u8", type: "application/x-mpegURL" }
 * 支持 Unicode 编码混淆：如 {'\u0073\u0072\u0063': "\u0068\u0074\u0074\u0070..."} 会自动解码
 * 若默认源 404，会尝试解析页面中其他源（palySource0~N）对应的 m3u8 链接
 *
 * 注意：站点有 cdndefend 防护。在应用内使用「脚本提取」时会自动用浏览器绕过；
 * 命令行直接运行可能被拦截，此时请用应用内提取或嗅探。
 *
 * 输出：JSON { title?, results: [{ episode, type, url }, ...] }
 */

const https = require('https')
const http = require('http')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const origin = opts.refererOrigin || new URL(url).origin
    const headers = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/x-mpegURL,*/*',
      Referer: `${origin}/`,
      ...opts.headers,
    }
    const req = lib.get(url, { headers, rejectUnauthorized: false }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

/** HEAD 请求检查 URL 是否可访问（非 404），refererOrigin 为视频站 origin 用于 Referer */
function headCheck(url, refererOrigin = 'https://www.ncat22.com') {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.request(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA, Referer: `${refererOrigin}/` },
      rejectUnauthorized: false,
    }, (res) => {
      resolve(res.statusCode !== 404)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(8000, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

/** 解码 Unicode 转义序列 (\uXXXX) */
function decodeUnicode(str) {
  try {
    return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  } catch (e) {
    return str
  }
}

/** 从页面 HTML 提取所有 m3u8 链接 - 宽松匹配模式 */
function extractM3u8Urls(html) {
  const urls = new Set()

  // 调试：输出HTML基本信息
  const hasM3u8Text = html.includes('m3u8') || html.includes('m3U8') || html.includes('M3U8')
  const hasUnicode = html.includes('\\u')
  const hasPlaySource = html.includes('playSource')
  console.log(`[extract-debug] HTML长度=${html.length}, 含m3u8=${hasM3u8Text}, 含Unicode=${hasUnicode}, 含playSource=${hasPlaySource}`)

  // 如果HTML中有gogogo函数，输出片段
  const gogogoMatch = html.match(/function\s+gogogo[^{]*\{[^}]{0,800}/i)
  if (gogogoMatch) {
    console.log(`[extract-debug] gogogo函数片段: ${gogogoMatch[0].slice(0, 400)}...`)
  }

  // 方法1: 直接匹配明文 m3u8 URL
  const plainUrlRe = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi
  let m
  while ((m = plainUrlRe.exec(html)) !== null) {
    const url = m[1].replace(/\\\//g, '/').replace(/\\"/g, '').replace(/\\'/g, '')
    if (url.includes('.m3u8')) {
      console.log(`[extract-debug] 方法1找到: ${url}`)
      urls.add(url)
    }
  }

  // 方法2: 找所有引号内的长字符串，解码后检查是否是m3u8
  const quotedRe = /["']([^"']{20,})["']/g
  while ((m = quotedRe.exec(html)) !== null) {
    const raw = m[1]
    const decoded = decodeUnicode(raw)
    if (decoded.includes('.m3u8') && decoded.includes('http')) {
      const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)
      if (urlMatch) {
        console.log(`[extract-debug] 方法2找到: ${urlMatch[1]}`)
        urls.add(urlMatch[1])
      }
    }
  }

  // 方法3: 找 playSource 或 src 附近的内容，宽松匹配
  const srcBlockRe = /(?:playSource|src)\s*[=:]\s*[{]?[^;]{0,500}/gi
  while ((m = srcBlockRe.exec(html)) !== null) {
    const block = m[0]
    const decoded = decodeUnicode(block)
    const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)
    if (urlMatch) {
      console.log(`[extract-debug] 方法3找到: ${urlMatch[1]}`)
      urls.add(urlMatch[1])
    }
  }

  // 方法4: 匹配包含 \u 编码的字符串，解码后检查
  const unicodeStrRe = /["']([^"']*\\u[0-9A-Fa-f]{4}[^"']*)["']/g
  while ((m = unicodeStrRe.exec(html)) !== null) {
    const decoded = decodeUnicode(m[1])
    if (decoded.includes('.m3u8')) {
      const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)
      if (urlMatch) {
        console.log(`[extract-debug] 方法4找到: ${urlMatch[1]}`)
        urls.add(urlMatch[1])
      }
    }
  }

  console.log(`[extract-debug] 总共找到 ${urls.size} 个m3u8链接`)
  return [...urls]
}

/** 从多个候选中找出第一个可访问的 m3u8 */
async function findWorkingUrl(urls, logPrefix = '', refererOrigin = 'https://www.ncat22.com') {
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i]
    const ok = await headCheck(u, refererOrigin)
    if (ok) {
      if (logPrefix && i > 0) console.log(`${logPrefix} 源 ${i + 1}/${urls.length} 可用: ${u}`)
      return u
    }
    if (logPrefix) console.log(`${logPrefix} 源 ${i + 1} 404，尝试下一源...`)
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

/** 解析 play URL: /play/{id}-{sid}-{ep}.html */
function parsePlayUrl(url) {
  const m = url.match(/\/play\/(\d+)-(\d+)-(\d+)\.html/)
  if (!m) return null
  return { id: m[1], sid: m[2], ep: parseInt(m[3], 10) }
}

/** 从列表页解析标题和集数
 * 标题优先级：detail-title(div.detail-title a>strong) > og:title > div.data>h1 > h1
 */
function parsePageInfo(html, id, sid) {
  let title = ''
  let titleSource = ''

  // 1) div.detail-title 内 a > strong（ncat22 播放页结构）
  const detailTitleMatch = html.match(/<div[^>]*class="[^"]*detail-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>/i)
  if (detailTitleMatch) {
    title = detailTitleMatch[1].replace(/\s+/g, ' ').trim()
    titleSource = 'detail-title>a>strong'
  }

  // 2) og:title
  if (!title) {
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    if (ogMatch) {
      title = ogMatch[1].replace(/\s*[-–—].*$/, '').trim()
      titleSource = 'og:title'
    }
  }

  // 3) div.data > h1（4kvm 结构）
  if (!title) {
    const dataH1Match = html.match(/<div[^>]*class="[^"]*\bdata\b[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i)
    if (dataH1Match) {
      title = dataH1Match[1].replace(/\s+/g, ' ').trim()
      titleSource = 'div.data>h1'
    }
  }

  // 4) 任意 h1
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) {
      title = h1Match[1].replace(/\s+/g, ' ').trim()
      titleSource = 'h1'
    }
  }

  // 日志：输出解析来源
  if (title) {
    console.log(`[标题解析] 来源: ${titleSource}, 标题: ${title}`)
  } else {
    console.log('[标题解析] 未匹配到标题，检查 HTML 结构')
    // 输出 detail-title 相关片段用于调试
    const detailSnippet = html.match(/<div[^>]*class="[^"]*detail-title[^"]*"[^>]*>[\s\S]{0,500}/i)
    if (detailSnippet) {
      console.log('[标题解析] detail-title 片段:', detailSnippet[0].slice(0, 300))
    }
  }
  let episodeCount = 0
  const epRe = id && sid ? new RegExp(`href="[^"]*\\/play\\/${id}-${sid}-(\\d+)\\.html"`, 'g') : /href="[^"]*\/play\/\d+-\d+-(\d+)\.html"/g
  const listMatch = html.match(epRe)
  if (listMatch) {
    const nums = listMatch.map((x) => parseInt(x.match(/(\d+)\.html/)[1], 10))
    if (nums.length) episodeCount = Math.max(...nums)
  }
  return { title, episodeCount }
}

async function main() {
  const argUrl = process.argv[2]
  const argEp = parseInt(process.argv[3], 10)

  if (!argUrl) {
    console.log('用法: node ncat22-extract-links.js <URL> [集数]')
    process.exit(1)
  }

  const url = argUrl.startsWith('http') ? argUrl : `https://${argUrl}`
  const parsed = parsePlayUrl(url)
  if (!parsed) {
    console.log('无法解析 URL，需为 /play/{id}-{sid}-{ep}.html 格式')
    process.exit(1)
  }

  const baseOrigin = new URL(url).origin
  console.log(`[解析] 站点: ${baseOrigin}`)

  const { id, sid, ep } = parsed
  // 第三段数字很大（>1000）多为电影单集，否则按剧集处理
  const isMovie = ep === 1 || ep > 1000

  console.log(`[解析] URL: ${url}`)
  console.log(`[解析] id=${id} sid=${sid} ep=${ep} isMovie=${isMovie}`)

  let pageTitle = ''
  let episodeCount = 1

  if (!isMovie || argEp) {
    let html
    try {
      const res = await fetch(url, { refererOrigin: baseOrigin })
      html = res.data
      if (html.includes('cdndefend') || html.includes('verifying your browser')) {
        console.log('站点返回 cdndefend 防护页，Node 直连被拦截，请使用应用内嗅探（会打开浏览器）')
        process.exit(1)
      }
      console.log(`[解析] 页面获取成功 status=${res.status} len=${html.length}`)
    } catch (e) {
      console.log('获取页面失败:', e.message)
      process.exit(1)
    }
    const info = parsePageInfo(html, id, sid)
    pageTitle = info.title
    episodeCount = Number.isFinite(argEp) && argEp > 0 ? argEp : (info.episodeCount || 1)
    if (episodeCount === 1 && !isMovie) {
      episodeCount = 10
      console.log('未解析到集数，默认 10 集，可手动指定: node ncat22-extract-links.js <URL> <集数>')
    }
    if (pageTitle) console.log(`[解析] 标题: ${pageTitle}`)
  }

  const results = []
  console.log(`共 ${episodeCount} 集，开始提取...`)

  for (let n = 1; n <= episodeCount; n++) {
    const playUrl = isMovie ? url : `${baseOrigin}/play/${id}-${sid}-${n}.html`
    try {
      const res = await fetch(playUrl, { refererOrigin: baseOrigin })
      if (res.data.includes('cdndefend') || res.data.includes('verifying your browser')) {
        console.log(`第 ${n} 集: 站点返回 cdndefend 防护，请使用应用内嗅探`)
        break
      }
      const urls = extractM3u8Urls(res.data)
      if (!urls.length) {
        console.log(`第 ${n} 集: 未找到 m3u8 链接`)
        continue
      }
      console.log(`第 ${n} 集: 解析到 ${urls.length} 个候选链接`)
      const workingUrl = await findWorkingUrl(urls, `第 ${n} 集`, baseOrigin)
      if (workingUrl) {
        results.push({ episode: n, type: 'm3u8', url: workingUrl })
        console.log(`第 ${n} 集: m3u8 ${workingUrl}`)
      } else {
        console.log(`第 ${n} 集: 所有源均返回 404，无法获取`)
      }
    } catch (e) {
      console.log(`第 ${n} 集: ${e.message}`)
    }
    if (n < episodeCount) await new Promise((r) => setTimeout(r, 300))
  }

  const output = pageTitle ? { title: pageTitle, results } : results
  console.log(JSON.stringify(output, null, 2))
}

main().catch((e) => {
  console.log(e)
  process.exit(1)
})
