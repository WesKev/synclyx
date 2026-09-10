import React, { useCallback, useState, useRef, useEffect } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel,
  EdgeLabelRenderer, BaseEdge, getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNotesStore, SyncVerseCanvas, Block, BlockType, SyncVerseNode, SyncVerseEdge, flushAllPendingCanvases } from '../../store/notesStore'
import { useSyncVerseThemeStore } from '../../store/syncVerseThemeStore'
import BlockNode from './BlockNode'
import StickyNode from './StickyNode'
import NoteCardNode from './NoteCardNode'
import CanvasFAB from './CanvasFAB'
import SyncIndicator from '../shared/SyncIndicator'
import { useSyncStatus } from '../../hooks/useSyncStatus'

const nodeTypes = { block: BlockNode, sticky: StickyNode, note: NoteCardNode }
const generateId = () => Math.random().toString(36).slice(2, 10)

// ─── Helpers: convert React Flow types ↔ store types ─────────────────────────
function rfNodesToStore(rfNodes: Node[]): SyncVerseNode[] {
  return rfNodes.map(n => ({
    id: n.id,
    type: n.type as any,
    position: n.position,
    data: n.data,
    width: (n.style?.width as number) || n.width || 280,
    height: (n.style?.height as number) || n.height || 180,
  }))
}

function rfEdgesToStore(rfEdges: Edge[]): SyncVerseEdge[] {
  return rfEdges.map(e => ({
    id: e.id, source: e.source, target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined,
    animated: e.animated,
  }))
}

// ─── Custom edge ──────────────────────────────────────────────────────────────
function SyncluxEdge({ sourceX, sourceY, targetX, targetY, label, selected, markerEnd, style }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      <BaseEdge
        path={edgePath} markerEnd={markerEnd}
        style={{ ...style, stroke: selected ? '#e040fb' : '#a833b9', strokeWidth: selected ? 3 : 2 }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'none', zIndex: 10 }}
            className="edge-label-wrap">
            <span className="edge-label">{label as string}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { synclyx: SyncluxEdge }

