/**
 * setShareMeta.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Sets the browser tab title and Open Graph meta tags for a share page.
 *
 * IMPORTANT — read before assuming this "just works" everywhere: this runs
 * client-side, after React has rendered. That's correct for real browsers
 * (and crawlers that execute JS, which includes Google's and increasingly
 * LinkedIn's) — the actual page, once opened, will correctly show
 * "<Title> — shared via Synclyx" with the right description.
 *
 * It will NOT reliably affect the preview CARD WhatsApp, Facebook, or
 * Twitter/X generate when the raw link is pasted somewhere — those
 * crawlers fetch the raw HTML and read meta tags BEFORE any JavaScript
 * runs, so they'll only ever see the static defaults baked into
 * index.html, not this dynamic per-note update. Getting per-note preview
 * cards correct on those specific platforms needs a small serverless
 * function that pre-renders just the <head> for crawler user-agents — a
 * clean, contained follow-up, not something silently "already handled"
 * by this file.
 */

function upsertMeta(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export interface ShareMeta {
  title: string
  ownerName: string
  description?: string
}

export function setShareMeta({ title, ownerName, description }: ShareMeta) {
  const fullTitle = `${title} — shared via Synclyx`
  document.title = fullTitle

  upsertMeta('og:title', fullTitle)
  upsertMeta('og:site_name', 'Synclyx')
  upsertMeta('og:description', description || `Shared by ${ownerName} on Synclyx`)
  upsertMeta('og:type', 'article')
  upsertMeta('og:url', window.location.href)
}

/** Call when leaving a share page, so the tab title reverts for the main app. */
export function resetShareMeta() {
  document.title = 'Synclyx'
}
