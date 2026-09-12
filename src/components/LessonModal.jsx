import { useState } from 'react'
import { Link } from 'react-router-dom'
import StudentChecklist from './StudentChecklist'
import { LESSON_STATUSES } from '../lib/group'
import { buildJournal, journalTotal, validateJournal, lessonTypeLabel, formatLessonDate, attendanceToRow } from '../lib/lesson'
import { durationMinutes } from '../lib/calendar'
import { toAmount } from '../lib/amount'

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 16px', zIndex: 100, overflowY: 'auto',
}

const modal = {
  background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '720px',
  border: '1px solid #e5e7eb', overflow: 'hidden',
}

const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f7f8fa',
}

const body = { padding: '20px' }

const row = {
  display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px',
  padding: '8px 0', fontSize: '13px', alignItems: 'center',
}

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 10px', color: '#111827', fontSize: '13px', outline: 'none',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '9px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '9px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
}

const notSet = { color: '#dc2626', fontStyle: 'italic' }

// Занятие · Питание · Комментарий. Одна сетка на шапку, на поля ввода и на
// проведённое занятие: развели бы их по разным местам — подписи разъехались бы
// со значениями, а именно за этим сюда и смотрят.
const grid = (withBonus) => ({
  display: 'grid',
  gridTemplateColumns: withBonus ? '1fr 1fr 1fr 1.4fr' : '1fr 1fr 1.4fr',
  gap: '6px',
})

// В строке журнала суммы лежат строками — это поля ввода. Для показа их нужно
// вернуть в числа: пустое поле значит «не вводили», а не ноль.
const money = (value) => toAmount(value) ?? 0

