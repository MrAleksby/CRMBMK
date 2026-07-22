import { describe, it, expect } from 'vitest'
import { normalizeDecimal, toAmount, toCount } from './amount'

describe('normalizeDecimal', () => {
  it('превращает запятую в точку (десятичный разделитель)', () => {
    expect(normalizeDecimal('1,5')).toBe('1.5')
    expect(normalizeDecimal('2640,50')).toBe('2640.50')
  })

  it('убирает пробелы-разряды', () => {
    expect(normalizeDecimal('2 640 000')).toBe('2640000')
    expect(normalizeDecimal('1 200,5')).toBe('1200.5')
  })

  it('пустую строку и nullish отдаёт пустой строкой', () => {
    expect(normalizeDecimal('')).toBe('')
    expect(normalizeDecimal(null)).toBe('')
    expect(normalizeDecimal(undefined)).toBe('')
  })
})

describe('toAmount с запятой', () => {
  it('принимает сумму с запятой', () => {
    expect(toAmount('1,5')).toBe(1.5)
    expect(toAmount('50 000')).toBe(50000)
  })

  it('обычная точечная и целая запись работают по-прежнему', () => {
    expect(toAmount('1.5')).toBe(1.5)
    expect(toAmount('2640000')).toBe(2640000)
    expect(toAmount('0')).toBe(0)
  })

  it('отрицательное и мусор отклоняет', () => {
    expect(toAmount('-5')).toBeNull()
    expect(toAmount('abc')).toBeNull()
    expect(toAmount('1,2,3')).toBeNull()
  })
})

describe('toCount с пробелами', () => {
  it('целые считает, дробное отклоняет', () => {
    expect(toCount('8')).toBe(8)
    expect(toCount('1 0')).toBe(10)
    expect(toCount('1,5')).toBeNull()
  })
})
