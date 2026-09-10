import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  doc, collection, writeBatch, getDocs, query, limit,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  saveNote, deleteNoteFromFirestore,
  saveNotebook, deleteNotebookFromFirestore,
  saveCanvas, deleteCanvasFromFirestore,
  saveTrashItem, deleteTrashItem, emptyTrashInFirestore,
  saveCustomTags, listenToNotes, listenToNotebooks,
  listenToCanvases, listenToTrash,
} from '../lib/firestoreSync'
import { db } from '../lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────
export type BlockType = 'text'|'code'|'image'|'link'|'video'|'audio'|'file'|'table'|'checklist'|'heading'|'list'
export interface ChecklistItem { id: string; text: string; checked: boolean }
export interface Block {
  id: string; type: BlockType; content: string
  meta?: Record<string, string>; items?: ChecklistItem[]; createdAt: number
}
export interface NoteVersion { id: string; savedAt: number; title: string; blocks: Block[] }
export interface Note {
  id: string; title: string; blocks: Block[]; tags: string[]
  pinned: boolean; notebookId?: string; linkedNotes: string[]
  font?: string; versions: NoteVersion[]; createdAt: number; updatedAt: number
}
export interface Notebook { id: string; name: string; color: string; createdAt: number }
export interface TrashedItem {
  id: string; type: 'note'|'canvas'; data: Note|SyncVerseCanvas; deletedAt: number
}
export type SyncVerseNodeType = 'block'|'note'|'sticky'|'shape'|'group'
export interface SyncVerseNode {
  id: string; type: SyncVerseNodeType
  position: { x: number; y: number }
  data: { block?: Block; noteId?: string; label?: string; color?: string; collapsed?: boolean }
  width?: number; height?: number
}
export interface SyncVerseEdge {
  id: string; source: string; target: string; label?: string; animated?: boolean
}
export interface CanvasVersion {
  id: string; savedAt: number; name: string
  nodes: SyncVerseNode[]; edges: SyncVerseEdge[]
}
export interface SyncVerseCanvas {
  id: string; noteId: string; name: string; notebookId?: string
  nodes: SyncVerseNode[]; edges: SyncVerseEdge[]
  viewport: { x: number; y: number; zoom: number }
  versions?: CanvasVersion[]
  createdAt: number; updatedAt: number
}

export const PRESET_TAGS = [
  { id: 'personal', label: 'Personal Notes', emoji: '👤' },
  { id: 'work', label: 'Work', emoji: '💼' },
  { id: 'shopping', label: 'Shopping List', emoji: '🛒' },
  { id: 'ideas', label: 'Ideas', emoji: '💡' },
  { id: 'study', label: 'Study', emoji: '📚' },
  { id: 'health', label: 'Health', emoji: '🏥' },
]

const MAX_VERSIONS = 5
const NOTE_SYNC_DELAY = 2000    // 2s inactivity before saving note to Firestore
const CANVAS_SYNC_DELAY = 3000  // 3s inactivity before saving canvas to Firestore

// ─── Module-level debounce timers (outside store to avoid Zustand serialisation) ──
const _noteTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const _canvasTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function scheduleNoteSave(uid: string, note: Note) {
  if (_noteTimers[note.id]) clearTimeout(_noteTimers[note.id])
  _noteTimers[note.id] = setTimeout(() => {
    saveNote(uid, note)
    delete _noteTimers[note.id]
  }, NOTE_SYNC_DELAY)
}

function scheduleCanvasSave(uid: string, canvas: SyncVerseCanvas) {
  if (_canvasTimers[canvas.id]) clearTimeout(_canvasTimers[canvas.id])
  _canvasTimers[canvas.id] = setTimeout(() => {
    saveCanvas(uid, canvas)
    delete _canvasTimers[canvas.id]
  }, CANVAS_SYNC_DELAY)
}

