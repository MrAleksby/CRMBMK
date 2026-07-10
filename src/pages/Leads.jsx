import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'
import LeadForm from '../components/LeadForm'
import ClientForm from '../components/ClientForm'
import { emptyClientForm, telegramUrl, instagramUrl, phoneUrl, sourceInfo } from '../lib/client'
import {
  LEAD_STAGES, REJECT_REASONS,
  stageInfo, rejectLabel, groupByStage, funnelStats, leadSearchText,
  leadToForm, clientFormFromLead, formatLeadDate, daysOnStage,
  isConverted, isRejected,
} from '../lib/lead'

const FUNNEL = 'funnel'
const ARCHIVE = 'archive'

// Через сколько дней без движения карточка считается забытой.
const STALE_DAYS = 14

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

// Карточка в канбане. Тянется мышью между колонками; на телефоне этап
// меняют через окно лида — там же, где остальные действия.
function LeadCard({ lead, onOpen, onDragStart }) {
  const stale = daysOnStage(lead)
  const source = sourceInfo(lead)
  const phone = (lead.phones || [])[0]

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead)}
      onClick={() => onOpen(lead)}
      style={{
        background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '10px 12px', cursor: 'grab', display: 'flex', flexDirection: 'column', gap: '3px',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{lead.childName}</span>
      {lead.parentName && (
        <span style={{ fontSize: '12px', color: '#6b7280' }}>{lead.parentName}</span>
      )}
      {phone && <span style={{ fontSize: '12px', color: '#7c3aed' }}>📞 {phone}</span>}
      <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#9ca3af', flexWrap: 'wrap' }}>
        {source && <span>{source.icon} {source.label}</span>}
        {stale !== null && (
          <span style={{ color: stale >= STALE_DAYS ? '#dc2626' : '#9ca3af' }}>
            · {stale === 0 ? 'сегодня' : `${stale} дн.`}
          </span>
        )}
      </div>
    </div>
  )
}

function Column({ stage, leads, onOpen, onDragStart, onDrop, isTarget, onDragOver, onDragLeave }) {
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
        <LeadCard key={lead.id} lead={lead} onOpen={onOpen} onDragStart={onDragStart} />
      ))}

      {leads.length === 0 && (
        <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Пусто</p>
      )}
    </div>
  )
}

function Row({ label, children }) {
  if (!children) return null
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

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [staff, setStaff] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
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

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ls, ts, les] = await withTimeout(Promise.all([
        getDocs(collection(db, 'leads')),
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'legalEntities')),
      ]))
      setLeads(ls.docs.map(d => ({ id: d.id, ...d.data() })))
      setStaff(ts.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false))
      setLegalEntities(les.docs.map(d => ({ id: d.id, ...d.data() })))
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
      await fetchData()
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
  const handleConvert = (clientData) => run(async () => {
    const clientRef = doc(collection(db, 'clients'))
    const batch = writeBatch(db)
    batch.set(clientRef, { ...clientData, createdAt: new Date() })
    batch.update(doc(db, 'leads', open.id), {
      clientId: clientRef.id, archived: true, stage: 'paid', rejectReason: '',
    })
    await batch.commit()
    closeModal()
  })

  const handleDelete = (lead) => {
    if (!confirm(`Удалить лид «${lead.childName}»? Восстановить его будет нельзя.`)) return
    run(async () => {
      await deleteDoc(doc(db, 'leads', lead.id))
      closeModal()
    })
  }

  const onDragStart = (e, lead) => {
    e.dataTransfer.setData('text/plain', lead.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (e, stage) => {
    e.preventDefault()
    setDragOver(null)
    const lead = leads.find(l => l.id === e.dataTransfer.getData('text/plain'))
    if (lead) handleMoveStage(lead, stage)
  }

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1500px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>🎯 Лиды</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
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
        <button onClick={() => setAdding(true)} style={primaryBtn(false)}>✚ Добавить лид</button>
        <button onClick={() => setView(FUNNEL)} style={tab(view === FUNNEL)}>
          📊 Воронка ({leads.filter(l => !l.archived).length})
        </button>
        <button onClick={() => setView(ARCHIVE)} style={tab(view === ARCHIVE)}>
          📦 Архив ({leads.filter(l => l.archived).length})
        </button>
        <input placeholder="🔍 Поиск по имени, телефону, нику..." style={{ ...inputStyle, width: '280px' }}
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
              onOpen={lead => { setOpenId(lead.id); setMode('view') }}
              onDragStart={onDragStart}
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
                {lead.parentName && (
                  <span style={{ fontSize: '13px', color: '#6b7280' }}> · {lead.parentName}</span>
                )}
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {isConverted(lead) ? (
                    <>
                      <span style={{ color: '#059669' }}>✓ Стал клиентом</span>
                      {' — '}
                      <Link to={`/clients/${lead.clientId}`} style={{ color: '#7c3aed', textDecoration: 'none' }}>
                        открыть карточку
                      </Link>
                    </>
                  ) : (
                    <span style={{ color: '#dc2626' }}>✕ Отказ: {rejectLabel(lead.rejectReason) || 'без причины'}</span>
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
              <Row label="Кто обратился">{open.parentName}</Row>
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
              <button onClick={() => setMode('edit')} style={ghostBtn}>✎ Править</button>
              {!isConverted(open) && (
                <button onClick={() => setMode('convert')} disabled={saving} style={primaryBtn(saving)}>
                  ✓ Сделать клиентом
                </button>
              )}
              {!open.archived && (
                <button onClick={() => { setReason(REJECT_REASONS[0].value); setMode('reject') }} style={ghostBtn}>
                  ✕ Отказ
                </button>
              )}
              {isRejected(open) && (
                <button onClick={() => handleRestore(open)} disabled={saving} style={ghostBtn}>
                  Вернуть в воронку
                </button>
              )}
              <button onClick={() => handleDelete(open)} disabled={saving}
                style={{ ...ghostBtn, color: '#dc2626', marginLeft: 'auto' }}>🗑 Удалить</button>
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
