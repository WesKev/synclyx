import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

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

interface SyncBoardStore {
  items: SyncBoardItem[]
  searchQuery: string
  _uid: string | null
  _unsub: Unsubscribe | null
  startSync: (uid: string) => void
  stopSync: () => void
  addItem: (content: string, source?: SyncBoardItem['source'], deviceName?: string) => void
  updateItem: (id: string, updates: Partial<SyncBoardItem>) => void
  deleteItem: (id: string) => void
  deleteItems: (ids: string[]) => void
  togglePin: (id: string) => void
  clearUnpinned: () => void
  setSearchQuery: (q: string) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)
const BOARD_SYNC_DELAY = 2000  // 2s — SyncBoard needs fastest sync

// Module-level debounce timers
const _boardTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function detectType(content: string): SyncBoardItem['type'] {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

const userCol = (uid: string) => collection(db, 'users', uid, 'syncboard')
const userDocRef = (uid: string, id: string) => doc(db, 'users', uid, 'syncboard', id)

function scheduleBoardSave(uid: string, item: SyncBoardItem) {
  if (_boardTimers[item.id]) clearTimeout(_boardTimers[item.id])
  _boardTimers[item.id] = setTimeout(() => {
    setDoc(userDocRef(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
    delete _boardTimers[item.id]
  }, BOARD_SYNC_DELAY)
}

/** Flush all pending SyncBoard saves immediately */
export function flushAllPendingBoardItems(uid: string, items: SyncBoardItem[]) {
  Object.keys(_boardTimers).forEach(itemId => {
    clearTimeout(_boardTimers[itemId])
    delete _boardTimers[itemId]
    const item = items.find(i => i.id === itemId)
    if (item) setDoc(userDocRef(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
  })
}

export const useSyncBoardStore = create<SyncBoardStore>()(
  persist(
    (set, get) => ({
      items: [], searchQuery: '', _uid: null, _unsub: null,

      startSync: (uid) => {
        get()._unsub?.()
        const unsub = onSnapshot(userCol(uid), (snap) => {
          const items = snap.docs
            .map(d => d.data() as SyncBoardItem)
            .sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
              return b.createdAt - a.createdAt
            })
          set({ items })
        })
        set({ _uid: uid, _unsub: unsub })
      },

      stopSync: () => { get()._unsub?.(); set({ _uid: null, _unsub: null }) },

      addItem: (content, source = 'manual', deviceName) => {
        if (!content.trim()) return
        if (get().items.find(i => i.content === content.trim())) return
        const now = Date.now()
        const item: SyncBoardItem = {
          id: generateId(), label: '',
          content: content.trim(), type: detectType(content),
          pinned: false, source, deviceName,
          createdAt: now, updatedAt: now,
        }
        set(s => ({ items: [item, ...s.items] }))
        // New items save immediately — no delay
        const uid = get()._uid
        if (uid) setDoc(userDocRef(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
      },

      updateItem: (id, updates) => {
        set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i) }))
        const uid = get()._uid
        if (uid) {
          const item = get().items.find(i => i.id === id)
          // Debounced: 2s after last change
          if (item) scheduleBoardSave(uid, item)
        }
      },

      deleteItem: (id) => {
        set(s => ({ items: s.items.filter(i => i.id !== id) }))
        const uid = get()._uid; if (uid) deleteDoc(userDocRef(uid, id))
      },

      deleteItems: (ids) => {
        const idSet = new Set(ids)
        set(s => ({ items: s.items.filter(i => !idSet.has(i.id)) }))
        const uid = get()._uid
        if (uid && ids.length) {
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(userDocRef(uid, id)))
          batch.commit()
        }
      },

      togglePin: (id) => {
        set(s => ({
          items: s.items
            .map(i => i.id === id ? { ...i, pinned: !i.pinned, updatedAt: Date.now() } : i)
            .sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return b.createdAt - a.createdAt })
        }))
        const uid = get()._uid
        if (uid) { const item = get().items.find(i => i.id === id); if (item) scheduleBoardSave(uid, item) }
      },

      clearUnpinned: () => {
        const ids = get().items.filter(i => !i.pinned).map(i => i.id)
        set(s => ({ items: s.items.filter(i => i.pinned) }))
        const uid = get()._uid
        if (uid && ids.length) {
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(userDocRef(uid, id)))
          batch.commit()
        }
      },

      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: 'synclyx-syncboard',
      partialize: (s) => ({ items: s.items }),
    }
  )
)
