import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose'
import { signParams, verifyFirebaseToken, createHandler, ALLOWED_FORMATS } from '../src/index.js'

const PROJECT = 'synclyx-app'
const ENV = {
  CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'topsecret',
  FIREBASE_PROJECT_ID: PROJECT, ALLOWED_ORIGINS: 'https://synclyx-app.web.app,https://synclyx-app.firebaseapp.com',
}

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const getKeys = createLocalJWKSet({ keys: [jwk] })
const other = await generateKeyPair('RS256') // an attacker's own key

async function mint({ sub = 'user_ABC123', iss = `https://securetoken.google.com/${PROJECT}`, aud = PROJECT, exp = '1h', key = privateKey, kid = 'k1' } = {}) {
  let jwt = new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid }).setIssuedAt().setIssuer(iss).setAudience(aud).setExpirationTime(exp)
  if (sub !== null) jwt = jwt.setSubject(sub)
  return jwt.sign(key)
}
const req = (method, token, headers = {}) =>
  new Request('https://signer.example.workers.dev/sign', { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } })

test('signature algorithm matches Cloudinary\'s documented SHA-1 example', async () => {
  const sig = await signParams(
    { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd', 'SHA-1')
  assert.equal(sig, 'bfd09f95f331f558cbd1320e67aa8d488770583e')
})
test('params are sorted before signing (order of keys must not matter)', async () => {
  const a = await signParams({ timestamp: 1, folder: 'f', allowed_formats: 'jpg' }, 's')
  const b = await signParams({ allowed_formats: 'jpg', folder: 'f', timestamp: 1 }, 's')
  assert.equal(a, b); assert.equal(a.length, 64)
})
test('changing ANY signed value changes the signature (tamper-proof)', async () => {
  const base = { allowed_formats: ALLOWED_FORMATS, folder: 'synclyx/u1', timestamp: 100 }
  const s0 = await signParams(base, 'sec')
  assert.notEqual(s0, await signParams({ ...base, allowed_formats: ALLOWED_FORMATS + ',svg' }, 'sec'))
  assert.notEqual(s0, await signParams({ ...base, folder: 'synclyx/u2' }, 'sec'))
  assert.notEqual(s0, await signParams(base, 'other-secret'))
})

test('verify: valid token accepted', async () => assert.equal((await verifyFirebaseToken(await mint(), PROJECT, getKeys)).sub, 'user_ABC123'))
test('verify: wrong audience rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ aud: 'someone-elses-project' }), PROJECT, getKeys)))
test('verify: wrong issuer rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ iss: 'https://evil.example' }), PROJECT, getKeys)))
test('verify: expired token rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ exp: Math.floor(Date.now() / 1000) - 60 }), PROJECT, getKeys)))
test('verify: token signed with attacker\'s key rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ key: other.privateKey }), PROJECT, getKeys)))
test('verify: missing subject rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ sub: null }), PROJECT, getKeys)))
test('verify: path-like subject rejected', async () => assert.rejects(verifyFirebaseToken(await mint({ sub: '../../admin' }), PROJECT, getKeys)))
test('verify: alg=none / HS256 tricks rejected', async () => {
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'x', exp: 9999999999 })).toString('base64url') + '.'
  await assert.rejects(verifyFirebaseToken(none, PROJECT, getKeys))
  const hs = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT).setSubject('x').setExpirationTime('1h').sign(new TextEncoder().encode('secret'))
  await assert.rejects(verifyFirebaseToken(hs, PROJECT, getKeys))
})

test('handler: no token -> 401', async () => assert.equal((await createHandler({ getKeys })(req('POST'), ENV)).status, 401))
test('handler: garbage token -> 401 with generic body', async () => {
  const r = await createHandler({ getKeys })(req('POST', 'not.a.jwt'), ENV)
  assert.equal(r.status, 401); assert.deepEqual(await r.json(), { error: 'unauthorized' })
})
test('handler: GET -> 405', async () => assert.equal((await createHandler({ getKeys })(req('GET', await mint()), ENV)).status, 405))
test('handler: unknown path -> 404', async () => {
  const r = await createHandler({ getKeys })(new Request('https://x.workers.dev/other', { method: 'POST' }), ENV)
  assert.equal(r.status, 404)
})
test('handler: valid login -> signed params, own folder, correct signature', async () => {
  const now = () => 1_700_000_000_000
  const r = await createHandler({ getKeys, now })(req('POST', await mint(), { Origin: 'https://synclyx-app.web.app' }), ENV)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://synclyx-app.web.app')
  assert.equal(r.headers.get('Cache-Control'), 'no-store')
  const b = await r.json()
  assert.equal(b.folder, 'synclyx/user_ABC123'); assert.equal(b.timestamp, 1_700_000_000); assert.equal(b.cloudName, 'democloud')
  assert.equal(b.signature, await signParams({ allowed_formats: ALLOWED_FORMATS, folder: 'synclyx/user_ABC123', timestamp: 1_700_000_000 }, 'topsecret'))
  assert.ok(!JSON.stringify(b).includes('topsecret'), 'API secret must never appear in the response')
})
test('handler: allowed list has no script-capable formats', () => {
  for (const bad of ['svg', 'html', 'js', 'exe', 'zip', 'php']) assert.ok(!ALLOWED_FORMATS.split(',').includes(bad), bad)
})
test('handler: foreign website origin is refused (browser)', async () => {
  const r = await createHandler({ getKeys })(req('POST', await mint(), { Origin: 'https://evil.example' }), ENV)
  assert.equal(r.status, 403); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null)
})
test('handler: CORS preflight from our site OK, from a stranger refused', async () => {
  const h = createHandler({ getKeys })
  const ok = await h(req('OPTIONS', null, { Origin: 'https://synclyx-app.web.app' }), ENV)
  assert.equal(ok.status, 204); assert.match(ok.headers.get('Access-Control-Allow-Headers'), /Authorization/)
  assert.equal((await h(req('OPTIONS', null, { Origin: 'https://evil.example' }), ENV)).status, 403)
})
test('handler: rate limit kicks in after 20 signatures in a minute, per user', async () => {
  const h = createHandler({ getKeys, now: () => 1_700_000_000_000 }); const t = await mint(); const t2 = await mint({ sub: 'someone_else' })
  for (let i = 0; i < 20; i++) assert.equal((await h(req('POST', t), ENV)).status, 200)
  assert.equal((await h(req('POST', t), ENV)).status, 429)
  assert.equal((await h(req('POST', t2), ENV)).status, 200) // other users unaffected
})
test('handler: missing secret -> 500, never signs with undefined', async () => {
  const { CLOUDINARY_API_SECRET, ...noSecret } = ENV
  assert.equal((await createHandler({ getKeys })(req('POST', await mint()), noSecret)).status, 500)
})
