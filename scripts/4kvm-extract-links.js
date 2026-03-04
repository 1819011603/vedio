#!/usr/bin/env node
/**
 * 4kvm.org 自动提取视频链接（电视剧/电影）
 * 用法：node scripts/4kvm-extract-links.js <URL> [集数]
 *
 * 示例：
 *   node scripts/4kvm-extract-links.js "https://www.4kvm.org/seasons/saodfb"   # 电视剧
 *   node scripts/4kvm-extract-links.js "https://www.4kvm.org/movies/zhiyjyxhp"  # 电影
 *   node scripts/4kvm-extract-links.js "https://www.4kvm.org/artplayer?id=20481&source=0&ep=0" 10
 *
 * 输出：JSON 数组 [{ episode, type, url }, ...]
 */

const https = require('https')
const http = require('http')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', ...opts.headers }
    const req = lib.get(url, {
      headers,
      rejectUnauthorized: false,
    }, (res) => {
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

/** 从 artplayer 页面 HTML 中解析 getRealMp4 的 body */
function parseBodyFromHtml(html) {
  const bodyMatch = html.match(/const body\s*=\s*\{([^}]+)\}/s)
  if (!bodyMatch) return null
  const bodyStr = bodyMatch[1]
  const obj = {}
  const re = /(\w+):\s*'([^']*)'/g
  let m
  while ((m = re.exec(bodyStr)) !== null) {
    obj[m[1]] = m[2]
  }
  return Object.keys(obj).length ? obj : null
}

/** 从 body 获取真实视频 URL：若 source 含 /ws 则 POST 请求 */
async function getRealUrlFromBody(body) {
  const source = body?.source
  if (!source) return null
  if (source.includes('/ws')) {
    try {
      const data = await fetchPost(source, body)
      if (data && (data.url || data.type)) {
        return { type: data.type || 'm3u8', url: data.url || source }
      }
    } catch (e) {
      console.error('POST 失败:', e.message)
    }
    return null
  }
  return { type: 'm3u8', url: source }
}

/** 从页面 HTML 解析标题（og:title 或 h1） */
function parsePageTitle(html) {
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogMatch) {
    return ogMatch[1].replace(/\s*[-–—]\s*全集免费在线播放.*$/, '').replace(/\s*[-–—]\s*4k影视.*$/, '').trim()
  }
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) return h1Match[1].replace(/\s+/g, ' ').trim()
  return ''
}

/** 从系列页/电影页解析 artplayer URL 和集数
 * artplayer: iframe src、ifsrc、或电影页用 postid 构造
 * 集数: 1) videourls 2) jujiepisodios 3) 电影=1
 */
