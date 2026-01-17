import { app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

export interface M365TokenPayload {
  accessToken: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  expiresAt: number // epoch ms
  idToken?: string
  account?: {
    displayName?: string
    userPrincipalName?: string
  }
}

type StoredTokenFile =
  | { encrypted: true; data: string }
  | { encrypted: false; data: M365TokenPayload }

const TOKEN_FILE = 'm365-token.json'

function getTokenPath() {
  return path.join(app.getPath('userData'), TOKEN_FILE)
}

export async function loadM365Token(): Promise<M365TokenPayload | null> {
  try {
    const raw = await fs.readFile(getTokenPath(), 'utf-8')
    const parsed = JSON.parse(raw) as StoredTokenFile

    if ((parsed as any)?.encrypted) {
      const enc = parsed as { encrypted: true; data: string }
      if (!safeStorage.isEncryptionAvailable()) return null
      const buf = Buffer.from(enc.data, 'base64')
      const json = safeStorage.decryptString(buf)
      return JSON.parse(json) as M365TokenPayload
    }

    const plain = parsed as { encrypted: false; data: M365TokenPayload }
    return plain.data || null
  } catch {
    return null
  }
}

export async function saveM365Token(token: M365TokenPayload): Promise<void> {
  const tokenPath = getTokenPath()
  try {
    await fs.mkdir(path.dirname(tokenPath), { recursive: true })

    if (safeStorage.isEncryptionAvailable()) {
      const json = JSON.stringify(token)
      const enc = safeStorage.encryptString(json)
      const file: StoredTokenFile = { encrypted: true, data: enc.toString('base64') }
      await fs.writeFile(tokenPath, JSON.stringify(file, null, 2), 'utf-8')
      return
    }

    const file: StoredTokenFile = { encrypted: false, data: token }
    await fs.writeFile(tokenPath, JSON.stringify(file, null, 2), 'utf-8')
  } catch (error) {
    console.error('[M365] Failed to save token:', error)
  }
}

export async function clearM365Token(): Promise<void> {
  try {
    await fs.rm(getTokenPath(), { force: true })
  } catch {
    // ignore
  }
}
