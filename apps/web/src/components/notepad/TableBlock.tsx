import React, { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  rows: number
  cols: number
  initialData?: string[][]
  onChange: (data: string[][]) => void
  onRemove: () => void
}

const generateId = () => Math.random().toString(36).slice(2, 6)

// Column letter helper A, B, C... Z, AA, AB...
function colLabel(idx: number): string {
  let label = ''
  idx++
  while (idx > 0) {
    label = String.fromCharCode(65 + ((idx - 1) % 26)) + label
    idx = Math.floor((idx - 1) / 26)
  }
  return label
}

// Formula evaluator
function evalFormula(formula: string, data: string[][], cellId: string): string {
  try {
    const expr = formula.slice(1).toUpperCase().trim()

    // Parse cell range like A1:B3
    const parseCellRef = (ref: string): number[] => {
      const match = ref.match(/^([A-Z]+)(\d+)$/)
      if (!match) return [0, 0]
      const col = match[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0) - 1
      const row = parseInt(match[2]) - 1
      return [row, col]
    }

    const getCellValue = (ref: string): number => {
      const [r, c] = parseCellRef(ref)
      if (r < 0 || c < 0 || r >= data.length || c >= (data[0]?.length || 0)) return 0
      const val = data[r][c]
      if (val?.startsWith('=')) return parseFloat(evalFormula(val, data, `${colLabel(c)}${r + 1}`)) || 0
      return parseFloat(val) || 0
    }

    const getRangeValues = (range: string): number[] => {
      const [start, end] = range.split(':')
      const [r1, c1] = parseCellRef(start)
      const [r2, c2] = parseCellRef(end)
      const values: number[] = []
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          const val = data[r]?.[c]
          if (val?.startsWith('=')) values.push(parseFloat(evalFormula(val, data, `${colLabel(c)}${r + 1}`)) || 0)
          else values.push(parseFloat(val) || 0)
        }
      }
      return values
    }

    // SUM
    const sumMatch = expr.match(/^SUM\(([^)]+)\)$/)
    if (sumMatch) {
      const arg = sumMatch[1]
      const values = arg.includes(':') ? getRangeValues(arg) : arg.split(',').map(r => getCellValue(r.trim()))
      return String(values.reduce((a, b) => a + b, 0))
    }

    // AVG / AVERAGE
    const avgMatch = expr.match(/^(?:AVG|AVERAGE)\(([^)]+)\)$/)
    if (avgMatch) {
      const values = avgMatch[1].includes(':') ? getRangeValues(avgMatch[1]) : avgMatch[1].split(',').map(r => getCellValue(r.trim()))
      return values.length ? String(values.reduce((a, b) => a + b, 0) / values.length) : '0'
    }

    // COUNT
    const countMatch = expr.match(/^COUNT\(([^)]+)\)$/)
    if (countMatch) {
      const values = countMatch[1].includes(':') ? getRangeValues(countMatch[1]) : countMatch[1].split(',').map(r => getCellValue(r.trim()))
      return String(values.filter(v => !isNaN(v)).length)
    }

    // MAX
    const maxMatch = expr.match(/^MAX\(([^)]+)\)$/)
    if (maxMatch) {
      const values = maxMatch[1].includes(':') ? getRangeValues(maxMatch[1]) : maxMatch[1].split(',').map(r => getCellValue(r.trim()))
      return String(Math.max(...values))
    }

    // MIN
    const minMatch = expr.match(/^MIN\(([^)]+)\)$/)
    if (minMatch) {
      const values = minMatch[1].includes(':') ? getRangeValues(minMatch[1]) : minMatch[1].split(',').map(r => getCellValue(r.trim()))
      return String(Math.min(...values))
    }

    // Simple arithmetic with cell refs: =A1+B1
    const arithmetic = expr.replace(/([A-Z]+\d+)/g, (ref) => String(getCellValue(ref)))
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${arithmetic})`)()
    return String(isNaN(result) ? '#ERR' : result)
  } catch {
    return '#ERR'
  }
}

export default function TableBlock({ rows, cols, initialData, onChange, onRemove }: Props) {
  const [data, setData] = useState<string[][]>(
    initialData || Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  )
  const [editing, setEditing] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [colWidths, setColWidths] = useState<number[]>(Array(cols).fill(120))
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const resizeRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null)

  const update = useCallback((r: number, c: number, val: string) => {
    setData(d => {
      const next = d.map(row => [...row])
      next[r][c] = val
      onChange(next)
      return next
    })
  }, [onChange])

  const insertRow = (afterIdx: number) =>
    setData(d => { const next = [...d.slice(0, afterIdx + 1), Array(d[0].length).fill(''), ...d.slice(afterIdx + 1)]; onChange(next); return next })
  const deleteRow = (idx: number) =>
    setData(d => { if (d.length <= 1) return d; const next = d.filter((_, i) => i !== idx); onChange(next); return next })
  const insertCol = (afterIdx: number) => {
    setData(d => { const next = d.map(r => [...r.slice(0, afterIdx + 1), '', ...r.slice(afterIdx + 1)]); onChange(next); return next })
    setColWidths(w => [...w.slice(0, afterIdx + 1), 120, ...w.slice(afterIdx + 1)])
  }
  const deleteCol = (idx: number) => {
    setData(d => { if (d[0].length <= 1) return d; const next = d.map(r => r.filter((_, i) => i !== idx)); onChange(next); return next })
    setColWidths(w => w.filter((_, i) => i !== idx))
  }

  // Column resize
  const onResizeMouseDown = (e: React.MouseEvent, colIdx: number) => {
    e.preventDefault()
    resizeRef.current = { colIdx, startX: e.clientX, startW: colWidths[colIdx] }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const { colIdx: ci, startX, startW } = resizeRef.current
      const newW = Math.max(60, startW + (ev.clientX - startX))
      setColWidths(w => w.map((v, i) => i === ci ? newW : v))
    }
    const onUp = () => { resizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const getCellDisplay = (r: number, c: number) => {
    const val = data[r][c]
    if (val?.startsWith('=') && editing?.[0] !== r || editing?.[1] !== c) {
      return evalFormula(val, data, `${colLabel(c)}${r + 1}`)
    }
    return val
  }

  const isFormula = (val: string) => val?.startsWith('=')

  return (
    <div className="block block-table-pro">
      <div className="table-pro-toolbar">
        <span className="table-label">⊞ Table — {data.length} × {data[0]?.length || 0}</span>
        <div className="table-pro-actions">
          <span className="table-formula-hint">Formulas: =SUM(A1:A3) · =AVG() · =MAX() · =MIN() · =COUNT()</span>
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>

      <div className="table-pro-scroll">
        <table className="table-pro-el">
          <thead>
            <tr>
              {/* Row number header corner */}
              <th className="table-row-num-header" />
              {data[0]?.map((_, ci) => (
                <th key={ci} className="table-col-header" style={{ width: colWidths[ci] }}
                  onMouseEnter={() => setHoverCol(ci)} onMouseLeave={() => setHoverCol(null)}>
                  <div className="table-col-header-inner">
                    <span>{colLabel(ci)}</span>
                    {hoverCol === ci && (
                      <div className="table-col-header-btns">
                        <button onClick={() => insertCol(ci - 1)} title="Insert before">⟵+</button>
                        <button onClick={() => insertCol(ci)} title="Insert after">+⟶</button>
                        <button onClick={() => deleteCol(ci)} title="Delete col" className="table-del-btn">−</button>
                      </div>
                    )}
                  </div>
                  <div className="table-col-resize" onMouseDown={e => onResizeMouseDown(e, ci)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} onMouseEnter={() => setHoverRow(ri)} onMouseLeave={() => setHoverRow(null)}>
                {/* Row number */}
                <td className="table-row-num">
                  <div className="table-row-num-inner">
                    <span>{ri + 1}</span>
                    {hoverRow === ri && (
                      <div className="table-row-btns">
                        <button onClick={() => insertRow(ri - 1)} title="Insert above">↑+</button>
                        <button onClick={() => insertRow(ri)} title="Insert below">+↓</button>
                        <button onClick={() => deleteRow(ri)} title="Delete row" className="table-del-btn">−</button>
                      </div>
                    )}
                  </div>
                </td>
                {row.map((cell, ci) => {
                  const isEditing = editing?.[0] === ri && editing?.[1] === ci
                  const isSelected = selected?.[0] === ri && selected?.[1] === ci
                  const display = getCellDisplay(ri, ci)
                  const hasFormula = isFormula(cell)
                  return (
                    <td key={ci}
                      className={`table-pro-cell ${ri === 0 ? 'table-header-row' : ''} ${isSelected ? 'table-cell-selected' : ''} ${hasFormula ? 'table-cell-formula' : ''}`}
                      style={{ width: colWidths[ci] }}
                      onClick={() => setSelected([ri, ci])}
                      onDoubleClick={() => setEditing([ri, ci])}>
                      {isEditing ? (
                        <input className="table-cell-input-pro" value={cell} autoFocus
                          onChange={e => update(ri, ci, e.target.value)}
                          onBlur={() => setEditing(null)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); setEditing(null); setSelected([Math.min(ri + 1, data.length - 1), ci]) }
                            if (e.key === 'Tab') { e.preventDefault(); setEditing(null); setSelected([ri, Math.min(ci + 1, row.length - 1)]) }
                            if (e.key === 'Escape') setEditing(null)
                          }}
                        />
                      ) : (
                        <span className={`table-cell-display ${hasFormula ? 'formula-result' : ''}`}>
                          {display}
                          {hasFormula && <span className="formula-indicator">ƒ</span>}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formula bar */}
      {selected && (
        <div className="table-formula-bar">
          <span className="formula-cell-ref">{colLabel(selected[1])}{selected[0] + 1}</span>
          <input className="formula-input"
            value={data[selected[0]][selected[1]]}
            onChange={e => update(selected[0], selected[1], e.target.value)}
            onFocus={() => setEditing(selected)}
            onBlur={() => setEditing(null)}
            placeholder="Value or =formula"
          />
        </div>
      )}
    </div>
  )
}
