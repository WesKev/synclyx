import React, { useState } from 'react'
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react'
import { useNotesStore } from '../../store/notesStore'
import { UnlockPrompt } from '../shared/PasswordLock'

export default function NoteCardNode({ id, data, selected }: NodeProps) {
  const { notes, setActiveNote, lockedItems = {} } = useNotesStore()
  const note = notes.find(n => n.id === data.noteId)
  const { deleteElements } = useReactFlow()

  // ── Lock inheritance ──────────────────────────────────────────────────────
  // A note locked in SyncPad stays locked wherever it appears. Linking it
  // onto a canvas must not become a way around the password — so the card
  // hides its title preview and content until unlocked, and unlocking is
  // per-session (state lives here, not persisted).
  const isLocked = !!note && !!lockedItems[note.id]
  const [unlocked, setUnlocked] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const locked = isLocked && !unlocked

  const openNote = () => {
    if (!note) return
    setActiveNote(note.id)
    window.dispatchEvent(new CustomEvent('synclyx:switch-view', { detail: 'notes' }))
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (locked) { setShowPrompt(true); return }
    openNote()
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={140}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#a833b9' }}
        lineStyle={{ borderColor: '#a833b9' }}
      />
      <div className={`sv-node sv-note-card-node sv-node-resizable ${selected ? 'sv-node-selected' : ''} ${locked ? 'sv-node-locked' : ''}`}>
        <Handle type="target" position={Position.Left} className="sv-handle" />
        <Handle type="source" position={Position.Right} className="sv-handle" />
        <Handle type="target" position={Position.Top} className="sv-handle sv-handle-top" />
        <Handle type="source" position={Position.Bottom} className="sv-handle sv-handle-bottom" />

        <div className="sv-note-card-header">
          <span className="sv-note-card-icon">{locked ? '🔒' : '📝'}</span>
          <span className="sv-note-card-title">
            {locked ? 'Locked note' : (note?.title || (data.label as string) || 'Note')}
          </span>
          <button className="nodrag nopan sv-node-delete"
            onClick={() => deleteElements({ nodes: [{ id }] })} title="Delete">✕</button>
        </div>

        <div className="sv-note-card-body sv-fill-height">
          {locked ? (
            <div className="sv-locked-body">
              <span className="sv-locked-icon">🔒</span>
              <p className="sv-locked-text">This note is password protected</p>
              <button className="nodrag nopan sv-locked-unlock-btn"
                onClick={(e) => { e.stopPropagation(); setShowPrompt(true) }}>
                Unlock to view
              </button>
            </div>
          ) : (
            <>
              <p className="sv-note-card-preview">
                {note?.blocks.find(b => b.type === 'text')?.content || 'No preview'}
              </p>
              <div className="sv-note-card-meta">
                <span>{note?.blocks.length || 0} blocks</span>
                {note?.tags.length ? <span>{note.tags.slice(0, 2).map(t => `#${t}`).join(' ')}</span> : null}
              </div>
            </>
          )}
        </div>

        <button className="nodrag nopan sv-note-card-open" onClick={handleOpen}>
          {locked ? '🔒 Unlock →' : 'Open note →'}
        </button>
      </div>

      {showPrompt && note && (
        <div className="sv-unlock-overlay nodrag nopan" onClick={e => e.stopPropagation()}>
          <UnlockPrompt
            itemId={note.id}
            itemTitle={note.title || 'Note'}
            onSuccess={() => { setUnlocked(true); setShowPrompt(false) }}
            onCancel={() => setShowPrompt(false)}
          />
        </div>
      )}
    </>
  )
}
