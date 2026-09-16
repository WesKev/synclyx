/**
 * firestoreSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore READ (listener) functions only. All WRITES now go through
 * lib/syncEngine.ts — see that file for why.
 *
 * Data lives at:
 *   users/{uid}/notes/{noteId}
 *   users/{uid}/notebooks/{notebookId}
 *   users/{uid}/canvases/{canvasId}
 *   users/{uid}/trash/{trashedId}
 *   users/{uid}/syncboard/{itemId}
 *   users/{uid}/syncboard_trash/{trashId}
 *   users/{uid}/meta/settings
 */

import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { Note, Notebook, SyncVerseCanvas, TrashedItem } from '../store/notesStore'
import type { SyncBoardItem, SyncBoardTrashItem } from '../store/syncBoardStore'

const userCol = (uid: string, col: string) => collection(db, 'users', uid, col)

export function listenToNotes(uid: string, onData: (notes: Note[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'notes'), (snap) => {
    onData(snap.docs.map(d => d.data() as Note))
  })
}

export function listenToNotebooks(uid: string, onData: (notebooks: Notebook[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'notebooks'), (snap) => {
    onData(snap.docs.map(d => d.data() as Notebook))
  })
}

export function listenToCanvases(uid: string, onData: (canvases: SyncVerseCanvas[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'canvases'), (snap) => {
    onData(snap.docs.map(d => d.data() as SyncVerseCanvas))
  })
}

export function listenToTrash(uid: string, onData: (trash: TrashedItem[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'trash'), (snap) => {
    onData(snap.docs.map(d => d.data() as TrashedItem))
  })
}

export function listenToSyncBoard(uid: string, onData: (items: SyncBoardItem[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'syncboard'), (snap) => {
    onData(snap.docs.map(d => d.data() as SyncBoardItem))
  })
}

export function listenToSyncBoardTrash(uid: string, onData: (items: SyncBoardTrashItem[]) => void): Unsubscribe {
  return onSnapshot(userCol(uid, 'syncboard_trash'), (snap) => {
    onData(snap.docs.map(d => d.data() as SyncBoardTrashItem))
  })
}
