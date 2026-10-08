/**
 * Full-page screens that slide in over home or over each other. Each screen is an `.app-view`; the one it slides
 * over is parked off to the left while it is open, and comes back when it is dismissed.
 */
export type ViewStack = {
  present(view: HTMLElement): void
  dismiss(view: HTMLElement): void
}

export type ViewStackOptions = {
  home: HTMLElement
  /** Every screen, top-most first, so Escape closes the one in front. */
  views: HTMLElement[]
  /** The screen a view slides over. */
  under(view: HTMLElement): HTMLElement
  /** Runs whenever a view opens or closes, to update inert layers and buttons. */
  onChange(): void
  /** Runs once a view has finished arriving or leaving. */
  onSettle(): void
}

const SLIDE_MS = 320

export function viewIsOpen(view: HTMLElement): boolean {
  return view.classList.contains('is-open')
}

export function viewIsLeaving(view: HTMLElement): boolean {
  return view.classList.contains('is-leaving')
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function createViewStack(options: ViewStackOptions): ViewStack {
  const { home, views, under, onChange, onSettle } = options
  const epochs = new WeakMap<HTMLElement, number>()
  const returnFocus = new WeakMap<HTMLElement, HTMLElement>()
  const sliding = new Map<HTMLElement, () => void>()

  function nextEpoch(view: HTMLElement): number {
    const epoch = (epochs.get(view) ?? 0) + 1
    epochs.set(view, epoch)
    return epoch
  }

  // Vertical scrolling is held still while a screen slides, so a flick in progress cannot move the page.
  function holdScrollWhileSliding(view: HTMLElement) {
    sliding.get(view)?.()
    const settle = (event?: TransitionEvent) => {
      if (event && (event.target !== view || event.propertyName !== 'transform')) return
      view.removeEventListener('transitionend', settle)
      window.clearTimeout(timer)
      sliding.delete(view)
      document.documentElement.classList.toggle('is-sliding', sliding.size > 0)
    }
    const timer = window.setTimeout(settle, SLIDE_MS)
    view.addEventListener('transitionend', settle)
    sliding.set(view, settle)
    document.documentElement.classList.add('is-sliding')
  }

  function present(view: HTMLElement) {
    if (
      viewIsOpen(view) &&
      view.classList.contains('is-active') &&
      !viewIsLeaving(view) &&
      !view.classList.contains('is-parked')
    ) {
      return
    }
    const from = under(view)
    const epoch = nextEpoch(view)
    const opener = document.activeElement
    if (opener instanceof HTMLElement && opener !== view && !view.contains(opener)) returnFocus.set(view, opener)
    view.classList.remove('is-leaving', 'is-parked', 'is-active')
    view.hidden = false
    view.classList.add('is-open')
    view.scrollTop = 0
    onChange()
    const reveal = () => {
      if (epochs.get(view) !== epoch) return
      from.classList.add('is-parked')
      view.classList.add('is-active')
      view.focus({ preventScroll: true })
      onSettle()
    }
    if (reducedMotion()) {
      reveal()
      return
    }
    holdScrollWhileSliding(view)
    requestAnimationFrame(() => {
      requestAnimationFrame(reveal)
    })
  }

  function dismiss(view: HTMLElement) {
    if (!viewIsOpen(view) || viewIsLeaving(view)) return
    const epoch = nextEpoch(view)
    const back = under(view)
    const finish = () => {
      if (epochs.get(view) !== epoch || !viewIsOpen(view)) return
      view.classList.remove('is-active', 'is-leaving', 'is-open', 'is-parked')
      view.hidden = true
      onChange()
      requestAnimationFrame(onSettle)
      const target = returnFocus.get(view)
      if (target?.isConnected) target.focus()
    }
    back.classList.remove('is-parked')
    if (back !== home) back.classList.add('is-active')
    if (reducedMotion()) {
      finish()
      return
    }
    view.classList.add('is-leaving')
    view.classList.remove('is-active')
    holdScrollWhileSliding(view)
    onChange()
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== view || event.propertyName !== 'transform') return
      view.removeEventListener('transitionend', onEnd)
      finish()
    }
    view.addEventListener('transitionend', onEnd)
    window.setTimeout(() => {
      view.removeEventListener('transitionend', onEnd)
      finish()
    }, SLIDE_MS)
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.querySelector('dialog:modal')) return
    const top = views.find((view) => viewIsOpen(view) && !viewIsLeaving(view))
    if (!top) return
    event.preventDefault()
    dismiss(top)
  })

  return { present, dismiss }
}
