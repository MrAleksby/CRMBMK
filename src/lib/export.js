// Выгрузка таблиц в Excel.
//
// Файл — CSV, но такой, какой Excel открывает двойным кликом без «мастера импорта»:
// точка с запятой как разделитель (в русской локали Excel ждёт именно её) и BOM
// в начале, иначе кириллица превращается в кракозябры.
//
// Настоящий .xlsx потребовал бы тащить в бандл библиотеку на полмегабайта —
// ради таблицы из десяти строк это не окупается.

const escape = (value) => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Кавычки, точки с запятой и переводы строк ломают колонки — экранируем.
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Числа отдаём с запятой в дробной части: иначе Excel в русской локали
// прочитает «1234.5» как текст, и суммировать столбец не выйдет.
// Округляем до копеек — иначе в файл уезжает «−58792517,730000004».
const cell = (value) => {
  if (typeof value !== 'number') return escape(value)
  const rounded = Math.round(value * 100) / 100
  return escape(String(rounded).replace('.', ','))
}

export function toCsv(columns, rows) {
  const head = columns.map(c => escape(c.label)).join(';')
  const body = rows.map(row => columns.map(c => cell(c.value(row))).join(';'))
  return [head, ...body].join('\r\n')
}

export function downloadCsv(filename, columns, rows) {
  const csv = toCsv(columns, rows)
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
