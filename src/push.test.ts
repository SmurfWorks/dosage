import { afterEach, describe, expect, it, vi } from 'vitest'
import { applicationServerKey, checkPushConnection, ensurePushDevice, pageOrigin, pushAuth, pushUrlIsReachable, replaceNotifications, type BookedNotification } from './push'

const auth = { baseUrl: 'http://push.example', token: 'app-token' }

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
}

describe('push server', () => {
  it('turns the public key into the bytes the phone expects', () => {
    expect([...applicationServerKey('aGVsbG8')]).toEqual([...new TextEncoder().encode('hello')])
  })

  it('does not call an http server from an https page, and ignores an address or token that cannot be used', () => {
    expect(pushUrlIsReachable('http://170.64.193.163', 'https:')).toBe(false)
    expect(pushUrlIsReachable('https://170.64.193.163', 'https:')).toBe(true)
    expect(pushUrlIsReachable('http://170.64.193.163', 'http:')).toBe(true)
    expect(pushAuth('', 'token')).toBeNull()
    expect(pushAuth('http://170.64.193.163', '  ')).toBeNull()
    expect(pushAuth('not a server', 'token')).toBeNull()
    expect(pushAuth('http://170.64.193.163/', ' token ')).toEqual({
      baseUrl: 'http://170.64.193.163',
      token: 'token',
    })
    expect(pageOrigin('https://smurfworks.github.io/dosage/')).toBe('https://smurfworks.github.io')
    expect(pageOrigin('http://localhost:5173/')).toBe('http://localhost:5173')
  })

  it('accepts a reminder server when the token is known, and says when it is not', async () => {
    const fetchImpl = (async () => response(200, { devices: [] })) as typeof fetch
    await expect(checkPushConnection(auth, fetchImpl)).resolves.toEqual({ ok: true })

    const rejected = (async () => response(401, { message: 'Unknown app token.' })) as typeof fetch
    await expect(checkPushConnection(auth, rejected)).resolves.toEqual({
      ok: false,
      message: 'That reminder server token was not accepted.',
    })

    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(checkPushConnection(auth, offline)).resolves.toEqual({
      ok: false,
      message: 'Dosage Helper could not reach that reminder server.',
    })
  })

  it('replaces the booked reminders, drops waiting ones that no longer apply, and keeps ones already sent or skipped', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    const wanted: BookedNotification[] = [
      {
        key: 'expiry',
        deliverAt: '2026-10-12T16:00:00.000Z',
        title: 'Time to update your target',
        body: 'Your last bolus should be wearing off - please test again and update your target.',
        tag: 'target-expiry',
        url: 'https://smurfworks.github.io/dosage/',
        icon: 'https://smurfworks.github.io/dosage/icons/icon-192.png',
      },
      {
        key: 'time-2026-10-08-09:00',
        deliverAt: '2026-10-08T16:00:00.000Z',
        title: 'No active target',
        body: "You haven't logged a target in the last 4 hours. Open Dosage Helper to check in.",
        tag: 'reminder-09:00',
      },
    ]
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const href = String(url)
      calls.push({ method, url: href, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'GET') return response(200, {
          notifications: [
            { key: 'expiry', status: 'pending' },
            { key: 'old', status: 'pending' },
            { key: 'sent-earlier', status: 'sent' },
            { key: 'skipped-earlier', status: 'skipped' },
          ],
        })
      return response(method === 'DELETE' ? 204 : 200, method === 'PUT' ? { key: 'ok' } : undefined)
    }) as typeof fetch

    await replaceNotifications(auth, 'device-1', wanted, fetchImpl)

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET http://push.example/api/devices/device-1/notifications',
      'DELETE http://push.example/api/devices/device-1/notifications/old',
      'PUT http://push.example/api/devices/device-1/notifications/expiry',
      'PUT http://push.example/api/devices/device-1/notifications/time-2026-10-08-09%3A00',
    ])
    expect(calls[2].body).toMatchObject({
      deliver_at: '2026-10-12T16:00:00.000Z',
      title: 'Time to update your target',
      grace_minutes: 30,
      url: 'https://smurfworks.github.io/dosage/',
    })
    expect(JSON.stringify(calls[2].body)).not.toContain('glucose')
  })

  it('clears every reminder when nothing is booked', async () => {
    const methods: string[] = []
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET')
      return response(200, { deleted: 2 })
    }) as typeof fetch

    await replaceNotifications(auth, 'device-1', [], fetchImpl)

    expect(methods).toEqual(['DELETE'])
  })

  it('registers this phone with its timezone, and updates that timezone without a new subscription', async () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    })
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.stubGlobal('PushManager', class PushManager {})
    const subscription = {
      endpoint: 'https://push.example/device',
      keys: { p256dh: 'p256', auth: 'auth' },
      toJSON() {
        return { endpoint: this.endpoint, keys: this.keys }
      },
      unsubscribe: vi.fn(async () => true),
    }
    let current: typeof subscription | null = null
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => current,
            subscribe: async () => {
              current = subscription
              return subscription
            },
          },
        }),
      },
    })
    vi.stubGlobal('window', { PushManager: class PushManager {} })

    const calls: { method: string; url: string; body?: unknown }[] = []
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (String(url).endsWith('/api/vapid-public-key')) return response(200, { publicKey: 'aGVsbG8' })
      if (method === 'POST') return response(201, { id: 'device-1' })
      return response(500)
    }) as typeof fetch

    await expect(ensurePushDevice(auth, 'Pacific/Auckland', fetchImpl)).resolves.toBe('device-1')
    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST'])
    expect(calls[1].body).toEqual({
      timezone: 'Pacific/Auckland',
      subscription: { endpoint: 'https://push.example/device', keys: { p256dh: 'p256', auth: 'auth' } },
    })
    expect(subscription.unsubscribe).not.toHaveBeenCalled()

    calls.length = 0
    await expect(ensurePushDevice(auth, 'America/Los_Angeles', fetchImpl)).resolves.toBe('device-1')
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'http://push.example/api/devices',
        body: {
          timezone: 'America/Los_Angeles',
          subscription: { endpoint: 'https://push.example/device', keys: { p256dh: 'p256', auth: 'auth' } },
        },
      },
    ])
    expect(subscription.unsubscribe).not.toHaveBeenCalled()

    calls.length = 0
    await expect(ensurePushDevice(auth, 'America/Los_Angeles', fetchImpl)).resolves.toBe('device-1')
    expect(calls).toEqual([])
  })

  it('says when the reminder server does not know the timezone', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.stubGlobal('PushManager', class PushManager {})
    vi.stubGlobal('window', { PushManager: class PushManager {} })
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => ({ toJSON: () => ({ endpoint: 'https://push.example/device' }) }),
          },
        }),
      },
    })
    const fetchImpl = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/api/vapid-public-key')) return response(200, { publicKey: 'aGVsbG8' })
      return response(422, { message: 'Use a timezone name such as America/Los_Angeles.' })
    }) as typeof fetch

    await expect(ensurePushDevice(auth, 'Not/Azone', fetchImpl)).rejects.toThrow(
      'Choose a timezone the reminder server knows.',
    )
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
