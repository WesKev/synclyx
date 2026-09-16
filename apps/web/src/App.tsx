import React, { useEffect, useState } from 'react'
import { useThemeStore } from './store/themeStore'
import { useSyncVerseThemeStore } from './store/syncVerseThemeStore'
import { useNotesStore, flushAllPendingNotesAndCanvases } from './store/notesStore'
import { useAuthStore } from './store/authStore'
import { useSyncBoardStore } from './store/syncBoardStore'
import { flushAll as flushAllSync } from './lib/syncEngine'
import Sidebar from './components/shared/Sidebar'
import NoteEditor from './components/notepad/NoteEditor'
import FAB from './components/shared/FAB'
import SyncVerse from './components/syncverse/SyncVerse'
import SyncVerseSidebar from './components/syncverse/SyncVerseSidebar'
import FloatingFormat from './components/shared/FloatingFormat'
import AuthModal from './components/auth/AuthModal'
import AccountModal from './components/account/AccountModal'
import SyncBoard from './components/syncboard/SyncBoard'
import './styles/index.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/editor.css'
import './styles/blocks.css'
import './styles/popups.css'
import './styles/syncverse.css'
import './styles/codemirror.css'
import './styles/session-a-patch.css'
import './styles/hotfix-patch.css'
import './styles/sv-final-patch.css'
import './styles/major-update-patch.css'
import './styles/session-b-patch.css'

export type AppView = 'notes' | 'syncverse' | 'syncboard'

export default function App() {
  const { theme } = useThemeStore()
  const { theme: svTheme } = useSyncVerseThemeStore()
  const { canvases, activeCanvasId, addNote, startSync, stopSync } = useNotesStore()
  const { user, loading, initAuthListener } = useAuthStore()
  const { startSync: startBoardSync, stopSync: stopBoardSync } = useSyncBoardStore()

  const [view, setView] = useState<AppView>('notes')
  const [authOpen, setAuthOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  // Auth listener
  useEffect(() => {
    const unsubscribe = initAuthListener()
    return unsubscribe
  }, [initAuthListener])

  // Start/stop sync on auth change
  useEffect(() => {
    if (user) { startSync(user.uid); startBoardSync(user.uid) }
    else { stopSync(); stopBoardSync() }
  }, [user, startSync, stopSync, startBoardSync, stopBoardSync])

  // Global theme — drives SyncPad and SyncBoard (everything outside SyncVerse)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Canvas limit reached — show user-friendly notice
  useEffect(() => {
    const handler = (e: Event) => {
      const { plan, limit } = (e as CustomEvent).detail
      alert(`You've reached the ${plan} plan limit of ${limit} canvases.\n\nUpgrade to Basic (20) or Pro (unlimited) for more.\n\nComing in Phase 4!`)
    }
    window.addEventListener('synclyx:canvas-limit-reached', handler)
    return () => window.removeEventListener('synclyx:canvas-limit-reached', handler)
  }, [])

  // Custom view switch event (from other components)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppView
      switchView(detail)
    }
    window.addEventListener('synclyx:switch-view', handler)
    return () => window.removeEventListener('synclyx:switch-view', handler)
  }, [])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); addNote() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addNote])

  // ── Flush everything on app close / tab hidden ────────────────────────────
  useEffect(() => {
    const handleClose = () => flushAllSync()
    const handleVisibility = () => { if (document.visibilityState === 'hidden') flushAllSync() }
    window.addEventListener('beforeunload', handleClose)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('beforeunload', handleClose)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // ── Switch view — flush before switching so nothing is lost ──────────────
  const switchView = (newView: AppView) => {
    if (newView !== view) flushAllSync()
    setView(newView)
  }

  const activeCanvas = canvases.find(c => c.id === activeCanvasId)

  // ── View-switcher theme fix ────────────────────────────────────────────────
  // The switcher bar previously always used the global `theme`, even while
  // viewing SyncVerse — which has its OWN independent theme (svTheme). That's
  // why you could see a light switcher bar sitting above a dark SyncVerse.
  // Fix: the switcher gets its own local `data-theme` attribute reflecting
  // whichever theme actually applies to the current view. See
  // styles/major-update-patch.css for the scoped color rules this depends on.
  const switcherTheme = view === 'syncverse' ? svTheme : theme

  return (
    <div className="app-shell">
      <FloatingFormat />

      <div className="view-switcher" data-theme={switcherTheme}>
        <button className={`view-btn ${view === 'notes' ? 'active' : ''}`}
          onClick={() => switchView('notes')} title="SyncPad">📝</button>
        <button className={`view-btn ${view === 'syncverse' ? 'active' : ''}`}
          onClick={() => switchView('syncverse')} title="SyncVerse">🌐</button>
        <button className={`view-btn ${view === 'syncboard' ? 'active' : ''}`}
          onClick={() => switchView('syncboard')} title="SyncBoard">📋</button>

        <div style={{ flex: 1 }} />

        {!loading && (
          user ? (
            <button className="view-btn auth-user-btn"
              onClick={() => setAccountOpen(true)}
              title={`Account · ${user.email}`}>
              {user.displayName?.[0]?.toUpperCase() ?? '👤'}
            </button>
          ) : (
            <button className="view-btn auth-signin-btn"
              onClick={() => setAuthOpen(true)} title="Sign in to sync">☁️</button>
          )
        )}
      </div>

      {view === 'notes' && (
        <>
          <Sidebar onSwitchToSyncVerse={() => switchView('syncverse')} />
          <main className="app-main">
            <NoteEditor onOpenSyncVerse={() => switchView('syncverse')} />
          </main>
          <FAB onSyncVerse={() => switchView('syncverse')} />
        </>
      )}

      {view === 'syncverse' && (
        <div className="syncverse-view-root" data-sv-theme={svTheme} style={{ display: 'flex', width: '100%' }}>
          <SyncVerseSidebar />
          <main className="app-main syncverse-main">
            {activeCanvas
              ? <SyncVerse canvas={activeCanvas} />
              : (
                <div className="editor-empty">
                  <div className="editor-empty-inner">
                    <span className="editor-empty-icon">🌐</span>
                    <p>Select a canvas or create one</p>
                    <span className="editor-empty-hint">Press + to start a new SyncVerse canvas</span>
                  </div>
                </div>
              )
            }
          </main>
          <FAB onSyncVerse={() => switchView('notes')} isSyncVerseView />
        </div>
      )}

      {view === 'syncboard' && (
        <main className="app-main"><SyncBoard /></main>
      )}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}
