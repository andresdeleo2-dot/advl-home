'use client'

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <div style={{ padding: 40, fontFamily: 'monospace', background: '#0f0f13', color: 'white', minHeight: '100vh' }}>
      <h2 style={{ color: '#f87171' }}>Error</h2>
      <pre style={{ whiteSpace: 'pre-wrap', color: '#fbbf24', fontSize: 13 }}>
        {error?.message}
        {'\n\n'}
        {error?.stack}
      </pre>
    </div>
  )
}
