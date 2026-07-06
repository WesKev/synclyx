# Synclyx 📋

> A powerful clipboard manager that doubles as a rich notepad — with real-time cross-device sync.

## What is Synclyx?

Synclyx is two tools in one:

- **Clipboard Feed** — captures everything you copy (text, images, files) across your PC and Android, synced live via Firebase.
- **Rich Notepad** — block-based notes with `@` commands (code, image, link, video, audio, file), `[[note linking]]`, tags, pins, notebooks, and templates.

## Apps in this repo

| App | Description |
|-----|-------------|
| `apps/web` | React PWA — main app (notepad + clipboard feed) |
| `apps/desktop` | Electron — Windows/Mac clipboard watcher |
| `apps/mobile` | React Native — Android clipboard watcher |
| `apps/extension` | Chrome/Firefox Manifest V3 browser extension |
| `packages/shared` | Firebase config, types, utilities |

## Tech Stack

- **Frontend:** React + Tailwind CSS + Vite
- **Sync:** Firebase (Auth, Realtime DB, Storage)
- **Desktop:** Electron.js
- **Mobile:** React Native (Expo)
- **Extension:** Manifest V3
- **Code blocks:** CodeMirror 6
- **State:** Zustand

## Roadmap

- [x] Monorepo scaffold
- [ ] PWA notepad — note creation, tabs, pins
- [ ] `@` command block system
- [ ] Markdown rendering
- [ ] `[[note linking]]`, tags, notebooks
- [ ] Templates + focus mode + smart search
- [ ] Firebase sync
- [ ] Clipboard feed
- [ ] Electron desktop app
- [ ] React Native Android app
- [ ] Browser extension

## License

MIT
