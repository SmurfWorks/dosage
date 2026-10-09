import {
  createDish,
  DISH_GRAMS_MAX,
  findDishes,
  formatDishGrams,
  loadDishes,
  recordDishUse,
  saveDishes,
  upsertDish,
  type Dish,
} from './dishes'
import { escapeHtml, parseDecimal } from './text'
import type { ShowToast } from './toast'

/** The form a picked dish fills in, and the screen Dishes slides over. */
export type DishTarget = {
  view: HTMLElement
  carbs: HTMLInputElement
  fibre: HTMLInputElement
  include: HTMLInputElement
}

export type DishesViewOptions = {
  present(view: HTMLElement): void
  dismiss(view: HTMLElement): void
  showFibre(): boolean
  paintNetCarbs(el: HTMLElement, carbs: number, fibre: number): void
  /** Handles a click on a −/+ stepper button inside the form. */
  stepFromButton(event: Event): void
  sizeStepInputs(): void
  showToast: ShowToast
}

export type DishesView = {
  view: HTMLElement
  /** The form the screen was last opened from. */
  target(): DishTarget
  open(target: DishTarget): void
  /** Repaints after dishes change outside the screen, such as a restore. */
  paint(): void
  /** Shows or hides the fibre field to match the routine. */
  paintFibre(): void
}

function element<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!
}

function gramsText(grams: number): string {
  return grams > 0 ? String(Number(grams.toFixed(2))) : ''
}

function readDishGrams(input: HTMLInputElement): number | null {
  if (!input.value.trim()) return 0
  const grams = parseDecimal(input.value)
  return grams === null || grams > DISH_GRAMS_MAX ? null : grams
}