/** Flush all pending note saves immediately — call on view switch or app close */
export function flushAllPendingNotes(uid: string, notes: Note[]) {
  Object.keys(_noteTimers).forEach(noteId => {
    clearTimeout(_noteTimers[noteId])
    delete _noteTimers[noteId]
    const note = notes.find(n => n.id === noteId)
    if (note) saveNote(uid, note)
  })
}

/** Flush all pending canvas saves immediately — call on view switch or app close */
export function flushAllPendingCanvases(uid: string, canvases: SyncVerseCanvas[]) {
  Object.keys(_canvasTimers).forEach(canvasId => {
    clearTimeout(_canvasTimers[canvasId])
    delete _canvasTimers[canvasId]
    const canvas = canvases.find(c => c.id === canvasId)
    if (canvas) saveCanvas(uid, canvas)
  })
}

// ─── Local → Firestore migration ──────────────────────────────────────────────
async function migrateLocalToFirestore(
  uid: string,
  notes: Note[], notebooks: Notebook[],
  canvases: SyncVerseCanvas[], trash: TrashedItem[]
) {
  try {
    const existing = await getDocs(query(collection(db, 'users', uid, 'notes'), limit(1)))
    if (!existing.empty) return
    const items = [
      ...notes.map(d => ({ col: 'notes', id: d.id, data: d as object })),
      ...notebooks.map(d => ({ col: 'notebooks', id: d.id, data: d as object })),
      ...canvases.map(d => ({ col: 'canvases', id: d.id, data: d as object })),
      ...trash.map(d => ({ col: 'trash', id: d.id, data: d as object })),
    ]
    if (items.length === 0) return
    const CHUNK = 400
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = writeBatch(db)
      items.slice(i, i + CHUNK).forEach(({ col, id, data }) => {
        batch.set(doc(db, 'users', uid, col, id), data)
      })
      await batch.commit()
    }
  } catch (e) { console.warn('[Synclyx] Migration failed:', e) }
}

const generateId = () => Math.random().toString(36).slice(2, 10)

