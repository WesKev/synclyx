import { create } from 'zustand'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

/**
 * Creates users/{uid} (the profile document) the FIRST time only.
 *
 * Two things this fixes versus the old inline setDoc calls:
 *  1. It never throws. By the time this runs, Firebase Auth has already
 *     signed the person in successfully — a failed profile write must not be
 *     reported to them as "Something went wrong" (that's exactly what you saw
 *     when the old rules blocked this write: signed in AND shown an error).
 *  2. Google sign-in used to re-write the doc on EVERY login with
 *     merge:true, resetting createdAt and plan each time. A Pro user would
 *     have been reset to 'free' on their next Google login.
 */
async function ensureProfile(user: User, displayName: string | null) {
  try {
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    if (snap.exists()) return
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName,
      createdAt: serverTimestamp(),
      plan: 'free',
    })
  } catch (err) {
    console.error('[auth] Profile document not created (sign-in itself succeeded):', err)
  }
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
  initAuthListener: () => () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  initAuthListener: () => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      set({ user: firebaseUser, loading: false })
    })
    return unsubscribe
  },

  signUp: async (email, password, displayName) => {
    set({ error: null })
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName })
      await ensureProfile(cred.user, displayName)
      set({ user: cred.user })
    } catch (err) {
      set({ error: mapAuthError(err) })
      throw err
    }
  },

  signIn: async (email, password) => {
    set({ error: null })
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      set({ user: cred.user })
    } catch (err) {
      set({ error: mapAuthError(err) })
      throw err
    }
  },

  signInWithGoogle: async () => {
    set({ error: null })
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await ensureProfile(cred.user, cred.user.displayName)
      set({ user: cred.user })
    } catch (err) {
      set({ error: mapAuthError(err) })
      throw err
    }
  },

  // Always resolves the same way whether or not the email has an account, so
  // this can't be used to find out who is registered. Only genuinely useful
  // errors (malformed email, rate limit, network) are surfaced.
  resetPassword: async (email) => {
    set({ error: null })
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      if (code === 'auth/user-not-found') return
      set({ error: mapAuthError(err) })
      throw err
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth)
    set({ user: null })
  },

  clearError: () => set({ error: null }),
}))

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/email-already-in-use': return "We couldn't create an account with those details. If you already have one, sign in or reset your password."
    case 'auth/invalid-email': return 'That email address looks invalid.'
    case 'auth/weak-password': return 'Password must be at least 6 characters.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.'
    case 'auth/popup-closed-by-user': return 'Sign-in was cancelled.'
    case 'auth/too-many-requests': return 'Too many attempts — wait a moment and try again.'
    default: return 'Something went wrong. Please try again.'
  }
}
