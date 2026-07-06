import React, { useState } from 'react'

interface Props {
  onConfirm: (rows: number, cols: number) => void
  onClose: () => void
}

export default function TablePopup({ onConfirm, onClose }: Props) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span>Insert Table</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-body">
          <div className="popup-grid-preview">
            {Array.from({ length: Math.min(rows, 5) }).map((_, r) => (
              <div key={r} className="popup-grid-row">
                {Array.from({ length: Math.min(cols, 6) }).map((_, c) => (
                  <div key={c} className="popup-grid-cell" />
                ))}
              </div>
            ))}
          </div>
          <div className="popup-fields">
            <label>
              Rows
              <div className="popup-counter">
                <button onClick={() => setRows(r => Math.max(1, r - 1))}>−</button>
                <span>{rows}</span>
                <button onClick={() => setRows(r => Math.min(20, r + 1))}>+</button>
              </div>
            </label>
            <label>
              Columns
              <div className="popup-counter">
                <button onClick={() => setCols(c => Math.max(1, c - 1))}>−</button>
                <span>{cols}</span>
                <button onClick={() => setCols(c => Math.min(10, c + 1))}>+</button>
              </div>
            </label>
          </div>
        </div>
        <div className="popup-footer">
          <button className="popup-cancel" onClick={onClose}>Cancel</button>
          <button className="popup-confirm" onClick={() => onConfirm(rows, cols)}>Insert Table</button>
        </div>
      </div>
    </div>
  )
}
