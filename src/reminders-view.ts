import { appleHandheld, currentBrowser } from './device'
import { browserTimeZone, formatLogTime, loadLog } from './log'
import {
  activeHours,
  DEFAULT_REMINDER_SETTINGS,
  dueReminders,
  EMPTY_REMINDER_LOG,
  normaliseTimes,
  parseReminderLog,
  parseReminderSettings,
  type Reminder,
  type ReminderSettings,
} from './reminders'
import { escapeHtml } from './text'

const SETTINGS_KEY = 'insulin-calculator.reminders.v1'
const SENT_KEY = 'insulin-calculator.reminders-sent.v1'
/** Browsers slow timers in the background, so this is how often reminders are checked at best. */
const CHECK_MS = 30_000

export type RemindersView = {
  /** How long a target stays active, for the recent bolus warning. */
  activeHours(): number
  /** Checks for due reminders now, such as after a log entry is saved. */
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

async function show(reminder: Reminder) {
  const options: NotificationOptions = { body: reminder.body, tag: reminder.tag, icon: 'icons/icon-192.png' }
  // Android only shows notifications through the service worker; elsewhere a plain notification works too.
  const registration = await navigator.serviceWorker?.getRegistration()
  if (registration) {
    await registration.showNotification(reminder.title, options)
    return
  }
  const notification = new Notification(reminder.title, options)
  notification.addEventListener('click', () => {
    window.focus()
    notification.close()
  })
}

export function createRemindersView(onHoursChange: () => void): RemindersView {
  const expiryEnabled = element<HTMLInputElement>('#expiry-enabled')
  const expiryHoursWrap = element<HTMLElement>('#expiry-hours-wrap')
  const expiryHours = element<HTMLSelectElement>('#expiry-hours')
  const group = element<HTMLElement>('#reminders-group')
  const notify = element<HTMLInputElement>('#notify-enabled')
  const status = element<HTMLElement>('#notify-status')
  const options = element<HTMLElement>('#reminder-options')
  const remindExpiry = element<HTMLInputElement>('#remind-expiry')
  const timesList = element<HTMLUListElement>('#reminder-times')
  const addTime = element<HTMLButtonElement>('#reminder-add')

  let settings = read(SETTINGS_KEY, parseReminderSettings)

  function save(next: ReminderSettings) {
    const hoursChanged = activeHours(next) !== activeHours(settings)
    settings = { ...next, times: normaliseTimes(next.times) }
    write(SETTINGS_KEY, settings)
    paint()
    if (hoursChanged) onHoursChange()
    check()
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
    return 'Reminders arrive while Dosage Helper is open or still running in the background.'
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
    options.hidden = !notify.checked
    remindExpiry.checked = settings.remindOnExpiry
    timesList.innerHTML = settings.times
      .map(
        (time) =>
          `<li class="reminder-time"><div class="field"><input type="time" value="${escapeHtml(time)}" data-time="${escapeHtml(time)}" aria-label="Reminder time" /></div><button type="button" class="log-remove" data-remove-time="${escapeHtml(time)}" aria-label="Remove the ${escapeHtml(formatClock(time))} reminder">×</button></li>`,
      )
      .join('')
  }

  function check() {
    const sent = read(SENT_KEY, parseReminderLog)
    const result = dueReminders(loadLog(), settings, sent, new Date(), (entry) =>
      formatLogTime(entry.at, entry.timeZone || browserTimeZone()),
    )
    if (JSON.stringify(result.sent) !== JSON.stringify(sent)) write(SENT_KEY, result.sent)
    if (!notificationsSupported() || Notification.permission !== 'granted') return
    for (const reminder of result.reminders) void show(reminder).catch(() => {})
  }

  expiryEnabled.addEventListener('change', () => save({ ...settings, expiryEnabled: expiryEnabled.checked }))
  expiryHours.addEventListener('change', () => save({ ...settings, expiryHours: Number(expiryHours.value) }))
  remindExpiry.addEventListener('change', () => save({ ...settings, remindOnExpiry: remindExpiry.checked }))

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
      const fresh = dueReminders(loadLog(), { ...settings, notify: true }, EMPTY_REMINDER_LOG, new Date(), () => '')
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
    check,
    reset() {
      write(SENT_KEY, EMPTY_REMINDER_LOG)
      save({ ...DEFAULT_REMINDER_SETTINGS })
    },
  }
}
