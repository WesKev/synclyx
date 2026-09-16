import React, { useCallback, useState, useRef, useEffect } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel,
  EdgeLabelRenderer, BaseEdge, getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNotesStore, SyncVerseCanvas, Block, BlockType, SyncVerseNode, SyncVerseEdge, flushAllPendingNotesAndCanvases } from '../../store/notesStore'
import { useSyncVerseThemeStore } from '../../store/syncVerseThemeStore'
import BlockNode from './BlockNode'
import StickyNode from './StickyNode'
import NoteCardNode from './NoteCardNode'
import CanvasFAB from './CanvasFAB'
import SyncIndicator from '../shared/SyncIndicator'
import { useSyncStatus } from '../../hooks/useSyncStatus'

const nodeTypes = { block: BlockNode, sticky: StickyNode, note: NoteCardNode }
const generateId = () => Math.random().toString(36).slice(2, 10)

// Shifted right from the very first spawn point so nodes never appear
// tucked under the SyncVerse sidebar edge.
const NODE_SPAWN_BASE_X = 300
const NODE_SPAWN_RANGE_X = 300
const NODE_SPAWN_BASE_Y = 150
const NODE_SPAWN_RANGE_Y = 200

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

  // ── Always-current refs ───────────────────────────────────────────────────
  // Every callback that calls updateCanvas uses these, never canvas.nodes/edges
  // from the closure (which is a snapshot frozen at render time).
  const nodesRef = useRef<Node[]>(initialNodes)
  const edgesRef = useRef<Edge[]>(initialEdges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  const { status: syncStatus, markSaved } = useSyncStatus(canvas.updatedAt, 1000)

  // ── Comprehensive save watcher ────────────────────────────────────────────
  // Catches every node/edge change (drag, delete, resize, connect) that isn't
  // already handled by a more specific callback below. updateCanvas() itself
  // now decides immediate-vs-debounced based on whether the change is
  // structural — see notesStore.ts.
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    updateCanvas(canvas.id, {
      nodes: rfNodesToStore(nodesRef.current),
      edges: rfEdgesToStore(edgesRef.current),
    })
  }, [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flush immediately on unmount (view switch) ────────────────────────────
  useEffect(() => {
    return () => {
      updateCanvas(canvas.id, {
        nodes: rfNodesToStore(nodesRef.current),
        edges: rfEdgesToStore(edgesRef.current),
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── NO mount versioning. NO interval versioning. ──────────────────────────
  // Versions save in exactly two places: canvas switch (handled inside the
  // store's setActiveCanvas) and the manual "Save now" button below. This is
  // the direct fix for the bug where opening a canvas on a fresh browser —
  // before Firestore's real data had arrived — captured empty/stale state as
  // a "version" and, because saveCanvasVersion writes the WHOLE canvas
  // document, silently wiped real nodes/edges in the cloud.

  const handleManualSave = useCallback(() => {
    updateCanvas(canvas.id, {
      nodes: rfNodesToStore(nodesRef.current),
      edges: rfEdgesToStore(edgesRef.current),
    })
    useNotesStore.getState().saveCanvasVersion(canvas.id)
    const { _uid } = useNotesStore.getState()
    if (_uid) flushAllPendingNotesAndCanvases(_uid)
    markSaved()
  }, [canvas.id, updateCanvas, markSaved])

  const saveEdges = useCallback((newEdges: Edge[]) => {
    updateCanvas(canvas.id, { edges: rfEdgesToStore(newEdges) })
  }, [canvas.id, updateCanvas])

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    const updated = nodesRef.current.map(n =>
      n.id === node.id ? { ...n, position: node.position } : n
    )
    nodesRef.current = updated
    updateCanvas(canvas.id, { nodes: rfNodesToStore(updated) })
  }, [canvas.id, updateCanvas])

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

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id))
    const updatedNodes = nodesRef.current.filter(n => !ids.has(n.id))
    const updatedEdges = edgesRef.current.filter(e => !ids.has(e.source) && !ids.has(e.target))
    updateCanvas(canvas.id, {
      nodes: rfNodesToStore(updatedNodes),
      edges: rfEdgesToStore(updatedEdges),
    })
  }, [canvas.id, updateCanvas])

  // NOTE: side effects (updateCanvas, a DIFFERENT store's setState) must never
  // run inside a React setState functional updater — React can invoke that
  // function more than once, or at an unsafe time, and doing cross-store
  // writes from inside it is exactly what caused the screen to go blank when
  // adding a node or connection. Fixed below: compute the new array first,
  // commit it to React state directly, THEN call the store side effect.
  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = { ...connection, id: generateId(), type: 'synclyx', animated: true }
    const updated = addEdge(newEdge, edgesRef.current)
    edgesRef.current = updated
    setEdges(updated)
    saveEdges(updated)
  }, [saveEdges])

  const onMoveEnd = useCallback((_: any, viewport: any) => {
    updateCanvas(canvas.id, { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } })
  }, [canvas.id, updateCanvas])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setLabelPopupEdge(edge)
  }, [])

  const handleEdgeLabelSave = (edgeId: string, label: string) => {
    const updated = edgesRef.current.map(e => e.id === edgeId ? { ...e, label } : e)
    edgesRef.current = updated
    setEdges(updated)
    saveEdges(updated)
  }

  const handleEdgeDelete = (edgeId: string) => {
    const updated = edgesRef.current.filter(e => e.id !== edgeId)
    edgesRef.current = updated
    setEdges(updated)
    saveEdges(updated)
  }

  const addNode = useCallback((type: string, data: any) => {
    const id = `node-${generateId()}`
    const position = {
      x: NODE_SPAWN_BASE_X + Math.random() * NODE_SPAWN_RANGE_X,
      y: NODE_SPAWN_BASE_Y + Math.random() * NODE_SPAWN_RANGE_Y,
    }
    const defaultSize = type === 'sticky' ? { width: 200, height: 160 } : { width: 280, height: 180 }
    const newNode: Node = { id, type, position, data, style: defaultSize }

    const updated = [...nodesRef.current, newNode]
    nodesRef.current = updated
    setNodes(updated)
    updateCanvas(canvas.id, { nodes: rfNodesToStore(updated) })
  }, [canvas.id, updateCanvas, setNodes])

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
