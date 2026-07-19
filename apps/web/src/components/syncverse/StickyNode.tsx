import React, { useState } from 'react'
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react'

const STICKY_COLORS = ['#fef08a','#bbf7d0','#bfdbfe','#f5d0fe','#fed7aa','#fecaca']

export default function StickyNode({ id, data, selected }: NodeProps) {
  const [text, setText] = useState((data.label as string) || '')
  const [color, setColor] = useState((data.color as string) || '#fef08a')
  const [showColors, setShowColors] = useState(false)
  const { deleteElements } = useReactFlow()

  return (
    <div className={`sv-node sv-sticky-node ${selected ? 'sv-node-selected' : ''}`} style={{ background: color }}>
      <Handle type="target" position={Position.Left} className="sv-handle" />
      <Handle type="source" position={Position.Right} className="sv-handle" />
      <Handle type="target" position={Position.Top} className="sv-handle sv-handle-top" />
      <Handle type="source" position={Position.Bottom} className="sv-handle sv-handle-bottom" />

      <div className="sv-sticky-toolbar">
        <button className="sv-sticky-color-btn" onClick={() => setShowColors(s => !s)}>🎨</button>
        <button className="sv-node-delete" onClick={() => deleteElements({ nodes: [{ id }] })} title="Delete">✕</button>
        {showColors && (
          <div className="sv-color-picker">
            {STICKY_COLORS.map(c => (
              <button key={c} className="sv-color-dot" style={{ background: c }}
                onClick={() => { setColor(c); setShowColors(false) }} />
            ))}
          </div>
        )}
      </div>
      <textarea className="sv-sticky-text" value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Sticky note..."
        style={{ background: 'transparent' }}
      />
    </div>
  )
}
