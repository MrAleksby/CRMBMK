import { CATEGORY_KINDS } from '../lib/directories'

// Статьи в выпадающем списке — группами по виду операции, в том же порядке,
// что и в справочнике. Без групп список шёл вперемешку, а одноимённые статьи
// («Такси» — расход и «Такси» — изъятие) было не различить.
//
// Ожидает уже отсортированный список (sortItems): порядок внутри вида задан вручную.
export default function CategoryOptions({ categories }) {
  return CATEGORY_KINDS.map(kind => {
    const list = categories.filter(c => c.kind === kind.value)
    if (!list.length) return null
    return (
      <optgroup key={kind.value} label={kind.label}>
        {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </optgroup>
    )
  })
}
