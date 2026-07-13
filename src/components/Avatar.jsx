import Icon from './Icon'
import { genderInfo } from '../lib/client'

// Кружок с портретом ученика. Мальчик и девочка различаются и рисунком, и цветом:
// в списке из пятидесяти строк это читается быстрее, чем подпись.
// Клиента может не быть вовсе — доход от плательщика без карточки (кешбек, турнир);
// тогда кружок серый и безликий.
export default function Avatar({ client, size = 30 }) {
  const gender = client ? genderInfo(client) : null
  const female = gender?.value === 'female'
  const color = !gender ? '#6b7280' : (female ? '#db2777' : '#2563eb')
  const background = !gender ? '#f3f4f6' : (female ? '#fce7f3' : '#dbeafe')

  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', background,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0,
    }}>
      <Icon name={!client ? 'clients' : (female ? 'girl' : 'boy')} size={Math.round(size * 0.57)} />
    </div>
  )
}
