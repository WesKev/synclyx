import React, { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
         highlightSpecialChars, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentOnInput, bracketMatching, foldGutter,
         syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
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
import { useThemeStore } from '../../store/themeStore'

const LANGUAGES: Record<string, any> = {
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

// VS Code-inspired indentation colour guides
const indentGuideTheme = EditorView.baseTheme({
  '.cm-line': { paddingLeft: '0 !important' },
  '.cm-indent-guide': {
    display: 'inline-block', width: '1px', height: '100%',
    borderLeft: '1px solid rgba(168, 51, 185, 0.25)', marginLeft: '-1px',
  },
  '.cm-indent-guide-1': { borderLeftColor: 'rgba(168, 51, 185, 0.35)' },
  '.cm-indent-guide-2': { borderLeftColor: 'rgba(124, 106, 255, 0.35)' },
  '.cm-indent-guide-3': { borderLeftColor: 'rgba(0, 184, 148, 0.35)' },
  '.cm-indent-guide-4': { borderLeftColor: 'rgba(253, 203, 110, 0.35)' },
})

const lightTheme = EditorView.theme({
  '&': { background: '#1e1e2e', color: '#cdd6f4', fontSize: '0.875rem', fontFamily: "'Fira Code', 'Cascadia Code', monospace" },
  '.cm-content': { caretColor: '#a833b9', padding: '0.75rem 0' },
  '.cm-cursor': { borderLeftColor: '#a833b9', borderLeftWidth: '2px' },
  '.cm-activeLine': { background: 'rgba(168, 51, 185, 0.08)' },
  '.cm-activeLineGutter': { background: 'rgba(168, 51, 185, 0.12)' },
  '.cm-gutters': { background: '#181825', borderRight: '1px solid #313244', color: '#585b70' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.75rem', minWidth: '2.5rem', textAlign: 'right' },
  '.cm-foldGutter': { width: '1rem' },
  '.cm-matchingBracket': { background: 'rgba(168, 51, 185, 0.25)', outline: '1px solid #a833b9' },
  '.cm-selectionBackground': { background: 'rgba(168, 51, 185, 0.2) !important' },
  '&.cm-focused .cm-selectionBackground': { background: 'rgba(168, 51, 185, 0.3) !important' },
  '.cm-tooltip': { background: '#1e1e2e', border: '1px solid #313244' },
  '.cm-tooltip-autocomplete': { background: '#181825' },
}, { dark: true })

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
  const { theme } = useThemeStore()

  const getLangExtension = (l: string) => {
    const fn = LANGUAGES[l]
    if (fn) { const ext = fn(); if (ext) return ext }
    return []
  }

  useEffect(() => {
    if (!editorRef.current || collapsed) return

    const startState = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langCompartment.current.of(getLangExtension(lang)),
        lightTheme,
        indentGuideTheme,
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
        EditorView.theme({ '&': { height: 'auto', minHeight: '8rem', maxHeight: '32rem' } }),
      ],
    })

    const view = new EditorView({ state: startState, parent: editorRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  }, [collapsed])

  const handleLangChange = (newLang: string) => {
    setLang(newLang)
    onChange(viewRef.current?.state.doc.toString() || code, newLang)
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: langCompartment.current.reconfigure(getLangExtension(newLang))
      })
    }
  }

  const handleCopy = () => {
    const content = viewRef.current?.state.doc.toString() || code
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="block block-code-cm">
      {/* Header */}
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

      {/* Editor */}
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
