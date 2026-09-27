const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null
let isWatching = true // toggled from the tray menu; renderer polls this via IPC

ipcMain.handle('get-watching-state', () => isWatching)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 560,
    resizable: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'Synclyx — Clipboard Watcher',
    webPreferences: {
      // Simplicity for v1 — direct require() of firebase in the renderer.
      // Tightening this (contextIsolation + preload bridge) is a good
      // hardening pass before wider distribution; not a blocker for
      // getting the watcher itself working end-to-end.
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  // Minimize to tray instead of quitting — the whole point of this app is
  // to run quietly in the background.
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
    return false
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray_icon.png'))
  tray = new Tray(icon)
  tray.setToolTip('Synclyx — Clipboard Watcher')

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Synclyx Desktop', enabled: false },
      { type: 'separator' },
      { label: 'Show Window', click: () => mainWindow.show() },
      {
        label: isWatching ? '⏸ Pause Watching' : '▶ Resume Watching',
        click: () => { isWatching = !isWatching; rebuildMenu() },
      },
      { type: 'separator' },
      { label: 'Quit Synclyx Desktop', click: () => { app.isQuiting = true; app.quit() } },
    ])
    tray.setContextMenu(menu)
  }
  rebuildMenu()

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', (e) => {
  // Don't quit — this is a background utility. Only the tray "Quit" does that.
  e.preventDefault?.()
})
