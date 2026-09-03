import { useEffect, useRef, useState } from 'react'

export type SyncStatus = 'idle' | 'saving' | 'saved'

/**
 * Watches a timestamp value (e.g. note.updatedAt / canvas.updatedAt).
 * When it changes → shows 'saving' for syncDelayMs → then 'saved' → then 'idle'.
 * syncDelayMs should match the store's inactivity timer (5000 for notes, 7000 for canvas).
 * markSaved() lets the manual save button immediately skip to 'saved'.
 */
export function useSyncStatus(
  watchValue: number | undefined,
  syncDelayMs: number = 5000
): { status: SyncStatus; markSaved: () => void } {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const idleTimer = useRef<ReturnType<typeof setTimeout>>()
  const prevValue = useRef<number | undefined>(undefined)
  const mounted = useRef(false)

  useEffect(() => {
    // Skip first render — we don't want to show "saving" on mount
    if (!mounted.current) { mounted.current = true; prevValue.current = watchValue; return }
    if (prevValue.current === watchValue) return
    prevValue.current = watchValue

    clearTimeout(saveTimer.current)
    clearTimeout(idleTimer.current)
    setStatus('saving')

    saveTimer.current = setTimeout(() => {
      setStatus('saved')
      idleTimer.current = setTimeout(() => setStatus('idle'), 2000)
    }, syncDelayMs)

    return () => {
      clearTimeout(saveTimer.current)
      clearTimeout(idleTimer.current)
    }
  }, [watchValue, syncDelayMs])

  const markSaved = () => {
    clearTimeout(saveTimer.current)
    clearTimeout(idleTimer.current)
    setStatus('saved')
    idleTimer.current = setTimeout(() => setStatus('idle'), 2000)
  }

  return { status, markSaved }
}
