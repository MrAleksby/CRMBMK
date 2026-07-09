// Firestore при заблокированном транспорте не отклоняет промис, а ждёт бесконечно.
// Тогда `finally { setLoading(false) }` не выполняется и страница висит на «Загрузка...».
// Оборачиваем запросы: через TIMEOUT_MS промис гарантированно завершится ошибкой.

export const TIMEOUT_MS = 15000

export class TimeoutError extends Error {
  constructor(message = 'Превышено время ожидания') {
    super(message)
    this.name = 'TimeoutError'
  }
}

export function withTimeout(promise, ms = TIMEOUT_MS) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Текст ошибки для пользователя: без стектрейсов и кодов Firebase.
export function describeError(error) {
  if (error instanceof TimeoutError) {
    return 'Сервер не ответил. Проверьте интернет и попробуйте снова.'
  }
  if (error?.code === 'permission-denied') {
    return 'Нет доступа к данным. Похоже, вход устарел — перезайдите в систему.'
  }
  if (error?.code === 'unavailable') {
    return 'Нет связи с базой данных. Проверьте интернет.'
  }
  return 'Не удалось загрузить данные. Попробуйте ещё раз.'
}