function parseSeriesPage(html, isMovie) {
  let iframeSrc = null
  const srcMatch = html.match(/src=["']([^"']*artplayer[^"']*)["']/i)
  const ifsrcMatch = html.match(/ifsrc:\s*["']([^"']*artplayer[^"']*)["']/i)
  if (srcMatch) iframeSrc = srcMatch[1].replace(/&amp;/g, '&')
  else if (ifsrcMatch) iframeSrc = ifsrcMatch[1].replace(/&amp;/g, '&')
  else if (isMovie) {
    const postId = html.match(/data-postid=['"](\d+)['"]/i)?.[1] || html.match(/postid-(\d+)/i)?.[1]
    if (postId) iframeSrc = `https://www.4kvm.org/artplayer?mvsource=0&id=${postId}&type=hls`
  }

  let episodeCount = 0
  // 1) videourls:[[{"name":1,"url":0},{"name":2,"url":1},...]] - 取第一季长度
  const videourlsMatch = html.match(/videourls\s*:\s*\[\s*\[([^\]]+)\]/)
  if (videourlsMatch) {
    const items = videourlsMatch[1].match(/\{"name":\s*(\d+)/g) || []
    const nums = items.map((x) => parseInt(x.match(/(\d+)/)[1], 10))
    if (nums.length) episodeCount = Math.max(...nums)
  }
  // 2) div.jujiepisodios 内 <a> 文本，取最大数字
  if (episodeCount === 0) {
    const jujieRe = /class="[^"]*jujiepisodios[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    let m
    while ((m = jujieRe.exec(html)) !== null) {
      const nums = (m[1].match(/<a[^>]*>([^<]*)<\/a>/g) || [])
        .map((a) => parseInt((a.match(/>([^<]*)</) || [])[1], 10))
        .filter((n) => Number.isFinite(n) && n > 0)
      const max = nums.length ? Math.max(...nums) : 0
      if (max > episodeCount) episodeCount = max
    }
  }
  return { iframeSrc, episodeCount }
}

/** 自动探测集数：从 ep=0 开始请求，直到连续 2 次解析失败 */
async function detectEpisodeCount(id, source, referer) {
  const base = `https://www.4kvm.org/artplayer?id=${id}&source=${source}&ep=`
  const opts = referer ? { headers: { Referer: referer } } : {}
  let failCount = 0
  await new Promise((r) => setTimeout(r, 500))
  for (let ep = 0; ep < 200; ep++) {
    try {
      const res = await fetch(base + ep, opts)
      const body = parseBodyFromHtml(res.data)
      if (body) {
        failCount = 0
      } else {
        failCount++
        if (failCount >= 2) return Math.max(0, ep - 1)
      }
    } catch (e) {
      failCount++
      if (failCount >= 2) return Math.max(0, ep)
    }
    if (ep < 199) await new Promise((r) => setTimeout(r, 300))
  }
  return 0
}

/** 从 artplayer URL 解析 id、source（电视剧）或 mvsource（电影） */
function parseArtplayerUrl(url) {
  try {
    const u = new URL(url)
    const id = u.searchParams.get('id')
    const source = u.searchParams.get('source') || u.searchParams.get('mvsource') || '0'
    const type = u.searchParams.get('type')
    const isMovie = type === 'hls' || u.searchParams.has('mvsource')
    return { id, source, isMovie }
  } catch {
    return null
  }
}

async function main() {
  const argUrl = process.argv[2]
  const argEpCount = parseInt(process.argv[3], 10)

  if (!argUrl) {
    console.error('用法: node 4kvm-extract-links.js <URL> [集数]')
    process.exit(1)
  }

  let id, source, episodeCount, movieArtUrl, pageTitle = ''
  const url = argUrl.startsWith('http') ? argUrl : `https://${argUrl}`

  if (url.includes('artplayer')) {
    const parsed = parseArtplayerUrl(url)
    if (!parsed) {
      console.error('无法解析 artplayer URL')
      process.exit(1)
    }
    id = parsed.id
    source = parsed.source
    if (parsed.isMovie) {
      episodeCount = 1
      movieArtUrl = url.replace(/&amp;/g, '&')
    } else {
      episodeCount = Number.isFinite(argEpCount) && argEpCount > 0 ? argEpCount : 10
    }
  } else {
    const isMovie = /\/movies\/[^/?#]+/.test(url)
    let html
    try {
      const res = await fetch(url)
      html = res.data
    } catch (e) {
      console.error('获取页面失败:', e.message)
      process.exit(1)
    }
    const { iframeSrc, episodeCount: epCount } = parseSeriesPage(html, isMovie)
    if (!iframeSrc) {
      console.error('未找到 artplayer 链接 (iframe src 或 ifsrc)，请确认是 4kvm 页面')
      process.exit(1)
    }
    const parsed = parseArtplayerUrl(iframeSrc)
    if (!parsed) {
      console.error('无法解析 artplayer URL')
      process.exit(1)
    }
    id = parsed.id
    source = parsed.source
    if (isMovie) {
      episodeCount = 1
      movieArtUrl = iframeSrc
    } else {
      episodeCount = epCount
    }
    if (!isMovie && episodeCount === 0) {
      episodeCount = await detectEpisodeCount(id, source, url)
      if (episodeCount === 0) {
        console.error('无法自动探测集数，请手动指定: node 4kvm-extract-links.js <artplayer URL> <集数>')
        process.exit(1)
      }
      console.error(`自动探测到 ${episodeCount} 集`)
    }
    pageTitle = parsePageTitle(html)
    if (pageTitle) console.error(`标题: ${pageTitle}`)
  }

  const base = movieArtUrl || `https://www.4kvm.org/artplayer?id=${id}&source=${source}&ep=`
  const results = []

  console.error(`共 ${episodeCount} 集，开始提取...`)

  for (let ep = 0; ep < episodeCount; ep++) {
    const artUrl = movieArtUrl ? base : base + ep
    try {
      const res = await fetch(artUrl)
      const body = parseBodyFromHtml(res.data)
      if (!body) {
        console.error(`第 ${ep + 1} 集: 解析失败`)
        continue
      }
      const data = await getRealUrlFromBody(body)
      if (data) {
        results.push({ episode: ep + 1, type: data.type, url: data.url })
        console.error(`第 ${ep + 1} 集: ${data.type} ${data.url}`)
      } else {
        console.error(`第 ${ep + 1} 集: 获取失败`)
      }
    } catch (e) {
      console.error(`第 ${ep + 1} 集: ${e.message}`)
    }
    if (ep < episodeCount - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  const output = pageTitle ? { title: pageTitle, results } : results
  console.log(JSON.stringify(output, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
