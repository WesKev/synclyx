import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StatusBar } from 'react-native'
import { useShareIntent } from 'expo-share-intent'
import { onAuthStateChanged } from 'firebase/auth'
import * as Device from 'expo-device'
import { auth } from './src/firebaseConfig'
import { pushClip } from './src/services/syncBoardService'
import SignInScreen from './src/screens/SignInScreen'
import WatchingScreen from './src/screens/WatchingScreen'
import { styles } from './src/styles'

const deviceName = `📱 ${Device.modelName || 'Android device'}`

function AppInner() {
  const [user, setUser] = useState(undefined) // undefined = still checking, null = signed out
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const [confirming, setConfirming] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser)
    return unsub
  }, [])

  // ── Share-to-Synclyx: the primary, free-tier capture path ────────────────
  // Fired whenever the user picks Synclyx from Android's native Share sheet
  // in any other app. hasShareIntent flips true with the shared text ready
  // to save — no clipboard polling involved here at all, this is a direct
  // OS-level hand-off, which is exactly why it works without any background
  // service or special permission.
  useEffect(() => {
    if (hasShareIntent && shareIntent?.text) {
      setConfirming(true)
      setSaved(false)
    }
  }, [hasShareIntent, shareIntent])

  const handleSaveShared = async () => {
    if (!user || !shareIntent?.text) return
    const item = await pushClip(user.uid, shareIntent.text, deviceName)
    if (item && global.__synclyxAddRecent) global.__synclyxAddRecent(item)
    setSaved(true)
    setTimeout(() => {
      setConfirming(false)
      resetShareIntent()
    }, 900)
  }

  const handleDismissShared = () => {
    setConfirming(false)
    resetShareIntent()
  }

  if (user === undefined) return <View style={styles.screen} /> // brief splash while auth resolves

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0b032d" />
      {user ? <WatchingScreen /> : <SignInScreen />}

      {confirming && user && (
        <View style={styles.shareSheetOverlay}>
          <View style={styles.shareSheetCard}>
            <Text style={styles.shareSheetTitle}>
              {saved ? '✅ Saved to SyncBoard' : '📥 Save to SyncBoard?'}
            </Text>
            {!saved && (
              <>
                <Text style={styles.shareSheetPreview} numberOfLines={5}>
                  {shareIntent?.text}
                </Text>
                <TouchableOpacity style={styles.button} onPress={handleSaveShared}>
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonSecondary} onPress={handleDismissShared}>
                  <Text style={styles.buttonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </>
  )
}

export default function App() {
  return <AppInner />
}
