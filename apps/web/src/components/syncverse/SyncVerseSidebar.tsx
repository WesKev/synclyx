import React, { useState } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { LockSetup, UnlockPrompt } from '../shared/PasswordLock'

const NOTEBOOK_COLORS = ['#a833b9','#7c6aff','#00b894','#e17055','#0984e3','#fdcb6e']

export default function SyncVerseSidebar() {
  const {
    canvases, activeCanvasId, setActiveCanvas, notes,
    lockedItems = {}, moveToTrash, notebooks,
    assignCanvasToNotebook, addNotebook, updateNotebook, deleteNotebook,
  } = useNotesStore()

  const [lockingCanvas, setLockingCanvas] = useState<string | null>(null)
  const [unlockingCanvas, setUnlockingCanvas] = useState<string | null>(null)
  const [unlockedCanvases, setUnlockedCanvases] = useState<Set<string>>(new Set())
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [newNotebookName, setNewNotebookName] = useState('')
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null)
  const [editingNotebook, setEditingNotebook] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const filteredCanvases = selectedNotebook
    ? canvases.filter(c => c.notebookId === selectedNotebook)
    : canvases

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">🌐 SyncVerse</span>
        </div>

        {/* Notebooks section */}
        <div className="sv-notebooks-wrap">
          <button className="sv-notebooks-toggle" onClick={() => setShowNotebooks(s => !s)}>
            📁 Notebooks {showNotebooks ? '▲' : '▼'}
          </button>
          {showNotebooks && (
            <div className="sv-notebooks-list">
              <button
                className={`sv-notebook-item ${!selectedNotebook ? 'active' : ''}`}
                onClick={() => setSelectedNotebook(null)}>
                All Canvases
              </button>
              {notebooks.map(nb => (
                <div key={nb.id} className="sv-notebook-item-wrap">
                  {editingNotebook === nb.id ? (
                    <input className="notebook-edit-input" value={editVal} autoFocus
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => { updateNotebook(nb.id, { name: editVal }); setEditingNotebook(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') { updateNotebook(nb.id, { name: editVal }); setEditingNotebook(null) } }}
                    />
                  ) : (
                    <button
                      className={`sv-notebook-item ${selectedNotebook === nb.id ? 'active' : ''}`}
                      onClick={() => setSelectedNotebook(selectedNotebook === nb.id ? null : nb.id)}>
                      <span className="notebook-dot" style={{ background: nb.color }} />
                      {nb.name}
                      <span className="nb-count">{canvases.filter(c => c.notebookId === nb.id).length}</span>
                    </button>
                  )}
                  <div className="sv-nb-actions">
                    <button onClick={() => { setEditingNotebook(nb.id); setEditVal(nb.name) }}>✎</button>
                    <button onClick={() => { if (confirm('Delete notebook?')) deleteNotebook(nb.id) }}>🗑</button>
                  </div>
                </div>
              ))}
              <div className="notebook-add-row">
                <input className="notebook-add-input" placeholder="New notebook..."
                  value={newNotebookName} onChange={e => setNewNotebookName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newNotebookName.trim()) { addNotebook(newNotebookName.trim()); setNewNotebookName('') } }}
                />
                <button className="tag-add-btn" onClick={() => { if (newNotebookName.trim()) { addNotebook(newNotebookName.trim()); setNewNotebookName('') } }}>+</button>
              </div>
            </div>
          )}
        </div>

        <div className="notes-list">
          {filteredCanvases.length === 0 && (
            <div className="notes-empty">
              <span style={{ fontSize: '2rem' }}>🌐</span>
              <p>No canvases yet.<br />Press + to create one.</p>
            </div>
          )}
          {filteredCanvases.map(canvas => {
            const isLocked = !!lockedItems[canvas.id] && !unlockedCanvases.has(canvas.id)
            const nb = notebooks.find(n => n.id === canvas.notebookId)
            return (
              <div key={canvas.id}
                className={`note-item ${activeCanvasId === canvas.id ? 'active' : ''}`}
                onClick={() => {
                  if (isLocked) { setUnlockingCanvas(canvas.id) }
                  else { setActiveCanvas(canvas.id) }
                }}>
                <div className="note-item-top">
                  <span className="note-item-title">
                    {isLocked && '🔒 '}{canvas.name}
                  </span>
                  <div className="note-item-actions">
                    {/* Assign to notebook */}
                    <select className="sv-nb-select"
                      value={canvas.notebookId || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); assignCanvasToNotebook(canvas.id, e.target.value || undefined) }}>
                      <option value="">No notebook</option>
                      {notebooks.map(nb => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
                    </select>
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
                  <span className="note-date">{canvas.nodes.length} nodes · {(canvas.edges || []).length} connections</span>
                  {nb && <span className="note-notebook-badge" style={{ background: nb.color + '30', color: nb.color }}>📁 {nb.name}</span>}
                </div>
              </div>
            )
          })}
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
