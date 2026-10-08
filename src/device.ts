/** The parts of `navigator` that tell Safari, iPhones and the installed app apart. */
export type BrowserInfo = {
  userAgent: string
  maxTouchPoints: number
  /** Only iOS sets this, and only to true inside an app added to the Home Screen. */
  standalone?: boolean
}

const OTHER_ENGINES = /chrome|chromium|crios|fxios|edg|android/i

export function currentBrowser(): BrowserInfo {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  }
}

function safariEngine(browser: BrowserInfo): boolean {
  return /safari/i.test(browser.userAgent) && !OTHER_ENGINES.test(browser.userAgent)
}

/** Safari itself, or the iOS Home Screen app, which reports no browser name. */
export function inSafari(browser: BrowserInfo): boolean {
  return browser.standalone === true || safariEngine(browser)
}

export function installedOnIos(browser: BrowserInfo): boolean {
  return browser.standalone === true
}

/** An iPhone, iPod or iPad, including an iPad that asks for desktop sites and so reports a Mac. */
export function appleHandheld(browser: BrowserInfo): boolean {
  if (/iphone|ipad|ipod/i.test(browser.userAgent)) return true
  return safariEngine(browser) && browser.maxTouchPoints > 1
}

export function desktopSafari(browser: BrowserInfo): boolean {
  return safariEngine(browser) && !appleHandheld(browser)
}

/** Safari has no install prompt, so its users are told where to install from. */
export function installsManually(browser: BrowserInfo): boolean {
  return appleHandheld(browser) || desktopSafari(browser)
}

export function installCopy(browser: BrowserInfo): string {
  if (appleHandheld(browser)) return 'To install, tap Share, then Add to Home Screen.'
  if (desktopSafari(browser)) return 'To install, choose File, then Add to Dock.'
  return 'Install this calculator on your home screen.'
}
