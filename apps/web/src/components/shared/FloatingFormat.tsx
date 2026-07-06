import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

const FORMATS = [
  { id: 'bold',          label: 'B',  style: { fontWeight: 800 } as React.CSSProperties,                        title: 'Bold (Ctrl+B)',    marker: '**' },
  { id: 'italic',        label: 'I',  style: { fontStyle: 'italic' } as React.CSSProperties,                    title: 'Italic (Ctrl+I)',   marker: '_' },
  { id: 'underline',     label: 'U',  style: { textDecoration: 'underline' } as React.CSSProperties,            title: 'Underline',         marker: '__' },
  { id: 'strikethrough', label: 'S',  style: { textDecoration: 'line-through' } as React.CSSProperties,         title: 'Strikethrough',     marker: '~~' },
  { id: 'code',          label: '<>', style: { fontFamily: 'monospace', fontSize: '0.8em' } as React.CSSProperties, title: 'Inline code',   marker: '`' },
]

function applyFormat(marker: string, el: HTMLTextAreaElement | HTMLInputElement) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const selected = el.value.slice(start, end)
  if (!selected) return
  const newVal = el.value.slice(0, start) + marker + selected + marker + el.value.slice(end)
  // Trigger React synthetic event
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, newVal)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.setSelectionRange(start + marker.length, end + marker.length)
}

export default function FloatingFormat() {
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null)
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null)
  const [activeEl, setActiveEl] = useState<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const isEditableTarget = (el: Element | null): el is HTMLTextAreaElement | HTMLInputElement => {
    if (!el) return false
    const tag = el.tagName
    return (tag === 'TEXTAREA' || tag === 'INPUT') &&
      !(el as HTMLInputElement).readOnly &&
      !(el as HTMLInputElement).disabled
  }

  const checkSelection = useCallback(() => {
    const active = document.activeElement
    if (!isEditableTarget(active)) {
      setToolbar(null)
      return
    }

    const start = active.selectionStart ?? 0
    const end = active.selectionEnd ?? 0

    if (end > start) {
      // Has selection — show toolbar
      // Use a range on the element's bounding rect as approximation
      const rect = active.getBoundingClientRect()
      const lineH = parseInt(getComputedStyle(active).lineHeight) || 24
      const textBefore = active.value.slice(0, start)
      const lines = textBefore.split('\n')
      const lineIdx = Math.min(lines.length - 1, Math.floor((rect.height - 8) / lineH))
      const approxY = rect.top + lineIdx * lineH
      const approxX = rect.left + rect.width * 0.5

      setActiveEl(active)
      setToolbar({ x: approxX, y: approxY })
      setDot(null)
    } else {
      setToolbar(null)
    }
  }, [])

  const updateDot = useCallback(() => {
    const active = document.activeElement
    if (!isEditableTarget(active)) { setDot(null); return }

    const rect = active.getBoundingClientRect()
    const lineH = parseInt(getComputedStyle(active).lineHeight) || 24
    const pos = active.selectionStart ?? 0
    const lines = active.value.slice(0, pos).split('\n')
    const lineIdx = lines.length - 1
    const scrollTop = (active as HTMLTextAreaElement).scrollTop || 0
    const y = rect.top + lineIdx * lineH - scrollTop
    const charW = 7.5
    const x = rect.left + Math.min(lines[lineIdx].length * charW + 8, rect.width - 20)

    setActiveEl(active)
    setDot({ x: Math.min(x, window.innerWidth - 24), y: Math.max(y - 8, 4) })
  }, [])

  useEffect(() => {
    const onMouseUp = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        checkSelection()
        updateDot()
      })
    }
    const onKeyUp = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        checkSelection()
        updateDot()
      })
    }
    const onFocus = (e: FocusEvent) => {
      if (isEditableTarget(e.target as Element)) {
        setActiveEl(e.target as HTMLTextAreaElement | HTMLInputElement)
        updateDot()
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement
      if (toolbarRef.current?.contains(related) || dotRef.current?.contains(related)) return
      setTimeout(() => {
        const active = document.activeElement
        if (!isEditableTarget(active)) {
          setDot(null)
          setToolbar(null)
        }
      }, 150)
    }
    const onSelChange = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(checkSelection)
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('selectionchange', onSelChange)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('selectionchange', onSelChange)
      cancelAnimationFrame(rafRef.current)
    }
  }, [checkSelection, updateDot])

  const handleFormat = (marker: string) => {
    if (!activeEl) return
    applyFormat(marker, activeEl)
    setToolbar(null)
    setTimeout(updateDot, 50)
  }

  const handleDotClick = () => {
    if (!activeEl) return
    const rect = activeEl.getBoundingClientRect()
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top })
    setDot(null)
  }

  return createPortal(
    <>
      {/* Glowing dot */}
      {dot && !toolbar && (
        <div ref={dotRef} className="float-dot"
          style={{ position: 'fixed', left: dot.x, top: dot.y, zIndex: 9999 }}
          onClick={handleDotClick}
          title="Click to format">
          <div className="float-dot-inner" />
        </div>
      )}

      {/* Format toolbar */}
      {toolbar && (
        <div ref={toolbarRef}
          className="float-format-open"
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(toolbar.x - 88, window.innerWidth - 185)),
            top: toolbar.y - 48,
            zIndex: 9999,
          }}>
          {FORMATS.map(f => (
            <button key={f.id} className="float-format-btn"
              style={f.style} title={f.title}
              onMouseDown={e => { e.preventDefault(); handleFormat(f.marker) }}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </>,
    document.body
  )
}
