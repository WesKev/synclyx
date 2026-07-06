import React, { useState } from 'react'
import { useNotesStore, PRESET_TAGS } from '../../store/notesStore'
import { useThemeStore } from '../../store/themeStore'

const tabs = ['All', 'Pinned', 'Tagged', 'Recent', 'Notebooks', 'Collab'] as const
type Tab = typeof tabs[number]

export default function Sidebar({ onSwitchToSyncVerse }: { onSwitchToSyncVerse?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('All')
  const [search, setSearch] = useState('')
  const [showTagManager, setShowTagManager] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [removedPresets, setRemovedPresets] = useState<string[]>([])
  const { notes, activeNoteId, setActiveNote, togglePin, deleteNote,
          customTags, addCustomTag, removeCustomTag, sidebarCollapsed, toggleSidebar } = useNotesStore()
  const { theme, toggle } = useThemeStore()

  const filtered = () => {
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
      case 'Collab': return [] // Phase 2
      default: return list
    }
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  if (sidebarCollapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle-btn" onClick={toggleSidebar} title="Expand sidebar">▶</button>
        <button className="theme-toggle-mini" onClick={toggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">Synclyx</span>
        <div className="sidebar-header-actions">
          <button className="theme-toggle" onClick={toggle} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="sidebar-toggle-btn" onClick={toggleSidebar} title="Collapse sidebar">◀</button>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="sidebar-search"
          placeholder="Search notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Collab' ? '👥' : tab}
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="notes-list">
        {activeTab === 'Collab' && (
          <div className="notes-empty">
            <span style={{ fontSize: '2rem' }}>👥</span>
            <p>Collaboration coming in Phase 2.<br />You'll be able to invite others via username or email.</p>
          </div>
        )}

        {activeTab !== 'Collab' && filtered().length === 0 && (
          <div className="notes-empty">
            {search ? `No notes match "${search}"` :
             activeTab === 'Pinned' ? 'No pinned notes yet.' :
             activeTab === 'Tagged' ? 'No tagged notes yet.' :
             'No notes yet. Hit + to create one.'}
          </div>
        )}

        {activeTab !== 'Collab' && filtered().map(note => (
          <div
            key={note.id}
            className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
            onClick={() => setActiveNote(note.id)}
          >
            <div className="note-item-top">
              <span className="note-item-title">
                {note.pinned && <span className="pin-indicator">📌 </span>}
                {note.title || 'Untitled'}
              </span>
              <div className="note-item-actions">
                <button className={`note-pin-btn ${note.pinned ? 'pinned' : ''}`}
                  onClick={e => { e.stopPropagation(); togglePin(note.id) }} title={note.pinned ? 'Unpin' : 'Pin'}>
                  📌
                </button>
                <button className="note-delete-btn"
                  onClick={e => { e.stopPropagation(); if (confirm('Delete this note?')) deleteNote(note.id) }}
                  title="Delete">🗑</button>
              </div>
            </div>
            <div className="note-item-meta">
              <span className="note-date">{formatDate(note.updatedAt)}</span>
              {note.tags.length > 0 && (
                <div className="note-tags">
                  {note.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="note-tag">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
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
              <input
                className="tag-add-input"
                placeholder="New tag..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    addCustomTag(newTag.trim())
                    setNewTag('')
                  }
                }}
              />
              <button className="tag-add-btn" onClick={() => {
                if (newTag.trim()) { addCustomTag(newTag.trim()); setNewTag('') }
              }}>+</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
