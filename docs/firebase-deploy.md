# Deploying Firestore Security Rules

Rules now live in `firestore.rules` at the repo root, checked into git
instead of only existing pasted into the Firebase Console. This means they
can be reviewed, versioned, and deployed like real code.

## One-time setup

```bash
npm install -g firebase-tools
firebase login
```

From the repo root (`synclyx/`, where `firebase.json` and `.firebaserc`
now live):

```bash
firebase use synclyx-app
```

## Deploying a rules change

Any time `firestore.rules` changes:

```bash
firebase deploy --only firestore:rules
```

This replaces whatever is currently live in the Firebase Console with
exactly what's in the file — the Console will now just reflect what's in
git, rather than being the source of truth itself.

## What these rules actually protect

- **Ownership** — a signed-in user can only read/write their own
  `users/{uid}/**` data. Nobody can touch another user's notes, canvases,
  or clips, even if they somehow guessed a UID.
- **Shape validation** — every write is checked for required fields,
  correct types, and size caps (e.g. a clip's content can't exceed 60,000
  characters, a note title can't exceed 500) before Firestore accepts it.
  This blocks malformed or oversized writes from a buggy client or a
  tampered request, not just malicious ones.

## What they don't protect — and the honest fix for that

Security Rules have no memory of a user's *previous* writes — each rule
only ever sees the one write happening right now. That means true rate
limiting ("block this user after 50 writes in a minute") genuinely can't be
expressed in rules alone, no matter how they're written.

The real tool for that is **Firebase App Check** — it verifies that
requests are coming from your actual app (web, desktop, or mobile) rather
than a script hitting the API directly, and can throttle abusive traffic at
the infrastructure level before it reaches Firestore at all. It's a
separate, free feature to enable per-platform (reCAPTCHA v3 for the web
app, Play Integrity for Android, a device-check equivalent for desktop).

Worth adding before Synclyx has real paying users — not required to ship
this update, since the ownership + validation rules above already close the
actual gap that existed (anyone with a document ID and no rules at all
could previously write anything).
