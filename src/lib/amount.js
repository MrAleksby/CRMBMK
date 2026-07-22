// Пользователь вводит суммы с запятой как десятичным разделителем (1,5 = полтора)
// и иногда с пробелами-разрядами (2 640,50). Number() такое не понимает, поэтому
// перед разбором приводим к виду с точкой: запятая → точка, пробелы убираем.
// Пустая строка остаётся пустой — её проверяют отдельно (пропуск = сумма не введена).
export function normalizeDecimal(value) {
  return String(value ?? '').replace(/\s/g, '').replace(',', '.')
}

// Безопасный парсинг денежных сумм из пользовательского ввода.
// Возвращает конечное неотрицательное число либо null, если ввод невалиден.
export function toAmount(value) {
  const n = Number(normalizeDecimal(value))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Парсинг целого количества (занятия, возраст). min по умолчанию 0.
export function toCount(value, min = 0) {
  const n = Number(normalizeDecimal(value))
  return Number.isInteger(n) && n >= min ? n : null
}
