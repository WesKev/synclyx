import React, { useState } from 'react'
import { useNotesStore } from '../../store/notesStore'

interface LockProps {
  itemId: string
  itemTitle: string
  onClose: () => void
}

export function LockSetup({ itemId, itemTitle, onClose }: LockProps) {
  const { lockItem, lockedItems, unlockItem, verifyLock } = useNotesStore()
  const isLocked = !!lockedItems[itemId]
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentPass, setCurrentPass] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'set' | 'remove'>(isLocked ? 'remove' : 'set')

  const handleLock = () => {
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

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup lock-popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>{isLocked ? '🔓 Remove Lock' : '🔒 Lock Note'}</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-body">
          <p className="lock-note-title">"{itemTitle}"</p>
          {!isLocked ? (
            <>
              <div className="popup-fields">
                <input className="link-field" type="password" placeholder="Set password"
                  value={password} onChange={e => { setPassword(e.target.value); setError('') }} autoFocus />
                <input className="link-field" type="password" placeholder="Confirm password"
                  value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }} />
              </div>
              {error && <p className="lock-error">{error}</p>}
              <p className="lock-hint">🔒 You get 2 free locks. More locks require a Pro subscription.</p>
            </>
          ) : (
            <>
              <div className="popup-fields">
                <input className="link-field" type="password" placeholder="Enter current password to remove lock"
                  value={currentPass} onChange={e => { setCurrentPass(e.target.value); setError('') }} autoFocus />
              </div>
              {error && <p className="lock-error">{error}</p>}
            </>
          )}
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onClose}>Cancel</button>
          <button className="popup-confirm" onClick={isLocked ? handleUnlock : handleLock}>
            {isLocked ? 'Remove Lock' : 'Lock Note'}
          </button>
        </div>
      </div>
    </div>
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
  const [attempts, setAttempts] = useState(0)

  const handleSubmit = () => {
    if (verifyLock(itemId, password)) {
      onSuccess()
    } else {
      setAttempts(a => a + 1)
      setError(`Incorrect password${attempts >= 2 ? ' — too many attempts' : ''}`)
      setPassword('')
    }
  }

  return (
    <div className="popup-overlay" onClick={onCancel}>
      <div className="popup lock-popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>🔒 Locked Note</span>
          <button className="popup-close" onClick={onCancel}>✕</button>
        </div>
        <div className="popup-body">
          <div className="lock-icon-big">🔒</div>
          <p className="lock-note-title">"{itemTitle}"</p>
          <p className="lock-subtitle">Enter the password to open this note</p>
          <input className="link-field" type="password" placeholder="Password"
            value={password} autoFocus
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          />
          {error && <p className="lock-error">{error}</p>}
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onCancel}>Cancel</button>
          <button className="popup-confirm" onClick={handleSubmit}>Unlock</button>
        </div>
      </div>
    </div>
  )
}
