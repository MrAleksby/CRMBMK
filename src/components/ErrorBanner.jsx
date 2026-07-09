// Показывается вместо тишины, когда данные не загрузились.
export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div style={{
      background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
      borderRadius: '12px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    }}>
      <span>⚠️ {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: 'transparent', color: '#b91c1c', border: '1px solid #fecaca',
          padding: '5px 12px', borderRadius: '8px', fontSize: '12px',
          cursor: 'pointer', flexShrink: 0,
        }}>Повторить</button>
      )}
    </div>
  )
}
