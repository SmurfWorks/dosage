const SHOW_MS = 3000
const HIDE_MS = 400

/** A short message that slides down from the top and leaves on its own. */
export function createToast(toast: HTMLElement): (message: string) => void {
  let timer = 0
  return (message: string) => {
    window.clearTimeout(timer)
    toast.textContent = message
    if (toast.matches(':popover-open')) toast.hidePopover()
    toast.classList.remove('is-visible')
    toast.showPopover()
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-visible')))
    timer = window.setTimeout(() => {
      toast.classList.remove('is-visible')
      timer = window.setTimeout(() => toast.hidePopover(), HIDE_MS)
    }, SHOW_MS)
  }
}
