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

/** Scheme, host and port of a page, without the path. `https://smurfworks.github.io/dosage/` is `https://smurfworks.github.io`. */
export function pageOrigin(pageUrl: string): string {
  return new URL(pageUrl).origin
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

type StoredDevice = { id: string; baseUrl: string; token: string; timezone: string }

function readDevice(): StoredDevice | null {
  const raw = storage()?.getItem(DEVICE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDevice>
    if (typeof parsed.id === 'string' && typeof parsed.baseUrl === 'string' && typeof parsed.token === 'string') {
      return {
        id: parsed.id,
        baseUrl: parsed.baseUrl,
        token: parsed.token,
        timezone: typeof parsed.timezone === 'string' ? parsed.timezone : '',
      }
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

function rememberDevice(auth: PushAuth, id: string, timezone: string) {
  storage()?.setItem(DEVICE_KEY, JSON.stringify({ id, baseUrl: auth.baseUrl, token: auth.token, timezone }))
}

export function forgetPushDevice() {
  storage()?.removeItem(DEVICE_KEY)
}

export type PushConnection = { ok: true } | { ok: false; message: string }

/** Confirms the address and token are accepted. A list of devices is enough; nothing is booked. */
export async function checkPushConnection(auth: PushAuth, fetchImpl: typeof fetch = fetch): Promise<PushConnection> {
  try {
    const response = await fetchImpl(`${auth.baseUrl}/api/devices`, { headers: authHeaders(auth) })
    if (response.status === 401) return { ok: false, message: 'That reminder server token was not accepted.' }
    if (!response.ok) return { ok: false, message: `The reminder server responded ${response.status}.` }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Dosage Helper could not reach that reminder server.' }
  }
}

function authHeaders(auth: PushAuth, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${auth.token}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

function validationError(message: string): string {
  if (/timezone/i.test(message)) return 'Choose a timezone the reminder server knows.'
  if (/does not exist/i.test(message)) return "That reminder time does not exist in your timezone."
  if (/register a timezone/i.test(message)) return 'Choose your timezone before reminders can be booked.'
  return "Register this app's origin on the reminder server."
}

async function asJson(response: Response, forgetOnMissing = false): Promise<unknown> {
  if (response.status === 404 && forgetOnMissing) {
    forgetPushDevice()
    throw new Error('This phone is no longer registered for reminders.')
  }
  if (response.status === 422) {
    let message = ''
    try {
      const body = (await response.json()) as { message?: unknown }
      if (typeof body.message === 'string') message = body.message
    } catch {
      // The status is enough when the server sends no details.
    }
    throw new Error(validationError(message))
  }
  if (!response.ok) throw new Error(`The reminder server responded ${response.status}.`)
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function postDevice(
  auth: PushAuth,
  timezone: string,
  subscription: PushSubscription,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(`${auth.baseUrl}/api/devices`, {
    method: 'POST',
    headers: authHeaders(auth, true),
    body: JSON.stringify({ timezone, subscription: subscription.toJSON() }),
  })
  const body = (await asJson(response)) as { id?: string }
  if (!body.id) throw new Error('The reminder server did not register this phone.')
  rememberDevice(auth, body.id, timezone)
  return body.id
}

/**
 * Registers this phone, or updates its timezone when that has changed.
 * A phone already registered for this server keeps its subscription.
 */
export async function ensurePushDevice(
  auth: PushAuth,
  timezone: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const stored = readDevice()
  const sameServer = stored !== null && stored.baseUrl === auth.baseUrl && stored.token === auth.token
  if (sameServer && stored.timezone === timezone) return stored.id
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return sameServer ? stored.id : null
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return sameServer ? stored.id : null
  if (typeof window === 'undefined' || !('PushManager' in window)) return sameServer ? stored.id : null
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.pushManager) return sameServer ? stored.id : null

  const current = await registration.pushManager.getSubscription()
  if (sameServer && stored && current) return postDevice(auth, timezone, current, fetchImpl)
  if (sameServer && stored) return stored.id

  if (current) await current.unsubscribe()
  const keyResponse = await fetchImpl(`${auth.baseUrl}/api/vapid-public-key`, { headers: { Accept: 'application/json' } })
  const keyBody = (await asJson(keyResponse)) as { publicKey?: string }
  if (!keyBody.publicKey) throw new Error('The reminder server has no public key.')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(keyBody.publicKey) as BufferSource,
  })
  return postDevice(auth, timezone, subscription, fetchImpl)
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
    notifications?: { key: string; status?: string }[]
  }
  const keys = new Set(wanted.map((item) => item.key))
  for (const existing of current.notifications ?? []) {
    if (keys.has(existing.key)) continue
    // A reminder already sent or skipped stays on the server as a record of when it went out.
    if (existing.status === 'sent' || existing.status === 'skipped') continue
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
