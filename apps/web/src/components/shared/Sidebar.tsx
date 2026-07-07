import TrashView from './TrashView'
import React, { useState } from 'react'
import { useNotesStore, PRESET_TAGS } from '../../store/notesStore'
import { useThemeStore } from '../../store/themeStore'

const tabs = ['All', 'Pinned', 'Tagged', 'Recent', 'Notebooks', 'Collab'] as const
type Tab = typeof tabs[number]

const NOTEBOOK_COLORS = ['#a833b9','#7c6aff','#00b894','#e17055','#0984e3','#fdcb6e']

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  )
}

export default function Sidebar({ onSwitchToSyncVerse }: { onSwitchToSyncVerse?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('All')
  const [search, setSearch] = useState('')
  const [showTagManager, setShowTagManager] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [removedPresets, setRemovedPresets] = useState<string[]>([])
  const [newNotebookName, setNewNotebookName] = useState('')
  const [editingNotebook, setEditingNotebook] = useState<string | null>(null)
  const [editNotebookVal, setEditNotebookVal] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null)

  const {
    notes, activeNoteId, setActiveNote, togglePin, deleteNote,
    customTags, addCustomTag, removeCustomTag, sidebarCollapsed, toggleSidebar,
    notebooks = [], addNotebook, updateNotebook, deleteNotebook, assignNoteToNotebook, setSearchQuery, lockedItems = {}, trash = []
  } = useNotesStore()
  const { theme, toggle } = useThemeStore()

  const activeNote = notes.find(n => n.id === activeNoteId)

  const getFilteredNotes = () => {
    let list = notes
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.blocks.some(b => b.content?.toLowerCase().includes(q)) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    switch (activeTab) {
      case 'Pinned': return list.filter(n => n.pinned)
      case 'Tagged': return list.filter(n => n.tags.length > 0)
      case 'Recent': return [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
      case 'Notebooks':
        return selectedNotebook
          ? list.filter(n => n.notebookId === selectedNotebook)
          : list
      default: return list
    }
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  // Backlinks — notes that link to activeNote
  const backlinks = activeNote
    ? notes.filter(n => n.id !== activeNoteId && n.linkedNotes.includes(activeNoteId))
    : []

  if (sidebarCollapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle-btn" onClick={toggleSidebar} title="Expand">▶</button>
        <button className="theme-toggle-mini" onClick={toggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </aside>
    )
  }

  return (
    <>
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <span className="sidebar-logo">Synclyx</span>
        <div className="sidebar-header-actions">
          <button className="theme-toggle" onClick={() => setShowTrash(true)} title="Trash">
            🗑{trash.length > 0 && <span className="trash-badge">{trash.length}</span>}
          </button>
          <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="sidebar-toggle-btn" onClick={toggleSidebar} title="Collapse">◀</button>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search-wrap">
        <span className="search-icon">⌕</span>
        <input className="sidebar-search" placeholder="Search notes..."
          value={search} onChange={e => { setSearch(e.target.value); setSearchQuery(e.target.value) }} />
        {search && <button className="search-clear" onClick={() => { setSearch(''); setSearchQuery('') }}>✕</button>}
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        {tabs.map(tab => (
          <button key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setSelectedNotebook(null) }}>
            {tab === 'Collab' ? '👥' : tab}
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="notes-list">

        {/* Notebooks view */}
        {activeTab === 'Notebooks' && (
          <div className="notebooks-section">
            {!selectedNotebook ? (
              <>
                <div className="notebooks-list">
                  {notebooks.length === 0 && (
                    <div className="notes-empty">
                      <span style={{ fontSize: '1.5rem' }}>📁</span>
                      <p>No notebooks yet</p>
                    </div>
                  )}
                  {notebooks.map(nb => (
                    <div key={nb.id} className="notebook-item"
                      onClick={() => setSelectedNotebook(nb.id)}>
                      <span className="notebook-dot" style={{ background: nb.color }} />
                      {editingNotebook === nb.id ? (
                        <input className="notebook-edit-input" value={editNotebookVal} autoFocus
                          onChange={e => setEditNotebookVal(e.target.value)}
                          onBlur={() => { updateNotebook(nb.id, { name: editNotebookVal }); setEditingNotebook(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { updateNotebook(nb.id, { name: editNotebookVal }); setEditingNotebook(null) }
                            if (e.key === 'Escape') setEditingNotebook(null)
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="notebook-name">{nb.name}</span>
                      )}
                      <span className="notebook-count">
                        {notes.filter(n => n.notebookId === nb.id).length}
                      </span>
                      <div className="notebook-actions">
                        <button onClick={e => { e.stopPropagation(); setEditingNotebook(nb.id); setEditNotebookVal(nb.name) }} title="Rename">✎</button>
                        <div className="notebook-color-picker">
                          {NOTEBOOK_COLORS.map(c => (
                            <button key={c} className="nb-color-dot" style={{ background: c }}
                              onClick={e => { e.stopPropagation(); updateNotebook(nb.id, { color: c }) }} />
                          ))}
                        </div>
                        <button onClick={e => { e.stopPropagation(); if (confirm('Delete notebook?')) deleteNotebook(nb.id) }} title="Delete">🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="notebook-add-row">
                  <input className="notebook-add-input" placeholder="New notebook..."
                    value={newNotebookName} onChange={e => setNewNotebookName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newNotebookName.trim()) { addNotebook(newNotebookName.trim()); setNewNotebookName('') } }}
                  />
                  <button className="tag-add-btn" onClick={() => { if (newNotebookName.trim()) { addNotebook(newNotebookName.trim()); setNewNotebookName('') } }}>+</button>
                </div>
              </>
            ) : (
              <>
                <div className="notebook-back-header">
                  <button className="notebook-back-btn" onClick={() => setSelectedNotebook(null)}>← Back</button>
                  <span className="notebook-back-title">
                    {notebooks.find(nb => nb.id === selectedNotebook)?.name}
                  </span>
                  {activeNoteId && (
                    <button className="notebook-assign-btn"
                      onClick={() => assignNoteToNotebook(activeNoteId, selectedNotebook || undefined)}
                      title="Add current note to this notebook">
                      + Add current note
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'Collab' && (
          <div className="notes-empty">
            <span style={{ fontSize: '2rem' }}>👥</span>
            <p>Collaboration coming in Phase 2.</p>
          </div>
        )}

        {/* Note items */}
        {activeTab !== 'Collab' && getFilteredNotes().length === 0 && (
          <div className="notes-empty">
            {search ? `No notes match "${search}"` :
             activeTab === 'Pinned' ? 'No pinned notes.' :
             activeTab === 'Tagged' ? 'No tagged notes.' :
             activeTab === 'Notebooks' && selectedNotebook ? 'No notes in this notebook yet.' :
             'No notes yet. Hit + to create one.'}
          </div>
        )}

        {activeTab !== 'Collab' && getFilteredNotes().map(note => (
          <div key={note.id}
            className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
            onClick={() => setActiveNote(note.id)}>
            <div className="note-item-top">
              <span className="note-item-title">
                {note.pinned && <span className="pin-indicator">📌 </span>}
                {lockedItems[note.id] && <span className="pin-indicator">🔒 </span>}
                {highlight(note.title || 'Untitled', search)}
              </span>
              <div className="note-item-actions">
                <button className={`note-pin-btn ${note.pinned ? 'pinned' : ''}`}
                  onClick={e => { e.stopPropagation(); togglePin(note.id) }}>📌</button>
                <button className="note-delete-btn"
                  onClick={e => { e.stopPropagation(); if (confirm('Delete?')) deleteNote(note.id) }}>🗑</button>
              </div>
            </div>
            <div className="note-item-meta">
              <span className="note-date">{formatDate(note.updatedAt)}</span>
              {note.notebookId && (
                <span className="note-notebook-badge" style={{
                  background: notebooks.find(nb => nb.id === note.notebookId)?.color + '30',
                  color: notebooks.find(nb => nb.id === note.notebookId)?.color
                }}>
                  📁 {notebooks.find(nb => nb.id === note.notebookId)?.name}
                </span>
              )}
              {note.tags.length > 0 && (
                <div className="note-tags">
                  {note.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="note-tag">{highlight(`#${tag}`, search)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Backlinks section */}
        {backlinks.length > 0 && activeNoteId && (
          <div className="backlinks-section">
            <div className="backlinks-header">🔗 Linked from ({backlinks.length})</div>
            {backlinks.map(n => (
              <div key={n.id} className="backlink-item" onClick={() => setActiveNote(n.id)}>
                <span className="backlink-title">{n.title || 'Untitled'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tags Section */}
      <div className="sidebar-tags-section">
        <button className="tags-toggle" onClick={() => setShowTagManager(t => !t)}>
          🏷 Tags {showTagManager ? '▲' : '▼'}
        </button>
        {showTagManager && (
          <div className="tag-manager">
            <div className="tag-manager-list">
              {PRESET_TAGS.filter(pt => !removedPresets.includes(pt.id)).map(pt => (
                <div key={pt.id} className="tag-manager-item custom">
                  <span>{pt.emoji} {pt.label}</span>
                  <button onClick={() => setRemovedPresets(r => [...r, pt.id])}>✕</button>
                </div>
              ))}
              {customTags.map(tag => (
                <div key={tag} className="tag-manager-item custom">
                  <span># {tag}</span>
                  <button onClick={() => removeCustomTag(tag)}>✕</button>
                </div>
              ))}
            </div>
            <div className="tag-add-row">
              <input className="tag-add-input" placeholder="New tag..."
                value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { addCustomTag(newTag.trim()); setNewTag('') } }}
              />
              <button className="tag-add-btn" onClick={() => { if (newTag.trim()) { addCustomTag(newTag.trim()); setNewTag('') } }}>+</button>
            </div>
          </div>
        )}
      </div>
    </aside>
    {showTrash && <TrashView onClose={() => setShowTrash(false)} />}
  </>
  )
}
