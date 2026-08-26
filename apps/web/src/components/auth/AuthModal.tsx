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
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { signIn, signUp, signInWithGoogle, error, clearError } = useAuthStore()

  if (!isOpen) return null

  const handleClose = () => {
    setEmail(''); setPassword(''); setDisplayName('')
    clearError(); onClose()
  }

  const switchMode = (next: 'signin' | 'signup') => {
    clearError(); setMode(next)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
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
          <h2>{mode === 'signin' ? 'Welcome back' : 'Join Synclyx'}</h2>
          <p>{mode === 'signin'
            ? 'Sign in to sync your notes across devices'
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
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" minLength={6} required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
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
