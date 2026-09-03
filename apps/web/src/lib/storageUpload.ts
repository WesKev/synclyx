/**
 * storageUpload.ts — Cloudinary upload helper
 *
 * Setup (one-time):
 *   1. Create free account at cloudinary.com
 *   2. Settings → Upload → Upload presets → Add preset
 *      Name: synclyx_uploads | Signing mode: Unsigned | Folder: synclyx
 *   3. Add to apps/web/.env.local:
 *      VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
 *      VITE_CLOUDINARY_UPLOAD_PRESET=synclyx_uploads
 */

// File size limits per plan (bytes)
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

/**
 * Upload a file to Cloudinary via XHR (supports real progress events).
 * Returns a cancel function — call it to abort mid-upload.
 */
export function uploadFile(
  _uid: string,          // kept for API compatibility, not used by Cloudinary
  file: File,
  onProgress: (p: UploadProgress) => void,
  plan: Plan = 'free'
): () => void {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    onProgress({
      progress: 0,
      error: 'Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to apps/web/.env.local',
    })
    return () => {}
  }

  const limit = FILE_SIZE_LIMITS[plan]
  if (file.size > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(0)
    const fileMB = (file.size / 1024 / 1024).toFixed(1)
    onProgress({
      progress: 0,
      error: `File too large (${fileMB}MB). Max ${limitMB}MB on ${plan} plan.`,
    })
    return () => {}
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  // Store under a consistent folder structure
  formData.append('folder', 'synclyx')

  const xhr = new XMLHttpRequest()

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      onProgress({ progress: Math.round((e.loaded / e.total) * 100) })
    }
  }

  xhr.onload = () => {
    if (xhr.status === 200) {
      try {
        const data = JSON.parse(xhr.responseText)
        if (data.secure_url) {
          onProgress({ progress: 100, url: data.secure_url })
        } else {
          onProgress({ progress: 0, error: data.error?.message || 'Upload failed' })
        }
      } catch {
        onProgress({ progress: 0, error: 'Unexpected response from Cloudinary' })
      }
    } else {
      onProgress({ progress: 0, error: `Upload failed (HTTP ${xhr.status})` })
    }
  }

  xhr.onerror = () => {
    onProgress({ progress: 0, error: 'Network error — check your connection and Cloudinary settings' })
  }

  xhr.onabort = () => {
    // Silently cancelled — no error needed
  }

  xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`)
  xhr.send(formData)

  return () => xhr.abort()
}
