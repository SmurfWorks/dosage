import { appleHandheld, currentBrowser } from './device'
import { browserTimeZone, loadLog } from './log'
import { checkPushConnection, ensurePushDevice, forgetPushDevice, pageOrigin, pushAuth, pushUrlIsReachable, replaceNotifications, storedPushDeviceId, type BookedNotification, type PushAuth } from './push'
import {
  activeHours,
  DEFAULT_REMINDER_SETTINGS,
  describeNextReminder,
  dueReminders,
  EMPTY_REMINDER_LOG,
  nextReminder,
  normaliseTimes,
  parseReminderLog,
  parseReminderSettings,
  scheduledReminders,
  type ReminderSettings,
} from './reminders'
import { escapeHtml } from './text'
import { chosenTimezone, supportedTimeZones, timezoneChoices } from './timezone'

const SETTINGS_KEY = 'insulin-calculator.reminders.v1'
const SENT_KEY = 'insulin-calculator.reminders-sent.v1'
const TIMEZONE_KEY = 'insulin-calculator.timezone.v1'
/** How often the booked reminders are brought in line with the clock and the log. */
const CHECK_MS = 30_000

export type RemindersView = {
  /** How long a target stays active, for the recent bolus warning. */
  activeHours(): number
  /** How long a target lasts before it expires, or null when target expiry is off. */
  expiryHours(): number | null
  /** Checks the log and reminder settings, and books the result on the reminder server. */
  check(): void
  /** Puts the settings back to their defaults, for Delete all data. */
  reset(): void
}

function element<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!
}

function read<T>(key: string, parse: (value: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key)
    return parse(raw ? JSON.parse(raw) : null)
  } catch {
    return parse(null)
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing can block storage; the settings still apply until the page closes.
  }
}

function notificationsSupported(): boolean {
  return 'Notification' in window
}

