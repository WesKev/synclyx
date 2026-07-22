import React, { useState, useRef, useCallback, useEffect } from 'react'

interface TableMeta {
  name: string; frozenRow: number; frozenCol: number
  rowColors: Record<number, string>; colColors: Record<number, string>
}
interface Props {
  rows: number; cols: number; initialData?: string[][]
  initialMeta?: TableMeta
  onChange: (data: string[][], meta: TableMeta) => void
  onRemove: () => void
}

const DEFAULT_META: TableMeta = { name: 'Table', frozenRow: -1, frozenCol: -1, rowColors: {}, colColors: {} }
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9a3c','#a8dadc','#f72585','#e2e2e2','']

const FORMULAS = [
  { name: 'SUM',     desc: 'Adds all values in a range',        example: '=SUM(A1:A5)' },
  { name: 'AVG',     desc: 'Average of values in a range',      example: '=AVG(A1:A5)' },
  { name: 'MAX',     desc: 'Highest value in a range',          example: '=MAX(A1:A5)' },
  { name: 'MIN',     desc: 'Lowest value in a range',           example: '=MIN(A1:A5)' },
  { name: 'COUNT',   desc: 'Count of numeric values',           example: '=COUNT(A1:A5)' },
  { name: 'DIFF',    desc: 'Difference between two values',     example: '=DIFF(A1,A2)' },
  { name: 'PRODUCT', desc: 'Multiplies all values in a range',  example: '=PRODUCT(A1:A5)' },
  { name: 'CONCAT',  desc: 'Joins text values together',        example: '=CONCAT(A1,B1)' },
  { name: 'IF',      desc: 'Returns value based on condition',  example: '=IF(A1>10,"Yes","No")' },
  { name: 'ROUND',   desc: 'Rounds a number to decimals',       example: '=ROUND(A1,2)' },
  { name: 'LEN',     desc: 'Length of text in a cell',          example: '=LEN(A1)' },
  { name: 'UPPER',   desc: 'Converts text to uppercase',        example: '=UPPER(A1)' },
  { name: 'LOWER',   desc: 'Converts text to lowercase',        example: '=LOWER(A1)' },
  { name: 'ABS',     desc: 'Absolute value (removes negative)', example: '=ABS(A1)' },
  { name: 'POWER',   desc: 'Raises number to a power',          example: '=POWER(A1,2)' },
]

function colLabel(idx: number): string {
  let label = ''; idx++
  while (idx > 0) { label = String.fromCharCode(65+((idx-1)%26))+label; idx=Math.floor((idx-1)/26) }
  return label
}

function cellRef(r: number, c: number) { return `${colLabel(c)}${r + 1}` }

