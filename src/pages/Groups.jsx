import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'
import GroupForm from '../components/GroupForm'
import {
  LESSON_STATUSES, emptyGroupForm, groupToForm, formToGroupDoc,
  generateDates, scheduleLabel, periodLabel, todayISO,
} from '../lib/group'

const panel = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
  marginBottom: '16px',
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

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [lessons, setLessons] = useState([])
  const [clients, setClients] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [searchParams] = useSearchParams()

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [gs, ls, cs, ts] = await withTimeout(Promise.all([
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'lessons')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'teachers')),
      ]))
      setGroups(gs.docs.map(d => ({ id: d.id, ...d.data() })))
      setLessons(ls.docs.map(d => ({ id: d.id, ...d.data() })))
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setTeachers(ts.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Переход из карточки клиента: /groups?open=<id> раскрывает нужную группу.
  useEffect(() => {
    const open = searchParams.get('open')
    if (open) setExpandedId(open)
  }, [searchParams])

  const groupLessons = (groupId) =>
    lessons.filter(l => l.groupId === groupId).sort((a, b) => a.date.localeCompare(b.date))

  // Создание серии: группа и все её занятия пишутся одной транзакцией.
  const handleCreate = async (form) => {
    setSaving(true)
    try {
      const data = formToGroupDoc(form)
      const dates = generateDates(form)
      const groupRef = doc(collection(db, 'groups'))

      const batch = writeBatch(db)
      batch.set(groupRef, { ...data, archived: false, createdAt: new Date() })

      for (const date of dates) {
        batch.set(doc(collection(db, 'lessons')), {
          groupId: groupRef.id,
          groupName: data.name,
          date,
          timeFrom: data.timeFrom,
          timeTo: data.timeTo,
          teacherId: data.teacherId,
          type: 'group',
          topic: '',
          status: 'planned',
          studentIds: data.studentIds,
          attendance: [],
          createdAt: new Date(),
        })
      }
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

  // Расписание можно менять, пока ни одно занятие группы не проведено.
  // Как только появились списания, дни и период замораживаются.
  const hasConducted = (groupId) =>
    lessons.some(l => l.groupId === groupId && l.status === 'conducted')

  // Правка группы. Состав и педагог переносятся только в запланированные занятия:
  // у проведённых менять состав нельзя — поедут балансы.
  const handleUpdate = async (groupId, form) => {
    const scheduleLocked = hasConducted(groupId)
    const data = formToGroupDoc(form)
    const planned = lessons.filter(l => l.groupId === groupId && l.status === 'planned')

    // Расписание открыто — пересоздаём запланированные занятия по новым дням.
    if (!scheduleLocked) {
      const dates = generateDates(form)
      const message = `Расписание изменится.\n\nЗапланированных занятий будет удалено: ${planned.length}.\nСоздано заново: ${dates.length}.`
      if (!confirm(message)) return
    }

    setSaving(true)
    try {
      const batch = writeBatch(db)

      if (scheduleLocked) {
        batch.update(doc(db, 'groups', groupId), {
          name: data.name,
          teacherId: data.teacherId,
          studentIds: data.studentIds,
        })
        for (const lesson of planned) {
          batch.update(doc(db, 'lessons', lesson.id), {
            groupName: data.name,
            teacherId: data.teacherId,
            studentIds: data.studentIds,
          })
        }
      } else {
        batch.update(doc(db, 'groups', groupId), data)
        for (const lesson of planned) batch.delete(doc(db, 'lessons', lesson.id))
        for (const date of generateDates(form)) {
          batch.set(doc(collection(db, 'lessons')), {
            groupId,
            groupName: data.name,
            date,
            timeFrom: data.timeFrom,
            timeTo: data.timeTo,
            teacherId: data.teacherId,
            type: 'group',
            topic: '',
            status: 'planned',
            studentIds: data.studentIds,
            attendance: [],
            createdAt: new Date(),
          })
        }
      }

      await batch.commit()
      setEditingId(null)
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Удаляем группу и её будущие запланированные занятия.
  // Проведённые остаются в истории — за ними стоят деньги.
  const handleDelete = async (group) => {
    const all = groupLessons(group.id)
    const today = todayISO()
    const removable = all.filter(l => l.status === 'planned' && l.date >= today)
    const kept = all.length - removable.length

    const message = kept > 0
      ? `Удалить «${group.name}»?\n\nБудет удалено запланированных занятий: ${removable.length}.\nПроведённых и прошедших занятий останется в истории: ${kept}.`
      : `Удалить «${group.name}» и её занятий: ${removable.length}?`
    if (!confirm(message)) return

    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'groups', group.id))
      for (const lesson of removable) batch.delete(doc(db, 'lessons', lesson.id))
      await batch.commit()
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || null

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>👥 Группы</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Серия занятий: расписание и состав учеников
          </p>
        </div>
        {!creating && !editingId && (
          <button onClick={() => setCreating(true)} style={btn()}>+ Создать группу</button>
        )}
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {creating && (
        <GroupForm
          initial={emptyGroupForm()}
          clients={clients}
          teachers={teachers}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {groups.length === 0 && !creating ? (
        <div style={{ ...panel, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Групп пока нет. Создайте «Группу сб 11» или интенсив на несколько дней.
          </p>
        </div>
      ) : (
        groups.map(group => {
          if (editingId === group.id) {
            return (
              <GroupForm
                key={group.id}
                initial={groupToForm(group)}
                clients={clients}
                teachers={teachers}
                saving={saving}
                scheduleLocked={hasConducted(group.id)}
                editing
                onSubmit={form => handleUpdate(group.id, form)}
                onCancel={() => setEditingId(null)}
              />
            )
          }

          const all = groupLessons(group.id)
          const today = todayISO()
          const upcoming = all.filter(l => l.status === 'planned' && l.date >= today)
          const conducted = all.filter(l => l.status === 'conducted')
          const expanded = expandedId === group.id
          const teacher = teacherName(group.teacherId)

          return (
            <div key={group.id} style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 }}>{group.name}</h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <span style={chip('#ede9fe', '#5b21b6')}>🗓 {scheduleLabel(group)}</span>
                    <span style={chip('#f3f4f6', '#4b5563')}>{periodLabel(group)}</span>
                    <span style={chip('#f3f4f6', '#4b5563')}>👶 {(group.studentIds || []).length} учеников</span>
                    {teacher
                      ? <span style={chip('#f3f4f6', '#4b5563')}>🎓 {teacher}</span>
                      : <span style={chip('#fee2e2', '#b91c1c')}>🎓 педагог не выбран</span>}
                  </div>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '10px' }}>
                    Занятий всего {all.length}: впереди {upcoming.length}, проведено {conducted.length}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setExpandedId(expanded ? null : group.id)} style={secondaryBtn}>
                    {expanded ? 'Скрыть занятия' : 'Занятия'}
                  </button>
                  <button onClick={() => { setCreating(false); setEditingId(group.id) }} style={secondaryBtn}>Изменить</button>
                  <button onClick={() => handleDelete(group)} style={secondaryBtn}>Удалить</button>
                </div>
              </div>

              {expanded && (
                <div style={{ marginTop: '14px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                  {all.length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: '13px' }}>Занятий нет</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                      {all.map(lesson => {
                        const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
                        const past = lesson.date < today && lesson.status === 'planned'
                        return (
                          <div key={lesson.id} style={{
                            border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px',
                            background: past ? '#fffbeb' : '#ffffff',
                          }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                              {new Date(lesson.date).toLocaleDateString('ru')}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                              {lesson.timeFrom}–{lesson.timeTo}
                            </div>
                            <span style={chip(status.background, status.color)}>{status.label}</span>
                            {past && (
                              <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>
                                Забыли провести?
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
                    Отметить присутствие и провести занятие можно будет во вкладке «Уроки».
                  </p>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
