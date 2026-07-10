// Выделение строк галочками. Действия применяются к отмеченным — как в AlfaCRM,
// где сверху таблицы стоят «Править» и «Удалить», а не кнопки в каждой строке.

import { useCallback, useMemo, useState } from 'react'

export function useSelection(allItems = []) {
  const [selected, setSelected] = useState(() => new Set())

  const toggle = useCallback((id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }), [])

  // Галочка в шапке отмечает только видимые строки. Иначе одним кликом
  // можно выделить всё содержимое базы и не заметить этого.
  const toggleVisible = useCallback((visible) => setSelected(prev => {
    const next = new Set(prev)
    const allChecked = visible.length > 0 && visible.every(item => next.has(item.id))
    for (const item of visible) {
      if (allChecked) next.delete(item.id)
      else next.add(item.id)
    }
    return next
  }), [])

  const clear = useCallback(() => setSelected(new Set()), [])

  const rows = useMemo(
    () => allItems.filter(item => selected.has(item.id)), [allItems, selected])

  const allVisibleChecked = useCallback(
    (visible) => visible.length > 0 && visible.every(item => selected.has(item.id)), [selected])

  return { selected, rows, count: selected.size, toggle, toggleVisible, clear, allVisibleChecked }
}
