const { clipboard, ipcRenderer } = require('electron')
const os = require('os')
const { initializeApp } = require('firebase/app')
const {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged,
} = require('firebase/auth')
const {
  getFirestore, doc, setDoc, serverTimestamp,
} = require('firebase/firestore')

const firebaseConfig = require('./firebaseConfig')

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// ── DOM refs ───────────────────────────────────────────────────────────────
const signinView = document.getElementById('signin-view')
const watchingView = document.getElementById('watching-view')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const signinBtn = document.getElementById('signin-btn')
const signinError = document.getElementById('signin-error')
const accountLine = document.getElementById('account-line')
const deviceLine = document.getElementById('device-line')
const statusDot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const recentList = document.getElementById('recent-list')
const signoutBtn = document.getElementById('signout-btn')

// ── Identify this device ──────────────────────────────────────────────────
// Shows up in SyncBoard next to each clip, exactly like the app already
// displays deviceName for items pushed from a non-web source.
const deviceName = `🖥️ ${os.hostname()}`

// ── Sign in ────────────────────────────────────────────────────────────────
signinBtn.addEventListener('click', async () => {
  signinError.classList.add('hidden')
  const email = emailInput.value.trim()
  const password = passwordInput.value
  if (!email || !password) return

  signinBtn.disabled = true
  signinBtn.textContent = 'Signing in…'
  try {
    await signInWithEmailAndPassword(auth, email, password)
    // onAuthStateChanged below handles the view switch
  } catch (err) {
    const messages = {
      'auth/invalid-email': 'That email address looks invalid.',
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/too-many-requests': 'Too many attempts — wait a moment and try again.',
    }
    signinError.textContent = messages[err.code] || 'Something went wrong. Please try again.'
    signinError.classList.remove('hidden')
  } finally {
    signinBtn.disabled = false
    signinBtn.textContent = 'Sign In'
  }
})

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') signinBtn.click()
})

signoutBtn.addEventListener('click', () => auth.signOut())

// ── Auth state → view switching ───────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    signinView.classList.add('hidden')
    watchingView.classList.remove('hidden')
    accountLine.textContent = `Signed in as ${user.email}`
    deviceLine.textContent = `This device: ${deviceName}`
    startWatching(user.uid)
  } else {
    watchingView.classList.add('hidden')
    signinView.classList.remove('hidden')
    stopWatching()
  }
})

// ── Clipboard watcher ──────────────────────────────────────────────────────
const generateId = () => Math.random().toString(36).slice(2, 10)
const MAX_CLIP_LENGTH = 50000 // safety cap — skip pathologically large copies

function detectType(content) {
  if (/^https?:\/\//i.test(content.trim())) return 'link'
  if (/[{};]/.test(content) || /^\s*(function|const|let|var|import|class|def |<\w)/.test(content)) return 'code'
  return 'text'
}

let pollTimer = null
let lastSeenClipboard = clipboard.readText() // don't capture what was already there on launch
let lastPushedContent = null // prevents re-capturing our own pushes as "new"
let currentUid = null

async function startWatching(uid) {
  currentUid = uid
  lastSeenClipboard = clipboard.readText() // reset baseline on each sign-in
  updateStatusDot(true)

  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    const watching = await ipcRenderer.invoke('get-watching-state')
    updateStatusDot(watching)
    if (!watching) return

    const text = clipboard.readText()
    if (!text || !text.trim()) return
    if (text === lastSeenClipboard) return
    lastSeenClipboard = text

    if (text === lastPushedContent) return // our own write read back — ignore
    if (text.length > MAX_CLIP_LENGTH) return

    const now = Date.now()
    const item = {
      id: generateId(),
      label: '',
      content: text.trim(),
      type: detectType(text),
      pinned: false,
      source: 'electron',
      deviceName,
      createdAt: now,
      updatedAt: now,
    }

    try {
      // Same collection, same field shape as the web app's syncBoardStore —
      // this is what makes it show up seamlessly in SyncBoard.
      await setDoc(doc(db, 'users', uid, 'syncboard', item.id), {
        ...item,
        _syncedAt: serverTimestamp(),
      })
      lastPushedContent = text
      addRecent(item)
    } catch (err) {
      console.error('[Synclyx Desktop] Failed to sync clip:', err)
    }
  }, 1000)
}

function stopWatching() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  currentUid = null
}

function updateStatusDot(watching) {
  statusDot.className = watching ? 'status-dot active' : 'status-dot paused'
  statusText.textContent = watching ? 'Watching clipboard' : 'Paused'
}

function addRecent(item) {
  const empty = recentList.querySelector('.recent-empty')
  if (empty) empty.remove()

  const row = document.createElement('div')
  row.className = 'recent-item'
  const icon = item.type === 'link' ? '🔗' : item.type === 'code' ? '💻' : '📄'
  const preview = item.content.length > 60 ? item.content.slice(0, 60) + '…' : item.content
  row.innerHTML = `<span class="recent-icon">${icon}</span><span class="recent-text">${escapeHtml(preview)}</span>`
  recentList.prepend(row)

  // Keep the visible list short
  const rows = recentList.querySelectorAll('.recent-item')
  if (rows.length > 8) rows[rows.length - 1].remove()
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
