import { describe, expect, it } from 'vitest'
import {
  appleHandheld,
  desktopSafari,
  inSafari,
  installCopy,
  installedOnIos,
  installsManually,
  type BrowserInfo,
} from './device'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneHomeScreen:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
}

function browser(userAgent: string, maxTouchPoints = 0, standalone?: boolean): BrowserInfo {
  return { userAgent, maxTouchPoints, standalone }
}

describe('device detection', () => {
  it('treats iPhone Safari and the Home Screen app as Safari', () => {
    expect(inSafari(browser(UA.iphoneSafari, 5))).toBe(true)
    expect(inSafari(browser(UA.iphoneHomeScreen, 5, true))).toBe(true)
    expect(inSafari(browser(UA.macSafari))).toBe(true)
  })

  it('does not treat Chrome or Android as Safari', () => {
    expect(inSafari(browser(UA.iphoneChrome, 5))).toBe(false)
    expect(inSafari(browser(UA.macChrome))).toBe(false)
    expect(inSafari(browser(UA.androidChrome, 5))).toBe(false)
  })

  it('knows when it is running as the installed iOS app', () => {
    expect(installedOnIos(browser(UA.iphoneHomeScreen, 5, true))).toBe(true)
    expect(installedOnIos(browser(UA.iphoneSafari, 5, false))).toBe(false)
    expect(installedOnIos(browser(UA.androidChrome, 5))).toBe(false)
  })

  it('counts an iPad asking for desktop sites as a handheld, not desktop Safari', () => {
    const ipadAsMac = browser(UA.macSafari, 5)
    expect(appleHandheld(ipadAsMac)).toBe(true)
    expect(desktopSafari(ipadAsMac)).toBe(false)
  })

  it('tells desktop Safari apart from a Mac running Chrome', () => {
    expect(desktopSafari(browser(UA.macSafari))).toBe(true)
    expect(appleHandheld(browser(UA.macSafari))).toBe(false)
    expect(desktopSafari(browser(UA.macChrome))).toBe(false)
  })

  it('gives install steps that match the browser', () => {
    expect(installCopy(browser(UA.iphoneSafari, 5))).toBe('To install, tap Share, then Add to Home Screen.')
    expect(installCopy(browser(UA.iphoneChrome, 5))).toBe('To install, tap Share, then Add to Home Screen.')
    expect(installCopy(browser(UA.macSafari))).toBe('To install, choose File, then Add to Dock.')
    expect(installCopy(browser(UA.androidChrome, 5))).toBe('Install this calculator on your home screen.')
    expect(installsManually(browser(UA.androidChrome, 5))).toBe(false)
    expect(installsManually(browser(UA.macSafari))).toBe(true)
  })
})
