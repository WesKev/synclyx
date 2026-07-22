import React, { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel,
  EdgeLabelRenderer, BaseEdge, getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNotesStore, SyncVerseCanvas, Block, BlockType } from '../../store/notesStore'
import { useSyncVerseThemeStore } from '../../store/syncVerseThemeStore'
import BlockNode from './BlockNode'
import StickyNode from './StickyNode'
import NoteCardNode from './NoteCardNode'
import CanvasFAB from './CanvasFAB'

const nodeTypes = { block: BlockNode, sticky: StickyNode, note: NoteCardNode }
const generateId = () => Math.random().toString(36).slice(2, 10)

function SyncluxEdge({ sourceX, sourceY, targetX, targetY, label, selected, markerEnd, style }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
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

function EdgeLabelPopup({ edge, onSave, onDelete, onClose }: {
  edge: Edge
  onSave: (id: string, label: string) => void
  onDelete: (id: string) => void
  onClose: () => void
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
          <input
            className="link-field" autoFocus
            placeholder="Name this connection (e.g. depends on, leads to...)"
            value={label}
            onChange={e => setLabel(e.target.value)}
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

function SyncVerseHeader({ canvas, onRename }: { canvas: SyncVerseCanvas; onRename: (name: string) => void }) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(canvas.name)
  return (
    <div className="syncverse-header">
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
  )
}

interface Props { canvas: SyncVerseCanvas }

// Inner component — remounts fully when canvas.id changes via key prop from parent
function SyncVerseInner({ canvas }: Props) {
  const { updateCanvas, notes } = useNotesStore()
  const [labelPopupEdge, setLabelPopupEdge] = useState<Edge | null>(null)

  const initialNodes: Node[] = (canvas.nodes || []).map(n => ({
    id: n.id, type: n.type, position: n.position, data: n.data,
    style: { width: n.width || 280, height: n.height || 180 },
  }))

  const initialEdges: Edge[] = (canvas.edges || []).map(e => ({
    id: e.id, source: e.source, target: e.target,
    label: e.label || undefined,
    animated: e.animated ?? true,
    type: 'synclyx',
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const saveEdges = useCallback((newEdges: Edge[]) => {
    updateCanvas(canvas.id, {
      edges: newEdges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
        animated: e.animated,
      }))
    })
  }, [canvas.id, updateCanvas])

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    const updated = (canvas.nodes || []).map(n => n.id === node.id ? { ...n, position: node.position } : n)
    updateCanvas(canvas.id, { nodes: updated })
  }, [canvas, updateCanvas])

  // Persist resize changes (width/height) — NodeResizer changes flow through onNodesChange
  // with a 'dimensions' type change, so we hook into the standard change handler
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes)
    const dimChanges = changes.filter((c: any) => c.type === 'dimensions' && c.dimensions)
    if (dimChanges.length > 0) {
      const updated = (canvas.nodes || []).map(n => {
        const match = dimChanges.find((c: any) => c.id === n.id)
        return match ? { ...n, width: match.dimensions.width, height: match.dimensions.height } : n
      })
      updateCanvas(canvas.id, { nodes: updated })
    }
  }, [onNodesChange, canvas, updateCanvas])

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id))
    const updatedNodes = (canvas.nodes || []).filter(n => !ids.has(n.id))
    const updatedEdges = (canvas.edges || []).filter(e => !ids.has(e.source) && !ids.has(e.target))
    updateCanvas(canvas.id, { nodes: updatedNodes, edges: updatedEdges })
  }, [canvas, updateCanvas])

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = { ...connection, id: generateId(), type: 'synclyx', animated: true }
    setEdges(eds => {
      const updated = addEdge(newEdge, eds)
      saveEdges(updated)
      return updated
    })
  }, [saveEdges])

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

  const addNode = (type: string, data: any) => {
    const id = `node-${generateId()}`
    const position = { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    // Give nodes a sensible default size so they aren't cramped — user can resize via corner handle
    const defaultSize = type === 'sticky' ? { width: 200, height: 160 } : { width: 280, height: 180 }
    const newNode: Node = { id, type, position, data, style: defaultSize }
    setNodes(ns => [...ns, newNode])
    updateCanvas(canvas.id, { nodes: [...(canvas.nodes || []), { id, type: type as any, position, data, width: defaultSize.width, height: defaultSize.height }] })
  }

  const handleFABAction = (action: string, extra?: any) => {
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
  }

  return (
    <div className="syncverse-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultViewport={canvas.viewport}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
        <MiniMap style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} nodeColor="var(--accent)" />
        <Panel position="top-left">
          <SyncVerseHeader canvas={canvas} onRename={name => updateCanvas(canvas.id, { name })} />
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

// Outer wrapper — key={canvas.id} forces a full remount when switching canvases,
// which fixes the bug where old canvas content bled into the new one
export default function SyncVerse({ canvas }: Props) {
  return <SyncVerseInner key={canvas.id} canvas={canvas} />
}
