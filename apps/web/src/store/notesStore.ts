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

export type BlockType = 'text' | 'code' | 'image' | 'link' | 'video' | 'audio' | 'file' | 'table' | 'checklist' | 'heading' | 'list'

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
  id: string; type: 'note' | 'canvas'; data: Note | SyncVerseCanvas; deletedAt: number
}

export type SyncVerseNodeType = 'block' | 'note' | 'sticky' | 'shape' | 'group'

export interface SyncVerseNode {
  id: string; type: SyncVerseNodeType
  position: { x: number; y: number }
  data: { block?: Block; noteId?: string; label?: string; color?: string; collapsed?: boolean }
  width?: number; height?: number
}

export interface SyncVerseEdge {
  id: string; source: string; target: string
  label?: string; animated?: boolean
}

export interface SyncVerseCanvas {
  id: string; noteId: string; name: string; notebookId?: string
  nodes: SyncVerseNode[]; edges: SyncVerseEdge[]
  viewport: { x: number; y: number; zoom: number }
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
  moveToTrash: (id: string, type: 'note' | 'canvas') => void
  restoreFromTrash: (id: string) => void
  permanentlyDelete: (id: string) => void
  emptyTrash: () => void
  lockItem: (id: string, password: string) => void
  unlockItem: (id: string) => void
  verifyLock: (id: string, password: string) => boolean
  addNotebook: (name: string) => void
  updateNotebook: (id: string, updates: Partial<Notebook>) => void
  deleteNotebook: (id: string) => void
  assignNoteToNotebook: (noteId: string, notebookId: string | undefined) => void
  assignCanvasToNotebook: (canvasId: string, notebookId: string | undefined) => void
  createCanvas: (fromNoteId?: string) => void
  updateCanvas: (id: string, updates: Partial<SyncVerseCanvas>) => void
  deleteCanvas: (id: string) => void
  setActiveCanvas: (id: string | null) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)
const versionTimers: Record<string, ReturnType<typeof setTimeout>> = {}

