import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

// File size limits per plan (bytes)
export const FILE_SIZE_LIMITS = {
  free:  2 * 1024 * 1024,   // 2MB
  basic: 10 * 1024 * 1024,  // 10MB
  pro:   50 * 1024 * 1024,  // 50MB
}

export interface UploadProgress {
  progress: number    // 0–100
  url?: string        // set on completion
  error?: string      // set on failure
}

type Plan = 'free' | 'basic' | 'pro'

/**
 * Upload a file to Firebase Storage.
 * Returns a cancel function — call it to abort the upload.
 *
 * Prerequisites: Firebase Storage must be enabled in the Firebase Console
 * (Build → Storage → Get started → Production mode → choose region).
 */
export function uploadFile(
  uid: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  plan: Plan = 'free'
): () => void {
  const limit = FILE_SIZE_LIMITS[plan]
  if (file.size > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(0)
    onProgress({
      progress: 0,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${limitMB}MB on ${plan} plan.`,
    })
    return () => {}
  }

  const ext = file.name.split('.').pop() || 'bin'
  const path = `users/${uid}/uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const storageRef = ref(storage, path)
  const task = uploadBytesResumable(storageRef, file)

  task.on(
    'state_changed',
    (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
      onProgress({ progress: pct })
    },
    (err) => {
      if (err.code === 'storage/canceled') return
      if (err.code === 'storage/unknown') {
        onProgress({ progress: 0, error: 'Storage not set up yet. Enable Firebase Storage in your console.' })
      } else {
        onProgress({ progress: 0, error: err.message })
      }
    },
    async () => {
      const url = await getDownloadURL(task.snapshot.ref)
      onProgress({ progress: 100, url })
    }
  )

  return () => task.cancel()
}
