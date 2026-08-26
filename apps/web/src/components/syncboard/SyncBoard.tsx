import { useState, useRef } from 'react'
import { useSyncBoardStore, type SyncBoardItem } from '../../store/syncBoardStore'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import ConfirmDialog from './ConfirmDialog'
import './SyncBoard.css'

export default function SyncBoard() {
  const { items, searchQuery, addItem, updateItem, deleteItem, deleteItems, togglePin, clearUnpinned, setSearchQuery } = useSyncBoardStore()
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const [input, setInput] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filtered = searchQuery.trim()
    ? items.filter(i =>
        i.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items

  const pinned = filtered.filter(i => i.pinned)
  const unpinned = filtered.filter(i => !i.pinned)

  const handleAdd = () => {
    if (!input.trim()) return
    addItem(input)
    setInput('')
    textareaRef.current?.focus()
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) addItem(text)
    } catch {
      textareaRef.current?.focus()
    }
  }

  const handleCopy = async (item: SyncBoardItem) => {
    await navigator.clipboard.writeText(item.content)
    setCopied(item.id)
    setTimeout(() => setCopied(null), 1500)
  }

  const startEdit = (item: SyncBoardItem) => {
    setEditingId(item.id)
    setEditContent(item.content)
    setEditLabel(item.label)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateItem(editingId, { content: editContent, label: editLabel })
    setEditingId(null)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  return (
    <div className="syncboard">

      {/* Header */}
      <div className="sb-header">
        <div className="sb-header-top">
          <h2 className="sb-title">SyncBoard</h2>
          <div className="sb-header-actions">
            <span className="sb-count">{items.length} clip{items.length !== 1 ? 's' : ''}</span>

            <button
              className={`sb-tool-btn ${selectMode ? 'active' : ''}`}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            >
              {selectMode ? '✕ Cancel' : '☑ Select'}
            </button>

            {!selectMode && items.some(i => !i.pinned) && (
              <button className="sb-tool-btn danger" onClick={() => setConfirmClearOpen(true)}>
                🗑 Clear unpinned
              </button>
            )}

            <button
              className="sb-tool-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {!user && (
          <div className="sb-auth-notice">☁️ Sign in to sync SyncBoard across devices</div>
        )}
      </div>

      {/* Input */}
      <div className="sb-input-area">
        <textarea
          ref={textareaRef}
          className="sb-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAdd() }}
          placeholder="Paste or type something to clip… (Ctrl+Enter to add)"
          rows={3}
        />
        <div className="sb-input-actions">
          <button className="sb-btn-paste" onClick={handlePaste}>📋 Paste from clipboard</button>
          <button className="sb-btn-add" onClick={handleAdd} disabled={!input.trim()}>+ Clip it</button>
        </div>
      </div>

      {/* Search */}
      <div className="sb-search-wrap">
        <input
          className="sb-search"
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by content or name…"
        />
        {selectMode && (
          <button className="sb-tool-btn" onClick={() => setSelected(new Set(filtered.map(i => i.id)))}>
            All
          </button>
        )}
      </div>

      {/* List */}
      <div className="sb-list">
        {filtered.length === 0 && (
          <div className="sb-empty">
            <span>📋</span>
            <p>{searchQuery ? 'No clips match your search' : 'Nothing clipped yet'}</p>
            <span className="sb-empty-hint">
              {searchQuery ? 'Try a different keyword' : 'Paste something above to get started'}
            </span>
          </div>
        )}

        {pinned.length > 0 && <div className="sb-section-label">📌 Pinned</div>}
        {pinned.map(item => (
          <SyncBoardCard
            key={item.id}
            item={item}
            copied={copied === item.id}
            editing={editingId === item.id}
            editContent={editContent}
            editLabel={editLabel}
            selectMode={selectMode}
            isSelected={selected.has(item.id)}
            onCopy={() => handleCopy(item)}
            onPin={() => togglePin(item.id)}
            onDelete={() => deleteItem(item.id)}
            onEdit={() => startEdit(item)}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onEditContent={setEditContent}
            onEditLabel={setEditLabel}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        ))}

        {unpinned.length > 0 && pinned.length > 0 && <div className="sb-section-label">Recent</div>}
        {unpinned.map(item => (
          <SyncBoardCard
            key={item.id}
            item={item}
            copied={copied === item.id}
            editing={editingId === item.id}
            editContent={editContent}
            editLabel={editLabel}
            selectMode={selectMode}
            isSelected={selected.has(item.id)}
            onCopy={() => handleCopy(item)}
            onPin={() => togglePin(item.id)}
            onDelete={() => deleteItem(item.id)}
            onEdit={() => startEdit(item)}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onEditContent={setEditContent}
            onEditLabel={setEditLabel}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        ))}
      </div>

      {/* Floating delete bar */}
      {selectMode && selected.size > 0 && (
        <div className="sb-select-bar">
          <span>{selected.size} selected</span>
          <button className="sb-select-delete" onClick={() => setConfirmDeleteOpen(true)}>
            🗑 Delete selected
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="Clear all unpinned clips?"
        message={`This permanently deletes ${items.filter(i => !i.pinned).length} clip${items.filter(i => !i.pinned).length !== 1 ? 's' : ''}. Pinned clips stay.`}
        confirmLabel="Yes, clear them"
        danger
        onConfirm={() => { clearUnpinned(); setConfirmClearOpen(false) }}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title={`Delete ${selected.size} clip${selected.size !== 1 ? 's' : ''}?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { deleteItems([...selected]); setSelected(new Set()); setSelectMode(false); setConfirmDeleteOpen(false) }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  item: SyncBoardItem; copied: boolean; editing: boolean
  editContent: string; editLabel: string; selectMode: boolean; isSelected: boolean
  onCopy: () => void; onPin: () => void; onDelete: () => void; onEdit: () => void
  onSaveEdit: () => void; onCancelEdit: () => void
  onEditContent: (v: string) => void; onEditLabel: (v: string) => void
  onToggleSelect: () => void
}

function SyncBoardCard({ item, copied, editing, editContent, editLabel, selectMode, isSelected, onCopy, onPin, onDelete, onEdit, onSaveEdit, onCancelEdit, onEditContent, onEditLabel, onToggleSelect }: CardProps) {
  const typeIcon = item.type === 'link' ? '🔗' : item.type === 'code' ? '💻' : '📄'
  const sourceIcon = item.source === 'electron' ? '🖥️' : item.source === 'mobile' ? '📱' : '✍️'

  return (
    <div
      className={`sb-card ${item.pinned ? 'pinned' : ''} type-${item.type} ${isSelected ? 'selected' : ''}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {selectMode && (
        <div className="sb-checkbox">
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect} onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div className="sb-card-meta">
        <span>{typeIcon}</span>
        <span title={`From ${item.source}`}>{sourceIcon}</span>
        {item.label && !editing && <span className="sb-label">{item.label}</span>}
        <span className="sb-time">{fmtAgo(item.createdAt)}</span>
        {item.pinned && <span className="sb-pin-badge">Pinned</span>}
      </div>

      {editing ? (
        <div className="sb-edit-mode">
          <input
            className="sb-edit-label"
            value={editLabel}
            onChange={e => onEditLabel(e.target.value)}
            placeholder="Name this clip (optional)…"
          />
          <textarea
            className="sb-edit-content"
            value={editContent}
            onChange={e => onEditContent(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="sb-edit-actions">
            <button className="sb-action-btn save" onClick={onSaveEdit}>✅ Save</button>
            <button className="sb-action-btn" onClick={onCancelEdit}>✕ Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="sb-card-content">
            {item.type === 'link'
              ? <a href={item.content} target="_blank" rel="noopener noreferrer" className="sb-link">{item.content}</a>
              : item.type === 'code'
              ? <pre className="sb-code"><code>{item.content}</code></pre>
              : <p className="sb-text">{item.content}</p>
            }
          </div>

          {!selectMode && (
            <div className="sb-card-actions">
              <button className={`sb-action-btn copy ${copied ? 'copied' : ''}`} onClick={onCopy}>
                {copied ? '✅ Copied' : '📋 Copy'}
              </button>
              <button className="sb-action-btn edit" onClick={onEdit}>✏️ Edit</button>
              <button className={`sb-action-btn pin ${item.pinned ? 'active' : ''}`} onClick={onPin}>
                📌 {item.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button className="sb-action-btn delete" onClick={onDelete}>🗑️</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function fmtAgo(ts: number): string {
  const d = Date.now() - ts
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), days = Math.floor(d / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${days}d ago`
}
