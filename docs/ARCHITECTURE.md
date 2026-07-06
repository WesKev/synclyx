# ClipNote Architecture

## Sync Flow

```
PC (Electron app)
  └── polls system clipboard every ~500ms
  └── detects change → pushes to Firebase
        └── PWA listens → updates feed instantly
        └── Android app listens → updates feed instantly

Android (React Native)
  └── watches clipboard on focus/foreground
  └── detects change → pushes to Firebase
        └── same flow ↑

Browser Extension
  └── user selects text/link on any webpage
  └── right-click → "Send to ClipNote"
  └── pushes directly to Firebase
```

## Firebase Structure

```
/users/{uid}/
  profile/
  notes/{noteId}/
  notebooks/{notebookId}/
  templates/{templateId}/
  clipboard/{clipId}/
```

## Tier Limits

| Feature           | Free          | Pro         |
|-------------------|---------------|-------------|
| Clipboard history | Last 100 items| Unlimited   |
| Image uploads     | ≤ 5MB         | ≤ 100MB     |
| File uploads      | ✗             | ≤ 100MB     |
| Devices           | 2             | Unlimited   |
| Templates         | 3             | Unlimited   |
| Price             | $0            | ~$4–6/mo    |
