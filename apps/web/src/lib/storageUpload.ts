/**
 * storageUpload.ts — Cloudinary SIGNED upload helper
 *
 * How it works (and why):
 *   1. We ask our Cloudflare Worker for a signature, proving who we are with the
 *      user's Firebase login token.
 *   2. The Worker checks the login and signs { allowed_formats, folder, timestamp }
 *      with the Cloudinary API secret — a secret that lives ONLY inside the Worker.
 *   3. We upload straight to Cloudinary with that signature. Cloudinary re-computes
 *      it; if anything was changed, or it's older than ~1 hour, the upload is refused.
 *
 * Old way: an UNSIGNED preset, whose name sits in the public JavaScript — so anyone
 * on the internet could upload to your Cloudinary account without an account.
 *
 * Setup: apps/web/.env.local  →  VITE_UPLOAD_SIGN_URL=https://<your-worker>.workers.dev/sign
 * (That URL is public by design, so a VITE_ variable is fine. The API SECRET never is.)
 */
import { auth } from './firebase'

// File size limits per plan (bytes). NOTE: this check runs in the browser, so it is a
// friendly early warning, NOT security — Cloudinary's own plan limits are the hard cap.
export const FILE_SIZE_LIMITS = {
  free:  2  * 1024 * 1024,   // 2MB
  basic: 10 * 1024 * 1024,  // 10MB
  pro:   50 * 1024 * 1024,  // 50MB
}

export type Plan = 'free' | 'basic' | 'pro'

export interface UploadProgress {
  progress: number    // 0–100
  url?: string        // download URL on success
  error?: string      // error message on failure
}

interface SignedParams {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

/**
 * Upload a file to Cloudinary via XHR (supports real progress events).
 * Returns a cancel function — call it to abort at any point.
 */
export function uploadFile(
  _uid: string,          // kept for API compatibility; the Worker takes the user from the login token
  file: File,
  onProgress: (p: UploadProgress) => void,
  plan: Plan = 'free'
): () => void {
  const signUrl = import.meta.env.VITE_UPLOAD_SIGN_URL as string | undefined

  if (!signUrl) {
    onProgress({ progress: 0, error: 'Uploads are not configured. Add VITE_UPLOAD_SIGN_URL to apps/web/.env.local' })
    return () => {}
  }

  const limit = FILE_SIZE_LIMITS[plan]
  if (file.size > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(0)
    const fileMB = (file.size / 1024 / 1024).toFixed(1)
    onProgress({ progress: 0, error: `File too large (${fileMB}MB). Max ${limitMB}MB on ${plan} plan.` })
    return () => {}
  }

  let cancelled = false
  let xhr: XMLHttpRequest | null = null
  const abort = new AbortController()

  ;(async () => {
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Sign in to upload files.')
      const token = await user.getIdToken()

      const res = await fetch(signUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      })
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? 'Please sign in again to upload.'
          : res.status === 429 ? 'Too many uploads — wait a minute and try again.'
          : 'Could not start the upload. Try again.'
        )
      }
      const s = (await res.json()) as SignedParams
      if (cancelled) return

      // These fields must be EXACTLY what the Worker signed — nothing extra, nothing missing.
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', s.apiKey)
      formData.append('timestamp', String(s.timestamp))
      formData.append('signature', s.signature)
      formData.append('folder', s.folder)
      formData.append('allowed_formats', s.allowedFormats)

      xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress({ progress: Math.round((e.loaded / e.total) * 100) })
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr!.responseText)
          if (xhr!.status === 200 && data.secure_url) onProgress({ progress: 100, url: data.secure_url })
          else onProgress({ progress: 0, error: data.error?.message || `Upload failed (HTTP ${xhr!.status})` })
        } catch {
          onProgress({ progress: 0, error: `Upload failed (HTTP ${xhr!.status})` })
        }
      }
      xhr.onerror = () => onProgress({ progress: 0, error: 'Network error — check your connection and try again.' })
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${s.cloudName}/auto/upload`)
      xhr.send(formData)
    } catch (err) {
      if (cancelled) return
      onProgress({ progress: 0, error: err instanceof Error ? err.message : 'Upload failed' })
    }
  })()

  return () => { cancelled = true; abort.abort(); xhr?.abort() }
}
