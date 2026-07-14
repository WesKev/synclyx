import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../store/notesStore'

export default function TrashView({ onClose }: { onClose: () => void }) {
  const { trash = [], restoreFromTrash, permanentlyDelete, emptyTrash } = useNotesStore()
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  const daysLeft = (deletedAt: number) =>
    Math.max(0, 30 - Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24)))

  return createPortal(
    <div className="popup-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="popup trash-popup" onMouseDown={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>🗑 Trash ({trash.length})</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {trash.length > 0 && !confirmEmpty && (
              <button className="popup-cancel" onClick={() => setConfirmEmpty(true)}>Empty Trash</button>
            )}
            {confirmEmpty && (
              <>
                <button className="popup-cancel" onClick={() => setConfirmEmpty(false)}>Cancel</button>
                <button className="popup-confirm" style={{ background: '#ff4444' }}
                  onClick={() => { emptyTrash(); setConfirmEmpty(false) }}>Confirm Empty</button>
              </>
            )}
            <button className="popup-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="trash-body">
          {trash.length === 0 ? (
            <div className="trash-empty">
              <span className="trash-empty-icon">🗑</span>
              <p>Trash is empty</p>
              <span>Deleted notes and canvases appear here for 30 days</span>
            </div>
          ) : (
            <div className="trash-list">
              {trash.map(item => (
                <div key={item.id} className="trash-item">
                  <div className="trash-item-icon">{item.type === 'note' ? '📝' : '🌐'}</div>
                  <div className="trash-item-info">
                    <span className="trash-item-title">
                      {item.type === 'note' ? (item.data as any).title || 'Untitled' : (item.data as any).name || 'Canvas'}
                    </span>
                    <span className="trash-item-meta">
                      Deleted {formatDate(item.deletedAt)} · {daysLeft(item.deletedAt)} days left
                    </span>
                  </div>
                  <div className="trash-item-actions">
                    <button className="trash-restore-btn" onClick={() => restoreFromTrash(item.id)}>↩ Restore</button>
                    <button className="trash-delete-btn"
                      onClick={() => { if (confirm('Permanently delete? Cannot be undone.')) permanentlyDelete(item.id) }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="popup-footer">
          <span className="trash-hint">Items are automatically deleted after 30 days</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
