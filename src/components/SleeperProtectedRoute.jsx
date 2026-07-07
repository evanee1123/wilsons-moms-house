import { useState } from 'react'
import { useSleeperAuth } from '../contexts/SleeperAuthContext'
import SleeperLogin from './SleeperLogin'

export default function SleeperProtectedRoute({ children }) {
  const { sleeperUser } = useSleeperAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  if (sleeperUser) return children

  return (
    <div className='page'>
      {loginOpen && <SleeperLogin onClose={() => setLoginOpen(false)} />}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
        <div className='card' style={{ maxWidth: '480px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', lineHeight: 1 }}>🔐</div>
          <h3 style={{
            color: 'var(--text-primary)', marginBottom: '0.75rem',
            fontSize: '16px', fontWeight: 700,
          }}>
            Log in to view your Blueprint
          </h3>
          <p style={{
            color: 'var(--text-secondary)', fontSize: '13px',
            lineHeight: 1.7, marginBottom: '1.75rem',
          }}>
            Log in with your Sleeper account to view your personalized roster analysis,
            trade strategy, and priorities.
          </p>
          <button
            onClick={() => setLoginOpen(true)}
            style={{
              padding: '9px 22px',
              background: '#3182ce', border: 'none', borderRadius: '8px',
              color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2b6cb0' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#3182ce' }}
          >
            Log in with Sleeper
          </button>
        </div>
      </div>
    </div>
  )
}
