import React, { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNotesStore, SyncVerseCanvas, Block, BlockType } from '../../store/notesStore'
import BlockNode from './BlockNode'
import StickyNode from './StickyNode'
import NoteCardNode from './NoteCardNode'
import CanvasFAB from './CanvasFAB'

const nodeTypes = {
  block: BlockNode,
  sticky: StickyNode,
  note: NoteCardNode,
}

interface Props {
  canvas: SyncVerseCanvas
}

const generateId = () => Math.random().toString(36).slice(2, 10)

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
      <span className="syncverse-hint">Drag nodes · Connect ports · Scroll to zoom</span>
    </div>
  )
}

export default function SyncVerse({ canvas }: Props) {
  const { updateCanvas, notes } = useNotesStore()

  const initialNodes: Node[] = canvas.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    style: { width: n.width, height: n.height },
  }))

  const initialEdges: Edge[] = canvas.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.animated,
    style: { stroke: '#a833b9', strokeWidth: 2 },
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback((connection: Connection) => {
    const newEdge = { ...connection, id: generateId(), style: { stroke: '#a833b9', strokeWidth: 2 }, animated: true }
    setEdges(eds => addEdge(newEdge, eds))
  }, [])

  // Persist positions on drag stop
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    const updated = canvas.nodes.map(n =>
      n.id === node.id ? { ...n, position: node.position } : n
    )
    updateCanvas(canvas.id, { nodes: updated })
  }, [canvas, updateCanvas])

  const onEdgesChangeAndPersist = useCallback((changes: any) => {
    onEdgesChange(changes)
    setTimeout(() => {
      setEdges(current => {
        updateCanvas(canvas.id, {
          edges: current.map(e => ({
            id: e.id, source: e.source, target: e.target,
            label: typeof e.label === 'string' ? e.label : undefined,
            animated: e.animated,
          }))
        })
        return current
      })
    }, 100)
  }, [canvas.id, updateCanvas])

  const addNode = (type: string, data: any, position?: { x: number; y: number }) => {
    const id = `node-${generateId()}`
    const pos = position || { x: 200 + Math.random() * 400, y: 200 + Math.random() * 300 }
    const newNode: Node = { id, type, position: pos, data }
    setNodes(ns => [...ns, newNode])
    const storeNode = { id, type: type as any, position: pos, data }
    updateCanvas(canvas.id, { nodes: [...canvas.nodes, storeNode] })
  }

  const handleFABAction = (action: string, extra?: any) => {
    switch (action) {
      case 'text':
      case 'heading':
      case 'list':
      case 'checklist':
      case 'code':
      case 'image':
      case 'link':
      case 'video':
      case 'audio':
      case 'file':
      case 'table': {
        const block: Block = {
          id: generateId(), type: action as BlockType,
          content: '', createdAt: Date.now(),
          items: action === 'checklist' ? [{ id: generateId(), text: '', checked: false }] : undefined,
        }
        addNode('block', { block })
        break
      }
      case 'sticky':
        addNode('sticky', { label: 'New sticky note', color: '#fef08a' })
        break
      case 'link-note':
        if (extra?.noteId) {
          const note = notes.find(n => n.id === extra.noteId)
          if (note) addNode('note', { noteId: extra.noteId, label: note.title })
        }
        break
    }
  }

  return (
    <div className="syncverse-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChangeAndPersist}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultViewport={canvas.viewport}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
        <MiniMap
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          nodeColor="var(--accent)"
        />
        <Panel position="top-left">
          <SyncVerseHeader canvas={canvas} onRename={(name) => updateCanvas(canvas.id, { name })} />
        </Panel>
      </ReactFlow>
      <CanvasFAB onAction={handleFABAction} notes={notes} />
    </div>
  )
}
