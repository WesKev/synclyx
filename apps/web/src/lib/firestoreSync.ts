/**
 * firestoreSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All Firestore read/write operations for Synclyx.
 * Data lives at:
 *   users/{uid}/notes/{noteId}
 *   users/{uid}/notebooks/{notebookId}
 *   users/{uid}/canvases/{canvasId}
 *   users/{uid}/trash/{trashedId}
 *   users/{uid}/meta/settings   ← customTags etc.
 *
 * Strategy: optimistic local update first (Zustand), then Firestore write.
 * Firestore's persistentLocalCache handles offline queuing automatically —
 * if the user is offline, writes are queued and flushed when they reconnect.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Note, Notebook, SyncVerseCanvas, TrashedItem } from '../store/notesStore'

// ─── Collection helpers ───────────────────────────────────────────────────────

const userCol = (uid: string, col: string) =>
  collection(db, 'users', uid, col)

const userDoc = (uid: string, col: string, id: string) =>
  doc(db, 'users', uid, col, id)

// ─── Notes ───────────────────────────────────────────────────────────────────

export function listenToNotes(
  uid: string,
  onData: (notes: Note[]) => void
): Unsubscribe {
  return onSnapshot(userCol(uid, 'notes'), (snap) => {
    const notes = snap.docs.map(d => d.data() as Note)
    onData(notes)
  })
}

export async function saveNote(uid: string, note: Note): Promise<void> {
  await setDoc(userDoc(uid, 'notes', note.id), {
    ...note,
    _updatedAt: serverTimestamp(),
  })
}

export async function deleteNoteFromFirestore(uid: string, noteId: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'notes', noteId))
}

// ─── Notebooks ───────────────────────────────────────────────────────────────

export function listenToNotebooks(
  uid: string,
  onData: (notebooks: Notebook[]) => void
): Unsubscribe {
  return onSnapshot(userCol(uid, 'notebooks'), (snap) => {
    const notebooks = snap.docs.map(d => d.data() as Notebook)
    onData(notebooks)
  })
}

export async function saveNotebook(uid: string, notebook: Notebook): Promise<void> {
  await setDoc(userDoc(uid, 'notebooks', notebook.id), {
    ...notebook,
    _updatedAt: serverTimestamp(),
  })
}

export async function deleteNotebookFromFirestore(uid: string, notebookId: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'notebooks', notebookId))
}

// ─── Canvases ────────────────────────────────────────────────────────────────

export function listenToCanvases(
  uid: string,
  onData: (canvases: SyncVerseCanvas[]) => void
): Unsubscribe {
  return onSnapshot(userCol(uid, 'canvases'), (snap) => {
    const canvases = snap.docs.map(d => d.data() as SyncVerseCanvas)
    onData(canvases)
  })
}

export async function saveCanvas(uid: string, canvas: SyncVerseCanvas): Promise<void> {
  await setDoc(userDoc(uid, 'canvases', canvas.id), {
    ...canvas,
    _updatedAt: serverTimestamp(),
  })
}

export async function deleteCanvasFromFirestore(uid: string, canvasId: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'canvases', canvasId))
}

// ─── Trash ───────────────────────────────────────────────────────────────────

export function listenToTrash(
  uid: string,
  onData: (trash: TrashedItem[]) => void
): Unsubscribe {
  return onSnapshot(userCol(uid, 'trash'), (snap) => {
    const trash = snap.docs.map(d => d.data() as TrashedItem)
    onData(trash)
  })
}

export async function saveTrashItem(uid: string, item: TrashedItem): Promise<void> {
  await setDoc(userDoc(uid, 'trash', item.id), {
    ...item,
    _updatedAt: serverTimestamp(),
  })
}

export async function deleteTrashItem(uid: string, trashedId: string): Promise<void> {
  await deleteDoc(userDoc(uid, 'trash', trashedId))
}

export async function emptyTrashInFirestore(uid: string, trashIds: string[]): Promise<void> {
  if (trashIds.length === 0) return
  const batch = writeBatch(db)
  trashIds.forEach(id => batch.delete(userDoc(uid, 'trash', id)))
  await batch.commit()
}

// ─── Meta (customTags etc.) ──────────────────────────────────────────────────

export async function saveCustomTags(uid: string, customTags: string[]): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'meta', 'settings'),
    { customTags, _updatedAt: serverTimestamp() },
    { merge: true }
  )
}
