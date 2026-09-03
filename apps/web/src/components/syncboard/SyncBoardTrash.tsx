import { createPortal } from 'react-dom'
import { useSyncBoardStore } from '../../store/syncBoardStore'
import ConfirmDialog from './ConfirmDialog'
import { useState } from 'react'
import './SyncBoardTrash.css'

interface Props { onClose: () => void }

export default function SyncBoardTrash({ onClose }: Props) {
  const { trash, restoreFromTrash, permanentlyDelete, emptyTrash } = useSyncBoardStore()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const sorted = [...trash].sort((a, b) => b.deletedAt - a.deletedAt)

  return createPortal(
    <div className="sbt-overlay" onClick={onClose}>
      <div className="sbt-panel" onClick={e => e.stopPropagation()}>

        <div className="sbt-header">
          <div className="sbt-header-left">
            <span className="sbt-icon">🗑</span>
            <div>
              <h2 className="sbt-title">SyncBoard Trash</h2>
              <p className="sbt-subtitle">Items deleted in the last 10 days · {trash.length} item{trash.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="sbt-header-actions">
            {trash.length > 0 && (
              <button className="sbt-empty-btn" onClick={() => setConfirmEmpty(true)}>
                Empty trash
              </button>
            )}
            <button className="sbt-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="sbt-body">
          {sorted.length === 0 ? (
            <div className="sbt-empty-state">
              <span>🗑</span>
              <p>Trash is empty</p>
              <span className="sbt-empty-hint">Deleted clips appear here for 10 days before being permanently removed</span>
            </div>
          ) : sorted.map(entry => {
            const daysLeft = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
            const hoursLeft = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / (1000 * 60 * 60)))
            const timeLabel = daysLeft === 0
              ? hoursLeft <= 1 ? 'Expires in less than 1 hour' : `Expires in ${hoursLeft} hours`
              : daysLeft === 1 ? 'Expires tomorrow'
              : `Expires in ${daysLeft} days`
            const urgent = daysLeft === 0

            return (
              <div key={entry.id} className={`sbt-item ${urgent ? 'urgent' : ''}`}>
                <div className="sbt-item-type">
                  {entry.item.type === 'link' ? '🔗' : entry.item.type === 'code' ? '💻' : '📄'}
                </div>
                <div className="sbt-item-body">
                  {entry.item.label && (
                    <span className="sbt-item-label">🏷️ {entry.item.label}</span>
                  )}
                  <p className="sbt-item-content">
                    {entry.item.content.slice(0, 120)}
                    {entry.item.content.length > 120 ? '…' : ''}
                  </p>
                  <div className="sbt-item-meta">
                    <span>Deleted {fmtDate(entry.deletedAt)}</span>
                    <span className={`sbt-expiry ${urgent ? 'urgent' : ''}`}>⏳ {timeLabel}</span>
                  </div>
                </div>
                <div className="sbt-item-actions">
                  <button className="sbt-restore-btn" onClick={() => restoreFromTrash(entry.id)}>
                    ↩ Restore
                  </button>
                  <button className="sbt-delete-btn" onClick={() => setConfirmDelete(entry.id)}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <ConfirmDialog
          isOpen={confirmEmpty}
          title="Empty trash?"
          message={`This permanently deletes all ${trash.length} clip${trash.length !== 1 ? 's' : ''} in trash. Cannot be undone.`}
          confirmLabel="Empty trash"
          danger
          onConfirm={() => { emptyTrash(); setConfirmEmpty(false) }}
          onCancel={() => setConfirmEmpty(false)}
        />
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Permanently delete this clip?"
          message="This cannot be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => { if (confirmDelete) permanentlyDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    </div>,
    document.body
  )
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
