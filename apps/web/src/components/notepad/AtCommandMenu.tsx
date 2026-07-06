import React, { useEffect, useRef } from 'react'
import { BlockType } from '../../store/notesStore'

const commands: { type: BlockType; label: string; icon: string; desc: string }[] = [
  { type: 'text',      label: 'Text',      icon: '¶',    desc: 'Plain paragraph' },
  { type: 'heading',   label: 'Heading',   icon: 'H',    desc: 'H1, H2 or H3' },
  { type: 'list',      label: 'List',      icon: '≡',    desc: 'Bullet or numbered' },
  { type: 'checklist', label: 'Checklist', icon: '✓',    desc: 'Tickable items' },
  { type: 'code',      label: 'Code',      icon: '</>',   desc: 'Code editor' },
  { type: 'table',     label: 'Table',     icon: '⊞',    desc: 'Spreadsheet table' },
  { type: 'image',     label: 'Image',     icon: '🖼',    desc: 'Insert image' },
  { type: 'link',      label: 'Link',      icon: '🔗',    desc: 'Link card' },
  { type: 'video',     label: 'Video',     icon: '🎬',    desc: 'Embed video' },
  { type: 'audio',     label: 'Audio',     icon: '🎵',    desc: 'Embed audio' },
  { type: 'file',      label: 'File',      icon: '📎',    desc: 'Attach file' },
]

interface Props {
  query: string
  position: { x: number; y: number }
  onSelect: (type: BlockType) => void
  onClose: () => void
}

export default function AtCommandMenu({ query, position, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const filtered = commands.filter(c => c.label.toLowerCase().startsWith(query.toLowerCase()))

  // Smart position — never go offscreen
  const menuW = 320
  const menuH = Math.min(filtered.length * 52 + 36, 360)
  const spaceBelow = window.innerHeight - position.y - 8
  const spaceRight = window.innerWidth - position.x - 8

  const style: React.CSSProperties = {
    left: spaceRight < menuW ? Math.max(8, position.x - menuW) : position.x,
  }
  if (spaceBelow < menuH) {
    style.bottom = window.innerHeight - position.y + 8
  } else {
    style.top = position.y + 4
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (filtered.length === 0) return null

  // Split into 2 columns
  const col1 = filtered.slice(0, Math.ceil(filtered.length / 2))
  const col2 = filtered.slice(Math.ceil(filtered.length / 2))

  return (
    <div ref={ref} className="at-menu at-menu-2col" style={style}>
      <div className="at-menu-header">↯ Insert block</div>
      <div className="at-menu-grid">
        {[col1, col2].map((col, ci) => (
          <div key={ci} className="at-menu-col">
            {col.map(cmd => (
              <button key={cmd.type} className="at-menu-item" onClick={() => onSelect(cmd.type)}>
                <span className="at-menu-icon">{cmd.icon}</span>
                <div className="at-menu-text">
                  <span className="at-menu-label">{cmd.label}</span>
                  <span className="at-menu-desc">{cmd.desc}</span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
