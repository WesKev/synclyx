import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../store/notesStore'

function PasswordInput({ value, onChange, placeholder, autoFocus, onKeyDown }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-input-wrap">
      <input
        className="link-field password-field"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
      <button
        className="password-toggle-btn"
        type="button"
        onClick={() => setShow(s => !s)}
        title={show ? 'Hide password' : 'Show password'}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

interface LockProps {
  itemId: string
  itemTitle: string
  onClose: () => void
}

export function LockSetup({ itemId, itemTitle, onClose }: LockProps) {
  const { lockItem, lockedItems = {}, unlockItem, verifyLock } = useNotesStore()
  const isLocked = !!lockedItems[itemId]
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentPass, setCurrentPass] = useState('')
  const [error, setError] = useState('')

  const lockedCount = Object.keys(lockedItems).length
  const FREE_LOCK_LIMIT = 2

  const handleLock = () => {
    if (!isLocked && lockedCount >= FREE_LOCK_LIMIT) {
      setError(`Free tier allows ${FREE_LOCK_LIMIT} locks. Upgrade to Pro for more.`)
      return
    }
    if (!password.trim()) { setError('Password cannot be empty'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    lockItem(itemId, password)
    onClose()
  }

  const handleUnlock = () => {
    if (!verifyLock(itemId, currentPass)) { setError('Incorrect password'); return }
    unlockItem(itemId)
    onClose()
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
                <PasswordInput value={password} onChange={v => { setPassword(v); setError('') }}
                  placeholder="Set password" autoFocus />
                <PasswordInput value={confirm} onChange={v => { setConfirm(v); setError('') }}
                  placeholder="Confirm password"
                  onKeyDown={e => { if (e.key === 'Enter') handleLock() }} />
              </div>
              {error && <p className="lock-error">{error}</p>}
              <p className="lock-hint">
                🔒 {lockedCount}/{FREE_LOCK_LIMIT} free locks used.
                {lockedCount >= FREE_LOCK_LIMIT ? ' Upgrade to Pro for unlimited locks.' : ''}
              </p>
            </>
          ) : (
            <>
              <div className="popup-fields">
                <PasswordInput value={currentPass}
                  onChange={v => { setCurrentPass(v); setError('') }}
                  placeholder="Enter current password to remove lock"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleUnlock() }} />
              </div>
              {error && <p className="lock-error">{error}</p>}
            </>
          )}
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onClose}>Cancel</button>
          <button className="popup-confirm" onClick={isLocked ? handleUnlock : handleLock}>
            {isLocked ? 'Remove Lock' : 'Lock'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface UnlockProps {
  itemId: string
  itemTitle: string
  onSuccess: () => void
  onCancel: () => void
}

export function UnlockPrompt({ itemId, itemTitle, onSuccess, onCancel }: UnlockProps) {
  const { verifyLock } = useNotesStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (verifyLock(itemId, password)) {
      onSuccess()
    } else {
      setError('Incorrect password')
      setPassword('')
    }
  }

  return (
    <div className="popup" style={{ maxWidth: '22rem', width: '90%' }} onClick={e => e.stopPropagation()}>
      <div className="popup-header">
        <span>🔒 Locked</span>
      </div>
      <div className="popup-body">
        <div className="lock-icon-big">🔒</div>
        <p className="lock-note-title">"{itemTitle}"</p>
        <p className="lock-subtitle">Enter the password to open</p>
        <PasswordInput value={password}
          onChange={v => { setPassword(v); setError('') }}
          placeholder="Password" autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
        />
        {error && <p className="lock-error">{error}</p>}
      </div>
      <div className="popup-footer">
        <button className="popup-cancel" onClick={onCancel}>Cancel</button>
        <button className="popup-confirm" onClick={handleSubmit}>Unlock</button>
      </div>
    </div>
  )
}
