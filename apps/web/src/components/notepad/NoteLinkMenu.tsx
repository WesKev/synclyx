import React, { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  query: string
  position: { x: number; y: number }
  onSelect: (noteId: string, noteTitle: string) => void
  onClose: () => void
}

export default function NoteLinkMenu({ query, position, onSelect, onClose }: Props) {
  const { notes, activeNoteId } = useNotesStore()
  const ref = useRef<HTMLDivElement>(null)

  const filtered = notes
    .filter(n => n.id !== activeNoteId)
    .filter(n => n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)

  const spaceBelow = window.innerHeight - position.y - 8
  const menuH = Math.min(filtered.length * 48 + 48, 320)
  const style: React.CSSProperties = {
    left: Math.min(position.x, window.innerWidth - 260),
  }
  if (spaceBelow < menuH) style.bottom = window.innerHeight - position.y + 8
  else style.top = position.y + 4

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="at-menu note-link-menu" style={{ ...style, position: 'fixed', zIndex: 300 }}>
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
    </div>
  )
}
