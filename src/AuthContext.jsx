import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase'

const AuthContext = createContext({ user: undefined, profile: null })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)   // undefined = ещё грузится
  const [profile, setProfile] = useState(undefined)

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next)
    if (!next) setProfile(null)
  }), [])

  // Профиль слушаем, а не читаем один раз: админ выдаёт доступ в соседней
  // вкладке, и сотрудник должен увидеть систему сразу, без перезахода.
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(
      doc(db, 'users', user.uid),
      snap => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      // Свой профиль читать разрешено всем, но если правила всё же откажут —
      // считаем, что доступа нет, а не подвешиваем экран загрузки.
      () => setProfile(null),
    )
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
