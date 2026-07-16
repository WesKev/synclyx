import React, { useCallback, useState, useEffect } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel, EdgeLabelRenderer,
  BaseEdge, getStraightPath, getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNotesStore, SyncVerseCanvas, Block, BlockType } from '../../store/notesStore'
import BlockNode from './BlockNode'
import StickyNode from './StickyNode'
import NoteCardNode from './NoteCardNode'
import CanvasFAB from './CanvasFAB'

const nodeTypes = { block: BlockNode, sticky: StickyNode, note: NoteCardNode }

const generateId = () => Math.random().toString(36).slice(2, 10)

// ── Custom Edge with label + delete ───────────────────────────────────────────
function SyncluxEdge({ id, sourceX, sourceY, targetX, targetY, label, selected, markerEnd, style }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY })
  const { updateCanvas } = useNotesStore()
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, stroke: selected ? '#e040fb' : '#a833b9', strokeWidth: selected ? 3 : 2 }} />
      {label && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', zIndex: 10 }}
            className="edge-label-wrap">
            <span className="edge-label">{label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
      {selected && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${(sourceX+targetX)/2}px,${(sourceY+targetY)/2 - 20}px)`, pointerEvents: 'all', zIndex: 20 }}
            className="edge-delete-btn-wrap">
            <button className="edge-delete-btn" title="Delete connection"
              onClick={() => {
                // Will be handled via onEdgesChange
                document.dispatchEvent(new CustomEvent('synclyx:delete-edge', { detail: id }))
              }}>✕</button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { synclyx: SyncluxEdge }

// ── Edge Label Popup ───────────────────────────────────────────────────────────
function EdgeLabelPopup({ edge, onSave, onClose }: { edge: Edge; onSave: (id: string, label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState((edge.label as string) || '')
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" style={{ maxWidth: '20rem' }} onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>🔗 Name this connection</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-body">
          <input className="link-field" autoFocus placeholder="e.g. depends on, leads to, relates to..."
            value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(edge.id, label); onClose() } if (e.key === 'Escape') onClose() }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.5rem' }}>
            Leave empty to remove the label. Hover the line to see it.
          </p>
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onClose}>Cancel</button>
          <button className="popup-confirm" onClick={() => { onSave(edge.id, label); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}

interface Props { canvas: SyncVerseCanvas }

function SyncVerseHeader({ canvas, onRename }: { canvas: SyncVerseCanvas; onRename: (name: string) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(canvas.name)
  return (
    <div className="syncverse-header">
      {editing ? (
        <input className="syncverse-title-input" value={val} autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={() => { onRename(val); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { onRename(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        />
      ) : (
        <span className="syncverse-title" onClick={() => setEditing(true)} title="Click to rename">
          🌐 {canvas.name} ✎
        </span>
      )}
      <span className="syncverse-hint">Drag nodes · Connect ports · Click line to name/delete</span>
    </div>
  )
}

export default function SyncVerse({ canvas }: Props) {
  const { updateCanvas, notes } = useNotesStore()
  const [labelPopupEdge, setLabelPopupEdge] = useState<Edge | null>(null)

  // Load nodes from canvas
  const initialNodes: Node[] = canvas.nodes.map(n => ({
    id: n.id, type: n.type, position: n.position, data: n.data,
    style: { width: n.width, height: n.height },
  }))

  // Load edges from canvas — restore persisted edges
  const initialEdges: Edge[] = (canvas.edges || []).map(e => ({
    id: e.id, source: e.source, target: e.target,
    label: e.label, animated: e.animated,
    type: 'synclyx',
    style: { stroke: '#a833b9', strokeWidth: 2 },
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Listen for edge delete events from custom edge component
  useEffect(() => {
    const handler = (e: Event) => {
      const edgeId = (e as CustomEvent).detail
      setEdges(eds => {
        const updated = eds.filter(ed => ed.id !== edgeId)
        updateCanvas(canvas.id, {
          edges: updated.map(ed => ({ id: ed.id, source: ed.source, target: ed.target, label: typeof ed.label === 'string' ? ed.label : undefined, animated: ed.animated }))
        })
        return updated
      })
    }
    document.addEventListener('synclyx:delete-edge', handler)
    return () => document.removeEventListener('synclyx:delete-edge', handler)
  }, [canvas.id])

  // Persist edges on every change
  const persistEdges = useCallback((newEdges: Edge[]) => {
    updateCanvas(canvas.id, {
      edges: newEdges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
        animated: e.animated,
      }))
    })
  }, [canvas.id, updateCanvas])

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = {
      ...connection, id: generateId(),
      type: 'synclyx',
      style: { stroke: '#a833b9', strokeWidth: 2 },
      animated: true,
    }
    setEdges(eds => {
      const updated = addEdge(newEdge, eds)
      persistEdges(updated)
      return updated
    })
  }, [persistEdges])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setLabelPopupEdge(edge)
  }, [])

  const handleEdgeLabel = (edgeId: string, label: string) => {
    setEdges(eds => {
      const updated = eds.map(e => e.id === edgeId ? { ...e, label } : e)
      persistEdges(updated)
      return updated
    })
  }

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    const updated = canvas.nodes.map(n => n.id === node.id ? { ...n, position: node.position } : n)
    updateCanvas(canvas.id, { nodes: updated })
  }, [canvas, updateCanvas])

  // Delete node
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id))
    const updatedNodes = canvas.nodes.filter(n => !ids.has(n.id))
    const updatedEdges = canvas.edges.filter(e => !ids.has(e.source) && !ids.has(e.target))
    updateCanvas(canvas.id, { nodes: updatedNodes, edges: updatedEdges })
  }, [canvas, updateCanvas])

  const addNode = (type: string, data: any, position?: { x: number; y: number }) => {
    const id = `node-${generateId()}`
    const pos = position || { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 }
    const newNode: Node = { id, type, position: pos, data }
    setNodes(ns => [...ns, newNode])
    updateCanvas(canvas.id, { nodes: [...canvas.nodes, { id, type: type as any, position: pos, data }] })
  }

  const handleFABAction = (action: string, extra?: any) => {
    const blockActions = ['text','heading','list','checklist','code','image','link','video','audio','file','table']
    if (blockActions.includes(action)) {
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
  }

  return (
    <div className="syncverse-wrap">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={changes => { onEdgesChange(changes) }}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView snapToGrid snapGrid={[16, 16]}
        defaultViewport={canvas.viewport}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
        <MiniMap style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} nodeColor="var(--accent)" />
        <Panel position="top-left">
          <SyncVerseHeader canvas={canvas} onRename={(name) => updateCanvas(canvas.id, { name })} />
        </Panel>
        <Panel position="top-right">
          <div className="syncverse-hint-panel">Press Delete to remove selected node or line</div>
        </Panel>
      </ReactFlow>
      <CanvasFAB onAction={handleFABAction} notes={notes} />

      {labelPopupEdge && (
        <EdgeLabelPopup
          edge={labelPopupEdge}
          onSave={handleEdgeLabel}
          onClose={() => setLabelPopupEdge(null)}
        />
      )}
    </div>
  )
}
