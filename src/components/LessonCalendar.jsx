import { useState } from 'react'
import { LESSON_STATUSES, todayISO } from '../lib/group'
import {
  VIEWS, WEEKDAY_SHORT, HOUR_HEIGHT, DAY_START_HOUR, DAY_END_HOUR,
  hours, monthGrid, weekDays, lessonsOn, lessonBox, rangeTitle, shiftDate, toISO,
  durationMinutes,
} from '../lib/calendar'
import {
  isTrial, lessonTypeLabel, lessonTypeIcon, lessonStudentNames, formatLessonDate,
} from '../lib/lesson'

const navBtn = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 12px', fontSize: '13px', color: '#4b5563', cursor: 'pointer',
}

const viewBtn = (active) => ({
  background: active ? '#7c3aed' : '#ffffff',
  color: active ? '#fff' : '#4b5563',
  border: `1px solid ${active ? '#7c3aed' : '#e5e7eb'}`,
  padding: '6px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

// Цвет занятия: проведённое зелёное, отменённое серое и зачёркнутое,
// просроченное жёлтое, запланированное нейтральное.
function lessonStyle(lesson) {
  const today = todayISO()
  if (lesson.status === 'conducted') return { background: '#dcfce7', border: '#86efac', color: '#065f46' }
  if (lesson.status === 'cancelled') return { background: '#f3f4f6', border: '#e5e7eb', color: '#9ca3af', strike: true }
  if (lesson.date < today) return { background: '#fffbeb', border: '#fde68a', color: '#92400e' }
  return { background: '#ede9fe', border: '#ddd6fe', color: '#5b21b6' }
}

// compact — не хватает высоты на список детей (месяц, соседние занятия).
// dense — не хватает ещё и ширины: несколько занятий делят колонку недели.
function LessonChip({ lesson, clients, onOpen, compact, dense }) {
  const style = lessonStyle(lesson)
  const names = lessonStudentNames(lesson, clients)
  const trial = isTrial(lesson)

  const mark = lesson.status === 'conducted' ? '✓ ' : lesson.status === 'cancelled' ? '⊖ ' : ''
  // Название: у группового — имя группы, у пробного — звёздочка и «Пробный».
  const heading = trial ? '✱ Пробный' : (lesson.groupName || lessonTypeLabel(lesson.type))
  const title = `${lesson.timeFrom}–${lesson.timeTo} · ${heading}`

  // В тесной плитке помещается только час начала и число детей: диапазон времени,
  // название и значок статуса туда не влезают, а статус и так виден по цвету
  // и зачёркиванию. Остальное — в подсказке и в карточке занятия.
  return (
    <div onClick={() => onOpen(lesson)} title={title} style={{
      background: style.background, border: `1px solid ${style.border}`,
      borderRadius: '8px', padding: dense ? '3px 4px' : '6px 8px',
      cursor: 'pointer', overflow: 'hidden', height: '100%',
      textDecoration: style.strike ? 'line-through' : 'none',
    }}>
      <div style={{
        fontSize: dense ? '10px' : '11px', fontWeight: '700', color: style.color,
        whiteSpace: 'nowrap',
      }}>
        {dense ? lesson.timeFrom : `${mark}${lesson.timeFrom}–${lesson.timeTo}`}
      </div>

      {!dense && (
        <div style={{ fontSize: '12px', color: style.color, fontWeight: '600' }}>
          {trial && <span title="Пробный урок">✱ </span>}
          {lesson.groupName || (trial ? 'Пробный' : lessonTypeLabel(lesson.type))}
        </div>
      )}

      {!compact && names.length > 0 && (
        <div style={{ fontSize: '11px', color: style.color, marginTop: '4px', lineHeight: 1.5 }}>
          {names.slice(0, 8).map((n, i) => <div key={`${n}-${i}`}>· {n}</div>)}
          {names.length > 8 && <div>…и ещё {names.length - 8}</div>}
        </div>
      )}

      {compact && (
        <div style={{ fontSize: dense ? '10px' : '11px', color: style.color, whiteSpace: 'nowrap' }}>
          {trial ? '✱ ' : '👶 '}{names.length}
        </div>
      )}
    </div>
  )
}

// Превью занятия — компактное окно по клику на плитку, как в AlfaCRM.
// Показывает состав и, если занятие проведено, фактические суммы списаний.
// «Открыть занятие» ведёт в полную карточку, где проводят и правят журнал.
function LessonPreview({ lesson, clients, teachers, onOpen, onClose }) {
  const style = lessonStyle(lesson)
  const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
  const teacher = teachers.find(t => t.id === lesson.teacherId)
  const conducted = lesson.status === 'conducted'
  const trial = isTrial(lesson)

  // Проведённое несёт фактические суммы в журнале; запланированное — только состав.
  const rows = conducted && lesson.attendance?.length
    ? lesson.attendance.map(a => ({
        key: a.clientId,
        name: a.clientName || clients.find(c => c.id === a.clientId)?.childName || '—',
        present: a.status === 'present',
        amount: a.amountCharged || 0,
      }))
    : lessonStudentNames(lesson, clients).map((name, i) => ({ key: `${name}-${i}`, name, amount: null }))

  const total = conducted ? rows.reduce((s, r) => s + (r.amount || 0), 0) : null

  const line = { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '10px', padding: '5px 0', fontSize: '13px' }
  const muted = { color: '#6b7280' }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.35)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '60px 16px', zIndex: 90, overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#ffffff', borderRadius: '14px', width: '100%', maxWidth: '380px',
        border: '1px solid #e5e7eb', overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(17, 24, 39, 0.18)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: style.background,
        }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: style.color }}>
            {trial ? '✱ ' : `${lessonTypeIcon(lesson.type)} `}{lessonTypeLabel(lesson.type)} · {status.label}
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: '16px', color: '#6b7280', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ padding: '12px 16px' }}>
          <div style={line}>
            <span style={muted}>Время</span>
            <span>{formatLessonDate(lesson.date)}, {lesson.timeFrom}–{lesson.timeTo}
              <span style={muted}> ({durationMinutes(lesson)} мин.)</span></span>
          </div>
          <div style={line}>
            <span style={muted}>Педагог</span>
            <span>{teacher ? teacher.name : <span style={{ color: '#dc2626', fontStyle: 'italic' }}>(не задан)</span>}</span>
          </div>
          <div style={line}>
            <span style={muted}>{trial ? 'Пробный' : 'Группа'}</span>
            <span>{lesson.groupName || <span style={muted}>без группы</span>}</span>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '8px', paddingTop: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>
              Состав ({rows.length})
            </div>
            {rows.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>Учеников нет</p>
            ) : rows.map((r, i) => (
              <div key={r.key} style={{
                display: 'flex', justifyContent: 'space-between', gap: '8px',
                fontSize: '13px', padding: '4px 0',
                borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                color: conducted && !r.present ? '#9ca3af' : '#111827',
              }}>
                <span>{i + 1}. {r.name}</span>
                {r.amount !== null && (
                  <span style={{ color: r.amount > 0 ? '#dc2626' : '#9ca3af', whiteSpace: 'nowrap' }}>
                    {r.amount > 0 ? `${r.amount.toLocaleString()} сум` : '—'}
                  </span>
                )}
              </div>
            ))}
            {total !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', fontSize: '13px', fontWeight: '700' }}>
                <span>Списано</span>
                <span style={{ color: '#111827' }}>{total.toLocaleString()} сум</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#f7f8fa' }}>
          <button onClick={() => onOpen(lesson)} style={{
            background: '#7c3aed', color: '#fff', border: 'none', padding: '9px 16px',
            borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flex: 1,
          }}>
            {conducted ? '✎ Открыть занятие' : '✓ Открыть и провести'}
          </button>
          <button onClick={onClose} style={{
            background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
            padding: '9px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
          }}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

// Неделя должна помещаться в экран целиком: возить её вправо-влево, чтобы увидеть
// понедельник и воскресенье, неудобно. Поэтому колонки дней сжимаемы —
// `minmax(0, 1fr)`, а не фиксированные 140px. Нижний порог оставлен на телефон:
// семь колонок по 90px там всё равно не прочитать, пусть лучше едет вбок.
function TimeGrid({ days, lessons, clients, onOpen }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
        minWidth: days.length > 1 ? '640px' : 'auto',
      }}>
        {/* Шапка с днями */}
        <div />
        {days.map(day => {
          const isToday = toISO(day) === todayISO()
          return (
            <div key={day.toISOString()} style={{
              textAlign: 'center', padding: '8px 4px', fontSize: '13px',
              borderBottom: '1px solid #e5e7eb',
              color: isToday ? '#7c3aed' : '#4b5563',
              fontWeight: isToday ? '700' : '500',
            }}>
              {days.length > 1
                ? `${String(day.getDate()).padStart(2, '0')}.${String(day.getMonth() + 1).padStart(2, '0')}, ${WEEKDAY_SHORT[(day.getDay() + 6) % 7]}`
                : WEEKDAY_SHORT[(day.getDay() + 6) % 7]}
            </div>
          )
        })}

        {/* Часы */}
        <div style={{ borderRight: '1px solid #e5e7eb' }}>
          {hours.slice(0, -1).map(hour => (
            <div key={hour} style={{
              height: `${HOUR_HEIGHT}px`, fontSize: '12px', color: '#9ca3af',
              textAlign: 'right', paddingRight: '8px', transform: 'translateY(-7px)',
            }}>{hour}:00</div>
          ))}
        </div>

        {/* Колонки дней */}
        {days.map(day => {
          const dayLessons = lessonsOn(lessons, day)
          return (
            <div key={day.toISOString()} style={{
              position: 'relative',
              borderRight: '1px solid #f3f4f6',
              height: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT}px`,
              background: 'repeating-linear-gradient(to bottom, transparent, transparent 55px, #f3f4f6 55px, #f3f4f6 56px)',
            }}>
              {dayLessons.map((lesson, index) => {
                const box = lessonBox(lesson)
                const width = 100 / dayLessons.length
                return (
                  <div key={lesson.id} style={{
                    position: 'absolute', top: `${box.top}px`, height: `${box.height}px`,
                    left: `${index * width}%`, width: `calc(${width}% - 4px)`, padding: '0 2px',
                  }}>
                    {/* В режиме «День» колонка одна и широкая: там даже соседние
                        занятия показываются полностью, тесно только в неделе. */}
                    <LessonChip lesson={lesson} clients={clients} onOpen={onOpen}
                      compact={dayLessons.length > 1}
                      dense={days.length > 1 && dayLessons.length > 1} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthGrid({ date, lessons, clients, onOpen }) {
  const weeks = monthGrid(date)
  const currentMonth = date.getMonth()

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '760px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {WEEKDAY_SHORT.map(day => (
            <div key={day} style={{
              textAlign: 'center', padding: '8px', fontSize: '12px',
              color: '#6b7280', fontWeight: '600', borderBottom: '1px solid #e5e7eb',
            }}>{day}</div>
          ))}
        </div>

        {weeks.map((week, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map(day => {
              const dayLessons = lessonsOn(lessons, day)
              const isToday = toISO(day) === todayISO()
              const other = day.getMonth() !== currentMonth
              return (
                <div key={day.toISOString()} style={{
                  minHeight: '110px', border: '1px solid #f3f4f6', padding: '6px',
                  background: other ? '#fafafa' : '#ffffff',
                }}>
                  <div style={{
                    fontSize: '12px', marginBottom: '6px', textAlign: 'right',
                    color: isToday ? '#7c3aed' : other ? '#9ca3af' : '#4b5563',
                    fontWeight: isToday ? '700' : '500',
                  }}>{day.getDate()}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {dayLessons.slice(0, 3).map(lesson => (
                      <LessonChip key={lesson.id} lesson={lesson} clients={clients} onOpen={onOpen} compact />
                    ))}
                    {dayLessons.length > 3 && (
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>…и ещё {dayLessons.length - 3}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LessonCalendar({
  lessons, clients, teachers = [], view, date, onViewChange, onDateChange, onOpen,
}) {
  const days = view === 'day' ? [date] : weekDays(date)
  // Клик по плитке сначала показывает превью; полную карточку открывает
  // «Открыть занятие» внутри превью. Так задумано в AlfaCRM: сперва заглянуть.
  const [preview, setPreview] = useState(null)

  const openFull = (lesson) => { setPreview(null); onOpen(lesson) }

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px', gap: '12px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onDateChange(shiftDate(date, view, -1))} style={navBtn}>‹</button>
          <button onClick={() => onDateChange(shiftDate(date, view, 1))} style={navBtn}>›</button>
          <button onClick={() => onDateChange(new Date())} style={navBtn}>Сегодня</button>
        </div>

        <h3 style={{ fontSize: '17px', fontWeight: '600', color: '#111827', margin: 0 }}>
          {rangeTitle(date, view)}
        </h3>

        <div style={{ display: 'flex' }}>
          {VIEWS.map((v, i) => (
            <button key={v.value} onClick={() => onViewChange(v.value)} style={{
              ...viewBtn(view === v.value),
              borderRadius: i === 0 ? '8px 0 0 8px' : i === VIEWS.length - 1 ? '0 8px 8px 0' : 0,
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {view === 'month'
        ? <MonthGrid date={date} lessons={lessons} clients={clients} onOpen={setPreview} />
        : <TimeGrid days={days} lessons={lessons} clients={clients} onOpen={setPreview} />}

      {preview && (
        <LessonPreview
          lesson={preview}
          clients={clients}
          teachers={teachers}
          onOpen={openFull}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
