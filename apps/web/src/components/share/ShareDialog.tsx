import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import './ShareDialog.css'

interface Props {
  itemLabel: string          // "note" or "canvas" — for copy text
  title: string              // note/canvas title, shown in the dialog
  isPublic: boolean
  shareId?: string
  locked?: boolean           // item has a lock on this device
  onToggle: () => void       // calls toggleNotePublicLink / toggleCanvasPublicLink
  onClose: () => void
}

export default function ShareDialog({ itemLabel, title, isPublic, shareId, locked = false, onToggle, onClose }: Props) {
  // A public link shows the WHOLE item to anyone, ignoring the lock. So a locked item can't be newly shared.
  const blocked = locked && !isPublic
  const [copied, setCopied] = useState(false)

  const url = shareId ? `${window.location.origin}/share/${shareId}` : ''

  const handleCopy = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return createPortal(
    <div className="share-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={e => e.stopPropagation()}>
        <div className="share-header">
          <span>🔗 Share "{title || 'Untitled'}"</span>
          <button className="share-close" onClick={onClose}>×</button>
        </div>

        <div className="share-body">
          <div className="share-toggle-row">
            <div>
              <div className="share-toggle-label">Anyone with the link can view</div>
              <div className="share-toggle-sub">Read-only — they won't need a Synclyx account</div>
            </div>
            <button
              className={`share-switch ${isPublic ? 'on' : ''}`}
              onClick={blocked ? undefined : onToggle}
              disabled={blocked}
              style={blocked ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              aria-label="Toggle public link"
            >
              <span className="share-switch-knob" />
            </button>
          </div>

          {isPublic && url && (
            <div className="share-link-row">
              <input className="share-link-input" value={url} readOnly onFocus={e => e.target.select()} />
              <button className="share-copy-btn" onClick={handleCopy}>
                {copied ? '✅ Copied' : '📋 Copy'}
              </button>
            </div>
          )}

          {locked && (
            <p className="share-hint" style={{ color: '#ffb454' }}>
              🔒 This {itemLabel} is locked on this device. A public link shows everything inside it to anyone, ignoring the lock.
              {blocked ? ` Remove the lock first if you really want to share it.` : ` Turn the link off if that's not what you want.`}
            </p>
          )}
          <p className="share-hint">
            {isPublic
              ? `Viewers see a read-only copy of this ${itemLabel} — they can't edit it.`
              : `Turn this on to get a link anyone can open, no account needed.`}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
