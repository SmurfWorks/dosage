// Loaded into the generated service worker. A push from the reminder server is shown even when Dosage Helper
// is closed. Tapping a reminder brings Dosage Helper to the front, or opens it.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  if (!data || typeof data !== 'object') data = {}
  const title = typeof data.title === 'string' && data.title ? data.title : 'Dosage Helper'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : 'dosage-reminder',
      icon: new URL('icons/icon-192.png', self.registration.scope).href,
      data: { url: typeof data.url === 'string' ? data.url : self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const app = windows.find((client) => new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname))
      return app ? app.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
