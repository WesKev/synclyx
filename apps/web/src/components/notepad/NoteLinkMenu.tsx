import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  query: string
  position: { x: number; y: number }
  onSelect: (noteId: string, noteTitle: string) => void
  onClose: () => void
}

const EDGE_MARGIN = 12

export default function NoteLinkMenu({ query, position, onSelect, onClose }: Props) {
  const { notes, activeNoteId } = useNotesStore()
  const ref = useRef<HTMLDivElement>(null)

  const filtered = notes
    .filter(n => n.id !== activeNoteId)
    .filter(n => n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)

  const menuW = 260
  const menuH = Math.min(filtered.length * 48 + 48, 320)

  const clampedX = Math.min(Math.max(position.x, EDGE_MARGIN), window.innerWidth - menuW - EDGE_MARGIN)
  const spaceBelow = window.innerHeight - position.y - EDGE_MARGIN
  const wouldOverflowBottom = spaceBelow < menuH
  const clampedTop = wouldOverflowBottom
    ? Math.max(EDGE_MARGIN, position.y - menuH - 4)
    : Math.min(position.y + 4, window.innerHeight - menuH - EDGE_MARGIN)

  const style: React.CSSProperties = {
    position: 'fixed',
    left: clampedX,
    top: Math.max(EDGE_MARGIN, clampedTop),
    zIndex: 300,
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Portal to document.body — same fix as AtCommandMenu, same root cause.
  return createPortal(
    <div ref={ref} className="at-menu note-link-menu" style={style}>
      <div className="at-menu-header">🔗 Link a note</div>
      {filtered.length === 0 ? (
        <div className="note-link-empty">No notes found for "{query}"</div>
      ) : (
        filtered.map(note => (
          <button key={note.id} className="at-menu-item note-link-item"
            onClick={() => onSelect(note.id, note.title || 'Untitled')}>
            <span className="at-menu-icon">📝</span>
            <div className="at-menu-text">
              <span className="at-menu-label">{note.title || 'Untitled'}</span>
              <span className="at-menu-desc">
                {note.blocks.length} blocks
                {note.tags.length > 0 ? ` · ${note.tags.slice(0,2).map(t => `#${t}`).join(' ')}` : ''}
              </span>
            </div>
          </button>
        ))
      )}
      <div className="note-link-hint">Type to filter · Enter to link</div>
    </div>,
    document.body
  )
}
