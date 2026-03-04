"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    setDebugOutputEnabled: (enabled) => electron_1.ipcRenderer.invoke('set-debug-output-enabled', enabled),
    onParseDownloadOutput: (cb) => {
        const fn = (_, data) => cb(data);
        electron_1.ipcRenderer.on('parse-download-output', fn);
        return () => electron_1.ipcRenderer.removeListener('parse-download-output', fn);
    },
    parseUrl: (url, opts) => electron_1.ipcRenderer.invoke('parse-url', url, opts),
    parsePlaylist: (url, opts) => electron_1.ipcRenderer.invoke('parse-playlist', url, opts),
    parseMultipleUrls: (urls, opts) => electron_1.ipcRenderer.invoke('parse-multiple-urls', urls, opts),
    fetchImageWithHeaders: (url, referer, origin) => electron_1.ipcRenderer.invoke('fetch-image-with-headers', url, referer, origin),
    renameFile: (dirPath, oldName, newName) => electron_1.ipcRenderer.invoke('rename-file', dirPath, oldName, newName),
    checkFilesExist: (files) => electron_1.ipcRenderer.invoke('check-files-exist', files),
    showFileExistsDialog: (existingPaths) => electron_1.ipcRenderer.invoke('show-file-exists-dialog', existingPaths),
    setDownloadSettings: (opts) => electron_1.ipcRenderer.invoke('set-download-settings', opts),
    download: (task) => electron_1.ipcRenderer.invoke('download', task),
    pauseDownload: (id) => electron_1.ipcRenderer.invoke('pause-download', id),
    resumeDownload: (id) => electron_1.ipcRenderer.invoke('resume-download', id),
    cancelDownload: (id) => electron_1.ipcRenderer.invoke('cancel-download', id),
    getDownloadProgress: () => electron_1.ipcRenderer.invoke('get-download-progress'),
    getDownloadCommand: (id) => electron_1.ipcRenderer.invoke('get-download-command', id),
    sniffStart: (pageUrl, siteConfig) => electron_1.ipcRenderer.invoke('sniff-start', pageUrl, siteConfig),
    sniffClick: (selector, episodeLabel) => electron_1.ipcRenderer.invoke('sniff-click', selector, episodeLabel),
    sniffTraverse: (selector, options) => electron_1.ipcRenderer.invoke('sniff-traverse', selector, options),
    sniffGetTextFromSelector: (selector) => electron_1.ipcRenderer.invoke('sniff-get-text-from-selector', selector),
    sniffStop: () => electron_1.ipcRenderer.invoke('sniff-stop'),
    onSniffCandidate: (cb) => {
        const fn = (_, c) => cb(c);
        electron_1.ipcRenderer.on('sniff-candidate', fn);
        return () => electron_1.ipcRenderer.removeListener('sniff-candidate', fn);
    },
    onSniffResult: (cb) => {
        const fn = (_, r) => cb(r);
        electron_1.ipcRenderer.on('sniff-result', fn);
        return () => electron_1.ipcRenderer.removeListener('sniff-result', fn);
    },
    onSniffWindowClosed: (cb) => {
        const fn = () => cb();
        electron_1.ipcRenderer.on('sniff-window-closed', fn);
        return () => electron_1.ipcRenderer.removeListener('sniff-window-closed', fn);
    },
    onDownloadProgress: (cb) => {
        electron_1.ipcRenderer.on('download-progress', (_, p) => cb(p));
    },
    selectFolder: () => electron_1.ipcRenderer.invoke('select-folder'),
    selectFile: () => electron_1.ipcRenderer.invoke('select-file'),
    selectScriptFile: () => electron_1.ipcRenderer.invoke('select-script-file'),
    runExtractScript: (url, scriptPath) => electron_1.ipcRenderer.invoke('run-extract-script', url, scriptPath),
    getAppPath: () => electron_1.ipcRenderer.invoke('get-app-path'),
    getResourcesPath: () => electron_1.ipcRenderer.invoke('get-resources-path'),
});
