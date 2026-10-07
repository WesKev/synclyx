import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebaseConfig'

const generateId = () => Math.random().toString(36).slice(2, 10)
const MAX_CLIP_LENGTH = 50000

export function detectType(content) {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

/**
 * Pushes a clip to the SAME Firestore collection and SAME field shape the
 * web app's syncBoardStore.ts and the desktop watcher both use — this is
 * what makes a clip captured on the phone show up seamlessly in SyncBoard
 * on every other signed-in device.
 */
export async function pushClip(uid, content, deviceName) {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > MAX_CLIP_LENGTH) return null

  const now = Date.now()
  const item = {
    id: generateId(),
    label: '',
    content: trimmed,
    type: detectType(trimmed),
    pinned: false,
    source: 'mobile',
    deviceName,
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(doc(db, 'users', uid, 'syncboard', item.id), {
    ...item,
    _syncedAt: serverTimestamp(),
  })

  return item
}

/**
 * Reads the user's plan from the profile document users/{uid} — the same
 * document the web app creates at sign-up with plan: 'free'. (An earlier
 * version of this file looked in users/{uid}/meta/settings, which nothing
 * ever writes a plan to.) Firestore Security Rules stop the client from
 * changing `plan`, so Phase 4's payment webhook is the only thing that can
 * ever flip it to 'basic'/'pro' — and when it does, the Pro toggle on the
 * watching screen unlocks with no code change here.
 */
export async function getUserPlan(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() && snap.data().plan ? snap.data().plan : 'free'
  } catch {
    return 'free'
  }
}
