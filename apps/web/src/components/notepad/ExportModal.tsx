import React, { useState } from 'react'
import { Note } from '../../store/notesStore'

interface Props {
  note: Note
  onClose: () => void
}

const formats = [
  { id: 'md',   icon: '#',  label: 'Markdown',   desc: '.md — great for AI tools & developers' },
  { id: 'txt',  icon: 'T',  label: 'Plain Text',  desc: '.txt — simple, universal' },
  { id: 'pdf',  icon: '⬡',  label: 'PDF',         desc: '.pdf — ready to share or print' },
  { id: 'docx', icon: 'W',  label: 'Word Doc',    desc: '.docx — open in Microsoft Word' },
  { id: 'link', icon: '🔗', label: 'Share Link',  desc: 'Copy a read-only link (coming soon)' },
]

export default function ExportModal({ note, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const blocksToMarkdown = () => {
    let md = `# ${note.title}\n\n`
    note.blocks.forEach(block => {
      switch (block.type) {
        case 'text': md += `${block.content}\n\n`; break
        case 'code':
          md += `\`\`\`${block.meta?.lang || ''}\n${block.meta?.content || block.content}\n\`\`\`\n\n`
          break
        case 'image': md += `![${block.meta?.name || 'image'}](${block.meta?.url || ''})\n\n`; break
        case 'link': md += `[${block.meta?.label || block.meta?.url}](${block.meta?.url})\n\n`; break
        case 'table':
          const rows = parseInt(block.meta?.rows || '2')
          const cols = parseInt(block.meta?.cols || '2')
          md += Array(rows).fill(null).map((_, r) =>
            '| ' + Array(cols).fill(r === 0 ? 'Header' : 'Cell').join(' | ') + ' |'
          ).join('\n') + '\n\n'
          break
        default: md += `[${block.type} block]\n\n`
      }
    })
    if (note.tags.length > 0) md += `\n---\nTags: ${note.tags.map(t => `#${t}`).join(' ')}`
    return md
  }

  const exportMd = () => {
    const content = blocksToMarkdown()
    download(content, `${note.title || 'note'}.md`, 'text/markdown')
  }

  const exportTxt = () => {
    let content = `${note.title}\n${'='.repeat(note.title.length)}\n\n`
    note.blocks.forEach(block => {
      if (block.type === 'text') content += block.content + '\n\n'
      else if (block.type === 'code') content += `[Code: ${block.meta?.lang}]\n${block.meta?.content || block.content}\n\n`
      else if (block.type === 'link') content += `Link: ${block.meta?.url}\n\n`
      else content += `[${block.type}]\n\n`
    })
    download(content, `${note.title || 'note'}.txt`, 'text/plain')
  }

  const exportPdf = () => {
    const content = blocksToMarkdown()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { font-family: Georgia, serif; max-width: 700px; margin: 2rem auto; padding: 2rem; color: #1a1a2e; line-height: 1.7; }
      h1 { font-size: 2rem; margin-bottom: 1rem; }
      pre { background: #f4f4f8; padding: 1rem; border-radius: 6px; overflow-x: auto; }
      code { font-family: monospace; }
      a { color: #a833b9; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ccc; padding: 0.5rem 0.75rem; }
    </style></head><body>
    <h1>${note.title}</h1>
    ${note.blocks.map(b => {
      if (b.type === 'text') return `<p>${b.content.replace(/\n/g, '<br>')}</p>`
      if (b.type === 'code') return `<pre><code>${b.meta?.content || b.content}</code></pre>`
      if (b.type === 'link') return `<p><a href="${b.meta?.url}">${b.meta?.label || b.meta?.url}</a></p>`
      if (b.type === 'image') return `<img src="${b.meta?.url}" style="max-width:100%">`
      return `<p><em>[${b.type}]</em></p>`
    }).join('')}
    </body></html>`
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.print() }, 500)
    }
  }

  const exportDocx = () => {
    // Basic RTF that Word can open — full docx needs a library, adding note for Phase 2
    const content = blocksToMarkdown()
    download(content, `${note.title || 'note'}.md`, 'text/markdown')
    alert('Full .docx export coming in Phase 2 with Firebase. Downloaded as Markdown for now — Word and Google Docs can open .md files.')
  }

  const handleShareLink = () => {
    // Placeholder — will wire to Firebase in Phase 2
    navigator.clipboard.writeText(`https://synclyx.app/note/${note.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = (id: string) => {
    setExporting(id)
    setTimeout(() => {
      if (id === 'md') exportMd()
      else if (id === 'txt') exportTxt()
      else if (id === 'pdf') exportPdf()
      else if (id === 'docx') exportDocx()
      else if (id === 'link') handleShareLink()
      setExporting(null)
    }, 150)
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup export-popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>Export "{note.title}"</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="export-list">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              className={`export-option ${exporting === fmt.id ? 'loading' : ''} ${fmt.id === 'link' ? 'share-option' : ''}`}
              onClick={() => handleExport(fmt.id)}
              disabled={exporting !== null}
            >
              <span className="export-icon">{fmt.icon}</span>
              <div className="export-text">
                <span className="export-label">
                  {fmt.label}
                  {fmt.id === 'link' && copied && <span className="copied-badge"> ✓ Copied!</span>}
                </span>
                <span className="export-desc">{fmt.desc}</span>
              </div>
              <span className="export-arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
