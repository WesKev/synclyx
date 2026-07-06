import React from 'react'
import { useNotesStore } from '../../store/notesStore'

export default function SyncVerseSidebar() {
  const { canvases, activeCanvasId, setActiveCanvas, deleteCanvas, notes } = useNotesStore()

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">🌐 SyncVerse</span>
      </div>
      <div className="notes-list">
        {canvases.length === 0 && (
          <div className="notes-empty">
            <span style={{ fontSize: '2rem' }}>🌐</span>
            <p>No canvases yet.<br />Press + to create one.</p>
          </div>
        )}
        {canvases.map(canvas => (
          <div key={canvas.id}
            className={`note-item ${activeCanvasId === canvas.id ? 'active' : ''}`}
            onClick={() => setActiveCanvas(canvas.id)}>
            <div className="note-item-top">
              <span className="note-item-title">{canvas.name}</span>
              <div className="note-item-actions">
                <button className="note-delete-btn"
                  onClick={e => { e.stopPropagation(); if (confirm('Delete canvas?')) deleteCanvas(canvas.id) }}>
                  🗑
                </button>
              </div>
            </div>
            <div className="note-item-meta">
              <span className="note-date">{formatDate(canvas.updatedAt)}</span>
              <span className="note-date">{canvas.nodes.length} nodes</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
