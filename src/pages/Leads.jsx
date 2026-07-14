import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection, getDocs, getDoc, addDoc, doc, setDoc, updateDoc, writeBatch,
  query as fsQuery, where,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import { clientBalance } from '../lib/balance'
import { toJsDate, KIND_INCOME, KIND_REFUND } from '../lib/finance'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, invalidate } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'
import LeadForm from '../components/LeadForm'
import ClientForm from '../components/ClientForm'
import {
  emptyClientForm, formToDoc, telegramUrl, instagramUrl, phoneUrl, sourceInfo, getAge, ageLabel,
} from '../lib/client'
import {
  LEAD_STAGES, REJECT_REASONS,
  stageInfo, rejectLabel, groupByStage, funnelStats, leadSearchText, nextStage,
  leadToForm, clientFormFromLead, formatLeadDate, formatShortDate,
  isConverted, isRejected,
} from '../lib/lead'

const FUNNEL = 'funnel'
const ARCHIVE = 'archive'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none',
}

const primaryBtn = (disabled) => ({
  background: disabled ? '#f3f4f6' : '#7c3aed',
  color: disabled ? '#9ca3af' : '#fff',
  border: 'none', padding: '10px 18px', borderRadius: '10px',
  fontSize: '14px', fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '9px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
}

const tab = (isActive) => ({
  background: isActive ? '#ede9fe' : 'transparent',
  color: isActive ? '#7c3aed' : '#4b5563',
  border: `1px solid ${isActive ? '#ddd6fe' : '#e5e7eb'}`,
  padding: '8px 14px', borderRadius: '10px', fontSize: '13px',
  fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
})

const card = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '16px',
}

function Stat({ label, value, color = '#111827' }) {
  return (
    <div style={{ ...card, flex: '1 1 140px', padding: '14px 16px' }}>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: '700', color, margin: '4px 0 0' }}>{value}</p>
    </div>
  )
}

const cardIcon = {
  background: 'transparent', border: 'none', padding: '0 2px',
  fontSize: '13px', lineHeight: 1, cursor: 'pointer', color: '#9ca3af',
}

// Кнопки в углу карточки не должны открывать её: клик по иконке — это действие,
// а не «посмотреть». Останавливаем всплытие и запрещаем перетаскивание.
function CardAction({ title, color, disabled, onClick, children }) {
  if (disabled) return null
  return (
    <button
      title={title}
      draggable={false}
      onDragStart={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick() }}
      onMouseEnter={e => { e.currentTarget.style.color = color }}
      onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af' }}
      style={cardIcon}
    >{children}</button>
  )
}

// Ссылки внутри карточки: звонок, телеграм, инстаграм. Клик по ним не открывает
// окно лида — иначе набрать номер одним касанием не выйдет.
const stop = (e) => e.stopPropagation()

const cardLink = { color: '#7c3aed', textDecoration: 'none' }

