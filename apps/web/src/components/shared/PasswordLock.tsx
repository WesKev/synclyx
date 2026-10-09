import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider } from 'firebase/auth'
import { useNotesStore } from '../../store/notesStore'
import { auth, googleProvider } from '../../lib/firebase'

function PasswordInput({ value, onChange, placeholder, autoFocus, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-input-wrap">
      <input className="link-field password-field" type={show ? 'text' : 'password'}
        placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />
      <button className="password-toggle-btn" type="button"
        onClick={() => setShow(s => !s)} title={show ? 'Hide' : 'Show'}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'inherit', opacity: 0.75, cursor: 'pointer',
  textDecoration: 'underline', fontSize: '0.85rem', padding: 0, marginTop: 10,
}

/**
 * Forgot the lock password? Prove you own the Synclyx ACCOUNT instead.
 * Why this is OK: a lock only hides an item on this device (it is not
 * encryption), so the account owner is already the higher authority.
 * Why NOT security questions: answers are guessable or findable online
 * (pet names, schools, birthplaces) and become a weaker back door around a
 * strong password. Recovery must be at least as strong as the thing it recovers.
 */
function ForgotLock({ onVerified, onBack }: { onVerified: () => void; onBack: () => void }) {
  const user = auth.currentUser
  const providers = user?.providerData.map(p => p.providerId) ?? []
  const hasPassword = providers.includes('password')
  const hasGoogle = providers.includes('google.com')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await fn(); onVerified() }
    catch { setError("Couldn't verify your account. Check your details and try again.") }
    finally { setBusy(false) }
  }
  const withPassword = () => run(() => reauthenticateWithCredential(user!, EmailAuthProvider.credential(user!.email!, pw)))
  const withGoogle = () => run(() => reauthenticateWithPopup(user!, googleProvider))

  return (
    <>
      <p className="lock-subtitle">Confirm it's you with your Synclyx account. The lock on this item will be removed so you can set a new one.</p>
      {!user && <p className="lock-error">You need to be signed in to do this.</p>}
      {user && hasPassword && (
        <>
          <PasswordInput value={pw} onChange={v => { setPw(v); setError('') }} placeholder="Your Synclyx account password" autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && pw) withPassword() }} />
          <button className="popup-confirm" style={{ marginTop: 10, width: '100%' }} disabled={busy || !pw} onClick={withPassword}>
            {busy ? 'Checking…' : 'Verify and remove lock'}
          </button>
        </>
      )}
      {user && hasGoogle && (
        <button className="popup-confirm" style={{ marginTop: 10, width: '100%' }} disabled={busy} onClick={withGoogle}>
          {busy ? 'Checking…' : 'Verify with Google and remove lock'}
        </button>
      )}
      {error && <p className="lock-error">{error}</p>}
      <button type="button" style={linkBtn} onClick={onBack}>← Back</button>
    </>
  )
}

interface LockProps { itemId: string; itemTitle: string; onClose: () => void }

export function LockSetup({ itemId, itemTitle, onClose }: LockProps) {
  const { lockItem, lockedItems = {}, unlockItem, verifyLock } = useNotesStore()
  const isLocked = !!lockedItems[itemId]
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentPass, setCurrentPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const lockedCount = Object.keys(lockedItems).length
  const FREE_LIMIT = 2

  const handleLock = async () => {
    if (!isLocked && lockedCount >= FREE_LIMIT) { setError(`Free tier allows ${FREE_LIMIT} locks. Upgrade to Pro for more.`); return }
    if (!password.trim()) { setError('Password cannot be empty'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true)
    await lockItem(itemId, password)
    setBusy(false); onClose()
  }
  const handleUnlock = async () => {
    setBusy(true)
    const ok = await verifyLock(itemId, currentPass)
    setBusy(false)
    if (!ok) { setError('Incorrect password'); return }
    unlockItem(itemId); onClose()
  }

  return createPortal(
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup lock-popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>{isLocked ? '🔓 Remove Lock' : '🔒 Lock'}</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-body">
          <p className="lock-note-title">"{itemTitle}"</p>
          {!isLocked ? (
            <>
              <div className="popup-fields">
                <PasswordInput value={password} onChange={v => { setPassword(v); setError('') }} placeholder="Set password" autoFocus />
                <PasswordInput value={confirm} onChange={v => { setConfirm(v); setError('') }} placeholder="Confirm password"
                  onKeyDown={e => { if (e.key === 'Enter') handleLock() }} />
              </div>
              {error && <p className="lock-error">{error}</p>}
              <p className="lock-hint">🔒 {lockedCount}/{FREE_LIMIT} free locks used.</p>
              <p className="lock-hint">ℹ️ A lock hides this item on this device. It isn't encryption and doesn't sync to your other devices. Don't rely on it for secrets.</p>
            </>
          ) : forgot ? (
            <ForgotLock onVerified={() => { unlockItem(itemId); onClose() }} onBack={() => setForgot(false)} />
          ) : (
            <>
              <div className="popup-fields">
                <PasswordInput value={currentPass} onChange={v => { setCurrentPass(v); setError('') }}
                  placeholder="Enter current password to remove lock" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleUnlock() }} />
              </div>
              {error && <p className="lock-error">{error}</p>}
              <button type="button" style={linkBtn} onClick={() => setForgot(true)}>Forgot password?</button>
            </>
          )}
        </div>
        {!forgot && (
          <div className="popup-footer">
            <button className="popup-cancel" onClick={onClose}>Cancel</button>
            <button className="popup-confirm" disabled={busy} onClick={isLocked ? handleUnlock : handleLock}>
              {busy ? 'Working…' : isLocked ? 'Remove Lock' : 'Lock'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

interface UnlockProps { itemId: string; itemTitle: string; onSuccess: () => void; onCancel: () => void }

export function UnlockPrompt({ itemId, itemTitle, onSuccess, onCancel }: UnlockProps) {
  const { verifyLock, unlockItem } = useNotesStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const handleSubmit = async () => {
    setBusy(true)
    const ok = await verifyLock(itemId, password)
    setBusy(false)
    if (ok) { onSuccess() }
    else { setError('Incorrect password'); setPassword('') }
  }
  return (
    <div className="popup" style={{ maxWidth: '22rem', width: '90%' }} onClick={e => e.stopPropagation()}>
      <div className="popup-header"><span>🔒 Locked</span></div>
      <div className="popup-body">
        <div className="lock-icon-big">🔒</div>
        <p className="lock-note-title">"{itemTitle}"</p>
        {forgot ? (
          <ForgotLock onVerified={() => { unlockItem(itemId); onSuccess() }} onBack={() => setForgot(false)} />
        ) : (
          <>
            <p className="lock-subtitle">Enter the password to open</p>
            <PasswordInput value={password} onChange={v => { setPassword(v); setError('') }}
              placeholder="Password" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }} />
            {error && <p className="lock-error">{error}</p>}
            <button type="button" style={linkBtn} onClick={() => setForgot(true)}>Forgot password?</button>
          </>
        )}
      </div>
      {!forgot && (
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onCancel}>Cancel</button>
          <button className="popup-confirm" disabled={busy} onClick={handleSubmit}>{busy ? 'Checking…' : 'Unlock'}</button>
        </div>
      )}
    </div>
  )
}
