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

export interface SyncBoardTrashItem {
  id: string           // trash entry ID (different from item.id)
  item: SyncBoardItem  // full item snapshot
  deletedAt: number
  expiresAt: number    // deletedAt + 10 days
}

interface SyncBoardStore {
  items: SyncBoardItem[]
  trash: SyncBoardTrashItem[]
  searchQuery: string
  _uid: string | null
  _unsub: Unsubscribe | null

  startSync: (uid: string) => void
  stopSync: () => void
  addItem: (content: string, source?: SyncBoardItem['source'], deviceName?: string) => void
  updateItem: (id: string, updates: Partial<SyncBoardItem>) => void
  moveToTrash: (id: string) => void
  restoreFromTrash: (trashId: string) => void
  permanentlyDelete: (trashId: string) => void
  emptyTrash: () => void
  purgeExpired: () => void   // removes items older than 10 days
  deleteItems: (ids: string[]) => void
  togglePin: (id: string) => void
  clearUnpinned: () => void
  setSearchQuery: (q: string) => void
}

const generateId = () => Math.random().toString(36).slice(2, 10)
const BOARD_SYNC_DELAY = 2000
const TEN_DAYS = 10 * 24 * 60 * 60 * 1000

const _boardTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function detectType(content: string): SyncBoardItem['type'] {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

const userCol = (uid: string) => collection(db, 'users', uid, 'syncboard')
const userDocRef = (uid: string, id: string) => doc(db, 'users', uid, 'syncboard', id)
const trashCol = (uid: string) => collection(db, 'users', uid, 'syncboard_trash')
const trashDocRef = (uid: string, id: string) => doc(db, 'users', uid, 'syncboard_trash', id)

function scheduleBoardSave(uid: string, item: SyncBoardItem) {
  if (_boardTimers[item.id]) clearTimeout(_boardTimers[item.id])
  _boardTimers[item.id] = setTimeout(() => {
    setDoc(userDocRef(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
    delete _boardTimers[item.id]
  }, BOARD_SYNC_DELAY)
}

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
      items: [], trash: [], searchQuery: '', _uid: null, _unsub: null,

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
        // Purge expired trash on sign-in
        get().purgeExpired()
      },

      stopSync: () => { get()._unsub?.(); set({ _uid: null, _unsub: null }) },

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
        if (uid) setDoc(userDocRef(uid, item.id), { ...item, _updatedAt: serverTimestamp() })
      },

      updateItem: (id, updates) => {
        set(s => ({ items: s.items.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i) }))
        const uid = get()._uid
        if (uid) { const item = get().items.find(i => i.id === id); if (item) scheduleBoardSave(uid, item) }
      },

      // Soft delete — moves to trash for 10 days
      moveToTrash: (id) => {
        const item = get().items.find(i => i.id === id)
        if (!item) return
        const now = Date.now()
        const trashEntry: SyncBoardTrashItem = {
          id: generateId(), item,
          deletedAt: now, expiresAt: now + TEN_DAYS,
        }
        set(s => ({
          items: s.items.filter(i => i.id !== id),
          trash: [trashEntry, ...s.trash],
        }))
        const uid = get()._uid
        if (uid) {
          deleteDoc(userDocRef(uid, id))
          setDoc(trashDocRef(uid, trashEntry.id), { ...trashEntry, _updatedAt: serverTimestamp() })
        }
      },

      restoreFromTrash: (trashId) => {
        const entry = get().trash.find(t => t.id === trashId)
        if (!entry) return
        const restoredItem = { ...entry.item, updatedAt: Date.now() }
        set(s => ({
          items: [restoredItem, ...s.items],
          trash: s.trash.filter(t => t.id !== trashId),
        }))
        const uid = get()._uid
        if (uid) {
          setDoc(userDocRef(uid, restoredItem.id), { ...restoredItem, _updatedAt: serverTimestamp() })
          deleteDoc(trashDocRef(uid, trashId))
        }
      },

      permanentlyDelete: (trashId) => {
        set(s => ({ trash: s.trash.filter(t => t.id !== trashId) }))
        const uid = get()._uid
        if (uid) deleteDoc(trashDocRef(uid, trashId))
      },

      emptyTrash: () => {
        const ids = get().trash.map(t => t.id)
        set({ trash: [] })
        const uid = get()._uid
        if (uid && ids.length) {
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(trashDocRef(uid, id)))
          batch.commit()
        }
      },

      purgeExpired: () => {
        const now = Date.now()
        const expired = get().trash.filter(t => t.expiresAt <= now)
        if (!expired.length) return
        set(s => ({ trash: s.trash.filter(t => t.expiresAt > now) }))
        const uid = get()._uid
        if (uid && expired.length) {
          const batch = writeBatch(db)
          expired.forEach(t => batch.delete(trashDocRef(uid, t.id)))
          batch.commit()
        }
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
      partialize: (s) => ({ items: s.items, trash: s.trash }),
    }
  )
)
