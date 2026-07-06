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
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.max(ref.current.scrollHeight, 36) + 'px'
    }
  }, [block.content])
  return (
    <div className="block block-text-wrap">
      <textarea ref={ref} className="block-text"
        data-block-id={block.id}
        value={block.content} onChange={onChange} onKeyDown={onKeyDown}
        placeholder="Type or @ for blocks..." rows={1} />
    </div>
  )
}

// ─── Heading Block ────────────────────────────────────────────────────────────
function HeadingBlock({ block, onRemove, onUpdateMeta, onAddBlockAfter, onChange }: Props) {
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
function ListBlock({ block, onRemove, onUpdateMeta, onAddBlockAfter }: Props) {
  const [ordered, setOrdered] = useState(block.meta?.ordered === 'true')
  const [items, setItems] = useState<string[]>(
    block.meta?.items ? JSON.parse(block.meta.items) : ['']
  )
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const update = (idx: number, val: string) => {
    const next = items.map((item, i) => i === idx ? val : item)
    setItems(next)
    onUpdateMeta({ ...block.meta, ordered: String(ordered), items: JSON.stringify(next) })
  }

  const addItem = (afterIdx: number) => {
    const next = [...items.slice(0, afterIdx + 1), '', ...items.slice(afterIdx + 1)]
    setItems(next)
    onUpdateMeta({ ...block.meta, ordered: String(ordered), items: JSON.stringify(next) })
    setTimeout(() => refs.current[afterIdx + 1]?.focus(), 30)
  }

  const removeItem = (idx: number) => {
    if (items.length === 1) { onRemove(); return }
    const next = items.filter((_, i) => i !== idx)
    setItems(next)
    onUpdateMeta({ ...block.meta, ordered: String(ordered), items: JSON.stringify(next) })
    setTimeout(() => refs.current[Math.max(0, idx - 1)]?.focus(), 30)
  }

  return (
    <div className="block block-list">
      <div className="list-toolbar">
        <button className={`list-type-btn ${!ordered ? 'active' : ''}`} onClick={() => setOrdered(false)}>• Bullet</button>
        <button className={`list-type-btn ${ordered ? 'active' : ''}`} onClick={() => setOrdered(true)}>1. Numbered</button>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      <div className="list-items">
        {items.map((item, idx) => (
          <div key={idx} className="list-item">
            <span className="list-marker">{ordered ? `${idx + 1}.` : '•'}</span>
            <input ref={el => { refs.current[idx] = el }}
              className="list-item-input" value={item}
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
function ChecklistBlock({ block, onRemove, onUpdateItems, onAddBlockAfter }: Props) {
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
  const [lang, setLang] = useState(block.meta?.lang || 'javascript')
  const [code, setCode] = useState(block.meta?.content || '')
  const [collapsed, setCollapsed] = useState(false)
  const lineCount = code.split('\n').length
  const languages = ['javascript','typescript','python','html','css','json','bash','sql','rust','go','java','cpp','c','php','ruby','swift','kotlin']

  const handleChange = (val: string) => {
    setCode(val)
    onUpdateMeta({ ...block.meta, lang, content: val })
  }

  const lines = code.split('\n')

  return (
    <div className="block block-code">
      <div className="code-header">
        <div className="code-header-left">
          <span className="code-dot red" /><span className="code-dot yellow" /><span className="code-dot green" />
          <select className="code-lang-select" value={lang}
            onChange={e => { setLang(e.target.value); onUpdateMeta({ ...block.meta, lang: e.target.value, content: code }) }}>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="code-header-right">
          <button className="code-copy-btn" onClick={() => navigator.clipboard.writeText(code)} title="Copy">⎘ Copy</button>
          <button className="code-collapse-btn" onClick={() => setCollapsed(c => !c)}>{collapsed ? '▶' : '▼'}</button>
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>
      {!collapsed && (
        <div className="code-body">
          <div className="code-line-numbers">
            {lines.map((_, i) => <div key={i} className="code-line-num">{i + 1}</div>)}
          </div>
          <textarea className="code-editor" value={code}
            onChange={e => handleChange(e.target.value)}
            placeholder={`// ${lang}...`}
            spellCheck={false}
            onKeyDown={e => {
              if (e.key === 'Tab') {
                e.preventDefault()
                const s = e.currentTarget.selectionStart
                const end = e.currentTarget.selectionEnd
                const newVal = code.slice(0, s) + '  ' + code.slice(end)
                handleChange(newVal)
                setTimeout(() => {
                  e.currentTarget.selectionStart = s + 2
                  e.currentTarget.selectionEnd = s + 2
                }, 0)
              }
            }}
          />
        </div>
      )}
      {!collapsed && <div className="code-footer">{lineCount} line{lineCount !== 1 ? 's' : ''} · {lang}</div>}
    </div>
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
function TableBlock({ block, onRemove }: Props) {
  const [data, setData] = useState<string[][]>(
    Array.from({ length: parseInt(block.meta?.rows || '3') },
      () => Array.from({ length: parseInt(block.meta?.cols || '3') }, () => ''))
  )
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  const update = (r: number, c: number, val: string) =>
    setData(d => d.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? val : cell)))
  const insertRow = (afterIdx: number) =>
    setData(d => [...d.slice(0, afterIdx + 1), Array(d[0].length).fill(''), ...d.slice(afterIdx + 1)])
  const removeRow = (idx: number) =>
    setData(d => d.length > 1 ? d.filter((_, i) => i !== idx) : d)
  const insertCol = (afterIdx: number) =>
    setData(d => d.map(r => [...r.slice(0, afterIdx + 1), '', ...r.slice(afterIdx + 1)]))
  const removeCol = (idx: number) =>
    setData(d => d.map(r => r.length > 1 ? r.filter((_, i) => i !== idx) : r))

  return (
    <div className="block block-table">
      <div className="table-toolbar">
        <span className="table-label">⊞ Table — {data.length} × {data[0]?.length || 0}</span>
        <button className="block-remove-inline" onClick={onRemove}>✕</button>
      </div>
      <div className="table-scroll">
        {/* Column add buttons above */}
        <div className="table-col-add-row">
          <div className="table-corner" />
          {data[0]?.map((_, ci) => (
            <div key={ci} className="table-col-add-cell">
              <button className="table-add-btn" onClick={() => insertCol(ci - 1)} title="Add column before">+</button>
              {ci === data[0].length - 1 && (
                <button className="table-add-btn table-add-after" onClick={() => insertCol(ci)} title="Add column after">+</button>
              )}
            </div>
          ))}
        </div>
        <table className="block-table-el">
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} onMouseEnter={() => setHoverRow(ri)} onMouseLeave={() => setHoverRow(null)}>
                {/* Row add button */}
                <td className="table-row-add-cell">
                  {hoverRow === ri && (
                    <div className="table-row-btns">
                      <button className="table-add-btn" onClick={() => insertRow(ri - 1)} title="Add row before">+</button>
                      <button className="table-add-btn" onClick={() => insertRow(ri)} title="Add row after">+</button>
                      <button className="table-remove-btn" onClick={() => removeRow(ri)} title="Remove row">−</button>
                    </div>
                  )}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci} className={ri === 0 ? 'table-header-cell' : ''}>
                    <input className="table-cell-input" value={cell}
                      onChange={e => update(ri, ci, e.target.value)}
                      placeholder={ri === 0 ? `Col ${ci + 1}` : ''}
                      onMouseEnter={() => setHoverCol(ci)}
                    />
                    {hoverRow === ri && hoverCol === ci && (
                      <button className="table-col-remove" onClick={() => removeCol(ci)} title="Remove column">−</button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
