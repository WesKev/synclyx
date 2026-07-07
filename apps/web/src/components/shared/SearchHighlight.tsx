import React from 'react'
import { useNotesStore } from '../../store/notesStore'

interface Props {
  text: string
  className?: string
}

export default function SearchHighlight({ text, className }: Props) {
  const { searchQuery } = useNotesStore()

  if (!searchQuery.trim() || !text) return <span className={className}>{text}</span>

  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase()
          ? <mark key={i} className="search-highlight-inline">{part}</mark>
          : part
      )}
    </span>
  )
}