export function createDishesView(options: DishesViewOptions, initialTarget: DishTarget): DishesView {
  const view = element<HTMLElement>('#dishes')
  const list = element<HTMLUListElement>('#dish-list')
  const empty = element<HTMLElement>('#dish-empty')
  const form = element<HTMLFormElement>('#dish-form')
  const nameInput = element<HTMLInputElement>('#dish-name')
  const carbsInput = element<HTMLInputElement>('#dish-carbs')
  const fibreInput = element<HTMLInputElement>('#dish-fibre')
  const fibreWrap = element<HTMLElement>('#dish-fibre-wrap')
  const error = element<HTMLElement>('#dish-error')
  const finder = element<HTMLElement>('#dish-finder')
  const search = element<HTMLInputElement>('#dish-search')
  const formOpen = element<HTMLButtonElement>('#dish-form-open')
  const formCancel = element<HTMLButtonElement>('#dish-form-cancel')
  const netCarbs = element<HTMLElement>('#dish-net-carbs')

  let target = initialTarget
  /** Whether Add a dish is open while there are dishes; with none, it is always open. */
  let formShown = false

  function paint() {
    const dishes = loadDishes()
    const query = search.value.trim()
    const matches = findDishes(dishes, query)
    finder.hidden = dishes.length === 0
    list.hidden = matches.length === 0
    list.innerHTML = matches
      .map(
        (dish) =>
          `<li class="dish"><button type="button" class="dish-pick" data-dish="${escapeHtml(dish.id)}"><span class="dish-name">${escapeHtml(dish.name)}</span><span class="dish-grams-text">${escapeHtml(formatDishGrams(dish))}</span></button><button type="button" class="log-remove" data-dish-remove="${escapeHtml(dish.id)}" aria-label="Remove ${escapeHtml(dish.name)}">×</button></li>`,
      )
      .join('')
    empty.hidden = matches.length > 0
    empty.textContent =
      dishes.length === 0 ? 'No dishes yet. Add the ones you eat often below.' : `No dishes match “${query}”.`
    const shown = dishes.length === 0 || formShown
    form.hidden = !shown
    formOpen.hidden = shown
    formOpen.setAttribute('aria-expanded', String(shown))
    formCancel.hidden = dishes.length === 0
  }

  function paintNetCarbs() {
    const fibre = options.showFibre() ? (readDishGrams(fibreInput) ?? 0) : 0
    options.paintNetCarbs(netCarbs, readDishGrams(carbsInput) ?? 0, fibre)
  }

  function paintFibre() {
    fibreWrap.hidden = !options.showFibre()
    paintNetCarbs()
  }

  function showForm(shown: boolean) {
    formShown = shown
    error.textContent = ''
    paint()
  }

  function open(next: DishTarget) {
    target = next
    const carbs = parseDecimal(next.carbs.value) ?? 0
    const fibre = options.showFibre() ? (parseDecimal(next.fibre.value) ?? 0) : 0
    nameInput.value = ''
    carbsInput.value = next.include.checked ? gramsText(carbs) : ''
    fibreInput.value = next.include.checked ? gramsText(fibre) : ''
    search.value = ''
    showForm(false)
    paintNetCarbs()
    options.present(view)
    options.sizeStepInputs()
  }

  function pick(dish: Dish) {
    const { carbs, fibre, include } = target
    saveDishes(recordDishUse(loadDishes(), dish.id))
    carbs.value = String(dish.carbsGrams)
    fibre.value = String(dish.fibreGrams)
    if (!include.checked) {
      include.checked = true
      include.dispatchEvent(new Event('change', { bubbles: true }))
    }
    carbs.dispatchEvent(new Event('input', { bubbles: true }))
    fibre.dispatchEvent(new Event('input', { bubbles: true }))
    options.dismiss(view)
  }

  form.addEventListener('click', options.stepFromButton)
  form.addEventListener('input', paintNetCarbs)
  search.addEventListener('input', paint)
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') search.blur()
  })

  formOpen.addEventListener('click', () => {
    // A search that found nothing is most likely the name of the dish to add.
    if (list.hidden && search.value.trim()) nameInput.value = search.value.trim()
    showForm(true)
    nameInput.focus()
  })
  formCancel.addEventListener('click', () => {
    showForm(false)
    formOpen.focus()
  })
  element<HTMLButtonElement>('#dishes-close').addEventListener('click', () => options.dismiss(view))

  list.addEventListener('click', (event) => {
    const clicked = event.target as Element
    const remove = clicked.closest<HTMLButtonElement>('[data-dish-remove]')
    if (remove) {
      const removed = loadDishes().find((dish) => dish.id === remove.dataset.dishRemove)
      if (!removed) return
      saveDishes(loadDishes().filter((dish) => dish.id !== removed.id))
      paint()
      options.showToast(`Removed ${removed.name}.`, {
        label: 'Undo',
        run: () => {
          const dishes = loadDishes()
          if (dishes.some((dish) => dish.id === removed.id)) return
          saveDishes([...dishes, removed])
          paint()
        },
      })
      return
    }
    const button = clicked.closest<HTMLButtonElement>('[data-dish]')
    const dish = loadDishes().find((item) => item.id === button?.dataset.dish)
    if (dish) pick(dish)
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = nameInput.value.trim()
    const carbs = readDishGrams(carbsInput)
    const fibre = options.showFibre() ? readDishGrams(fibreInput) : 0
    if (!name) {
      error.textContent = 'Give the dish a name.'
      nameInput.focus()
      return
    }
    if (carbs === null || fibre === null) {
      error.textContent = `Enter grams from 0 to ${DISH_GRAMS_MAX}.`
      ;(carbs === null ? carbsInput : fibreInput).focus()
      return
    }
    const dish = createDish(name, carbs, fibre)
    if (!dish) {
      error.textContent = 'That dish could not be saved.'
      return
    }
    saveDishes(upsertDish(loadDishes(), dish))
    nameInput.value = ''
    carbsInput.value = ''
    fibreInput.value = ''
    search.value = ''
    paintNetCarbs()
    showForm(false)
    nameInput.blur()
    carbsInput.blur()
    fibreInput.blur()
  })

  return { view, target: () => target, open, paint, paintFibre }
}
