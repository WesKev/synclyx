import type { SyncStatus } from '../../hooks/useSyncStatus'
import './SyncIndicator.css'

interface Props {
  status: SyncStatus
  onSave?: () => void
  label?: boolean  // show text label alongside cloud
}

export default function SyncIndicator({ status, onSave, label = true }: Props) {
  return (
    <div className={`sync-indicator sync-${status}`} title={
      status === 'idle' ? 'All changes saved'
      : status === 'saving' ? 'Saving to cloud…'
      : 'Saved to cloud'
    }>
      <CloudSVG status={status} />
      {label && (
        <span className="sync-label">
          {status === 'idle' ? '' : status === 'saving' ? 'Saving…' : 'Saved ✓'}
        </span>
      )}
      {onSave && (
        <button
          className="sync-save-btn"
          onClick={onSave}
          title="Save now"
        >
          {/* Always clickable — a manual flush is safe even mid-'saving',
              since it just force-commits whatever is currently pending.
              Previously disabled during 'saving', which — combined with
              the indicator's long debounce — meant continuous typing kept
              this button permanently unusable. */}
          Save now
        </button>
      )}
    </div>
  )
}

function CloudSVG({ status }: { status: SyncStatus }) {
  // Cloud path — simple and clean
  return (
    <svg
      className={`sync-cloud sync-cloud-${status}`}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cloud body */}
      <path
        className="sync-cloud-path"
        d="M17.5 10.5A5.5 5.5 0 0 0 7.07 8.4 4 4 0 1 0 5 16h12.5a3.5 3.5 0 0 0 0-7z"
      />
      {/* Checkmark — only visible in saved state */}
      {status === 'saved' && (
        <polyline
          className="sync-check"
          points="9 12 11 14 15 10"
        />
      )}
      {/* Upload arrow — visible in saving state */}
      {status === 'saving' && (
        <g className="sync-arrow">
          <line x1="12" y1="15" x2="12" y2="11" />
          <polyline points="10 13 12 11 14 13" />
        </g>
      )}
    </svg>
  )
}
