import { createPortal } from 'react-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotesStore } from '../../store/notesStore'
import { useSyncBoardStore } from '../../store/syncBoardStore'
import './AccountModal.css'

interface Props { isOpen: boolean; onClose: () => void }

export default function AccountModal({ isOpen, onClose }: Props) {
  const { user, signOut } = useAuthStore()
  const { notes, notebooks, canvases } = useNotesStore()
  const { items } = useSyncBoardStore()

  if (!isOpen || !user) return null

  const initial = user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? '?'
  const joinDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  const handleSignOut = async () => { onClose(); await signOut() }

  return createPortal(
    <div className="acct-overlay" onClick={onClose}>
      <div className="acct-modal" onClick={e => e.stopPropagation()}>
        <button className="acct-close" onClick={onClose}>×</button>

        <div className="acct-hero">
          <div className="acct-avatar">{initial}</div>
          <div>
            <h2 className="acct-name">{user.displayName || 'Synclyx User'}</h2>
            <p className="acct-email">{user.email}</p>
          </div>
        </div>

        <div className="acct-plan-row">
          <span className="acct-plan-badge">⚡ Free Plan</span>
          <button className="acct-upgrade" onClick={onClose} title="Coming in Phase 4">
            Upgrade to Pro ↗
          </button>
        </div>

        <div className="acct-stats">
          {[
            { label: 'Notes', value: notes.length },
            { label: 'Notebooks', value: notebooks.length },
            { label: 'Canvases', value: canvases.length },
            { label: 'Clips', value: items.length },
          ].map(s => (
            <div key={s.label} className="acct-stat">
              <span className="acct-stat-val">{s.value}</span>
              <span className="acct-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="acct-details">
          {[
            { label: 'Member since', value: joinDate },
            { label: 'Sync', value: '● Active', highlight: true },
            { label: 'Devices', value: 'This device (web)' },
            { label: 'Clipboard limit', value: '100 clips (Free) · Unlimited (Pro)' },
            { label: 'Password locks', value: '2 (Free) · Unlimited (Pro)' },
            { label: 'File uploads', value: 'Text only (Free) · Up to 10MB (Pro)' },
          ].map(r => (
            <div key={r.label} className="acct-row">
              <span className="acct-row-label">{r.label}</span>
              <span className={`acct-row-value ${r.highlight ? 'active' : ''}`}>{r.value}</span>
            </div>
          ))}
        </div>

        <p className="acct-pro-note">
          💡 <strong>Pro</strong> unlocks unlimited clips, file uploads, unlimited locks, and more — coming soon.
        </p>

        <button className="acct-signout" onClick={handleSignOut}>Sign Out</button>
      </div>
    </div>,
    document.body
  )
}
