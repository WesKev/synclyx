/**
 * lockCrypto.ts — password hashing for SyncPad / SyncVerse locks.
 *
 * Before: the "hash" was btoa(password + id + 'synclyx_salt'). btoa is BASE64
 * ENCODING, not hashing — atob() turns it straight back into the password.
 * Anyone who could read the browser's localStorage could read every lock
 * password (and people reuse passwords).
 *
 * Now: PBKDF2-HMAC-SHA256 with a random per-lock salt and 600,000 iterations
 * (the figure OWASP's Password Storage Cheat Sheet gives for PBKDF2-SHA256).
 * The iteration count is stored inside the string, so it can be raised later
 * without breaking existing locks.
 *
 * IMPORTANT — what a lock IS: it hides an item on THIS device. It does not
 * encrypt the note, and it is not synced. It stops casual snooping, nothing more.
 */

const PREFIX = 'pbkdf2-sha256'
const ITERATIONS = 600_000
const enc = new TextEncoder()

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** Compares two byte arrays without bailing out at the first difference. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function hashLockPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

/** True for locks created before this change (plain base64). */
export function isLegacyLock(stored: string): boolean {
  return !stored.startsWith(PREFIX + '$')
}

export async function verifyLockPassword(stored: string, password: string, itemId: string): Promise<boolean> {
  try {
    if (isLegacyLock(stored)) {
      return timingSafeEqual(enc.encode(stored), enc.encode(btoa(password + itemId + 'synclyx_salt')))
    }
    const [, iterStr, saltB64, hashB64] = stored.split('$')
    const iterations = parseInt(iterStr, 10)
    if (!iterations || !saltB64 || !hashB64) return false
    const expected = fromB64(hashB64)
    const actual = await derive(password, fromB64(saltB64), iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
