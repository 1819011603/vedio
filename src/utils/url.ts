export function getOriginFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin
  } catch {
    return ''
  }
}

export function getDomainFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const parts = host.split('.')
    if (parts.length >= 2) {
      return parts.slice(-2).join('.')
    }
    return host
  } catch {
    return ''
  }
}

export function isBilibiliPlaylistUrl(url: string): boolean {
  return /bilibili\.com\/(medialist|list|cheese|space)\//i.test(url) || /bilibili\.com\/.*\/(favlist|series)/i.test(url)
}
