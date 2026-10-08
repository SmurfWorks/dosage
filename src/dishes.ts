export type Dish = {
  id: string
  name: string
  carbsGrams: number
  fibreGrams: number
}

export const DISH_NAME_MAX = 60
export const DISH_GRAMS_MAX = 500

const DISHES_KEY = 'insulin-calculator.dishes.v1'

export function createDish(name: string, carbsGrams: number, fibreGrams: number): Dish | null {
  const dish = { id: crypto.randomUUID(), name: name.trim(), carbsGrams, fibreGrams }
  return readDish(dish)
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
  return { id: item.id, name, carbsGrams, fibreGrams }
}

function readGrams(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > DISH_GRAMS_MAX) return null
  return Number(value.toFixed(2))
}
