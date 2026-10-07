import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { collectionGroup, query, where, limit, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { setShareMeta, resetShareMeta } from '../../lib/setShareMeta'
import type { Note, SyncVerseCanvas, Block, ChecklistItem } from '../../store/notesStore'
import './SharePage.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'note'; note: Note }
  | { status: 'canvas'; canvas: SyncVerseCanvas }

export default function SharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    if (!shareId) { setState({ status: 'not-found' }); return }

    let cancelled = false
    async function load() {
      // A shareId could belong to either a note or a canvas — both are
      // generated the same way. Try notes first, fall back to canvases.
      // Both queries are scoped by isPublic == true, which is exactly what
      // the Security Rules require to allow an unauthenticated read here —
      // see firestore.rules.
      const notesQ = query(
        collectionGroup(db, 'notes'),
        where('shareId', '==', shareId),
        where('isPublic', '==', true),
        limit(1)
      )
      const notesSnap = await getDocs(notesQ)
      if (cancelled) return
      if (!notesSnap.empty) {
        const note = notesSnap.docs[0].data() as Note
        setState({ status: 'note', note })
        return
      }

      const canvasQ = query(
        collectionGroup(db, 'canvases'),
        where('shareId', '==', shareId),
        where('isPublic', '==', true),
        limit(1)
      )
      const canvasSnap = await getDocs(canvasQ)
      if (cancelled) return
      if (!canvasSnap.empty) {
        const canvas = canvasSnap.docs[0].data() as SyncVerseCanvas
        setState({ status: 'canvas', canvas })
        return
      }

      setState({ status: 'not-found' })
    }

    load().catch((err) => {
      // A genuinely missing/disabled link returns an empty result (handled
      // above) — reaching here means the request itself FAILED (permissions,
      // missing index, network). Previously this was swallowed and shown as
      // "link isn't available", which hid a Security Rules problem for hours.
      console.error('[SharePage] Failed to load shared item:', err)
      if (!cancelled) setState({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [shareId])

  useEffect(() => {
    if (state.status === 'note') {
      setShareMeta({
        title: state.note.title || 'Untitled',
        ownerName: state.note.sharedByName || 'a Synclyx user',
      })
    } else if (state.status === 'canvas') {
      setShareMeta({
        title: state.canvas.name,
        ownerName: state.canvas.sharedByName || 'a Synclyx user',
      })
    }
    return () => resetShareMeta()
  }, [state])

  return (
    <div className="share-page">
      <header className="share-page-header">
        <Link to="/" className="share-page-logo">⚡ Synclyx</Link>
        {(state.status === 'note' || state.status === 'canvas') && (
          <span className="share-page-owner">
            Shared by {(state.status === 'note' ? state.note.sharedByName : state.canvas.sharedByName) || 'a Synclyx user'}
          </span>
        )}
      </header>

      <main className="share-page-main">
        {state.status === 'loading' && (
          <div className="share-page-status">Loading…</div>
        )}

        {state.status === 'not-found' && (
          <div className="share-page-status">
            <span className="share-page-status-icon">🔒</span>
            <p>This link isn't available</p>
            <span className="share-page-status-hint">
              It may have been turned off, or never existed.
            </span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="share-page-status">
            <span className="share-page-status-icon">⚠️</span>
            <p>Couldn't load this link right now</p>
            <span className="share-page-status-hint">
              Check your connection and try again in a moment.
            </span>
          </div>
        )}

        {state.status === 'note' && <ReadOnlyNote note={state.note} />}
        {state.status === 'canvas' && <ReadOnlyCanvas canvas={state.canvas} />}
      </main>

      <footer className="share-page-footer">
        <Link to="/" className="share-page-cta">Made with Synclyx — try it free →</Link>
      </footer>
    </div>
  )
}

// ─── Read-only note renderer ─────────────────────────────────────────────────
function ReadOnlyNote({ note }: { note: Note }) {
  return (
    <article className="share-note">
      <h1 className="share-note-title">{note.title || 'Untitled'}</h1>
      <div className="share-note-blocks">
        {note.blocks.map(block => <ReadOnlyBlock key={block.id} block={block} />)}
      </div>
    </article>
  )
}

function ReadOnlyBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      return <h2 className="share-block-heading">{block.content}</h2>
    case 'text':
      return block.content ? <p className="share-block-text">{block.content}</p> : null
    case 'list': {
      let items: string[] = []
      try { items = block.meta?.items ? JSON.parse(block.meta.items) : [] } catch { /* ignore */ }
      const ordered = block.meta?.ordered === 'true'
      const Tag = ordered ? 'ol' : 'ul'
      return (
        <Tag className="share-block-list">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </Tag>
      )
    }
    case 'checklist':
      return (
        <div className="share-block-checklist">
          {(block.items || []).map((item: ChecklistItem) => (
            <div key={item.id} className="share-check-item">
              <span className="share-check-box">{item.checked ? '☑' : '☐'}</span>
              <span style={item.checked ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )
    case 'code':
      return (
        <pre className="share-block-code">
          <code>{block.meta?.content || block.content}</code>
        </pre>
      )
    case 'table': {
      let rows: string[][] = []
      try { rows = block.meta?.tableData ? JSON.parse(block.meta.tableData) : [] } catch { /* ignore */ }
      return (
        <div className="share-block-table-wrap">
          <table className="share-block-table">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'image':
      return block.meta?.url ? <img className="share-block-image" src={block.meta.url} alt="" /> : null
    case 'video':
      return block.meta?.url ? <video className="share-block-video" src={block.meta.url} controls /> : null
    case 'audio':
      return block.meta?.url ? <audio className="share-block-audio" src={block.meta.url} controls /> : null
    case 'link':
      return block.meta?.url ? (
        <a className="share-block-link" href={block.meta.url} target="_blank" rel="noopener noreferrer">
          🔗 {block.meta.url}
        </a>
      ) : null
    case 'file':
      return block.meta?.url ? (
        <a className="share-block-file" href={block.meta.url} target="_blank" rel="noopener noreferrer">
          📎 {block.meta.name || 'Download file'}
        </a>
      ) : null
    default:
      return null
  }
}

// ─── Read-only canvas renderer ───────────────────────────────────────────────
// V1 scope: a clean summary list rather than a full interactive React Flow
// canvas — keeps the public, unauthenticated bundle lighter and ships now.
// A fully interactive read-only canvas view is a natural v1.1 follow-up.
function ReadOnlyCanvas({ canvas }: { canvas: SyncVerseCanvas }) {
  const icons: Record<string, string> = {
    text: '¶', heading: 'H', list: '≡', checklist: '✓', code: '</>',
    image: '🖼', link: '🔗', video: '🎬', audio: '🎵', file: '📎', table: '⊞',
  }
  return (
    <article className="share-canvas">
      <h1 className="share-note-title">🌐 {canvas.name}</h1>
      <p className="share-canvas-meta">
        {canvas.nodes.length} node{canvas.nodes.length !== 1 ? 's' : ''} · {canvas.edges.length} connection{canvas.edges.length !== 1 ? 's' : ''}
      </p>
      <div className="share-canvas-list">
        {canvas.nodes.map(node => {
          const block = node.data?.block
          const label = block?.content?.slice(0, 120) || block?.meta?.name || node.data?.label || block?.type || 'Node'
          return (
            <div key={node.id} className="share-canvas-node">
              <span className="share-canvas-node-icon">{icons[block?.type || ''] || '○'}</span>
              <span className="share-canvas-node-text">{label}</span>
            </div>
          )
        })}
      </div>
      <p className="share-canvas-hint">
        This is a read-only summary. Open Synclyx to see the full interactive canvas.
      </p>
    </article>
  )
}
