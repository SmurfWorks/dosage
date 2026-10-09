export type Dish = {
  id: string
  name: string
  carbsGrams: number
  fibreGrams: number
  /** How many times the dish has been picked, which ranks it in the list. */
  uses: number
}

export const DISH_NAME_MAX = 60
export const DISH_GRAMS_MAX = 500
export const DISH_LIST_LIMIT = 3

const DISHES_KEY = 'insulin-calculator.dishes.v1'

export function createDish(name: string, carbsGrams: number, fibreGrams: number, uses = 0): Dish | null {
  const dish = { id: crypto.randomUUID(), name: name.trim(), carbsGrams, fibreGrams, uses }
  return readDish(dish)
}

/** Adds a dish, replacing one with the same name but keeping how often it was picked. */
export function upsertDish(dishes: Dish[], dish: Dish): Dish[] {
  const key = dish.name.toLowerCase()
  const existing = dishes.find((item) => item.name.toLowerCase() === key)
  const others = dishes.filter((item) => item !== existing)
  return sortDishes([...others, existing ? { ...dish, uses: existing.uses } : dish])
}

/** Changes a dish's name and grams in place, keeping its id and how often it was picked. */
export function editDish(
  dishes: Dish[],
  id: string,
  name: string,
  carbsGrams: number,
  fibreGrams: number,
): { ok: true; dishes: Dish[] } | { ok: false; message: string } {
  const existing = dishes.find((dish) => dish.id === id)
  if (!existing) return { ok: false, message: 'That dish has been removed.' }
  const edited = readDish({ ...existing, name, carbsGrams, fibreGrams })
  if (!edited) return { ok: false, message: 'That dish could not be saved.' }
  const key = edited.name.toLowerCase()
  const clash = dishes.find((dish) => dish.id !== id && dish.name.toLowerCase() === key)
  if (clash) return { ok: false, message: `You already have a dish called ${clash.name}.` }
  return { ok: true, dishes: sortDishes(dishes.map((dish) => (dish.id === id ? edited : dish))) }
}

export const DISH_PORTIONS = [0.5, 1, 1.5, 2] as const
export type DishPortion = (typeof DISH_PORTIONS)[number]

export type DishGrams = { carbsGrams: number; fibreGrams: number }

/**
 * The carbs and fibre to fill in after picking a dish: a portion of the dish, either in place of what is
 * already entered or added to it.
 */
export function pickedGrams(current: DishGrams, dish: Dish, portion: DishPortion, add: boolean): DishGrams {
  const round = (grams: number) => Math.round(grams * 10) / 10
  const carbs = round(dish.carbsGrams * portion)
  const fibre = round(dish.fibreGrams * portion)
  if (!add) return { carbsGrams: carbs, fibreGrams: fibre }
  return { carbsGrams: round(current.carbsGrams + carbs), fibreGrams: round(current.fibreGrams + fibre) }
}

export function formatPortion(portion: DishPortion): string {
  return portion === 0.5 ? '½' : portion === 1.5 ? '1½' : String(portion)
}

export function recordDishUse(dishes: Dish[], id: string): Dish[] {
  return dishes.map((dish) => (dish.id === id ? { ...dish, uses: dish.uses + 1 } : dish))
}

/** The most-picked dishes whose name holds every word of the query. */
export function findDishes(dishes: Dish[], query: string, limit = DISH_LIST_LIMIT): Dish[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return dishes
    .filter((dish) => {
      const name = dish.name.toLowerCase()
      return words.every((word) => name.includes(word))
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
}

export function sortDishes(dishes: Dish[]): Dish[] {
  return [...dishes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** Reads a stored or imported list, or null when any dish in it is unreadable. */
export function parseDishes(value: unknown): Dish[] | null {
  if (!Array.isArray(value)) return null
  const dishes: Dish[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const dish = readDish(item)
    if (!dish || ids.has(dish.id)) return null
    ids.add(dish.id)
    dishes.push(dish)
  }
  return sortDishes(dishes)
}

export function loadDishes(): Dish[] {
  try {
    const raw = localStorage.getItem(DISHES_KEY)
    if (!raw) return []
    return parseDishes(JSON.parse(raw)) ?? []
  } catch {
    return []
  }
}

export function saveDishes(dishes: Dish[]) {
  localStorage.setItem(DISHES_KEY, JSON.stringify(sortDishes(dishes)))
}

export function formatDishGrams(dish: Dish): string {
  const carbs = `${dish.carbsGrams} g carbs`
  return dish.fibreGrams > 0 ? `${carbs} · ${dish.fibreGrams} g fibre` : carbs
}

function readDish(value: unknown): Dish | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<Dish>
  if (typeof item.id !== 'string' || !item.id) return null
  if (typeof item.name !== 'string') return null
  const name = item.name.trim()
  if (!name || name.length > DISH_NAME_MAX) return null
  const carbsGrams = readGrams(item.carbsGrams)
  const fibreGrams = readGrams(item.fibreGrams)
  if (carbsGrams === null || fibreGrams === null) return null
  // Dishes saved before picks were counted have no count.
  const uses = item.uses === undefined ? 0 : item.uses
  if (typeof uses !== 'number' || !Number.isInteger(uses) || uses < 0) return null
  return { id: item.id, name, carbsGrams, fibreGrams, uses }
}

function readGrams(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > DISH_GRAMS_MAX) return null
  return Number(value.toFixed(2))
}
