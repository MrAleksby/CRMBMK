import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, doc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, invalidate } from '../lib/store'
import { useLiveRefresh } from '../lib/useLiveRefresh'
import { useAuth } from '../AuthContext'
import { canManage } from '../lib/access'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'
import GroupForm from '../components/GroupForm'
import {
  LESSON_STATUSES, emptyGroupForm, groupToForm, formToGroupDoc,
  generateDates, scheduleLabel, periodLabel, todayISO, planScheduleChange,
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

  // Педагог группы только смотрит: расписание и состав. Правит менеджер.
  const { user, profile } = useAuth()
  const manages = canManage(user?.uid, profile)

  const fetchData = async (force = false) => {
    setLoadError('')
    // Большие коллекции слушаются подписками и всегда свежие — перечитывать их
    // после своей записи не нужно. Сбрасываем только разовые запросы (занятия дня).
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [gs, ls, cs, ts] = await Promise.all([
        readCollection('groups', { force }),
        readCollection('lessons', { force }),
        readCollection('clients', { force }),
        readCollection('teachers', { force }),
      ])
      setGroups(gs)
      setLessons(ls)
      setClients(cs)
      setTeachers(ts)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Чужая правка приходит подпиской — перекладываем её в состояние страницы.
  useLiveRefresh(fetchData)

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
      await fetchData(true)
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

  // Правка группы.
  //
  // Проведённые занятия не трогаются никогда: за ними стоят списания, и правка
  // задним числом сдвинула бы балансы учеников. Всё остальное — название,
  // педагог, состав, расписание и период — правится свободно, а изменения
  // применяются к запланированным занятиям.
  //
  // Раньше расписание замораживалось целиком, стоило провести одно занятие.
  // Из-за этого группу, которая больше не ведётся, нельзя было закрыть датой,
  // и её занятия отменяли по одному — календарь пестрел перечёркнутыми плитками.
  const handleUpdate = async (groupId, form) => {
    const data = formToGroupDoc(form)
    const own = groupLessons(groupId)
    const plan = planScheduleChange(own, generateDates(form))

    if (plan.toDelete.length || plan.toCreate.length) {
      const parts = []
      if (plan.toCreate.length) parts.push(`создано: ${plan.toCreate.length}`)
      if (plan.toDelete.length) parts.push(`удалено запланированных: ${plan.toDelete.length}`)
      if (plan.kept) parts.push(`останется без изменений: ${plan.kept}`)
      const conducted = own.filter(l => l.status === 'conducted').length
      const tail = conducted
        ? `\n\nПроведённые занятия (${conducted}) не изменятся: за ними стоят списания.`
        : ''
      if (!confirm(`Расписание изменится.\n\n${parts.join('\n')}.${tail}`)) return
    }

    setSaving(true)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'groups', groupId), data)

      // Состав и педагог переносятся во все запланированные занятия, включая
      // те, что остались на своих датах.
      for (const lesson of own) {
        if (lesson.status !== 'planned') continue
        if (plan.toDelete.some(l => l.id === lesson.id)) continue
        batch.update(doc(db, 'lessons', lesson.id), {
          groupName: data.name,
          teacherId: data.teacherId,
          studentIds: data.studentIds,
          timeFrom: data.timeFrom,
          timeTo: data.timeTo,
        })
      }

      for (const lesson of plan.toDelete) batch.delete(doc(db, 'lessons', lesson.id))

      for (const date of plan.toCreate) {
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

      await batch.commit()
      setEditingId(null)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Удаляем группу и её будущие запланированные занятия.
  // Проведённые остаются в истории — за ними стоят деньги.
  // Удаление группы уносит с собой все её занятия, за которыми не стоят деньги:
  // запланированные и отменённые, включая прошедшие. Раньше удалялись только
  // будущие, и в календаре оставались висеть занятия несуществующей группы.
  //
  // Проведённые остаются в истории: за ними списания, и стереть их значило бы
  // задним числом изменить балансы учеников и доходы прошлых месяцев.
  const handleDelete = async (group) => {
    const all = groupLessons(group.id)
    const removable = all.filter(l => l.status !== 'conducted')
    const kept = all.length - removable.length

    const message = kept > 0
      ? `Удалить «${group.name}»?\n\nБудет удалено незавершённых занятий: ${removable.length}.\nПроведённых останется в истории: ${kept} — за ними стоят списания.`
      : `Удалить «${group.name}» и её занятий: ${removable.length}?`
    if (!confirm(message)) return

    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'groups', group.id))
      for (const lesson of removable) batch.delete(doc(db, 'lessons', lesson.id))
      await batch.commit()
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  // Удаление одного занятия группы. Проведённое не трогаем: за ним списания,
  // и убрать его можно только через «Уроки», вернув сначала в запланированные.
  const handleDeleteLesson = async (lesson) => {
    if (lesson.status === 'conducted') return
    const when = new Date(lesson.date).toLocaleDateString('ru')
    if (!confirm(`Удалить занятие ${when} ${lesson.timeFrom || ''}?`)) return

    try {
      await deleteDoc(doc(db, 'lessons', lesson.id))
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || null

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="groups" size={20} style={{ color: '#4f46e5' }} />Группы
          </h2>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            Серия занятий: расписание и состав учеников
          </p>
        </div>
       {manages && !creating && !editingId && (
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
                    <span style={chip('#ede9fe', '#5b21b6')}>{scheduleLabel(group)}</span>
                    <span style={chip('#f3f4f6', '#4b5563')}>{periodLabel(group)}</span>
                    <span style={chip('#f3f4f6', '#4b5563')}>{(group.studentIds || []).length} учеников</span>
                   {teacher
                      ? <span style={chip('#f3f4f6', '#4b5563')}>{teacher}</span>
                      : <span style={chip('#fee2e2', '#b91c1c')}>педагог не выбран</span>}
                  </div>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '10px' }}>
                    Занятий всего {all.length}: впереди {upcoming.length}, проведено {conducted.length}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setExpandedId(expanded ? null : group.id)} style={secondaryBtn}>
                   {expanded ? 'Скрыть занятия' : 'Занятия'}
                  </button>
                 {manages && (
                    <>
                      <button onClick={() => { setCreating(false); setEditingId(group.id) }} style={secondaryBtn}>Изменить</button>
                      <button onClick={() => handleDelete(group)} style={secondaryBtn}>Удалить</button>
                    </>
                  )}
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
                           {/* Непроведённое занятие можно удалить прямо здесь: за ним
                                не стоит ни денег, ни истории. Бывает, что занятие
                                назначили по ошибке, и отменять его незачем — оно
                                тогда останется перечёркнутым в календаре. */}
                           {manages && lesson.status !== 'conducted' && (
                              <button onClick={() => handleDeleteLesson(lesson)} style={{
                                background: 'transparent', border: 'none', padding: '4px 0 0',
                                color: '#dc2626', fontSize: '12px', cursor: 'pointer',
                              }}>Удалить</button>
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
