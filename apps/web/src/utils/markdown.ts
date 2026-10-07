import { safeHref, escapeHtml } from './safeUrl'

/**
 * Renders the small markdown subset Synclyx supports into HTML.
 *
 * SECURITY: the output is injected with dangerouslySetInnerHTML, so it must
 * never contain anything the user typed that is still "live" HTML.
 *  1. Links are pulled out FIRST (from the raw text) and replaced with
 *     placeholders. Their URL is checked against an allow-list of schemes
 *     (http / https / mailto) — `javascript:` and friends render as plain text.
 *  2. Everything else is HTML-escaped, INCLUDING quotes, so nothing can break
 *     out of an attribute.
 *  3. Formatting rules run on the escaped text, and can no longer touch hrefs
 *     because those are not in the text yet.
 *  4. Placeholders are swapped back for hand-built, fully escaped <a> tags.
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''

  const links: string[] = []
  const withTokens = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    const html = href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="md-link">${escapeHtml(label)}</a>`
      : escapeHtml(label) // unsafe or invalid URL → show the label as plain text
    links.push(html)
    return `\u0000L${links.length - 1}\u0000`
  })

  let html = escapeHtml(withTokens)
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/(?<![_])__([^_]+)__(?![_])/g, '<u>$1</u>')
  html = html.replace(/(?<![_])_([^_]+)_(?![_])/g, '<em>$1</em>')
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  // [[Note links]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="md-note-link">📝 $1</span>')
  html = html.replace(/\n/g, '<br>')
  // Put the vetted links back
  html = html.replace(/\u0000L(\d+)\u0000/g, (_m, i: string) => links[Number(i)] ?? '')
  return html
}

export function hasMarkdown(text: string): boolean {
  return /\*\*|__|\*[^*]|_[^_]|~~|`|\[.*\]\(.*\)/.test(text)
}
