import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface FormatState {
  visible: boolean
  expanded: boolean
  x: number
  y: number
  target: HTMLElement | null
}

const FORMATS = [
  { id: 'bold',          label: 'B',  style: { fontWeight: 800 },                        title: 'Bold (Ctrl+B)' },
  { id: 'italic',        label: 'I',  style: { fontStyle: 'italic' },                    title: 'Italic (Ctrl+I)' },
  { id: 'underline',     label: 'U',  style: { textDecoration: 'underline' },            title: 'Underline' },
  { id: 'strikethrough', label: 'S',  style: { textDecoration: 'line-through' },         title: 'Strikethrough' },
  { id: 'code',          label: '<>', style: { fontFamily: 'monospace', fontSize: '0.8em' }, title: 'Inline code' },
]

function applyMarkdown(format: string, textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = textarea.value.slice(start, end)
  if (!selected) return
  const markers: Record<string, string> = {
    bold: '**', italic: '_', strikethrough: '~~', code: '`', underline: '__'
  }
  const m = markers[format] || ''
  const newVal = textarea.value.slice(0, start) + m + selected + m + textarea.value.slice(end)
  // Trigger native input event so React state updates
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  nativeInputValueSetter?.call(textarea, newVal)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.setSelectionRange(start + m.length, end + m.length)
}

function applyToInput(format: string, input: HTMLInputElement) {
  const start = input.selectionStart || 0
  const end = input.selectionEnd || 0
  const selected = input.value.slice(start, end)
  if (!selected) return
  const markers: Record<string, string> = { bold: '**', italic: '_', strikethrough: '~~', code: '`', underline: '__' }
  const m = markers[format] || ''
  const newVal = input.value.slice(0, start) + m + selected + m + input.value.slice(end)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  nativeInputValueSetter?.call(input, newVal)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.setSelectionRange(start + m.length, end + m.length)
}

export default function FloatingFormat() {
  const [state, setState] = useState<FormatState>({
    visible: false, expanded: false, x: 0, y: 0, target: null
  })
  const dotRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number>(0)

  const updatePosition = useCallback(() => {
    const active = document.activeElement as HTMLElement
    if (!active) return
    const isEditable = active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable
    if (!isEditable) { setState(s => ({ ...s, visible: false })); return }

    const sel = window.getSelection()
    const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0

    if (hasSelection) {
      // Expanded toolbar above selection
      const range = sel!.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setState({
        visible: true, expanded: true,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        target: active,
      })
      return
    }

    // Dot follows cursor in textarea
    if (active.tagName === 'TEXTAREA') {
      const ta = active as HTMLTextAreaElement
      const rect = ta.getBoundingClientRect()
      // Approximate cursor position using line height
      const lineH = parseInt(getComputedStyle(ta).lineHeight) || 24
      const lines = ta.value.slice(0, ta.selectionStart).split('\n')
      const lineIdx = lines.length - 1
      const scrollTop = ta.scrollTop
      const cursorY = rect.top + lineIdx * lineH - scrollTop + lineH / 2
      const cursorX = rect.left + Math.min(lines[lineIdx].length * 7.5, rect.width - 16)
      setState({
        visible: true, expanded: false,
        x: Math.min(cursorX + 12, window.innerWidth - 20),
        y: Math.max(cursorY - 20, 4),
        target: active,
      })
      return
    }

    // Dot for inputs (heading, list, checklist)
    if (active.tagName === 'INPUT') {
      const rect = active.getBoundingClientRect()
      setState({
        visible: true, expanded: false,
        x: rect.right - 16,
        y: rect.top - 16,
        target: active,
      })
    }
  }, [])

  useEffect(() => {
    const onSelectionChange = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(updatePosition)
    }
    const onKeyUp = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(updatePosition)
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement
      if (dotRef.current?.contains(related)) return
      setState(s => ({ ...s, visible: false }))
    }
    const onMouseUp = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(updatePosition)
    }

    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('mouseup', onMouseUp)
      cancelAnimationFrame(frameRef.current)
    }
  }, [updatePosition])

  const handleFormat = (formatId: string) => {
    if (!state.target) return
    if (state.target.tagName === 'TEXTAREA') {
      applyMarkdown(formatId, state.target as HTMLTextAreaElement)
    } else if (state.target.tagName === 'INPUT') {
      applyToInput(formatId, state.target as HTMLInputElement)
    }
    state.target.focus()
    setState(s => ({ ...s, expanded: false }))
  }

  if (!state.visible) return null

  return createPortal(
    <div
      ref={dotRef}
      className={`float-format ${state.expanded ? 'float-format-open' : 'float-format-dot'}`}
      style={{
        position: 'fixed',
        left: state.expanded ? Math.max(8, Math.min(state.x - 88, window.innerWidth - 180)) : state.x,
        top: state.expanded ? state.y - 44 : state.y,
        zIndex: 9999,
        pointerEvents: state.expanded ? 'all' : 'none',
      }}
    >
      {state.expanded ? (
        <>
          {FORMATS.map(f => (
            <button
              key={f.id}
              className="float-format-btn"
              style={f.style}
              title={f.title}
              onMouseDown={e => { e.preventDefault(); handleFormat(f.id) }}
            >
              {f.label}
            </button>
          ))}
        </>
      ) : (
        <div className="float-format-glow" />
      )}
    </div>,
    document.body
  )
}
