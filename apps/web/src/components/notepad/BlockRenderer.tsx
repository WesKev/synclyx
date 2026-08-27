import MarkdownText from '../shared/MarkdownText'
import CodeBlockCM from './CodeBlock'
import TableBlockPro from './TableBlock'
import React, { useRef, useEffect, useState } from 'react'
import { Block, ChecklistItem } from '../../store/notesStore'

const generateId = () => Math.random().toString(36).slice(2, 10)

interface Props {
  block: Block
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onRemove: () => void
  onUpdateMeta: (meta: Record<string, string>) => void
  onUpdateItems: (items: ChecklistItem[]) => void
  onAddBlockAfter: (type: 'text') => void
}

export default function BlockRenderer(props: Props) {
  switch (props.block.type) {
    case 'text':      return <TextBlock {...props} />
    case 'heading':   return <HeadingBlock {...props} />
    case 'list':      return <ListBlock {...props} />
    case 'checklist': return <ChecklistBlock {...props} />
    case 'code':      return <CodeBlock {...props} />
    case 'image':     return <ImageBlock {...props} />
    case 'link':      return <LinkBlock {...props} />
    case 'table':     return <TableBlock {...props} />
    case 'audio':     return <AudioBlock {...props} />
    case 'video':     return <VideoBlock {...props} />
    case 'file':      return <FileBlock {...props} />
    default: return null
  }
}

// ─── Text Block ───────────────────────────────────────────────────────────────
function TextBlock({ block, onKeyDown, onChange }: Props) {
  return (
    <div className="block block-text-wrap">
      <MarkdownText
        value={block.content}
        blockId={block.id}
        onChange={(val) => {
          const syntheticEvent = { target: { value: val } } as React.ChangeEvent<HTMLTextAreaElement>
          onChange(syntheticEvent)
        }}
        onKeyDown={onKeyDown}
        placeholder="Type or @ for blocks..."
      />
    </div>
  )
}

