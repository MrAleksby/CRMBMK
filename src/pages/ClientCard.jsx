import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { toAmount } from '../lib/amount'
import { withTimeout, describeError } from '../lib/withTimeout'
import { useAuth } from '../AuthContext'
import { canManage } from '../lib/access'
import ClientForm from '../components/ClientForm'
import ErrorBanner from '../components/ErrorBanner'
import AttendanceWidget from '../components/AttendanceWidget'
import SubscriptionForm from '../components/SubscriptionForm'
import {
  lessonsLeft, subscriptionStatus, subscriptionPerLesson, periodLabel as subPeriod,
  formToSubscriptionDoc, subscriptionTitle, splitSubscriptions, subscriptionToForm,
  paymentFromForm,
} from '../lib/subscription'
import {
  getAge, ageLabel, formatBirthday, contactRows, contactTitle, sourceInfo, genderInfo, statusInfo,
  clientToForm, instagramUrl, telegramUrl, phoneUrl, parentPhones, isLeadClient,
  clientHistory, whyKeepClient, STATUS_DROPPED,
} from '../lib/client'
import { MONTHS_SHORT } from '../lib/constants'
import { KIND_INCOME, toJsDate, inPeriod as inMonth, availableYears } from '../lib/finance'
import { readCollection, readClientMoney, invalidate } from '../lib/store'
import { categoriesForKind } from '../lib/transaction'
import { clientBalance } from '../lib/balance'
import { sortItems, getDirectory } from '../lib/directories'

const panel = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

const inputStyle = {
  background: '#f7f8fa',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '8px 12px',
  color: '#111827',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
}

const btn = (color = '#7c3aed') => ({
  background: color,
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
})

const secondaryBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const link = { color: '#7c3aed', textDecoration: 'none' }

const notSet = { color: '#dc2626', fontStyle: 'italic', fontSize: '13px' }

// Строка правой колонки-сводки: подпись слева, значение справа.
function SummaryRow({ label, children, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '4px 0', fontSize: '12px', alignItems: 'baseline',
    }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#111827', textAlign: 'right', minWidth: 0 }}>
        {children}
        {action}
      </span>
    </div>
  )
}

function SummaryBlock({ title, action, children }) {
  return (
    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '9px', marginTop: '9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#111827' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

const subIcon = {
  background: 'transparent', border: 'none', padding: '0 2px',
  color: '#9ca3af', fontSize: '12px', cursor: 'pointer',
}

// Строка абонемента, как в AlfaCRM: «Пакет 8 (2 640 000/8)», под ним период
// и цена занятия. Архивный зачёркнут — он цену уже не даёт.
function SubscriptionRow({ sub, archived, onEdit, onArchive, onRestore, onDelete }) {
  const status = subscriptionStatus(sub)
  const perLesson = subscriptionPerLesson(sub)

  return (
    <div style={{ marginBottom: '10px', opacity: archived ? 0.75 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'center' }}>
        <span style={{
          fontSize: '13px', color: '#111827', fontWeight: '600',
          textDecoration: archived ? 'line-through' : 'none',
        }}>🎫 {subscriptionTitle(sub)}</span>

        <span style={{ display: 'flex', flexShrink: 0 }}>
          <button onClick={onEdit} title="Править абонемент" style={subIcon}>✎</button>
          {onArchive && <button onClick={onArchive} title="Убрать в архив" style={subIcon}>📦</button>}
          {onRestore && <button onClick={onRestore} title="Вернуть из архива" style={subIcon}>↩</button>}
          <button onClick={onDelete} title="Удалить абонемент" style={subIcon}>✕</button>
        </span>
      </div>

      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        {sub.lessonsTotal} уроков
        {perLesson !== null && ` · ${perLesson.toLocaleString()} сум за урок`}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
          background: status.background, color: status.color,
        }}>{status.label}</span>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>{subPeriod(sub)}</span>
      </div>

      {sub.note && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{sub.note}</div>
      )}
    </div>
  )
}

