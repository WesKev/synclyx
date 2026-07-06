import React, { useState } from 'react'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  onSyncVerse: () => void
  isSyncVerseView?: boolean
}

export default function FAB({ onSyncVerse, isSyncVerseView }: Props) {
  const { addNote, createCanvas, activeNoteId, notes } = useNotesStore()
  const [expanded, setExpanded] = useState(false)

  const activeNote = notes.find(n => n.id === activeNoteId)

  const handleNote = () => { addNote(); setExpanded(false) }

  const handleSyncVerse = () => {
    createCanvas()
    onSyncVerse()
    setExpanded(false)
  }

  const handleConvertNote = () => {
    if (!activeNote) return
    createCanvas(activeNote.id)
    onSyncVerse()
    setExpanded(false)
  }

  const handleNewCanvas = () => {
    createCanvas()
    setExpanded(false)
  }

  return (
    <div className="fab-wrap">
      {expanded && (
        <div className="fab-options">
          {!isSyncVerseView ? (
            <>
              <button className="fab-option" onClick={handleNote}>
                <span className="fab-option-icon">📝</span>
                <span className="fab-option-label">New Note</span>
              </button>
              {activeNote && (
                <button className="fab-option fab-option-convert" onClick={handleConvertNote}>
                  <span className="fab-option-icon">🔀</span>
                  <span className="fab-option-label">Convert to SyncVerse</span>
                </button>
              )}
              <button className="fab-option fab-option-syncverse" onClick={handleSyncVerse}>
                <span className="fab-option-icon">🌐</span>
                <span className="fab-option-label">New SyncVerse</span>
              </button>
            </>
          ) : (
            <button className="fab-option" onClick={handleNewCanvas}>
              <span className="fab-option-icon">🌐</span>
              <span className="fab-option-label">New Canvas</span>
            </button>
          )}
        </div>
      )}
      <button className={`fab ${expanded ? 'fab-open' : ''}`}
        onClick={() => setExpanded(e => !e)}>
        {expanded ? '✕' : '+'}
      </button>
      {expanded && <div className="fab-backdrop" onClick={() => setExpanded(false)} />}
    </div>
  )
}
