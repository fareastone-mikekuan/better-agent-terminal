import { loadM365Token, saveM365Token, type M365TokenPayload } from './m365-token-store'

export interface StartDeviceFlowInput {
  tenant?: string
  clientId: string
  scopes: string[]
}

export interface DeviceFlowResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
  message?: string
}

function tenantOrDefault(tenant?: string) {
  const t = (tenant || 'common').trim()
  return t || 'common'
}

function nowMs() {
  return Date.now()
}

function toFormUrlEncoded(params: Record<string, string>) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

export async function startDeviceFlow(input: StartDeviceFlowInput): Promise<DeviceFlowResponse> {
  const tenant = tenantOrDefault(input.tenant)
  const scope = input.scopes.join(' ').trim()

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormUrlEncoded({
      client_id: input.clientId,
      scope
    })
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || `Device flow failed (${res.status})`)
  }

  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    expiresIn: json.expires_in,
    interval: json.interval,
    message: json.message
  }
}

async function tokenRequest(tenant: string, body: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormUrlEncoded(body)
  })
  const json = await res.json()
  return { ok: res.ok, status: res.status, json }
}

export async function completeDeviceFlowAndStore(params: {
  tenant?: string
  clientId: string
  deviceCode: string
  timeoutMs?: number
}): Promise<{ success: true; token: M365TokenPayload } | { success: false; error: string } > {
  const tenant = tenantOrDefault(params.tenant)
  const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 120000
  const started = nowMs()

  while (nowMs() - started < timeoutMs) {
    const { ok, json } = await tokenRequest(tenant, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: params.clientId,
      device_code: params.deviceCode
    })

    if (ok) {
      const expiresIn = Number(json.expires_in || 3600)
      const token: M365TokenPayload = {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        scope: json.scope,
        tokenType: json.token_type,
        expiresAt: nowMs() + expiresIn * 1000,
        idToken: json.id_token
      }
      await saveM365Token(token)
      return { success: true, token }
    }

    const err = String(json?.error || '')
    if (err === 'authorization_pending' || err === 'slow_down') {
      await new Promise(r => setTimeout(r, err === 'slow_down' ? 5000 : 2500))
      continue
    }

    return { success: false, error: json?.error_description || json?.error || 'Device flow failed' }
  }

  return { success: false, error: 'Timed out waiting for authorization' }
}

export async function getValidAccessToken(params: {
  tenant?: string
  clientId: string
  scopes: string[]
}): Promise<string> {
  const tenant = tenantOrDefault(params.tenant)
  const existing = await loadM365Token()

  if (existing?.accessToken && existing.expiresAt - 60000 > nowMs()) {
    return existing.accessToken
  }

  if (!existing?.refreshToken) {
    throw new Error('Not signed in to Microsoft 365')
  }

  const scope = params.scopes.join(' ').trim()
  const { ok, json } = await tokenRequest(tenant, {
    grant_type: 'refresh_token',
    client_id: params.clientId,
    refresh_token: existing.refreshToken,
    scope
  })

  if (!ok) {
    throw new Error(json?.error_description || json?.error || 'Token refresh failed')
  }

  const expiresIn = Number(json.expires_in || 3600)
  const refreshed: M365TokenPayload = {
    ...existing,
    accessToken: json.access_token,
    refreshToken: json.refresh_token || existing.refreshToken,
    scope: json.scope || existing.scope,
    tokenType: json.token_type || existing.tokenType,
    expiresAt: nowMs() + expiresIn * 1000,
    idToken: json.id_token || existing.idToken
  }

  await saveM365Token(refreshed)
  return refreshed.accessToken
}
