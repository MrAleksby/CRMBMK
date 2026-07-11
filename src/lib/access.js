// Кто что видит.
//
// Аккаунт в Firebase Auth сам по себе не даёт ничего: доступ включает админ.
// У каждого аккаунта есть документ в `users`, и решает именно он — `approved`
// и `role`. Те же проверки стоят в правилах Firestore: спрятать вкладку мало,
// иначе данные утекут через консоль браузера.
//
// Владелец зашит в код и в правила: иначе после перехода на эту модель некому
// было бы одобрить первого админа — он не смог бы прочитать даже свой профиль.

export const OWNER_UID = 'XqJUnm47gIPjQPJfKUTvgWnS0un2'

export const ROLE_ADMIN = 'admin'
export const ROLE_MANAGER = 'manager'
export const ROLE_TEACHER = 'teacher'

export const ROLES = [
  { value: ROLE_ADMIN, label: 'Админ', hint: 'Всё, включая кассы, расходы и доступы' },
  { value: ROLE_MANAGER, label: 'Менеджер', hint: 'Лиды, ученики, уроки, оплаты. Без кассы компании' },
  { value: ROLE_TEACHER, label: 'Педагог', hint: 'Только свои уроки и состав. Без денег' },
]

export const roleLabel = (role) =>
  ROLES.find(r => r.value === role)?.label ?? 'Педагог'

export const isOwner = (uid) => uid === OWNER_UID

export const isApproved = (uid, profile) =>
  isOwner(uid) || profile?.approved === true

// Роль владельца — всегда админ, даже если кто-то по ошибке снял ему галочку.
export const roleOf = (uid, profile) =>
  isOwner(uid) ? ROLE_ADMIN : (profile?.role || ROLE_TEACHER)

export const isAdmin = (uid, profile) =>
  isApproved(uid, profile) && roleOf(uid, profile) === ROLE_ADMIN

// --- права ---
//
// Деньги режутся на два слоя, как и в базе:
//   лицевой счёт ученика (оплаты, долги, абонементы) — нужен менеджеру: он
//     принимает деньги от родителей и должен видеть, кто должен;
//   касса компании (расходы, зарплаты, прибыль, остатки по кассам) — только админ.
// Педагог не видит ни того, ни другого: ему нужны расписание и состав.

export const canSeeCompanyMoney = (uid, profile) => isAdmin(uid, profile)

export const canSeeClientMoney = (uid, profile) => {
  const role = roleOf(uid, profile)
  return isApproved(uid, profile) && (role === ROLE_ADMIN || role === ROLE_MANAGER)
}

// Кто ведёт операционку: лиды, ученики, группы, журнал занятий.
// Педагог смотрит, но не правит: суммы списаний вводит менеджер.
export const canManage = (uid, profile) => canSeeClientMoney(uid, profile)

export const canSeeSettings = (uid, profile) => isAdmin(uid, profile)

// Педагог видит только свои занятия. Связь аккаунта со строкой справочника
// `teachers` задаёт админ: без неё «свои уроки» не определить.
export const teacherIdOf = (uid, profile) =>
  roleOf(uid, profile) === ROLE_TEACHER ? (profile?.teacherId || '') : ''

export const isTeacherRole = (uid, profile) =>
  roleOf(uid, profile) === ROLE_TEACHER

// Заявка на доступ. Роль и одобрение проставляет админ — сам себе их
// выписать нельзя, это же запрещено и правилами.
export const newUserDoc = ({ uid, email, name }) => ({
  uid,
  email: (email || '').trim().toLowerCase(),
  name: (name || '').trim(),
  role: ROLE_TEACHER,
  teacherId: '',
  approved: false,
  createdAt: new Date(),
})

// Код-приглашение отсеивает случайных людей на форме регистрации. Настоящая
// защита не в нём (он лежит в собранном JS), а в одобрении админом.
export const INVITE_CODE = import.meta.env.VITE_INVITE_CODE || ''

// Кода нет в сборке — регистрация закрыта. Иначе забытый секрет в CI молча
// открыл бы форму всему интернету.
export const inviteCodeOk = (value) =>
  INVITE_CODE !== '' && (value || '').trim().toLowerCase() === INVITE_CODE.toLowerCase()