// ─── Heading Block ────────────────────────────────────────────────────────────
function HeadingBlock({ block, onRemove, onUpdateMeta, onAddBlockAfter }: Props) {
  const [level, setLevel] = useState(block.meta?.level || 'h1')
  const [focused, setFocused] = useState(false)

  const pickLevel = (h: string) => {
    setLevel(h)
    onUpdateMeta({ ...block.meta, level: h })
    setFocused(false)
  }

  return (
    <div className="block block-heading">
      {focused && (
        <div className="heading-controls">
          {['h1','h2','h3'].map(h => (
            <button key={h} className={`heading-btn ${level === h ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); pickLevel(h) }}>
              {h.toUpperCase()}
            </button>
          ))}
          <button className="block-remove-inline" onMouseDown={e => { e.preventDefault(); onRemove() }}>✕</button>
        </div>
      )}
      <input className={`heading-input ${level}`}
        value={block.content}
        data-block-id={block.id}
        onChange={e => onUpdateMeta({ ...block.meta, level, content: e.target.value, _content: e.target.value })}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onAddBlockAfter('text') }
          if (e.key === 'Backspace' && block.content === '') { e.preventDefault(); onRemove() }
        }}
        placeholder={`${level.toUpperCase()} Heading...`}
      />
    </div>
  )
}

// ─── List Block ───────────────────────────────────────────────────────────────
// Has an editable name header (like Checklist), bullet/numbered toggle,
// and a remove button that only appears on focus (less dangerous).
function ListBlock({ block, onRemove, onUpdateMeta, onAddBlockAfter }: Props) {
  const [ordered, setOrdered] = useState(block.meta?.ordered === 'true')
  const [name, setName] = useState(block.meta?.name || '')
  const [items, setItems] = useState<string[]>(
    block.meta?.items ? JSON.parse(block.meta.items) : ['']
  )
  const [focused, setFocused] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const save = (nextOrdered: boolean, nextItems: string[], nextName: string) => {
    onUpdateMeta({
      ...block.meta,
      ordered: String(nextOrdered),
      items: JSON.stringify(nextItems),
      name: nextName,
    })
  }

  const update = (idx: number, val: string) => {
    const next = items.map((item, i) => i === idx ? val : item)
    setItems(next)
    save(ordered, next, name)
  }

  const addItem = (afterIdx: number) => {
    const next = [...items.slice(0, afterIdx + 1), '', ...items.slice(afterIdx + 1)]
    setItems(next)
    save(ordered, next, name)
    setTimeout(() => refs.current[afterIdx + 1]?.focus(), 30)
  }

  const removeItem = (idx: number) => {
    if (items.length === 1) { onRemove(); return }
    const next = items.filter((_, i) => i !== idx)
    setItems(next)
    save(ordered, next, name)
    setTimeout(() => refs.current[Math.max(0, idx - 1)]?.focus(), 30)
  }

  const toggleOrdered = (val: boolean) => {
    setOrdered(val)
    save(val, items, name)
  }

  return (
    <div
      className="block block-list"
      onFocus={() => setFocused(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false) }}
    >
      {/* Header — always visible, editable name like checklist */}
      <div className="list-header">
        <span className="list-header-icon">{ordered ? '1.' : '•'}</span>
        <input
          className="list-name-input"
          value={name}
          placeholder="List name (optional)…"
          onChange={e => { setName(e.target.value); save(ordered, items, e.target.value) }}
        />
        {focused && (
          <div className="list-header-controls">
            <button
              className={`list-type-btn ${!ordered ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); toggleOrdered(false) }}
              title="Bullet list"
            >• Bullet</button>
            <button
              className={`list-type-btn ${ordered ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); toggleOrdered(true) }}
              title="Numbered list"
            >1. Numbered</button>
            {/* Remove only visible on focus — less likely to be hit by accident */}
            <button
              className="block-remove-inline"
              onMouseDown={e => { e.preventDefault(); onRemove() }}
              title="Remove list"
            >✕</button>
          </div>
        )}
      </div>

      <div className="list-items">
        {items.map((item, idx) => (
          <div key={idx} className="list-item">
            <span className="list-marker">{ordered ? `${idx + 1}.` : '•'}</span>
            <input
              ref={el => { refs.current[idx] = el }}
              className="list-item-input"
              value={item}
              onChange={e => update(idx, e.target.value)}
              placeholder="List item..."
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addItem(idx) }
                if (e.key === 'Backspace' && item === '') { e.preventDefault(); removeItem(idx) }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Checklist Block ──────────────────────────────────────────────────────────
function ChecklistBlock({ block, onRemove, onUpdateMeta, onUpdateItems }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>(
    block.items || [{ id: generateId(), text: '', checked: false }]
  )
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const update = (updated: ChecklistItem[]) => {
    setItems(updated)
    onUpdateItems(updated)
  }

  const toggle = (id: string) =>
    update(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))

  const setText = (id: string, text: string) =>
    update(items.map(i => i.id === id ? { ...i, text } : i))

  const addItem = (afterId: string) => {
    const idx = items.findIndex(i => i.id === afterId)
    const newItem = { id: generateId(), text: '', checked: false }
    const next = [...items.slice(0, idx + 1), newItem, ...items.slice(idx + 1)]
    update(next)
    setTimeout(() => refs.current[idx + 1]?.focus(), 30)
  }

  const removeItem = (id: string) => {
    if (items.length === 1) { onRemove(); return }
    update(items.filter(i => i.id !== id))
  }

  const done = items.filter(i => i.checked).length
  const [name, setName] = useState(block.meta?.name || '')

  return (
    <div className="block block-checklist">
      <div className="checklist-header">
        <span className="checklist-icon">✓</span>
        <input className="checklist-name-input" value={name}
          placeholder="Checklist name..."
          onChange={e => { setName(e.target.value); onUpdateMeta({ ...block.meta, name: e.target.value }) }}
        />
        <span className="checklist-progress">{done}/{items.length}</span>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      <div className="checklist-progress-bar">
        <div className="checklist-progress-fill" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      {items.map((item, idx) => (
        <div key={item.id} className={`checklist-item ${item.checked ? 'checked' : ''}`}>
          <button className="checklist-check" onClick={() => toggle(item.id)}>
            {item.checked ? '✓' : ''}
          </button>
          <input ref={el => { refs.current[idx] = el }}
            className="checklist-text" value={item.text}
            onChange={e => setText(item.id, e.target.value)}
            placeholder="Checklist item..."
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addItem(item.id) }
              if (e.key === 'Backspace' && item.text === '') { e.preventDefault(); removeItem(item.id) }
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Code Block ───────────────────────────────────────────────────────────────
function CodeBlock({ block, onRemove, onUpdateMeta }: Props) {
  return (
    <CodeBlockCM
      code={block.meta?.content || block.content || ''}
      language={block.meta?.lang || 'javascript'}
      onChange={(code: string, lang: string) => onUpdateMeta({ ...block.meta, lang, content: code })}
      onRemove={onRemove}
    />
  )
}

// ─── Image Block ──────────────────────────────────────────────────────────────
function ImageBlock({ block, onRemove }: Props) {
  return (
    <div className="block block-image">
      <div className="block-media-header">
        <span className="media-label">🖼 {block.meta?.name || 'Image'}</span>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      {block.meta?.url
        ? <img src={block.meta.url} alt={block.meta.name || 'image'} className="block-img" />
        : <div className="block-placeholder">No image selected</div>}
    </div>
  )
}

// ─── Link Block ───────────────────────────────────────────────────────────────
function LinkBlock({ block, onRemove, onUpdateMeta }: Props) {
  const [url, setUrl] = useState(block.meta?.url || '')
  const [label, setLabel] = useState(block.meta?.label || '')
  const [saved, setSaved] = useState(!!block.meta?.url)
  const save = () => { if (!url) return; onUpdateMeta({ url, label }); setSaved(true) }
  if (saved && url) return (
    <div className="block block-link">
      <a href={url} target="_blank" rel="noopener noreferrer" className="link-card">
        <span className="link-icon">🔗</span>
        <div className="link-text">
          <span className="link-label">{label || url}</span>
          <span className="link-url">{url}</span>
        </div>
      </a>
      <button className="block-remove-inline" onClick={() => setSaved(false)} title="Edit">✎</button>
      <button className="block-remove-inline" onClick={onRemove} title="Remove">✕</button>
    </div>
  )
  return (
    <div className="block block-link-input">
      <input className="link-field" placeholder="https://..." value={url} autoFocus
        onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
      <input className="link-field" placeholder="Label (optional)" value={label}
        onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
      <div className="link-actions">
        <button className="popup-cancel" onClick={onRemove}>Cancel</button>
        <button className="popup-confirm" onClick={save}>Add Link</button>
      </div>
    </div>
  )
}

// ─── Table Block ──────────────────────────────────────────────────────────────
function TableBlock({ block, onRemove, onUpdateMeta }: Props) {
  const rows = parseInt(block.meta?.rows || '3')
  const cols = parseInt(block.meta?.cols || '3')
  const initialData = block.meta?.tableData ? JSON.parse(block.meta.tableData) : undefined
  const initialMeta = block.meta?.tableMeta ? JSON.parse(block.meta.tableMeta) : undefined
  return (
    <TableBlockPro rows={rows} cols={cols} initialData={initialData}
      initialMeta={initialMeta}
      onChange={(data, tableMeta) => onUpdateMeta({ ...block.meta, tableData: JSON.stringify(data), tableMeta: JSON.stringify(tableMeta) })}
      onRemove={onRemove}
    />
  )
}

// ─── Audio / Video / File ─────────────────────────────────────────────────────
function AudioBlock({ block, onRemove }: Props) {
  return (
    <div className="block block-media">
      <div className="block-media-header">
        <span className="media-label">🎵 {block.meta?.name || 'Audio'}</span>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      {block.meta?.url && <audio controls src={block.meta.url} className="media-player" />}
    </div>
  )
}

function VideoBlock({ block, onRemove }: Props) {
  return (
    <div className="block block-media">
      <div className="block-media-header">
        <span className="media-label">🎬 {block.meta?.name || 'Video'}</span>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      {block.meta?.url && <video controls src={block.meta.url} className="media-player" />}
    </div>
  )
}

function FileBlock({ block, onRemove }: Props) {
  const size = block.meta?.size ? (parseInt(block.meta.size) / 1024).toFixed(1) + ' KB' : ''
  return (
    <div className="block block-file">
      <span className="file-icon">📎</span>
      <div className="file-info">
        <span className="file-name">{block.meta?.name || 'File'}</span>
        {size && <span className="file-size">{size}</span>}
      </div>
      {block.meta?.url && <a href={block.meta.url} download={block.meta.name} className="file-download">↓ Download</a>}
      <button className="block-remove-inline" onClick={onRemove}>✕</button>
    </div>
  )
}
