import React, { useEffect, useState } from 'react'
import { useThemeStore } from './store/themeStore'
import { useSyncVerseThemeStore } from './store/syncVerseThemeStore'
import { useNotesStore } from './store/notesStore'
import { useAuthStore } from './store/authStore'
import { useSyncBoardStore } from './store/syncBoardStore'
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

  useEffect(() => {
    const unsubscribe = initAuthListener()
    return unsubscribe
  }, [initAuthListener])

  useEffect(() => {
    if (user) {
      startSync(user.uid)
      startBoardSync(user.uid)
    } else {
      stopSync()
      stopBoardSync()
    }
  }, [user, startSync, stopSync, startBoardSync, stopBoardSync])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppView
      setView(detail)
    }
    window.addEventListener('synclyx:switch-view', handler)
    return () => window.removeEventListener('synclyx:switch-view', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); addNote() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addNote])

  const activeCanvas = canvases.find(c => c.id === activeCanvasId)

  return (
    <div className="app-shell">
      <FloatingFormat />

      {/* Left vertical rail — view switcher */}
      <div className="view-switcher">
        <button
          className={`view-btn ${view === 'notes' ? 'active' : ''}`}
          onClick={() => setView('notes')}
          title="SyncPad"
        >📝</button>

        <button
          className={`view-btn ${view === 'syncverse' ? 'active' : ''}`}
          onClick={() => setView('syncverse')}
          title="SyncVerse"
        >🌐</button>

        <button
          className={`view-btn ${view === 'syncboard' ? 'active' : ''}`}
          onClick={() => setView('syncboard')}
          title="SyncBoard"
        >📋</button>

        {/* Spacer — pushes auth to bottom */}
        <div style={{ flex: 1 }} />

        {/* Auth — cloud = sign in, initial letter = account page */}
        {!loading && (
          user ? (
            <button
              className="view-btn auth-user-btn"
              onClick={() => setAccountOpen(true)}
              title={`Account · ${user.email}`}
            >
              {user.displayName?.[0]?.toUpperCase() ?? '👤'}
            </button>
          ) : (
            <button
              className="view-btn auth-signin-btn"
              onClick={() => setAuthOpen(true)}
              title="Sign in to sync"
            >☁️</button>
          )
        )}
      </div>

      {/* SyncPad */}
      {view === 'notes' && (
        <>
          <Sidebar onSwitchToSyncVerse={() => setView('syncverse')} />
          <main className="app-main">
            <NoteEditor onOpenSyncVerse={() => setView('syncverse')} />
          </main>
          <FAB onSyncVerse={() => setView('syncverse')} />
        </>
      )}

      {/* SyncVerse */}
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
                    <span className="editor-empty-hint">Press + in the bottom rail to start</span>
                  </div>
                </div>
              )
            }
          </main>
          <FAB onSyncVerse={() => setView('notes')} isSyncVerseView />
        </div>
      )}

      {/* SyncBoard */}
      {view === 'syncboard' && (
        <main className="app-main">
          <SyncBoard />
        </main>
      )}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}
