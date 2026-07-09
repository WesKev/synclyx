import React, { useState } from 'react'
import { LockSetup, UnlockPrompt } from '../shared/PasswordLock'
import { useNotesStore } from '../../store/notesStore'

export default function SyncVerseSidebar() {
  const [lockingCanvas, setLockingCanvas] = React.useState<string | null>(null)
  const [unlockingCanvas, setUnlockingCanvas] = React.useState<string | null>(null)
  const [unlockedCanvases, setUnlockedCanvases] = React.useState<Set<string>>(new Set())
  const { canvases, activeCanvasId, setActiveCanvas, deleteCanvas, notes, lockedItems = {}, moveToTrash } = useNotesStore()

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <>
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
            onClick={() => {
              if (lockedItems[canvas.id] && !unlockedCanvases.has(canvas.id)) {
                setUnlockingCanvas(canvas.id)
              } else {
                setActiveCanvas(canvas.id)
              }
            }}>
            <div className="note-item-top">
              <span className="note-item-title">
                {lockedItems[canvas.id] && !unlockedCanvases.has(canvas.id) && '🔒 '}
                {canvas.name}
              </span>
              <div className="note-item-actions">
                <button className="note-pin-btn"
                  onClick={e => { e.stopPropagation(); setLockingCanvas(canvas.id) }}
                  title={lockedItems[canvas.id] ? 'Manage lock' : 'Lock canvas'}>
                  {lockedItems[canvas.id] ? '🔒' : '🔓'}
                </button>
                <button className="note-delete-btn"
                  onClick={e => { e.stopPropagation(); if (confirm('Move to trash?')) moveToTrash(canvas.id, 'canvas') }}>
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
    {lockingCanvas && (
      <LockSetup
        itemId={lockingCanvas}
        itemTitle={canvases.find(c => c.id === lockingCanvas)?.name || 'Canvas'}
        onClose={() => setLockingCanvas(null)}
      />
    )}
    {unlockingCanvas && (
      <UnlockPrompt
        itemId={unlockingCanvas}
        itemTitle={canvases.find(c => c.id === unlockingCanvas)?.name || 'Canvas'}
        onSuccess={() => {
          setUnlockedCanvases(s => new Set([...s, unlockingCanvas!]))
          setActiveCanvas(unlockingCanvas)
          setUnlockingCanvas(null)
        }}
        onCancel={() => setUnlockingCanvas(null)}
      />
    )}
  </>
  )
}
