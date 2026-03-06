#!/usr/bin/env node
/**
 * ziziys.org 自动提取视频链接（电视剧/电影）
 * 用法：node scripts/ziziys-extract-links.js <URL> [集数]
 *
 * 示例：
 *   node scripts/ziziys-extract-links.js "https://www.ziziys.org/video/5015-1-1.html"   # 电视剧
 *   node scripts/ziziys-extract-links.js "https://www.ziziys.org/video/3222-1-1.html"   # 电影
 *   node scripts/ziziys-extract-links.js "https://www.ziziys.org/video/5015-1-1.html" 10
 *
 * 输出：JSON { title?, results: [{ episode, type, url }, ...] }
 *
 * 注意：ziziys 有 SafeLine WAF，Node 直连可能被拦截；若失败请用应用内嗅探（会打开浏览器）。
 * 在设置中添加提取规则：域名 ziziys.org，脚本 scripts/ziziys-extract-links.js
 */

const https = require('https')
const http = require('http')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const headers = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/json',
      Referer: 'https://www.ziziys.org/',
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

function fetchPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const data = JSON.stringify(body)
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': UA,
      },
      rejectUnauthorized: false,
    }
    const req = lib.request(opts, (res) => {
      let buf = ''
      res.on('data', (chunk) => { buf += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(data)
    req.end()
  })
}

/** 从播放器页面解析 source url（play.kvmplay.org/ws/xxx.svg）及 POST body */
function parsePlayerPage(data, logPrefix = '') {
  let sourceUrl = null
  let body = null

  // 1) 播放器可能直接返回 JSON
  try {
    const json = JSON.parse(data.trim())
    sourceUrl = json.url || json.source
    if (sourceUrl) {
      body = json
      if (!body.source && sourceUrl) body.source = sourceUrl
    }
    if (logPrefix && sourceUrl) console.error(`${logPrefix} 解析到 JSON url`)
  } catch {}

  // 2) HTML 中提取
  if (!sourceUrl) {
    const urlMatch = data.match(/"url"\s*:\s*"((https?:\\?\/\\?\/[^"]+\.svg))"/)
    const urlMatch2 = data.match(/url["']?\s*:\s*["']?(https?:\\?\/\\?\/[^"'\s]+\.svg)/)
    const urlMatch3 = data.match(/(https?:[\\\/]+[^"'\s]*play\.kvmplay\.org[\\\/]+ws[^"'\s]+\.svg)/)
    if (urlMatch) sourceUrl = urlMatch[1].replace(/\\\//g, '/')
    else if (urlMatch2) sourceUrl = urlMatch2[1].replace(/\\\//g, '/')
    else if (urlMatch3) sourceUrl = urlMatch3[1].replace(/\\\//g, '/')

    const bodyMatch = data.match(/const body\s*=\s*\{([^}]+)\}/s)
    if (bodyMatch) {
      body = {}
      const re = /(\w+):\s*'([^']*)'/g
      let m
      while ((m = re.exec(bodyMatch[1])) !== null) body[m[1]] = m[2]
    }
    if (!sourceUrl && body?.source) sourceUrl = body.source
    if (logPrefix && sourceUrl) console.error(`${logPrefix} 从 HTML 解析到 url`)
  }

  return { sourceUrl, body }
}

/** 从 sourceUrl 获取真实视频：/ws 需 POST，否则直接返回 */
async function getRealVideoUrl(sourceUrl, body) {
  if (!sourceUrl) return null
  if (sourceUrl.includes('/ws')) {
    try {
      const postBody = (body && Object.keys(body).length && body.expires) ? body : { source: sourceUrl }
      const data = await fetchPost(sourceUrl, postBody)
      if (data && (data.url || data.type)) {
        return { type: data.type || 'm3u8', url: data.url || sourceUrl }
      }
    } catch (e) {
      console.error('POST 失败:', e.message)
    }
    return null
  }
  return { type: 'm3u8', url: sourceUrl }
}

/** 解析 video URL: /video/{id}-{sid}-{ep}.html */
function parseVideoUrl(url) {
  const m = url.match(/\/video\/(\d+)-(\d+)-(\d+)\.html/)
  if (!m) return null
  return { id: m[1], sid: m[2], ep: parseInt(m[3], 10) }
}

/** 从页面解析标题和总集数
 * 总集数优先从 scroll-content 内的 <a href="/video/{id}-{sid}-{ep}.html"> 解析
 */
function parsePageInfo(html, id, sid) {
  let title = ''
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogMatch) title = ogMatch[1].replace(/\s*[-–—].*$/, '').trim()
  else {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) title = h1Match[1].replace(/\s+/g, ' ').trim()
  }
  let episodeCount = 0
  const epMatch = html.match(/共\s*(\d+)\s*集|(\d+)\s*集全|episodes["']?\s*:\s*(\d+)/i)
  if (epMatch) episodeCount = parseInt(epMatch[1] || epMatch[2] || epMatch[3], 10)
  if (!episodeCount) {
    const re = id && sid
      ? new RegExp(`href="[^"]*\\/video\\/${id}-${sid}-(\\d+)\\.html"`, 'g')
      : /href="[^"]*\/video\/\d+-\d+-(\d+)\.html"/g
    const listMatch = html.match(re)
    if (listMatch) {
      const nums = listMatch.map((x) => parseInt(x.match(/(\d+)\.html/)[1], 10))
      if (nums.length) episodeCount = Math.max(...nums)
    }
  }
  return { title, episodeCount }
}

