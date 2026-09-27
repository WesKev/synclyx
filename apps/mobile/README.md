# Synclyx Mobile — Android Clipboard Watcher

Two ways to get things into SyncBoard from your phone, matching the plan
you're on:

## 1. Share to Synclyx (all plans, free)

Highlight text anywhere on your phone → tap **Share** → tap **Synclyx**.
Saved to SyncBoard instantly. Works in literally any app — browser,
WhatsApp, Gmail, wherever. No setup, no permissions, no notification.

## 2. Automatic background watching (Basic & Pro plans)

A true always-on watcher, same experience as the desktop app — copy
anything, it's captured automatically, no Share needed. Android requires a
permanent notification the entire time this runs ("Synclyx is watching your
clipboard") — that's an Android rule for any app with continuous background
access, not something we can turn off or hide.

**Important**: no payment system exists yet (that's Phase 4), so
`getUserPlan()` currently reads `users/{uid}/meta/settings.plan`, which
nothing writes to yet — everyone resolves to `'free'` today. The toggle is
correctly wired and will start working the moment Phase 4 starts writing a
real `plan` value to that same document. Nothing here needs to change when
that happens.

## Why this app can't run in Expo Go

This app uses two native modules — `expo-share-intent` (registers Synclyx as
an Android Share target) and `react-native-background-actions` (runs the
Pro foreground service) — that require actual native Android code. Expo Go
only supports Expo's own built-in modules, so this needs either:

```bash
cd apps/mobile
npm install
npx expo prebuild --platform android   # generates the android/ native project
npx expo run:android                   # builds + installs on a connected device/emulator
```

or, for a shareable APK without a local Android Studio setup, use
[EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas build --platform android --profile preview
```

`expo start` alone will run the JS bundle fine for quick UI iteration, but
Share-to-Synclyx and the foreground watcher only work in a real prebuilt
build — Expo Go can't show them.

## First-time setup

Sign in with the same email/password account you use on the Synclyx web
app — Google sign-in isn't available here for the same reason it isn't on
desktop: the OAuth popup flow Google requires doesn't work cleanly outside
a real browser.

## What to test on a real device

Background service and clipboard behavior genuinely vary by Android
version and manufacturer (Samsung, Xiaomi, and others apply their own
aggressive battery-optimization rules on top of stock Android that can kill
background services more eagerly than Pixel/stock Android does). Test on
your actual target devices, not just an emulator, before shipping this
to anyone else — this is normal for any Android app with a background
service, not specific to how this one is built.

## What it does NOT do yet

- No image/file clipboard capture — text only, matching SyncBoard's current
  scope on web and desktop
- No Google Sign-In (see above)
- Foreground watcher's exact Android 14+ foreground-service-type
  requirements should be double-checked against whatever OS version you're
  actually testing on — these have shifted across recent Android releases