function makeNoteVersion(note: Note): NoteVersion {
  return { id: generateId(), savedAt: Date.now(), title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)) }
}
function makeCanvasVersion(canvas: SyncVerseCanvas): CanvasVersion {
  return { id: generateId(), savedAt: Date.now(), name: canvas.name, nodes: JSON.parse(JSON.stringify(canvas.nodes)), edges: JSON.parse(JSON.stringify(canvas.edges)) }
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface NotesStore {
  notes: Note[]
  activeNoteId: string | null
  customTags: string[]
  sidebarCollapsed: boolean
  searchQuery: string
  trash: TrashedItem[]
  lockedItems: Record<string, string>
  notebooks: Notebook[]
  canvases: SyncVerseCanvas[]
  activeCanvasId: string | null
  _uid: string | null
  _unsubs: Unsubscribe[]

  startSync: (uid: string) => void
  stopSync: () => void
  addNote: () => void
  updateNote: (id: string, updates: Partial<Note>) => void
  deleteNote: (id: string) => void
  setActiveNote: (id: string | null) => void
  togglePin: (id: string) => void
  saveVersion: (id: string) => void
  addCustomTag: (tag: string) => void
  removeCustomTag: (tag: string) => void
  toggleSidebar: () => void
  setSearchQuery: (q: string) => void
  moveToTrash: (id: string, type: 'note'|'canvas') => void
  restoreFromTrash: (id: string) => void
  permanentlyDelete: (id: string) => void
  emptyTrash: () => void
  lockItem: (id: string, password: string) => void
  unlockItem: (id: string) => void
  verifyLock: (id: string, password: string) => boolean
  addNotebook: (name: string) => void
  updateNotebook: (id: string, updates: Partial<Notebook>) => void
  deleteNotebook: (id: string) => void
  assignNoteToNotebook: (noteId: string, notebookId: string|undefined) => void
  assignCanvasToNotebook: (canvasId: string, notebookId: string|undefined) => void
  createCanvas: (fromNoteId?: string) => void
  updateCanvas: (id: string, updates: Partial<SyncVerseCanvas>) => void
  deleteCanvas: (id: string) => void
  setActiveCanvas: (id: string | null) => void
  saveCanvasVersion: (id: string) => void
}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [], activeNoteId: null, customTags: [], sidebarCollapsed: false,
      searchQuery: '', trash: [], lockedItems: {}, notebooks: [],
      canvases: [], activeCanvasId: null, _uid: null, _unsubs: [],

      // ── Sync ──────────────────────────────────────────────────────────────
      startSync: (uid) => {
        get()._unsubs.forEach(u => u())
        set({ _uid: uid })
        const { notes, notebooks, canvases, trash } = get()
        migrateLocalToFirestore(uid, notes, notebooks, canvases, trash).then(() => {
          const unsubs: Unsubscribe[] = []
          // ── Merge-aware listeners ──────────────────────────────────────
          // When Firestore fires a snapshot, prefer the LOCAL version if it is
          // NEWER than what Firestore returned. This prevents the common bug
          // where a snapshot from a previous save overwrites in-progress edits
          // that haven't been debounced to Firestore yet.
          unsubs.push(listenToNotes(uid, (incoming) => {
            const { notes: local } = get()
            const merged = incoming.map(inNote => {
              const loc = local.find(n => n.id === inNote.id)
              return (loc && loc.updatedAt > inNote.updatedAt) ? loc : inNote
            })
            const fsIds = new Set(incoming.map(n => n.id))
            const localOnly = local.filter(n => !fsIds.has(n.id))
            set({ notes: [...merged, ...localOnly].sort((a, b) => b.updatedAt - a.updatedAt) })
          }))

          unsubs.push(listenToNotebooks(uid, (n) =>
            set({ notebooks: n.sort((a, b) => a.createdAt - b.createdAt) })
          ))

          unsubs.push(listenToCanvases(uid, (incoming) => {
            const { canvases: local } = get()
            const merged = incoming.map(inCanvas => {
              const loc = local.find(c => c.id === inCanvas.id)
              return (loc && loc.updatedAt > inCanvas.updatedAt) ? loc : inCanvas
            })
            const fsIds = new Set(incoming.map(c => c.id))
            const localOnly = local.filter(c => !fsIds.has(c.id))
            set({ canvases: [...merged, ...localOnly].sort((a, b) => b.updatedAt - a.updatedAt) })
          }))

          unsubs.push(listenToTrash(uid, (t) =>
            set({ trash: t.sort((a, b) => b.deletedAt - a.deletedAt) })
          ))
          set({ _unsubs: unsubs })
        })
      },

      stopSync: () => { get()._unsubs.forEach(u => u()); set({ _uid: null, _unsubs: [] }) },

      // ── Notes ─────────────────────────────────────────────────────────────
      addNote: () => {
        const note: Note = {
          id: generateId(), title: 'Untitled', blocks: [], tags: [],
          pinned: false, linkedNotes: [], versions: [],
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ notes: [note, ...s.notes], activeNoteId: note.id }))
        const uid = get()._uid
        // New notes save immediately — no delay needed
        if (uid) saveNote(uid, note)
      },

      updateNote: (id, updates) => {
        if (updates.blocks) {
          updates.blocks = updates.blocks.map(b => {
            if (b.type === 'heading' && b.meta?._content !== undefined) {
              const { _content, ...restMeta } = b.meta
              return { ...b, content: _content, meta: restMeta }
            }
            return b
          })
        }
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n) }))
        const uid = get()._uid
        if (uid) {
          const note = get().notes.find(n => n.id === id)
          // Debounced: wait 5s after last keystroke before writing to Firestore
          if (note) scheduleNoteSave(uid, note)
        }
      },

      deleteNote: (id) => {
        const note = get().notes.find(n => n.id === id); if (!note) return
        const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
        set(s => ({ notes: s.notes.filter(n => n.id !== id), activeNoteId: s.activeNoteId === id ? null : s.activeNoteId, trash: [trashed, ...s.trash] }))
        const uid = get()._uid
        if (uid) { deleteNoteFromFirestore(uid, id); saveTrashItem(uid, trashed) }
      },

      // ── Save version + flush on note switch ───────────────────────────────
      setActiveNote: (id) => {
        const { activeNoteId, notes } = get()
        if (activeNoteId && activeNoteId !== id) {
          const current = notes.find(n => n.id === activeNoteId)
          if (current && current.blocks.length > 0) {
            const version = makeNoteVersion(current)
            const existing = current.versions || []
            const lastVersion = existing[0]
            const hasChanged = !lastVersion ||
              JSON.stringify(lastVersion.blocks) !== JSON.stringify(current.blocks) ||
              lastVersion.title !== current.title
            if (hasChanged) {
              const updatedNote = { ...current, versions: [version, ...existing].slice(0, MAX_VERSIONS) }
              set(s => ({ notes: s.notes.map(n => n.id === activeNoteId ? updatedNote : n) }))
              const uid = get()._uid
              // Flush immediately on note switch — don't wait for the timer
              if (uid) {
                clearTimeout(_noteTimers[activeNoteId])
                delete _noteTimers[activeNoteId]
                saveNote(uid, updatedNote)
              }
            }
          }
        }
        set({ activeNoteId: id })
      },

      togglePin: (id) => {
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) }))
        const uid = get()._uid
        if (uid) { const note = get().notes.find(n => n.id === id); if (note) saveNote(uid, note) }
      },

      saveVersion: (id) => {
        const note = get().notes.find(n => n.id === id); if (!note) return
        const version = makeNoteVersion(note)
        const updated = { ...note, versions: [version, ...note.versions].slice(0, MAX_VERSIONS) }
        set(s => ({ notes: s.notes.map(n => n.id === id ? updated : n) }))
        const uid = get()._uid; if (uid) saveNote(uid, updated)
      },

      addCustomTag: (tag) => {
        set(s => ({ customTags: [...s.customTags.filter(t => t !== tag), tag] }))
        const uid = get()._uid; if (uid) saveCustomTags(uid, get().customTags)
      },
      removeCustomTag: (tag) => {
        set(s => ({ customTags: s.customTags.filter(t => t !== tag) }))
        const uid = get()._uid; if (uid) saveCustomTags(uid, get().customTags)
      },
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchQuery: (q) => set({ searchQuery: q }),

      // ── Trash ─────────────────────────────────────────────────────────────
      moveToTrash: (id, type) => {
        const state = get(); const uid = state._uid
        if (type === 'note') {
          const note = state.notes.find(n => n.id === id); if (!note) return
          const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
          set(s => ({ notes: s.notes.filter(n => n.id !== id), activeNoteId: s.activeNoteId === id ? null : s.activeNoteId, trash: [trashed, ...s.trash] }))
          if (uid) { deleteNoteFromFirestore(uid, id); saveTrashItem(uid, trashed) }
        } else {
          const canvas = state.canvases.find(c => c.id === id); if (!canvas) return
          const trashed: TrashedItem = { id: generateId(), type: 'canvas', data: canvas, deletedAt: Date.now() }
          set(s => ({ canvases: s.canvases.filter(c => c.id !== id), activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId, trash: [trashed, ...s.trash] }))
          if (uid) { deleteCanvasFromFirestore(uid, id); saveTrashItem(uid, trashed) }
        }
      },
      restoreFromTrash: (trashedId) => {
        const item = get().trash.find(t => t.id === trashedId); if (!item) return
        const uid = get()._uid
        if (item.type === 'note') {
          set(s => ({ notes: [item.data as Note, ...s.notes], trash: s.trash.filter(t => t.id !== trashedId) }))
          if (uid) { saveNote(uid, item.data as Note); deleteTrashItem(uid, trashedId) }
        } else {
          set(s => ({ canvases: [item.data as SyncVerseCanvas, ...s.canvases], trash: s.trash.filter(t => t.id !== trashedId) }))
          if (uid) { saveCanvas(uid, item.data as SyncVerseCanvas); deleteTrashItem(uid, trashedId) }
        }
      },
      permanentlyDelete: (trashedId) => {
        set(s => ({ trash: s.trash.filter(t => t.id !== trashedId) }))
        const uid = get()._uid; if (uid) deleteTrashItem(uid, trashedId)
      },
      emptyTrash: () => {
        const ids = get().trash.map(t => t.id); set({ trash: [] })
        const uid = get()._uid; if (uid) emptyTrashInFirestore(uid, ids)
      },

      // ── Lock ──────────────────────────────────────────────────────────────
      lockItem: (id, password) => {
        const hash = btoa(password + id + 'synclyx_salt')
        set(s => ({ lockedItems: { ...s.lockedItems, [id]: hash } }))
      },
      unlockItem: (id) => set(s => { const { [id]: _, ...rest } = s.lockedItems; return { lockedItems: rest } }),
      verifyLock: (id, password) => {
        const stored = get().lockedItems[id]; if (!stored) return true
        return stored === btoa(password + id + 'synclyx_salt')
      },

      // ── Notebooks ─────────────────────────────────────────────────────────
      addNotebook: (name) => {
        const nb: Notebook = { id: generateId(), name, color: '#a833b9', createdAt: Date.now() }
        set(s => ({ notebooks: [...s.notebooks, nb] }))
        const uid = get()._uid; if (uid) saveNotebook(uid, nb)
      },
      updateNotebook: (id, updates) => {
        set(s => ({ notebooks: s.notebooks.map(nb => nb.id === id ? { ...nb, ...updates } : nb) }))
        const uid = get()._uid; if (uid) { const nb = get().notebooks.find(n => n.id === id); if (nb) saveNotebook(uid, nb) }
      },
      deleteNotebook: (id) => {
        set(s => ({
          notebooks: s.notebooks.filter(nb => nb.id !== id),
          notes: s.notes.map(n => n.notebookId === id ? { ...n, notebookId: undefined } : n),
          canvases: s.canvases.map(c => c.notebookId === id ? { ...c, notebookId: undefined } : c),
        }))
        const uid = get()._uid; if (uid) deleteNotebookFromFirestore(uid, id)
      },
      assignNoteToNotebook: (noteId, notebookId) => {
        set(s => ({ notes: s.notes.map(n => n.id === noteId ? { ...n, notebookId } : n) }))
        const uid = get()._uid; if (uid) { const note = get().notes.find(n => n.id === noteId); if (note) saveNote(uid, note) }
      },
      assignCanvasToNotebook: (canvasId, notebookId) => {
        set(s => ({ canvases: s.canvases.map(c => c.id === canvasId ? { ...c, notebookId } : c) }))
        const uid = get()._uid; if (uid) { const canvas = get().canvases.find(c => c.id === canvasId); if (canvas) saveCanvas(uid, canvas) }
      },

      // ── SyncVerse ─────────────────────────────────────────────────────────
      createCanvas: (fromNoteId) => {
        // Canvas limits per plan (Phase 4 will read from user profile)
        const CANVAS_LIMITS: Record<string, number> = { free: 10, basic: 20, pro: Infinity }
        const plan = 'free' // TODO Phase 4: read from Firestore user doc
        const limit = CANVAS_LIMITS[plan] ?? 10
        if (get().canvases.length >= limit) {
          window.dispatchEvent(new CustomEvent('synclyx:canvas-limit-reached', { detail: { plan, limit } }))
          return
        }
        const note = fromNoteId ? get().notes.find(n => n.id === fromNoteId) : null
        const nodes: SyncVerseNode[] = note
          ? note.blocks.map((block, i) => ({
              id: `node-${block.id}`, type: 'block' as SyncVerseNodeType,
              position: { x: 60 + (i % 3) * 340, y: 60 + Math.floor(i / 3) * 220 },
              data: { block },
            }))
          : []
        const canvas: SyncVerseCanvas = {
          id: generateId(), noteId: fromNoteId || '',
          name: note ? `${note.title} — Canvas` : 'New Canvas',
          nodes, edges: [], versions: [], viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ canvases: [canvas, ...s.canvases], activeCanvasId: canvas.id }))
        const uid = get()._uid; if (uid) saveCanvas(uid, canvas)
      },

      updateCanvas: (id, updates) => {
        set(s => ({ canvases: s.canvases.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c) }))
        const uid = get()._uid
        if (uid) {
          const canvas = get().canvases.find(c => c.id === id)
          // Debounced: wait 7s after last change before writing to Firestore
          if (canvas) scheduleCanvasSave(uid, canvas)
        }
      },

      deleteCanvas: (id) => {
        set(s => ({ canvases: s.canvases.filter(c => c.id !== id), activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId }))
        const uid = get()._uid; if (uid) deleteCanvasFromFirestore(uid, id)
      },

      // ── Save canvas version + flush on canvas switch ───────────────────────
      // Save a named version snapshot of a canvas on demand (called by 1.5min auto-timer)
      saveCanvasVersion: (id) => {
        const canvas = get().canvases.find(c => c.id === id)
        if (!canvas) return
        const existing = canvas.versions || []
        // Don't save duplicate — skip if nothing changed since last version
        const last = existing[0]
        if (last &&
          JSON.stringify(last.nodes) === JSON.stringify(canvas.nodes) &&
          JSON.stringify(last.edges) === JSON.stringify(canvas.edges)) return
        const version = makeCanvasVersion(canvas)
        const updated = { ...canvas, versions: [version, ...existing].slice(0, MAX_VERSIONS) }
        set(s => ({ canvases: s.canvases.map(c => c.id === id ? updated : c) }))
        const uid = get()._uid
        if (uid) saveCanvas(uid, updated)
      },

      setActiveCanvas: (id) => {
        const { activeCanvasId, canvases } = get()
        if (activeCanvasId && activeCanvasId !== id) {
          const current = canvases.find(c => c.id === activeCanvasId)
          if (current) {
            const version = makeCanvasVersion(current)
            const existing = current.versions || []
            const last = existing[0]
            const hasChanged = !last ||
              JSON.stringify(last.nodes) !== JSON.stringify(current.nodes) ||
              JSON.stringify(last.edges) !== JSON.stringify(current.edges)
            if (hasChanged) {
              const updatedCanvas = { ...current, versions: [version, ...existing].slice(0, MAX_VERSIONS) }
              set(s => ({ canvases: s.canvases.map(c => c.id === activeCanvasId ? updatedCanvas : c) }))
              const uid = get()._uid
              // Flush immediately on canvas switch
              if (uid) {
                clearTimeout(_canvasTimers[activeCanvasId])
                delete _canvasTimers[activeCanvasId]
                saveCanvas(uid, updatedCanvas)
              }
            }
          }
        }
        set({ activeCanvasId: id })
      },
    }),
    {
      name: 'synclyx-notes',
      version: 6,
      partialize: (s) => ({
        notes: s.notes, activeNoteId: s.activeNoteId, customTags: s.customTags,
        sidebarCollapsed: s.sidebarCollapsed, searchQuery: s.searchQuery,
        trash: s.trash, lockedItems: s.lockedItems, notebooks: s.notebooks,
        canvases: s.canvases, activeCanvasId: s.activeCanvasId,
      }),
      migrate: (p: any) => ({
        ...p,
        trash: p.trash ?? [], lockedItems: p.lockedItems ?? {},
        notebooks: p.notebooks ?? [], canvases: p.canvases ?? [],
        customTags: p.customTags ?? [], searchQuery: p.searchQuery ?? '',
        sidebarCollapsed: p.sidebarCollapsed ?? false, activeCanvasId: p.activeCanvasId ?? null,
      }),
    }
  )
)
