import React, { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react'
import { Block, ChecklistItem, useNotesStore } from '../../store/notesStore'
import { uploadFile, type UploadProgress } from '../../lib/storageUpload'
import { useAuthStore } from '../../store/authStore'

const generateId = () => Math.random().toString(36).slice(2, 10)

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }) as T
}

const ND = { className: 'nodrag nopan' } as const

// ── YouTube helpers ────────────────────────────────────────────────────────────
function isYouTubeUrl(url: string) {
  return /youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed|youtube\.com\/shorts/i.test(url)
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function getYouTubeEmbed(url: string): string {
  const id = getYouTubeId(url)
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : url
}

function getYouTubeThumbnail(url: string): string {
  const id = getYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : ''
}

export default function BlockNode({ id, data, selected }: NodeProps) {
  const block = data.block as Block
  const { activeCanvasId } = useNotesStore()
  const { user } = useAuthStore()

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
  const [imgError, setImgError] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [ytPlaying, setYtPlaying] = useState(false)

  const { deleteElements } = useReactFlow()

  const pendingBlockRef = useRef<Block | null>(null)
  const activeCanvasRef = useRef<string | null>(activeCanvasId)
  const nodeIdRef = useRef(id)
  useEffect(() => { activeCanvasRef.current = activeCanvasId }, [activeCanvasId])

  const saveToStore = (updatedBlock: Block) => {
    const canvasId = activeCanvasRef.current
    if (!canvasId) return
    const { canvases, updateCanvas } = useNotesStore.getState()
    const canvas = canvases.find(c => c.id === canvasId)
    if (!canvas) return
    updateCanvas(canvasId, {
      nodes: canvas.nodes.map(n =>
        n.id === nodeIdRef.current ? { ...n, data: { ...n.data, block: updatedBlock } } : n
      )
    })
  }

  const debouncedSave = useRef(debounce(saveToStore, 600))

  const persist = (overrides: Partial<Block>) => {
    if (!block) return
    const updated: Block = { ...block, ...overrides }
    pendingBlockRef.current = updated
    debouncedSave.current(updated)
  }

  // Flush pending save on unmount — prevents content loss on view switch
  useEffect(() => {
    return () => { if (pendingBlockRef.current) saveToStore(pendingBlockRef.current) }
  }, [])

  const getIcon = () => ({
    text: '¶', code: '</>', image: '🖼', link: '🔗', video: '🎬',
    audio: '🎵', file: '📎', table: '⊞', checklist: '✓', heading: 'H', list: '≡',
  }[block?.type] || '¶')

  // ── Shared file upload handler ────────────────────────────────────────────
  const handleFileUpload = (accept: string) => {
    if (!user) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      setUploadProgress({ progress: 0 })
      uploadFile(user.uid, file, (p) => {
        setUploadProgress(p)
        if (p.url) {
          setMediaUrl(p.url)
          setMediaUrlSaved(true)
          persist({ meta: { ...block?.meta, url: p.url, name: file.name } })
          setTimeout(() => setUploadProgress(null), 1500)
        }
        if (p.error) setTimeout(() => setUploadProgress(null), 4000)
      })
    }
    input.click()
  }

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
              <button {...ND} className={`nodrag nopan sv-list-type-btn ${!listOrdered ? 'active' : ''}`}
                onClick={() => { setListOrdered(false); persist({ meta: { ...block.meta, ordered: 'false', items: JSON.stringify(listItems) } }) }}>
                • Bullet
              </button>
              <button {...ND} className={`nodrag nopan sv-list-type-btn ${listOrdered ? 'active' : ''}`}
                onClick={() => { setListOrdered(true); persist({ meta: { ...block.meta, ordered: 'true', items: JSON.stringify(listItems) } }) }}>
                1. Numbered
              </button>
            </div>
            <div className="sv-list-items">
              {listItems.map((item, i) => (
                <div key={i} className="sv-list-item">
                  <span className="sv-list-marker">{listOrdered ? `${i + 1}.` : '•'}</span>
                  <input {...ND} className="nodrag nopan sv-list-item-input" value={item} placeholder="Item..."
                    onChange={e => {
                      const next = listItems.map((v, j) => j === i ? e.target.value : v)
                      setListItems(next); persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const next = [...listItems.slice(0, i + 1), '', ...listItems.slice(i + 1)]
                        setListItems(next); persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                      }
                      if (e.key === 'Backspace' && item === '' && listItems.length > 1) {
                        e.preventDefault()
                        const next = listItems.filter((_, j) => j !== i)
                        setListItems(next); persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <button {...ND} className="nodrag nopan sv-list-add"
              onClick={() => {
                const next = [...listItems, '']
                setListItems(next); persist({ meta: { ...block.meta, ordered: String(listOrdered), items: JSON.stringify(next) } })
              }}>+ Item</button>
          </div>
        )

      case 'checklist':
        return (
          <div className="sv-checklist sv-fill-height">
            {localItems.map(item => (
              <div key={item.id} className="sv-check-item">
                <button {...ND} className={`nodrag nopan sv-check-box ${item.checked ? 'checked' : ''}`}
                  onClick={() => {
                    const updated = localItems.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i)
                    setLocalItems(updated); persist({ items: updated })
                  }}>{item.checked ? '✓' : ''}</button>
                <input {...ND} className="nodrag nopan sv-check-text" value={item.text} placeholder="Item..."
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
              }}>+ Add item</button>
          </div>
        )

      case 'code':
        return (
          <div className="sv-code-wrap sv-fill-height">
            <select {...ND} className="nodrag nopan sv-code-lang" value={lang}
              onChange={e => { setLang(e.target.value); persist({ meta: { ...block.meta, content: code, lang: e.target.value } }) }}>
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

      case 'image': {
        if (mediaUrlSaved && mediaUrl) {
          return (
            <div className="sv-media-saved sv-fill-height">
              {imgError ? (
                <div className="sv-img-error">
                  <span>🖼</span>
                  <span>Image can't be displayed</span>
                  <span className="sv-img-error-hint">Some sites (e.g. Pinterest) block images from loading in other apps.</span>
                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
                    className="sv-img-error-link" onClick={e => e.stopPropagation()}>
                    Open image directly ↗
                  </a>
                </div>
              ) : (
                <img src={mediaUrl} alt="img"
                  style={{ width: '100%', flex: 1, objectFit: 'contain', borderRadius: '0.375rem' }}
                  onError={() => setImgError(true)}
                />
              )}
              <button {...ND} className="nodrag nopan sv-media-edit"
                onClick={() => { setMediaUrlSaved(false); setImgError(false) }}>
                ✎ Change
              </button>
            </div>
          )
        }
        return (
          <div className="sv-media-input">
            <p className="sv-media-hint">🖼 Paste a URL or upload a file</p>
            <input {...ND} className="nodrag nopan sv-media-url-input" value={mediaUrl} autoFocus
              placeholder="https://example.com/image.png"
              onChange={e => setMediaUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && mediaUrl.trim()) {
                  setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } })
                }
              }}
            />
            {uploadProgress && (
              <div className="sv-upload-progress">
                {uploadProgress.error
                  ? <span className="sv-upload-error">⚠️ {uploadProgress.error}</span>
                  : uploadProgress.url
                  ? <span className="sv-upload-done">✅ Uploaded</span>
                  : <div className="sv-upload-bar"><div className="sv-upload-fill" style={{ width: `${uploadProgress.progress}%` }} /></div>
                }
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button {...ND} className="nodrag nopan sv-media-save"
                onClick={() => { if (!mediaUrl.trim()) return; setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) }}>
                Add Image
              </button>
              {user ? (
                <button {...ND} className="nodrag nopan sv-upload-btn"
                  onClick={() => handleFileUpload('image/*')}
                  disabled={!!uploadProgress}>
                  📁 Upload
                </button>
              ) : (
                <button {...ND} className="nodrag nopan sv-media-pro" title="Sign in to upload files">
                  📁 Upload 🔒
                </button>
              )}
            </div>
          </div>
        )
      }

      case 'link': {
        if (mediaUrlSaved && mediaUrl) return (
          <div className="sv-media-saved">
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
              className="sv-link-card" onClick={e => e.stopPropagation()}>
              🔗 {mediaUrl}
            </a>
            <button {...ND} className="nodrag nopan sv-media-edit" onClick={() => setMediaUrlSaved(false)}>✎ Edit</button>
          </div>
        )
        return (
          <div className="sv-media-input">
            <p className="sv-media-hint">🔗 Paste a link URL</p>
            <input {...ND} className="nodrag nopan sv-media-url-input" value={mediaUrl} autoFocus
              placeholder="https://..."
              onChange={e => setMediaUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && mediaUrl.trim()) { setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) } }}
            />
            <button {...ND} className="nodrag nopan sv-media-save"
              onClick={() => { if (!mediaUrl.trim()) return; setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) }}>
              Add Link
            </button>
          </div>
        )
      }

      case 'video': {
        if (mediaUrlSaved && mediaUrl) {
          const isYT = isYouTubeUrl(mediaUrl)
          const thumb = isYT ? getYouTubeThumbnail(mediaUrl) : ''

          return (
            <div className="sv-media-saved sv-fill-height">
              {isYT ? (
                ytPlaying ? (
                  <iframe {...ND}
                    className="nodrag nopan sv-yt-embed"
                    src={getYouTubeEmbed(mediaUrl) + '&autoplay=1'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="sv-yt-thumb" onClick={() => setYtPlaying(true)}>
                    {thumb && <img src={thumb} alt="YouTube thumbnail" className="sv-yt-thumb-img" />}
                    <div className="sv-yt-play">▶</div>
                  </div>
                )
              ) : (
                <video {...ND} controls src={mediaUrl} className="nodrag nopan"
                  style={{ width: '100%', flex: 1, borderRadius: '0.375rem' }} />
              )}
              <button {...ND} className="nodrag nopan sv-media-edit"
                onClick={() => { setMediaUrlSaved(false); setYtPlaying(false) }}>
                ✎ Change URL
              </button>
            </div>
          )
        }
        return (
          <div className="sv-media-input">
            <p className="sv-media-hint">🎬 Paste a video URL (YouTube works too)</p>
            <input {...ND} className="nodrag nopan sv-media-url-input" value={mediaUrl} autoFocus
              placeholder="https://youtube.com/watch?v=... or video.mp4"
              onChange={e => setMediaUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && mediaUrl.trim()) { setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) } }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button {...ND} className="nodrag nopan sv-media-save"
                onClick={() => { if (!mediaUrl.trim()) return; setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) }}>
                Add Video
              </button>
              {user && (
                <button {...ND} className="nodrag nopan sv-upload-btn"
                  onClick={() => handleFileUpload('video/*')} disabled={!!uploadProgress}>
                  📁 Upload
                </button>
              )}
            </div>
            {uploadProgress && (
              <div className="sv-upload-progress">
                {uploadProgress.error
                  ? <span className="sv-upload-error">⚠️ {uploadProgress.error}</span>
                  : uploadProgress.url ? <span className="sv-upload-done">✅ Uploaded</span>
                  : <div className="sv-upload-bar"><div className="sv-upload-fill" style={{ width: `${uploadProgress.progress}%` }} /></div>
                }
              </div>
            )}
          </div>
        )
      }

      case 'audio': {
        if (mediaUrlSaved && mediaUrl) return (
          <div className="sv-media-saved sv-fill-height">
            <audio {...ND} controls src={mediaUrl} className="nodrag nopan" style={{ width: '100%' }} />
            <button {...ND} className="nodrag nopan sv-media-edit" onClick={() => setMediaUrlSaved(false)}>✎ Change URL</button>
          </div>
        )
        return (
          <div className="sv-media-input">
            <p className="sv-media-hint">🎵 Paste an audio URL or upload</p>
            <input {...ND} className="nodrag nopan sv-media-url-input" value={mediaUrl} autoFocus
              placeholder="https://example.com/audio.mp3"
              onChange={e => setMediaUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && mediaUrl.trim()) { setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) } }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button {...ND} className="nodrag nopan sv-media-save"
                onClick={() => { if (!mediaUrl.trim()) return; setMediaUrlSaved(true); persist({ meta: { ...block?.meta, url: mediaUrl.trim() } }) }}>
                Add Audio
              </button>
              {user && (
                <button {...ND} className="nodrag nopan sv-upload-btn"
                  onClick={() => handleFileUpload('audio/*')} disabled={!!uploadProgress}>
                  📁 Upload
                </button>
              )}
            </div>
          </div>
        )
      }

      // Table — read-only preview + open in SyncPad
      case 'table': {
        let tableData: string[][] = []
        try { if (block.meta?.tableData) tableData = JSON.parse(block.meta.tableData) } catch { }
        const { activeCanvasId: cid, canvases } = useNotesStore.getState()
        const linkedNoteId = canvases.find(c => c.id === cid)?.noteId

        return (
          <div className="sv-table-preview">
            {tableData.length > 0 ? (
              <div className="sv-table-scroll">
                <table className="sv-table-readonly"><tbody>
                  {tableData.map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => (
                      <td key={ci} className="sv-table-cell">{cell}</td>
                    ))}</tr>
                  ))}
                </tbody></table>
              </div>
            ) : (
              <p className="sv-table-empty">⊞ Table — no data yet</p>
            )}
            {linkedNoteId && (
              <button {...ND} className="nodrag nopan sv-open-syncpad"
                onClick={() => {
                  useNotesStore.getState().setActiveNote(linkedNoteId)
                  window.dispatchEvent(new CustomEvent('synclyx:switch-view', { detail: 'notes' }))
                }}>
                ✎ Edit in SyncPad
              </button>
            )}
          </div>
        )
      }

      case 'file':
        return (
          <div className="sv-placeholder">
            📎 {block.meta?.name || 'File block'}
            {block.meta?.url && (
              <a href={block.meta.url} target="_blank" rel="noopener noreferrer"
                className="sv-file-link" onClick={e => e.stopPropagation()}>Download</a>
            )}
          </div>
        )

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

        <div className="sv-node-header">
          <span className="sv-node-icon">{getIcon()}</span>
          <span className="sv-node-type">{block?.type || 'block'}</span>
          <button className="nodrag nopan sv-node-collapse" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▶' : '▼'}
          </button>
          <button className="nodrag nopan sv-node-delete"
            onClick={() => deleteElements({ nodes: [{ id }] })} title="Delete">✕</button>
        </div>

        {!collapsed && (
          <div className="nodrag nopan sv-node-body sv-node-body-fill">
            {renderBody()}
          </div>
        )}
      </div>
    </>
  )
}
