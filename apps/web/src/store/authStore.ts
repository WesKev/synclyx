import { create } from 'zustand'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
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
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName,
        createdAt: serverTimestamp(),
        plan: 'free',
      })
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
      await setDoc(
        doc(db, 'users', cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          createdAt: serverTimestamp(),
          plan: 'free',
        },
        { merge: true }
      )
      set({ user: cred.user })
    } catch (err) {
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
    case 'auth/email-already-in-use': return 'That email is already registered — try signing in instead.'
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
