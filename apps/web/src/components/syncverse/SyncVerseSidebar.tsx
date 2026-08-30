import React, { useState } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { useSyncVerseThemeStore } from '../../store/syncVerseThemeStore'
import { LockSetup, UnlockPrompt } from '../shared/PasswordLock'
import TrashView from '../shared/TrashView'
import CanvasVersionModal from './CanvasVersionModal'

export default function SyncVerseSidebar() {
  const {
    canvases, activeCanvasId, setActiveCanvas, notes,
    lockedItems = {}, moveToTrash, notebooks,
    assignCanvasToNotebook, addNotebook, updateNotebook, deleteNotebook,
    trash = [],
  } = useNotesStore()

  const { theme, toggle: toggleTheme } = useSyncVerseThemeStore()

  const [lockingCanvas, setLockingCanvas] = useState<string | null>(null)
  const [unlockingCanvas, setUnlockingCanvas] = useState<string | null>(null)
  const [unlockedCanvases, setUnlockedCanvases] = useState<Set<string>>(new Set())
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [newNotebookName, setNewNotebookName] = useState('')
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null)
  const [editingNotebook, setEditingNotebook] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [versionCanvasId, setVersionCanvasId] = useState<string | null>(null)

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const filteredCanvases = selectedNotebook
    ? canvases.filter(c => c.notebookId === selectedNotebook)
    : canvases

  const versionCanvas = versionCanvasId ? canvases.find(c => c.id === versionCanvasId) : null

  if (collapsed) {
    return (
      <>
        <aside className="sidebar sidebar-collapsed" data-sv-theme={theme}>
          <button className="sidebar-toggle-btn" onClick={() => setCollapsed(false)} title="Expand">▶</button>
          <button className="theme-toggle-mini" onClick={toggleTheme} title="Toggle SyncVerse theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="theme-toggle-mini" onClick={() => setShowTrash(true)} title="Trash">🗑</button>
        </aside>
        {showTrash && <TrashView onClose={() => setShowTrash(false)} />}
      </>
    )
  }

  return (
    <>
      <aside className="sidebar" data-sv-theme={theme}>
        <div className="sidebar-header">
          <span className="sidebar-logo">🌐 SyncVerse</span>
          <div className="sidebar-header-actions">
            <button className="theme-toggle" onClick={() => setShowTrash(true)} title="Trash">
              🗑{trash.length > 0 && <span className="trash-badge">{trash.length}</span>}
            </button>
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle SyncVerse theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="sidebar-toggle-btn" onClick={() => setCollapsed(true)} title="Collapse">◀</button>
          </div>
        </div>

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
                      <span className="sv-notebook-name-text">{nb.name}</span>
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
            const hasVersions = (canvas.versions || []).length > 0
            const isActive = activeCanvasId === canvas.id

            return (
              <div key={canvas.id}
                className={`note-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (isLocked) setUnlockingCanvas(canvas.id)
                  else setActiveCanvas(canvas.id)
                }}>
                <div className="note-item-top">
                  <span className="note-item-title">
                    {isLocked && '🔒 '}{canvas.name}
                  </span>
                  <div className="note-item-actions">
                    {/* Version history — only show if canvas has saved versions */}
                    {hasVersions && (
                      <button
                        className="note-pin-btn sv-version-btn"
                        title={`Version history (${canvas.versions!.length})`}
                        onClick={e => { e.stopPropagation(); setVersionCanvasId(canvas.id) }}
                      >🕐</button>
                    )}
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
                  {hasVersions && (
                    <span className="note-date sv-version-badge">
                      {canvas.versions!.length} version{canvas.versions!.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {nb && <span className="note-notebook-badge" style={{ background: nb.color + '30', color: nb.color }}>📁 {nb.name}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {lockingCanvas && (
        <LockSetup itemId={lockingCanvas}
          itemTitle={canvases.find(c => c.id === lockingCanvas)?.name || 'Canvas'}
          onClose={() => setLockingCanvas(null)} />
      )}
      {unlockingCanvas && (
        <UnlockPrompt itemId={unlockingCanvas}
          itemTitle={canvases.find(c => c.id === unlockingCanvas)?.name || 'Canvas'}
          onSuccess={() => {
            setUnlockedCanvases(s => new Set([...s, unlockingCanvas!]))
            setActiveCanvas(unlockingCanvas)
            setUnlockingCanvas(null)
          }}
          onCancel={() => setUnlockingCanvas(null)} />
      )}
      {showTrash && <TrashView onClose={() => setShowTrash(false)} />}
      {versionCanvas && (
        <CanvasVersionModal
          canvas={versionCanvas}
          onClose={() => setVersionCanvasId(null)}
        />
      )}
    </>
  )
}
