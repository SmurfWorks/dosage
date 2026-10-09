// Loaded into the generated service worker. Tapping a reminder brings Dosage Helper to the front, or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const app = windows.find((client) => new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname))
      return app ? app.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
