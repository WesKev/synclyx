import React, { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  rows: number
  cols: number
  initialData?: string[][]
  initialMeta?: TableMeta
  onChange: (data: string[][], meta: TableMeta) => void
  onRemove: () => void
}

interface TableMeta {
  name: string
  frozenRow: number   // rows 0..frozenRow are frozen (-1 = none)
  frozenCol: number   // cols 0..frozenCol are frozen (-1 = none)
  rowColors: Record<number, string>
  colColors: Record<number, string>
}

const DEFAULT_META: TableMeta = { name: 'Table', frozenRow: -1, frozenCol: -1, rowColors: {}, colColors: {} }

const CELL_COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9a3c','#a8dadc','#f72585','#ffffff','transparent']

function colLabel(idx: number): string {
  let label = ''; idx++
  while (idx > 0) { label = String.fromCharCode(65+((idx-1)%26))+label; idx=Math.floor((idx-1)/26) }
  return label
}

function evalFormula(formula: string, data: string[][]): string {
  try {
    const expr = formula.slice(1).toUpperCase().trim()
    const parseCellRef = (ref: string) => {
      const m = ref.match(/^([A-Z]+)(\d+)$/)
      if (!m) return [0,0]
      return [parseInt(m[2])-1, m[1].split('').reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1]
    }
    const getCellVal = (ref: string): number => {
      const [r,c] = parseCellRef(ref)
      if (r<0||c<0||r>=data.length||c>=(data[0]?.length||0)) return 0
      const v = data[r][c]; if (!v||v.trim()==='') return 0
      if (v.startsWith('=')) return parseFloat(evalFormula(v,data))||0
      return parseFloat(v)||0
    }
    const getRangeVals = (range: string): number[] => {
      const [s,e] = range.split(':'); const [r1,c1]=parseCellRef(s); const [r2,c2]=parseCellRef(e)
      const vals: number[]=[]
      for(let r=Math.min(r1,r2);r<=Math.max(r1,r2);r++)
        for(let c=Math.min(c1,c2);c<=Math.max(c1,c2);c++){
          const v=data[r]?.[c]; if(!v||v.trim()===''){vals.push(0);continue}
          vals.push(v.startsWith('=')?parseFloat(evalFormula(v,data))||0:parseFloat(v)||0)
        }
      return vals
    }
    const getArgs = (arg: string) => arg.includes(':') ? getRangeVals(arg) : arg.split(',').map(r=>getCellVal(r.trim()))
    const sumM=expr.match(/^SUM\(([^)]+)\)$/); if(sumM) return String(getArgs(sumM[1]).reduce((a,b)=>a+b,0))
    const avgM=expr.match(/^(?:AVG|AVERAGE)\(([^)]+)\)$/); if(avgM){const v=getArgs(avgM[1]);return v.length?String(v.reduce((a,b)=>a+b,0)/v.length):'0'}
    const cntM=expr.match(/^COUNT\(([^)]+)\)$/); if(cntM) return String(getArgs(cntM[1]).filter(v=>!isNaN(v)&&v!==0).length)
    const maxM=expr.match(/^MAX\(([^)]+)\)$/); if(maxM){const v=getArgs(maxM[1]);return v.length?String(Math.max(...v)):'0'}
    const minM=expr.match(/^MIN\(([^)]+)\)$/); if(minM){const v=getArgs(minM[1]);return v.length?String(Math.min(...v)):'0'}
    const arith=expr.replace(/([A-Z]+\d+)/g,ref=>String(getCellVal(ref)))
    // eslint-disable-next-line no-new-func
    const result=new Function(`return (${arith})`)()
    return isNaN(result)?'#ERR':String(result)
  } catch { return '#ERR' }
}

// Measure text width roughly
function estimateWidth(text: string): number {
  return Math.max(80, Math.min(300, text.length * 8.5 + 24))
}

