// Безопасный парсинг денежных сумм из пользовательского ввода.
// Возвращает конечное неотрицательное число либо null, если ввод невалиден.
export function toAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Парсинг целого количества (занятия, возраст). min по умолчанию 0.
export function toCount(value, min = 0) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min ? n : null
}
