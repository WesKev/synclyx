import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { listenToSyncBoard, listenToSyncBoardTrash } from '../lib/firestoreSync'
import { queueWrite, queueDelete, isPending } from '../lib/syncEngine'

export interface SyncBoardItem {
  id: string
  label: string
  content: string
  type: 'text' | 'link' | 'code'
  pinned: boolean
  source: 'manual' | 'electron' | 'mobile'
  deviceName?: string
  createdAt: number
  updatedAt: number
}

export interface SyncBoardTrashItem {
  id: string
  item: SyncBoardItem
  deletedAt: number
  expiresAt: number
}

interface SyncBoardStore {
  items: SyncBoardItem[]
  trash: SyncBoardTrashItem[]
  searchQuery: string
  _uid: string | null
  _unsubs: (() => void)[]
  _hydrated: boolean

  startSync: (uid: string) => void
  stopSync: () => void
  addItem: (content: string, source?: SyncBoardItem['source'], deviceName?: string) => void
  updateItem: (id: string, updates: Partial<SyncBoardItem>) => void
  moveToTrash: (id: string) => void
  restoreFromTrash: (trashId: string) => void
  permanentlyDelete: (trashId: string) => void
  emptyTrash: () => void
  purgeExpired: () => void
  deleteItems: (ids: string[]) => void
  togglePin: (id: string) => void
  clearUnpinned: () => void
  setSearchQuery: (q: string) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)
const ITEM_CONTENT_DEBOUNCE = 700  // fastest of the three sections, per design
const TEN_DAYS = 10 * 24 * 60 * 60 * 1000

function detectType(content: string): SyncBoardItem['type'] {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

export const useSyncBoardStore = create<SyncBoardStore>()(
  persist(
    (set, get) => ({
      items: [], trash: [], searchQuery: '', _uid: null, _unsubs: [], _hydrated: false,

      startSync: (uid) => {
        get()._unsubs.forEach(u => u())
        set({ _uid: uid, _hydrated: false })
        const unsubs: (() => void)[] = []

        // ── Main items listener — THIS had zero protection before. Every
        // snapshot unconditionally overwrote local state, which is why
        // clips could vanish mid-edit. Now it's pending-aware like notes
        // and canvases. ─────────────────────────────────────────────────
        unsubs.push(listenToSyncBoard(uid, (incoming) => {
          const { items: local } = get()
          const merged = incoming.map(inItem => {
            if (isPending(['users', uid, 'syncboard', inItem.id])) {
              const loc = local.find(i => i.id === inItem.id)
              if (loc) return loc
            }
            return inItem
          })
          const fsIds = new Set(incoming.map(i => i.id))
          const localOnly = local.filter(i => !fsIds.has(i.id) && isPending(['users', uid, 'syncboard', i.id]))
          const all = [...merged, ...localOnly].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return b.createdAt - a.createdAt
          })
          set({ items: all, _hydrated: true })
        }))

        unsubs.push(listenToSyncBoardTrash(uid, (t) =>
          set({ trash: t.sort((a, b) => b.deletedAt - a.deletedAt) })
        ))

        set({ _unsubs: unsubs })
        get().purgeExpired()
      },

      stopSync: () => {
        get()._unsubs.forEach(u => u())
        set({ _uid: null, _unsubs: [], _hydrated: false })
      },

      addItem: (content, source = 'manual', deviceName) => {
        if (!content.trim()) return
        if (get().items.find(i => i.content === content.trim())) return
        const now = Date.now()
        const item: SyncBoardItem = {
          id: generateId(), label: '', content: content.trim(),
          type: detectType(content), pinned: false, source, deviceName,
          createdAt: now, updatedAt: now,
        }
        set(s => ({ items: [item, ...s.items] }))
        const uid = get()._uid
        // New doc — safe immediately
        if (uid) queueWrite(['users', uid, 'syncboard', item.id], item, 0)
      },

      updateItem: (id, updates) => {
        set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i) }))
        const uid = get()._uid
        if (!uid || !get()._hydrated) return
        const item = get().items.find(i => i.id === id)
        if (item) queueWrite(['users', uid, 'syncboard', id], item, ITEM_CONTENT_DEBOUNCE)
      },

      // Soft delete — moves to trash, propagates to every signed-in device
      moveToTrash: (id) => {
        const item = get().items.find(i => i.id === id)
        if (!item) return
        const now = Date.now()
        const trashEntry: SyncBoardTrashItem = { id: generateId(), item, deletedAt: now, expiresAt: now + TEN_DAYS }
        set(s => ({ items: s.items.filter(i => i.id !== id), trash: [trashEntry, ...s.trash] }))
        const uid = get()._uid
        if (uid) {
          queueDelete(['users', uid, 'syncboard', id])
          queueWrite(['users', uid, 'syncboard_trash', trashEntry.id], trashEntry, 0)
        }
      },

      restoreFromTrash: (trashId) => {
        const entry = get().trash.find(t => t.id === trashId)
        if (!entry) return
        const restoredItem = { ...entry.item, updatedAt: Date.now() }
        set(s => ({ items: [restoredItem, ...s.items], trash: s.trash.filter(t => t.id !== trashId) }))
        const uid = get()._uid
        if (uid) {
          queueWrite(['users', uid, 'syncboard', restoredItem.id], restoredItem, 0)
          queueDelete(['users', uid, 'syncboard_trash', trashId])
        }
      },

      permanentlyDelete: (trashId) => {
        set(s => ({ trash: s.trash.filter(t => t.id !== trashId) }))
        const uid = get()._uid
        if (uid) queueDelete(['users', uid, 'syncboard_trash', trashId])
      },

      emptyTrash: () => {
        const ids = get().trash.map(t => t.id)
        set({ trash: [] })
        const uid = get()._uid
        if (uid) ids.forEach(id => queueDelete(['users', uid, 'syncboard_trash', id]))
      },

      purgeExpired: () => {
        const now = Date.now()
        const expired = get().trash.filter(t => t.expiresAt <= now)
        if (!expired.length) return
        set(s => ({ trash: s.trash.filter(t => t.expiresAt > now) }))
        const uid = get()._uid
        if (uid) expired.forEach(t => queueDelete(['users', uid, 'syncboard_trash', t.id]))
      },

      deleteItems: (ids) => {
        // Route through moveToTrash so bulk-selected deletes are recoverable too
        ids.forEach(id => get().moveToTrash(id))
      },

      togglePin: (id) => {
        set(s => ({
          items: s.items
            .map(i => i.id === id ? { ...i, pinned: !i.pinned, updatedAt: Date.now() } : i)
            .sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return b.createdAt - a.createdAt })
        }))
        const uid = get()._uid
        if (uid) { const item = get().items.find(i => i.id === id); if (item) queueWrite(['users', uid, 'syncboard', id], item, 0) }
      },

      clearUnpinned: () => {
        const ids = get().items.filter(i => !i.pinned).map(i => i.id)
        ids.forEach(id => get().moveToTrash(id))
      },

      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: 'synclyx-syncboard',
      partialize: (s) => ({ items: s.items, trash: s.trash }),
    }
  )
)
