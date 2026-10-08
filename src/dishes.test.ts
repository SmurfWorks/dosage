import { describe, expect, it } from 'vitest'
import {
  createDish,
  findDishes,
  formatDishGrams,
  parseDishes,
  recordDishUse,
  sortDishes,
  upsertDish,
  type Dish,
} from './dishes'

function dish(overrides: Partial<Dish> = {}): Dish {
  return { id: '1', name: 'Porridge', carbsGrams: 45, fibreGrams: 6, uses: 0, ...overrides }
}

describe('dishes', () => {
  it('creates a dish with a trimmed name', () => {
    const made = createDish('  Toast and jam ', 32, 2)
    expect(made).toMatchObject({ name: 'Toast and jam', carbsGrams: 32, fibreGrams: 2, uses: 0 })
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

  it('reads a dish saved before picks were counted as unpicked', () => {
    const { uses: _uses, ...older } = dish()
    expect(parseDishes([older])?.[0].uses).toBe(0)
    expect(parseDishes([dish({ uses: -1 })])).toBeNull()
    expect(parseDishes([dish({ uses: 1.5 })])).toBeNull()
  })

  it('counts a pick', () => {
    const dishes = recordDishUse([dish({ id: '1', uses: 2 }), dish({ id: '2', name: 'Rice' })], '1')
    expect(dishes.map((item) => item.uses)).toEqual([3, 0])
  })

  it('updates a dish with the same name and keeps its count', () => {
    const dishes = upsertDish([dish({ id: '1', uses: 4 }), dish({ id: '2', name: 'Rice' })], dish({ id: '3', name: 'PORRIDGE', carbsGrams: 50 }))
    expect(dishes).toEqual([dish({ id: '3', name: 'PORRIDGE', carbsGrams: 50, uses: 4 }), dish({ id: '2', name: 'Rice' })])
  })

  it('finds the three most-picked dishes holding every word searched', () => {
    const dishes = [
      dish({ id: '1', name: 'Porridge with banana', uses: 1 }),
      dish({ id: '2', name: 'Banana bread', uses: 5 }),
      dish({ id: '3', name: 'Banana', uses: 5 }),
      dish({ id: '4', name: 'Banana split', uses: 0 }),
      dish({ id: '5', name: 'Rice', uses: 9 }),
    ]
    expect(findDishes(dishes, 'banana').map((item) => item.id)).toEqual(['3', '2', '1'])
    expect(findDishes(dishes, '  BANANA   porr ').map((item) => item.id)).toEqual(['1'])
    expect(findDishes(dishes, '').map((item) => item.id)).toEqual(['5', '3', '2'])
    expect(findDishes(dishes, 'pizza')).toEqual([])
  })
})
