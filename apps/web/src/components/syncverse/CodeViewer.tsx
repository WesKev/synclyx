import React, { useEffect, useRef } from 'react'
import { EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
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

/**
 * CodeViewer — the read-only twin of SyncPad's CodeBlock.
 *
 * On SyncVerse you VIEW code, you don't edit it (editing happens in the
 * canvas's companion note in SyncPad). So this deliberately drops the
 * editing extensions — history, keymaps, autocomplete, bracket closing,
 * indent-rainbow — and keeps only what makes code readable: syntax
 * highlighting, line numbers, and the VS Code Dark+ palette.
 *
 * Lighter than the full editor, and it can't fight React Flow for
 * keyboard events because it never accepts them.
 */

const LANG_MAP: Record<string, () => any> = {
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

// VS Code Dark+ palette — matches SyncPad's editor so code looks identical
// in both places.
const vscodeDarkStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C586C0' },
  { tag: tags.controlKeyword, color: '#C586C0' },
  { tag: tags.moduleKeyword, color: '#C586C0' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#9CDCFE' },
  { tag: [tags.propertyName], color: '#9CDCFE' },
  { tag: [tags.variableName], color: '#9CDCFE' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#DCDCAA' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#4FC1FF' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#9CDCFE' },
  { tag: [tags.className], color: '#4EC9B0' },
  { tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#B5CEA8' },
  { tag: [tags.typeName], color: '#4EC9B0' },
  { tag: [tags.operator, tags.operatorKeyword], color: '#D4D4D4' },
  { tag: [tags.url, tags.escape, tags.regexp, tags.link], color: '#D16969' },
  { tag: [tags.meta, tags.comment], color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.heading, fontWeight: 'bold', color: '#569CD6' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#569CD6' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#CE9178' },
  { tag: tags.invalid, color: '#F44747' },
  { tag: tags.tagName, color: '#569CD6' },
  { tag: tags.attributeName, color: '#9CDCFE' },
])

const viewerTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1E1E1E',
    color: '#D4D4D4',
    fontSize: '0.75rem',
    height: '100%',
    borderRadius: '0.375rem',
  },
  '.cm-content': {
    fontFamily: "'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    padding: '0.4rem 0',
    caretColor: 'transparent',
  },
  '.cm-gutters': {
    backgroundColor: '#1E1E1E',
    color: '#858585',
    border: 'none',
    fontSize: '0.7rem',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.4rem 0 0.6rem' },
  '.cm-scroller': { overflow: 'auto', lineHeight: '1.5' },
  // No visible cursor or selection highlight — this is a viewer
  '.cm-cursor': { display: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
}, { dark: true })

interface Props {
  code: string
  language: string
  /** Called when the user clicks "Edit in SyncPad" */
  onEditInSyncPad?: () => void
}

export default function CodeViewer({ code, language, onEditInSyncPad }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())

  useEffect(() => {
    if (!hostRef.current) return

    const langFn = LANG_MAP[language]
    const langExt = langFn ? langFn() : null

    const state = EditorState.create({
      doc: code || '',
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        syntaxHighlighting(vscodeDarkStyle),
        viewerTheme,
        langCompartment.current.of(langExt ? [langExt] : []),
        // The two lines that make this a viewer rather than an editor
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the displayed code in sync when it changes elsewhere (e.g. edited
  // in the companion note) — replace the whole doc, since nothing is typed here.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === (code || '')) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: code || '' } })
  }, [code])

  // Swap the language mode without rebuilding the whole editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const langFn = LANG_MAP[language]
    const langExt = langFn ? langFn() : null
    view.dispatch({
      effects: langCompartment.current.reconfigure(langExt ? [langExt] : []),
    })
  }, [language])

  return (
    <div className="sv-code-viewer nodrag nopan">
      <div className="sv-code-viewer-bar">
        <span className="sv-code-viewer-lang">{LANG_LABELS[language] || language}</span>
        <span className="sv-code-viewer-badge">Read-only</span>
        {onEditInSyncPad && (
          <button className="nodrag nopan sv-code-viewer-edit" onClick={onEditInSyncPad}>
            ✎ Edit in SyncPad
          </button>
        )}
      </div>
      <div ref={hostRef} className="sv-code-viewer-host nodrag nopan" />
    </div>
  )
}
