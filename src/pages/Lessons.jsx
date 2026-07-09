import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'
import LessonJournal from '../components/LessonJournal'
import LessonForm from '../components/LessonForm'
import { LESSON_STATUSES, todayISO } from '../lib/group'
import { buildJournal, journalToAttendance, lessonTypeLabel, formatLessonDate } from '../lib/lesson'

const panel = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '18px',
  marginBottom: '12px',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const secondaryBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none',
}

const TABS = [
  { value: 'upcoming', label: 'Предстоящие' },
  { value: 'planned', label: 'Запланированные' },
  { value: 'conducted', label: 'Проведённые' },
  { value: 'cancelled', label: 'Отменённые' },
]

export default function Lessons() {
  const [lessons, setLessons] = useState([])
  const [clients, setClients] = useState([])
  const [teachers, setTeachers] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('upcoming')
  const [journalId, setJournalId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ls, cs, ts, ps] = await withTimeout(Promise.all([
        getDocs(collection(db, 'lessons')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'payments')),
      ]))
      setLessons(ls.docs.map(d => ({ id: d.id, ...d.data() })))
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setTeachers(ts.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Проведение: статус занятия и списания пишутся одной транзакцией.
  // У каждого присутствующего своя сумма — та, что стоит в журнале.
  const handleConduct = async (lesson, rows) => {
    setSaving(true)
    try {
      const attendance = journalToAttendance(rows)
      const batch = writeBatch(db)

      batch.update(doc(db, 'lessons', lesson.id), { status: 'conducted', attendance })

      for (const record of attendance) {
        if (record.status !== 'present' || record.amountCharged <= 0) continue
        batch.set(doc(collection(db, 'payments')), {
          clientId: record.clientId,
          clientName: record.clientName,
          amount: record.amountCharged,
          type: 'session',
          sessions: 1,
          description: lesson.groupName || lessonTypeLabel(lesson.type),
          lessonId: lesson.id,
          date: new Date(`${lesson.date}T${lesson.timeFrom || '00:00'}`),
        })
      }

      await batch.commit()
      setJournalId(null)
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Возврат в запланированные: удаляем списания, порождённые этим занятием.
  // Без этого деньги остались бы списаны за занятие, которого не было.
  const rollbackPayments = (batch, lessonId) => {
    const related = payments.filter(p => p.lessonId === lessonId)
    for (const payment of related) batch.delete(doc(db, 'payments', payment.id))
    return related.length
  }

  const handleReturnToPlanned = async (lesson) => {
    const related = payments.filter(p => p.lessonId === lesson.id)
    const total = related.reduce((s, p) => s + (p.amount || 0), 0)
    const message = related.length
      ? `Вернуть занятие в запланированные?\n\nБудет отменено списаний: ${related.length} на ${total.toLocaleString()} сум. Деньги вернутся на баланс учеников.`
      : 'Вернуть занятие в запланированные?'
    if (!confirm(message)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      rollbackPayments(batch, lesson.id)
      batch.update(doc(db, 'lessons', lesson.id), { status: 'planned', attendance: [] })
      await batch.commit()
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (lesson) => {
    const related = payments.filter(p => p.lessonId === lesson.id)
    const message = related.length
      ? `Отменить занятие?\n\nБудет отменено списаний: ${related.length}. Деньги вернутся на баланс учеников.`
      : 'Отменить занятие?'
    if (!confirm(message)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      rollbackPayments(batch, lesson.id)
      batch.update(doc(db, 'lessons', lesson.id), { status: 'cancelled', attendance: [] })
      await batch.commit()
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (lesson) => {
    await updateDoc(doc(db, 'lessons', lesson.id), { status: 'planned' })
    await fetchData()
  }

  const handleDelete = async (lesson) => {
    const related = payments.filter(p => p.lessonId === lesson.id)
    if (related.length) {
      alert('Сначала верните занятие в запланированные — за ним стоят списания.')
      return
    }
    if (!confirm('Удалить занятие?')) return
    await deleteDoc(doc(db, 'lessons', lesson.id))
    await fetchData()
  }

  const handleCreate = async (data) => {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      batch.set(doc(collection(db, 'lessons')), {
        ...data,
        groupId: null,
        groupName: '',
        status: 'planned',
        attendance: [],
        createdAt: new Date(),
      })
      await batch.commit()
      setCreating(false)
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || null
  const today = todayISO()

  const query = search.trim().toLowerCase()
  const filtered = lessons
    .filter(l => {
      if (query) {
        const haystack = `${l.groupName || ''} ${l.topic || ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (tab === 'upcoming') return l.status === 'planned' && l.date >= today
      if (tab === 'planned') return l.status === 'planned'
      return l.status === tab
    })
    .sort((a, b) => tab === 'conducted'
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date))

  const overdue = lessons.filter(l => l.status === 'planned' && l.date < today)

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>📅 Уроки</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Журнал занятий: присутствие и списания
          </p>
        </div>
        {!creating && <button onClick={() => setCreating(true)} style={btn()}>+ Разовое занятие</button>}
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {overdue.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px',
          padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#92400e',
        }}>
          Занятий прошло, но не проведено: <b>{overdue.length}</b>. Их даты уже позади — отметьте присутствие или отмените.
        </div>
      )}

      {creating && (
        <LessonForm
          clients={clients}
          teachers={teachers}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', background: '#ffffff', padding: '4px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)} style={{
              background: tab === t.value ? '#ede9fe' : 'transparent',
              color: tab === t.value ? '#7c3aed' : '#6b7280',
              border: 'none', padding: '8px 14px', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>{t.label}</button>
          ))}
        </div>
        <input placeholder="🔍 Поиск по группе или теме" style={{ ...inputStyle, width: '240px' }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Занятий нет</p>
        </div>
      ) : (
        filtered.map(lesson => {
          const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
          const isOverdue = lesson.status === 'planned' && lesson.date < today
          const teacher = teacherName(lesson.teacherId)
          const open = journalId === lesson.id
          const conductedSum = (lesson.attendance || [])
            .reduce((s, a) => s + (a.amountCharged || 0), 0)
          const presentCount = (lesson.attendance || []).filter(a => a.status === 'present').length

          return (
            <div key={lesson.id} style={{ ...panel, background: isOverdue ? '#fffbeb' : '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>
                      {formatLessonDate(lesson.date)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                      {lesson.timeFrom}–{lesson.timeTo}
                    </span>
                    <span style={chip(status.background, status.color)}>{status.label}</span>
                    {isOverdue && <span style={chip('#fef3c7', '#b45309')}>Забыли провести?</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {lesson.groupName
                      ? <span style={chip('#ede9fe', '#5b21b6')}>👥 {lesson.groupName}</span>
                      : <span style={chip('#f3f4f6', '#4b5563')}>{lessonTypeLabel(lesson.type)}</span>}
                    <span style={chip('#f3f4f6', '#4b5563')}>👶 {(lesson.studentIds || []).length} учеников</span>
                    {teacher && <span style={chip('#f3f4f6', '#4b5563')}>🎓 {teacher}</span>}
                    {lesson.status === 'conducted' && (
                      <span style={chip('#dcfce7', '#059669')}>
                        ✓ {presentCount} пришло · {conductedSum.toLocaleString()} сум
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                  {lesson.status === 'planned' && (
                    <>
                      <button onClick={() => setJournalId(open ? null : lesson.id)} style={btn('#059669')}>
                        {open ? 'Закрыть журнал' : 'Провести'}
                      </button>
                      <button onClick={() => handleCancel(lesson)} style={secondaryBtn}>Отменить</button>
                      <button onClick={() => handleDelete(lesson)} style={secondaryBtn}>Удалить</button>
                    </>
                  )}
                  {lesson.status === 'conducted' && (
                    <button onClick={() => handleReturnToPlanned(lesson)} disabled={saving} style={secondaryBtn}>
                      ↩ Вернуть в запланированные
                    </button>
                  )}
                  {lesson.status === 'cancelled' && (
                    <>
                      <button onClick={() => handleRestore(lesson)} style={secondaryBtn}>Восстановить</button>
                      <button onClick={() => handleDelete(lesson)} style={secondaryBtn}>Удалить</button>
                    </>
                  )}
                </div>
              </div>

              {open && (
                <div style={{ marginTop: '14px' }}>
                  <LessonJournal
                    rows={buildJournal(lesson, clients)}
                    saving={saving}
                    onConduct={rows => handleConduct(lesson, rows)}
                    onCancel={() => setJournalId(null)}
                  />
                </div>
              )}

              {lesson.status === 'conducted' && (lesson.attendance || []).length > 0 && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                  {lesson.attendance.map(a => (
                    <div key={a.clientId} style={{
                      display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px',
                    }}>
                      <span style={{ color: a.status === 'present' ? '#111827' : '#9ca3af' }}>
                        {a.status === 'present' ? '✓' : '✗'} {a.clientName}
                      </span>
                      <span style={{ color: a.amountCharged > 0 ? '#dc2626' : '#9ca3af' }}>
                        {a.amountCharged > 0 ? `−${a.amountCharged.toLocaleString()} сум` : 'не списано'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