function evalFormula(formula: string, data: string[][]): string {
  try {
    const expr = formula.slice(1).toUpperCase().trim()
    const parseRef = (ref: string) => {
      const m = ref.match(/^([A-Z]+)(\d+)$/)
      if (!m) return [0, 0]
      return [parseInt(m[2]) - 1, m[1].split('').reduce((a: number, c: string) => a * 26 + c.charCodeAt(0) - 64, 0) - 1]
    }
    const getVal = (ref: string): number => {
      const [r, c] = parseRef(ref)
      if (r < 0 || c < 0 || r >= data.length || c >= (data[0]?.length || 0)) return 0
      const v = data[r][c]; if (!v || v.trim() === '') return 0
      if (v.startsWith('=')) return parseFloat(evalFormula(v, data)) || 0
      return parseFloat(v) || 0
    }
    const getStr = (ref: string): string => { const [r, c] = parseRef(ref); return data[r]?.[c] || '' }
    const getRange = (range: string): number[] => {
      const [s, e] = range.split(':'); const [r1, c1] = parseRef(s); const [r2, c2] = parseRef(e)
      const vals: number[] = []
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          const v = data[r]?.[c] || ''; if (!v) continue
          vals.push(v.startsWith('=') ? parseFloat(evalFormula(v, data)) || 0 : parseFloat(v) || 0)
        }
      return vals
    }
    const args = (arg: string) => arg.includes(':') ? getRange(arg) : arg.split(',').map((r: string) => getVal(r.trim()))
    const m1 = expr.match(/^SUM\(([^)]+)\)$/); if (m1) return String(args(m1[1]).reduce((a: number, b: number) => a + b, 0))
    const m2 = expr.match(/^(?:AVG|AVERAGE)\(([^)]+)\)$/); if (m2) { const v = args(m2[1]); return v.length ? String(v.reduce((a: number, b: number) => a + b, 0) / v.length) : '0' }
    const m3 = expr.match(/^MAX\(([^)]+)\)$/); if (m3) { const v = args(m3[1]); return v.length ? String(Math.max(...v)) : '0' }
    const m4 = expr.match(/^MIN\(([^)]+)\)$/); if (m4) { const v = args(m4[1]); return v.length ? String(Math.min(...v)) : '0' }
    const m5 = expr.match(/^COUNT\(([^)]+)\)$/); if (m5) return String(args(m5[1]).filter((v: number) => !isNaN(v)).length)
    const m6 = expr.match(/^PRODUCT\(([^)]+)\)$/); if (m6) return String(args(m6[1]).reduce((a: number, b: number) => a * b, 1))
    const m7 = expr.match(/^DIFF\(([^,]+),([^)]+)\)$/); if (m7) return String(getVal(m7[1].trim()) - getVal(m7[2].trim()))
    const m8 = expr.match(/^CONCAT\((.+)\)$/); if (m8) return m8[1].split(',').map((r: string) => getStr(r.trim())).join('')
    const m9 = expr.match(/^LEN\(([^)]+)\)$/); if (m9) return String(getStr(m9[1].trim()).length)
    const m10 = expr.match(/^UPPER\(([^)]+)\)$/); if (m10) return getStr(m10[1].trim()).toUpperCase()
    const m11 = expr.match(/^LOWER\(([^)]+)\)$/); if (m11) return getStr(m11[1].trim()).toLowerCase()
    const m12 = expr.match(/^ABS\(([^)]+)\)$/); if (m12) return String(Math.abs(getVal(m12[1].trim())))
    const m13 = expr.match(/^POWER\(([^,]+),([^)]+)\)$/); if (m13) return String(Math.pow(getVal(m13[1].trim()), getVal(m13[2].trim())))
    const m14 = expr.match(/^ROUND\(([^,]+),([^)]+)\)$/); if (m14) { const dp = parseInt(m14[2].trim()); return String(Math.round(getVal(m14[1].trim()) * Math.pow(10, dp)) / Math.pow(10, dp)) }
    const arith = expr.replace(/([A-Z]+\d+)/g, (ref: string) => String(getVal(ref)))
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${arith})`)()
    return isNaN(result) ? '#ERR' : String(result)
  } catch { return '#ERR' }
}

// Shift formula cell refs by rowOffset, colOffset (for drag-fill)
function shiftFormula(formula: string, rowOffset: number, colOffset: number): string {
  return formula.replace(/([A-Z]+)(\d+)/g, (_, col, row) => {
    const newRow = parseInt(row) + rowOffset
    const colIdx = col.split('').reduce((a: number, c: string) => a * 26 + c.charCodeAt(0) - 64, 0) - 1
    const newColIdx = colIdx + colOffset
    let newCol = ''
    let idx = newColIdx + 1
    while (idx > 0) { newCol = String.fromCharCode(65 + ((idx - 1) % 26)) + newCol; idx = Math.floor((idx - 1) / 26) }
    return `${newCol}${newRow}`
  })
}

function estimateColWidth(data: string[][], ci: number): number {
  let max = 80
  data.forEach(row => { const w = (row[ci]?.length || 0) * 8 + 24; if (w > max) max = w })
  return Math.max(80, Math.min(280, max))
}

export default function TableBlock({ rows, cols, initialData, initialMeta, onChange, onRemove }: Props) {
  const [data, setData] = useState<string[][]>(
    initialData?.length ? initialData : Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  )
  const [meta, setMeta] = useState<TableMeta>(initialMeta || DEFAULT_META)
  const [editingName, setEditingName] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null)
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null)
  const [rowPopupPos, setRowPopupPos] = useState<{ x: number; y: number } | null>(null)
  const [highlightedCol, setHighlightedCol] = useState<number | null>(null)
  const [showRowColor, setShowRowColor] = useState(false)
  const [showColColor, setShowColColor] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [formulaMenu, setFormulaMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [formulaIndex, setFormulaIndex] = useState(0)

  // ── Range selection state ──────────────────────────────────────────────────
  const [isSelectingRange, setIsSelectingRange] = useState(false)
  const [rangeStart, setRangeStart] = useState<[number, number] | null>(null)
  const [rangeEnd, setRangeEnd] = useState<[number, number] | null>(null)
  const [rangeTargetCell, setRangeTargetCell] = useState<[number, number] | null>(null)

  // ── Drag fill state ────────────────────────────────────────────────────────
  const [isDraggingFill, setIsDraggingFill] = useState(false)
  const [fillStart, setFillStart] = useState<[number, number] | null>(null)
  const [fillEnd, setFillEnd] = useState<[number, number] | null>(null)

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const emit = useCallback((d: string[][], m: TableMeta) => onChange(d, m), [onChange])
  const updateData = (d: string[][]) => { setData(d); emit(d, meta) }
  const updateMeta = (m: TableMeta) => { setMeta(m); emit(data, m) }

  // Detect if current cell is mid-formula (waiting for range input)
  const isMidFormula = (val: string) => {
    if (!val.startsWith('=')) return false
    // formula has an open paren and no close paren yet, or ends with : or ,
    const after = val.slice(1)
    const opens = (after.match(/\(/g) || []).length
    const closes = (after.match(/\)/g) || []).length
    return opens > closes || val.endsWith(':') || val.endsWith(',') || val.endsWith('(')
  }

  const updateCell = (r: number, c: number, val: string) => {
    const next = data.map(row => [...row]); next[r][c] = val; updateData(next)
    if (val === '=') {
      const el = inputRefs.current[`${r}-${c}`]
      if (el) { const rect = el.getBoundingClientRect(); setFormulaMenu({ x: rect.left, y: rect.bottom + 4, query: '' }); setFormulaIndex(0) }
    } else if (val.startsWith('=') && val.length > 1) {
      const query = val.replace(/.*[^A-Z]/i, '').toUpperCase()
      setFormulaMenu(fm => fm ? { ...fm, query } : null)
      setFormulaIndex(0)
      // Enable range selection mode if mid-formula
      if (isMidFormula(val)) {
        setIsSelectingRange(true)
        setRangeTargetCell([r, c])
        setRangeStart(null)
        setRangeEnd(null)
      } else {
        setIsSelectingRange(false)
      }
    } else {
      setFormulaMenu(null)
      setIsSelectingRange(false)
    }
  }

  const filteredFormulas = formulaMenu ? FORMULAS.filter(f => f.name.startsWith(formulaMenu.query)) : []

  const insertFormula = (formula: typeof FORMULAS[0]) => {
    if (!activeCell) return
    const [r, c] = activeCell
    const next = data.map(row => [...row]); next[r][c] = `=${formula.name}(`
    updateData(next); setFormulaMenu(null)
    setIsSelectingRange(true)
    setRangeTargetCell([r, c])
    setTimeout(() => inputRefs.current[`${r}-${c}`]?.focus(), 10)
  }

  // Handle cell click during range selection
  const handleCellClick = (r: number, c: number) => {
    if (isSelectingRange && rangeTargetCell) {
      const [tr, tc] = rangeTargetCell
      if (!rangeStart) {
        // First cell of range
        setRangeStart([r, c])
        setRangeEnd([r, c])
        const currentVal = data[tr][tc]
        const newVal = currentVal + cellRef(r, c)
        const next = data.map(row => [...row]); next[tr][tc] = newVal; updateData(next)
        setActiveCell([tr, tc])
      } else {
        // Second cell — complete range
        setRangeEnd([r, c])
        const [sr, sc] = rangeStart
        const range = `${cellRef(Math.min(sr, r), Math.min(sc, c))}:${cellRef(Math.max(sr, r), Math.max(sc, c))}`
        const currentVal = data[tr][tc]
        // Replace last cell ref with full range
        const newVal = currentVal.replace(/[A-Z]+\d+$/, '') + range + ')'
        const next = data.map(row => [...row]); next[tr][tc] = newVal; updateData(next)
        setIsSelectingRange(false)
        setRangeStart(null)
        setRangeEnd(null)
        setRangeTargetCell(null)
        setActiveCell([tr, tc])
        setTimeout(() => inputRefs.current[`${tr}-${tc}`]?.focus(), 10)
      }
      return
    }
    focusCell(r, c)
  }

  // Check if cell is in selected range highlight
  const isInRange = (r: number, c: number) => {
    if (!rangeStart || !rangeEnd) return false
    const [r1, c1] = rangeStart; const [r2, c2] = rangeEnd
    return r >= Math.min(r1, r2) && r <= Math.max(r1, r2) && c >= Math.min(c1, c2) && c <= Math.max(c1, c2)
  }

  // ── Drag fill ──────────────────────────────────────────────────────────────
  const startFillDrag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault(); e.stopPropagation()
    setIsDraggingFill(true)
    setFillStart([r, c])
    setFillEnd([r, c])
  }

  useEffect(() => {
    let rafId: number | null = null
    const onMove = (e: MouseEvent) => {
      if (!isDraggingFill || !fillStart) return
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const els = document.elementsFromPoint(e.clientX, e.clientY)
        const tdEl = els.find(el => el.tagName === 'TD' && el.getAttribute('data-cell'))
        if (tdEl) {
          const [r, c] = (tdEl.getAttribute('data-cell') || '').split(',').map(Number)
          if (!isNaN(r) && !isNaN(c)) setFillEnd([r, c])
        }
      })
    }
    const onUp = () => {
      if (isDraggingFill && fillStart && fillEnd) {
        applyFillDown(fillStart, fillEnd)
      }
      setIsDraggingFill(false)
      setFillStart(null)
      setFillEnd(null)
    }
    if (isDraggingFill) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDraggingFill, fillStart, fillEnd])

  const applyFillDown = ([sr, sc]: [number, number], [er, ec]: [number, number]) => {
    const sourceVal = data[sr][sc]
    if (!sourceVal) return
    const next = data.map(row => [...row])
    const rowDir = er >= sr ? 1 : -1
    for (let r = sr + rowDir; r !== er + rowDir; r += rowDir) {
      const rowOffset = r - sr
      if (sourceVal.startsWith('=')) {
        next[r][sc] = shiftFormula(sourceVal, rowOffset, 0)
      } else {
        // For numbers, increment; for text, copy
        const num = parseFloat(sourceVal)
        next[r][sc] = isNaN(num) ? sourceVal : String(num + rowOffset)
      }
    }
    updateData(next)
  }

  const isFillHighlight = (r: number, c: number) => {
    if (!isDraggingFill || !fillStart || !fillEnd) return false
    const [sr, sc] = fillStart; const [er, ec] = fillEnd
    if (sc !== c) return false
    return r >= Math.min(sr, er) && r <= Math.max(sr, er)
  }

  // ── Row/col ops ────────────────────────────────────────────────────────────
  const insertRow = (afterIdx: number) => updateData([...data.slice(0, afterIdx + 1), Array(data[0]?.length || cols).fill(''), ...data.slice(afterIdx + 1)])
  const insertRowAbove = (idx: number) => updateData([...data.slice(0, idx), Array(data[0]?.length || cols).fill(''), ...data.slice(idx)])
  const deleteRow = (idx: number) => { if (data.length <= 1) return; updateData(data.filter((_, i) => i !== idx)); setHighlightedRow(null) }
  const insertCol = (afterIdx: number) => updateData(data.map(r => [...r.slice(0, afterIdx + 1), '', ...r.slice(afterIdx + 1)]))
  const deleteCol = (idx: number) => { if ((data[0]?.length || 0) <= 1) return; updateData(data.map(r => r.filter((_, i) => i !== idx))); setHighlightedCol(null) }

  const sortCol = (ci: number, asc: boolean) => {
    const header = data[0]; const body = data.slice(1)
    const sorted = [...body].sort((a, b) => {
      const va = a[ci] || ''; const vb = b[ci] || ''
      const na = parseFloat(va); const nb = parseFloat(vb)
      if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na
      return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    updateData([header, ...sorted]); setShowSort(false); setHighlightedCol(null)
  }

  // ── Move row/col up/down or left/right — safe, no native drag-and-drop ─────
  const moveRow = (idx: number, direction: -1 | 1) => {
    const target = idx + direction
    if (target < 0 || target >= data.length) return
    const next = [...data]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateData(next)
    setHighlightedRow(target)
  }

  const moveCol = (idx: number, direction: -1 | 1) => {
    const target = idx + direction
    if (target < 0 || target >= (data[0]?.length || 0)) return
    const next = data.map(row => {
      const r = [...row]
      ;[r[idx], r[target]] = [r[target], r[idx]]
      return r
    })
    updateData(next)
    setHighlightedCol(target)
  }

  const getDisplay = (r: number, c: number) => {
    const val = data[r]?.[c]; if (!val || val.trim() === '') return ''
    if (val.startsWith('=')) return evalFormula(val, data)
    return val
  }

  const focusCell = (r: number, c: number) => {
    setActiveCell([r, c]); setHighlightedRow(null); setHighlightedCol(null)
    setTimeout(() => inputRefs.current[`${r}-${c}`]?.focus(), 10)
  }

  const dismissAll = () => {
    setHighlightedRow(null); setHighlightedCol(null); setRowPopupPos(null)
    setShowRowColor(false); setShowColColor(false); setShowSort(false)
    if (!isSelectingRange) { setRangeStart(null); setRangeEnd(null) }
  }

  return (
    <div className="block block-table-pro" onClick={dismissAll}>
      <div className="table-pro-toolbar" onClick={e => e.stopPropagation()}>
        <div className="table-title-wrap">
          {editingName
            ? <input className="table-name-input" value={meta.name} autoFocus
                onChange={e => updateMeta({ ...meta, name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }} />
            : <span className="table-name" onClick={() => setEditingName(true)}>⊞ {meta.name} <span className="table-name-edit">✎</span></span>
          }
          <span className="table-size-badge">{data.length} × {data[0]?.length || 0}</span>
          <div className="table-info-wrap">
            <button className="table-info-btn" onMouseEnter={() => setShowInfo(true)} onMouseLeave={() => setShowInfo(false)}>ⓘ</button>
            {showInfo && (
              <div className="table-info-tooltip">
                <p><strong>Double-click</strong> a row number or column letter to open its menu.</p>
                <p><strong>Formulas:</strong> type <code>=</code> in any cell for autocomplete (SUM, AVG, MAX, MIN, COUNT and more).</p>
                <p><strong>Range select:</strong> mid-formula, click one cell then another to insert a range.</p>
                <p><strong>Fill down:</strong> drag the small square at a cell's bottom-right corner.</p>
                <p><strong>Reorder:</strong> use ↑↓ or ←→ in the row/column popup.</p>
              </div>
            )}
          </div>
          {isSelectingRange && (
            <span className="range-select-hint">📍 Click a cell, then another to select range</span>
          )}
        </div>
        <div className="table-pro-actions">
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>

      <div className="table-pro-scroll" onClick={e => e.stopPropagation()}>
        <table className="table-pro-el">
          <thead>
            <tr>
              <th className="table-corner-all" />
              {(data[0] || []).map((_, ci) => (
                <th key={ci}
                  className={`table-col-header ${highlightedCol === ci ? 'col-highlighted' : ''} ${meta.frozenCol >= ci ? 'frozen-col' : ''}`}
                  style={{ width: estimateColWidth(data, ci), background: meta.colColors[ci] || undefined }}>
                  <div className="table-col-header-inner"
                    onDoubleClick={e => { e.stopPropagation(); setHighlightedCol(highlightedCol === ci ? null : ci); setHighlightedRow(null); setShowColColor(false); setShowSort(false) }}>
                    <span>{colLabel(ci)}</span>
                    {meta.frozenCol >= ci && <span className="frozen-indicator">🧊</span>}
                  </div>
                  {highlightedCol === ci && (
                    <div className="col-hover-popup popup-grid-2col" onClick={e => e.stopPropagation()}>
                      <button className="popup-action" onClick={() => moveCol(ci, -1)} title="Move left" disabled={ci === 0}>←</button>
                      <button className="popup-action" onClick={() => moveCol(ci, 1)} title="Move right" disabled={ci === (data[0]?.length || 0) - 1}>→</button>
                      <button className={`popup-action ${meta.frozenCol >= ci ? 'active' : ''}`}
                        onClick={() => updateMeta({ ...meta, frozenCol: meta.frozenCol >= ci ? -1 : ci })} title="Freeze">🧊</button>
                      <div style={{ position: 'relative' }}>
                        <button className="popup-action" onClick={e => { e.stopPropagation(); setShowSort(s => !s) }} title="Sort">⇅</button>
                        {showSort && (
                          <div className="sort-dropdown">
                            <button onClick={() => sortCol(ci, true)}>↑ A → Z</button>
                            <button onClick={() => sortCol(ci, false)}>↓ Z → A</button>
                          </div>
                        )}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <button className="popup-action" onClick={e => { e.stopPropagation(); setShowColColor(s => !s) }} title="Color">🎨</button>
                        {showColColor && (
                          <div className="color-picker-popup">
                            {COLORS.map(c => (
                              <button key={c || 'none'} className="color-dot"
                                style={{ background: c || 'var(--bg-elevated)', border: meta.colColors[ci] === (c || undefined) ? '2px solid var(--accent)' : '2px solid transparent' }}
                                onClick={() => { const cc = { ...meta.colColors }; if (!c) delete cc[ci]; else cc[ci] = c; updateMeta({ ...meta, colColors: cc }); setShowColColor(false) }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="popup-action" onClick={() => insertCol(ci)} title="Insert col right">+→</button>
                      <button className="popup-action delete-action" onClick={() => deleteCol(ci)} title="Delete col">🗑</button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className={highlightedRow === ri ? 'row-highlighted' : ''}>
                <td className={`table-row-num ${meta.frozenRow >= ri ? 'frozen-row-num' : ''}`} style={{ position: 'relative' }}>
                  <div className="table-row-num-inner"
                    onDoubleClick={e => {
                      e.stopPropagation()
                      if (highlightedRow === ri) { setHighlightedRow(null); setRowPopupPos(null) }
                      else {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setRowPopupPos({ x: rect.right + 8, y: rect.top })
                        setHighlightedRow(ri)
                      }
                      setHighlightedCol(null); setShowRowColor(false)
                    }}>
                    <span>{ri + 1}</span>
                    {meta.frozenRow >= ri && <span className="frozen-indicator-small">🧊</span>}
                  </div>
                  {highlightedRow === ri && rowPopupPos && (
                    <div className="row-hover-popup popup-grid-2col row-popup-fixed"
                      style={{
                        position: 'fixed',
                        left: Math.min(rowPopupPos.x, window.innerWidth - 90),
                        top: Math.min(Math.max(rowPopupPos.y - 20, 8), window.innerHeight - 100),
                      }}
                      onClick={e => e.stopPropagation()}>
                      <button className="popup-action" onClick={() => moveRow(ri, -1)} title="Move up" disabled={ri === 0}>↑</button>
                      <button className="popup-action" onClick={() => moveRow(ri, 1)} title="Move down" disabled={ri === data.length - 1}>↓</button>
                      <button className={`popup-action ${meta.frozenRow >= ri ? 'active' : ''}`}
                        onClick={() => updateMeta({ ...meta, frozenRow: meta.frozenRow >= ri ? -1 : ri })} title="Freeze">🧊</button>
                      <button className="popup-action" onClick={() => insertRowAbove(ri)} title="Insert above">↑+</button>
                      <button className="popup-action" onClick={() => insertRow(ri)} title="Insert below">+↓</button>
                      <div style={{ position: 'relative' }}>
                        <button className="popup-action" onClick={e => { e.stopPropagation(); setShowRowColor(s => !s) }} title="Color">🎨</button>
                        {showRowColor && (
                          <div className="color-picker-popup color-picker-right">
                            {COLORS.map(c => (
                              <button key={c || 'none'} className="color-dot"
                                style={{ background: c || 'var(--bg-elevated)', border: meta.rowColors[ri] === (c || undefined) ? '2px solid var(--accent)' : '2px solid transparent' }}
                                onClick={() => { const rc = { ...meta.rowColors }; if (!c) delete rc[ri]; else rc[ri] = c; updateMeta({ ...meta, rowColors: rc }); setShowRowColor(false) }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="popup-action delete-action" onClick={() => deleteRow(ri)} title="Delete row">🗑</button>
                    </div>
                  )}
                </td>
                {row.map((cell, ci) => {
                  const isActive = activeCell?.[0] === ri && activeCell?.[1] === ci
                  const display = getDisplay(ri, ci)
                  const isFormula = cell?.startsWith('=')
                  const bg = meta.rowColors[ri] || meta.colColors[ci] || undefined
                  const inRange = isInRange(ri, ci)
                  const inFill = isFillHighlight(ri, ci)
                  const isSource = fillStart?.[0] === ri && fillStart?.[1] === ci
                  return (
                    <td key={ci}
                      data-cell={`${ri},${ci}`}
                      className={`table-pro-cell ${ri === 0 ? 'table-header-row' : ''} ${isActive ? 'table-cell-selected' : ''} ${inRange ? 'table-cell-range' : ''} ${inFill ? 'table-cell-fill-preview' : ''} ${isSelectingRange ? 'table-cell-selectable' : ''}`}
                      style={{ width: estimateColWidth(data, ci), background: bg, position: 'relative' }}
                      onClick={() => handleCellClick(ri, ci)}>
                      <input
                        ref={el => { inputRefs.current[`${ri}-${ci}`] = el }}
                        className="table-cell-input-pro"
                        value={isActive ? cell : display}
                        readOnly={!isActive}
                        onChange={e => updateCell(ri, ci, e.target.value)}
                        onFocus={() => setActiveCell([ri, ci])}
                        onBlur={() => { if (!isSelectingRange) setActiveCell(null); setFormulaMenu(null) }}
                        onKeyDown={e => {
                          if (formulaMenu && filteredFormulas.length > 0) {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setFormulaIndex(i => Math.min(i + 1, filteredFormulas.length - 1)); return }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setFormulaIndex(i => Math.max(i - 1, 0)); return }
                            if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertFormula(filteredFormulas[formulaIndex]); return }
                            if (e.key === 'Escape') { setFormulaMenu(null); return }
                          }
                          if (e.key === 'Escape') { setIsSelectingRange(false); setRangeStart(null); setRangeEnd(null); setActiveCell(null) }
                          if (e.key === 'Enter' && !formulaMenu) { e.preventDefault(); focusCell(Math.min(ri + 1, data.length - 1), ci) }
                          if (e.key === 'Tab' && !formulaMenu) { e.preventDefault(); focusCell(ri, Math.min(ci + 1, row.length - 1)) }
                        }}
                        placeholder={ri === 0 ? `Col ${ci + 1}` : ''}
                        style={{ color: isFormula && !isActive ? '#74b9ff' : undefined }}
                      />
                      {/* Drag fill handle — bottom right of active cell */}
                      {isActive && !isSelectingRange && (
                        <div
                          className="fill-handle"
                          onMouseDown={e => startFillDrag(e, ri, ci)}
                          title="Drag to fill down"
                        />
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
      {activeCell && (
        <div className="table-formula-bar">
          <span className="formula-cell-ref">{colLabel(activeCell[1])}{activeCell[0] + 1}</span>
          <input className="formula-input"
            value={data[activeCell[0]]?.[activeCell[1]] || ''}
            onChange={e => updateCell(activeCell[0], activeCell[1], e.target.value)}
            placeholder={isSelectingRange ? 'Click cells to select range...' : 'Value or =SUM(A1:A5)'}
            style={{ borderColor: isSelectingRange ? 'var(--accent)' : undefined }}
          />
          {data[activeCell[0]]?.[activeCell[1]]?.startsWith('=') && (
            <span className="formula-result-preview">= {getDisplay(activeCell[0], activeCell[1])}</span>
          )}
        </div>
      )}

      {/* Formula autocomplete */}
      {formulaMenu && filteredFormulas.length > 0 && (
        <div className="formula-autocomplete" style={{ position: 'fixed', left: formulaMenu.x, top: formulaMenu.y, zIndex: 1000 }}>
          <div className="formula-ac-header">Formulas — Tab or Enter to insert</div>
          {filteredFormulas.map((f, i) => (
            <div key={f.name} className={`formula-ac-item ${i === formulaIndex ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); insertFormula(f) }}>
              <div className="formula-ac-top">
                <span className="formula-ac-name">{f.name}</span>
                <span className="formula-ac-desc">{f.desc}</span>
              </div>
              <div className="formula-ac-example">{f.example}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