// `readOnly` — карточка глазами педагога: состав и кто был, но ни сумм, ни
// балансов, ни кнопок. Списание — это деньги, их вводит менеджер.
export default function LessonModal({
  lesson, clients, teachers, balances, lessonsLeftBy = {}, subscriptions = [], saving,
  onClose, onConduct, onReturn, onCancelLesson, onSaveStudents, readOnly = false,
  // Бонусы кошелька ученика: поле «Бонус» появляется только у тех, у кого они есть.
  bonusLeftBy = {}, validateBonuses = () => null,
}) {
  const conducted = lesson.status === 'conducted'
  const [rows, setRows] = useState(() => buildJournal(lesson, clients, subscriptions))
  const [students, setStudents] = useState(lesson.studentIds || [])
  const [editingStudents, setEditingStudents] = useState(false)
  const [error, setError] = useState('')

  // Колонка бонуса нужна, только если хоть у кого-то в занятии они есть или
  // уже потрачены: иначе на планшете четыре поля в ряд ужимают суммы впустую.
  const anyBonus = !readOnly && (
    (lesson.studentIds || []).some(sid => bonusLeftBy[sid] > 0)
    || (lesson.attendance || []).some(a => (a.amountBonus || 0) > 0)
  )

  const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
  const teacher = teachers.find(t => t.id === lesson.teacherId)

  const update = (clientId, patch) =>
    setRows(rows.map(r => (r.clientId === clientId ? { ...r, ...patch } : r)))

  const handleConduct = () => {
    const problem = validateJournal(rows) || validateBonuses(rows)
    if (problem) return setError(problem)
    setError('')
    onConduct(lesson, rows)
  }

  const toggleStudent = (id) =>
    setStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const handleSaveStudents = async () => {
    await onSaveStudents(lesson, students)
    setEditingStudents(false)
  }

  // Проведённое занятие показываем как есть, запланированное — как журнал.
  //
  // `attendanceToRow` готовит строку для полей ввода: суммы там строками,
  // в «Занятии» и «Питании», а итога `amountCharged` в ней нет вовсе. Показать
  // списание по такой строке нельзя — она про ввод, а не про готовую запись.
  // Именно так окно и потеряло суммы: у проведённого занятия против каждого
  // ученика стояло «не списано», хотя деньги списаны и итог внизу верный.
  // Поэтому итог берём из самой записи журнала, а не из строки формы.
  const displayRows = conducted
    ? (lesson.attendance || []).map(a => ({
        ...attendanceToRow(a),
        amountCharged: a.amountCharged || 0,
      }))
    : rows

  const total = conducted
    ? (lesson.attendance || []).reduce((s, a) => s + (a.amountCharged || 0), 0)
    : journalTotal(rows)

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>
             {lessonTypeLabel(lesson.type)}
            </span>
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
              background: status.background, color: status.color,
            }}>{status.label}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: '18px',
            color: '#6b7280', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={body}>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Дата и время</span>
            <span style={{ color: '#111827' }}>
             {formatLessonDate(lesson.date)} · с {lesson.timeFrom} до {lesson.timeTo}
              <span style={{ color: '#6b7280' }}> ({durationMinutes(lesson)} мин.)</span>
            </span>
          </div>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Педагог</span>
           {teacher
              ? <span style={{ color: '#111827' }}>{teacher.name}</span>
              : <span style={notSet}>(не задан)</span>}
          </div>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Группа</span>
           {lesson.groupName
              ? <span style={{ color: '#111827' }}>{lesson.groupName}</span>
              : <span style={notSet}>(без группы)</span>}
          </div>
         {lesson.topic && (
            <div style={row}>
              <span style={{ color: '#6b7280' }}>Тема</span>
              <span style={{ color: '#111827' }}>{lesson.topic}</span>
            </div>
          )}

         {/* Состав */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                Кто был? ({displayRows.length})
              </span>
             {!conducted && !readOnly && (
                <button onClick={() => setEditingStudents(!editingStudents)} style={ghostBtn}>
                 {editingStudents ? 'Готово' : 'Изменить состав'}
                </button>
              )}
            </div>

           {editingStudents ? (
              <>
                <StudentChecklist clients={clients} selected={students} onToggle={toggleStudent} maxHeight="200px" />
                <button onClick={handleSaveStudents} disabled={saving}
                  style={{ ...btn(), marginTop: '10px', opacity: saving ? 0.6 : 1 }}>
                  Сохранить состав
                </button>
              </>
            ) : displayRows.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#6b7280' }}>Учеников нет — добавьте их в состав.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontSize: '12px', fontWeight: '600' }}>
                      Состояние клиента
                    </th>
                   {!readOnly && (
                      <th style={{ padding: '6px 0', color: '#6b7280', fontSize: '12px', fontWeight: '600', width: '340px' }}>
                        <div style={grid(anyBonus)}>
                          <span style={{ textAlign: 'right' }}>Занятие</span>
                          <span style={{ textAlign: 'right' }}>Питание</span>
                         {anyBonus && <span style={{ textAlign: 'right' }}>Бонус</span>}
                          <span style={{ textAlign: 'left' }}>Комментарий</span>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                 {displayRows.map(record => {
                    const present = record.status === 'present'
                    const balance = balances?.[record.clientId] ?? 0
                    const left = lessonsLeftBy?.[record.clientId] ?? 0
                    return (
                      <tr key={record.clientId} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" checked={present} disabled={conducted || readOnly}
                              onChange={() => update(record.clientId, { status: present ? 'absent' : 'present' })} />
                           {/* Имя ведёт на карточку ученика — у тёзок так видно, кто это.
                                Новая вкладка, чтобы не потерять журнал занятия. */}
                            <Link to={`/clients/${record.clientId}`} target="_blank" rel="noreferrer"
                              style={{ color: (!readOnly && balance < 0) ? '#dc2626' : '#7c3aed', textDecoration: 'none' }}>
                             {record.clientName}
                            </Link>
                           {/* Остаток и долг — деньги: педагогу их не показываем. */}
                           {!readOnly && (
                              <span style={{ fontSize: '12px', color: balance < 0 ? '#dc2626' : '#6b7280' }}>
                                ({left > 0 ? `${left} ост` : `${balance.toLocaleString()} сум`})
                              </span>
                            )}
                          </div>
                        </td>
                       {!readOnly && (
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                         {conducted ? (
                            // Проведённое читают по тем же трём колонкам, что и
                            // заполняют. У занятий до разделения питания нет вовсе:
                            // там прочерк, а не «питание 0» — цифры, которой никто
                            // не вводил, в отчёте быть не должно.
                            <div style={{ ...grid(anyBonus), alignItems: 'center' }}>
                              <span style={{ textAlign: 'right', color: money(record.amountLesson) > 0 ? '#dc2626' : '#9ca3af' }}>
                               {money(record.amountLesson) > 0 ? money(record.amountLesson).toLocaleString() : '—'}
                              </span>
                              <span style={{ textAlign: 'right', color: money(record.amountMeal) > 0 ? '#dc2626' : '#9ca3af' }}>
                               {money(record.amountMeal) > 0 ? money(record.amountMeal).toLocaleString() : '—'}
                              </span>
                             {/* В колонке комментария — только комментарий. Прощённый
                                  пропуск читается по прочеркам в суммах и снятой галочке;
                                  подписывать его словами здесь значило бы снова
                                  поставить значение не под свою подпись. */}
                             {anyBonus && (
                                <span style={{ textAlign: 'right', color: money(record.amountBonus) > 0 ? '#7c3aed' : '#9ca3af' }}>
                                 {money(record.amountBonus) > 0 ? money(record.amountBonus).toLocaleString() : '—'}
                                </span>
                              )}
                              <span style={{ textAlign: 'left', fontSize: '12px', color: '#6b7280' }}>
                               {record.comment}
                              </span>
                            </div>
                          ) : (
                            // Сумма делится на занятие и питание — те же поля, что и в
                            // журнале на странице «Уроки». Раньше здесь стояло одно поле
                            // `amount`, и введённое в него никуда не шло: проведение
                            // читает `amountLesson`/`amountMeal`, и списалась бы
                            // подставленная подсказка, а не то, что ввёл менеджер.
                            //
                            // Пропуск тоже может стоить денег, если ребёнок не предупредил.
                            <div style={grid(anyBonus)}>
                              <input type="text" inputMode="decimal"
                                style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                                value={record.amountLesson}
                                placeholder={present ? 'Занятие' : 'Не списывать'}
                                title="Сумма за занятие"
                                onChange={e => update(record.clientId, { amountLesson: e.target.value })} />
                              <input type="text" inputMode="decimal"
                                style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                                value={record.amountMeal}
                                placeholder="Питание"
                                title="Сумма за питание"
                                onChange={e => update(record.clientId, { amountMeal: e.target.value })} />
                             {/* Списывают сколько нужно, а не весь остаток: в подсказке
                                  ноль, а доступную сумму показывает всплывающая подпись. */}
                             {anyBonus && (
                                <input type="text" inputMode="decimal"
                                  style={{ ...inputStyle, width: '100%', textAlign: 'right' }}
                                  value={record.amountBonus}
                                  placeholder="0"
                                  title={bonusLeftBy[record.clientId] > 0
                                    ? `Есть ${bonusLeftBy[record.clientId].toLocaleString()} — можно списать часть`
                                    : 'Бонусов нет'}
                                  disabled={!(bonusLeftBy[record.clientId] > 0)}
                                  onChange={e => update(record.clientId, { amountBonus: e.target.value })} />
                              )}
                              <input type="text"
                                style={{ ...inputStyle, width: '100%', fontSize: '12px' }}
                                value={record.comment}
                                placeholder="Комментарий"
                                onChange={e => update(record.clientId, { comment: e.target.value })} />
                            </div>
                          )}
                        </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

           {!readOnly && !editingStudents && displayRows.length > 0 && (
              <p style={{ fontSize: '13px', color: '#4b5563', marginTop: '12px' }}>
               {conducted ? 'Списано' : 'Спишется'}:{' '}
                <b style={{ color: '#111827' }}>{total.toLocaleString()} сум</b>
              </p>
            )}
          </div>

         {error && (
            <p style={{
              background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
              borderRadius: '10px', padding: '8px 12px', fontSize: '13px', marginTop: '12px',
            }}> {error}</p>
          )}
        </div>

        <div style={{
          display: 'flex', gap: '10px', padding: '14px 20px',
          borderTop: '1px solid #e5e7eb', background: '#f7f8fa', flexWrap: 'wrap',
        }}>
         {!readOnly && lesson.status === 'planned' && !editingStudents && (
            <>
              <button onClick={handleConduct} disabled={saving || displayRows.length === 0}
                style={{ ...btn('#059669'), opacity: (saving || displayRows.length === 0) ? 0.6 : 1 }}>
                ✓ {saving ? 'Проводим...' : 'Провести'}
              </button>
              <button onClick={() => onCancelLesson(lesson)} style={ghostBtn}>Отменить занятие</button>
            </>
          )}
         {!readOnly && conducted && (
            <button onClick={() => onReturn(lesson)} disabled={saving} style={ghostBtn}>
              ↩ Вернуть в запланированные
            </button>
          )}
          <button onClick={onClose} style={{ ...ghostBtn, marginLeft: 'auto' }}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
