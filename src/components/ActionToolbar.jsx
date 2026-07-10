// Панель действий над списком: добавить, править отмеченную, удалить отмеченные.
// Повторяет привычную по AlfaCRM логику — сначала отмечаешь строки, потом жмёшь кнопку.

const btn = (color, disabled) => ({
  background: disabled ? '#f3f4f6' : color,
  color: disabled ? '#9ca3af' : '#fff',
  border: 'none', padding: '10px 18px', borderRadius: '10px',
  fontSize: '14px', fontWeight: '600',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

const ghost = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '9px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
}

export default function ActionToolbar({
  count = 0,
  addLabel = '✚ Добавить',
  editLabel = '✎ Править',
  deleteLabel = '🗑 Удалить',
  busy = false,
  onAdd,
  onEdit,
  onDelete,
  onClear,
  extra,
}) {
  const noneSelected = count === 0
  const notExactlyOne = count !== 1

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
      {onAdd && (
        <button onClick={onAdd} style={btn('#7c3aed', false)}>{addLabel}</button>
      )}

      {onEdit && (
        <button onClick={onEdit} disabled={notExactlyOne}
          title={notExactlyOne ? 'Отметьте одну строку' : 'Править отмеченную строку'}
          style={btn('#2563eb', notExactlyOne)}>
          {editLabel}
        </button>
      )}

      {onDelete && (
        <button onClick={onDelete} disabled={noneSelected || busy}
          title={noneSelected ? 'Отметьте строки' : 'Удалить отмеченные'}
          style={btn('#dc2626', noneSelected || busy)}>
          {deleteLabel}{count > 0 ? ` (${count})` : ''}
        </button>
      )}

      {extra}

      {count > 0 && onClear && (
        <button onClick={onClear} style={ghost}>Снять выделение</button>
      )}
    </div>
  )
}
