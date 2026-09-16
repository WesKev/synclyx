import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { doc, collection, writeBatch, getDocs, query, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  listenToNotes, listenToNotebooks, listenToCanvases, listenToTrash,
} from '../lib/firestoreSync'
import { queueWrite, queueDelete, flushAll, isPending } from '../lib/syncEngine'

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
  /** SyncPad note holding editable copies of this canvas's table/code blocks.
   *  Created lazily the first time the user clicks "Edit in SyncPad". */
  companionNoteId?: string
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
const NOTE_CONTENT_DEBOUNCE = 800     // typing inside a note
const CANVAS_COSMETIC_DEBOUNCE = 800  // viewport pan/zoom, rename — not structural

const generateId = () => Math.random().toString(36).slice(2, 10)

function makeNoteVersion(note: Note): NoteVersion {
  return { id: generateId(), savedAt: Date.now(), title: note.title, blocks: JSON.parse(JSON.stringify(note.blocks)) }
}
function makeCanvasVersion(canvas: SyncVerseCanvas): CanvasVersion {
  return { id: generateId(), savedAt: Date.now(), name: canvas.name, nodes: JSON.parse(JSON.stringify(canvas.nodes)), edges: JSON.parse(JSON.stringify(canvas.edges)) }
}

// ─── Local → Firestore migration (first sign-in only) ─────────────────────────
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
  _unsubs: (() => void)[]
  /** True once the FIRST Firestore snapshot for notes has landed this session.
   *  Prevents writing empty/stale local state over real cloud data during the
   *  brief window right after sign-in, before the real data has arrived. */
  _notesHydrated: boolean
  _canvasesHydrated: boolean

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
  /** Save a version snapshot. Call ONLY on canvas switch or manual save —
   *  never on mount / auto-timer. See SyncVerse.tsx for why. */
  saveCanvasVersion: (id: string) => void
  /** Find (or create on first use) the SyncPad note that holds the editable
   *  copies of a canvas's table and code blocks. Returns the note id. */
  getOrCreateCompanionNote: (canvasId: string) => string | null
}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [], activeNoteId: null, customTags: [], sidebarCollapsed: false,
      searchQuery: '', trash: [], lockedItems: {}, notebooks: [],
      canvases: [], activeCanvasId: null, _uid: null, _unsubs: [],
      _notesHydrated: false, _canvasesHydrated: false,

      // ── Sync ──────────────────────────────────────────────────────────────
      startSync: (uid) => {
        get()._unsubs.forEach(u => u())
        set({ _uid: uid, _notesHydrated: false, _canvasesHydrated: false })
        const { notes, notebooks, canvases, trash } = get()

        migrateLocalToFirestore(uid, notes, notebooks, canvases, trash).then(() => {
          const unsubs: (() => void)[] = []

          // ── Notes listener ───────────────────────────────────────────────
          // Pending-write-aware merge: if we have an unconfirmed local write
          // for a note, trust local over whatever Firestore just sent — the
          // snapshot may be a round-trip echo of an OLDER write, or simply
          // arrive before our newer write has been acknowledged.
          unsubs.push(listenToNotes(uid, (incoming) => {
            const { notes: local } = get()
            const merged = incoming.map(inNote => {
              if (isPending(['users', uid, 'notes', inNote.id])) {
                const loc = local.find(n => n.id === inNote.id)
                if (loc) return loc
              }
              return inNote
            })
            const fsIds = new Set(incoming.map(n => n.id))
            // Local-only notes = created but not yet confirmed by Firestore, OR
            // genuinely local (shouldn't normally happen once hydrated, but
            // protects against any edge case where a note briefly isn't in
            // the snapshot yet).
            const localOnly = local.filter(n => !fsIds.has(n.id) && isPending(['users', uid, 'notes', n.id]))
            set({
              notes: [...merged, ...localOnly].sort((a, b) => b.updatedAt - a.updatedAt),
              _notesHydrated: true,
            })
          }))

          unsubs.push(listenToNotebooks(uid, (n) =>
            set({ notebooks: n.sort((a, b) => a.createdAt - b.createdAt) })
          ))

          // ── Canvases listener — same pending-aware merge ─────────────────
          unsubs.push(listenToCanvases(uid, (incoming) => {
            const { canvases: local } = get()
            const merged = incoming.map(inCanvas => {
              if (isPending(['users', uid, 'canvases', inCanvas.id])) {
                const loc = local.find(c => c.id === inCanvas.id)
                if (loc) return loc
              }
              return inCanvas
            })
            const fsIds = new Set(incoming.map(c => c.id))
            const localOnly = local.filter(c => !fsIds.has(c.id) && isPending(['users', uid, 'canvases', c.id]))
            set({
              canvases: [...merged, ...localOnly].sort((a, b) => b.updatedAt - a.updatedAt),
              _canvasesHydrated: true,
            })
          }))

          // ── Trash listener — this is what makes deletes propagate across
          // devices. Any device deleting a note/canvas writes here; every
          // other signed-in device sees it appear (and the original list
          // shrink) within about a second. ─────────────────────────────────
          unsubs.push(listenToTrash(uid, (t) =>
            set({ trash: t.sort((a, b) => b.deletedAt - a.deletedAt) })
          ))

          set({ _unsubs: unsubs })
        })
      },

      stopSync: () => {
        get()._unsubs.forEach(u => u())
        set({ _uid: null, _unsubs: [], _notesHydrated: false, _canvasesHydrated: false })
      },

      // ── Notes ─────────────────────────────────────────────────────────────
      addNote: () => {
        const note: Note = {
          id: generateId(), title: 'Untitled', blocks: [], tags: [],
          pinned: false, linkedNotes: [], versions: [],
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ notes: [note, ...s.notes], activeNoteId: note.id }))
        const uid = get()._uid
        // Brand new doc — safe to write immediately, nothing to overwrite
        if (uid) queueWrite(['users', uid, 'notes', note.id], note, 0)
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
        if (!uid) return
        const note = get().notes.find(n => n.id === id)
        if (!note) return
        // Short debounce for typing — the pending-write guard on the listener
        // protects this from being overwritten while it's queued.
        queueWrite(['users', uid, 'notes', id], note, NOTE_CONTENT_DEBOUNCE)

        // ── Companion note → canvas reverse sync ───────────────────────────
        // If this note is a canvas's companion, push any edited table/code
        // blocks back onto the matching canvas nodes, so the read-only views
        // in SyncVerse stay current with what the user just typed here.
        if (updates.blocks) {
          const owningCanvas = get().canvases.find(c => c.companionNoteId === id)
          if (owningCanvas) {
            const blockById = new Map(note.blocks.map(b => [b.id, b]))
            let changed = false
            const newNodes = owningCanvas.nodes.map(n => {
              const nb = n.data?.block
              if (!nb || (nb.type !== 'table' && nb.type !== 'code')) return n
              const edited = blockById.get(nb.id)
              if (!edited) return n
              if (JSON.stringify(edited) === JSON.stringify(nb)) return n
              changed = true
              return { ...n, data: { ...n.data, block: JSON.parse(JSON.stringify(edited)) } }
            })
            if (changed) {
              const updatedCanvas = { ...owningCanvas, nodes: newNodes, updatedAt: Date.now() }
              set(s => ({ canvases: s.canvases.map(c => c.id === owningCanvas.id ? updatedCanvas : c) }))
              queueWrite(['users', uid, 'canvases', owningCanvas.id], updatedCanvas, NOTE_CONTENT_DEBOUNCE)
            }
          }
        }
      },

      deleteNote: (id) => {
        const note = get().notes.find(n => n.id === id); if (!note) return
        const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
        set(s => ({ notes: s.notes.filter(n => n.id !== id), activeNoteId: s.activeNoteId === id ? null : s.activeNoteId, trash: [trashed, ...s.trash] }))
        const uid = get()._uid
        if (uid) {
          queueDelete(['users', uid, 'notes', id])
          queueWrite(['users', uid, 'trash', trashed.id], trashed, 0)
        }
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
              if (uid) queueWrite(['users', uid, 'notes', activeNoteId], updatedNote, 0) // immediate on switch
            }
          }
        }
        set({ activeNoteId: id })
      },

      togglePin: (id) => {
        set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) }))
        const uid = get()._uid
        if (uid) { const note = get().notes.find(n => n.id === id); if (note) queueWrite(['users', uid, 'notes', id], note, 0) }
      },

      saveVersion: (id) => {
        const note = get().notes.find(n => n.id === id); if (!note) return
        const version = makeNoteVersion(note)
        const updated = { ...note, versions: [version, ...note.versions].slice(0, MAX_VERSIONS) }
        set(s => ({ notes: s.notes.map(n => n.id === id ? updated : n) }))
        const uid = get()._uid; if (uid) queueWrite(['users', uid, 'notes', id], updated, 0)
      },

      addCustomTag: (tag) => {
        set(s => ({ customTags: [...s.customTags.filter(t => t !== tag), tag] }))
        const uid = get()._uid
        if (uid) queueWrite(['users', uid, 'meta', 'settings'], { customTags: get().customTags }, 0)
      },
      removeCustomTag: (tag) => {
        set(s => ({ customTags: s.customTags.filter(t => t !== tag) }))
        const uid = get()._uid
        if (uid) queueWrite(['users', uid, 'meta', 'settings'], { customTags: get().customTags }, 0)
      },
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchQuery: (q) => set({ searchQuery: q }),

      // ── Trash — always immediate, always propagates cross-device ──────────
      moveToTrash: (id, type) => {
        const state = get(); const uid = state._uid
        if (type === 'note') {
          const note = state.notes.find(n => n.id === id); if (!note) return
          const trashed: TrashedItem = { id: generateId(), type: 'note', data: note, deletedAt: Date.now() }
          set(s => ({ notes: s.notes.filter(n => n.id !== id), activeNoteId: s.activeNoteId === id ? null : s.activeNoteId, trash: [trashed, ...s.trash] }))
          if (uid) { queueDelete(['users', uid, 'notes', id]); queueWrite(['users', uid, 'trash', trashed.id], trashed, 0) }
        } else {
          const canvas = state.canvases.find(c => c.id === id); if (!canvas) return
          const trashed: TrashedItem = { id: generateId(), type: 'canvas', data: canvas, deletedAt: Date.now() }
          set(s => ({ canvases: s.canvases.filter(c => c.id !== id), activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId, trash: [trashed, ...s.trash] }))
          if (uid) { queueDelete(['users', uid, 'canvases', id]); queueWrite(['users', uid, 'trash', trashed.id], trashed, 0) }
        }
      },

      restoreFromTrash: (trashedId) => {
        const item = get().trash.find(t => t.id === trashedId); if (!item) return
        const uid = get()._uid
        if (item.type === 'note') {
          set(s => ({ notes: [item.data as Note, ...s.notes], trash: s.trash.filter(t => t.id !== trashedId) }))
          if (uid) { queueWrite(['users', uid, 'notes', (item.data as Note).id], item.data, 0); queueDelete(['users', uid, 'trash', trashedId]) }
        } else {
          set(s => ({ canvases: [item.data as SyncVerseCanvas, ...s.canvases], trash: s.trash.filter(t => t.id !== trashedId) }))
          if (uid) { queueWrite(['users', uid, 'canvases', (item.data as SyncVerseCanvas).id], item.data, 0); queueDelete(['users', uid, 'trash', trashedId]) }
        }
      },

      permanentlyDelete: (trashedId) => {
        set(s => ({ trash: s.trash.filter(t => t.id !== trashedId) }))
        const uid = get()._uid
        if (uid) queueDelete(['users', uid, 'trash', trashedId])
      },

      emptyTrash: () => {
        const ids = get().trash.map(t => t.id)
        set({ trash: [] })
        const uid = get()._uid
        if (uid) ids.forEach(id => queueDelete(['users', uid, 'trash', id]))
      },

      // ── Lock (local only — never synced, passwords stay on-device) ────────
      lockItem: (id, password) => {
        const hash = btoa(password + id + 'synclyx_salt')
        set(s => ({ lockedItems: { ...s.lockedItems, [id]: hash } }))
      },
      unlockItem: (id) => set(s => { const { [id]: _, ...rest } = s.lockedItems; return { lockedItems: rest } }),
      verifyLock: (id, password) => {
        const stored = get().lockedItems[id]; if (!stored) return true
        return stored === btoa(password + id + 'synclyx_salt')
      },

      // ── Notebooks ──────────────────────────────────────────────────────────
      addNotebook: (name) => {
        const nb: Notebook = { id: generateId(), name, color: '#a833b9', createdAt: Date.now() }
        set(s => ({ notebooks: [...s.notebooks, nb] }))
        const uid = get()._uid; if (uid) queueWrite(['users', uid, 'notebooks', nb.id], nb, 0)
      },
      updateNotebook: (id, updates) => {
        set(s => ({ notebooks: s.notebooks.map(nb => nb.id === id ? { ...nb, ...updates } : nb) }))
        const uid = get()._uid
        if (uid) { const nb = get().notebooks.find(n => n.id === id); if (nb) queueWrite(['users', uid, 'notebooks', id], nb, 0) }
      },
      deleteNotebook: (id) => {
        set(s => ({
          notebooks: s.notebooks.filter(nb => nb.id !== id),
          notes: s.notes.map(n => n.notebookId === id ? { ...n, notebookId: undefined } : n),
          canvases: s.canvases.map(c => c.notebookId === id ? { ...c, notebookId: undefined } : c),
        }))
        const uid = get()._uid; if (uid) queueDelete(['users', uid, 'notebooks', id])
      },
      assignNoteToNotebook: (noteId, notebookId) => {
        set(s => ({ notes: s.notes.map(n => n.id === noteId ? { ...n, notebookId } : n) }))
        const uid = get()._uid
        if (uid) { const note = get().notes.find(n => n.id === noteId); if (note) queueWrite(['users', uid, 'notes', noteId], note, 0) }
      },
      assignCanvasToNotebook: (canvasId, notebookId) => {
        set(s => ({ canvases: s.canvases.map(c => c.id === canvasId ? { ...c, notebookId } : c) }))
        const uid = get()._uid
        if (uid) { const canvas = get().canvases.find(c => c.id === canvasId); if (canvas) queueWrite(['users', uid, 'canvases', canvasId], canvas, 0) }
      },

      // ── SyncVerse ──────────────────────────────────────────────────────────
      createCanvas: (fromNoteId) => {
        const CANVAS_LIMITS: Record<string, number> = { free: 10, basic: 20, pro: Infinity }
        const plan = 'free' // TODO Phase 4: read from Firestore user doc
        const limit = CANVAS_LIMITS[plan] ?? 10
        if (get().canvases.length >= limit) {
          window.dispatchEvent(new CustomEvent('synclyx:canvas-limit-reached', { detail: { plan, limit } }))
          return
        }

        const note = fromNoteId ? get().notes.find(n => n.id === fromNoteId) : null

        // ── Default naming: "S-Verse 1", "S-Verse 2", ... ──────────────────
        // Canvases created FROM a note keep the note-title-based name (more
        // useful than a generic number). Canvases created blank get the
        // next available S-Verse number.
        let name: string
        if (note) {
          name = `${note.title || 'Untitled'} — Canvas`
        } else {
          const existingNums = get().canvases
            .map(c => c.name.match(/^S-Verse (\d+)$/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map(m => parseInt(m[1], 10))
          const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
          name = `S-Verse ${nextNum}`
        }

        // Shifted right so the first node doesn't spawn tucked under the sidebar
        const NODE_BASE_X = 160
        const NODE_BASE_Y = 80

        const nodes: SyncVerseNode[] = note
          ? note.blocks.map((block, i) => ({
              id: `node-${block.id}`, type: 'block' as SyncVerseNodeType,
              position: { x: NODE_BASE_X + (i % 3) * 340, y: NODE_BASE_Y + Math.floor(i / 3) * 220 },
              data: { block },
            }))
          : []

        const canvas: SyncVerseCanvas = {
          id: generateId(), noteId: fromNoteId || '', name,
          nodes, edges: [], versions: [],
          // Shifted viewport so panning starts a bit right/down of the top-left
          // corner, away from the SyncVerse sidebar edge.
          viewport: { x: 100, y: 60, zoom: 1 },
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ canvases: [canvas, ...s.canvases], activeCanvasId: canvas.id }))
        const uid = get()._uid
        // Brand new doc — safe to write immediately
        if (uid) queueWrite(['users', uid, 'canvases', canvas.id], canvas, 0)
      },

      updateCanvas: (id, updates) => {
        set(s => ({ canvases: s.canvases.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c) }))
        const uid = get()._uid
        if (!uid) return
        // Never write to Firestore before we've received the real data for
        // this session — otherwise we risk overwriting real cloud content
        // with whatever (possibly empty) local/cached state we started with.
        if (!get()._canvasesHydrated) return
        const canvas = get().canvases.find(c => c.id === id)
        if (!canvas) return
        // Structural changes (nodes/edges) → immediate. This is what makes
        // near-real-time sync across browsers/devices actually work.
        // Cosmetic changes (viewport, rename) → short debounce.
        const isStructural = updates.nodes !== undefined || updates.edges !== undefined
        queueWrite(['users', uid, 'canvases', id], canvas, isStructural ? 0 : CANVAS_COSMETIC_DEBOUNCE)
      },

      deleteCanvas: (id) => {
        set(s => ({ canvases: s.canvases.filter(c => c.id !== id), activeCanvasId: s.activeCanvasId === id ? null : s.activeCanvasId }))
        const uid = get()._uid; if (uid) queueDelete(['users', uid, 'canvases', id])
      },

      // Version snapshot — called ONLY from canvas-switch (below) and from
      // SyncVerse.tsx's manual "Save now" button. Never on mount, never on
      // a timer. This is the fix for the cross-browser data-loss bug.
      saveCanvasVersion: (id) => {
        if (!get()._canvasesHydrated) return // never version pre-hydration data
        const canvas = get().canvases.find(c => c.id === id)
        if (!canvas) return
        const existing = canvas.versions || []
        const last = existing[0]
        if (last &&
          JSON.stringify(last.nodes) === JSON.stringify(canvas.nodes) &&
          JSON.stringify(last.edges) === JSON.stringify(canvas.edges)) return
        const version = makeCanvasVersion(canvas)
        const updated = { ...canvas, versions: [version, ...existing].slice(0, MAX_VERSIONS) }
        set(s => ({ canvases: s.canvases.map(c => c.id === id ? updated : c) }))
        const uid = get()._uid
        if (uid) queueWrite(['users', uid, 'canvases', id], updated, 0)
      },

      // ── Companion note ────────────────────────────────────────────────────
      // Tables and code blocks are read-only on the canvas (editing a live
      // spreadsheet or code editor inside React Flow fights the canvas for
      // pointer/keyboard events). Instead, the first time the user clicks
      // "Edit in SyncPad" on any table/code node, we create ONE note per
      // canvas that holds editable copies of all of them.
      //
      // Lazy by design: no companion notes clutter the SyncPad sidebar for
      // canvases you never edit tables/code on.
      getOrCreateCompanionNote: (canvasId) => {
        const canvas = get().canvases.find(c => c.id === canvasId)
        if (!canvas) return null

        // Already exists and still present? Refresh its blocks from the canvas
        // and reuse it.
        const existing = canvas.companionNoteId
          ? get().notes.find(n => n.id === canvas.companionNoteId)
          : undefined

        // Pull every table/code block currently on the canvas
        const sourceBlocks: Block[] = canvas.nodes
          .filter(n => n.data?.block && (n.data.block.type === 'table' || n.data.block.type === 'code'))
          .map(n => JSON.parse(JSON.stringify(n.data.block as Block)))

        const intro: Block = {
          id: generateId(),
          type: 'text',
          content: `Companion note for "${canvas.name}" — edit the tables and code editors below. Changes sync back to the canvas.`,
          createdAt: Date.now(),
        }

        if (existing) {
          // Merge: keep blocks the user already has (so their edits survive),
          // append any canvas blocks that aren't in the note yet.
          const existingIds = new Set(existing.blocks.map(b => b.id))
          const newOnes = sourceBlocks.filter(b => !existingIds.has(b.id))
          if (newOnes.length > 0) {
            const updated = { ...existing, blocks: [...existing.blocks, ...newOnes], updatedAt: Date.now() }
            set(s => ({ notes: s.notes.map(n => n.id === existing.id ? updated : n) }))
            const uid = get()._uid
            if (uid) queueWrite(['users', uid, 'notes', existing.id], updated, 0)
          }
          return existing.id
        }

        const note: Note = {
          id: generateId(),
          title: `Companion Note for ${canvas.name}`,
          blocks: [intro, ...sourceBlocks],
          tags: [], pinned: false, linkedNotes: [], versions: [],
          notebookId: canvas.notebookId,
          createdAt: Date.now(), updatedAt: Date.now(),
        }
        set(s => ({ notes: [note, ...s.notes] }))

        const updatedCanvas = { ...canvas, companionNoteId: note.id, updatedAt: Date.now() }
        set(s => ({ canvases: s.canvases.map(c => c.id === canvasId ? updatedCanvas : c) }))

        const uid = get()._uid
        if (uid) {
          queueWrite(['users', uid, 'notes', note.id], note, 0)
          queueWrite(['users', uid, 'canvases', canvasId], updatedCanvas, 0)
        }
        return note.id
      },

      setActiveCanvas: (id) => {
        const { activeCanvasId, canvases, _canvasesHydrated } = get()
        if (activeCanvasId && activeCanvasId !== id && _canvasesHydrated) {
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
              if (uid) queueWrite(['users', uid, 'canvases', activeCanvasId], updatedCanvas, 0)
            }
          }
        }
        set({ activeCanvasId: id })
      },
    }),
    {
      name: 'synclyx-notes',
      version: 7,
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

/** Flush every pending note/canvas write immediately. Call on view switch,
 *  app close, or tab hide — nothing should ever be lost to a timer. */
export function flushAllPendingNotesAndCanvases(uid: string) {
  flushAll(['users', uid])
}
