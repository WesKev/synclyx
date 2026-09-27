import BackgroundService from 'react-native-background-actions'
import * as Clipboard from 'expo-clipboard'
import { pushClip } from './syncBoardService'

/**
 * Android will not let any app read the clipboard silently in the
 * background — that's an OS privacy rule, not something we can code around.
 * The one exception is a genuine foreground service, which Android allows
 * ONLY if it shows a persistent notification the entire time it runs. That
 * notification can't be hidden or minimized away — it's Android's price for
 * continuous background access, same reason a music player always shows a
 * "Now Playing" notification while it's active.
 *
 * This is the Pro-tier watcher: true continuous capture, same experience as
 * the desktop app, at the cost of that one always-visible notification.
 */

let lastSeenClipboard = null
let lastPushedContent = null

const watcherTask = async (taskData) => {
  const { uid, deviceName } = taskData
  lastSeenClipboard = await Clipboard.getStringAsync().catch(() => '')

  await new Promise(async (resolve) => {
    for (let i = 0; BackgroundService.isRunning(); i++) {
      try {
        const text = await Clipboard.getStringAsync()
        if (text && text.trim() && text !== lastSeenClipboard) {
          lastSeenClipboard = text
          if (text !== lastPushedContent) {
            const pushed = await pushClip(uid, text, deviceName)
            if (pushed) lastPushedContent = text
          }
        }
      } catch (err) {
        console.error('[Synclyx Mobile] Watcher poll failed:', err)
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    resolve()
  })
}

const options = {
  taskName: 'SynclyxWatcher',
  taskTitle: 'Synclyx is watching your clipboard',
  taskDesc: 'New copies are being saved to SyncBoard',
  taskIcon: { name: 'notification-icon', type: 'drawable' },
  color: '#a833b9',
  linkingURI: 'synclyx://',
  parameters: {},
}

export async function startForegroundWatcher(uid, deviceName) {
  await BackgroundService.start(watcherTask, {
    ...options,
    parameters: { uid, deviceName },
  })
}

export async function stopForegroundWatcher() {
  await BackgroundService.stop()
}

export function isForegroundWatcherRunning() {
  return BackgroundService.isRunning()
}
