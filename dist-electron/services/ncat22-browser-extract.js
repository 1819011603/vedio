"use strict";
/**
 * ncat22/ncat23 浏览器内提取 - 绕过 cdndefend 防护
 * 使用 Electron 内置无头 BrowserWindow（show: false）加载页面，
 * 执行 JS 通过验证后获取 HTML，解析 m3u8 链接
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNcat22BrowserExtract = runNcat22BrowserExtract;
const electron_1 = require("electron");
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
function parsePlayUrl(url) {
    const m = url.match(/\/play\/(\d+)-(\d+)-(\d+)\.html/);
    if (!m)
        return null;
    return { id: m[1], sid: m[2], ep: parseInt(m[3], 10) };
}
/** 解码 Unicode 转义序列 (\uXXXX) */
function decodeUnicode(str) {
    try {
        return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    catch {
        return str;
    }
}
function extractM3u8Urls(html) {
    const urls = new Set();
    let m;
    // 方法1: 直接匹配明文 m3u8 URL
    const plainUrlRe = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
    while ((m = plainUrlRe.exec(html)) !== null) {
        const url = m[1].replace(/\\\//g, '/').replace(/\\"/g, '').replace(/\\'/g, '');
        if (url.includes('.m3u8')) {
            urls.add(url);
        }
    }
    // 方法2: 找所有引号内的长字符串，解码后检查是否是m3u8
    const quotedRe = /["']([^"']{20,})["']/g;
    while ((m = quotedRe.exec(html)) !== null) {
        const decoded = decodeUnicode(m[1]);
        if (decoded.includes('.m3u8') && decoded.includes('http')) {
            const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (urlMatch) {
                urls.add(urlMatch[1]);
            }
        }
    }
    // 方法3: 找 playSource 或 src 附近的内容，宽松匹配
    const srcBlockRe = /(?:playSource|src)\s*[=:]\s*[{]?[^;]{0,500}/gi;
    while ((m = srcBlockRe.exec(html)) !== null) {
        const decoded = decodeUnicode(m[0]);
        const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (urlMatch) {
            urls.add(urlMatch[1]);
        }
    }
    // 方法4: 匹配包含 \u 编码的字符串，解码后检查
    const unicodeStrRe = /["']([^"']*\\u[0-9A-Fa-f]{4}[^"']*)["']/g;
    while ((m = unicodeStrRe.exec(html)) !== null) {
        const decoded = decodeUnicode(m[1]);
        if (decoded.includes('.m3u8')) {
            const urlMatch = decoded.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (urlMatch) {
                urls.add(urlMatch[1]);
            }
        }
    }
    return [...urls];
}
function headCheck(url, refererOrigin) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, {
            method: 'HEAD',
            headers: { 'User-Agent': UA, Referer: `${refererOrigin}/` },
            rejectUnauthorized: false,
        }, (res) => {
            resolve(res.statusCode !== 404);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(8000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}
async function findWorkingUrl(urls, refererOrigin) {
    for (let i = 0; i < urls.length; i++) {
        const ok = await headCheck(urls[i], refererOrigin);
        if (ok)
            return urls[i];
        if (i < urls.length - 1)
            await new Promise((r) => setTimeout(r, 200));
    }
    return null;
}
function parsePageTitle(html) {
    // 1) div.detail-title 内 a > strong（ncat22 播放页结构）
    const detailTitleMatch = html.match(/<div[^>]*class="[^"]*detail-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>/i);
    if (detailTitleMatch) {
        console.log('[ncat22] 标题来源: detail-title>a>strong');
        return detailTitleMatch[1].replace(/\s+/g, ' ').trim();
    }
    // 2) og:title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) {
        console.log('[ncat22] 标题来源: og:title');
        return ogMatch[1].replace(/\s*[-–—].*$/, '').trim();
    }
    // 3) div.data > h1
    const dataH1Match = html.match(/<div[^>]*class="[^"]*\bdata\b[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i);
    if (dataH1Match) {
        console.log('[ncat22] 标题来源: div.data>h1');
        return dataH1Match[1].replace(/\s+/g, ' ').trim();
    }
    // 4) 任意 h1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
        console.log('[ncat22] 标题来源: h1');
        return h1Match[1].replace(/\s+/g, ' ').trim();
    }
    console.log('[ncat22] 未匹配到标题');
    return '';
}
function parseEpisodeCount(html, id, sid) {
    const epRe = new RegExp(`href="[^"]*\\/play\\/${id}-${sid}-(\\d+)\\.html"`, 'g');
    const listMatch = html.match(epRe);
    if (listMatch) {
        const nums = listMatch.map((x) => parseInt((x.match(/(\d+)\.html/) || [])[1], 10));
        if (nums.length)
            return Math.max(...nums);
    }
    return 0;
}
const isCdndefend = (html) => html.includes('cdndefend') || html.includes('verifying your browser');
/** 在浏览器中执行 ncat22 提取，绕过 cdndefend */
async function runNcat22BrowserExtract(pageUrl, onProgress) {
    const parsed = parsePlayUrl(pageUrl);
    if (!parsed) {
        return { ok: false, error: '无法解析 URL，需为 /play/{id}-{sid}-{ep}.html 格式' };
    }
    const { id, sid, ep } = parsed;
    const baseOrigin = new URL(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`).origin;
    const isMovie = ep === 1 || ep > 1000;
    const sess = electron_1.session.fromPartition(`ncat22-extract-${Date.now()}`);
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
            session: sess,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    win.webContents.setAudioMuted(true);
    const safeExec = async (code) => {
        if (win.isDestroyed())
            throw new Error('窗口已关闭');
        try {
            return (await win.webContents.executeJavaScript(code));
        }
        catch (e) {
            const err = e;
            if (win.isDestroyed() || /destroyed|Object has been destroyed/i.test(err?.message || '')) {
                throw new Error('窗口已关闭');
            }
            throw e;
        }
    };
    win.webContents.on('did-finish-load', () => {
        if (win.isDestroyed())
            return;
        win.webContents.executeJavaScript('window.close = function(){}').catch(() => { });
    });
    try {
        onProgress?.('正在加载页面（将自动通过 cdndefend 验证）...');
        const loadDone = new Promise((resolve) => {
            win.webContents.once('did-finish-load', () => resolve());
        });
        try {
            await win.loadURL(pageUrl, { userAgent: UA });
        }
        catch (loadErr) {
            const err = loadErr;
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: `加载失败: ${err?.message || '未知错误'}` };
        }
        await Promise.race([loadDone, new Promise((r) => setTimeout(r, 25000))]);
        if (win.isDestroyed())
            return { ok: false, error: '窗口已关闭' };
        let html = '';
        try {
            html = await safeExec('document.documentElement.outerHTML');
        }
        catch (e) {
            const err = e;
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: err?.message || '无法读取页面内容' };
        }
        const maxWaitMs = 60000;
        const pollIntervalMs = 3000;
        const startTime = Date.now();
        while (isCdndefend(html) && Date.now() - startTime < maxWaitMs) {
            const waited = Math.round((Date.now() - startTime) / 1000);
            onProgress?.(`等待 cdndefend 验证... (已等 ${waited} 秒)`);
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            if (win.isDestroyed())
                return { ok: false, error: '窗口已关闭' };
            try {
                html = await safeExec('document.documentElement.outerHTML');
            }
            catch {
                return { ok: false, error: '无法读取页面内容' };
            }
        }
        if (isCdndefend(html)) {
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: 'cdndefend 验证超时（60 秒），请稍后重试' };
        }
        onProgress?.('验证通过，开始解析...');
        let pageTitle = parsePageTitle(html);
        let episodeCount = 1;
        if (!isMovie) {
            episodeCount = parseEpisodeCount(html, id, sid) || 10;
            if (episodeCount === 10 && !parseEpisodeCount(html, id, sid)) {
                onProgress?.('未解析到集数，默认 10 集');
            }
        }
        if (pageTitle)
            onProgress?.(`标题: ${pageTitle}`);
        onProgress?.(`共 ${episodeCount} 集，开始提取...`);
        const results = [];
        for (let n = 1; n <= episodeCount; n++) {
            if (win.isDestroyed())
                break;
            const playUrl = isMovie ? pageUrl : `${baseOrigin}/play/${id}-${sid}-${n}.html`;
            onProgress?.(`第 ${n}/${episodeCount} 集...`);
            try {
                if (!isMovie && n > 1) {
                    await win.loadURL(playUrl, { userAgent: UA });
                    await new Promise((r) => setTimeout(r, 3000));
                    if (win.isDestroyed())
                        break;
                    html = await safeExec('document.documentElement.outerHTML');
                    if (isCdndefend(html)) {
                        onProgress?.(`第 ${n} 集: 仍为防护页，跳过`);
                        continue;
                    }
                }
                const urls = extractM3u8Urls(html);
                if (!urls.length) {
                    onProgress?.(`第 ${n} 集: 未找到 m3u8 链接`);
                    continue;
                }
                onProgress?.(`第 ${n} 集: 解析到 ${urls.length} 个候选`);
                const workingUrl = await findWorkingUrl(urls, baseOrigin);
                if (workingUrl) {
                    results.push({ episode: n, type: 'm3u8', url: workingUrl });
                    onProgress?.(`第 ${n} 集: ${workingUrl}`);
                }
                else {
                    onProgress?.(`第 ${n} 集: 所有源 404`);
                }
            }
            catch (e) {
                const err = e;
                onProgress?.(`第 ${n} 集: ${err?.message || '异常'}`);
            }
            if (n < episodeCount)
                await new Promise((r) => setTimeout(r, 400));
        }
        try {
            if (win && !win.isDestroyed())
                win.close();
        }
        catch (_) { }
        if (results.length === 0) {
            return { ok: false, error: '未获取到任何视频链接' };
        }
        return { ok: true, title: pageTitle || undefined, results };
    }
    catch (e) {
        const err = e;
        try {
            if (win && !win.isDestroyed())
                win.close();
        }
        catch (_) { }
        return { ok: false, error: err?.message || '提取失败' };
    }
}
