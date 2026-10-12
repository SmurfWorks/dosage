import { describe, expect, it } from 'vitest'
import { applicationServerKey, pushAuth, pushUrlIsReachable, replaceNotifications, type BookedNotification } from './push'

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
  })

  it('replaces the booked reminders and drops ones that no longer apply', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = []
    const wanted: BookedNotification[] = [
      {
        key: 'expiry',
        deliverAt: '2026-10-12T16:00:00.000Z',
        title: 'Your target has expired',
        body: "It's been 4 hours since your 12:00 pm entry, so that bolus could be wearing off.",
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
      if (method === 'GET') return response(200, { notifications: [{ key: 'expiry' }, { key: 'old' }] })
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
      title: 'Your target has expired',
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
})
