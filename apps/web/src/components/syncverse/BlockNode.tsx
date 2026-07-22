import React, { useState } from 'react'
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react'
import { Block, ChecklistItem } from '../../store/notesStore'

const generateId = () => Math.random().toString(36).slice(2, 10)

export default function BlockNode({ id, data, selected }: NodeProps) {
  const block = data.block as Block
  const [collapsed, setCollapsed] = useState(false)
  const [localContent, setLocalContent] = useState(block?.content || '')
  const [localItems, setLocalItems] = useState<ChecklistItem[]>(block?.items || [])
  const [code, setCode] = useState(block?.meta?.content || '')
  const [lang, setLang] = useState(block?.meta?.lang || 'javascript')
  const { deleteElements } = useReactFlow()

  const getIcon = () => {
    const icons: Record<string, string> = {
      text: '¶', code: '</>', image: '🖼', link: '🔗', video: '🎬',
      audio: '🎵', file: '📎', table: '⊞', checklist: '✓', heading: 'H', list: '≡'
    }
    return icons[block?.type] || '¶'
  }

  const getPreview = () => {
    if (!block) return ''
    switch (block.type) {
      case 'text': return block.content?.slice(0, 120) || 'Empty text block'
      case 'heading': return block.meta?.text || block.content || 'Heading'
      case 'code': return `// ${block.meta?.lang || 'code'}\n${(block.meta?.content || '').slice(0, 80)}`
      case 'link': return block.meta?.label || block.meta?.url || 'Link'
      case 'image': return block.meta?.name || 'Image'
      case 'checklist': return `${block.items?.filter(i => i.checked).length || 0}/${block.items?.length || 0} done`
      default: return block.type
    }
  }

  const renderBody = () => {
    if (!block) return null
    switch (block.type) {
      case 'text':
        return <textarea className="sv-editable-text sv-fill-height" value={localContent}
          onChange={e => setLocalContent(e.target.value)} placeholder="Type something..." />
      case 'heading':
        return <input className="sv-editable-heading" value={localContent}
          onChange={e => setLocalContent(e.target.value)} placeholder="Heading..." />
      case 'code':
        return (
          <div className="sv-code-wrap sv-fill-height">
            <select className="sv-code-lang" value={lang} onChange={e => setLang(e.target.value)}>
              {['javascript','typescript','python','html','css','json','bash','sql'].map(l =>
                <option key={l} value={l}>{l}</option>)}
            </select>
            <textarea className="sv-editable-code sv-fill-height" value={code}
              onChange={e => setCode(e.target.value)} placeholder={`// ${lang}...`} spellCheck={false} />
          </div>
        )
      case 'checklist':
        return (
          <div className="sv-checklist sv-fill-height">
            {localItems.map((item, idx) => (
              <div key={item.id} className="sv-check-item">
                <button className={`sv-check-box ${item.checked ? 'checked' : ''}`}
                  onClick={() => setLocalItems(items => items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}>
                  {item.checked ? '✓' : ''}
                </button>
                <input className={`sv-check-text ${item.checked ? 'done' : ''}`} value={item.text}
                  onChange={e => setLocalItems(items => items.map(i => i.id === item.id ? { ...i, text: e.target.value } : i))}
                  placeholder="Checklist item..." />
              </div>
            ))}
            <button className="sv-check-add"
              onClick={() => setLocalItems(items => [...items, { id: generateId(), text: '', checked: false }])}>
              + Add item
            </button>
          </div>
        )
      case 'image':
        return block.meta?.url
          ? <img src={block.meta.url} alt={block.meta.name} className="sv-node-img sv-fill-height" />
          : <div className="sv-placeholder">🖼 Image block</div>
      case 'link':
        return block.meta?.url
          ? <a href={block.meta.url} target="_blank" rel="noopener noreferrer" className="sv-link-card">
              🔗 {block.meta.label || block.meta.url}
            </a>
          : <div className="sv-placeholder">🔗 Link block</div>
      default:
        return <p className="sv-node-text">{getPreview()}</p>
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent, #a833b9)' }}
        lineStyle={{ borderColor: 'var(--accent, #a833b9)' }}
      />
      <div className={`sv-node sv-block-node sv-node-resizable ${selected ? 'sv-node-selected' : ''} sv-type-${block?.type}`}>
        <Handle type="target" position={Position.Left} className="sv-handle" />
        <Handle type="source" position={Position.Right} className="sv-handle" />
        <Handle type="target" position={Position.Top} className="sv-handle sv-handle-top" />
        <Handle type="source" position={Position.Bottom} className="sv-handle sv-handle-bottom" />

        <div className="sv-node-header">
          <span className="sv-node-icon">{getIcon()}</span>
          <span className="sv-node-type">{block?.type || 'block'}</span>
          <button className="sv-node-collapse" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▶' : '▼'}
          </button>
          <button className="sv-node-delete" onClick={() => deleteElements({ nodes: [{ id }] })} title="Delete node">✕</button>
        </div>

        {!collapsed && <div className="sv-node-body sv-node-body-fill">{renderBody()}</div>}
      </div>
    </>
  )
}
