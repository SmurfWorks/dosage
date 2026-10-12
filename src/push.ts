import { REMINDER_GRACE_MS, type ScheduledReminder } from './reminders'

const DEVICE_KEY = 'insulin-calculator.push-device.v1'
const GRACE_MINUTES = REMINDER_GRACE_MS / 60_000

export type PushAuth = { baseUrl: string; token: string }

export type BookedNotification = ScheduledReminder & {
  url?: string
  icon?: string
}

/** Address and token from Set your routine. Empty or unusable values do not book anything. */
export function pushAuth(url: string, token: string): PushAuth | null {
  const trimmedToken = token.trim()
  const baseUrl = url.trim().replace(/\/$/, '')
  if (!trimmedToken || !baseUrl) return null
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
  } catch {
    return null
  }
  return { baseUrl, token: trimmedToken }
}

/** A secure page cannot call an http server, so booking waits until the address is https. */
export function pushUrlIsReachable(baseUrl: string, pageProtocol: string): boolean {
  try {
    return !(pageProtocol === 'https:' && new URL(baseUrl).protocol === 'http:')
  } catch {
    return false
  }
}

/** The bytes `pushManager.subscribe` expects for the server's public key. */
export function applicationServerKey(publicKey: string): Uint8Array {
  const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
  const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

type StoredDevice = { id: string; baseUrl: string; token: string }

function readDevice(): StoredDevice | null {
  const raw = storage()?.getItem(DEVICE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDevice>
    if (typeof parsed.id === 'string' && typeof parsed.baseUrl === 'string' && typeof parsed.token === 'string') {
      return { id: parsed.id, baseUrl: parsed.baseUrl, token: parsed.token }
    }
  } catch {
    // An older install stored only the id, which belonged to a server chosen in code.
  }
  return null
}

export function storedPushDeviceId(auth: PushAuth): string | null {
  const stored = readDevice()
  if (!stored || stored.baseUrl !== auth.baseUrl || stored.token !== auth.token) return null
  return stored.id
}

function rememberDevice(auth: PushAuth, id: string) {
  storage()?.setItem(DEVICE_KEY, JSON.stringify({ id, baseUrl: auth.baseUrl, token: auth.token }))
}

export function forgetPushDevice() {
  storage()?.removeItem(DEVICE_KEY)
}

function authHeaders(auth: PushAuth, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${auth.token}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function asJson(response: Response, forgetOnMissing = false): Promise<unknown> {
  if (response.status === 404 && forgetOnMissing) {
    forgetPushDevice()
    throw new Error('This phone is no longer registered for reminders.')
  }
  if (!response.ok) throw new Error(`The reminder server responded ${response.status}.`)
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export async function ensurePushDevice(auth: PushAuth, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const existing = storedPushDeviceId(auth)
  if (existing) return existing
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.pushManager) return null

  const previous = await registration.pushManager.getSubscription()
  if (previous) await previous.unsubscribe()

  const keyResponse = await fetchImpl(`${auth.baseUrl}/api/vapid-public-key`, { headers: { Accept: 'application/json' } })
  const keyBody = (await asJson(keyResponse)) as { publicKey?: string }
  if (!keyBody.publicKey) throw new Error('The reminder server has no public key.')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(keyBody.publicKey) as BufferSource,
  })

  const response = await fetchImpl(`${auth.baseUrl}/api/devices`, {
    method: 'POST',
    headers: authHeaders(auth, true),
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  const body = (await asJson(response)) as { id?: string }
  if (!body.id) throw new Error('The reminder server did not register this phone.')
  rememberDevice(auth, body.id)
  return body.id
}

export async function replaceNotifications(
  auth: PushAuth,
  deviceId: string,
  wanted: BookedNotification[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const root = `${auth.baseUrl}/api/devices/${deviceId}/notifications`
  if (wanted.length === 0) {
    await asJson(await fetchImpl(root, { method: 'DELETE', headers: authHeaders(auth) }), true)
    return
  }

  const current = (await asJson(
    await fetchImpl(root, { headers: authHeaders(auth) }),
    true,
  )) as {
    notifications?: { key: string }[]
  }
  const keys = new Set(wanted.map((item) => item.key))
  for (const existing of current.notifications ?? []) {
    if (keys.has(existing.key)) continue
    const removed = await fetchImpl(`${root}/${encodeURIComponent(existing.key)}`, {
      method: 'DELETE',
      headers: authHeaders(auth),
    })
    if (removed.status === 404) continue
    await asJson(removed)
  }

  for (const item of wanted) {
    await asJson(
      await fetchImpl(`${root}/${encodeURIComponent(item.key)}`, {
        method: 'PUT',
        headers: authHeaders(auth, true),
        body: JSON.stringify({
          deliver_at: item.deliverAt,
          title: item.title,
          body: item.body,
          tag: item.tag,
          grace_minutes: GRACE_MINUTES,
          ...(item.url ? { url: item.url } : {}),
          ...(item.icon ? { icon: item.icon } : {}),
        }),
      }),
    )
  }
}
