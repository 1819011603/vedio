"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYtDlpPath = getYtDlpPath;
exports.getM3u8DLPath = getM3u8DLPath;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
async function getYtDlpPath() {
    try {
        (0, child_process_1.execSync)('yt-dlp --version', { stdio: 'pipe' });
        return 'yt-dlp';
    }
    catch (_) { }
    try {
        (0, child_process_1.execSync)('ytdlp --version', { stdio: 'pipe' });
        return 'ytdlp';
    }
    catch (_) { }
    return 'yt-dlp';
}
function getM3u8DLPath(resourcesPath) {
    const isWin = process.platform === 'win32';
    const name = isWin ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
    const full = (0, path_1.join)(resourcesPath, name);
    if ((0, fs_1.existsSync)(full))
        return full;
    return name;
}
