import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNotesStore, Block, BlockType, ChecklistItem, flushAllPendingNotesAndCanvases } from '../../store/notesStore'
import BlockRenderer from './BlockRenderer'
import AtCommandMenu from './AtCommandMenu'
import TablePopup from './TablePopup'
import ExportModal from './ExportModal'
import VersionHistoryModal from './VersionHistoryModal'
import FormatToolbar from './FormatToolbar'
import TagInput from './TagInput'
import NoteLinkMenu from './NoteLinkMenu'
import NotebookPicker from './NotebookPicker'
import { LockSetup, UnlockPrompt } from '../shared/PasswordLock'
import SyncIndicator from '../shared/SyncIndicator'
import { uploadFile } from '../../lib/storageUpload'
import { useAuthStore } from '../../store/authStore'
import ShareDialog from '../share/ShareDialog'
import { useSyncStatus } from '../../hooks/useSyncStatus'

const generateId = () => Math.random().toString(36).slice(2, 10)

const GOOGLE_FONTS = [
  'Inter','Lato','Merriweather','Nunito','Open Sans',
  'Playfair Display','Raleway','Roboto','Poppins','DM Sans',
  'Crimson Text','Space Grotesk','Libre Baskerville','Ubuntu','Source Code Pro'
]

interface HistoryEntry { blocks: Block[]; title: string }

/*
 * -- Undo/Redo architecture --------------------------------------------------
 *
 * Previously EVERY keystroke pushed a full deep-cloned snapshot of the note's
 * blocks onto our own history stack, capped at 50 entries -- and the global
 * Ctrl+Z handler unconditionally called e.preventDefault(), which silently
 * hijacked the browser's own built-in undo for every textarea/input on the
 * page. Two consequences: (1) undo/redo felt "coarse" because whichever
 * block last changed -- even by one whole block being added or removed --
 * sat in the same flat stack as single-character edits, and (2) the native,
 * free, already word/pause-boundary-granular undo every browser ships with
 * for text fields never got a chance to run.
 *
 * Fixed by splitting into two clearly separate layers:
 *
 *   1. TEXT EDITING (typing inside a block or the title) -- handled entirely
 *      by the browser's own native undo stack. We simply stop intercepting
 *      Ctrl+Z/Ctrl+Y while focus is inside a text field. This is genuinely
 *      word-level (browsers group undo steps at typing pauses/word
 *      boundaries) and needs zero code from us.
 *
 *   2. STRUCTURAL CHANGES (add/remove a block, insert media, change a
 *      block's type) -- our own `history` stack, used by the toolbar undo/redo
 *      buttons and by Ctrl+Z/Y when focus is NOT inside a text field.
 *      A "checkpoint" is also pushed when a text/heading block loses focus
 *      if its content actually changed during that editing session -- so the
 *      toolbar buttons can still undo "my last edit to this paragraph" as
 *      one meaningful step, without recording every keystroke.
 */

