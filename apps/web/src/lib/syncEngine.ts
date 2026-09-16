/**
 * syncEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE write queue for the entire app. Every Firestore write — notes, canvases,
 * SyncBoard clips, trash — goes through this file. No more scattered timers
 * living inside individual stores.
 *
 * Why this exists:
 * Every previous bug (content vanishing, canvases resetting to empty, trash
 * not syncing) traced back to the SAME root cause: multiple independent pieces
 * of code writing to Firestore on their own schedules, with no shared
 * knowledge of what was "in flight". A snapshot could arrive and overwrite
 * local state that hadn't been saved yet, or a stale write could land after
 * a newer one and silently win.
 *
 * The fix: a single pending-write map. Before we write anything, we record it
 * here. While a write is pending, listeners know to IGNORE incoming snapshots
 * for that exact document — because we already know what the "true" state is
 * (it's what's in the queue, not what Firestore just sent us). Once the write
 * confirms, the entry clears, and future snapshots are trusted again.
 *
 * Rules of the road:
 *  - Structural writes (create, delete, add/remove node or edge) → debounceMs = 0 (immediate)
 *  - Content writes (typing) → short debounce (700–1000ms)
 *  - Deletes are ALWAYS immediate and cancel any pending write for that doc
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Firestore REJECTS any document containing `undefined` — anywhere, at any
 * depth — with "Unsupported field value: undefined". The whole write fails.
 *
 * Our data model legitimately produces undefined all over the place:
 *   Note.notebookId?  Note.font?  Block.meta?  Block.items?
 *   SyncVerseNode.width?  SyncBoardItem.deviceName?
 *
 * In JavaScript that's completely normal. To Firestore it's fatal. This was
 * the real cause of notes never syncing: the doc got created (no undefined
 * fields yet), but every subsequent content update was rejected outright —
 * which is exactly why another browser saw the note appear but stay empty.
 *
 * This strips undefined recursively. Keys whose value is undefined are
 * dropped entirely (Firestore treats a missing key as "not set", which is
 * what we want); arrays are cleaned element-by-element.
 */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map(v => stripUndefined(v)) as unknown as T
  }
  // Preserve Firestore sentinels (serverTimestamp etc.) and Date objects as-is
  if (value instanceof Date) return value
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(value as Record<string, any>)) {
    if (v === undefined) continue
    out[k] = stripUndefined(v)
  }
  return out as T
}

interface QueueEntry {
  segments: string[]
  data: any
  timer?: ReturnType<typeof setTimeout>
}

const queue = new Map<string, QueueEntry>()

function keyOf(segments: string[]): string {
  return segments.join('/')
}

/** True if a write for this exact document path is currently pending/in-flight. */
export function isPending(segments: string[]): boolean {
  return queue.has(keyOf(segments))
}

/**
 * Queue a write. If debounceMs is 0 (default), writes immediately.
 * Calling this again for the same path before the previous write fires
 * replaces the pending data and resets the timer — last call wins.
 */
export function queueWrite(segments: string[], data: any, debounceMs: number = 0): void {
  const key = keyOf(segments)
  const existing = queue.get(key)
  if (existing?.timer) clearTimeout(existing.timer)

  const entry: QueueEntry = { segments, data }
  queue.set(key, entry)

  const commit = () => {
    const ref = doc(db, segments[0], ...segments.slice(1))
    const safe = stripUndefined(entry.data)
    setDoc(ref, { ...safe, _syncedAt: serverTimestamp() })
      .catch(err => console.error('[syncEngine] ❌ write FAILED →', key, err))
      .finally(() => {
        // Only clear if nothing newer has been queued in the meantime
        if (queue.get(key) === entry) queue.delete(key)
      })
  }

  if (debounceMs <= 0) {
    commit()
  } else {
    entry.timer = setTimeout(commit, debounceMs)
  }
}

/** Immediate delete. Cancels any pending write for the same path first. */
export function queueDelete(segments: string[]): Promise<void> {
  const key = keyOf(segments)
  const existing = queue.get(key)
  if (existing?.timer) clearTimeout(existing.timer)
  queue.delete(key)
  const ref = doc(db, segments[0], ...segments.slice(1))
  return deleteDoc(ref).catch(err => {
    console.error('[syncEngine] delete failed', key, err)
  })
}

/** Force-flush a single pending write immediately, skipping its debounce. */
export function flushOne(segments: string[]): void {
  const key = keyOf(segments)
  const entry = queue.get(key)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  const ref = doc(db, segments[0], ...segments.slice(1))
  const safe = stripUndefined(entry.data)
  setDoc(ref, { ...safe, _syncedAt: serverTimestamp() })
    .catch(err => console.error('[syncEngine] ❌ flush FAILED →', key, err))
    .finally(() => { if (queue.get(key) === entry) queue.delete(key) })
}

/**
 * Force-flush every pending write immediately.
 * Call on view switch, tab close, or manual "Save now".
 * Optionally scope to a prefix (e.g. only this user's docs).
 */
export function flushAll(prefixSegments?: string[]): void {
  const prefixKey = prefixSegments ? keyOf(prefixSegments) : null
  queue.forEach((entry, key) => {
    if (prefixKey && !key.startsWith(prefixKey)) return
    if (entry.timer) clearTimeout(entry.timer)
    const ref = doc(db, entry.segments[0], ...entry.segments.slice(1))
    const safe = stripUndefined(entry.data)
    setDoc(ref, { ...safe, _syncedAt: serverTimestamp() })
      .catch(err => console.error('[syncEngine] ❌ flushAll FAILED →', key, err))
      .finally(() => { if (queue.get(key) === entry) queue.delete(key) })
  })
}

/** How many writes are currently pending — useful for debugging / sync indicator. */
export function pendingCount(): number {
  return queue.size
}
