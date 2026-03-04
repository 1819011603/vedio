import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export async function getYtDlpPath(): Promise<string> {
  try {
    execSync('yt-dlp --version', { stdio: 'pipe' })
    return 'yt-dlp'
  } catch (_) {}
  try {
    execSync('ytdlp --version', { stdio: 'pipe' })
    return 'ytdlp'
  } catch (_) {}
  return 'yt-dlp'
}

export function getM3u8DLPath(resourcesPath: string): string {
  const isWin = process.platform === 'win32'
  const name = isWin ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE'
  const full = join(resourcesPath, name)
  if (existsSync(full)) return full
  return name
}
