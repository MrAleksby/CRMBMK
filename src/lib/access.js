// Кто пущен в систему.
//
// Аккаунт в Firebase Auth сам по себе не даёт ничего: доступ к данным включает
// админ. Поэтому у каждого аккаунта есть документ в коллекции `users`, и решает
// именно он — `approved`. Правила Firestore проверяют то же самое, так что
// неодобренный не прочитает ни одной записи, даже минуя интерфейс.
//
// Владелец зашит в код и в правила: иначе после перехода на новую модель некому
// было бы одобрить первого админа — он не смог бы даже прочитать свой профиль.

export const OWNER_UID = 'XqJUnm47gIPjQPJfKUTvgWnS0un2'

export const ROLE_ADMIN = 'admin'
export const ROLE_STAFF = 'staff'

export const ROLES = [
  { value: ROLE_ADMIN, label: 'Админ', hint: 'Видит всё и выдаёт доступ другим' },
  { value: ROLE_STAFF, label: 'Сотрудник', hint: 'Видит всё, но доступом не управляет' },
]

export const roleLabel = (role) =>
  ROLES.find(r => r.value === role)?.label ?? 'Сотрудник'

// Владелец — админ всегда, даже если его документ ещё не заведён или кто-то
// по ошибке снял ему галочку. Иначе можно запереть самого себя.
export const isOwner = (uid) => uid === OWNER_UID

export const isApproved = (uid, profile) =>
  isOwner(uid) || profile?.approved === true

export const isAdmin = (uid, profile) =>
  isOwner(uid) || (profile?.approved === true && profile?.role === ROLE_ADMIN)

// Заявка на доступ. Роль и одобрение проставляет админ — сам себе их
// выписать нельзя, это же запрещено и правилами.
export const newUserDoc = ({ uid, email, name }) => ({
  uid,
  email: (email || '').trim().toLowerCase(),
  name: (name || '').trim(),
  role: ROLE_STAFF,
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