// Карточка в канбане. Тянется мышью между колонками, в углу — действия:
// следующий этап, конверсия, удаление. Остальное в окне лида.
function LeadCard({ lead, responsibleName, onOpen, onDragStart, onAdvance, onConvert, onDelete }) {
  const [hover, setHover] = useState(false)
  const source = sourceInfo(lead)
  const age = getAge(lead)
  const phones = (lead.phones || []).filter(Boolean)
  // В AlfaCRM лида часто заводили как «Лола Рахманова мама» и тем же текстом
  // подписывали заказчика. Печатать одну строку дважды незачем.
  const parent = lead.parentName === lead.childName ? '' : lead.parentName
  const forward = nextStage(lead.stage)

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '10px 12px', cursor: 'grab', display: 'flex', flexDirection: 'column', gap: '4px',
      }}
    >
     {/* Как в AlfaCRM: в покое справа дата, под курсором на её месте — действия. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
        <button
          onClick={() => onOpen(lead)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: '13px', fontWeight: '600', color: '#7c3aed',
            textDecoration: 'underline', cursor: 'pointer',
          }}
        >
         {lead.childName}{age !== null && ` (${ageLabel(age)})`}
        </button>

       {hover ? (
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <CardAction title="Сделать клиентом" color="#059669" onClick={() => onConvert(lead)}><Icon name="userCheck" size={14} /></CardAction>
            <CardAction title={forward ? `Перевести: ${stageInfo(forward).label}` : ''}
              color="#7c3aed" disabled={!forward} onClick={() => onAdvance(lead, forward)}><Icon name="arrowRight" size={14} /></CardAction>
            <CardAction title="Удалить лид" color="#dc2626" onClick={() => onDelete(lead)}><Icon name="trash" size={14} /></CardAction>
          </div>
        ) : (
          <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
           {formatShortDate(lead.createdAt)}
          </span>
        )}
      </div>

     {lead.note && (
        <span style={{ fontSize: '12px', color: '#4b5563', whiteSpace: 'pre-line' }}>{lead.note}</span>
      )}

     {source && (
        <span style={{ fontSize: '12px', color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <Icon name={source.iconName} size={13} />{source.label}
        </span>
      )}

     {phones.map(phone => (
        <span key={phone} style={{ fontSize: '12px' }}>
          <a href={phoneUrl(phone)} onClick={stop} style={{ ...cardLink, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Icon name="phone" size={12} />{phone}</a>
         {parent && <span style={{ color: '#6b7280' }}> ({parent})</span>}
        </span>
      ))}

     {lead.telegram && (
        <a href={telegramUrl(lead.telegram)} target="_blank" rel="noreferrer" onClick={stop}
          style={{ ...cardLink, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Icon name="telegram" size={12} />@{lead.telegram}</a>
      )}
     {lead.instagram && (
        <a href={instagramUrl(lead.instagram)} target="_blank" rel="noreferrer" onClick={stop}
          style={{ ...cardLink, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Icon name="instagram" size={12} />@{lead.instagram}</a>
      )}

     {phones.length === 0 && !lead.telegram && !lead.instagram && parent && (
        <span style={{ fontSize: '12px', color: '#6b7280' }}>{parent}</span>
      )}

     {responsibleName && (
        <span style={{ fontSize: '11px', color: '#6b7280' }}>{responsibleName}</span>
      )}
    </div>
  )
}

function Column({
  stage, leads, actions, responsibleName, onDrop, isTarget, onDragOver, onDragLeave,
}) {
  const info = stageInfo(stage)
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: '8px',
        background: isTarget ? '#f7f8fa' : 'transparent',
        borderRadius: '14px', padding: '4px',
        outline: isTarget ? '2px dashed #7c3aed' : 'none',
      }}
    >
      <div style={{
        background: info.background, color: info.color, borderRadius: '10px',
        padding: '8px 12px', fontSize: '12px', fontWeight: '700',
        display: 'flex', justifyContent: 'space-between', gap: '8px',
      }}>
        <span>{info.label}</span>
        <span>{leads.length}</span>
      </div>

     {leads.map(lead => (
        <LeadCard key={lead.id} lead={lead} responsibleName={responsibleName(lead)} {...actions} />
      ))}

     {leads.length === 0 && (
        <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Пусто</p>
      )}
    </div>
  )
}

// Пустой список телефонов — это `[]`, а он истинный. Без проверки на длину
// в окне лида висела бы строка «Телефоны» без единого номера.
function Row({ label, children }) {
  const empty = !children || (Array.isArray(children) && children.length === 0)
  if (empty) return null
  return (
    <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '5px 0' }}>
      <span style={{ color: '#6b7280', minWidth: '110px' }}>{label}</span>
      <span style={{ color: '#111827' }}>{children}</span>
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto', zIndex: 100,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '620px' }}>
       {children}
      </div>
    </div>
  )
}

// Оплата за пробное прямо из окна лида. Клиент-лид создаётся при сохранении.
function LeadPayForm({ lead, accounts, categories, saving, onSubmit, onCancel }) {
  const [f, setF] = useState({
    amount: '', date: new Date().toISOString().slice(0, 10),
    accountId: accounts[0]?.id || '', categoryId: categories[0]?.id || '', comment: '',
  })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = () => {
    if (!Number(f.amount) || !f.accountId || !f.categoryId) return
    onSubmit({ ...f, amount: Number(f.amount), date: new Date(`${f.date}T12:00:00`) })
  }
  return (
    <div style={card}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 12px' }}>
        Оплата за пробное: {lead.childName}
      </h3>
     {accounts.length === 0 || categories.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#b91c1c' }}>Сначала заведите кассы и доходные статьи в Настройках.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div><label style={fLabel}>Сумма *</label>
              <input type="number" min="0" style={{ ...inputStyle, width: '100%' }} value={f.amount} onChange={set('amount')} /></div>
            <div><label style={fLabel}>Дата *</label>
              <input type="date" style={{ ...inputStyle, width: '100%' }} value={f.date} onChange={set('date')} /></div>
            <div><label style={fLabel}>Касса *</label>
              <select style={{ ...inputStyle, width: '100%' }} value={f.accountId} onChange={set('accountId')}>
               {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><label style={fLabel}>Статья *</label>
              <select style={{ ...inputStyle, width: '100%' }} value={f.categoryId} onChange={set('categoryId')}>
               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: '14px' }}><label style={fLabel}>Комментарий</label>
            <input style={{ ...inputStyle, width: '100%' }} value={f.comment} onChange={set('comment')} placeholder="Оплата пробного" /></div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={submit} disabled={saving} style={primaryBtn(saving)}>{saving ? 'Сохраняем...' : 'Принять оплату'}</button>
            <button onClick={onCancel} style={ghostBtn}>Отмена</button>
          </div>
        </>
      )}
    </div>
  )
}

// Назначение пробного занятия из окна лида. Создаёт занятие со звёздочкой в календаре.
function LeadTrialForm({ lead, staff, saving, onSubmit, onCancel }) {
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10), timeFrom: '11:00', timeTo: '12:00', teacherId: '',
  })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <div style={card}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 12px' }}>
        Пробное занятие: {lead.childName}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div><label style={fLabel}>Дата *</label>
          <input type="date" style={{ ...inputStyle, width: '100%' }} value={f.date} onChange={set('date')} /></div>
        <div><label style={fLabel}>Педагог</label>
          <select style={{ ...inputStyle, width: '100%' }} value={f.teacherId} onChange={set('teacherId')}>
            <option value="">Не задан</option>
           {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label style={fLabel}>Начало</label>
          <input type="time" style={{ ...inputStyle, width: '100%' }} value={f.timeFrom} onChange={set('timeFrom')} /></div>
        <div><label style={fLabel}>Конец</label>
          <input type="time" style={{ ...inputStyle, width: '100%' }} value={f.timeTo} onChange={set('timeTo')} /></div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => onSubmit(f)} disabled={saving || !f.date} style={primaryBtn(saving || !f.date)}>
         {saving ? 'Создаём...' : 'Назначить'}
        </button>
        <button onClick={onCancel} style={ghostBtn}>Отмена</button>
      </div>
    </div>
  )
}

const fLabel = { fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }

const ruDate = (value) => {
  const date = toJsDate(value)
  return date ? date.toLocaleDateString('ru') : ''
}

// Деньги лида в окне воронки: баланс, оплаты, списания за проведённые пробные
// и назначенные занятия. Всё это остаётся за учеником после «Сделать клиентом».
function LeadMoney({ money, clientId }) {
  if (!clientId) return null
  if (!money || money.loading) {
    return <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Загружаем оплаты…</p>
  }
  if (money.error) {
    return <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 16px' }}>{money.error}</p>
  }

  const { balance, entries, upcoming } = money
  if (entries.length === 0 && upcoming.length === 0) return null

  const inDebt = balance < 0

  return (
    <div style={{
      margin: '0 0 16px', padding: '12px', background: '#f7f8fa', borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>Оплаты и пробные</span>
        <span style={{ fontSize: '14px', fontWeight: '700', color: inDebt ? '#dc2626' : '#059669' }}>
         {balance.toLocaleString()} сум
          <span style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>
           {' '}{inDebt ? 'долг' : 'предоплата'}
          </span>
        </span>
      </div>

     {upcoming.map(lesson => (
        <div key={lesson.id} style={{ fontSize: '12px', color: '#4b5563', marginBottom: '4px' }}>
          Пробное {ruDate(lesson.date)} {lesson.timeFrom} — запланировано
        </div>
      ))}

     {entries.map(entry => {
        // Списание за занятие и возврат денег родителю оба уменьшают баланс.
        const minus = entry._charge || entry.kind === KIND_REFUND
        const icon = entry._charge ? '✱' : (entry.kind === KIND_REFUND ? '' : '')
        const title = entry._charge
          ? (entry.description || 'Занятие')
          : (entry.comment || (entry.kind === KIND_REFUND ? 'Возврат' : 'Оплата'))
        return (
          <div key={entry.id} style={{
            display: 'flex', justifyContent: 'space-between', gap: '10px',
            fontSize: '12px', color: '#4b5563', marginBottom: '4px',
          }}>
            <span>{icon} {ruDate(entry.date)} {title}</span>
            <span style={{ whiteSpace: 'nowrap', color: minus ? '#dc2626' : '#059669' }}>
             {minus ? '−' : '+'}{(entry.amount || 0).toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [staff, setStaff] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  const [view, setView] = useState(FUNNEL)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [mode, setMode] = useState('view')   // view | edit | reject | convert
  const [reason, setReason] = useState(REJECT_REASONS[0].value)
  const [dragOver, setDragOver] = useState(null)

  const fetchData = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ls, ts, les, acc, cat] = await Promise.all([
        readCollection('leads', { force }),
        readCollection('teachers', { force }),
        readCollection('legalEntities', { force }),
        readCollection('accounts', { force }),
        readCollection('categories', { force }),
      ])
      setLeads(ls)
      setStaff(ts.filter(s => s.active !== false))
      setLegalEntities(les)
      setAccounts(acc.filter(a => a.active !== false))
      setCategories(cat.filter(c => c.kind === 'income' && c.active !== false))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const open = leads.find(l => l.id === openId) || null
  const stats = useMemo(() => funnelStats(leads), [leads])

  // Деньги лида. Оплаты и списания за пробное живут на карточке ученика
  // (`clientId`) и при конверсии никуда не деваются — clientId не меняется.
  // Но в воронке их не видно, а менеджеру нужно знать, платил лид или должен.
  // Читаем точечно по clientId, а не всю ленту финансов: она на 1500 записей.
  const [money, setMoney] = useState(null)
  const [moneyTick, setMoneyTick] = useState(0)

  useEffect(() => {
    const clientId = open?.clientId
    if (!clientId) { setMoney(null); return }

    let cancelled = false
    const load = async () => {
      setMoney({ loading: true })
      try {
        if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
        const [tx, ch, les] = await withTimeout(Promise.all([
          getDocs(fsQuery(collection(db, 'transactions'), where('clientId', '==', clientId))),
          getDocs(fsQuery(collection(db, 'charges'), where('clientId', '==', clientId))),
          getDocs(fsQuery(collection(db, 'lessons'), where('studentIds', 'array-contains', clientId))),
        ]))
        if (cancelled) return
        const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }))
        const transactions = rows(tx)
        const charges = rows(ch)
        setMoney({
          balance: clientBalance(transactions, charges, clientId),
          entries: [
            // Баланс двигают только оплаты и возвраты; прочие операции ученику не принадлежат.
            ...transactions
              .filter(t => t.kind === KIND_INCOME || t.kind === KIND_REFUND)
              .map(t => ({ ...t, _charge: false })),
            ...charges.map(c => ({ ...c, _charge: true })),
          ].sort((a, b) => toJsDate(b.date) - toJsDate(a.date)),
          upcoming: rows(les)
            .filter(l => l.status === 'planned')
            .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        })
      } catch (e) {
        console.error(e)
        if (!cancelled) setMoney({ error: describeError(e) })
      }
    }
    load()
    return () => { cancelled = true }
  }, [open?.clientId, moneyTick])

  const query = search.trim().toLowerCase()
  const matches = (lead) => !query || leadSearchText(lead).includes(query)

  const active = leads.filter(l => !l.archived && matches(l))
  const archived = leads.filter(l => l.archived && matches(l))
  const columns = useMemo(() => groupByStage(active), [active])

  const closeModal = () => { setOpenId(null); setMode('view') }

  // Каждое действие перечитывает лиды: канбан маленький, а рассинхрон
  // карточки и колонки заметнее любой лишней секунды загрузки.
  const run = async (action) => {
    setSaving(true)
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      await action()
      await fetchData(true)
      setMoneyTick(t => t + 1)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = (data) => run(async () => {
    const now = new Date()
    await addDoc(collection(db, 'leads'), {
      ...data, createdAt: now, stageChangedAt: now,
      archived: false, rejectReason: '', clientId: '',
    })
    setAdding(false)
  })

  const handleEdit = (data) => run(async () => {
    const patch = { ...data }
    if (data.stage !== open.stage) patch.stageChangedAt = new Date()
    await updateDoc(doc(db, 'leads', open.id), patch)
    setMode('view')
  })

  const handleMoveStage = (lead, stage) => {
    if (lead.stage === stage) return Promise.resolve()
    return run(() => updateDoc(doc(db, 'leads', lead.id), { stage, stageChangedAt: new Date() }))
  }

  const handleReject = () => run(async () => {
    await updateDoc(doc(db, 'leads', open.id), { archived: true, rejectReason: reason })
    closeModal()
  })

  const handleRestore = (lead) => run(() => updateDoc(doc(db, 'leads', lead.id), {
    archived: false, rejectReason: '', stageChangedAt: new Date(),
  }))

  // Ученик и пометка на лиде пишутся одной транзакцией: лид без clientId
  // вернулся бы в воронку, а клиент остался бы дублем.
  // Клиент-лид заводится ЛЕНИВО — только при реальном действии (оплата, пробное),
  // не при простом просмотре. Поэтому открытие окна не меняет ни воронку, ни число
  // клиентов. Запись помечена статусом «лид» и скрыта из списка клиентов; вся
  // история переходит клиенту при конверсии, потому что clientId не меняется.
  // Карточку ученика могли удалить из «Клиентов», а clientId на лиде остался.
  // Такая ссылка ведёт в никуда: писать по ней оплату или занятие нельзя.
  const liveClientId = async (lead) => {
    if (!lead.clientId) return null
    const snap = await getDoc(doc(db, 'clients', lead.clientId))
    return snap.exists() ? lead.clientId : null
  }

  const ensureLeadClient = async (lead) => {
    const existing = await liveClientId(lead)
    if (existing) return existing
    const ref = doc(collection(db, 'clients'))
    await setDoc(ref, {
      ...formToDoc(clientFormFromLead(lead, emptyClientForm())),
      status: 'lead', createdAt: new Date(),
    })
    await updateDoc(doc(db, 'leads', lead.id), { clientId: ref.id })
    return ref.id
  }

  const handlePay = (data) => run(async () => {
    const clientId = await ensureLeadClient(open)
    await addDoc(collection(db, 'transactions'), {
      kind: 'income', clientId, clientName: open.childName,
      amount: data.amount, accountId: data.accountId, categoryId: data.categoryId,
      comment: data.comment || 'Оплата пробного', date: data.date, createdAt: new Date(),
    })
    closeModal()
  })

  const handleTrial = (data) => run(async () => {
    const clientId = await ensureLeadClient(open)
    await addDoc(collection(db, 'lessons'), {
      type: 'trial', status: 'planned', studentIds: [clientId], groupId: null, groupName: '',
      date: data.date, timeFrom: data.timeFrom, timeTo: data.timeTo,
      teacherId: data.teacherId || '', topic: '', attendance: [],
    })
    closeModal()
  })

  // Сделать клиентом. Если карточка уже заведена (лид ходил на пробное, платил) —
  // просто снимаем статус «лид», история остаётся на том же ученике. Если карточки
  // ещё нет — создаём ученика из формы, как раньше.
  const handleConvert = (clientData) => run(async () => {
    const existing = await liveClientId(open)
    const batch = writeBatch(db)
    if (existing) {
      batch.update(doc(db, 'clients', existing), { ...clientData, status: 'active' })
      batch.update(doc(db, 'leads', open.id), { archived: true, stage: 'paid', rejectReason: '' })
    } else {
      const clientRef = doc(collection(db, 'clients'))
      batch.set(clientRef, { ...clientData, status: 'active', createdAt: new Date() })
      batch.update(doc(db, 'leads', open.id), {
        clientId: clientRef.id, archived: true, stage: 'paid', rejectReason: '',
      })
    }
    await batch.commit()
    closeModal()
  })

  // Удаление лида должно убрать за собой и карточку-лида, иначе в базе остаётся
  // сирота: ученика нет в списке клиентов (статус «лид»), а лида, из которого он
  // родился, уже нет — найти такую запись можно только по прямой ссылке.
  // Но если за карточкой стоят деньги или занятия, удалять её нельзя: это реальная
  // история. Тогда карточка остаётся и становится обычным учеником («активен»).
  const handleDelete = (lead) => run(async () => {
    const clientId = await liveClientId(lead)
    let hasHistory = false

    if (clientId) {
      const [tx, ch, les] = await withTimeout(Promise.all([
        getDocs(fsQuery(collection(db, 'transactions'), where('clientId', '==', clientId))),
        getDocs(fsQuery(collection(db, 'charges'), where('clientId', '==', clientId))),
        getDocs(fsQuery(collection(db, 'lessons'), where('studentIds', 'array-contains', clientId))),
      ]))
      hasHistory = !tx.empty || !ch.empty || !les.empty
    }

    const warning = hasHistory
      ? `Удалить лид «${lead.childName}»? У него есть оплаты или занятия — карточка ученика останется в «Клиентах» вместе с историей.`
      : `Удалить лид «${lead.childName}»? Восстановить его будет нельзя.`
    if (!confirm(warning)) return

    const batch = writeBatch(db)
    batch.delete(doc(db, 'leads', lead.id))
    if (clientId) {
      if (hasHistory) batch.update(doc(db, 'clients', clientId), { status: 'active' })
      else batch.delete(doc(db, 'clients', clientId))
    }
    await batch.commit()
    closeModal()
  })

  const onDragStart = (e, lead) => {
    e.dataTransfer.setData('text/plain', lead.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Действия карточки. Конверсия открывает то же окно, что и кнопка в лиде:
  // форму ученика заполняет менеджер, автоматом клиента не заводим.
  const cardActions = {
    onOpen: (lead) => { setOpenId(lead.id); setMode('view') },
    onDragStart,
    onAdvance: handleMoveStage,
    onConvert: (lead) => { setOpenId(lead.id); setMode('convert') },
    onDelete: handleDelete,
  }

  const responsibleName = (lead) => staff.find(s => s.id === lead.responsibleId)?.name || ''

  const onDrop = (e, stage) => {
    e.preventDefault()
    setDragOver(null)
    const lead = leads.find(l => l.id === e.dataTransfer.getData('text/plain'))
    if (lead) handleMoveStage(lead, stage)
  }

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1500px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="leads" size={20} style={{ color: '#e11d48' }} />Лиды
          </h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Воронка от первого обращения до оплаты
        </p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <Stat label="В работе" value={stats.active} />
        <Stat label="Стали клиентами" value={stats.converted} color="#059669" />
        <Stat label="Отказались" value={stats.rejected} color="#dc2626" />
        <Stat label="Конверсия" value={`${stats.rate}%`} color="#7c3aed" />
      </div>

     {adding && (
        <LeadForm saving={saving} staff={staff}
          onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setAdding(true)} style={primaryBtn(false)}>Добавить лид</button>
        <button onClick={() => setView(FUNNEL)} style={tab(view === FUNNEL)}>
          Воронка ({leads.filter(l => !l.archived).length})
        </button>
        <button onClick={() => setView(ARCHIVE)} style={tab(view === ARCHIVE)}>
          Архив ({leads.filter(l => l.archived).length})
        </button>
        <input placeholder="Поиск по имени, телефону, нику..." style={{ ...inputStyle, width: '280px' }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

     {view === FUNNEL ? (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
         {LEAD_STAGES.map(stage => (
            <Column
              key={stage.value}
              stage={stage.value}
              leads={columns.get(stage.value) || []}
              isTarget={dragOver === stage.value}
              actions={cardActions}
              responsibleName={responsibleName}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.value) }}
              onDragLeave={() => setDragOver(prev => (prev === stage.value ? null : prev))}
              onDrop={e => onDrop(e, stage.value)}
            />
          ))}
        </div>
      ) : (
        <div style={card}>
         {archived.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
              Архив пуст
            </p>
          ) : archived.map((lead, i) => (
            <div key={lead.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
              padding: '10px 0', flexWrap: 'wrap',
              borderBottom: i === archived.length - 1 ? 'none' : '1px solid #f3f4f6',
            }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{lead.childName}</span>
               {lead.parentName && lead.parentName !== lead.childName && (
                  <span style={{ fontSize: '13px', color: '#6b7280' }}> · {lead.parentName}</span>
                )}
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                 {isConverted(lead) ? (
                    <>
                      <span style={{ color: '#059669' }}>Стал клиентом</span>
                     {' — '}
                      <Link to={`/clients/${lead.clientId}`} style={{ color: '#7c3aed', textDecoration: 'none' }}>
                        открыть карточку
                      </Link>
                    </>
                  ) : (
                    <span style={{ color: '#dc2626' }}>Отказ: {rejectLabel(lead.rejectReason) || 'без причины'}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setOpenId(lead.id); setMode('view') }} style={ghostBtn}>Открыть</button>
               {isRejected(lead) && (
                  <button onClick={() => handleRestore(lead)} disabled={saving} style={ghostBtn}>
                    Вернуть в воронку
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

     {open && mode === 'view' && (
        <Modal onClose={closeModal}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>{open.childName}</h3>
                <span style={{
                  display: 'inline-block', marginTop: '6px', fontSize: '12px', padding: '3px 10px',
                  borderRadius: '6px', background: stageInfo(open.stage).background, color: stageInfo(open.stage).color,
                }}>{stageInfo(open.stage).label}</span>
              </div>
              <button onClick={closeModal} style={{ ...ghostBtn, padding: '6px 10px' }}>✕</button>
            </div>

            <div style={{ margin: '16px 0' }}>
              <Row label="Кто обратился">
               {open.parentName === open.childName ? '' : open.parentName}
              </Row>
              <Row label="Телефоны">
               {(open.phones || []).map(p => (
                  <a key={p} href={phoneUrl(p)} style={{ color: '#7c3aed', textDecoration: 'none', marginRight: '10px' }}>{p}</a>
                ))}
              </Row>
              <Row label="Telegram">
               {open.telegram && (
                  <a href={telegramUrl(open.telegram)} target="_blank" rel="noreferrer"
                    style={{ color: '#7c3aed', textDecoration: 'none' }}>@{open.telegram}</a>
                )}
              </Row>
              <Row label="Instagram">
               {open.instagram && (
                  <a href={instagramUrl(open.instagram)} target="_blank" rel="noreferrer"
                    style={{ color: '#7c3aed', textDecoration: 'none' }}>@{open.instagram}</a>
                )}
              </Row>
              <Row label="Источник">{sourceInfo(open)?.label}</Row>
              <Row label="Ответственный">{staff.find(s => s.id === open.responsibleId)?.name}</Row>
              <Row label="Создан">{formatLeadDate(open.createdAt)}</Row>
              <Row label="Примечание">{open.note}</Row>
             {isConverted(open) && (
                <Row label="Клиент">
                  <Link to={`/clients/${open.clientId}`} style={{ color: '#7c3aed', textDecoration: 'none' }}>
                    открыть карточку ученика
                  </Link>
                </Row>
              )}
             {isRejected(open) && <Row label="Причина отказа">{rejectLabel(open.rejectReason)}</Row>}
            </div>

            <LeadMoney money={money} clientId={open.clientId} />

           {!open.archived && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  Этап воронки
                </label>
                <select style={{ ...inputStyle, width: '100%' }} value={open.stage} disabled={saving}
                  onChange={e => handleMoveStage(open, e.target.value)}>
                 {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
             {!isConverted(open) && (
                <>
                  <button onClick={() => setMode('pay')} disabled={saving} style={primaryBtn(saving)}>
                    Принять оплату
                  </button>
                  <button onClick={() => setMode('trial')} disabled={saving} style={ghostBtn}>
                    Назначить пробное
                  </button>
                </>
              )}
              <button onClick={() => setMode('edit')} style={ghostBtn}>Править</button>
             {!isConverted(open) && (
                <button onClick={() => setMode('convert')} disabled={saving} style={ghostBtn}>
                  Сделать клиентом
                </button>
              )}
             {!open.archived && (
                <button onClick={() => { setReason(REJECT_REASONS[0].value); setMode('reject') }} style={ghostBtn}>
                  Отказ
                </button>
              )}
             {isRejected(open) && (
                <button onClick={() => handleRestore(open)} disabled={saving} style={ghostBtn}>
                  Вернуть в воронку
                </button>
              )}
              <button onClick={() => handleDelete(open)} disabled={saving}
                style={{ ...ghostBtn, color: '#dc2626', marginLeft: 'auto' }}>Удалить</button>
            </div>
          </div>
        </Modal>
      )}

     {open && mode === 'edit' && (
        <Modal onClose={() => setMode('view')}>
          <LeadForm initial={leadToForm(open)} saving={saving} staff={staff}
            onSubmit={handleEdit} onCancel={() => setMode('view')} />
        </Modal>
      )}

     {open && mode === 'reject' && (
        <Modal onClose={() => setMode('view')}>
          <div style={card}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 6px' }}>
              Отказ: {open.childName}
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
              Лид уйдёт в архив. Вернуть его в воронку можно в любой момент.
            </p>
            <select style={{ ...inputStyle, width: '100%', marginBottom: '16px' }}
              value={reason} onChange={e => setReason(e.target.value)}>
             {REJECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleReject} disabled={saving} style={{
                background: saving ? '#f3f4f6' : '#dc2626', color: saving ? '#9ca3af' : '#fff',
                border: 'none', padding: '8px 16px', borderRadius: '10px',
                fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
              }}>{saving ? 'Сохраняем...' : 'В архив'}</button>
              <button onClick={() => setMode('view')} style={ghostBtn}>Отмена</button>
            </div>
          </div>
        </Modal>
      )}

     {open && mode === 'pay' && (
        <Modal onClose={() => setMode('view')}>
          <LeadPayForm lead={open} accounts={accounts} categories={categories} saving={saving}
            onSubmit={handlePay} onCancel={() => setMode('view')} />
        </Modal>
      )}

     {open && mode === 'trial' && (
        <Modal onClose={() => setMode('view')}>
          <LeadTrialForm lead={open} staff={staff} saving={saving}
            onSubmit={handleTrial} onCancel={() => setMode('view')} />
        </Modal>
      )}

     {open && mode === 'convert' && (
        <Modal onClose={() => setMode('view')}>
          <div>
            <p style={{
              background: '#ede9fe', color: '#4b5563', border: '1px solid #ddd6fe',
              borderRadius: '12px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px',
            }}>
              Проверьте данные и дозаполните карточку. После сохранения лид уйдёт в архив
              со ссылкой на нового ученика.
            </p>
            <ClientForm
              initial={clientFormFromLead(open, emptyClientForm())}
              saving={saving}
              legalEntities={legalEntities}
              onSubmit={handleConvert}
              onCancel={() => setMode('view')}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
