import { describe, expect, it } from 'vitest'
import { createDish, formatDishGrams, parseDishes, sortDishes, type Dish } from './dishes'

function dish(overrides: Partial<Dish> = {}): Dish {
  return { id: '1', name: 'Porridge', carbsGrams: 45, fibreGrams: 6, ...overrides }
}

describe('dishes', () => {
  it('creates a dish with a trimmed name', () => {
    const made = createDish('  Toast and jam ', 32, 2)
    expect(made).toMatchObject({ name: 'Toast and jam', carbsGrams: 32, fibreGrams: 2 })
    expect(made?.id).toBeTruthy()
  })

  it('refuses a dish without a name or with grams out of range', () => {
    expect(createDish('   ', 10, 0)).toBeNull()
    expect(createDish('Rice', -1, 0)).toBeNull()
    expect(createDish('Rice', 501, 0)).toBeNull()
    expect(createDish('Rice', Number.NaN, 0)).toBeNull()
    expect(createDish('x'.repeat(61), 10, 0)).toBeNull()
  })

  it('sorts dishes by name, ignoring case', () => {
    const sorted = sortDishes([dish({ id: '1', name: 'pasta' }), dish({ id: '2', name: 'Apple' }), dish({ id: '3', name: 'banana' })])
    expect(sorted.map((item) => item.name)).toEqual(['Apple', 'banana', 'pasta'])
  })

  it('parses a stored list in name order', () => {
    expect(parseDishes([dish({ id: '1', name: 'Rice' }), dish({ id: '2', name: 'Apple' })])?.map((item) => item.name)).toEqual([
      'Apple',
      'Rice',
    ])
    expect(parseDishes([])).toEqual([])
  })

  it('rejects the whole list when one dish is unreadable or an id repeats', () => {
    expect(parseDishes('nope')).toBeNull()
    expect(parseDishes([dish(), { id: '2', name: 'Rice', carbsGrams: '40', fibreGrams: 0 }])).toBeNull()
    expect(parseDishes([dish({ id: '1' }), dish({ id: '1', name: 'Rice' })])).toBeNull()
  })

  it('describes the grams, leaving out fibre when there is none', () => {
    expect(formatDishGrams(dish())).toBe('45 g carbs · 6 g fibre')
    expect(formatDishGrams(dish({ fibreGrams: 0 }))).toBe('45 g carbs')
  })
})
