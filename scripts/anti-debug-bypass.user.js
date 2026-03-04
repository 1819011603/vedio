// ==UserScript==
// @name         反调试绕过 - ncat22
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  绕过 ncat22.com 等网站的反调试检测
// @author       You
// @match        *://*.ncat22.com/*
// @match        *://*.ncat*.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// 通过注入 script 标签确保在页面脚本之前执行，运行在页面上下文
(function() {
    'use strict';

    const bypassCode = `
(function() {
    var removeDisableDevtool = function() {
        var scripts = document.querySelectorAll('script[src*="disable-devtool"]');
        for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    };
    removeDisableDevtool();
    if (document.documentElement) {
        new MutationObserver(function(muts) {
            muts.forEach(function(m) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    for (var i = 0; i < m.addedNodes.length; i++) {
                        var n = m.addedNodes[i];
                        if (n.nodeType === 1 && n.tagName === 'SCRIPT' && n.src && n.src.indexOf('disable-devtool') >= 0) n.remove();
                    }
                }
            });
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
    window.DisableDevtool = function() {};
    Object.defineProperty(window, 'DisableDevtool', { get: function() { return function(){}; }, configurable: true });

    var _alert = window.alert;
    var _confirm = window.confirm;

    window.alert = function(msg) {
        if (msg && /devtool|debug|调试|type\\s*=\\s*6|opened/i.test(String(msg))) return;
        return _alert.apply(this, arguments);
    };

    window.confirm = function(msg) {
        if (msg && /devtool|debug|调试|type\\s*=\\s*6|opened/i.test(String(msg))) return false;
        return _confirm.apply(this, arguments);
    };

    var isBlocked = function(u) { return u && /baidu|google|theajack\\.github\\.io|404\\.html/i.test(String(u).toLowerCase()); };

    try {
        var LocProto = Object.getPrototypeOf(window.location);
        var _assign = LocProto.assign;
        var _replace = LocProto.replace;
        if (_assign) LocProto.assign = function(url) { if (isBlocked(url)) return; return _assign.call(this, url); };
        if (_replace) LocProto.replace = function(url) { if (isBlocked(url)) return; return _replace.call(this, url); };
        var hrefDesc = Object.getOwnPropertyDescriptor(LocProto, 'href');
        if (hrefDesc && hrefDesc.set) {
            var _setHref = hrefDesc.set;
            Object.defineProperty(LocProto, 'href', {
                get: hrefDesc.get,
                set: function(v) { if (isBlocked(v)) return; _setHref.call(this, v); },
                configurable: true, enumerable: true
            });
        }
    } catch (e) {
        var loc = window.location, _a = loc.assign && loc.assign.bind(loc), _r = loc.replace && loc.replace.bind(loc);
        if (_a) loc.assign = function(u) { if (isBlocked(u)) return; return _a(u); };
        if (_r) loc.replace = function(u) { if (isBlocked(u)) return; return _r(u); };
    }

    var _open = window.open;
    window.open = function(url, target) {
        if (isBlocked(url) && (!target || target === '_self')) return null;
        return _open.apply(this, arguments);
    };

    document.addEventListener('DOMContentLoaded', function() {
        var metas = document.querySelectorAll('meta[http-equiv="refresh"]');
        for (var i = 0; i < metas.length; i++) {
            if (metas[i].content && isBlocked(metas[i].content)) metas[i].remove();
        }
        new MutationObserver(function(muts) {
            muts.forEach(function(m) {
                if (m.type === 'childList') {
                    [].forEach.call(m.addedNodes, function(n) {
                        if (n.nodeType === 1 && n.tagName === 'META' && n.httpEquiv && n.httpEquiv.toLowerCase() === 'refresh' && isBlocked(n.content || '')) n.remove();
                    });
                }
            });
        }).observe(document.documentElement, { childList: true, subtree: true });
    });

    var neutralize = function(code) {
        if (typeof code !== 'string') return code;
        return code.replace(/\\bdebugger\\b/g, '').replace(/["']debugger["']/g, '""');
    };

    try {
        var _Fn = window.Function;
        window.Function = function() {
            var args = Array.prototype.slice.call(arguments);
            if (args[0] && typeof args[0] === 'string') args[0] = neutralize(args[0]);
            return _Fn.apply(this, args);
        };
    } catch (e) {}

    try {
        var _st = window.setTimeout;
        window.setTimeout = function(fn, delay) {
            if (typeof fn === 'string') fn = neutralize(fn);
            return _st.apply(this, arguments);
        };
    } catch (e) {}

    try {
        var _si = window.setInterval;
        window.setInterval = function(fn, delay) {
            if (typeof fn === 'string') fn = neutralize(fn);
            return _si.apply(this, arguments);
        };
    } catch (e) {}

    try {
        var w = window.outerWidth || window.innerWidth;
        var h = window.outerHeight || window.innerHeight;
        Object.defineProperty(window, 'outerWidth', { get: function() { return w; }, configurable: true });
        Object.defineProperty(window, 'outerHeight', { get: function() { return h; }, configurable: true });
    } catch (e) {}

    window.__ANTI_DEBUG_BYPASS__ = true;
})();
`;

    try {
        var script = document.createElement('script');
        script.textContent = bypassCode;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (e) {
        try { eval(bypassCode); } catch (_) {}
    }

    // 页面加载后显示提示
    function showBanner() {
        if (document.body && !document.getElementById('__bypass_banner__')) {
            var div = document.createElement('div');
            div.id = '__bypass_banner__';
            div.textContent = '🛡️ 反调试已启用';
            div.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;background:#22c55e;color:#fff;padding:4px 10px;font-size:12px;border-radius:4px;margin:0;font-family:sans-serif;';
            document.body.appendChild(div);
            setTimeout(function() { div.remove(); }, 5000);
        }
    }
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner);
})();
