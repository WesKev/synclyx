# synclyx-upload-signer

A tiny Cloudflare Worker (free tier). It checks that the caller holds a valid **Synclyx (Firebase) login**,
then returns a **signed** Cloudinary upload request. The Cloudinary **API secret lives only here**.

## One-time setup (run inside this folder)
```
npm install
npx wrangler login
npx wrangler secret put CLOUDINARY_API_SECRET     # paste the secret when asked (it won't echo)
```
Edit `wrangler.toml`: set `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_API_KEY`
(Cloudinary Console -> Settings -> API Keys). Then:
```
npx wrangler deploy
```
It prints your URL (`https://synclyx-upload-signer.<you>.workers.dev`).
Put `https://<that-url>/sign` in `apps/web/.env.local` as `VITE_UPLOAD_SIGN_URL`.

## Safety notes
- NEVER commit `.dev.vars` or paste the API secret anywhere except `wrangler secret put`.
- `npm test` runs 21 tests (token checks, signature maths, CORS, rate limit).
- Allowed upload formats are one line in `src/index.js` (`ALLOWED_FORMATS`).
- The rate limit is best-effort (per Worker instance). Stronger limits / App Check come later.
