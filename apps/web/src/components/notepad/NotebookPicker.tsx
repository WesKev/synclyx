import React, { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  noteId: string
  currentNotebookId?: string
  onClose: () => void
}

export default function NotebookPicker({ noteId, currentNotebookId, onClose }: Props) {
  const { notebooks, assignNoteToNotebook, addNotebook } = useNotesStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="font-picker notebook-picker">
      <div className="font-picker-header">📁 Add to Notebook</div>
      {notebooks.length === 0 && (
        <div className="notebook-picker-empty">No notebooks yet</div>
      )}
      {notebooks.map(nb => (
        <button key={nb.id}
          className={`font-option notebook-picker-item ${currentNotebookId === nb.id ? 'active' : ''}`}
          onClick={() => {
            assignNoteToNotebook(noteId, currentNotebookId === nb.id ? undefined : nb.id)
            onClose()
          }}>
          <span className="notebook-dot" style={{ background: nb.color }} />
          <span>{nb.name}</span>
          {currentNotebookId === nb.id && <span className="nb-check">✓</span>}
        </button>
      ))}
      {currentNotebookId && (
        <button className="font-option notebook-picker-remove"
          onClick={() => { assignNoteToNotebook(noteId, undefined); onClose() }}>
          ✕ Remove from notebook
        </button>
      )}
    </div>
  )
}
