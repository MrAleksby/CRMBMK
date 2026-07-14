import { useEffect, useState } from 'react'

// Порог тот же, что у мобильной навигации в App.jsx: 768px.
// Держать его в одном месте важно — иначе таблица «схлопнется» в карточки на одной
// ширине, а нижнее меню появится на другой, и между ними будет полоса разлома.
export const MOBILE_QUERY = '(max-width: 768px)'

// Телефон ли. Нужен там, где одним CSS не обойтись: на узком экране мы не сжимаем
// таблицу, а рисуем вместо неё карточки, и календарь открываем сразу днём.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = (e) => setIsMobile(e.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}
