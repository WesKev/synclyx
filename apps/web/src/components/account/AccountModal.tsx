import { createPortal } from 'react-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotesStore } from '../../store/notesStore'
import { useSyncBoardStore } from '../../store/syncBoardStore'
import './AccountModal.css'

// Canvas limits per plan
const CANVAS_LIMITS = { free: 10, basic: 20, pro: Infinity }
const CLIP_LIMITS = { free: 100, basic: Infinity, pro: Infinity }

interface Props { isOpen: boolean; onClose: () => void }

export default function AccountModal({ isOpen, onClose }: Props) {
  const { user, signOut } = useAuthStore()
  const { notes, notebooks, canvases } = useNotesStore()
  const { items } = useSyncBoardStore()

  if (!isOpen || !user) return null

  // Read plan from user profile — defaults to free for now
  // Phase 4 will wire this to Stripe/Lemon Squeezy
  const plan: 'free' | 'basic' | 'pro' = 'free'

  const canvasLimit = CANVAS_LIMITS[plan]
  const clipLimit = CLIP_LIMITS[plan]
  const canvasUsed = canvases.length
  const canvasPct = canvasLimit === Infinity ? 0 : Math.min((canvasUsed / canvasLimit) * 100, 100)

  const initial = user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? '?'
  const joinDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  const handleSignOut = async () => { onClose(); await signOut() }

  return createPortal(
    <div className="acct-overlay" onClick={onClose}>
      <div className="acct-modal" onClick={e => e.stopPropagation()}>
        <button className="acct-close" onClick={onClose}>×</button>

        {/* Avatar + identity */}
        <div className="acct-hero">
          <div className="acct-avatar">{initial}</div>
          <div>
            <h2 className="acct-name">{user.displayName || 'Synclyx User'}</h2>
            <p className="acct-email">{user.email}</p>
          </div>
        </div>

        {/* Plan badge + upgrade */}
        <div className="acct-plan-row">
          <span className={`acct-plan-badge ${plan}`}>
            {plan === 'free' ? '⚡ Free Plan' : plan === 'basic' ? '🌟 Basic Plan' : '🚀 Pro Plan'}
          </span>
          {plan === 'free' && (
            <button className="acct-upgrade" title="Coming in Phase 4">
              Upgrade ↗
            </button>
          )}
        </div>

        {/* Usage stats */}
        <div className="acct-stats">
          {[
            { label: 'Notes', value: notes.length },
            { label: 'Notebooks', value: notebooks.length },
            { label: 'Canvases', value: canvasUsed },
            { label: 'Clips', value: items.length },
          ].map(s => (
            <div key={s.label} className="acct-stat">
              <span className="acct-stat-val">{s.value}</span>
              <span className="acct-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Canvas usage bar */}
        {canvasLimit !== Infinity && (
          <div className="acct-usage-wrap">
            <div className="acct-usage-header">
              <span className="acct-usage-label">Canvases</span>
              <span className="acct-usage-count">
                {canvasUsed} / {canvasLimit}
                {canvasUsed >= canvasLimit && <span className="acct-usage-full"> — limit reached</span>}
              </span>
            </div>
            <div className="acct-usage-bar">
              <div
                className={`acct-usage-fill ${canvasPct >= 100 ? 'full' : canvasPct >= 80 ? 'warn' : ''}`}
                style={{ width: `${canvasPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Plan details */}
        <div className="acct-details">
          {[
            { label: 'Member since', value: joinDate },
            { label: 'Sync', value: '● Active', highlight: true },
            { label: 'Canvases', value: canvasLimit === Infinity ? 'Unlimited' : `${canvasLimit} max` },
            { label: 'Clipboard clips', value: clipLimit === Infinity ? 'Unlimited' : `${clipLimit} max` },
            { label: 'Password locks', value: plan === 'free' ? '2 max' : plan === 'basic' ? '10 max' : 'Unlimited' },
            { label: 'File uploads', value: plan === 'free' ? 'Up to 2MB' : plan === 'basic' ? 'Up to 10MB' : 'Up to 50MB' },
          ].map(r => (
            <div key={r.label} className="acct-row">
              <span className="acct-row-label">{r.label}</span>
              <span className={`acct-row-value ${r.highlight ? 'active' : ''}`}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Tier comparison */}
        <div className="acct-tier-table">
          <div className="acct-tier-header">
            <span />
            <span className={plan === 'free' ? 'current' : ''}>Free</span>
            <span className={plan === 'basic' ? 'current' : ''}>Basic</span>
            <span className={plan === 'pro' ? 'current' : ''}>Pro</span>
          </div>
          {[
            { label: 'Canvases', values: ['10', '20', '∞'] },
            { label: 'Clips', values: ['100', '∞', '∞'] },
            { label: 'Locks', values: ['2', '10', '∞'] },
            { label: 'Files', values: ['2MB', '10MB', '50MB'] },
            { label: 'Price', values: ['$0', '~$2-3/mo', '~$5-6/mo'] },
          ].map(row => (
            <div key={row.label} className="acct-tier-row">
              <span className="acct-tier-label">{row.label}</span>
              {row.values.map((v, i) => (
                <span key={i} className={`acct-tier-cell ${['free','basic','pro'][i] === plan ? 'current' : ''}`}>{v}</span>
              ))}
            </div>
          ))}
        </div>

        {plan === 'free' && (
          <p className="acct-pro-note">
            💡 <strong>Basic & Pro</strong> unlock more canvases, larger file uploads, more locks, and unlimited clips. Coming in Phase 4.
          </p>
        )}

        <button className="acct-signout" onClick={handleSignOut}>Sign Out</button>
      </div>
    </div>,
    document.body
  )
}
