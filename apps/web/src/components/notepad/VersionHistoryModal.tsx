import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Note, Block } from '../../store/notesStore'
import { useNotesStore } from '../../store/notesStore'
import './VersionHistoryModal.css'

const generateId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  note: Note
  onClose: () => void
}

export default function VersionHistoryModal({ note, onClose }: Props) {
  const { updateNote } = useNotesStore()
  // Show max 5 most recent versions
  const versions = (note.versions || []).slice(0, 5)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)

  const selected = versions[selectedIdx]

  const handleRestore = () => {
    if (!selected) return
    setRestoring(true)

    // Safety net: save current state as a new version BEFORE restoring
    const safetyVersion = {
      id: generateId(),
      savedAt: Date.now(),
      title: note.title,
      blocks: JSON.parse(JSON.stringify(note.blocks)),
    }

    // Restore old version content, prepend safety version to history
    updateNote(note.id, {
      title: selected.title,
      blocks: JSON.parse(JSON.stringify(selected.blocks)),
      versions: [safetyVersion, ...note.versions].slice(0, 5),
    })

    setRestoring(false)
    setRestored(true)
    setTimeout(() => { onClose() }, 1000)
  }

  return createPortal(
    <div className="vh-overlay" onClick={onClose}>
      <div className="vh-modal" onClick={e => e.stopPropagation()}>

        <div className="vh-header">
          <div className="vh-header-left">
            <span className="vh-icon">🕐</span>
            <div>
              <h2 className="vh-title">Version History</h2>
              <p className="vh-subtitle">"{note.title}" · {versions.length} version{versions.length !== 1 ? 's' : ''} saved</p>
            </div>
          </div>
          <button className="vh-close" onClick={onClose}>×</button>
        </div>

        {versions.length === 0 ? (
          <div className="vh-empty">
            <span>📄</span>
            <p>No versions saved yet</p>
            <span className="vh-empty-hint">Versions are saved automatically when you switch between notes</span>
          </div>
        ) : (
          <>
            {/* Version selector tabs */}
            <div className="vh-version-tabs">
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  className={`vh-version-tab ${i === selectedIdx ? 'active' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <span className="vh-tab-label">{i === 0 ? 'Latest saved' : `Version ${versions.length - i}`}</span>
                  <span className="vh-tab-date">{formatDate(v.savedAt)}</span>
                </button>
              ))}
            </div>

            {/* Side-by-side comparison */}
            <div className="vh-compare">
              <div className="vh-pane">
                <div className="vh-pane-label current">Current</div>
                <div className="vh-pane-title">{note.title}</div>
                <div className="vh-pane-content">
                  {note.blocks.length === 0
                    ? <p className="vh-empty-blocks">No content</p>
                    : note.blocks.map(b => <BlockPreview key={b.id} block={b} />)
                  }
                </div>
              </div>

              <div className="vh-divider">⟷</div>

              <div className="vh-pane">
                <div className="vh-pane-label old">Saved {formatDate(selected.savedAt)}</div>
                <div className="vh-pane-title">{selected.title}</div>
                <div className="vh-pane-content">
                  {selected.blocks.length === 0
                    ? <p className="vh-empty-blocks">No content</p>
                    : selected.blocks.map(b => <BlockPreview key={b.id} block={b} />)
                  }
                </div>
              </div>
            </div>

            {/* Restore action */}
            <div className="vh-footer">
              <p className="vh-restore-note">
                💡 Restoring saves your current content as a new version first — you can always undo.
              </p>
              <div className="vh-footer-actions">
                <button className="vh-cancel" onClick={onClose}>Cancel</button>
                <button
                  className={`vh-restore ${restored ? 'restored' : ''}`}
                  onClick={handleRestore}
                  disabled={restoring || restored}
                >
                  {restored ? '✅ Restored!' : restoring ? 'Restoring…' : '↩ Restore this version'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Read-only block preview ───────────────────────────────────────────────────
function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
    case 'list':
      return <p className="vh-block-text">{block.content || <em className="vh-empty-block">Empty</em>}</p>
    case 'heading':
      return <p className={`vh-block-heading vh-${block.meta?.level || 'h1'}`}>{block.content || 'Heading'}</p>
    case 'checklist':
      return (
        <div className="vh-block-checklist">
          {(block.items || []).map(item => (
            <div key={item.id} className="vh-check-item">
              <span className={`vh-check-box ${item.checked ? 'checked' : ''}`}>{item.checked ? '✓' : '○'}</span>
              <span className={item.checked ? 'vh-check-done' : ''}>{item.text || 'Item'}</span>
            </div>
          ))}
        </div>
      )
    case 'code':
      return <pre className="vh-block-code"><code>{(block.meta?.content || block.content || '').slice(0, 200)}</code></pre>
    case 'image':
      return <div className="vh-block-media">🖼 {block.meta?.name || 'Image'}</div>
    case 'link':
      return <div className="vh-block-media">🔗 {block.meta?.label || block.meta?.url || 'Link'}</div>
    case 'table':
      return <div className="vh-block-media">⊞ Table</div>
    case 'audio':
      return <div className="vh-block-media">🎵 {block.meta?.name || 'Audio'}</div>
    case 'video':
      return <div className="vh-block-media">🎬 {block.meta?.name || 'Video'}</div>
    case 'file':
      return <div className="vh-block-media">📎 {block.meta?.name || 'File'}</div>
    default:
      return null
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
