/** How far content has to run under an island before the island casts a shadow over it. */
const COVERING_PX = 28

/**
 * The sticky target and save islands at the foot of the calculator and the add-entry form. Each is marked
 * `is-covering` while content runs underneath it.
 */
export function watchSaveIslands(observed: HTMLElement[], scrollers: HTMLElement[]): () => void {
  const islands = document.querySelectorAll<HTMLElement>('.log-save')

  function paint() {
    for (const island of islands) {
      island.classList.toggle('is-covering', coveredByIsland(island) > COVERING_PX)
    }
  }

  paint()
  window.addEventListener('scroll', paint, { passive: true })
  document.addEventListener('scroll', paint, { capture: true, passive: true })
  window.addEventListener('resize', paint)
  for (const scroller of scrollers) scroller.addEventListener('scroll', paint, { passive: true })
  for (const element of observed) new ResizeObserver(paint).observe(element)
  return paint
}

function coveredByIsland(island: HTMLElement): number {
  const scroller = island.previousElementSibling
  if (
    scroller instanceof HTMLElement &&
    scroller.classList.contains('log-add-body') &&
    window.matchMedia('(max-width: 520px)').matches
  ) {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  }
  const top = island.getBoundingClientRect().top
  let covered = 0
  const parent = island.parentElement
  if (!parent) return 0
  for (const child of parent.children) {
    if (child === island) break
    covered = Math.max(covered, child.getBoundingClientRect().bottom - top)
  }
  return covered
}
