import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

// ─── SyncVerse Types ──────────────────────────────────────────────────────────
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

  // Trash
  moveToTrash: (id: string, type: 'note' | 'canvas') => void
  restoreFromTrash: (id: string) => void
  permanentlyDelete: (id: string) => void
  emptyTrash: () => void

  // Lock
  lockItem: (id: string, password: string) => void
  unlockItem: (id: string) => void
  verifyLock: (id: string, password: string) => boolean

  // Notebooks
  addNotebook: (name: string) => void
  updateNotebook: (id: string, updates: Partial<Notebook>) => void
  deleteNotebook: (id: string) => void
  assignNoteToNotebook: (noteId: string, notebookId: string | undefined) => void
  assignCanvasToNotebook: (canvasId: string, notebookId: string | undefined) => void

  // SyncVerse
  createCanvas: (fromNoteId?: string) => void
  updateCanvas: (id: string, updates: Partial<SyncVerseCanvas>) => void
  deleteCanvas: (id: string) => void
  setActiveCanvas: (id: string | null) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)

const versionTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [], activeNoteId: null, customTags: [], sidebarCollapsed: false,
      searchQuery: '', trash: [], lockedItems: {}, notebooks: [],
      canvases: [], activeCanvasId: null,

      addNote: () => {
        const newNote: Note = {
          id: generateId(), title: 'Untitled', blocks: [], tags: [],
          pinned: false, linkedNotes: [], versions: [],
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ notes: [newNote, ...s.notes], activeNoteId: newNote.id }))
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
        if (versionTimers[id]) clearTimeout(versionTimers[id])
        versionTimers[id] = setTimeout(() => {
          const note = get().notes.find(n => n.id === id)
          if (!note) return
          const version: NoteVersion = {
            id: generateId(), savedAt: Date.now(),
            title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)),
          }
          set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, versions: [version, ...n.versions].slice(0, 30) } : n) }))
        }, 3000)
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
      },

      setActiveNote: (id) => set({ activeNoteId: id }),

      togglePin: (id) => set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) })),

      saveVersion: (id) => {
        const note = get().notes.find(n => n.id === id)
        if (!note) return
        const version: NoteVersion = {
          id: generateId(), savedAt: Date.now(),
          title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)),
        }
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, versions: [version, ...n.versions].slice(0, 20) } : n) }))
      },

      addCustomTag: (tag) => set(s => ({ customTags: [...s.customTags.filter(t => t !== tag), tag] })),
      removeCustomTag: (tag) => set(s => ({ customTags: s.customTags.filter(t => t !== tag) })),
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchQuery: (q) => set({ searchQuery: q }),

      // ── Trash ──────────────────────────────────────────────────────────────
      moveToTrash: (id, type) => {
        const state = get()
        if (type === 'note') {
          const note = state.notes.find(n => n.id === id)
          if (!note) return
          const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
          set(s => ({
            notes: s.notes.filter(n => n.id !== id),
            activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
            trash: [trashed, ...s.trash],
          }))
        } else {
          const canvas = state.canvases.find(c => c.id === id)
          if (!canvas) return
          const trashed: TrashedItem = { id: generateId(), type: 'canvas', data: canvas, deletedAt: Date.now() }
          set(s => ({
            canvases: s.canvases.filter(c => c.id !== id),
            activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId,
            trash: [trashed, ...s.trash],
          }))
        }
      },

      restoreFromTrash: (trashedId) => {
        const item = get().trash.find(t => t.id === trashedId)
        if (!item) return
        if (item.type === 'note') {
          set(s => ({ notes: [item.data as Note, ...s.notes], trash: s.trash.filter(t => t.id !== trashedId) }))
        } else {
          set(s => ({ canvases: [item.data as SyncVerseCanvas, ...s.canvases], trash: s.trash.filter(t => t.id !== trashedId) }))
        }
      },

      permanentlyDelete: (trashedId) => set(s => ({ trash: s.trash.filter(t => t.id !== trashedId) })),
      emptyTrash: () => set({ trash: [] }),

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
      },
      updateNotebook: (id, updates) => set(s => ({ notebooks: s.notebooks.map(nb => nb.id === id ? { ...nb, ...updates } : nb) })),
      deleteNotebook: (id) => set(s => ({
        notebooks: s.notebooks.filter(nb => nb.id !== id),
        notes: s.notes.map(n => n.notebookId === id ? { ...n, notebookId: undefined } : n),
        canvases: s.canvases.map(c => c.notebookId === id ? { ...c, notebookId: undefined } : c),
      })),
      assignNoteToNotebook: (noteId, notebookId) => set(s => ({ notes: s.notes.map(n => n.id === noteId ? { ...n, notebookId } : n) })),
      assignCanvasToNotebook: (canvasId, notebookId) => set(s => ({ canvases: s.canvases.map(c => c.id === canvasId ? { ...c, notebookId } : c) })),

      // ── SyncVerse ──────────────────────────────────────────────────────────
      createCanvas: (fromNoteId) => {
        const note = fromNoteId ? get().notes.find(n => n.id === fromNoteId) : null
        const nodes: SyncVerseNode[] = note
          ? note.blocks.map((block, i) => ({
              id: `node-${block.id}`,
              type: 'block' as SyncVerseNodeType,
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
      },

      updateCanvas: (id, updates) => set(s => ({
        canvases: s.canvases.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c)
      })),

      deleteCanvas: (id) => set(s => ({
        canvases: s.canvases.filter(c => c.id !== id),
        activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId,
      })),

      setActiveCanvas: (id) => set({ activeCanvasId: id }),
    }),
    {
      name: 'synclyx-notes',
      version: 3,
      migrate: (persistedState: any) => ({
        ...persistedState,
        trash: persistedState.trash ?? [],
        lockedItems: persistedState.lockedItems ?? {},
        notebooks: persistedState.notebooks ?? [],
        canvases: persistedState.canvases ?? [],
        customTags: persistedState.customTags ?? [],
        searchQuery: persistedState.searchQuery ?? '',
        sidebarCollapsed: persistedState.sidebarCollapsed ?? false,
        activeCanvasId: persistedState.activeCanvasId ?? null,
      }),
    }
  )
)