async function main() {
  const argUrl = process.argv[2]
  const arg1 = parseInt(process.argv[3], 10)
  const arg2 = parseInt(process.argv[4], 10)
  const hasRangeArgs = process.argv.length >= 5
  const rangeStart = hasRangeArgs && arg1 > 0 ? arg1 : null
  const rangeEnd = hasRangeArgs && arg2 > 0 ? arg2 : null
  const fromStartOnly = hasRangeArgs && arg1 > 0 && arg2 === 0
  const toEndOnly = hasRangeArgs && arg1 === 0 && arg2 > 0
  const argEp = !hasRangeArgs && Number.isFinite(arg1) && arg1 > 0 ? arg1 : null

  if (!argUrl) {
    console.error('用法: node ziziys-extract-links.js <URL> [起始集] [结束集] 或 [集数]')
    process.exit(1)
  }

  const url = argUrl.startsWith('http') ? argUrl : `https://${argUrl}`
  const parsed = parseVideoUrl(url)
  if (!parsed) {
    console.error('无法解析 URL，需为 /video/{id}-{sid}-{ep}.html 格式')
    process.exit(1)
  }

  const { id, sid, ep } = parsed
  const isMovie = ep === 1

  console.error(`[解析] URL: ${url}`)
  console.error(`[解析] id=${id} sid=${sid} ep=${ep} isMovie=${isMovie}`)

  let pageTitle = ''
  let episodeCount = 1

  if (!isMovie || argEp || hasRangeArgs) {
    let html
    try {
      const res = await fetch(url)
      html = res.data
      console.error(`[解析] 页面获取成功 status=${res.status} len=${html.length}`)
    } catch (e) {
      console.error('获取页面失败:', e.message)
      process.exit(1)
    }
    const info = parsePageInfo(html, id, sid)
    pageTitle = info.title
    const autoCount = info.episodeCount || 1
    if (rangeStart != null && rangeEnd != null) {
      episodeCount = rangeEnd
    } else if (fromStartOnly) {
      episodeCount = autoCount
    } else if (toEndOnly) {
      episodeCount = rangeEnd
    } else if (argEp != null) {
      episodeCount = argEp
    } else {
      episodeCount = autoCount
    }
    if (episodeCount === 1 && !isMovie) {
      episodeCount = 10
      console.error('未解析到集数，默认 10 集，可手动指定: node ziziys-extract-links.js <URL> <集数>')
    }
    const epLinks = html.match(new RegExp(`href="[^"]*\\/video\\/${id}-${sid}-(\\d+)\\.html"`, 'g')) || []
    console.error(`[解析] 集数链接: ${epLinks.length} 个, 总集数: ${episodeCount}`)
    if (pageTitle) console.error(`[解析] 标题: ${pageTitle}`)
  }

  const results = []
  let startN = 1
  let endN = episodeCount
  if (rangeStart != null && rangeEnd != null) {
    startN = rangeStart
    endN = rangeEnd
  } else if (fromStartOnly) {
    startN = arg1
    endN = episodeCount
  } else if (toEndOnly) {
    startN = 1
    endN = arg2
  }

  console.error(`提取第 ${startN}–${endN} 集（共 ${endN - startN + 1} 集）...`)

  for (let n = startN; n <= endN; n++) {
    const playerUrl = `https://www.ziziys.org/vod/player/id/${id}/nid/${n}/sid/${sid}.html`
    try {
      const res = await fetch(playerUrl)
      console.error(`[第 ${n} 集] 播放器请求 status=${res.status} len=${res.data.length}`)
      if (res.data.includes('safeline') || res.data.includes('slg-')) {
        console.error('第 1 集: 站点返回 SafeLine WAF 拦截，Node 请求可能被拒绝，请用浏览器打开页面后使用嗅探')
        break
      }
      const { sourceUrl, body } = parsePlayerPage(res.data, `[第 ${n} 集]`)
      if (!sourceUrl) {
        const preview = res.data.slice(0, 500)
        const hasUrl = /"url"\s*:/i.test(res.data) || /url\s*:\s*["']/i.test(res.data)
        console.error(`[第 ${n} 集] 未找到播放链接 (含url字段: ${hasUrl})，响应前 500 字符:`)
        console.error(preview)
        continue
      }
      console.error(`[第 ${n} 集] sourceUrl=${sourceUrl}`)
      const data = await getRealVideoUrl(sourceUrl, body)
      if (data) {
        results.push({ episode: n, type: data.type, url: data.url })
        console.error(`第 ${n} 集: ${data.type} ${data.url}`)
      } else {
        console.error(`[第 ${n} 集] POST 获取真实地址失败`)
      }
    } catch (e) {
      console.error(`[第 ${n} 集] 异常: ${e.message}`)
    }
    if (n < endN) await new Promise((r) => setTimeout(r, 300))
  }

  const output = pageTitle ? { title: pageTitle, results } : results
  console.log(JSON.stringify(output, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