export default function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [client, setClient] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
  const [lessons, setLessons] = useState([])
  const [groups, setGroups] = useState([])
  const [teachers, setTeachers] = useState([])
  const [allClients, setAllClients] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [packages, setPackages] = useState([])
  const [issuing, setIssuing] = useState(false)
  const [editingSub, setEditingSub] = useState(null)
  const [showArchivedSubs, setShowArchivedSubs] = useState(false)
  const [pickGroup, setPickGroup] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [pickedLessons, setPickedLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ open: false })

  // Педагог карточку только смотрит: ни денег, ни правки, ни записи на занятия.
  const { user, profile } = useAuth()
  const manages = canManage(user?.uid, profile)

  const fetchData = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())

      const [snap, les, ls, gs, ts, cs] = await Promise.all([
        withTimeout(getDoc(doc(db, 'clients', id))),
        readCollection('legalEntities', { force }),
        readCollection('lessons', { force }),
        readCollection('groups', { force }),
        readCollection('teachers', { force }),
        readCollection('clients', { force }),
      ])
      setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLegalEntities(les)
      setLessons(ls)
      setGroups(gs)
      setTeachers(ts)
      setAllClients(cs)

      // Педагогу карточка нужна ради возраста, аллергий и телефона родителя.
      // Деньги — оплаты, начисления, абонементы, кассы — ему не отдаются вовсе.
      if (!manages) return

      const [tx, ch, ss, pk, acc, cat] = await Promise.all([
        readClientMoney({ force }),
        readCollection('charges', { force }),
        readCollection('subscriptions', { force }),
        readCollection('packages', { force }),
        readCollection('accounts', { force }),
        readCollection('categories', { force }),
      ])
      setTransactions(tx.filter(t => t.clientId === id))
      setCharges(ch.filter(c => c.clientId === id))
      setSubscriptions(ss.filter(x => x.clientId === id))
      setPackages(pk)
      setAccounts(sortItems(getDirectory('accounts'), acc))
      setCategories(sortItems(getDirectory('categories'), cat))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Лента лицевого счёта: оплаты и начисления за занятия вперемешку, свежие сверху.
  const entries = [
    ...transactions.map(t => ({ ...t, _charge: false })),
    ...charges.map(c => ({ ...c, _charge: true })),
  ].sort((a, b) => (toJsDate(b.date)?.getTime() || 0) - (toJsDate(a.date)?.getTime() || 0))

  const balance = clientBalance(transactions, charges, id)
  const periodEntries = entries.filter(e => inMonth(e, filterMonth, filterYear))
  const incomeCount = transactions.filter(t => t.kind === KIND_INCOME).length
  const lessonsDone = charges.reduce((sum, c) => sum + (c.lessons || 0), 0)
  const myLessons = lessons.filter(l => (l.studentIds || []).includes(id))
  const lessonsPlanned = myLessons.filter(l => l.status === 'planned').length

  // Оплата ложится в кассу как обычная доходная операция, начисление — на лицевой счёт.
  // Приём оплаты. Дата берётся из формы: платежи часто вносят задним числом.
  // Списаний за занятие тут нет — они создаются автоматически при проведении
  // урока в журнале, вручную дублировать нельзя.
  const handlePayment = async () => {
    const amount = toAmount(form.amount)
    if (amount === null || amount === 0) {
      alert('Введите сумму — положительное число')
      return
    }
    if (!form.accountId || !form.categoryId) {
      alert('Выберите кассу и статью')
      return
    }
    const date = new Date(`${form.date}T12:00:00`)
    if (Number.isNaN(date.getTime())) {
      alert('Укажите дату операции')
      return
    }

    setSaving(true)
    try {
      await addDoc(collection(db, 'transactions'), {
        kind: KIND_INCOME,
        clientId: id,
        clientName: client.childName,
        amount,
        accountId: form.accountId,
        categoryId: form.categoryId,
        comment: form.description || '',
        date,
        createdAt: new Date(),
      })
      setForm({ open: false })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'clients', id), data)
      setEditing(false)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Одной транзакцией: иначе оборванное удаление оставит платежи без клиента,
  // и они будут вечно висеть в отчётах.
  // Ученика с историей не удаляем: вместе с ним ушли бы оплаты, а они лежали
  // в кассе — доходы и остатки за прошлые месяцы поехали бы. Вместо этого статус
  // «Бросил». Удалять можно только пустую карточку (дубль, ошибка ввода).
  const handleDeleteClient = async () => {
    const history = clientHistory(id, { transactions, charges, lessons })
    if (!history.isEmpty) {
      alert(whyKeepClient(client, history))
      return
    }
    if (!confirm(`Удалить «${client.childName}»? Карточка пустая: ни оплат, ни проведённых занятий.`)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      for (const s of subscriptions) batch.delete(doc(db, 'subscriptions', s.id))

      // Убираем из состава занятий и групп: иначе в журнале останется
      // «ученик без имени» — ссылка на карточку, которой уже нет.
      for (const lesson of lessons.filter(l => (l.studentIds || []).includes(id))) {
        batch.update(doc(db, 'lessons', lesson.id), {
          studentIds: (lesson.studentIds || []).filter(x => x !== id),
          attendance: (lesson.attendance || []).filter(a => a.clientId !== id),
        })
      }
      for (const group of groups.filter(g => (g.studentIds || []).includes(id))) {
        batch.update(doc(db, 'groups', group.id), {
          studentIds: (group.studentIds || []).filter(x => x !== id),
        })
      }

      batch.delete(doc(db, 'clients', id))
      await batch.commit()
      navigate('/clients')
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
      setSaving(false)
    }
  }

  const handleDrop = async () => {
    if (!confirm(`Перевести «${client.childName}» в статус «Бросил»? Он уйдёт из рабочего списка, история сохранится.`)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'clients', id), { status: STATUS_DROPPED })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Записываем ТОЛЬКО на отмеченные занятия. Группа здесь — фильтр списка,
  // а не подписка на всю серию: дети обычно ходят на ближайшие один-два урока.
  const handleJoinLessons = async () => {
    if (pickedLessons.length === 0) return
    setSaving(true)
    try {
      const batch = writeBatch(db)
      for (const lessonId of pickedLessons) {
        const lesson = lessons.find(l => l.id === lessonId)
        if (!lesson || (lesson.studentIds || []).includes(id)) continue
        batch.update(doc(db, 'lessons', lessonId), {
          studentIds: [...(lesson.studentIds || []), id],
        })
      }
      await batch.commit()
      setPickedLessons([])
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Членство в группе — это принадлежность, а не подписка на все занятия.
  // На конкретные занятия ученик записывается отдельно, ниже.
  // Добавление в группу — только членство: на конкретные занятия ученика
  // записывают отдельно, в блоке «Записать на занятия». Дети ходят не на все
  // уроки группы, а на 1–2 наперёд, поэтому авто-запись на всё была бы неверной.
  const handleJoinGroup = async (groupId) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'groups', groupId), {
        studentIds: [...new Set([...(group.studentIds || []), id])],
      })
      setPickGroup('')
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Выход из группы — только из состава. Уже назначенные занятия остаются:
  // если надо, ученика снимают с них отдельно в блоке ниже.
  const handleLeaveGroup = async (group) => {
    if (!confirm(`Убрать ученика из группы «${group.name}»?\n\nЗаписи на уже назначенные занятия останутся — снимите их отдельно, если нужно.`)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        studentIds: (group.studentIds || []).filter(s => s !== id),
      })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Выдача абонемента и оплата за него — одной транзакцией. Это две записи
  // в разных коллекциях: абонемент задаёт цену занятия, оплата двигает кассу
  // и баланс. Оборванная запись оставила бы абонемент без денег или наоборот.
  const handleIssueSubscription = async (form, pkg) => {
    setSaving(true)
    try {
      const now = new Date()
      const batch = writeBatch(db)
      batch.set(doc(collection(db, 'subscriptions')), {
        ...formToSubscriptionDoc(form, pkg, id),
        createdAt: now,
      })
      batch.set(doc(collection(db, 'transactions')),
        { ...paymentFromForm(form, id, client.childName, pkg?.name), createdAt: now })
      await batch.commit()
      setIssuing(false)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Правка абонемента переписывает и снимок тарифа: сменили пакет — поехала
  // цена занятия, а с ней и остаток в уроках. Денег и начислений это не трогает.
  //
  // status берём у правимого документа: formToSubscriptionDoc всегда ставит
  // 'active', и правка архивного молча вернула бы его в действующие.
  const handleEditSubscription = async (form, pkg) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'subscriptions', editingSub.id), {
        ...formToSubscriptionDoc(form, pkg, id),
        status: editingSub.status || 'active',
      })
      setEditingSub(null)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // В архив, а не в корзину: истории абонементов место в карточке.
  // Архивный цену занятия не даёт, но остаётся видимым.
  const handleArchiveSubscription = async (sub) => {
    try {
      await updateDoc(doc(db, 'subscriptions', sub.id), { status: 'archived' })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const handleRestoreSubscription = async (sub) => {
    try {
      await updateDoc(doc(db, 'subscriptions', sub.id), { status: 'active' })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  // Абонемент задаёт лишь цену занятия. Удаление не трогает ни деньги,
  // ни проведённые занятия — пересчитается только остаток в уроках.
  const handleDeleteSubscription = async (sub) => {
    if (!confirm(`Удалить абонемент «${sub.name}»?\n\nСписания и оплаты останутся. Изменится только остаток в уроках.`)) return
    try {
      await deleteDoc(doc(db, 'subscriptions', sub.id))
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const togglePickedLesson = (lessonId) =>
    setPickedLessons(prev => prev.includes(lessonId)
      ? prev.filter(l => l !== lessonId)
      : [...prev, lessonId])

  const handleLeaveLesson = async (lesson) => {
    if (!confirm(`Снять ученика с занятия ${new Date(lesson.date).toLocaleDateString('ru')}?`)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        studentIds: (lesson.studentIds || []).filter(s => s !== id),
      })
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Начисление за проведённое занятие удалять нельзя: за ним стоит журнал.
  // Такое списание снимается только откатом занятия на странице «Уроки».
  const handleDeleteEntry = async (entry) => {
    if (entry._charge && entry.lessonId) {
      alert('Это списание за проведённое занятие. Верните занятие в запланированные на странице «Уроки».')
      return
    }
    if (!confirm('Удалить запись? Баланс пересчитается.')) return
    try {
      await deleteDoc(doc(db, entry._charge ? 'charges' : 'transactions', entry.id))
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  if (!client) {
    return (
      <div style={{ maxWidth: '1100px' }}>
        <ErrorBanner message={loadError} onRetry={fetchData} />
        <p style={{ color: '#6b7280' }}>Клиент не найден.</p>
        <Link to="/clients" style={link}>← К списку клиентов</Link>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ maxWidth: '1100px' }}>
        <Link to="/clients" style={{ ...link, fontSize: '13px' }}>← К списку</Link>
        <div style={{ height: '14px' }} />
        <ClientForm
          initial={clientToForm(client)}
          saving={saving}
          legalEntities={legalEntities}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  const age = getAge(client)
  const gender = genderInfo(client)
  const source = sourceInfo(client)
  const status = statusInfo(client)
  // Карточка лида. Клиентом он ещё не стал: в списке клиентов его нет, абонементов
  // и групп у него быть не должно — их выдают после конверсии, из воронки.
  const isLead = isLeadClient(client)
  const birthday = formatBirthday(client.birthDate)
  const contacts = contactRows(client)
  const isPaid = balance >= 0
  // Плюс — предоплаченные занятия, минус — неоплаченные проведённые.
  const lessonsInStock = lessonsLeft(subscriptions, id, balance, charges, client)
  const { current: currentSubs, archived: archivedSubs } = splitSubscriptions(subscriptions)
  const periodLabel = filterMonth !== 'all' ? `${MONTHS_SHORT[filterMonth]} ${filterYear}` : 'за всё время'

  // Заказчик — тот, кто платит: юрлицо или родитель (мама приоритетнее).
  const legalPayer = client.payerType === 'legal'
    ? legalEntities.find(e => e.id === client.legalEntityId)
    : null
  const mainParent = contacts.find(r => r.name) || contacts[0] || null
  const mainPhone = mainParent ? parentPhones(mainParent)[0] : null

  const today = new Date().toISOString().slice(0, 10)

  // Группы ученика: где он в составе, плюс те, куда он записан на занятия.
  const myGroups = groups.filter(g => (g.studentIds || []).includes(id))
  const lessonGroupIds = new Set(myLessons.map(l => l.groupId).filter(Boolean))
  const extraGroups = groups.filter(g => !myGroups.includes(g) && lessonGroupIds.has(g.id))
  const availableGroups = groups.filter(g => !(g.studentIds || []).includes(id))

  // Занятия, куда можно записать: запланированные, где ученика ещё нет.
  // Селект группы просто сужает список.
  const joinableLessons = lessons
    .filter(l => l.status === 'planned' && l.date >= today && !(l.studentIds || []).includes(id))
    .filter(l => !filterGroup || l.groupId === filterGroup)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.timeFrom).localeCompare(String(b.timeFrom)))

  const myUpcoming = myLessons
    .filter(l => l.status === 'planned' && l.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const years = availableYears(entries)
  const incomeCategories = categoriesForKind(categories, KIND_INCOME)

  return (
    <div style={{ maxWidth: '1100px' }}>
      {isLead
        ? <Link to="/leads" style={{ ...link, fontSize: '13px' }}>← К воронке лидов</Link>
        : <Link to="/clients" style={{ ...link, fontSize: '13px' }}>← К списку клиентов</Link>}
      <div style={{ height: '14px' }} />

      <ErrorBanner message={loadError} onRetry={fetchData} />

      <div className="client-card-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '16px', alignItems: 'start',
      }}>
        {/* ЛЕВАЯ КОЛОНКА */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={panel}>
            {isLead && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '10px', flexWrap: 'wrap', marginBottom: '14px', padding: '9px 12px',
                background: '#ede9fe', borderRadius: '10px', fontSize: '13px', color: '#5b21b6',
              }}>
                <span>✱ Это лид, а не ученик. В списке клиентов его нет — до конверсии он живёт в воронке.</span>
                <Link to="/leads" style={{ ...link, fontWeight: '600', whiteSpace: 'nowrap' }}>Открыть воронку →</Link>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {gender && <span style={{ fontSize: '20px' }} title={gender.label}>{gender.icon}</span>}
                  <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>{client.childName}</h2>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <span style={chip(status.background, status.color)}>{status.label}</span>
                  {manages && (
                    <span style={chip(isPaid ? '#dcfce7' : '#fee2e2', isPaid ? '#059669' : '#dc2626')}>
                      {isPaid ? '✅ Оплачено' : '🔴 Долг'}
                    </span>
                  )}
                  {gender && <span style={chip('#f3f4f6', '#4b5563')}>{gender.icon} {gender.label}</span>}
                  {age !== null && <span style={chip('#f3f4f6', '#4b5563')}>{ageLabel(age)}</span>}
                  {birthday && <span style={chip('#f3f4f6', '#4b5563')}>🎂 {birthday}</span>}
                  {source && <span style={chip('#ede9fe', '#5b21b6')}>{source.icon} {source.label}</span>}
                </div>
              </div>
              {manages && (
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setEditing(true)} style={secondaryBtn}>Изменить</button>
                  {(client.status || 'active') !== STATUS_DROPPED && !isLead && (
                    <button onClick={handleDrop} disabled={saving} style={secondaryBtn}>Бросил</button>
                  )}
                  <button onClick={handleDeleteClient} style={secondaryBtn}>Удалить</button>
                </div>
              )}
            </div>

            {client.notes && (
              <p style={{
                marginTop: '14px', padding: '10px 12px', background: '#f7f8fa',
                borderRadius: '10px', fontSize: '13px', color: '#4b5563',
              }}>{client.notes}</p>
            )}
          </div>

          {/* Виджет посещений */}
          <div style={panel}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: '0 0 12px' }}>
              Виджет посещений
            </h3>
            <AttendanceWidget
              lessons={lessons}
              clients={allClients}
              teachers={teachers}
              clientId={id}
              onOpenLesson={lesson => navigate(`/lessons?open=${lesson.id}`)}
            />
          </div>

          {/* Уроки и оплаты. Педагогу денег не показываем — у него их и нет в загрузке. */}
          {manages && (
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Уроки и оплаты
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select style={{ ...inputStyle, width: '120px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                  <option value="all">Все месяцы</option>
                  {MONTHS_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select style={{ ...inputStyle, width: '90px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Только приём оплаты. Списание за занятие создаётся автоматически
                при проведении урока в журнале, вручную его не заводят. */}
            {!form.open && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <button style={btn('#059669')} onClick={() => setForm({
                  open: true, amount: '', description: '',
                  date: today, accountId: accounts[0]?.id || '', categoryId: incomeCategories[0]?.id || '',
                })}>
                  💰 Принять оплату
                </button>
              </div>
            )}

            {form.open && (
              <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: '#059669' }}>
                  💰 Принять оплату
                </p>

                {accounts.length === 0 || incomeCategories.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#b91c1c', margin: 0 }}>
                    ⚠️ Сначала заведите кассы и доходные статьи в Настройках.
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                        Сумма оплаты (сум) *
                      </label>
                      <input type="number" min="0" inputMode="numeric" placeholder="0" style={{ ...inputStyle, width: '140px' }}
                        value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Дата *</label>
                      <input type="date" style={{ ...inputStyle, width: '150px' }}
                        value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Касса *</label>
                      <select style={{ ...inputStyle, width: '140px' }}
                        value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Статья *</label>
                      <select style={{ ...inputStyle, width: '170px' }}
                        value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                        {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Комментарий</label>
                      <input placeholder="Необязательно" style={inputStyle}
                        value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                    </div>

                    <button onClick={handlePayment} disabled={saving || !form.amount}
                      style={{ ...btn('#059669'), opacity: (!form.amount || saving) ? 0.6 : 1 }}>
                      Сохранить
                    </button>
                    <button onClick={() => setForm({ open: false })} style={{
                      background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
                      padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
                    }}>✕</button>
                  </div>
                )}
              </div>
            )}

            {periodEntries.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '13px' }}>Записей {periodLabel} нет</p>
            ) : (
              <div>
                {periodEntries.map((entry, i) => {
                  const date = toJsDate(entry.date)
                  const locked = entry._charge && !!entry.lessonId
                  const note = entry._charge ? entry.description : entry.comment
                  return (
                    <div key={`${entry._charge ? 'c' : 't'}-${entry.id}`} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0', gap: '10px',
                      borderBottom: i < periodEntries.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                          {date ? date.toLocaleDateString('ru') : '—'}
                        </span>
                        {entry._charge ? (
                          <span style={chip('#ffedd5', '#c2410c')}>🏃 {entry.lessons || 1} зан.</span>
                        ) : (
                          <span style={chip('#dcfce7', '#059669')}>💰 Оплата</span>
                        )}
                        {note && <span style={{ fontSize: '12px', color: '#6b7280' }}>{note}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontWeight: '700', fontSize: '12px', color: entry._charge ? '#dc2626' : '#059669' }}>
                          {entry._charge ? '−' : '+'}{(entry.amount || 0).toLocaleString()} сум
                        </span>
                        {locked ? (
                          <span title="Списание за проведённое занятие. Снимается откатом занятия."
                            style={{ color: '#9ca3af', fontSize: '13px', padding: '2px 6px' }}>🔒</span>
                        ) : (
                          <button onClick={() => handleDeleteEntry(entry)} style={{
                            background: 'transparent', color: '#9ca3af', border: 'none',
                            cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
                          }}>✕</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}
        </div>

        {/* ПРАВАЯ КОЛОНКА — сводка */}
        <aside style={{ ...panel, position: 'sticky', top: '20px' }}>
          {/* Остаток, платежи и цена занятия — деньги. Педагог их не видит. */}
          {manages && (
          <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#111827' }}>Общий остаток</span>
          </div>
          <div style={{ textAlign: 'right', marginBottom: '2px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: lessonsInStock < 0 ? '#dc2626' : '#7c3aed' }}
              title={lessonsInStock < 0 ? 'За столько занятий ученик ещё не заплатил' : undefined}>
              {lessonsInStock} уроков
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: isPaid ? '#059669' : '#dc2626' }}>
              {balance.toLocaleString()} сум
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '9px', paddingTop: '2px' }}>
            <SummaryRow label="ID">#{client.id.slice(0, 6)}</SummaryRow>
            <SummaryRow label="Платежи">{incomeCount} шт</SummaryRow>
            <SummaryRow label="Уроки">п {lessonsPlanned} / ф {lessonsDone}</SummaryRow>
            {Number.isFinite(client.lessonPrice) && (
              <SummaryRow label="Цена занятия">{client.lessonPrice.toLocaleString()} сум</SummaryRow>
            )}
          </div>
          </>
          )}

          <SummaryBlock title="Заказчик">
            {legalPayer ? (
              <div style={{ fontSize: '13px', color: '#111827' }}>🏛️ {legalPayer.name}</div>
            ) : mainParent ? (
              <div style={{ fontSize: '13px', color: '#111827' }}>
                {mainParent.icon} {contactTitle(mainParent)}
                {mainParent.telegram && (
                  <>
                    {' '}
                    <a href={telegramUrl(mainParent.telegram)} target="_blank" rel="noreferrer" style={link}>
                      @{mainParent.telegram}
                    </a>
                  </>
                )}
              </div>
            ) : <span style={notSet}>(не задано)</span>}
            {mainPhone && (
              <div style={{ marginTop: '4px' }}>
                <a href={phoneUrl(mainPhone)} style={{ ...link, fontSize: '13px' }}>{mainPhone}</a>
              </div>
            )}
          </SummaryBlock>

          <SummaryBlock title="Контакты">
            {contacts.length === 0 && <span style={notSet}>(не задано)</span>}
            {contacts.map(r => (
              <div key={r.role} style={{ fontSize: '12px', color: '#4b5563', marginBottom: '6px' }}>
                <div style={{ color: '#6b7280' }}>{r.icon} {contactTitle(r)}</div>
                {parentPhones(r).map((phone, i) => (
                  <div key={`${phone}-${i}`}><a href={phoneUrl(phone)} style={link}>{phone}</a></div>
                ))}
                {r.instagram && (
                  <a href={instagramUrl(r.instagram)} target="_blank" rel="noreferrer" style={link}>📸 @{r.instagram}</a>
                )}
              </div>
            ))}
            {client.childContacts && (
              <div style={{ fontSize: '12px', color: '#4b5563' }}>
                <span style={{ color: '#6b7280' }}>🧒 Ребёнок</span> {client.childContacts}
              </div>
            )}
          </SummaryBlock>

          {!isLead && manages && (
          <SummaryBlock
            title="Абонементы"
            action={!issuing && !editingSub && (
              <button onClick={() => setIssuing(true)} style={{
                background: 'transparent', border: 'none', color: '#7c3aed',
                fontSize: '12px', cursor: 'pointer',
              }}>добавить</button>
            )}
          >
            {subscriptions.length === 0 && !issuing && <span style={notSet}>(не задано)</span>}

            {currentSubs.map(sub => (
              editingSub?.id === sub.id ? (
                <SubscriptionForm key={sub.id} initial={subscriptionToForm(sub)}
                  packages={packages} saving={saving}
                  onSubmit={handleEditSubscription} onCancel={() => setEditingSub(null)} />
              ) : (
                <SubscriptionRow key={sub.id} sub={sub}
                  onEdit={() => { setIssuing(false); setEditingSub(sub) }}
                  onArchive={() => handleArchiveSubscription(sub)}
                  onDelete={() => handleDeleteSubscription(sub)} />
              )
            ))}

            {issuing && (
              <SubscriptionForm packages={packages} saving={saving}
                accounts={accounts} incomeCategories={incomeCategories}
                onSubmit={handleIssueSubscription} onCancel={() => setIssuing(false)} />
            )}

            {/* Истёкшие и убранные в архив прячем под ссылку, как в AlfaCRM:
                у иного ученика их шесть, и они забивают всю колонку. */}
            {archivedSubs.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <button onClick={() => setShowArchivedSubs(v => !v)} style={{
                  background: 'transparent', border: 'none', padding: 0,
                  color: '#7c3aed', fontSize: '12px', cursor: 'pointer',
                }}>
                  {showArchivedSubs ? '▴' : '▾'} Архивные абонементы ({archivedSubs.length})
                </button>

                {showArchivedSubs && archivedSubs.map(sub => (
                  editingSub?.id === sub.id ? (
                    <SubscriptionForm key={sub.id} initial={subscriptionToForm(sub)}
                      packages={packages} saving={saving}
                      onSubmit={handleEditSubscription} onCancel={() => setEditingSub(null)} />
                  ) : (
                    <SubscriptionRow key={sub.id} sub={sub} archived
                      onEdit={() => { setIssuing(false); setEditingSub(sub) }}
                      onRestore={sub.status === 'archived' ? () => handleRestoreSubscription(sub) : null}
                      onDelete={() => handleDeleteSubscription(sub)} />
                  )
                ))}
              </div>
            )}
          </SummaryBlock>
          )}

          <SummaryBlock title="Аллергии и особенности">
            {client.allergies
              ? <span style={{ fontSize: '13px', color: '#b91c1c' }}>⚠️ {client.allergies}</span>
              : <span style={notSet}>(не задано)</span>}
          </SummaryBlock>

          <SummaryBlock title="Педагог">
            <span style={notSet}>(не задано)</span>
          </SummaryBlock>

          {!isLead && (
          <SummaryBlock title="Группы">
            {myGroups.length === 0 && extraGroups.length === 0 && (
              <span style={notSet}>(не задано)</span>
            )}

            {myGroups.map(group => (
              <div key={group.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '13px', marginBottom: '4px', gap: '8px',
              }}>
                <Link to={`/groups?open=${group.id}`} style={link}>👥 {group.name}</Link>
                {manages && (
                  <button onClick={() => handleLeaveGroup(group)} disabled={saving} title="Убрать из группы"
                    style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                )}
              </div>
            ))}

            {extraGroups.map(group => (
              <div key={group.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                <Link to={`/groups?open=${group.id}`} style={link}>👥 {group.name}</Link>
                <span style={{ fontSize: '11px', color: '#6b7280' }}> — только занятия</span>
              </div>
            ))}

            {manages && availableGroups.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <select style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}
                  value={pickGroup} onChange={e => setPickGroup(e.target.value)}>
                  <option value="">Добавить в группу…</option>
                  {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={() => handleJoinGroup(pickGroup)} disabled={!pickGroup || saving}
                  style={{ ...btn(), padding: '6px 12px', opacity: (!pickGroup || saving) ? 0.5 : 1 }}>+</button>
              </div>
            )}
          </SummaryBlock>
          )}

          <SummaryBlock title="Ближайшие занятия">
            {myUpcoming.length === 0 && <span style={notSet}>(не записан)</span>}
            {myUpcoming.slice(0, 6).map(lesson => (
              <div key={lesson.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '13px', color: '#111827', marginBottom: '4px', gap: '8px',
              }}>
                <span>
                  {new Date(lesson.date).toLocaleDateString('ru')}
                  <span style={{ color: '#6b7280' }}> {lesson.timeFrom}</span>
                </span>
                {manages && (
                  <button onClick={() => handleLeaveLesson(lesson)} disabled={saving} title="Снять с занятия"
                    style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                )}
              </div>
            ))}
            {myUpcoming.length > 6 && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>…и ещё {myUpcoming.length - 6}</div>
            )}
          </SummaryBlock>

          {/* Лида на занятия записывают из воронки — кнопкой «Назначить пробное».
              Педагог состав не меняет: это работа менеджера. */}
          {!isLead && manages && (
          <SummaryBlock title="Записать на занятия">
            <select style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px', marginBottom: '8px' }}
              value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPickedLessons([]) }}>
              <option value="">Все занятия</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            {joinableLessons.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                Нет занятий, куда можно записать.
              </p>
            ) : (
              <>
                <div style={{
                  maxHeight: '180px', overflowY: 'auto', border: '1px solid #e5e7eb',
                  borderRadius: '8px', padding: '4px',
                }}>
                  {joinableLessons.slice(0, 40).map(lesson => (
                    <label key={lesson.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px',
                      cursor: 'pointer', fontSize: '12px', color: '#111827',
                    }}>
                      <input type="checkbox" checked={pickedLessons.includes(lesson.id)}
                        onChange={() => togglePickedLesson(lesson.id)} />
                      <span>
                        {new Date(lesson.date).toLocaleDateString('ru')}
                        <span style={{ color: '#6b7280' }}> {lesson.timeFrom}</span>
                        {lesson.groupName && <span style={{ color: '#6b7280' }}> · {lesson.groupName}</span>}
                      </span>
                    </label>
                  ))}
                </div>

                <button onClick={handleJoinLessons} disabled={pickedLessons.length === 0 || saving}
                  style={{
                    ...btn(), width: '100%', marginTop: '8px', padding: '7px 12px',
                    opacity: (pickedLessons.length === 0 || saving) ? 0.5 : 1,
                  }}>
                  {saving ? 'Записываем...' : `Записать (${pickedLessons.length})`}
                </button>
              </>
            )}
          </SummaryBlock>
          )}
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .client-card-grid { grid-template-columns: 1fr !important; }
          .client-card-grid > aside { position: static !important; }
        }
      `}</style>
    </div>
  )
}
