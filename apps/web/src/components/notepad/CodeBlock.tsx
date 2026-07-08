import React, { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
         highlightSpecialChars, drawSelection, dropCursor,
         rectangularSelection, highlightActiveLine, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { EditorState, Compartment, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentOnInput, bracketMatching, foldGutter,
         syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { json } from '@codemirror/lang-json'
import { rust } from '@codemirror/lang-rust'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { php } from '@codemirror/lang-php'
import { markdown } from '@codemirror/lang-markdown'

// ── Indent Rainbow colours (cycling per depth) ─────────────────────────
const INDENT_COLORS = [
  'rgba(255, 100, 120, 0.25)',  // pink/red
  'rgba(255, 200, 50, 0.20)',   // yellow
  'rgba(80, 180, 255, 0.22)',   // blue
  'rgba(80, 220, 140, 0.22)',   // green
  'rgba(200, 100, 255, 0.22)',  // purple
  'rgba(255, 150, 50, 0.22)',   // orange
]

const indentRainbowPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.buildDecos(view) }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = this.buildDecos(update.view)
  }
  buildDecos(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const tabSize = 2
    for (const { from, to } of view.visibleRanges) {
      let pos = from
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos)
        const text = line.text
        let indent = 0
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ') indent++
          else if (text[i] === '\t') indent += tabSize
          else break
        }
        const depth = Math.floor(indent / tabSize)
        for (let d = 0; d < depth; d++) {
          const start = line.from + d * tabSize
          const end = Math.min(start + tabSize, line.from + indent)
          if (start < end && start >= line.from && end <= line.to + 1) {
            const color = INDENT_COLORS[d % INDENT_COLORS.length]
            builder.add(start, end, Decoration.mark({
              attributes: { style: `background: ${color}; border-radius: 1px;` }
            }))
          }
        }
        pos = line.to + 1
      }
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── VS Code Dark+ syntax highlight style ───────────────────────────────
const vscodeDarkStyle = HighlightStyle.define([
  { tag: tags.keyword,           color: '#569cd6', fontWeight: 'bold' },      // blue - var, if, for
  { tag: tags.controlKeyword,    color: '#c586c0', fontWeight: 'bold' },      // pink - return, break
  { tag: tags.operatorKeyword,   color: '#569cd6' },
  { tag: tags.definitionKeyword, color: '#569cd6' },
  { tag: tags.moduleKeyword,     color: '#c586c0' },
  { tag: tags.string,            color: '#ce9178' },                          // orange - strings
  { tag: tags.special(tags.string), color: '#ce9178' },
  { tag: tags.number,            color: '#b5cea8' },                          // light green - numbers
  { tag: tags.bool,              color: '#569cd6' },
  { tag: tags.null,              color: '#569cd6' },
  { tag: tags.comment,           color: '#6a9955', fontStyle: 'italic' },     // green - comments
  { tag: tags.lineComment,       color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.blockComment,      color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#dcdcaa' },                // yellow - functions
  { tag: tags.function(tags.definition(tags.variableName)), color: '#dcdcaa' },
  { tag: tags.definition(tags.variableName), color: '#9cdcfe' },              // light blue - variables
  { tag: tags.variableName,      color: '#9cdcfe' },
  { tag: tags.propertyName,      color: '#9cdcfe' },
  { tag: tags.typeName,          color: '#4ec9b0' },                          // teal - types/classes
  { tag: tags.className,         color: '#4ec9b0' },
  { tag: tags.tagName,           color: '#f44747' },                          // red - HTML tags
  { tag: tags.attributeName,     color: '#9cdcfe' },
  { tag: tags.attributeValue,    color: '#ce9178' },
  { tag: tags.operator,          color: '#d4d4d4' },
  { tag: tags.punctuation,       color: '#d4d4d4' },
  { tag: tags.bracket,           color: '#ffd700' },
  { tag: tags.angleBracket,      color: '#808080' },
  { tag: tags.meta,              color: '#9cdcfe' },
  { tag: tags.regexp,            color: '#d16969' },
])

// ── VS Code Dark+ editor theme ─────────────────────────────────────────
const vscodeDarkTheme = EditorView.theme({
  '&': {
    background: '#1e1e1e',
    color: '#d4d4d4',
    fontSize: '0.875rem',
    fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Courier New', monospace",
  },
  '.cm-content': {
    caretColor: '#aeafad',
    padding: '0.5rem 0',
    lineHeight: '1.6',
  },
  '.cm-cursor': { borderLeftColor: '#aeafad', borderLeftWidth: '2px' },
  '.cm-activeLine': { background: '#2a2d2e' },
  '.cm-activeLineGutter': { background: '#232626' },
  '.cm-gutters': {
    background: '#1e1e1e',
    borderRight: '1px solid #3c3c3c',
    color: '#858585',
    minWidth: '3rem',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 0.75rem 0 0.5rem',
    minWidth: '2.5rem',
    textAlign: 'right',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  },
  '.cm-foldGutter': { width: '1rem' },
  '.cm-foldGutter .cm-gutterElement': { color: '#858585' },
  '.cm-matchingBracket': {
    background: 'rgba(255, 215, 0, 0.15)',
    outline: '1px solid rgba(255, 215, 0, 0.5)',
    borderRadius: '2px',
  },
  '.cm-selectionBackground': { background: '#264f78 !important' },
  '&.cm-focused .cm-selectionBackground': { background: '#264f78 !important' },
  '.cm-tooltip': { background: '#252526', border: '1px solid #454545', color: '#d4d4d4' },
  '.cm-tooltip-autocomplete': { background: '#252526' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#094771' },
  '.cm-completionIcon': { color: '#75bfff' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
}, { dark: true })

const LANGUAGES: Record<string, () => any> = {
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  python: () => python(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  json: () => json(),
  rust: () => rust(),
  java: () => java(),
  cpp: () => cpp(),
  c: () => cpp(),
  php: () => php(),
  markdown: () => markdown(),
  bash: () => null,
  go: () => null,
  ruby: () => null,
  swift: () => null,
  kotlin: () => null,
}

const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
  python: 'Python', html: 'HTML', css: 'CSS', sql: 'SQL', json: 'JSON',
  rust: 'Rust', java: 'Java', cpp: 'C++', c: 'C', php: 'PHP',
  markdown: 'Markdown', bash: 'Bash', go: 'Go', ruby: 'Ruby',
  swift: 'Swift', kotlin: 'Kotlin',
}

interface Props {
  code: string
  language: string
  onChange: (code: string, lang: string) => void
  onRemove: () => void
}

export default function CodeBlock({ code, language, onChange, onRemove }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const [lang, setLang] = useState(language || 'javascript')
  const [collapsed, setCollapsed] = useState(false)
  const [lineCount, setLineCount] = useState(code.split('\n').length)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [copied, setCopied] = useState(false)

  const getLangExt = (l: string) => {
    const fn = LANGUAGES[l]
    if (fn) { const ext = fn(); if (ext) return [ext] }
    return []
  }

  useEffect(() => {
    if (!editorRef.current || collapsed) return

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(vscodeDarkStyle),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        highlightActiveLine(),
        indentRainbowPlugin,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langCompartment.current.of(getLangExt(lang)),
        vscodeDarkTheme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const newCode = update.state.doc.toString()
            setLineCount(update.state.doc.lines)
            onChange(newCode, lang)
          }
          if (update.selectionSet) {
            const pos = update.state.selection.main.head
            const line = update.state.doc.lineAt(pos)
            setCursorPos({ line: line.number, col: pos - line.from + 1 })
          }
        }),
        EditorView.theme({
          '&': { minHeight: '8rem', maxHeight: '32rem' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  }, [collapsed, lang])

  const handleLangChange = (newLang: string) => {
    setLang(newLang)
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: langCompartment.current.reconfigure(getLangExt(newLang))
      })
    }
    onChange(viewRef.current?.state.doc.toString() || code, newLang)
  }

  const handleCopy = () => {
    const content = viewRef.current?.state.doc.toString() || code
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="block block-code-cm">
      <div className="code-cm-header">
        <div className="code-cm-header-left">
          <span className="code-dot red" />
          <span className="code-dot yellow" />
          <span className="code-dot green" />
          <select className="code-lang-select" value={lang} onChange={e => handleLangChange(e.target.value)}>
            {Object.entries(LANG_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="code-cm-header-right">
          <button className="code-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
          <button className="code-collapse-btn" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▶ Expand' : '▼ Collapse'}
          </button>
          <button className="block-remove-inline" onClick={onRemove}>✕</button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div ref={editorRef} className="code-cm-editor" />
          <div className="code-cm-footer">
            <span>{LANG_LABELS[lang] || lang}</span>
            <span>{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
        </>
      )}
    </div>
  )
}