export default function NoteEditor({ onOpenSyncVerse }: { onOpenSyncVerse?: () => void }) {
  const { notes, activeNoteId, updateNote, togglePin, lockedItems = {}, moveToTrash, toggleNotePublicLink } = useNotesStore()
  const [showShareDialog, setShowShareDialog] = useState(false)
  const note = notes.find(n => n.id === activeNoteId)
  const { user } = useAuthStore()
  const [uploadStatus, setUploadStatus] = useState<{ name: string; progress: number; error?: string } | null>(null)

  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atMenuPos, setAtMenuPos] = useState({ x: 0, y: 0 })
  const [atQuery, setAtQuery] = useState('')
  const [activeBlockId, setActiveBlockId] = useState('')
  const [showNoteLink, setShowNoteLink] = useState(false)
  const [noteLinkPos, setNoteLinkPos] = useState({ x: 0, y: 0 })
  const [noteLinkQuery, setNoteLinkQuery] = useState('')
  const [showTablePopup, setShowTablePopup] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
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

  // Content each text field held at the moment it gained focus, keyed by
  // block id -- compared on blur to decide whether a checkpoint is worth
  // recording. Cleared per field once compared; never grows unbounded.
  const contentAtFocusRef = useRef<Record<string, string>>({})
  const titleAtFocusRef = useRef<string | null>(null)

  const { status: syncStatus, markSaved } = useSyncStatus(note?.updatedAt, 800)

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

  // Structural stack -- 100 checkpoints now (not per-keystroke), so this
  // comfortably covers a long editing session.
  const pushHistory = useCallback((blocks: Block[], title: string) => {
    if (skipHistoryRef.current) return
    setHistory(h => {
      const trimmed = h.slice(0, historyIdx + 1)
      return [...trimmed, { blocks: JSON.parse(JSON.stringify(blocks)), title }].slice(-100)
    })
    setHistoryIdx(i => Math.min(i + 1, 99))
  }, [historyIdx])

  const undo = useCallback(() => {
    if (historyIdx <= 0 || !note) return
    const prev = history[historyIdx - 1]
    skipHistoryRef.current = true
    updateNote(note.id, { blocks: prev.blocks, title: prev.title })
    setHistoryIdx(i => i - 1)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [historyIdx, history, note, updateNote])

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1 || !note) return
    const next = history[historyIdx + 1]
    skipHistoryRef.current = true
    updateNote(note.id, { blocks: next.blocks, title: next.title })
    setHistoryIdx(i => i + 1)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [historyIdx, history, note, updateNote])

  const handleManualSave = useCallback(() => {
    const { _uid } = useNotesStore.getState()
    if (_uid) flushAllPendingNotesAndCanvases(_uid)
    markSaved()
  }, [markSaved])

  // -- Global Ctrl+Z / Ctrl+Y ---------------------------------------------
  // Only intercepted when focus is NOT inside a text field -- see the big
  // comment above. Inside a textarea/input, we do nothing at all and let the
  // browser's own native undo/redo run exactly as it would on any web page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleManualSave(); return }

      const isCtrlZ = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey
      const isCtrlY = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      if (!isCtrlZ && !isCtrlY) return

      const active = document.activeElement
      const isTextField = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
      if (isTextField) return // native undo/redo handles this field

      e.preventDefault()
      if (isCtrlZ) undo(); else redo()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, handleManualSave])

  const isLocked = note && !!lockedItems[note.id] && !unlocked

  if (!note) return (
    <div className="editor-empty">
      <div className="editor-empty-inner">
        <span className="editor-empty-icon">✦</span>
        <p>Select a note or create one</p>
        <span className="editor-empty-hint">Press Ctrl+N for a new note</span>
      </div>
    </div>
  )

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // No pushHistory here -- native undo owns title typing, same as blocks.
    updateNote(note.id, { title: e.target.value })
  }

  const handleTitleFocus = () => { titleAtFocusRef.current = note.title }
  const handleTitleBlur = () => {
    const before = titleAtFocusRef.current
    titleAtFocusRef.current = null
    if (before === null || before === note.title) return
    const fresh = useNotesStore.getState().notes.find(n => n.id === activeNoteId)
    if (fresh) pushHistory(fresh.blocks, fresh.title)
  }

  // -- Checkpoint on blur -- delegated at the block-list level ------------
  // Any focusable field inside .editor-blocks that carries data-block-id
  // gets this for free: the content it held at focus-time is compared to
  // what it holds on blur, and a single structural checkpoint is recorded
  // only if something actually changed.
  const handleBlocksFocus = (e: React.FocusEvent) => {
    const target = e.target as HTMLElement
    const blockId = target.dataset.blockId
    if (!blockId) return
    const val = (target as HTMLTextAreaElement | HTMLInputElement).value
    contentAtFocusRef.current[blockId] = val
  }

  const handleBlocksBlur = (e: React.FocusEvent) => {
    const target = e.target as HTMLElement
    const blockId = target.dataset.blockId
    if (!blockId) return
    const before = contentAtFocusRef.current[blockId]
    delete contentAtFocusRef.current[blockId]
    if (before === undefined) return
    const after = (target as HTMLTextAreaElement | HTMLInputElement).value
    if (before === after) return
    const fresh = useNotesStore.getState().notes.find(n => n.id === activeNoteId)
    if (fresh) pushHistory(fresh.blocks, fresh.title)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, blockId: string) => {
    const value = e.target.value
    // Text blocks call this with a fake event ({ target: { value } }), not a real DOM
    // event — so e.target has no selectionStart / getBoundingClientRect. Fall back to
    // the real textarea (MarkdownText tags it with data-block-id).
    const el = (e.target instanceof HTMLElement
      ? e.target
      : document.querySelector(`textarea[data-block-id="${CSS.escape(blockId)}"]`)) as HTMLTextAreaElement | null
    const cursor = el?.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursor)

    const atIndex = textBeforeCursor.lastIndexOf('@')
    const afterAt = atIndex !== -1 ? textBeforeCursor.slice(atIndex + 1) : ''
    const atIsActive = atIndex !== -1 && /^[a-zA-Z]*$/.test(afterAt) && afterAt.length < 20 && !afterAt.includes(' ') && !afterAt.includes('\n')

    const doubleBracketIndex = textBeforeCursor.lastIndexOf('[[')
    const afterBracket = doubleBracketIndex !== -1 ? textBeforeCursor.slice(doubleBracketIndex + 2) : ''
    const bracketIsActive = doubleBracketIndex !== -1 && !afterBracket.includes('[[') && !afterBracket.includes(' ') && !afterBracket.includes('\n') && afterBracket.length < 30

    if (atIsActive && el) {
      const rect = el.getBoundingClientRect()
      setAtMenuPos({ x: rect.left + 16, y: rect.bottom })
      setShowAtMenu(true); setShowNoteLink(false); setAtQuery(afterAt); setActiveBlockId(blockId)
    } else if (bracketIsActive && el) {
      const rect = el.getBoundingClientRect()
      setNoteLinkPos({ x: rect.left + 16, y: rect.bottom })
      setShowNoteLink(true); setShowAtMenu(false); setNoteLinkQuery(afterBracket); setActiveBlockId(blockId)
    } else {
      setShowAtMenu(false); setShowNoteLink(false)
    }
    updateBlockContent(blockId, value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, blockId: string) => {
    const value = (e.target as HTMLTextAreaElement).value
    const target = e.target as HTMLTextAreaElement

    if (e.key === '@') {
      const rect = target.getBoundingClientRect()
      setAtMenuPos({ x: rect.left + 16, y: rect.bottom })
      setShowAtMenu(true); setAtQuery(''); setActiveBlockId(blockId)
    }
    if (showAtMenu) {
      if (e.key === 'Escape' || e.key === ' ') setShowAtMenu(false)
      if (e.key === 'Enter') { e.preventDefault(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showAtMenu) {
      const now = Date.now()
      const diff = now - lastEnterTime.current
      lastEnterTime.current = now
      if (diff < 500 || e.ctrlKey) { e.preventDefault(); addBlock('text', blockId) }
      else if ((e.target as HTMLTextAreaElement).selectionStart === value.length) {
        e.preventDefault(); updateBlockContent(blockId, value + '\n')
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

  // No pushHistory here anymore -- typing relies entirely on native undo.
  // A checkpoint is recorded separately, once, when the field blurs.
  const updateBlockContent = (blockId: string, content: string) => {
    const updated = note.blocks.map(b => b.id === blockId ? { ...b, content } : b)
    updateNote(note.id, { blocks: updated })
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
    } else { blocks.push(newBlock) }
    if (type !== 'heading') {
      const follower: Block = { id: generateId(), type: 'text', content: '', createdAt: Date.now() }
      const insertIdx = blocks.findIndex(b => b.id === newBlock.id)
      blocks.splice(insertIdx + 1, 0, follower)
    }
    updateNote(note.id, { blocks })
    pushHistory(blocks, note.title) // structural -- always checkpointed
  }

  const removeBlock = (blockId: string) => {
    const updated = note.blocks.filter(b => b.id !== blockId)
    updateNote(note.id, { blocks: updated })
    pushHistory(updated, note.title) // structural -- always checkpointed
  }

  const handleAtSelect = (type: BlockType) => {
    setShowAtMenu(false)
    const freshNote = useNotesStore.getState().notes.find(n => n.id === activeNoteId)
    if (!freshNote) return

    let blocks = freshNote.blocks.map(b => {
      if (b.id !== activeBlockId) return b
      const atIndex = b.content.lastIndexOf('@')
      return { ...b, content: atIndex !== -1 ? b.content.slice(0, atIndex) : b.content }
    })

    if (type === 'table') { updateNote(freshNote.id, { blocks }); setShowTablePopup(true); return }

    if (['image','file','audio','video'].includes(type)) {
      const input = document.createElement('input')
      input.type = 'file'
      if (type === 'image') input.accept = 'image/*'
      else if (type === 'audio') input.accept = 'audio/*'
      else if (type === 'video') input.accept = 'video/*'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        const localPreview = URL.createObjectURL(file)
        const blockId = generateId()
        const latestNote = useNotesStore.getState().notes.find(n => n.id === activeNoteId)
        if (!latestNote) return
        let latestBlocks = [...latestNote.blocks]
        const newBlock: Block = {
          id: blockId, type, content: '',
          meta: { url: localPreview, name: file.name, size: String(file.size), uploading: 'true' },
          createdAt: Date.now(),
        }
        const follower: Block = { id: generateId(), type: 'text', content: '', createdAt: Date.now() }
        const idx = latestBlocks.findIndex(b => b.id === activeBlockId)
        if (idx !== -1) latestBlocks.splice(idx + 1, 0, newBlock, follower)
        else latestBlocks.push(newBlock, follower)
        updateNote(latestNote.id, { blocks: latestBlocks })
        pushHistory(latestBlocks, latestNote.title) // structural -- a block appeared

        if (!user) {
          setUploadStatus({ name: file.name, progress: 0, error: 'Sign in to upload files so they sync across devices' })
          setTimeout(() => setUploadStatus(null), 5000)
          return
        }

        setUploadStatus({ name: file.name, progress: 0 })
        uploadFile(user.uid, file, (p) => {
          if (p.error) {
            setUploadStatus({ name: file.name, progress: 0, error: p.error })
            setTimeout(() => setUploadStatus(null), 6000)
            return
          }
          if (p.url) {
            const n = useNotesStore.getState().notes.find(x => x.id === activeNoteId)
            if (n) {
              const swapped = n.blocks.map(b =>
                b.id === blockId
                  ? { ...b, meta: { ...b.meta, url: p.url as string, name: file.name, size: String(file.size) } }
                  : b
              )
              updateNote(n.id, { blocks: swapped })
            }
            setUploadStatus({ name: file.name, progress: 100 })
            setTimeout(() => setUploadStatus(null), 1800)
            URL.revokeObjectURL(localPreview)
          } else {
            setUploadStatus({ name: file.name, progress: p.progress })
          }
        })
      }
      updateNote(freshNote.id, { blocks }); input.click(); return
    }

    const newBlock: Block = {
      id: generateId(), type, content: '',
      items: type === 'checklist' ? [{ id: generateId(), text: '', checked: false }] : undefined,
      createdAt: Date.now(),
    }
    const follower: Block = { id: generateId(), type: 'text', content: '', createdAt: Date.now() }
    const activeIdx = blocks.findIndex(b => b.id === activeBlockId)
    if (activeIdx !== -1) {
      if (type !== 'heading') blocks.splice(activeIdx + 1, 0, newBlock, follower)
      else blocks.splice(activeIdx + 1, 0, newBlock)
    } else {
      blocks.push(newBlock)
      if (type !== 'heading') blocks.push(follower)
    }
    updateNote(freshNote.id, { blocks })
    pushHistory(blocks, freshNote.title) // structural -- a block appeared
  }

  return (
    <div className={`editor ${zenMode ? 'zen-mode' : ''}`}
      style={note.font ? { fontFamily: `'${note.font}', system-ui, sans-serif` } : undefined}
      onMouseUp={handleMouseUp}>

      {!zenMode && (
        <div className="editor-toolbar">
          <div className="editor-toolbar-left">
            <button className="toolbar-btn" onClick={undo} title="Undo last change (Ctrl+Z outside a text field)" disabled={historyIdx <= 0}>↩</button>
            <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Y outside a text field)" disabled={historyIdx >= history.length - 1}>↪</button>
            <div className="toolbar-divider" />
            <TagInput note={note} onUpdate={(tags) => updateNote(note.id, { tags })} />
          </div>
          <div className="editor-toolbar-right">
            <SyncIndicator status={syncStatus} onSave={handleManualSave} label />
            <div className="toolbar-divider" />
            <button className={`toolbar-btn ${note.pinned ? 'active' : ''}`} onClick={() => togglePin(note.id)} title="Pin">📌</button>
            <div className="font-picker-wrap">
              <button className="toolbar-btn" onClick={() => setShowNotebookPicker(p => !p)} title="Add to notebook">📁</button>
              {showNotebookPicker && (
                <NotebookPicker noteId={note.id} currentNotebookId={note.notebookId} onClose={() => setShowNotebookPicker(false)} />
              )}
            </div>
            <button className={`toolbar-btn ${lockedItems[note.id] ? 'active' : ''}`}
              onClick={() => setShowLockSetup(true)}
              title={lockedItems[note.id] ? 'Locked' : 'Lock note'}>
              {lockedItems[note.id] ? '🔒' : '🔓'}
            </button>
            <button className="toolbar-btn" title="Move to trash"
              onClick={() => { if (confirm('Move to trash?')) moveToTrash(note.id, 'note') }}>🗑</button>
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
            <button className="toolbar-btn" onClick={() => setShowVersionHistory(true)} title="Version history">🕐</button>
            <button className={`toolbar-btn ${zenMode ? 'active' : ''}`} onClick={() => setZenMode(z => !z)} title="Zen mode">◎</button>
            <button className="toolbar-btn" onClick={() => setShowShareDialog(true)} title="Share">🔗</button>
            <button className="toolbar-btn export-btn" onClick={() => setShowExportModal(true)}>↑ Export</button>
          </div>
        </div>
      )}

      {zenMode && <button className="zen-exit" onClick={() => setZenMode(false)}>Exit Zen ◎</button>}

      <input ref={titleRef} className="editor-title" value={note.title}
        onChange={handleTitleChange}
        onFocus={handleTitleFocus}
        onBlur={handleTitleBlur}
        placeholder="Note title" />

      <div className="editor-blocks"
        onClick={() => { setShowAtMenu(false); setShowFontPicker(false) }}
        onFocus={handleBlocksFocus}
        onBlur={handleBlocksBlur}>
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
        <NoteLinkMenu query={noteLinkQuery} position={noteLinkPos}
          onSelect={(noteId, noteTitle) => {
            setShowNoteLink(false)
            const block = note.blocks.find(b => b.id === activeBlockId)
            if (block) {
              const bracketIdx = block.content.lastIndexOf('[[')
              const cleaned = block.content.slice(0, bracketIdx)
              updateBlockContent(activeBlockId, cleaned + `[[${noteTitle}]]`)
              if (!note.linkedNotes.includes(noteId)) updateNote(note.id, { linkedNotes: [...note.linkedNotes, noteId] })
            }
          }}
          onClose={() => setShowNoteLink(false)}
        />
      )}
      {showTablePopup && (
        <TablePopup
          onConfirm={(r, c) => { setShowTablePopup(false); addBlock('table', activeBlockId, { rows: String(r), cols: String(c) }) }}
          onClose={() => setShowTablePopup(false)}
        />
      )}
      {uploadStatus && (
        <div className={`sp-upload-toast ${uploadStatus.error ? 'error' : ''}`}>
          {uploadStatus.error ? (
            <span>⚠️ {uploadStatus.error}</span>
          ) : uploadStatus.progress === 100 ? (
            <span>✅ {uploadStatus.name} uploaded</span>
          ) : (
            <>
              <span>↑ Uploading {uploadStatus.name}…</span>
              <div className="sp-upload-bar">
                <div className="sp-upload-fill" style={{ width: `${uploadStatus.progress}%` }} />
              </div>
            </>
          )}
        </div>
      )}
      {showExportModal && <ExportModal note={note} onClose={() => setShowExportModal(false)} />}
      {showShareDialog && (
        <ShareDialog
          itemLabel="note"
          title={note.title}
          isPublic={!!note.isPublic}
          shareId={note.shareId}
          onToggle={() => toggleNotePublicLink(note.id, user?.displayName || user?.email?.split('@')[0] || 'a Synclyx user')}
          onClose={() => setShowShareDialog(false)}
        />
      )}
      {showVersionHistory && <VersionHistoryModal note={note} onClose={() => setShowVersionHistory(false)} />}
      {showLockSetup && <LockSetup itemId={note.id} itemTitle={note.title} onClose={() => setShowLockSetup(false)} />}
      {isLocked && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', backdropFilter: 'blur(4px)' }}>
          <UnlockPrompt itemId={note.id} itemTitle={note.title} onSuccess={() => setUnlocked(true)} onCancel={() => setUnlocked(false)} />
        </div>
      )}
    </div>
  )
}