export default function TableBlock({ rows, cols, initialData, initialMeta, onChange, onRemove }: Props) {
  const [data, setData] = useState<string[][]>(
    initialData && initialData.length > 0
      ? initialData
      : Array.from({length:rows},()=>Array.from({length:cols},()=>''))
  )
  const [meta, setMeta] = useState<TableMeta>(initialMeta || DEFAULT_META)
  const [editingName, setEditingName] = useState(false)
  const [activeCell, setActiveCell] = useState<[number,number]|null>(null)
  const [hoverRow, setHoverRow] = useState<number|null>(null)
  const [hoverCol, setHoverCol] = useState<number|null>(null)
  const [showRowColor, setShowRowColor] = useState<number|null>(null)
  const [showColColor, setShowColColor] = useState<number|null>(null)
  const [showSort, setShowSort] = useState<number|null>(null)
  const [draggingRow, setDraggingRow] = useState<number|null>(null)
  const [draggingCol, setDraggingCol] = useState<number|null>(null)
  const [dragOverRow, setDragOverRow] = useState<number|null>(null)
  const [dragOverCol, setDragOverCol] = useState<number|null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement|null>>({})

  const emit = useCallback((newData: string[][], newMeta: TableMeta) => {
    onChange(newData, newMeta)
  }, [onChange])

  const updateData = (newData: string[][]) => { setData(newData); emit(newData, meta) }
  const updateMeta = (newMeta: TableMeta) => { setMeta(newMeta); emit(data, newMeta) }

  const updateCell = (r: number, c: number, val: string) => {
    const next = data.map(row=>[...row]); next[r][c]=val; updateData(next)
  }

  // Auto column widths based on content
  const colWidths = (data[0]||[]).map((_, ci) => {
    let max = colLabel(ci).length * 8 + 32
    data.forEach(row => { const w = estimateWidth(row[ci]||''); if(w>max) max=w })
    return Math.max(80, Math.min(300, max))
  })

  // Row ops
  const insertRowAbove = (idx: number) => {
    const n=[...data.slice(0,idx),Array(data[0]?.length||cols).fill(''),...data.slice(idx)]
    updateData(n)
  }
  const insertRowBelow = (idx: number) => {
    const n=[...data.slice(0,idx+1),Array(data[0]?.length||cols).fill(''),...data.slice(idx+1)]
    updateData(n)
  }
  const deleteRow = (idx: number) => { if(data.length<=1)return; updateData(data.filter((_,i)=>i!==idx)) }

  // Col ops
  const insertColRight = (idx: number) => updateData(data.map(r=>[...r.slice(0,idx+1),'',...r.slice(idx+1)]))
  const insertColLeft = (idx: number) => updateData(data.map(r=>[...r.slice(0,idx),'',...r.slice(idx)]))
  const deleteCol = (idx: number) => { if((data[0]?.length||0)<=1)return; updateData(data.map(r=>r.filter((_,i)=>i!==idx))) }

  // Sort col
  const sortCol = (ci: number, asc: boolean) => {
    const header = data[0]; const body = data.slice(1)
    const sorted = [...body].sort((a,b)=>{
      const va=a[ci]||''; const vb=b[ci]||''
      const na=parseFloat(va); const nb=parseFloat(vb)
      if(!isNaN(na)&&!isNaN(nb)) return asc?na-nb:nb-na
      return asc?va.localeCompare(vb):vb.localeCompare(va)
    })
    updateData([header,...sorted])
    setShowSort(null)
  }

  // Drag rows
  const handleRowDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingRow(idx); e.dataTransfer.effectAllowed='move'
  }
  const handleRowDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if(draggingRow===null||draggingRow===idx) return
    const next=[...data]
    const [removed]=next.splice(draggingRow,1); next.splice(idx,0,removed)
    updateData(next); setDraggingRow(null); setDragOverRow(null)
  }

  // Drag cols
  const handleColDragStart = (e: React.DragEvent, idx: number) => {
    setDraggingCol(idx); e.dataTransfer.effectAllowed='move'
  }
  const handleColDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if(draggingCol===null||draggingCol===idx) return
    const next=data.map(row=>{
      const r=[...row]; const [removed]=r.splice(draggingCol!,1); r.splice(idx,0,removed); return r
    })
    updateData(next); setDraggingCol(null); setDragOverCol(null)
  }

  const getDisplay = (r: number, c: number) => {
    const val=data[r]?.[c]
    if(!val||val.trim()==='') return ''
    if(val.startsWith('=')) return evalFormula(val,data)
    return val
  }

  const focusCell = (r: number, c: number) => {
    setActiveCell([r,c])
    setTimeout(()=>inputRefs.current[`${r}-${c}`]?.focus(),10)
  }

  const isFrozenRow = (ri: number) => meta.frozenRow>=0 && ri<=meta.frozenRow
  const isFrozenCol = (ci: number) => meta.frozenCol>=0 && ci<=meta.frozenCol

  return (
    <div className="block block-table-pro">
      {/* Title bar */}
      <div className="table-pro-toolbar">
        <div className="table-title-wrap">
          {editingName ? (
            <input className="table-name-input" value={meta.name} autoFocus
              onChange={e=>updateMeta({...meta,name:e.target.value})}
              onBlur={()=>setEditingName(false)}
              onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape')setEditingName(false)}}
            />
          ) : (
            <span className="table-name" onClick={()=>setEditingName(true)} title="Click to rename">
              ⊞ {meta.name} <span className="table-name-edit">✎</span>
            </span>
          )}
          <span className="table-size-badge">{data.length} × {data[0]?.length||0}</span>
        </div>
        <div className="table-pro-actions">
          <span className="table-formula-hint">= SUM · AVG · MAX · MIN · COUNT</span>
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>

      <div className="table-pro-scroll">
        <table className="table-pro-el">
          <thead>
            <tr>
              <th className="table-corner-all" title="Select all" />
              {(data[0]||[]).map((_,ci)=>(
                <th key={ci}
                  className={`table-col-header ${isFrozenCol(ci)?'frozen-col':''} ${dragOverCol===ci?'drag-over':''}`}
                  style={{width:colWidths[ci], minWidth:colWidths[ci]}}
                  onMouseEnter={()=>setHoverCol(ci)}
                  onMouseLeave={()=>{setHoverCol(null);setShowColColor(null);setShowSort(null)}}
                  onDragOver={e=>{e.preventDefault();setDragOverCol(ci)}}
                  onDrop={e=>handleColDrop(e,ci)}>
                  <div className="table-col-header-inner">
                    <span className="col-label-text">{colLabel(ci)}</span>
                    {isFrozenCol(ci) && <span className="frozen-indicator" title="Frozen">🧊</span>}
                  </div>
                  {/* Col hover popup */}
                  {hoverCol===ci && (
                    <div className="col-hover-popup">
                      {/* Drag handle */}
                      <div className="popup-action drag-handle"
                        draggable
                        onDragStart={e=>handleColDragStart(e,ci)}
                        title="Drag to reorder">
                        ⠿
                      </div>
                      {/* Freeze */}
                      <button className={`popup-action ${isFrozenCol(ci)?'active':''}`}
                        onClick={()=>updateMeta({...meta,frozenCol:isFrozenCol(ci)?-1:ci})}
                        title={isFrozenCol(ci)?'Unfreeze column':'Freeze up to this column'}>
                        🧊
                      </button>
                      {/* Sort */}
                      <div className="popup-action sort-wrap">
                        <button onClick={()=>setShowSort(showSort===ci?null:ci)} title="Sort">⇅</button>
                        {showSort===ci && (
                          <div className="sort-dropdown">
                            <button onClick={()=>sortCol(ci,true)}>↑ A→Z</button>
                            <button onClick={()=>sortCol(ci,false)}>↓ Z→A</button>
                          </div>
                        )}
                      </div>
                      {/* Color */}
                      <div className="popup-action color-wrap">
                        <button onClick={()=>setShowColColor(showColColor===ci?null:ci)}
                          style={{background:meta.colColors[ci]||'transparent'}}
                          title="Column color">🎨</button>
                        {showColColor===ci && (
                          <div className="color-picker-popup">
                            {CELL_COLORS.map(c=>(
                              <button key={c} className="color-dot"
                                style={{background:c===''?'transparent':c, border:meta.colColors[ci]===c?'2px solid var(--accent)':'2px solid transparent'}}
                                onClick={()=>{
                                  const rc={...meta.colColors}
                                  if(c==='transparent'){delete rc[ci]}else{rc[ci]=c}
                                  updateMeta({...meta,colColors:rc});setShowColColor(null)
                                }}/>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Insert right */}
                      <button className="popup-action" onClick={()=>insertColRight(ci)} title="Insert column right">+→</button>
                      {/* Delete */}
                      <button className="popup-action delete-action" onClick={()=>deleteCol(ci)} title="Delete column">🗑</button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row,ri)=>(
              <tr key={ri}
                className={`${dragOverRow===ri?'drag-over-row':''}`}
                onMouseEnter={()=>setHoverRow(ri)}
                onMouseLeave={()=>{setHoverRow(null);setShowRowColor(null)}}
                onDragOver={e=>{e.preventDefault();setDragOverRow(ri)}}
                onDrop={e=>handleRowDrop(e,ri)}>
                {/* Row number + popup */}
                <td className={`table-row-num ${isFrozenRow(ri)?'frozen-row-num':''}`}>
                  <div className="table-row-num-inner">
                    <span>{ri+1}</span>
                    {isFrozenRow(ri) && <span className="frozen-indicator-small">🧊</span>}
                    {hoverRow===ri && (
                      <div className="row-hover-popup">
                        {/* Drag */}
                        <div className="popup-action drag-handle"
                          draggable
                          onDragStart={e=>handleRowDragStart(e,ri)}
                          title="Drag to reorder">⠿</div>
                        {/* Freeze */}
                        <button className={`popup-action ${isFrozenRow(ri)?'active':''}`}
                          onClick={()=>updateMeta({...meta,frozenRow:isFrozenRow(ri)?-1:ri})}
                          title={isFrozenRow(ri)?'Unfreeze':'Freeze up to this row'}>🧊</button>
                        {/* Insert above */}
                        <button className="popup-action" onClick={()=>insertRowAbove(ri)} title="Insert row above">↑+</button>
                        {/* Insert below */}
                        <button className="popup-action" onClick={()=>insertRowBelow(ri)} title="Insert row below">+↓</button>
                        {/* Color */}
                        <div className="popup-action color-wrap">
                          <button onClick={()=>setShowRowColor(showRowColor===ri?null:ri)}
                            style={{background:meta.rowColors[ri]||'transparent'}}
                            title="Row color">🎨</button>
                          {showRowColor===ri && (
                            <div className="color-picker-popup color-picker-right">
                              {CELL_COLORS.map(c=>(
                                <button key={c} className="color-dot"
                                  style={{background:c===''?'transparent':c, border:meta.rowColors[ri]===c?'2px solid var(--accent)':'2px solid transparent'}}
                                  onClick={()=>{
                                    const rc={...meta.rowColors}
                                    if(c==='transparent'){delete rc[ri]}else{rc[ri]=c}
                                    updateMeta({...meta,rowColors:rc});setShowRowColor(null)
                                  }}/>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Delete */}
                        <button className="popup-action delete-action" onClick={()=>deleteRow(ri)} title="Delete row">🗑</button>
                      </div>
                    )}
                  </div>
                </td>
                {row.map((cell,ci)=>{
                  const isActive=activeCell?.[0]===ri&&activeCell?.[1]===ci
                  const display=getDisplay(ri,ci)
                  const isFormula=cell?.startsWith('=')
                  const rowBg=meta.rowColors[ri]
                  const colBg=meta.colColors[ci]
                  const cellBg=rowBg||colBg||undefined
                  return (
                    <td key={ci}
                      className={`table-pro-cell ${ri===0?'table-header-row':''} ${isActive?'table-cell-selected':''} ${isFormula&&!isActive?'table-cell-formula':''} ${isFrozenRow(ri)?'frozen-row-cell':''} ${isFrozenCol(ci)?'frozen-col-cell':''}`}
                      style={{width:colWidths[ci],minWidth:colWidths[ci],background:cellBg}}
                      onClick={()=>focusCell(ri,ci)}>
                      <input
                        ref={el=>{inputRefs.current[`${ri}-${ci}`]=el}}
                        className="table-cell-input-pro"
                        value={isActive?cell:display}
                        readOnly={!isActive}
                        onChange={e=>updateCell(ri,ci,e.target.value)}
                        onFocus={()=>setActiveCell([ri,ci])}
                        onBlur={()=>setActiveCell(null)}
                        onKeyDown={e=>{
                          if(e.key==='Enter'){e.preventDefault();focusCell(Math.min(ri+1,data.length-1),ci)}
                          if(e.key==='Tab'){e.preventDefault();focusCell(ri,Math.min(ci+1,row.length-1))}
                          if(e.key==='Escape')setActiveCell(null)
                        }}
                        placeholder={ri===0?`Col ${ci+1}`:''}
                        style={{color:isFormula&&!isActive?'#74b9ff':undefined}}
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
            value={data[activeCell[0]]?.[activeCell[1]]||''}
            onChange={e=>updateCell(activeCell[0],activeCell[1],e.target.value)}
            placeholder="Value or =SUM(A1:A3)"
          />
          {data[activeCell[0]]?.[activeCell[1]]?.startsWith('=') && (
            <span className="formula-result-preview">= {getDisplay(activeCell[0],activeCell[1])}</span>
          )}
        </div>
      )}
    </div>
  )
}
