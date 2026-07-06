export function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/(?<![_])__([^_]+)__(?![_])/g, '<u>$1</u>')
  html = html.replace(/(?<![_])_([^_]+)_(?![_])/g, '<em>$1</em>')
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>')
  // [[Note links]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="md-note-link">📝 $1</span>')
  html = html.replace(/\n/g, '<br>')
  return html
}

export function hasMarkdown(text: string): boolean {
  return /\*\*|__|\*[^*]|_[^_]|~~|`|\[.*\]\(.*\)/.test(text)
}
