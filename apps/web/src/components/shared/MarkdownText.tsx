import React, { useState, useRef, useEffect } from 'react'
import { renderMarkdown, hasMarkdown } from '../../utils/markdown'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  value: string
  onChange: (val: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
  blockId?: string
  rows?: number
  autoFocus?: boolean
}

function highlightSearch(html: string, query: string): string {
  if (!query || !query.trim()) return html
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return html.replace(
      new RegExp(`(${escaped})(?![^<]*>)`, 'gi'),
      '<mark class="search-highlight-inline">$1</mark>'
    )
  } catch {
    return html
  }
}

export default function MarkdownText({
  value, onChange, onKeyDown, placeholder,
  className = '', blockId, rows = 1, autoFocus
}: Props) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { searchQuery = '' } = useNotesStore()

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.max(ref.current.scrollHeight, 36) + 'px'
    }
  }, [value])

  // Show rendered markdown when blurred and content has markdown syntax
  if (!focused && value && hasMarkdown(value)) {
    const rendered = highlightSearch(renderMarkdown(value), searchQuery)
    return (
      <div
        className={`md-render ${className}`}
        onClick={() => {
          setFocused(true)
          setTimeout(() => ref.current?.focus(), 10)
        }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    )
  }

  return (
    <textarea
      ref={ref}
      className={`block-text ${className}`}
      value={value}
      data-block-id={blockId}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder || 'Type or @ for blocks...'}
      rows={rows}
      autoFocus={autoFocus}
    />
  )
}
