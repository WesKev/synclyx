import React, { useState, useRef, useCallback } from 'react'

interface Props {
  rows: number
  cols: number
  initialData?: string[][]
  onChange: (data: string[][]) => void
  onRemove: () => void
}

function colLabel(idx: number): string {
  let label = ''
  idx++
  while (idx > 0) {
    label = String.fromCharCode(65 + ((idx - 1) % 26)) + label
    idx = Math.floor((idx - 1) / 26)
  }
  return label
}

function evalFormula(formula: string, data: string[][]): string {
  try {
    const expr = formula.slice(1).toUpperCase().trim()
    const parseCellRef = (ref: string) => {
      const m = ref.match(/^([A-Z]+)(\d+)$/)
      if (!m) return [0, 0]
      const col = m[1].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1
      return [parseInt(m[2]) - 1, col]
    }
    const getCellVal = (ref: string): number => {
      const [r, c] = parseCellRef(ref)
      if (r < 0 || c < 0 || r >= data.length || c >= (data[0]?.length || 0)) return 0
      const v = data[r][c]
      if (!v || v.trim() === '') return 0
      if (v.startsWith('=')) return parseFloat(evalFormula(v, data)) || 0
      return parseFloat(v) || 0
    }
    const getRangeVals = (range: string): number[] => {
      const [s, e] = range.split(':')
      const [r1, c1] = parseCellRef(s)
      const [r2, c2] = parseCellRef(e)
      const vals: number[] = []
      for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
        for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) {
          const v = data[r]?.[c]
          if (!v || v.trim() === '') { vals.push(0); continue }
          vals.push(v.startsWith('=') ? parseFloat(evalFormula(v, data)) || 0 : parseFloat(v) || 0)
        }
      return vals
    }
    const getArgs = (arg: string) => arg.includes(':') ? getRangeVals(arg) : arg.split(',').map(r => getCellVal(r.trim()))

    const sumM = expr.match(/^SUM\(([^)]+)\)$/)
    if (sumM) return String(getArgs(sumM[1]).reduce((a,b) => a+b, 0))
    const avgM = expr.match(/^(?:AVG|AVERAGE)\(([^)]+)\)$/)
    if (avgM) { const v = getArgs(avgM[1]); return v.length ? String(v.reduce((a,b)=>a+b,0)/v.length) : '0' }
    const countM = expr.match(/^COUNT\(([^)]+)\)$/)
    if (countM) return String(getArgs(countM[1]).filter(v => !isNaN(v) && v !== 0).length)
    const maxM = expr.match(/^MAX\(([^)]+)\)$/)
    if (maxM) { const v = getArgs(maxM[1]); return v.length ? String(Math.max(...v)) : '0' }
    const minM = expr.match(/^MIN\(([^)]+)\)$/)
    if (minM) { const v = getArgs(minM[1]); return v.length ? String(Math.min(...v)) : '0' }
    // Arithmetic with cell refs
    const arith = expr.replace(/([A-Z]+\d+)/g, ref => String(getCellVal(ref)))
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${arith})`)()
    return isNaN(result) ? '#ERR' : String(result)
  } catch { return '#ERR' }
}

export default function TableBlock({ rows, cols, initialData, onChange, onRemove }: Props) {
  const [data, setData] = useState<string[][]>(
    initialData && initialData.length > 0
      ? initialData
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  )
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null)
  const [selectedAll, setSelectedAll] = useState(false)
  const [colWidths, setColWidths] = useState<number[]>(Array(cols).fill(130))
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const resizeRef = useRef<{ ci: number; startX: number; startW: number } | null>(null)

  const update = (r: number, c: number, val: string) => {
    setData(d => {
      const next = d.map(row => [...row])
      next[r][c] = val
      onChange(next)
      return next
    })
  }

  const insertRow = (afterIdx: number) =>
    setData(d => { const n = [...d.slice(0,afterIdx+1), Array(d[0]?.length||cols).fill(''), ...d.slice(afterIdx+1)]; onChange(n); return n })
  const deleteRow = (idx: number) =>
    setData(d => { if (d.length<=1) return d; const n = d.filter((_,i)=>i!==idx); onChange(n); return n })
  const insertCol = (afterIdx: number) => {
    setData(d => { const n = d.map(r=>[...r.slice(0,afterIdx+1),'',...r.slice(afterIdx+1)]); onChange(n); return n })
    setColWidths(w => [...w.slice(0,afterIdx+1),130,...w.slice(afterIdx+1)])
  }
  const deleteCol = (idx: number) => {
    if (data[0]?.length <= 1) return
    setData(d => { const n = d.map(r=>r.filter((_,i)=>i!==idx)); onChange(n); return n })
    setColWidths(w => w.filter((_,i)=>i!==idx))
  }

  const startResize = (e: React.MouseEvent, ci: number) => {
    e.preventDefault()
    resizeRef.current = { ci, startX: e.clientX, startW: colWidths[ci] }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const { ci: col, startX, startW } = resizeRef.current
      setColWidths(w => w.map((v,i) => i===col ? Math.max(60, startW+(ev.clientX-startX)) : v))
    }
    const onUp = () => { resizeRef.current=null; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const getDisplay = (r: number, c: number) => {
    const val = data[r]?.[c]
    if (!val || val.trim() === '') return ''
    if (val.startsWith('=')) return evalFormula(val, data)
    return val
  }

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const focusCell = (r: number, c: number) => {
    setActiveCell([r, c])
    setSelectedAll(false)
    setTimeout(() => inputRefs.current[`${r}-${c}`]?.focus(), 10)
  }

  return (
    <div className="block block-table-pro">
      <div className="table-pro-toolbar">
        <span className="table-label">⊞ Table — {data.length} × {data[0]?.length || 0}</span>
        <div className="table-pro-actions">
          <span className="table-formula-hint">= SUM · AVG · MAX · MIN · COUNT</span>
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>

      <div className="table-pro-scroll">
        <table className="table-pro-el">
          <thead>
            <tr>
              {/* Select-all corner */}
              <th className="table-corner-all"
                onClick={() => setSelectedAll(s => !s)}
                title="Select all">
                {selectedAll ? '◼' : '◻'}
              </th>
              {(data[0] || Array(cols).fill('')).map((_, ci) => (
                <th key={ci}
                  className={`table-col-header ${hoverCol === ci ? 'hovered' : ''}`}
                  style={{ width: colWidths[ci] || 130 }}
                  onMouseEnter={() => setHoverCol(ci)}
                  onMouseLeave={() => setHoverCol(null)}>
                  <div className="table-col-header-inner">
                    <span>{colLabel(ci)}</span>
                    {hoverCol === ci && (
                      <div className="table-col-header-btns">
                        <button onClick={() => insertCol(ci-1)} title="Insert before">+←</button>
                        <button onClick={() => insertCol(ci)} title="Insert after">→+</button>
                        <button className="table-del-btn" onClick={() => deleteCol(ci)} title="Delete">−</button>
                      </div>
                    )}
                  </div>
                  <div className="table-col-resize" onMouseDown={e => startResize(e, ci)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri}
                onMouseEnter={() => setHoverRow(ri)}
                onMouseLeave={() => setHoverRow(null)}>
                {/* Row number */}
                <td className="table-row-num">
                  <div className="table-row-num-inner">
                    <span>{ri + 1}</span>
                    {hoverRow === ri && (
                      <div className="table-row-btns">
                        <button onClick={() => insertRow(ri-1)} title="Insert above">↑+</button>
                        <button onClick={() => insertRow(ri)} title="Insert below">+↓</button>
                        <button className="table-del-btn" onClick={() => deleteRow(ri)}>−</button>
                      </div>
                    )}
                  </div>
                </td>
                {row.map((cell, ci) => {
                  const isActive = activeCell?.[0]===ri && activeCell?.[1]===ci
                  const display = getDisplay(ri, ci)
                  const isFormula = cell?.startsWith('=')
                  const isSelected = selectedAll
                  return (
                    <td key={ci}
                      className={`table-pro-cell ${ri===0?'table-header-row':''} ${isActive?'table-cell-selected':''} ${isSelected?'table-cell-all-selected':''} ${isFormula?'table-cell-formula':''}`}
                      style={{ width: colWidths[ci] || 130 }}
                      onClick={() => focusCell(ri, ci)}>
                      <input
                        ref={el => { inputRefs.current[`${ri}-${ci}`] = el }}
                        className="table-cell-input-pro"
                        value={isActive ? cell : display}
                        readOnly={!isActive}
                        onChange={e => update(ri, ci, e.target.value)}
                        onFocus={() => setActiveCell([ri, ci])}
                        onBlur={() => setActiveCell(null)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); focusCell(Math.min(ri+1, data.length-1), ci) }
                          if (e.key === 'Tab') { e.preventDefault(); focusCell(ri, Math.min(ci+1, row.length-1)) }
                          if (e.key === 'Escape') setActiveCell(null)
                        }}
                        placeholder={ri===0 ? `Col ${ci+1}` : ''}
                        style={{ color: isFormula && !isActive ? '#74b9ff' : undefined }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formula bar */}
      {activeCell && (
        <div className="table-formula-bar">
          <span className="formula-cell-ref">{colLabel(activeCell[1])}{activeCell[0]+1}</span>
          <input className="formula-input"
            value={data[activeCell[0]]?.[activeCell[1]] || ''}
            onChange={e => update(activeCell[0], activeCell[1], e.target.value)}
            placeholder="Value or =SUM(A1:A3)"
          />
          {data[activeCell[0]]?.[activeCell[1]]?.startsWith('=') && (
            <span className="formula-result-preview">= {getDisplay(activeCell[0], activeCell[1])}</span>
          )}
        </div>
      )}
    </div>
  )
}
