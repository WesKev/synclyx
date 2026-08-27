import React, { useState, useRef } from 'react'
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react'
import { Block, ChecklistItem, useNotesStore } from '../../store/notesStore'

const generateId = () => Math.random().toString(36).slice(2, 10)

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }) as T
}

// Shared props to stop React Flow from stealing pointer events
// on every interactive element inside a node
const ND = { className: 'nodrag nopan' } as const

export default function BlockNode({ id, data, selected }: NodeProps) {
  const block = data.block as Block
  const { activeCanvasId } = useNotesStore()

  const [collapsed, setCollapsed] = useState(false)
  const [localContent, setLocalContent] = useState(block?.content || '')
  const [localItems, setLocalItems] = useState<ChecklistItem[]>(block?.items || [])
  const [code, setCode] = useState(block?.meta?.content || '')
  const [lang, setLang] = useState(block?.meta?.lang || 'javascript')
  const [listItems, setListItems] = useState<string[]>(
    block?.meta?.items ? JSON.parse(block.meta.items) : ['']
  )
  const [listOrdered, setListOrdered] = useState(block?.meta?.ordered === 'true')
  const [mediaUrl, setMediaUrl] = useState(block?.meta?.url || '')
  const [mediaUrlSaved, setMediaUrlSaved] = useState(!!block?.meta?.url)

  const { deleteElements } = useReactFlow()

  const saveRef = useRef(
    debounce((nodeId: string, canvasId: string | null, updatedBlock: Block) => {
      if (!canvasId) return
      const { canvases, updateCanvas } = useNotesStore.getState()
      const canvas = canvases.find(c => c.id === canvasId)
      if (!canvas) return
      updateCanvas(canvasId, {
        nodes: canvas.nodes.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, block: updatedBlock } } : n
        )
      })
    }, 600)
  )

  const persist = (overrides: Partial<Block>) => {
    if (!block) return
    saveRef.current(id, activeCanvasId, { ...block, ...overrides })
  }

  const getIcon = () => ({
    text: '¶', code: '</>', image: '🖼', link: '🔗', video: '🎬',
    audio: '🎵', file: '📎', table: '⊞', checklist: '✓', heading: 'H', list: '≡',
  }[block?.type] || '¶')

  const renderBody = () => {
    if (!block) return null

    switch (block.type) {

      case 'text':
        return (
          <textarea {...ND} className="nodrag nopan sv-editable-text sv-fill-height"
            value={localContent}
            onChange={e => { setLocalContent(e.target.value); persist({ content: e.target.value }) }}
            placeholder="Type something..."
          />
        )

      case 'heading':
        return (
          <input {...ND} className="nodrag nopan sv-editable-heading"
            value={localContent}
            onChange={e => { setLocalContent(e.target.value); persist({ content: e.target.value }) }}
            placeholder="Heading..."
          />
        )

      case 'list':
        return (
          <div className="sv-list-wrap sv-fill-height">
            <div className="sv-list-controls">
              <button {...ND}
                className={`nodrag nopan sv-list-type-btn ${!listOrdered ? 'active' : ''}`}
                onClick={() => { setListOrdered(false); persist({ meta: { ...block.meta, ordered: 'false', items: JSON.stringify(listItems) } }) }}
              >• Bullet</button>
              <button {...ND}
                className={`nodrag nopan sv-list-type-btn ${listOrdered ? 'active' : ''}`}
                onClick={() => { setListOrdered(true); persist({ meta: { ...block.meta, ordered: 'true', items: JSON.stringify(listItems) } }) }}
              >1. Numbered</button>
            </div>
            <div className="sv-list-items">
              {listItems.map((item, i) => (
                <div key={i} className="sv-list-item">
                  <span className="sv-list-marker">{listOrdered ? `${i + 1}.` : '•'}</span>
                  <input {...ND}
                    className="nodrag nopan sv-list-item-input"
                    value={item}
                    placeholder="Item..."
                    onChange={e => {
                      const next = listItems.map((v, j) => j === i ? e.target.value : v)
                      setListItems(next)
                      persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const next = [...listItems.slice(0, i + 1), '', ...listItems.slice(i + 1)]
                        setListItems(next)
                        persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                      }
                      if (e.key === 'Backspace' && item === '' && listItems.length > 1) {
                        e.preventDefault()
                        const next = listItems.filter((_, j) => j !== i)
                        setListItems(next)
                        persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <button {...ND} className="nodrag nopan sv-list-add"
              onClick={() => {
                const next = [...listItems, '']
                setListItems(next)
                persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
              }}
            >+ Item</button>
          </div>
        )

      case 'checklist':
        return (
          <div className="sv-checklist sv-fill-height">
            {localItems.map(item => (
              <div key={item.id} className="sv-check-item">
                <button {...ND}
                  className={`nodrag nopan sv-check-box ${item.checked ? 'checked' : ''}`}
                  onClick={() => {
                    const updated = localItems.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i)
                    setLocalItems(updated); persist({ items: updated })
                  }}
                >{item.checked ? '✓' : ''}</button>
                <input {...ND}
                  className="nodrag nopan sv-check-text"
                  value={item.text}
                  placeholder="Item..."
                  style={item.checked ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}
                  onChange={e => {
                    const updated = localItems.map(i => i.id === item.id ? { ...i, text: e.target.value } : i)
                    setLocalItems(updated); persist({ items: updated })
                  }}
                />
              </div>
            ))}
            <button {...ND} className="nodrag nopan sv-check-add"
              onClick={() => {
                const updated = [...localItems, { id: generateId(), text: '', checked: false }]
                setLocalItems(updated); persist({ items: updated })
              }}
            >+ Add item</button>
          </div>
        )

      case 'code':
        return (
          <div className="sv-code-wrap sv-fill-height">
            <select {...ND} className="nodrag nopan sv-code-lang" value={lang}
              onChange={e => { setLang(e.target.value); persist({ meta: { ...block.meta, content: code, lang: e.target.value } }) }}
            >
              {['javascript','typescript','python','html','css','json','bash','sql','rust','go'].map(l =>
                <option key={l} value={l}>{l}</option>
              )}
            </select>
            <textarea {...ND} className="nodrag nopan sv-editable-code sv-fill-height"
              value={code} spellCheck={false} placeholder={`// ${lang}...`}
              onChange={e => { setCode(e.target.value); persist({ meta: { ...block.meta, content: e.target.value, lang } }) }}
            />
          </div>
        )

      // ── Media types — URL input (free), file upload coming in Phase 3 Pro ───
      case 'image':
      case 'link':
      case 'video':
      case 'audio': {
        const icons: Record<string, string> = { image: '🖼', link: '🔗', video: '🎬', audio: '🎵' }
        const placeholders: Record<string, string> = {
          image: 'https://example.com/image.png',
          link: 'https://example.com',
          video: 'https://example.com/video.mp4',
          audio: 'https://example.com/audio.mp3',
        }
        const labels: Record<string, string> = {
          image: 'Add Image', link: 'Add Link', video: 'Add Video', audio: 'Add Audio',
        }

        if (mediaUrlSaved && mediaUrl) return (
          <div className="sv-media-saved sv-fill-height">
            {block.type === 'image' && (
              <img src={mediaUrl} alt="img" style={{ width: '100%', flex: 1, objectFit: 'contain', borderRadius: '0.375rem' }} />
            )}
            {block.type === 'audio' && (
              <audio {...ND} controls src={mediaUrl} className="nodrag nopan" style={{ width: '100%' }} />
            )}
            {block.type === 'video' && (
              <video {...ND} controls src={mediaUrl} className="nodrag nopan" style={{ width: '100%', borderRadius: '0.375rem' }} />
            )}
            {block.type === 'link' && (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="sv-link-card"
                onClick={e => e.stopPropagation()}>
                🔗 {mediaUrl}
              </a>
            )}
            <button {...ND} className="nodrag nopan sv-media-edit"
              onClick={() => setMediaUrlSaved(false)}
            >✎ Change URL</button>
          </div>
        )

        return (
          <div className="sv-media-input">
            <p className="sv-media-hint">{icons[block.type]} Paste a URL to add content</p>
            <input {...ND}
              className="nodrag nopan sv-media-url-input"
              value={mediaUrl}
              autoFocus
              placeholder={placeholders[block.type]}
              onChange={e => setMediaUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && mediaUrl.trim()) {
                  setMediaUrlSaved(true)
                  persist({ meta: { ...block.meta, url: mediaUrl.trim() } })
                }
              }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button {...ND} className="nodrag nopan sv-media-save"
                onClick={() => {
                  if (!mediaUrl.trim()) return
                  setMediaUrlSaved(true)
                  persist({ meta: { ...block.meta, url: mediaUrl.trim() } })
                }}
              >{labels[block.type]}</button>
              {/* Pro upload — Phase 3 */}
              <button {...ND} className="nodrag nopan sv-media-pro"
                title="File upload available on Pro plan"
                onClick={() => {}}
              >📁 Upload 🔒</button>
            </div>
          </div>
        )
      }

      case 'file':
        return (
          <div className="sv-placeholder">
            📎 {block.meta?.name || 'File block'}
            {block.meta?.url && (
              <a href={block.meta.url} target="_blank" rel="noopener noreferrer"
                className="sv-file-link" onClick={e => e.stopPropagation()}>
                Download
              </a>
            )}
          </div>
        )

      case 'table':
        return <div className="sv-placeholder">⊞ Table — edit in SyncPad</div>

      default:
        return <p className="sv-node-text">{block?.content || ''}</p>
    }
  }

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={120}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent, #a833b9)' }}
        lineStyle={{ borderColor: 'var(--accent, #a833b9)' }}
      />
      <div className={`sv-node sv-block-node sv-node-resizable ${selected ? 'sv-node-selected' : ''} sv-type-${block?.type}`}>
        <Handle type="target" position={Position.Left} className="sv-handle" />
        <Handle type="source" position={Position.Right} className="sv-handle" />
        <Handle type="target" position={Position.Top} className="sv-handle sv-handle-top" />
        <Handle type="source" position={Position.Bottom} className="sv-handle sv-handle-bottom" />

        {/* Header is draggable — body is not */}
        <div className="sv-node-header">
          <span className="sv-node-icon">{getIcon()}</span>
          <span className="sv-node-type">{block?.type || 'block'}</span>
          <button className="nodrag nopan sv-node-collapse"
            onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▶' : '▼'}
          </button>
          <button className="nodrag nopan sv-node-delete"
            onClick={() => deleteElements({ nodes: [{ id }] })}
            title="Delete node">✕</button>
        </div>

        {/* nodrag on body — all children interactive */}
        {!collapsed && (
          <div className="nodrag nopan sv-node-body sv-node-body-fill">
            {renderBody()}
          </div>
        )}
      </div>
    </>
  )
}
