import { LESSON_STATUSES, todayISO } from '../lib/group'
import {
  VIEWS, WEEKDAY_SHORT, HOUR_HEIGHT, DAY_START_HOUR, DAY_END_HOUR,
  hours, monthGrid, weekDays, lessonsOn, lessonBox, rangeTitle, shiftDate, toISO,
} from '../lib/calendar'

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

function LessonChip({ lesson, clients, onOpen, compact }) {
  const style = lessonStyle(lesson)
  const names = (lesson.studentIds || [])
    .map(id => clients.find(c => c.id === id)?.childName)
    .filter(Boolean)

  return (
    <div onClick={() => onOpen(lesson)} title={`${lesson.timeFrom}–${lesson.timeTo}`} style={{
      background: style.background, border: `1px solid ${style.border}`,
      borderRadius: '8px', padding: compact ? '4px 6px' : '6px 8px',
      cursor: 'pointer', overflow: 'hidden', height: '100%',
      textDecoration: style.strike ? 'line-through' : 'none',
    }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: style.color }}>
        {lesson.status === 'conducted' ? '✓ ' : lesson.status === 'cancelled' ? '⊖ ' : ''}
        {lesson.timeFrom}–{lesson.timeTo}
      </div>
      <div style={{ fontSize: '12px', color: style.color, fontWeight: '600' }}>
        {lesson.groupName || 'Занятие'}
      </div>
      {!compact && names.length > 0 && (
        <div style={{ fontSize: '11px', color: style.color, marginTop: '4px', lineHeight: 1.5 }}>
          {names.slice(0, 8).map(n => <div key={n}>· {n}</div>)}
          {names.length > 8 && <div>…и ещё {names.length - 8}</div>}
        </div>
      )}
      {compact && (
        <div style={{ fontSize: '11px', color: style.color }}>👶 {names.length}</div>
      )}
    </div>
  )
}

function TimeGrid({ days, lessons, clients, onOpen }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, minmax(140px, 1fr))`, minWidth: days.length > 1 ? '900px' : 'auto' }}>
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
                    <LessonChip lesson={lesson} clients={clients} onOpen={onOpen}
                      compact={dayLessons.length > 1} />
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

export default function LessonCalendar({ lessons, clients, view, date, onViewChange, onDateChange, onOpen }) {
  const days = view === 'day' ? [date] : weekDays(date)

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
        ? <MonthGrid date={date} lessons={lessons} clients={clients} onOpen={onOpen} />
        : <TimeGrid days={days} lessons={lessons} clients={clients} onOpen={onOpen} />}
    </div>
  )
}