// ─── Edge label popup ─────────────────────────────────────────────────────────
function EdgeLabelPopup({ edge, onSave, onDelete, onClose }: {
  edge: Edge; onSave: (id: string, label: string) => void
  onDelete: (id: string) => void; onClose: () => void
}) {
  const [label, setLabel] = useState((edge.label as string) || '')
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" style={{ maxWidth: '22rem' }} onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>🔗 Connection</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-body">
          <input className="link-field" autoFocus
            placeholder="Name this connection (e.g. depends on, leads to...)"
            value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { onSave(edge.id, label); onClose() }
              if (e.key === 'Escape') onClose()
            }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.5rem' }}>
            Leave empty to remove label. Hover the line to see name.
          </p>
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" style={{ color: '#ff4444' }}
            onClick={() => { onDelete(edge.id); onClose() }}>🗑 Delete line</button>
          <button className="popup-confirm" onClick={() => { onSave(edge.id, label); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Header with rename + sync indicator ──────────────────────────────────────
function SyncVerseHeader({ canvas, onRename, syncStatus, onManualSave }: {
  canvas: SyncVerseCanvas
  onRename: (name: string) => void
  syncStatus: import('../../hooks/useSyncStatus').SyncStatus
  onManualSave: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(canvas.name)

  return (
    <div className="syncverse-header">
      <div className="syncverse-header-left">
        {editing ? (
          <input className="syncverse-title-input" value={val} autoFocus
            onChange={e => setVal(e.target.value)}
            onBlur={() => { onRename(val); setEditing(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { onRename(val); setEditing(false) }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="syncverse-title" onClick={() => setEditing(true)} title="Click to rename">
            🌐 {canvas.name} ✎
          </span>
        )}
        <span className="syncverse-hint">Drag · Connect · Click line to name or delete</span>
      </div>
      {/* Sync indicator + manual save */}
      <div className="syncverse-header-right">
        <SyncIndicator status={syncStatus} onSave={onManualSave} label />
      </div>
    </div>
  )
}

interface Props { canvas: SyncVerseCanvas }

// ─── Inner component — remounts fully when canvas.id changes ──────────────────
function SyncVerseInner({ canvas }: Props) {
  const { updateCanvas, notes } = useNotesStore()
  const [labelPopupEdge, setLabelPopupEdge] = useState<Edge | null>(null)

  const initialNodes: Node[] = (canvas.nodes || []).map(n => ({
    id: n.id, type: n.type, position: n.position, data: n.data,
    style: { width: n.width || 280, height: n.height || 180 },
  }))
  const initialEdges: Edge[] = (canvas.edges || []).map(e => ({
    id: e.id, source: e.source, target: e.target,
    label: e.label || undefined, animated: e.animated ?? true, type: 'synclyx',
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // ── Always-current refs — THE KEY FIX ────────────────────────────────────
  // Every callback that calls updateCanvas MUST use these refs, not canvas.nodes/edges
  // from the closure. The closure captures a snapshot at render time; refs are always live.
  const nodesRef = useRef<Node[]>(initialNodes)
  const edgesRef = useRef<Edge[]>(initialEdges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // Sync status for cloud indicator — matches 3s debounce
  const { status: syncStatus, markSaved } = useSyncStatus(canvas.updatedAt, 3000)

  // ── Comprehensive save: watches ALL node/edge changes ─────────────────────
  // This catches everything — drags, keyboard deletes, edge changes, resizes —
  // not just the specific events we handle explicitly above.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isMounted = useRef(false)

  useEffect(() => {
    // Skip initial mount render — no changes to save yet
    if (!isMounted.current) { isMounted.current = true; return }
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateCanvas(canvas.id, {
        nodes: rfNodesToStore(nodesRef.current),
        edges: rfEdgesToStore(edgesRef.current),
      })
    }, 1000) // 1s debounce — fast enough to catch all changes
    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps
  // canvas.id and updateCanvas intentionally omitted — stable for component lifetime

  // ── Flush immediately on unmount (view switch) ────────────────────────────
  // Ensures the very last state is saved even if the debounce hasn't fired
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      updateCanvas(canvas.id, {
        nodes: rfNodesToStore(nodesRef.current),
        edges: rfEdgesToStore(edgesRef.current),
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-version every 1.5 minutes ───────────────────────────────────────
  // Saves a "before" snapshot of the current canvas state so the user can
  // always recover the version before they started the current editing session.
  // On first fire: saves the state as it was when the user opened this canvas.
  useEffect(() => {
    const { saveCanvasVersion } = useNotesStore.getState()
    // Save one version immediately on mount (the "before" state)
    saveCanvasVersion(canvas.id)

    // Then auto-save every 1.5 minutes while editing
    const interval = setInterval(() => {
      useNotesStore.getState().saveCanvasVersion(canvas.id)
    }, 90_000) // 1.5 minutes

    return () => clearInterval(interval)
  }, [canvas.id])

  // ── Manual save — flushes React Flow state → store → Firestore immediately ─
  const handleManualSave = useCallback(() => {
    // Sync current React Flow state to store right now (no debounce)
    updateCanvas(canvas.id, {
      nodes: rfNodesToStore(nodesRef.current),
      edges: rfEdgesToStore(edgesRef.current),
    })
    // Flush to Firestore immediately (bypass the 7s debounce)
    const { _uid, canvases } = useNotesStore.getState()
    if (_uid) flushAllPendingCanvases(_uid, canvases)
    markSaved()
  }, [canvas.id, updateCanvas, markSaved])

  const saveEdges = useCallback((newEdges: Edge[]) => {
    updateCanvas(canvas.id, { edges: rfEdgesToStore(newEdges) })
  }, [canvas.id, updateCanvas])

  // ── Node drag stop — use nodesRef (NOT canvas.nodes) ─────────────────────
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    const updated = nodesRef.current.map(n =>
      n.id === node.id ? { ...n, position: node.position } : n
    )
    nodesRef.current = updated
    updateCanvas(canvas.id, { nodes: rfNodesToStore(updated) })
  }, [canvas.id, updateCanvas])

  // ── Node resize (dimensions change) — use nodesRef ───────────────────────
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes)
    const dimChanges = changes.filter((c: any) => c.type === 'dimensions' && c.dimensions)
    if (dimChanges.length > 0) {
      const dimMap = new Map(dimChanges.map((c: any) => [c.id, c.dimensions]))
      const updated = nodesRef.current.map(n => {
        const dim = dimMap.get(n.id)
        return dim ? { ...n, style: { ...n.style, width: dim.width, height: dim.height } } : n
      })
      updateCanvas(canvas.id, { nodes: rfNodesToStore(updated) })
    }
  }, [onNodesChange, canvas.id, updateCanvas])

  // ── Node delete — use nodesRef + edgesRef ────────────────────────────────
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id))
    const updatedNodes = nodesRef.current.filter(n => !ids.has(n.id))
    const updatedEdges = edgesRef.current.filter(e => !ids.has(e.source) && !ids.has(e.target))
    updateCanvas(canvas.id, {
      nodes: rfNodesToStore(updatedNodes),
      edges: rfEdgesToStore(updatedEdges),
    })
  }, [canvas.id, updateCanvas])

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = { ...connection, id: generateId(), type: 'synclyx', animated: true }
    setEdges(eds => {
      const updated = addEdge(newEdge, eds)
      saveEdges(updated)
      return updated
    })
  }, [saveEdges])

  // ── Save viewport when user finishes panning/zooming ─────────────────────
  const onMoveEnd = useCallback((_: any, viewport: any) => {
    updateCanvas(canvas.id, { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } })
  }, [canvas.id, updateCanvas])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setLabelPopupEdge(edge)
  }, [])

  const handleEdgeLabelSave = (edgeId: string, label: string) => {
    setEdges(eds => {
      const updated = eds.map(e => e.id === edgeId ? { ...e, label } : e)
      saveEdges(updated)
      return updated
    })
  }

  const handleEdgeDelete = (edgeId: string) => {
    setEdges(eds => {
      const updated = eds.filter(e => e.id !== edgeId)
      saveEdges(updated)
      return updated
    })
  }

  // ── Add node — use setNodes functional update so nodesRef is always current ─
  const addNode = useCallback((type: string, data: any) => {
    const id = `node-${generateId()}`
    const position = { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const defaultSize = type === 'sticky' ? { width: 200, height: 160 } : { width: 280, height: 180 }
    const newNode: Node = { id, type, position, data, style: defaultSize }

    setNodes(ns => {
      const updated = [...ns, newNode]
      nodesRef.current = updated   // update ref synchronously inside callback
      // Use the complete, up-to-date nodes array — no stale closure
      updateCanvas(canvas.id, { nodes: rfNodesToStore(updated) })
      return updated
    })
  }, [canvas.id, updateCanvas])

  const handleFABAction = useCallback((action: string, extra?: any) => {
    const blockTypes = ['text','heading','list','checklist','code','image','link','video','audio','file','table']
    if (blockTypes.includes(action)) {
      const block: Block = {
        id: generateId(), type: action as BlockType, content: '', createdAt: Date.now(),
        items: action === 'checklist' ? [{ id: generateId(), text: '', checked: false }] : undefined,
      }
      addNode('block', { block })
    } else if (action === 'sticky') {
      addNode('sticky', { label: 'New sticky note', color: '#fef08a' })
    } else if (action === 'link-note' && extra?.noteId) {
      const note = notes.find(n => n.id === extra.noteId)
      if (note) addNode('note', { noteId: extra.noteId, label: note.title })
    }
  }, [addNode, notes])

  return (
    <div className="syncverse-wrap">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgeClick={onEdgeClick}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView snapToGrid snapGrid={[16, 16]}
        defaultViewport={canvas.viewport}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
        <MiniMap style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} nodeColor="var(--accent)" />
        <Panel position="top-left">
          <SyncVerseHeader
            canvas={canvas}
            onRename={name => updateCanvas(canvas.id, { name })}
            syncStatus={syncStatus}
            onManualSave={handleManualSave}
          />
        </Panel>
        <Panel position="top-right">
          <div className="syncverse-hint-panel">Select node/line + Delete key to remove</div>
        </Panel>
      </ReactFlow>

      <CanvasFAB onAction={handleFABAction} notes={notes} />

      {labelPopupEdge && (
        <EdgeLabelPopup
          edge={labelPopupEdge}
          onSave={handleEdgeLabelSave}
          onDelete={handleEdgeDelete}
          onClose={() => setLabelPopupEdge(null)}
        />
      )}
    </div>
  )
}

export default function SyncVerse({ canvas }: Props) {
  return <SyncVerseInner key={canvas.id} canvas={canvas} />
}
