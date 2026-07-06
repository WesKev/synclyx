import React, { useEffect, useRef } from 'react'

interface Props {
  position: { x: number; y: number }
  onFormat: (fmt: string) => void
  onClose: () => void
}

const formats = [
  { id: 'bold', label: 'B', title: 'Bold (Ctrl+B)', style: { fontWeight: 700 } },
  { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)', style: { fontStyle: 'italic' } },
  { id: 'strikethrough', label: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
  { id: 'code', label: '<>', title: 'Inline code', style: { fontFamily: 'monospace' } },
]

export default function FormatToolbar({ position, onFormat, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="format-toolbar"
      style={{
        position: 'fixed',
        left: Math.min(position.x - 80, window.innerWidth - 200),
        top: position.y - 44,
        zIndex: 500,
      }}
    >
      {formats.map(f => (
        <button key={f.id} className="format-btn" title={f.title}
          style={f.style} onMouseDown={e => { e.preventDefault(); onFormat(f.id) }}>
          {f.label}
        </button>
      ))}
      <div className="format-divider" />
      <select className="format-heading-select"
        onChange={e => { onFormat(e.target.value); e.target.value = '' }}
        defaultValue="">
        <option value="" disabled>H</option>
        <option value="h1">H1</option>
        <option value="h2">H2</option>
        <option value="h3">H3</option>
      </select>
    </div>
  )
}
