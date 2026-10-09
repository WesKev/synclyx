import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../store/authStore'
import './AuthModal.css'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const { signIn, signUp, signInWithGoogle, resetPassword, error, clearError } = useAuthStore()

  if (!isOpen) return null

  const handleClose = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setResetSent(false); setShowPw(false)
    clearError(); onClose()
  }

  const switchMode = (next: 'signin' | 'signup' | 'reset') => {
    clearError(); setResetSent(false); setMode(next)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'reset') {
        await resetPassword(email)
        setResetSent(true)
        return
      }
      if (mode === 'signup') {
        await signUp(email, password, displayName || email.split('@')[0])
      } else {
        await signIn(email, password)
      }
      handleClose()
    } catch { /* error already in store */ }
    finally { setSubmitting(false) }
  }

  const handleGoogle = async () => {
    setSubmitting(true)
    try { await signInWithGoogle(); handleClose() }
    catch { /* error already in store */ }
    finally { setSubmitting(false) }
  }

  return createPortal(
    <div className="auth-overlay" onClick={handleClose}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>

        <button className="auth-close" onClick={handleClose} aria-label="Close">×</button>

        <div className="auth-header">
          <div className="auth-logo">⚡</div>
          <h2>{mode === 'signin' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : 'Join Synclyx'}</h2>
          <p>{mode === 'signin'
            ? 'Sign in to sync your notes across devices'
            : mode === 'reset'
              ? "Enter your email and we'll send you a reset link"
              : 'Create an account to start syncing'}
          </p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} type="button">Sign In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} type="button">Sign Up</button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <label>
              Name
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Wesley" autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <span style={{ position: 'relative', display: 'block' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" minLength={6} required style={{ paddingRight: 44, width: '100%', boxSizing: 'border-box' }}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                  title={showPw ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none',
                    border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.7, padding: 4, display: 'flex' }}>
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
            </label>
          )}
          {mode === 'reset' && resetSent && (
            <div className="auth-error" style={{ background: 'rgba(60,160,90,0.15)', borderColor: 'rgba(60,160,90,0.5)', color: '#8be9a8' }}>
              If that email has an account, a reset link is on its way. Check your inbox and spam folder.
            </div>
          )}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Please wait…'
              : mode === 'signin' ? 'Sign In'
              : mode === 'reset' ? 'Send reset link'
              : 'Create Account'}
          </button>
          {mode === 'signin' && (
            <button type="button" onClick={() => switchMode('reset')}
              style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.75, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem', marginTop: 8 }}>
              Forgot password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" onClick={() => switchMode('signin')}
              style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.75, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem', marginTop: 8 }}>
              ← Back to sign in
            </button>
          )}
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button className="auth-google" onClick={handleGoogle} disabled={submitting} type="button">
          <GoogleIcon />
          Continue with Google
        </button>

      </div>
    </div>,
    document.body
  )
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a19.7 19.7 0 0 1-3.17 4.19M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  )
}
