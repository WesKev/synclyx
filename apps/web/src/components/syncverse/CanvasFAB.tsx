import React, { useState, useRef, useEffect } from 'react'
import { Note } from '../../store/notesStore'

const blockCommands = [
  { id: 'text',      icon: '¶',    label: 'Text',      desc: 'Text block' },
  { id: 'heading',   icon: 'H',    label: 'Heading',   desc: 'H1/H2/H3' },
  { id: 'list',      icon: '≡',    label: 'List',      desc: 'Bullet/numbered' },
  { id: 'checklist', icon: '✓',    label: 'Checklist', desc: 'Tickable list' },
  { id: 'code',      icon: '</>',   label: 'Code',      desc: 'Code editor' },
  { id: 'table',     icon: '⊞',    label: 'Table',     desc: 'Spreadsheet' },
  { id: 'image',     icon: '🖼',    label: 'Image',     desc: 'Image block' },
  { id: 'link',      icon: '🔗',    label: 'Link',      desc: 'Link card' },
  { id: 'video',     icon: '🎬',    label: 'Video',     desc: 'Video embed' },
  { id: 'audio',     icon: '🎵',    label: 'Audio',     desc: 'Audio embed' },
  { id: 'file',      icon: '📎',    label: 'File',      desc: 'File attach' },
]

const canvasCommands = [
  { id: 'sticky',    icon: '📌',   label: 'Sticky',    desc: 'Sticky note' },
  { id: 'link-note', icon: '🔀',   label: 'Link Note', desc: 'Connect a note' },
]

interface Props {
  onAction: (action: string, extra?: any) => void
  notes: Note[]
}

export default function CanvasFAB({ onAction, notes }: Props) {
  const [open, setOpen] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ x: 80, y: window.innerHeight - 120 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const fabRef = useRef<HTMLDivElement>(null)

  // Drag logic
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-fab-btn')) {
      dragging.current = true
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
      e.preventDefault()
    }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 56, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 56, e.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const filteredNotes = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase())
  )

  const handleAction = (id: string) => {
    if (id === 'link-note') { setShowNotes(true); return }
    onAction(id)
    setOpen(false)
  }

  return (
    <div ref={fabRef} className="canvas-fab-wrap" style={{ left: pos.x, top: pos.y }}
      onMouseDown={onMouseDown}>

      {open && (
        <div className="canvas-fab-menu">
          <div className="canvas-fab-section-label">Blocks</div>
          <div className="canvas-fab-grid">
            {blockCommands.map(cmd => (
              <button key={cmd.id} className="canvas-fab-item" onClick={() => handleAction(cmd.id)}>
                <span className="canvas-fab-icon">{cmd.icon}</span>
                <span className="canvas-fab-label">{cmd.label}</span>
              </button>
            ))}
          </div>
          <div className="canvas-fab-divider" />
          <div className="canvas-fab-section-label">Canvas</div>
          <div className="canvas-fab-grid">
            {canvasCommands.map(cmd => (
              <button key={cmd.id} className="canvas-fab-item canvas-fab-item-special"
                onClick={() => handleAction(cmd.id)}>
                <span className="canvas-fab-icon">{cmd.icon}</span>
                <span className="canvas-fab-label">{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showNotes && (
        <div className="canvas-notes-picker">
          <div className="canvas-notes-picker-header">
            <span>Link a Note</span>
            <button onClick={() => setShowNotes(false)}>✕</button>
          </div>
          <input className="canvas-notes-search" placeholder="Search notes..."
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div className="canvas-notes-list">
            {filteredNotes.map(note => (
              <button key={note.id} className="canvas-notes-item"
                onClick={() => { onAction('link-note', { noteId: note.id }); setShowNotes(false); setOpen(false) }}>
                <span className="canvas-notes-title">{note.title || 'Untitled'}</span>
                <span className="canvas-notes-meta">{note.blocks.length} blocks</span>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <p className="canvas-notes-empty">No notes found</p>
            )}
          </div>
        </div>
      )}

      <button className={`canvas-fab-btn ${open ? 'canvas-fab-open' : ''}`}
        onClick={() => { setOpen(o => !o); setShowNotes(false) }}>
        {open ? '✕' : '✦'}
      </button>
      <span className="canvas-fab-drag-hint">⠿</span>
    </div>
  )
}
