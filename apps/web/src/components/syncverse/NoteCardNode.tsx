import React from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { useNotesStore } from '../../store/notesStore'

export default function NoteCardNode({ data, selected }: NodeProps) {
  const { notes, setActiveNote } = useNotesStore()
  const note = notes.find(n => n.id === data.noteId)

  return (
    <div className={`sv-node sv-note-card-node ${selected ? 'sv-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="sv-handle" />
      <Handle type="source" position={Position.Right} className="sv-handle" />
      <Handle type="target" position={Position.Top} className="sv-handle sv-handle-top" />
      <Handle type="source" position={Position.Bottom} className="sv-handle sv-handle-bottom" />

      <div className="sv-note-card-header">
        <span className="sv-note-card-icon">📝</span>
        <span className="sv-note-card-title">{note?.title || (data.label as string) || 'Note'}</span>
      </div>
      <div className="sv-note-card-body">
        <p className="sv-note-card-preview">
          {note?.blocks.find(b => b.type === 'text')?.content?.slice(0, 100) || 'No preview'}
        </p>
        <div className="sv-note-card-meta">
          <span>{note?.blocks.length || 0} blocks</span>
          {note?.tags.length ? <span>{note.tags.slice(0,2).map(t => `#${t}`).join(' ')}</span> : null}
        </div>
      </div>
      <button className="sv-note-card-open" onClick={() => note && setActiveNote(note.id)}>
        Open note →
      </button>
    </div>
  )
}
