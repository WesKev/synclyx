import React, { useState, useRef, useEffect } from 'react'
import { Note, PRESET_TAGS, useNotesStore } from '../../store/notesStore'

interface Props {
  note: Note
  onUpdate: (tags: string[]) => void
}

export default function TagInput({ note, onUpdate }: Props) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { customTags, addCustomTag } = useNotesStore()
  const ref = useRef<HTMLDivElement>(null)

  const allTags = [
    ...PRESET_TAGS.map(p => p.label.toLowerCase()),
    ...customTags,
  ].filter(t => !note.tags.includes(t))

  const filtered = input.trim()
    ? allTags.filter(t => t.toLowerCase().includes(input.toLowerCase()))
    : allTags

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase()
    if (!clean || note.tags.includes(clean)) return
    onUpdate([...note.tags, clean])
    if (!allTags.includes(clean) && !PRESET_TAGS.map(p => p.label.toLowerCase()).includes(clean)) {
      addCustomTag(clean)
    }
    setInput('')
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => onUpdate(note.tags.filter(t => t !== tag))

  return (
    <div className="tag-input-wrap" ref={ref}>
      {note.tags.map(tag => (
        <span key={tag} className="editor-tag" onClick={() => removeTag(tag)}>
          #{tag} ×
        </span>
      ))}
      <div className="tag-field-wrap">
        <input className="editor-tag-input" placeholder="+ tag"
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) addTag(input)
            if (e.key === 'Escape') setShowSuggestions(false)
          }}
        />
        {showSuggestions && (filtered.length > 0 || input.trim()) && (
          <div className="tag-suggestions">
            {filtered.slice(0, 8).map(tag => (
              <button key={tag} className="tag-suggestion-item" onClick={() => addTag(tag)}>
                #{tag}
              </button>
            ))}
            {input.trim() && !allTags.includes(input.toLowerCase()) && (
              <button className="tag-suggestion-item tag-suggestion-new" onClick={() => addTag(input)}>
                + Add "#{input}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
