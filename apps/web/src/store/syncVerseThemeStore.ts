import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface SyncVerseThemeStore {
  theme: Theme
  toggle: () => void
}

// Independent theme store for SyncVerse — separate from main Synclyx theme
export const useSyncVerseThemeStore = create<SyncVerseThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggle: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'synclyx-syncverse-theme' }
  )
)
