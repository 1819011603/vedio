"use strict";
/**
 * ziziys.org 浏览器内提取 - 绕过 SafeLine WAF
 * 使用 Electron BrowserWindow 加载页面，在页面上下文中 fetch 播放器接口
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
exports.runZiziysBrowserExtract = runZiziysBrowserExtract;
const electron_1 = require("electron");
const https = __importStar(require("https"));
function parseVideoUrl(url) {
    const m = url.match(/\/video\/(\d+)-(\d+)-(\d+)\.html/);
    if (!m)
        return null;
    return { id: m[1], sid: m[2] };
}
const isValidVideoSource = (u) => u && u.includes('play.kvmplay.org') && (u.includes('/ws/') || u.includes('/m3/') || u.endsWith('.m3u8') || u.endsWith('.svg'));
/** 从 player_aaaa 解析 url 及 POST 所需参数 expires/client/nonce/token */
function parsePlayerPage(data) {
    let sourceUrl = null;
    let body = null;
    const pick = (u) => {
        if (!u)
            return;
        const s = (u || '').replace(/\\\//g, '/').trim();
        if (isValidVideoSource(s))
            sourceUrl = s;
    };
    // 优先解析 player_aaaa（ziziys 播放器页格式）
    if (data.includes('player_aaaa') && data.includes('play.kvmplay.org')) {
        const urlM = data.match(/"url"\s*:\s*"([^"]*play\.kvmplay\.org[^"]*\.svg)"/);
        const expiresM = data.match(/"expires"\s*:\s*(\d+)/);
        const clientM = data.match(/"client"\s*:\s*"([^"]*)"/);
        const nonceM = data.match(/"nonce"\s*:\s*"([^"]*)"/);
        const tokenM = data.match(/"token"\s*:\s*"([^"]*)"/);
        const u = urlM?.[1]?.replace(/\\\//g, '/');
        if (u && isValidVideoSource(u)) {
            sourceUrl = u;
            body = {
                expires: parseInt(expiresM?.[1] || '0', 10),
                client: clientM?.[1] || '127.0.0.1',
                nonce: nonceM?.[1] || '',
                token: tokenM?.[1] || '',
                source: u,
            };
        }
    }
    if (!sourceUrl) {
        try {
            const json = JSON.parse(data.trim());
            const u = json.url || json.source || json.video_url;
            if (u) {
                pick(u);
                if (sourceUrl) {
                    body = {
                        expires: json.expires ?? 0,
                        client: String(json.client || '127.0.0.1'),
                        nonce: String(json.nonce || ''),
                        token: String(json.token || ''),
                        source: sourceUrl,
                    };
                }
            }
        }
        catch { }
    }
    if (!sourceUrl && data.includes('play.kvmplay.org')) {
        const m1 = data.match(/"url"\s*:\s*"([^"]*play\.kvmplay\.org[^"]*\.svg)"/);
        const m2 = data.match(/play\.kvmplay\.org[\\\/]+ws[\\\/]+([a-zA-Z0-9]+)[\\\/]+([^"'\s]+\.svg)/);
        if (m1)
            pick(m1[1]);
        if (!sourceUrl && m2)
            pick('https://play.kvmplay.org/ws/' + m2[1] + '/' + m2[2]);
    }
    if (!sourceUrl) {
        const bodyMatch = data.match(/const body\s*=\s*\{([^}]+)\}/s);
        if (bodyMatch) {
            body = {};
            const re = /(\w+):\s*'([^']*)'/g;
            let m;
            while ((m = re.exec(bodyMatch[1])) !== null)
                body[m[1]] = m[2];
        }
        if (!sourceUrl && body?.source && isValidVideoSource(String(body.source)))
            sourceUrl = String(body.source);
    }
    return { sourceUrl, body };
}
function postToKvmplay(sourceUrl, body) {
    return new Promise((resolve) => {
        const useFullBody = body && (body.token || body.expires !== undefined);
        const postBody = useFullBody ? body : { source: sourceUrl };
        const data = JSON.stringify(postBody);
        const u = new URL(sourceUrl);
        const opts = {
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'zh-CN,zh;q=0.9',
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(data)),
                'origin': 'https://www.ziziys.org',
                'ingress-traffic-env': 'grayTest',
                'traffic-env': 'grayTest',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            },
            rejectUnauthorized: false,
        };
        const req = https.request(opts, (res) => {
            let buf = '';
            res.on('data', (chunk) => { buf += chunk.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(buf);
                    resolve(parsed);
                }
                catch {
                    console.error('[ziziys] POST 响应解析失败, status:', res.statusCode, 'body:', buf?.slice(0, 500));
                    resolve(null);
                }
            });
        });
        req.on('error', (err) => {
            console.error('[ziziys] POST 请求失败:', err?.message || err);
            resolve(null);
        });
        req.setTimeout(25000, () => {
            console.error('[ziziys] POST 超时:', sourceUrl);
            req.destroy();
            resolve(null);
        });
        req.write(data);
        req.end();
    });
}
/** 在浏览器中执行 ziziys 提取 */
async function runZiziysBrowserExtract(pageUrl, onProgress) {
    const parsed = parseVideoUrl(pageUrl);
    if (!parsed) {
        return { ok: false, error: '无法解析 URL，需为 /video/{id}-{sid}-{ep}.html 格式' };
    }
    const { id, sid } = parsed;
    const url = pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`;
    const sess = electron_1.session.fromPartition(`ziziys-extract-${Date.now()}`);
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        title: 'ziziys 提取 - 等待页面加载',
        webPreferences: {
            session: sess,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    win.webContents.setAudioMuted(true);
    const logClose = (tag, extra) => {
        const msg = `[ziziys] ${tag}${extra ? ': ' + extra : ''}`;
        console.error(msg);
        onProgress?.(msg);
    };
    const safeExec = async (code) => {
        if (win.isDestroyed())
            throw new Error('窗口已关闭');
        try {
            return (await win.webContents.executeJavaScript(code));
        }
        catch (e) {
            if (win.isDestroyed() || /destroyed|Object has been destroyed/i.test(e?.message || '')) {
                throw new Error('窗口已关闭');
            }
            throw e;
        }
    };
    win.once('ready-to-show', () => { if (!win.isDestroyed())
        win.show(); });
    win.webContents.on('did-finish-load', () => {
        if (win.isDestroyed())
            return;
        try {
            win.webContents.executeJavaScript('window.close = function(){}').catch(() => { });
        }
        catch (_) { }
    });
    win.webContents.on('render-process-gone', (_ev, details) => {
        const reason = details.reason || '未知';
        const exitCode = details.exitCode !== undefined ? details.exitCode : '?';
        logClose('渲染进程退出', `reason=${reason} exitCode=${exitCode}`);
    });
    win.webContents.on('unresponsive', () => logClose('页面无响应'));
    win.on('close', (e) => logClose('close 事件触发'));
    win.on('closed', () => logClose('closed 事件 - 窗口已销毁'));
    try {
        onProgress?.('正在加载页面...');
        const loadDone = new Promise((resolve) => {
            win.webContents.once('did-finish-load', () => resolve());
        });
        try {
            await win.loadURL(url, {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            });
        }
        catch (loadErr) {
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: `加载失败: ${loadErr?.message || '未知错误'}` };
        }
        await Promise.race([loadDone, new Promise((r) => setTimeout(r, 25000))]);
        if (win.isDestroyed()) {
            return { ok: false, error: '窗口已关闭' };
        }
        if (!win.isVisible())
            win.show();
        win.focus();
        let curUrl = '';
        try {
            curUrl = win.webContents.getURL();
        }
        catch (_) {
            return { ok: false, error: '窗口已关闭' };
        }
        if (!curUrl || curUrl === 'about:blank') {
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: '页面加载失败' };
        }
        const isWafPage = (h) => h.includes('safeline') || h.includes('slg-') || h.includes('雷池') || /安全检测.*WAF|WAF.*驱动/i.test(h);
        onProgress?.('等待 WAF 校验完成...');
        let html = '';
        try {
            html = await safeExec('document.documentElement.outerHTML');
        }
        catch (e) {
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: e?.message || '无法读取页面内容，请检查网络' };
        }
        const maxWaitMs = 90000;
        const pollIntervalMs = 4000;
        const startTime = Date.now();
        while (isWafPage(html) && Date.now() - startTime < maxWaitMs) {
            const waited = Math.round((Date.now() - startTime) / 1000);
            onProgress?.(`检测到 WAF 页面，继续等待... (已等 ${waited} 秒)`);
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            if (win.isDestroyed())
                return { ok: false, error: '窗口已关闭' };
            try {
                html = await safeExec('document.documentElement.outerHTML');
            }
            catch (e) {
                return { ok: false, error: e?.message || '无法读取页面内容，请检查网络' };
            }
        }
        if (!isWafPage(html)) {
            onProgress?.('WAF 校验完成，开始解析');
        }
        if (isWafPage(html)) {
            try {
                if (win && !win.isDestroyed())
                    win.close();
            }
            catch (_) { }
            return { ok: false, error: 'WAF 校验超时（90 秒），请稍后重试' };
        }
        // 解析标题和集数
        const pageInfo = await safeExec(`
      (function() {
        let title = '';
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) title = og.content.replace(/\\s*[-–—].*$/, '').trim();
        else {
          const h1 = document.querySelector('h1');
          if (h1) title = (h1.innerText || '').replace(/\\s+/g, ' ').trim();
        }
        const re = new RegExp('href="[^"]*\\\\/video\\\\/${id}-${sid}-(\\\\d+)\\\\.html"', 'g');
        const nums = [];
        let m;
        while ((m = re.exec(document.documentElement.outerHTML)) !== null) nums.push(parseInt(m[1], 10));
        const episodeCount = nums.length ? Math.max(...nums) : 1;
        return { title, episodeCount };
      })()
    `);
        const { title, episodeCount } = pageInfo;
        onProgress?.(`共 ${episodeCount} 集，开始提取...`);
        const results = [];
        for (let n = 1; n <= episodeCount; n++) {
            if (win.isDestroyed())
                break;
            onProgress?.(`第 ${n}/${episodeCount} 集...`);
            const playerUrl = `https://www.ziziys.org/vod/player/id/${id}/nid/${n}/sid/${sid}.html`;
            try {
                const playerData = await safeExec(`
          fetch(${JSON.stringify(playerUrl)}, {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html,application/json' }
          }).then(r => r.text())
        `);
                const { sourceUrl, body } = parsePlayerPage(playerData);
                if (!sourceUrl) {
                    const preview = (playerData || '').slice(0, 400);
                    const msg = `[第 ${n} 集] 未解析到 play.kvmplay.org，响应前400字符: ${preview}`;
                    onProgress?.(msg);
                    console.error('[ziziys]', msg);
                    continue;
                }
                onProgress?.(`[第 ${n} 集] svg url: ${sourceUrl}`);
                if (sourceUrl.includes('/ws')) {
                    const data = await postToKvmplay(sourceUrl, body);
                    const m3u8Url = data?.url;
                    if (m3u8Url) {
                        results.push({ episode: n, type: data.type || 'm3u8', url: m3u8Url });
                        onProgress?.(`[第 ${n} 集] 成功: ${m3u8Url}`);
                    }
                    else {
                        const msg = `[第 ${n} 集] POST 未返回有效 m3u8, 响应: ${JSON.stringify(data)}`;
                        onProgress?.(msg);
                        console.error('[ziziys]', msg);
                    }
                }
                else if (sourceUrl.includes('/m3/') || sourceUrl.endsWith('.m3u8')) {
                    results.push({ episode: n, type: 'm3u8', url: sourceUrl });
                    onProgress?.(`[第 ${n} 集] 成功: ${sourceUrl}`);
                }
                else {
                    const msg = `[第 ${n} 集] sourceUrl 格式异常: ${sourceUrl}`;
                    onProgress?.(msg);
                    console.error('[ziziys]', msg);
                }
            }
            catch (e) {
                const msg = `[第 ${n} 集] 异常: ${e?.message || '未知'}`;
                onProgress?.(msg);
                console.error('[ziziys]', msg, e);
            }
            if (n < episodeCount)
                await new Promise((r) => setTimeout(r, 800));
        }
        try {
            if (win && !win.isDestroyed())
                win.close();
        }
        catch (_) { }
        if (results.length === 0) {
            return { ok: false, error: '未获取到任何视频链接' };
        }
        const successSet = new Set(results.map((r) => r.episode));
        const failed = [];
        for (let i = 1; i <= episodeCount; i++) {
            if (!successSet.has(i))
                failed.push(i);
        }
        if (failed.length > 0) {
            const summary = `提取完成: 成功 ${results.length}/${episodeCount} 集，失败: 第${failed.join('、')}集`;
            onProgress?.(summary);
            console.error('[ziziys]', summary);
        }
        onProgress?.('--- 提取结果 ---');
        results.forEach((r) => onProgress?.(`第 ${r.episode} 集: ${r.url}`));
        return { ok: true, title: title || undefined, results };
    }
    catch (e) {
        try {
            if (win && !win.isDestroyed())
                win.close();
        }
        catch (_) { }
        return { ok: false, error: e?.message || '提取失败' };
    }
}
