import { create } from 'zustand'

/**
 * Which locked items are unlocked RIGHT NOW in this tab. Lives in memory only:
 * a reload (or closing the tab) locks everything again, and switching away
 * from an item relocks it.
 */
interface SessionLockState {
  unlocked: Record<string, true>
  markUnlocked: (id: string) => void
  relockExcept: (keepId: string | null) => void
  relockAll: () => void
}

export const useSessionLockStore = create<SessionLockState>((set) => ({
  unlocked: {},
  markUnlocked: (id) => set(s => ({ unlocked: { ...s.unlocked, [id]: true } })),
  relockExcept: (keepId) => set(s => (keepId && s.unlocked[keepId] ? { unlocked: { [keepId]: true } } : { unlocked: {} })),
  relockAll: () => set({ unlocked: {} }),
}))
