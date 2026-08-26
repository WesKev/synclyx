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
  addItem: (content: string, source?: SyncBoardItem['source']) => void
  updateItem: (id: string, updates: Partial<SyncBoardItem>) => void
  deleteItem: (id: string) => void
  deleteItems: (ids: string[]) => void
  togglePin: (id: string) => void
  clearUnpinned: () => void
  setSearchQuery: (q: string) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)

function detectType(content: string): SyncBoardItem['type'] {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

const userCol = (uid: string) => collection(db, 'users', uid, 'syncboard')
const userDoc = (uid: string, id: string) => doc(db, 'users', uid, 'syncboard', id)

async function syncItem(uid: string | null, item: SyncBoardItem) {
  if (!uid) return
  await setDoc(userDoc(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
}

export const useSyncBoardStore = create<SyncBoardStore>()(
  persist(
    (set, get) => ({
      items: [],
      searchQuery: '',
      _uid: null,
      _unsub: null,

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

      stopSync: () => {
        get()._unsub?.()
        set({ _uid: null, _unsub: null })
      },

      addItem: (content, source = 'manual') => {
        if (!content.trim()) return
        if (get().items.find(i => i.content === content.trim())) return
        const now = Date.now()
        const item: SyncBoardItem = {
          id: generateId(), label: '',
          content: content.trim(), type: detectType(content),
          pinned: false, source, createdAt: now, updatedAt: now,
        }
        set(s => ({ items: [item, ...s.items] }))
        syncItem(get()._uid, item)
      },

      updateItem: (id, updates) => {
        set(s => ({
          items: s.items.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i)
        }))
        const item = get().items.find(i => i.id === id)
        if (item) syncItem(get()._uid, item)
      },

      deleteItem: (id) => {
        set(s => ({ items: s.items.filter(i => i.id !== id) }))
        const uid = get()._uid
        if (uid) deleteDoc(userDoc(uid, id))
      },

      deleteItems: (ids) => {
        const idSet = new Set(ids)
        set(s => ({ items: s.items.filter(i => !idSet.has(i.id)) }))
        const uid = get()._uid
        if (uid && ids.length) {
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(userDoc(uid, id)))
          batch.commit()
        }
      },

      togglePin: (id) => {
        set(s => ({
          items: s.items
            .map(i => i.id === id ? { ...i, pinned: !i.pinned, updatedAt: Date.now() } : i)
            .sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
              return b.createdAt - a.createdAt
            })
        }))
        const item = get().items.find(i => i.id === id)
        if (item) syncItem(get()._uid, item)
      },

      clearUnpinned: () => {
        const ids = get().items.filter(i => !i.pinned).map(i => i.id)
        set(s => ({ items: s.items.filter(i => i.pinned) }))
        const uid = get()._uid
        if (uid && ids.length) {
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(userDoc(uid, id)))
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
