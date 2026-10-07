/**
 * safeUrl.ts — the ONE place that decides whether a user-supplied URL may be
 * put into an href / src attribute or an exported HTML document.
 *
 * Why this exists: React 18 does not block `javascript:` URLs. A shared note
 * containing a link block whose URL is `javascript:...` would run script on the
 * Synclyx origin when a viewer clicks it — and a signed-in viewer's session
 * lives on that origin. Allow-list the scheme; never try to block-list.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i

/** Returns a safe absolute URL for use in href, or undefined if not allowed. */
export function safeHref(raw?: string | null): string | undefined {
  if (!raw) return undefined
  let s = raw.trim()
  if (!s) return undefined
  // "example.com/page" typed without a scheme → assume https
  if (!SCHEME.test(s) && BARE_DOMAIN.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href
  } catch { /* not a valid absolute URL */ }
  return undefined
}

/** Returns a safe URL for use in src (img / video / audio), or undefined. */
export function safeSrc(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'blob:') return u.href
  } catch { /* not a valid absolute URL */ }
  return undefined
}

/** Escapes text for safe insertion into HTML text AND quoted attribute values. */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