function formatClock(time: string): string {
  const [hour, minute] = time.split(':').map(Number)
  const suffix = hour < 12 ? 'am' : 'pm'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function nextWholeHour(): string {
  return `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`
}

function cleanPushUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function readTimezone(): string {
  let stored: string | null = null
  try {
    const raw = localStorage.getItem(TIMEZONE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    stored = typeof parsed === 'string' ? parsed : null
  } catch {
    stored = null
  }
  return chosenTimezone(stored, browserTimeZone(), supportedTimeZones())
}

export function createRemindersView(onHoursChange: () => void): RemindersView {
  const expiryEnabled = element<HTMLInputElement>('#expiry-enabled')
  const expiryHoursWrap = element<HTMLElement>('#expiry-hours-wrap')
  const expiryHours = element<HTMLSelectElement>('#expiry-hours')
  const group = element<HTMLElement>('#reminders-group')
  const timezoneSelect = element<HTMLSelectElement>('#timezone')
  const notify = element<HTMLInputElement>('#notify-enabled')
  const status = element<HTMLElement>('#notify-status')
  const options = element<HTMLElement>('#reminder-options')
  const server = element<HTMLElement>('#reminder-server')
  const rules = element<HTMLElement>('#reminder-rules')
  const pushError = element<HTMLElement>('#push-error')
  const pushOrigin = element<HTMLElement>('#push-origin')
  const remindExpiry = element<HTMLInputElement>('#remind-expiry')
  const pushUrl = element<HTMLInputElement>('#push-url')
  const pushToken = element<HTMLInputElement>('#push-token')
  const timesList = element<HTMLUListElement>('#reminder-times')
  const addTime = element<HTMLButtonElement>('#reminder-add')
  const nextText = element<HTMLElement>('#reminder-next')

  let settings = read(SETTINGS_KEY, parseReminderSettings)
  let timezone = readTimezone()
  const openedAuth = pushAuth(settings.pushUrl, settings.pushToken)
  let remoteReady = openedAuth !== null && storedPushDeviceId(openedAuth) !== null
  let remoteFailed = false
  let connectionError = ''
  let lastBooked = ''
  let booking: Promise<void> = Promise.resolve()

  function save(next: ReminderSettings) {
    const hoursChanged =
      activeHours(next) !== activeHours(settings) || next.expiryEnabled !== settings.expiryEnabled
    const previousAuth = pushAuth(settings.pushUrl, settings.pushToken)
    const nextSettings = {
      ...next,
      times: normaliseTimes(next.times),
      pushUrl: cleanPushUrl(next.pushUrl),
      pushToken: next.pushToken.trim(),
    }
    const nextAuth = pushAuth(nextSettings.pushUrl, nextSettings.pushToken)
    const serverChanged = previousAuth?.baseUrl !== nextAuth?.baseUrl || previousAuth?.token !== nextAuth?.token
    if (serverChanged) {
      remoteReady = false
      remoteFailed = false
      connectionError = ''
      lastBooked = ''
    }
    settings = nextSettings
    write(SETTINGS_KEY, settings)
    paint()
    if (hoursChanged) onHoursChange()
    if (!serverChanged) {
      check()
      return
    }
    lastBooked = ''
    booking = booking
      .then(() => releaseServer(previousAuth))
      .then(() => syncBookings())
      .catch(markFailed)
  }

  function localConnectionError(): string {
    if (!settings.notify || !notificationsSupported() || Notification.permission !== 'granted') return ''
    const hasUrl = settings.pushUrl !== ''
    const hasToken = settings.pushToken !== ''
    if (!hasUrl && !hasToken) return ''
    if (!hasUrl || !hasToken) return 'Enter your reminder server address and token.'
    const auth = pushAuth(settings.pushUrl, settings.pushToken)
    if (!auth) return 'Enter a reminder server address like https://example.com.'
    if (!pushUrlIsReachable(auth.baseUrl, location.protocol)) {
      return 'Use an https address. This page cannot reach an http reminder server.'
    }
    return ''
  }

  function shownError(): string {
    return localConnectionError() || (remoteFailed ? connectionError : '')
  }

  function statusText(): string {
    if (!notificationsSupported()) {
      return appleHandheld(currentBrowser())
        ? 'To get reminders on an iPhone or iPad, add Dosage Helper to your Home Screen and open it from there.'
        : "This browser can't show notifications."
    }
    if (Notification.permission === 'denied') {
      return 'Notifications are blocked for Dosage Helper. Allow them in your browser settings, then turn this on again.'
    }
    if (!settings.notify || Notification.permission !== 'granted') {
      return 'Turn on Send reminders to book them on your reminder server.'
    }
    if (!settings.pushUrl || !settings.pushToken) {
      return 'Enter your reminder server address and token. Reminders are sent from that server.'
    }
    if (shownError()) return ''
    if (remoteReady) return 'Reminders are sent from your reminder server, including while Dosage Helper is closed.'
    return 'Dosage Helper is checking that reminder server.'
  }

  function paint() {
    expiryEnabled.checked = settings.expiryEnabled
    expiryHours.value = String(settings.expiryHours)
    expiryHoursWrap.hidden = !settings.expiryEnabled
    group.hidden = !settings.expiryEnabled
    const canNotify = notificationsSupported() && Notification.permission !== 'denied'
    notify.disabled = !notificationsSupported()
    notify.checked = settings.notify && canNotify && Notification.permission === 'granted'
    status.textContent = statusText()
    status.hidden = status.textContent === ''
    options.hidden = !notify.checked
    const error = shownError()
    pushError.hidden = error === ''
    pushError.textContent = error
    server.classList.toggle('is-invalid', error !== '')
    pushUrl.setAttribute('aria-invalid', error === '' ? 'false' : 'true')
    pushToken.setAttribute('aria-invalid', error === '' ? 'false' : 'true')
    rules.hidden = !notify.checked || !remoteReady
    if (!rules.hidden) paintNext()
    pushOrigin.textContent = pageOrigin(location.href)
    if (timezoneSelect.options.length === 0) {
      for (const choice of timezoneChoices(supportedTimeZones(), new Date())) {
        const option = document.createElement('option')
        option.value = choice.id
        option.textContent = choice.label
        timezoneSelect.append(option)
      }
    }
    if (document.activeElement !== timezoneSelect) timezoneSelect.value = timezone
    remindExpiry.checked = settings.remindOnExpiry
    if (document.activeElement !== pushUrl) pushUrl.value = settings.pushUrl
    if (document.activeElement !== pushToken) pushToken.value = settings.pushToken
    timesList.innerHTML = settings.times
      .map(
        (time) =>
          `<li class="reminder-time"><div class="field"><input type="time" value="${escapeHtml(time)}" data-time="${escapeHtml(time)}" aria-label="Reminder time" /></div><button type="button" class="log-remove" data-remove-time="${escapeHtml(time)}" aria-label="Remove the ${escapeHtml(formatClock(time))} reminder">×</button></li>`,
      )
      .join('')
  }

  /** The same reminders that are booked on the server, so the message matches what will arrive. */
  function upcomingReminders(now: Date) {
    return scheduledReminders(loadLog(), settings, read(SENT_KEY, parseReminderLog), now)
  }

  function paintNext() {
    const now = new Date()
    nextText.textContent = describeNextReminder(nextReminder(upcomingReminders(now), now), now, browserTimeZone())
  }

  function showConnection(ready: boolean, error = '') {
    const same = remoteReady === ready && remoteFailed === (error !== '') && connectionError === error
    remoteReady = ready
    remoteFailed = error !== ''
    connectionError = error
    if (!same) paint()
  }

  function markFailed(error?: unknown) {
    lastBooked = ''
    const message = error instanceof Error ? error.message : 'Dosage Helper could not book reminders with that server.'
    showConnection(false, message)
  }

  async function releaseServer(auth: PushAuth | null) {
    if (!auth) return
    const deviceId = storedPushDeviceId(auth)
    forgetPushDevice()
    if (!deviceId) return
    try {
      await replaceNotifications(auth, deviceId, [])
    } catch {
      // The previous server may already be gone. This phone stops using it either way.
    }
  }

  async function syncBookings() {
    const auth = pushAuth(settings.pushUrl, settings.pushToken)
    if (!settings.notify) {
      if (auth && pushUrlIsReachable(auth.baseUrl, location.protocol)) {
        const deviceId = storedPushDeviceId(auth)
        if (deviceId) {
          await ensurePushDevice(auth, timezone)
          await replaceNotifications(auth, deviceId, [])
        }
      }
      lastBooked = ''
      showConnection(false)
      return
    }
    const local = localConnectionError()
    if (local) {
      showConnection(false, local)
      return
    }
    if (!auth || !pushUrlIsReachable(auth.baseUrl, location.protocol)) {
      showConnection(false)
      return
    }
    const connection = await checkPushConnection(auth)
    if (!connection.ok) {
      showConnection(false, connection.message)
      return
    }
    showConnection(true)
    paintNext()
    const links = {
      url: new URL('./', document.baseURI).href,
      icon: new URL('icons/icon-192.png', document.baseURI).href,
    }
    const wanted: BookedNotification[] = upcomingReminders(new Date()).map(
      (item) => ({ ...item, ...links }),
    )
    let deviceId: string | null
    try {
      deviceId = await ensurePushDevice(auth, timezone)
    } catch (error) {
      lastBooked = ''
      showConnection(true, error instanceof Error ? error.message : 'Dosage Helper could not book reminders with that server.')
      return
    }
    if (!deviceId) return
    const plan = JSON.stringify(wanted)
    if (plan === lastBooked) return
    try {
      await replaceNotifications(auth, deviceId, wanted)
    } catch (error) {
      lastBooked = ''
      showConnection(true, error instanceof Error ? error.message : 'Dosage Helper could not book reminders with that server.')
      return
    }
    lastBooked = plan
    showConnection(true)
  }

  function check() {
    booking = booking.then(() => syncBookings()).catch(markFailed)
  }

  expiryEnabled.addEventListener('change', () => save({ ...settings, expiryEnabled: expiryEnabled.checked }))
  expiryHours.addEventListener('change', () => save({ ...settings, expiryHours: Number(expiryHours.value) }))
  remindExpiry.addEventListener('change', () => save({ ...settings, remindOnExpiry: remindExpiry.checked }))

  function saveServer() {
    save({ ...settings, pushUrl: pushUrl.value, pushToken: pushToken.value })
  }

  pushUrl.addEventListener('change', saveServer)
  pushToken.addEventListener('change', saveServer)
  timezoneSelect.addEventListener('change', () => {
    timezone = timezoneSelect.value
    write(TIMEZONE_KEY, timezone)
    check()
  })

  notify.addEventListener('change', async () => {
    if (!notify.checked) {
      save({ ...settings, notify: false })
      return
    }
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied')
    // Turning reminders on starts afresh: anything already due is marked as dealt with so it doesn't arrive at once,
    // without counting as a sent expiry reminder that would hold back timed ones.
    if (permission === 'granted') {
      const fresh = dueReminders(loadLog(), { ...settings, notify: true }, EMPTY_REMINDER_LOG, new Date())
      write(SENT_KEY, { ...fresh.sent, expirySentAt: null })
    }
    save({ ...settings, notify: permission === 'granted' })
  })

  addTime.addEventListener('click', () => {
    let time = nextWholeHour()
    while (settings.times.includes(time)) time = `${String((Number(time.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`
    save({ ...settings, times: [...settings.times, time] })
    timesList.querySelector<HTMLInputElement>(`input[data-time="${time}"]`)?.focus()
  })

  timesList.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (!input.dataset.time) return
    if (!input.value) {
      paint()
      return
    }
    save({ ...settings, times: settings.times.map((time) => (time === input.dataset.time ? input.value : time)) })
  })

  timesList.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove-time]')
    if (!button) return
    save({ ...settings, times: settings.times.filter((time) => time !== button.dataset.removeTime) })
  })

  paint()
  check()
  window.setInterval(check, CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      paint()
      check()
    }
  })

  return {
    activeHours: () => activeHours(settings),
    expiryHours: () => (settings.expiryEnabled ? settings.expiryHours : null),
    check,
    reset() {
      try {
        localStorage.removeItem(TIMEZONE_KEY)
      } catch {
        // The select still returns to the timezone on this device until the page closes.
      }
      timezone = readTimezone()
      write(SENT_KEY, EMPTY_REMINDER_LOG)
      save({ ...DEFAULT_REMINDER_SETTINGS })
    },
  }
}
