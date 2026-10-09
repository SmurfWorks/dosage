const SHOW_MS = 3000
/** Long enough to read the message and reach the button. */
const SHOW_WITH_ACTION_MS = 6000
const HIDE_MS = 400

export type ToastAction = { label: string; run(): void }

export type ShowToast = (message: string, action?: ToastAction) => void

/** A short message that slides down from the top and leaves on its own, optionally with one button. */
export function createToast(toast: HTMLElement): ShowToast {
  let timer = 0

  function hide() {
    window.clearTimeout(timer)
    toast.classList.remove('is-visible')
    timer = window.setTimeout(() => toast.hidePopover(), HIDE_MS)
  }

  return (message, action) => {
    window.clearTimeout(timer)
    toast.replaceChildren()
    const text = document.createElement('span')
    text.className = 'toast-text'
    text.textContent = message
    toast.append(text)
    if (action) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'toast-action'
      button.textContent = action.label
      button.addEventListener('click', () => {
        hide()
        action.run()
      })
      toast.append(button)
    }
    toast.classList.toggle('has-action', Boolean(action))
    if (toast.matches(':popover-open')) toast.hidePopover()
    toast.classList.remove('is-visible')
    toast.showPopover()
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-visible')))
    timer = window.setTimeout(hide, action ? SHOW_WITH_ACTION_MS : SHOW_MS)
  }
}
