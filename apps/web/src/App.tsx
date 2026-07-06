import React, { useEffect, useState } from 'react'
import { useThemeStore } from './store/themeStore'
import { useNotesStore } from './store/notesStore'
import Sidebar from './components/shared/Sidebar'
import NoteEditor from './components/notepad/NoteEditor'
import FAB from './components/shared/FAB'
import SyncVerse from './components/syncverse/SyncVerse'
import SyncVerseSidebar from './components/syncverse/SyncVerseSidebar'
import FloatingFormat from './components/shared/FloatingFormat'
import './styles/index.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/editor.css'
import './styles/blocks.css'
import './styles/popups.css'
import './styles/syncverse.css'

export type AppView = 'notes' | 'syncverse'

export default function App() {
  const { theme } = useThemeStore()
  const { canvases, activeCanvasId, addNote } = useNotesStore()
  const [view, setView] = useState<AppView>('notes')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
      {/* View switcher */}
      <div className="view-switcher">
        <button className={`view-btn ${view === 'notes' ? 'active' : ''}`}
          onClick={() => setView('notes')} title="Notes">
          📝
        </button>
        <button className={`view-btn ${view === 'syncverse' ? 'active' : ''}`}
          onClick={() => setView('syncverse')} title="SyncVerse">
          🌐
        </button>
      </div>

      {view === 'notes' ? (
        <>
          <Sidebar onSwitchToSyncVerse={() => setView('syncverse')} />
          <main className="app-main">
            <NoteEditor onOpenSyncVerse={() => setView('syncverse')} />
          </main>
          <FAB onSyncVerse={() => setView('syncverse')} />
        </>
      ) : (
        <>
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
          <FAB onSyncVerse={() => setView('notes')} isSyncVerseView />
        </>
      )}
    </div>
  )
}
