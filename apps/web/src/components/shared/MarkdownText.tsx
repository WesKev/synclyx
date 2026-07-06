import React, { useState, useRef, useEffect } from 'react'
import { renderMarkdown, hasMarkdown } from '../../utils/markdown'

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

/**
 * Smart textarea that:
 * - Shows rendered markdown when not focused
 * - Shows raw markdown when focused for editing
 */
export default function MarkdownText({
  value, onChange, onKeyDown, placeholder,
  className = '', blockId, rows = 1, autoFocus
}: Props) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current && focused) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.max(ref.current.scrollHeight, 36) + 'px'
    }
  }, [value, focused])

  // Show rendered view when blurred and has markdown
  if (!focused && hasMarkdown(value)) {
    return (
      <div
        className={`md-render ${className}`}
        onClick={() => { setFocused(true); setTimeout(() => ref.current?.focus(), 10) }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
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
