import {
  createDish,
  DISH_GRAMS_MAX,
  DISH_PORTIONS,
  editDish,
  findDishes,
  formatDishGrams,
  loadDishes,
  pickedGrams,
  recordDishUse,
  saveDishes,
  upsertDish,
  type Dish,
  type DishPortion,
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
  const formTitle = element<HTMLElement>('#dish-form-title')
  const formHint = element<HTMLElement>('#dish-form-hint')
  const submit = element<HTMLButtonElement>('#dish-add')
  const pickOptions = element<HTMLElement>('#dish-pick-options')
  const modeRow = element<HTMLElement>('#dish-mode-row')
  const addLabel = element<HTMLElement>('#dish-add-label')
  const modeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="dish-mode"]')]
  const portionInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="dish-portion"]')]

  let target = initialTarget
  /** Whether Add a dish is open while there are dishes; with none, it is always open. */
  let formShown = false
  /** The dish the form is editing, or null when it adds a new one. */
  let editingId: string | null = null

  /** What the form being filled in already holds, counting nothing when its carbs are switched off. */
  function currentGrams() {
    if (!target.include.checked) return { carbsGrams: 0, fibreGrams: 0 }
    return {
      carbsGrams: parseDecimal(target.carbs.value) ?? 0,
      fibreGrams: options.showFibre() ? (parseDecimal(target.fibre.value) ?? 0) : 0,
    }
  }

  function chosenPortion(): DishPortion {
    const value = Number(portionInputs.find((input) => input.checked)?.value)
    return DISH_PORTIONS.find((portion) => portion === value) ?? 1
  }

  function addingToCurrent(): boolean {
    return !modeRow.hidden && modeInputs.find((input) => input.checked)?.value === 'add'
  }

  function resetPickOptions() {
    for (const input of modeInputs) input.checked = input.value === 'replace'
    for (const input of portionInputs) input.checked = input.value === '1'
    const { carbsGrams } = currentGrams()
    // Adding only means something once there are carbs to add to.
    modeRow.hidden = !(carbsGrams > 0)
    addLabel.textContent = `Add to ${gramsText(carbsGrams)} g`
  }

  function paint() {
    const dishes = loadDishes()
    const query = search.value.trim()
    const matches = findDishes(dishes, query)
    finder.hidden = dishes.length === 0
    pickOptions.hidden = dishes.length === 0
    list.hidden = matches.length === 0
    list.innerHTML = matches
      .map(
        (dish) =>
          `<li class="dish"><button type="button" class="dish-pick" data-dish="${escapeHtml(dish.id)}"><span class="dish-name">${escapeHtml(dish.name)}</span><span class="dish-grams-text">${escapeHtml(formatDishGrams(dish))}</span></button><button type="button" class="dish-edit" data-dish-edit="${escapeHtml(dish.id)}" aria-label="Edit ${escapeHtml(dish.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button><button type="button" class="log-remove" data-dish-remove="${escapeHtml(dish.id)}" aria-label="Remove ${escapeHtml(dish.name)}">×</button></li>`,
      )
      .join('')
    empty.hidden = matches.length > 0
    empty.textContent =
      dishes.length === 0 ? 'No dishes yet. Add the ones you eat often below.' : `No dishes match “${query}”.`
    const shown = dishes.length === 0 || formShown || editingId !== null
    form.hidden = !shown
    formOpen.hidden = shown
    formOpen.setAttribute('aria-expanded', String(shown))
    formCancel.hidden = dishes.length === 0
    formTitle.textContent = editingId ? 'Edit dish' : 'Add a dish'
    submit.textContent = editingId ? 'Save dish' : 'Add dish'
    formHint.hidden = editingId !== null
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
    if (!shown) editingId = null
    error.textContent = ''
    paint()
  }

  function clearForm() {
    nameInput.value = ''
    carbsInput.value = ''
    fibreInput.value = ''
    paintNetCarbs()
  }

  function startEditing(dish: Dish) {
    editingId = dish.id
    nameInput.value = dish.name
    carbsInput.value = gramsText(dish.carbsGrams)
    fibreInput.value = gramsText(dish.fibreGrams)
    showForm(true)
    paintNetCarbs()
    options.sizeStepInputs()
    form.scrollIntoView({ block: 'nearest' })
    nameInput.focus({ preventScroll: true })
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
    resetPickOptions()
    paintNetCarbs()
    options.present(view)
    options.sizeStepInputs()
  }

  function pick(dish: Dish) {
    const { carbs, fibre, include } = target
    const grams = pickedGrams(currentGrams(), dish, chosenPortion(), addingToCurrent())
    saveDishes(recordDishUse(loadDishes(), dish.id))
    carbs.value = String(grams.carbsGrams)
    fibre.value = String(grams.fibreGrams)
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
    editingId = null
    // A search that found nothing is most likely the name of the dish to add.
    if (list.hidden && search.value.trim()) nameInput.value = search.value.trim()
    showForm(true)
    nameInput.focus()
  })
  formCancel.addEventListener('click', () => {
    const wasEditing = editingId !== null
    showForm(false)
    if (wasEditing) clearForm()
    formOpen.focus()
  })
  element<HTMLButtonElement>('#dishes-close').addEventListener('click', () => options.dismiss(view))

  list.addEventListener('click', (event) => {
    const clicked = event.target as Element
    const edit = clicked.closest<HTMLButtonElement>('[data-dish-edit]')
    if (edit) {
      const dish = loadDishes().find((item) => item.id === edit.dataset.dishEdit)
      if (dish) startEditing(dish)
      return
    }
    const remove = clicked.closest<HTMLButtonElement>('[data-dish-remove]')
    if (remove) {
      const removed = loadDishes().find((dish) => dish.id === remove.dataset.dishRemove)
      if (!removed) return
      saveDishes(loadDishes().filter((dish) => dish.id !== removed.id))
      if (editingId === removed.id) {
        showForm(false)
        clearForm()
      }
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
    if (editingId) {
      const result = editDish(loadDishes(), editingId, name, carbs, fibre)
      if (!result.ok) {
        error.textContent = result.message
        return
      }
      saveDishes(result.dishes)
    } else {
      const dish = createDish(name, carbs, fibre)
      if (!dish) {
        error.textContent = 'That dish could not be saved.'
        return
      }
      saveDishes(upsertDish(loadDishes(), dish))
    }
    clearForm()
    search.value = ''
    showForm(false)
    nameInput.blur()
    carbsInput.blur()
    fibreInput.blur()
  })

  return { view, target: () => target, open, paint, paintFibre }
}
