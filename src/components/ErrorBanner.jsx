// Показывается вместо тишины, когда данные не загрузились.
export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div style={{
      background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d',
      borderRadius: '12px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    }}>
      <span>⚠️ {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: 'transparent', color: '#fca5a5', border: '1px solid #7f1d1d',
          padding: '5px 12px', borderRadius: '8px', fontSize: '12px',
          cursor: 'pointer', flexShrink: 0,
        }}>Повторить</button>
      )}
    </div>
  )
}
