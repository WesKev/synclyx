# Synclyx Desktop — Clipboard Watcher

An Electron system-tray app that watches your Windows clipboard and pushes
new copies straight into SyncBoard — no manual "clip it" needed.

## How it works

- Runs quietly in the system tray (not a normal window you keep open)
- Checks the clipboard once a second for changes
- When something new is copied, it's pushed to the same Firestore collection
  the web app's SyncBoard reads from (`users/{uid}/syncboard`), tagged with
  `source: "electron"` and this PC's hostname as the device name
- Signing in uses the same email/password account as the web app

## First-time setup

```bash
cd apps/desktop
npm install
npm start
```

A small window opens — sign in with your Synclyx account (email + password;
Google sign-in isn't supported here since Electron can't do the OAuth popup
flow Google requires — email/password only for this app).

Once signed in, the window can be closed — the app keeps running in the
system tray. Click the tray icon to reopen it, or right-click it for:

- **Show Window** — reopen the status window
- **Pause Watching / Resume Watching** — temporarily stop capturing clips
  without signing out
- **Quit Synclyx Desktop** — fully exit (closing the window does NOT quit it)

## Building an installer

```bash
npm run build
```

Produces a Windows installer (NSIS) in `apps/desktop/dist/`. Mac (DMG) and
Linux (AppImage) targets are configured too, for whenever you build on those
platforms.

## What it does NOT do yet

- No auto-launch on system startup (you'll need to open it manually each
  session for now — auto-launch via the `auto-launch` npm package is a
  natural next step)
- No tier/plan limit enforcement (pushes every clip regardless of the
  100-clip free-tier cap the web app shows)
- Text only — no image/file clipboard capture (the web app's SyncBoard is
  text/link/code focused right now; image capture would need its own design
  pass, same as it would on the web side)

## Security note

The Firebase config in `src/firebaseConfig.js` uses the same public client
keys as the web app (`apps/web/.env.local`) — these identify the project,
they're not secrets. Actual security comes from Firestore's Security Rules,
which only let a signed-in user read/write their own `users/{uid}/**` data —
this app inherits that automatically since it signs in as the real user.