// ─── Local → Firestore migration ─────────────────────────────────────────────
// Called once on first sign-in. Batches existing local data up to Firestore
// so the subsequent onSnapshot listeners find the data and don't wipe local state.
async function migrateLocalToFirestore(
  uid: string,
  notes: Note[], notebooks: Notebook[],
  canvases: SyncVerseCanvas[], trash: TrashedItem[]
) {
  try {
    // Quick check: if user already has notes in Firestore, skip migration
    const existing = await getDocs(query(collection(db, 'users', uid, 'notes'), limit(1)))
    if (!existing.empty) return // Returning user — Firestore is the source of truth

    const items = [
      ...notes.map(d => ({ col: 'notes', id: d.id, data: d as object })),
      ...notebooks.map(d => ({ col: 'notebooks', id: d.id, data: d as object })),
      ...canvases.map(d => ({ col: 'canvases', id: d.id, data: d as object })),
      ...trash.map(d => ({ col: 'trash', id: d.id, data: d as object })),
    ]

    if (items.length === 0) return

    const CHUNK = 400 // Firestore batch limit is 500
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = writeBatch(db)
      items.slice(i, i + CHUNK).forEach(({ col, id, data }) => {
        batch.set(doc(db, 'users', uid, col, id), data)
      })
      await batch.commit()
    }
  } catch (e) {
    console.warn('[Synclyx] Local data migration failed — will retry on next sign-in:', e)
  }
}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [], activeNoteId: null, customTags: [], sidebarCollapsed: false,
      searchQuery: '', trash: [], lockedItems: {}, notebooks: [],
      canvases: [], activeCanvasId: null,
      _uid: null, _unsubs: [],

      // ── Sync ──────────────────────────────────────────────────────────────
      startSync: (uid) => {
        get()._unsubs.forEach(u => u())
        set({ _uid: uid })

        // Snapshot local data BEFORE any async work so we have a stable copy
        const { notes, notebooks, canvases, trash } = get()

        // Migrate local data first, then start listeners.
        // This prevents the listeners from firing with empty Firestore data
        // and overwriting notes the user created before signing in.
        migrateLocalToFirestore(uid, notes, notebooks, canvases, trash).then(() => {
          const unsubs: Unsubscribe[] = []
          unsubs.push(listenToNotes(uid, (n) => set({ notes: n.sort((a, b) => b.updatedAt - a.updatedAt) })))
          unsubs.push(listenToNotebooks(uid, (n) => set({ notebooks: n.sort((a, b) => a.createdAt - b.createdAt) })))
          unsubs.push(listenToCanvases(uid, (c) => set({ canvases: c.sort((a, b) => b.updatedAt - a.updatedAt) })))
          unsubs.push(listenToTrash(uid, (t) => set({ trash: t.sort((a, b) => b.deletedAt - a.deletedAt) })))
          set({ _unsubs: unsubs })
        })
      },

      stopSync: () => {
        get()._unsubs.forEach(u => u())
        set({ _uid: null, _unsubs: [] })
      },

      // ── Notes ──────────────────────────────────────────────────────────────
      addNote: () => {
        const note: Note = {
          id: generateId(), title: 'Untitled', blocks: [], tags: [],
          pinned: false, linkedNotes: [], versions: [],
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ notes: [note, ...s.notes], activeNoteId: note.id }))
        const uid = get()._uid
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
        set(s => ({
          notes: s.notes.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n)
        }))

        if (versionTimers[id]) clearTimeout(versionTimers[id])
        versionTimers[id] = setTimeout(() => {
          const note = get().notes.find(n => n.id === id)
          if (!note) return
          const version: NoteVersion = {
            id: generateId(), savedAt: Date.now(),
            title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)),
          }
          const updated = { ...note, versions: [version, ...note.versions].slice(0, 30) }
          set(s => ({ notes: s.notes.map(n => n.id === id ? updated : n) }))
          const uid = get()._uid
          if (uid) saveNote(uid, updated)
        }, 3000)

        const uid = get()._uid
        if (uid) {
          const note = get().notes.find(n => n.id === id)
          if (note) saveNote(uid, note)
        }
      },

      deleteNote: (id) => {
        const note = get().notes.find(n => n.id === id)
        if (!note) return
        const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
        set(s => ({
          notes: s.notes.filter(n => n.id !== id),
          activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
          trash: [trashed, ...s.trash],
        }))
        const uid = get()._uid
        if (uid) { deleteNoteFromFirestore(uid, id); saveTrashItem(uid, trashed) }
      },

      setActiveNote: (id) => set({ activeNoteId: id }),

      togglePin: (id) => {
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) }))
        const uid = get()._uid
        if (uid) { const note = get().notes.find(n => n.id === id); if (note) saveNote(uid, note) }
      },

      saveVersion: (id) => {
        const note = get().notes.find(n => n.id === id)
        if (!note) return
        const version: NoteVersion = {
          id: generateId(), savedAt: Date.now(),
          title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)),
        }
        const updated = { ...note, versions: [version, ...note.versions].slice(0, 20) }
        set(s => ({ notes: s.notes.map(n => n.id === id ? updated : n) }))
        const uid = get()._uid
        if (uid) saveNote(uid, updated)
      },

      addCustomTag: (tag) => {
        set(s => ({ customTags: [...s.customTags.filter(t => t !== tag), tag] }))
        const uid = get()._uid
        if (uid) saveCustomTags(uid, get().customTags)
      },

      removeCustomTag: (tag) => {
        set(s => ({ customTags: s.customTags.filter(t => t !== tag) }))
        const uid = get()._uid
        if (uid) saveCustomTags(uid, get().customTags)
      },

      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchQuery: (q) => set({ searchQuery: q }),

      // ── Trash ──────────────────────────────────────────────────────────────
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
        const uid = get()._uid
        if (uid) deleteTrashItem(uid, trashedId)
      },

      emptyTrash: () => {
        const ids = get().trash.map(t => t.id)
        set({ trash: [] })
        const uid = get()._uid
        if (uid) emptyTrashInFirestore(uid, ids)
      },

      // ── Lock ───────────────────────────────────────────────────────────────
      lockItem: (id, password) => {
        const hash = btoa(password + id + 'synclyx_salt')
        set(s => ({ lockedItems: { ...s.lockedItems, [id]: hash } }))
      },
      unlockItem: (id) => set(s => { const { [id]: _, ...rest } = s.lockedItems; return { lockedItems: rest } }),
      verifyLock: (id, password) => {
        const stored = get().lockedItems[id]
        if (!stored) return true
        return stored === btoa(password + id + 'synclyx_salt')
      },

      // ── Notebooks ──────────────────────────────────────────────────────────
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

      // ── SyncVerse ──────────────────────────────────────────────────────────
      createCanvas: (fromNoteId) => {
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
          nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ canvases: [canvas, ...s.canvases], activeCanvasId: canvas.id }))
        const uid = get()._uid; if (uid) saveCanvas(uid, canvas)
      },

      updateCanvas: (id, updates) => {
        set(s => ({
          canvases: s.canvases.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c)
        }))
        const uid = get()._uid
        if (uid) { const canvas = get().canvases.find(c => c.id === id); if (canvas) saveCanvas(uid, canvas) }
      },

      deleteCanvas: (id) => {
        set(s => ({
          canvases: s.canvases.filter(c => c.id !== id),
          activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId,
        }))
        const uid = get()._uid; if (uid) deleteCanvasFromFirestore(uid, id)
      },

      setActiveCanvas: (id) => set({ activeCanvasId: id }),
    }),
    {
      name: 'synclyx-notes',
      version: 4,
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
