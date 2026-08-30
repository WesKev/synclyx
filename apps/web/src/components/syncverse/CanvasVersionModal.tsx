import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SyncVerseCanvas, CanvasVersion, useNotesStore } from '../../store/notesStore'
import './CanvasVersionModal.css'

const generateId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  canvas: SyncVerseCanvas
  onClose: () => void
}

export default function CanvasVersionModal({ canvas, onClose }: Props) {
  const { updateCanvas, setActiveCanvas, activeCanvasId } = useNotesStore()
  const versions = (canvas.versions || []).slice(0, 5)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)

  const selected = versions[selectedIdx]

  const handleRestore = () => {
    if (!selected) return
    setRestoring(true)

    // Safety net — save current state as a new version before overwriting
    const safetyVersion: CanvasVersion = {
      id: generateId(),
      savedAt: Date.now(),
      name: canvas.name,
      nodes: JSON.parse(JSON.stringify(canvas.nodes)),
      edges: JSON.parse(JSON.stringify(canvas.edges)),
    }

    updateCanvas(canvas.id, {
      nodes: JSON.parse(JSON.stringify(selected.nodes)),
      edges: JSON.parse(JSON.stringify(selected.edges)),
      versions: [safetyVersion, ...(canvas.versions || [])].slice(0, 5),
      // restoredAt forces SyncVerseInner to remount with new nodes
      restoredAt: Date.now(),
    } as any)

    // Force remount of React Flow by briefly deselecting the canvas
    const cid = activeCanvasId
    setActiveCanvas(null)
    setTimeout(() => { if (cid) setActiveCanvas(cid) }, 80)

    setRestoring(false)
    setRestored(true)
    setTimeout(onClose, 900)
  }

  const nodeTypeSummary = (nodes: any[]) => {
    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      const t = n.data?.block?.type || n.type || 'unknown'
      counts[t] = (counts[t] || 0) + 1
    })
    return Object.entries(counts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ') || 'Empty canvas'
  }

  const nodePreviewList = (nodes: any[]) => {
    return nodes.slice(0, 6).map((n, i) => {
      const block = n.data?.block
      const label = block?.content?.slice(0, 50) ||
        block?.meta?.name ||
        block?.type ||
        n.data?.label ||
        `Node ${i + 1}`
      const icon = {
        text: '¶', heading: 'H', list: '≡', checklist: '✓',
        code: '<>', image: '🖼', link: '🔗', video: '🎬',
        audio: '🎵', file: '📎', table: '⊞',
      }[block?.type as string] || '○'
      return { icon, label }
    })
  }

  return createPortal(
    <div className="cvh-overlay" onClick={onClose}>
      <div className="cvh-modal" onClick={e => e.stopPropagation()}>

        <div className="cvh-header">
          <div className="cvh-header-left">
            <span className="cvh-icon">🕐</span>
            <div>
              <h2 className="cvh-title">Canvas Version History</h2>
              <p className="cvh-subtitle">"{canvas.name}" · {versions.length} version{versions.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button className="cvh-close" onClick={onClose}>×</button>
        </div>

        {versions.length === 0 ? (
          <div className="cvh-empty">
            <span>🌐</span>
            <p>No versions saved yet</p>
            <span className="cvh-empty-hint">
              Versions are saved automatically when you switch between canvases
            </span>
          </div>
        ) : (
          <>
            <div className="cvh-tabs">
              {versions.map((v, i) => (
                <button key={v.id}
                  className={`cvh-tab ${i === selectedIdx ? 'active' : ''}`}
                  onClick={() => setSelectedIdx(i)}>
                  <span className="cvh-tab-label">{i === 0 ? 'Latest saved' : `Version ${versions.length - i}`}</span>
                  <span className="cvh-tab-date">{fmtDate(v.savedAt)}</span>
                </button>
              ))}
            </div>

            <div className="cvh-compare">
              {/* Left — current */}
              <div className="cvh-pane">
                <div className="cvh-pane-badge current">Current</div>
                <div className="cvh-pane-title">{canvas.name}</div>
                <div className="cvh-stat-row">
                  <span className="cvh-stat">{canvas.nodes.length} nodes</span>
                  <span className="cvh-stat">{(canvas.edges || []).length} connections</span>
                </div>
                <p className="cvh-type-summary">{nodeTypeSummary(canvas.nodes)}</p>
                <div className="cvh-node-list">
                  {nodePreviewList(canvas.nodes).map((n, i) => (
                    <div key={i} className="cvh-node-item">
                      <span className="cvh-node-icon">{n.icon}</span>
                      <span className="cvh-node-label">{n.label}</span>
                    </div>
                  ))}
                  {canvas.nodes.length > 6 && (
                    <div className="cvh-node-more">+{canvas.nodes.length - 6} more nodes</div>
                  )}
                </div>
              </div>

              <div className="cvh-divider">⟷</div>

              {/* Right — selected version */}
              <div className="cvh-pane">
                <div className="cvh-pane-badge old">Saved {fmtDate(selected.savedAt)}</div>
                <div className="cvh-pane-title">{selected.name}</div>
                <div className="cvh-stat-row">
                  <span className="cvh-stat">{selected.nodes.length} nodes</span>
                  <span className="cvh-stat">{(selected.edges || []).length} connections</span>
                </div>
                <p className="cvh-type-summary">{nodeTypeSummary(selected.nodes)}</p>
                <div className="cvh-node-list">
                  {nodePreviewList(selected.nodes).map((n, i) => (
                    <div key={i} className="cvh-node-item">
                      <span className="cvh-node-icon">{n.icon}</span>
                      <span className="cvh-node-label">{n.label}</span>
                    </div>
                  ))}
                  {selected.nodes.length > 6 && (
                    <div className="cvh-node-more">+{selected.nodes.length - 6} more nodes</div>
                  )}
                </div>
              </div>
            </div>

            <div className="cvh-footer">
              <p className="cvh-restore-note">
                💡 Restoring saves your current canvas as a new version first — you can always undo.
              </p>
              <div className="cvh-footer-actions">
                <button className="cvh-cancel" onClick={onClose}>Cancel</button>
                <button
                  className={`cvh-restore ${restored ? 'restored' : ''}`}
                  onClick={handleRestore}
                  disabled={restoring || restored}>
                  {restored ? '✅ Restored!' : restoring ? 'Restoring…' : '↩ Restore this version'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
