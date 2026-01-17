import { getValidAccessToken } from './m365-auth'

export interface M365Config {
  tenant?: string
  clientId: string
  scopes: string[]
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function graphFetch(config: M365Config, url: string, init?: RequestInit) {
  const token = await getValidAccessToken(config)
  const res = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(init?.headers || {})
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph request failed (${res.status}): ${text || res.statusText}`)
  }

  return res
}

export async function getMe(config: M365Config): Promise<{ displayName?: string; userPrincipalName?: string } | null> {
  const res = await graphFetch(config, 'https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName')
  return await res.json()
}

export async function resolveShareLink(config: M365Config, shareUrl: string): Promise<{ driveId: string; itemId: string; name: string; webUrl?: string; isFolder: boolean }> {
  const shareId = `u!${base64UrlEncode(shareUrl)}`
  const res = await graphFetch(
    config,
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,webUrl,folder,file,parentReference`
  )
  const json = await res.json()
  const driveId = json?.parentReference?.driveId
  if (!driveId || !json?.id) throw new Error('Unable to resolve share link (missing driveId/itemId)')

  return {
    driveId,
    itemId: json.id,
    name: json.name || 'Shared item',
    webUrl: json.webUrl,
    isFolder: !!json.folder
  }
}

export interface DriveChildItem {
  id: string
  name: string
  webUrl?: string
  size?: number
  lastModifiedDateTime?: string
  isFolder: boolean
  mimeType?: string
}

export async function listChildren(config: M365Config, driveId: string, itemId: string): Promise<DriveChildItem[]> {
  const items: DriveChildItem[] = []
  let url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$top=200&$select=id,name,webUrl,size,lastModifiedDateTime,folder,file`

  while (url) {
    const res = await graphFetch(config, url)
    const json = await res.json()
    const value = Array.isArray(json?.value) ? json.value : []

    for (const it of value) {
      items.push({
        id: it.id,
        name: it.name,
        webUrl: it.webUrl,
        size: it.size,
        lastModifiedDateTime: it.lastModifiedDateTime,
        isFolder: !!it.folder,
        mimeType: it.file?.mimeType
      })
    }

    url = json['@odata.nextLink'] || ''
  }

  return items
}

export async function downloadDriveItem(config: M365Config, driveId: string, itemId: string): Promise<{ name: string; mimeType?: string; base64: string; size?: number }> {
  // Get metadata first (name, mime)
  const metaRes = await graphFetch(config, `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=id,name,size,file`)
  const meta = await metaRes.json()

  const res = await graphFetch(config, `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`)
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)

  return {
    name: meta?.name || 'download',
    mimeType: meta?.file?.mimeType,
    size: meta?.size,
    base64: buf.toString('base64')
  }
}
