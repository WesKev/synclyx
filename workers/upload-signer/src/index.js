/**
 * synclyx-upload-signer — Cloudflare Worker
 *
 * Job: let ONLY logged-in Synclyx users upload to Cloudinary, without ever
 * putting the Cloudinary API secret in the browser.
 *
 *   browser ──(Firebase ID token)──▶ this Worker ──▶ { signature, timestamp, folder, ... }
 *   browser ──(file + signature)──▶ Cloudinary  (Cloudinary re-computes the signature)
 *
 * The signature covers allowed_formats, folder and timestamp, so the browser
 * can't change them: a tampered request fails Cloudinary's signature check.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

// Everything the app's blocks can legitimately upload. SVG, HTML, JS, EXE and ZIP are
// deliberately NOT here (they can carry scripts or malware). Edit this one line to allow more.
export const ALLOWED_FORMATS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',          // images
  'mp4', 'webm', 'mov', 'm4v',                           // video
  'mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac',             // audio
  'pdf', 'txt', 'csv', 'md',                             // documents
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',           // office files
].join(',')

const MAX_SIGNS_PER_MINUTE = 20 // per user, per Worker instance (best-effort, see README)

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Cloudinary signature: sort the params A→Z, join as key=value&key=value,
 * append the API secret, hash, hex. (Cloudinary accepts SHA-1 or SHA-256.)
 */
export async function signParams(params, apiSecret, algorithm = 'SHA-256') {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(toSign + apiSecret))
  return toHex(digest)
}

/** Verifies a Firebase ID token. Throws on ANY problem. Returns the token's claims. */
export async function verifyFirebaseToken(token, projectId, getKeys) {
  const { payload } = await jwtVerify(token, getKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'], // never let the token choose its own algorithm
  })
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)) {
    throw new Error('bad subject')
  }
  return payload
}

export function createHandler({ getKeys, now = () => Date.now() }) {
  const hits = new Map() // `${uid}:${minute}` -> count

  return async function handle(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
    // No Origin header = not a browser (curl etc.). That's fine: the token is the real lock.
    const originOk = !origin || allowedOrigins.includes(origin)
    const cors = origin && originOk ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }

    const json = (status, body, extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors, ...extra },
      })

    if (url.pathname !== '/sign') return json(404, { error: 'not_found' })

    if (request.method === 'OPTIONS') {
      if (!originOk) return new Response(null, { status: 403 })
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' })
    if (!originOk) return json(403, { error: 'origin_not_allowed' })

    // 1) Who is asking? Must hold a valid Synclyx login.
    const match = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/)
    if (!match) return json(401, { error: 'unauthorized' })
    let claims
    try {
      claims = await verifyFirebaseToken(match[1], env.FIREBASE_PROJECT_ID, getKeys)
    } catch {
      return json(401, { error: 'unauthorized' }) // same answer for every failure: no hints for attackers
    }

    // 2) Slow down runaway loops (best-effort: counts live in this Worker instance's memory).
    const minute = Math.floor(now() / 60000)
    const key = `${claims.sub}:${minute}`
    const count = (hits.get(key) || 0) + 1
    hits.set(key, count)
    if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(`:${minute}`)) hits.delete(k)
    if (count > MAX_SIGNS_PER_MINUTE) return json(429, { error: 'too_many_requests' }, { 'Retry-After': '60' })

    if (!env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_CLOUD_NAME) {
      return json(500, { error: 'server_misconfigured' })
    }

    // 3) Sign. Each user gets their own folder, so uploads are traceable to an account.
    const timestamp = Math.floor(now() / 1000)
    const folder = `synclyx/${claims.sub}`
    const signature = await signParams(
      { allowed_formats: ALLOWED_FORMATS, folder, timestamp },
      env.CLOUDINARY_API_SECRET,
    )
    return json(200, {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      allowedFormats: ALLOWED_FORMATS,
      signature,
    })
  }
}

let remoteKeys
const handler = createHandler({
  getKeys: (header, token) => (remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)))(header, token),
})

export default { fetch: (request, env) => handler(request, env) }
