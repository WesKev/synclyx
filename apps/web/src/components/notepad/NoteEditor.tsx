import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNotesStore, Block, BlockType, ChecklistItem } from '../../store/notesStore'
import BlockRenderer from './BlockRenderer'
import AtCommandMenu from './AtCommandMenu'
import TablePopup from './TablePopup'
import ExportModal from './ExportModal'
import FormatToolbar from './FormatToolbar'
import TagInput from './TagInput'
import NoteLinkMenu from './NoteLinkMenu'
import NotebookPicker from './NotebookPicker'
import { LockSetup, UnlockPrompt } from '../shared/PasswordLock'

const generateId = () => Math.random().toString(36).slice(2, 10)

const GOOGLE_FONTS = [
  'Inter','Lato','Merriweather','Nunito','Open Sans',
  'Playfair Display','Raleway','Roboto','Poppins','DM Sans',
  'Crimson Text','Space Grotesk','Libre Baskerville','Ubuntu','Source Code Pro'
]

interface HistoryEntry { blocks: Block[]; title: string }

export default function NoteEditor({ onOpenSyncVerse }: { onOpenSyncVerse?: () => void }) {
  const { notes, activeNoteId, updateNote, togglePin, lockedItems = {}, moveToTrash } = useNotesStore()
  const note = notes.find(n => n.id === activeNoteId)

  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atMenuPos, setAtMenuPos] = useState({ x: 0, y: 0 })
  const [atQuery, setAtQuery] = useState('')
  const [activeBlockId, setActiveBlockId] = useState('')
  const [showNoteLink, setShowNoteLink] = useState(false)
  const [noteLinkPos, setNoteLinkPos] = useState({ x: 0, y: 0 })
  const [noteLinkQuery, setNoteLinkQuery] = useState('')
  const [showTablePopup, setShowTablePopup] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showNotebookPicker, setShowNotebookPicker] = useState(false)
  const [showLockSetup, setShowLockSetup] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [formatToolbar, setFormatToolbar] = useState<{ x: number; y: number } | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const titleRef = useRef<HTMLInputElement>(null)
  const lastEnterTime = useRef(0)
  const skipHistoryRef = useRef(false)

  useEffect(() => {
    if (note) { titleRef.current?.focus(); setShowAtMenu(false); setFormatToolbar(null) }
  }, [activeNoteId])

  useEffect(() => {
    if (note?.font && note.font !== 'Inter') {
      const id = `font-${note.font.replace(/\s/g,'_')}`
      if (!document.getElementById(id)) {
        const link = document.createElement('link')
        link.id = id; link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${note.font.replace(/\s/g,'+')}:wght@400;500;600;700&display=swap`
        document.head.appendChild(link)
      }
    }
  }, [note?.font])

  // Push to undo history
  const pushHistory = useCallback((blocks: Block[], title: string) => {
    if (skipHistoryRef.current) return
    setHistory(h => {
      const trimmed = h.slice(0, historyIdx + 1)
      return [...trimmed, { blocks: JSON.parse(JSON.stringify(blocks)), title }].slice(-50)
    })
    setHistoryIdx(i => Math.min(i + 1, 49))
  }, [historyIdx])

  const undo = () => {
    if (historyIdx <= 0 || !note) return
    const prev = history[historyIdx - 1]
    skipHistoryRef.current = true
    updateNote(note.id, { blocks: prev.blocks, title: prev.title })
    setHistoryIdx(i => i - 1)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }

  const redo = () => {
    if (historyIdx >= history.length - 1 || !note) return
    const next = history[historyIdx + 1]
    skipHistoryRef.current = true
    updateNote(note.id, { blocks: next.blocks, title: next.title })
    setHistoryIdx(i => i + 1)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); useNotesStore.getState().addNote() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const isLocked = !!lockedItems[note?.id || ''] && !unlocked

  if (note && isLocked) return (
    <UnlockPrompt
      itemId={note.id}
      itemTitle={note.title}
      onSuccess={() => setUnlocked(true)}
      onCancel={() => {}}
    />
  )

  if (!note) return (
    <div className="editor-empty">
      <div className="editor-empty-inner">
        <span className="editor-empty-icon">📋</span>
        <p>Select a note or create a new one</p>
        <span className="editor-empty-hint">Press Ctrl+N for a new note</span>
      </div>
    </div>
  )

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateNote(note.id, { title: e.target.value })
    pushHistory(note.blocks, e.target.value)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, blockId: string) => {
    const value = e.target.value
    const cursor = e.target.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursor)

    // @ detection — show menu when @ is typed, close only on space or Escape
    const atIndex = textBeforeCursor.lastIndexOf('@')
    const afterAt = atIndex !== -1 ? textBeforeCursor.slice(atIndex + 1) : ''
    // Only show @ menu when @ was just typed (atIndex is near cursor) and query is letters only
    const atIsActive = atIndex !== -1 &&
      /^[a-zA-Z]*$/.test(afterAt) &&
      afterAt.length < 20 &&
      !afterAt.includes(' ') &&
      !afterAt.includes('\n')

    // [[ detection — only after full [[ sequence
    const doubleBracketIndex = textBeforeCursor.lastIndexOf('[[')
    const afterBracket = doubleBracketIndex !== -1 ? textBeforeCursor.slice(doubleBracketIndex + 2) : ''
    const bracketIsActive = doubleBracketIndex !== -1 && !afterBracket.includes('[[') && !afterBracket.includes(' ') && !afterBracket.includes('\n') && afterBracket.length < 30

    if (atIsActive) {
      const rect = e.target.getBoundingClientRect()
      setAtMenuPos({ x: rect.left + 16, y: rect.bottom })
      setShowAtMenu(true)
      setShowNoteLink(false)
      setAtQuery(afterAt)
      setActiveBlockId(blockId)
    } else if (bracketIsActive) {
      const rect = e.target.getBoundingClientRect()
      setNoteLinkPos({ x: rect.left + 16, y: rect.bottom })
      setShowNoteLink(true)
      setShowAtMenu(false)
      setNoteLinkQuery(afterBracket)
      setActiveBlockId(blockId)
    } else {
      setShowAtMenu(false)
      setShowNoteLink(false)
    }
    updateBlockContent(blockId, value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, blockId: string) => {
    const value = (e.target as HTMLTextAreaElement).value
    const target = e.target as HTMLTextAreaElement

    // Detect @ key press immediately — show menu before onChange fires
    if (e.key === '@') {
      const rect = target.getBoundingClientRect()
      setAtMenuPos({ x: rect.left + 16, y: rect.bottom })
      setShowAtMenu(true)
      setAtQuery('')
      setActiveBlockId(blockId)
    }

    // Close @ menu on space or escape
    if (showAtMenu) {
      if (e.key === 'Escape' || e.key === ' ') { setShowAtMenu(false) }
      if (e.key === 'Enter') { e.preventDefault(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showAtMenu) {
      const now = Date.now()
      const diff = now - lastEnterTime.current
      lastEnterTime.current = now
      if (diff < 500 || e.ctrlKey) { e.preventDefault(); addBlock('text', blockId) }
      else if ((e.target as HTMLTextAreaElement).selectionStart === value.length) {
        e.preventDefault()
        updateBlockContent(blockId, value + '\n')
      }
    }
    if (e.key === 'Backspace' && value === '') { e.preventDefault(); removeBlock(blockId) }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFormat('bold', blockId) }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); applyFormat('italic', blockId) }
  }

  const applyFormat = (format: string, blockId: string) => {
    const textarea = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart; const end = textarea.selectionEnd
    const selected = textarea.value.slice(start, end)
    if (!selected) return
    const markers: Record<string, string> = { bold: '**', italic: '_', strikethrough: '~~', code: '`' }
    const m = markers[format] || ''
    updateBlockContent(blockId, textarea.value.slice(0, start) + m + selected + m + textarea.value.slice(end))
  }

  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setFormatToolbar(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setFormatToolbar({ x: rect.left + rect.width / 2, y: rect.top - 8 })
  }

  const updateBlockContent = (blockId: string, content: string) => {
    const updated = note.blocks.map(b => b.id === blockId ? { ...b, content } : b)
    updateNote(note.id, { blocks: updated })
    pushHistory(updated, note.title)
  }

  const addBlock = (type: BlockType, afterId?: string, meta?: Record<string, string>) => {
    const newBlock: Block = {
      id: generateId(), type, content: '', meta,
      items: type === 'checklist' ? [{ id: generateId(), text: '', checked: false }] : undefined,
      createdAt: Date.now(),
    }
    let blocks = [...note.blocks]
    if (afterId) {
      const idx = blocks.findIndex(b => b.id === afterId)
      blocks.splice(idx + 1, 0, newBlock)
    } else {
      blocks.push(newBlock)
    }
    // Always add a text block after any block inserted via @ command
    // This gives a natural writing flow — block appears, then empty text area below it
    if (type !== 'heading') {
      const follower: Block = { id: generateId(), type: 'text', content: '', createdAt: Date.now() }
      const insertIdx = blocks.findIndex(b => b.id === newBlock.id)
      blocks.splice(insertIdx + 1, 0, follower)
    }
    updateNote(note.id, { blocks })
    pushHistory(blocks, note.title)
  }

  const removeBlock = (blockId: string) => {
    const updated = note.blocks.filter(b => b.id !== blockId)
    updateNote(note.id, { blocks: updated })
    pushHistory(updated, note.title)
  }

  const handleAtSelect = (type: BlockType) => {
    setShowAtMenu(false)
    const block = note.blocks.find(b => b.id === activeBlockId)
    if (block) {
      const atIndex = block.content.lastIndexOf('@')
      updateBlockContent(activeBlockId, atIndex !== -1 ? block.content.slice(0, atIndex) : block.content)
    }
    if (type === 'table') { setShowTablePopup(true); return }
    if (['image','file','audio','video'].includes(type)) {
      const input = document.createElement('input')
      input.type = 'file'
      if (type === 'image') input.accept = 'image/*'
      else if (type === 'audio') input.accept = 'audio/*'
      else if (type === 'video') input.accept = 'video/*'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        addBlock(type, activeBlockId, { url: URL.createObjectURL(file), name: file.name, size: String(file.size) })
      }
      input.click(); return
    }
    addBlock(type, activeBlockId)
  }

  return (
    <div className={`editor ${zenMode ? 'zen-mode' : ''}`}
      style={note.font ? { fontFamily: `'${note.font}', system-ui, sans-serif` } : undefined}
      onMouseUp={handleMouseUp}>

      {!zenMode && (
        <div className="editor-toolbar">
          <div className="editor-toolbar-left">
            <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)" disabled={historyIdx <= 0}>↩</button>
            <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Y)" disabled={historyIdx >= history.length - 1}>↪</button>
            <div className="toolbar-divider" />
            <TagInput note={note} onUpdate={(tags) => updateNote(note.id, { tags })} />
          </div>
          <div className="editor-toolbar-right">
            <button className={`toolbar-btn ${note.pinned ? 'active' : ''}`} onClick={() => togglePin(note.id)} title="Pin">📌</button>
            <div className="font-picker-wrap">
              <button className="toolbar-btn" onClick={() => setShowNotebookPicker(p => !p)} title="Add to notebook">📁</button>
              {showNotebookPicker && (
                <NotebookPicker
                  noteId={note.id}
                  currentNotebookId={note.notebookId}
                  onClose={() => setShowNotebookPicker(false)}
                />
              )}
            </div>
            <button
              className={`toolbar-btn ${lockedItems[note.id] ? 'active' : ''}`}
              onClick={() => setShowLockSetup(true)}
              title={lockedItems[note.id] ? 'Locked — click to manage' : 'Lock note'}>
              {lockedItems[note.id] ? '🔒' : '🔓'}
            </button>
            <button className="toolbar-btn" title="Move to trash"
              onClick={() => { if (confirm('Move to trash?')) moveToTrash(note.id, 'note') }}>
              🗑
            </button>
            <div className="font-picker-wrap">
              <button className="toolbar-btn" onClick={() => setShowFontPicker(f => !f)} title="Font">Aa</button>
              {showFontPicker && (
                <div className="font-picker">
                  <div className="font-picker-header">Font</div>
                  {GOOGLE_FONTS.map(f => (
                    <button key={f} className={`font-option ${note.font === f ? 'active' : ''}`}
                      style={{ fontFamily: `'${f}', sans-serif` }}
                      onClick={() => { updateNote(note.id, { font: f }); setShowFontPicker(false) }}>{f}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="toolbar-btn" onClick={() => setShowExportModal(true)} title="View version history">🕐</button>
            <button className={`toolbar-btn ${zenMode ? 'active' : ''}`} onClick={() => setZenMode(z => !z)} title="Zen mode">◎</button>
            <button className="toolbar-btn export-btn" onClick={() => setShowExportModal(true)}>↑ Export</button>
          </div>
        </div>
      )}

      {zenMode && <button className="zen-exit" onClick={() => setZenMode(false)}>Exit Zen ◎</button>}

      <input ref={titleRef} className="editor-title" value={note.title}
        onChange={handleTitleChange} placeholder="Note title" />

      <div className="editor-blocks" onClick={() => { setShowAtMenu(false); setShowFontPicker(false) }}>
        {note.blocks.length === 0 && (
          <textarea className="block-text empty-prompt"
            placeholder="Start writing or type @ to insert a block..."
            onKeyDown={(e) => handleKeyDown(e, '')}
            onChange={(e) => handleTextChange(e, '')} rows={1} />
        )}
        {note.blocks.map(block => (
          <BlockRenderer key={block.id} block={block}
            onKeyDown={(e) => handleKeyDown(e, block.id)}
            onChange={(e) => handleTextChange(e, block.id)}
            onRemove={() => removeBlock(block.id)}
            onUpdateMeta={(meta) => updateNote(note.id, { blocks: note.blocks.map(b => b.id === block.id ? { ...b, meta } : b) })}
            onUpdateItems={(items) => updateNote(note.id, { blocks: note.blocks.map(b => b.id === block.id ? { ...b, items } : b) })}
            onAddBlockAfter={(type) => addBlock(type, block.id)}
          />
        ))}
      </div>

      {formatToolbar && (
        <FormatToolbar position={formatToolbar}
          onFormat={(fmt) => { if (activeBlockId) applyFormat(fmt, activeBlockId); setFormatToolbar(null) }}
          onClose={() => setFormatToolbar(null)} />
      )}
      {showAtMenu && <AtCommandMenu query={atQuery} position={atMenuPos} onSelect={handleAtSelect} onClose={() => setShowAtMenu(false)} />}
      {showNoteLink && (
        <NoteLinkMenu
          query={noteLinkQuery}
          position={noteLinkPos}
          onSelect={(noteId, noteTitle) => {
            setShowNoteLink(false)
            const block = note.blocks.find(b => b.id === activeBlockId)
            if (block) {
              const textBeforeCursor = block.content
              const bracketIdx = textBeforeCursor.lastIndexOf('[[')
              const cleaned = textBeforeCursor.slice(0, bracketIdx)
              updateBlockContent(activeBlockId, cleaned + `[[${noteTitle}]]`)
              // Add to linkedNotes
              if (!note.linkedNotes.includes(noteId)) {
                updateNote(note.id, { linkedNotes: [...note.linkedNotes, noteId] })
              }
            }
          }}
          onClose={() => setShowNoteLink(false)}
        />
      )}
      {showTablePopup && <TablePopup onConfirm={(r,c) => { setShowTablePopup(false); addBlock('table', activeBlockId, { rows: String(r), cols: String(c) }) }} onClose={() => setShowTablePopup(false)} />}
      {showExportModal && <ExportModal note={note} onClose={() => setShowExportModal(false)} />}
      {showLockSetup && (
        <LockSetup itemId={note.id} itemTitle={note.title} onClose={() => setShowLockSetup(false)} />
      )}
    </div>
  )
}
