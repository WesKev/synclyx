# Deploying Synclyx to Firebase Hosting (first time)

Up to now, Synclyx has only ever run as `npm run dev` on your own machine —
this is the first time it's going to a real, public URL. Worth pausing on:
after this, `synclyx-app.web.app` (or whatever domain you point at it) is a
real website anyone can open.

## One-time setup

```bash
npm install -g firebase-tools
firebase login
```

From the repo root (`synclyx/`, where `firebase.json` now lives):

```bash
firebase use synclyx-app
```

## Build the web app

```bash
cd apps/web
npm run build
```

This produces `apps/web/dist/` — a folder of static files. `firebase.json`'s
`hosting.public` already points at this exact path, so nothing else needs
configuring for that part.

## Deploy

From the repo root:

```bash
firebase deploy --only hosting
```

The CLI prints your live URL when it finishes — something like
`https://synclyx-app.web.app`. That's the real, permanent home for share
links from now on (`https://synclyx-app.web.app/share/x7k2m9...`).

## Deploying rules + indexes at the same time

Since this update also changed `firestore.rules` and added
`firestore.indexes.json`, deploy everything together:

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

The **index** is not optional — the public share page queries Firestore
using `collectionGroup('notes').where('shareId','==',...).where('isPublic','==',true)`,
and Firestore refuses to run a compound query like that without a matching
index existing first. If you skip deploying the index and test a share
link anyway, you'll see a Firestore error in the browser console with a
direct link to create the index manually — but deploying it via the CLI
now avoids hitting that at all.

## Re-deploying after future changes

Any time `apps/web` changes:

```bash
cd apps/web && npm run build && cd ../..
firebase deploy --only hosting
```

Any time `firestore.rules` or `firestore.indexes.json` changes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Testing a share link

1. Sign in, open a note, click the 🔗 Share button in the toolbar
2. Toggle "Anyone with the link can view" on
3. Copy the link, open it in an incognito window (or a browser you're not
   signed into Synclyx on) — you should see the note, read-only, with no
   sign-in prompt
4. Toggle it back off — reload that same link — it should now show
   "This link isn't available"
