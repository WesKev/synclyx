import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native'
import * as Device from 'expo-device'
import { auth } from '../firebaseConfig'
import { getUserPlan } from '../services/syncBoardService'
import {
  startForegroundWatcher,
  stopForegroundWatcher,
  isForegroundWatcherRunning,
} from '../services/backgroundWatcher'
import { styles, colors } from '../styles'

const deviceName = `📱 ${Device.modelName || 'Android device'}`

export default function WatchingScreen() {
  const user = auth.currentUser
  const [plan, setPlan] = useState('free')
  const [checkingPlan, setCheckingPlan] = useState(true)
  const [foregroundOn, setForegroundOn] = useState(false)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    if (!user) return
    getUserPlan(user.uid).then((p) => { setPlan(p); setCheckingPlan(false) })
    setForegroundOn(isForegroundWatcherRunning())
  }, [user])

  // Called from App.js whenever a clip lands via either capture path
  const addRecent = useCallback((item) => {
    setRecent((r) => [item, ...r].slice(0, 8))
  }, [])

  // Expose addRecent globally so App.js's share-intent handler and this
  // screen's own toggle can both report into the same recent list without
  // wiring a full state-management layer for a single small screen.
  useEffect(() => {
    global.__synclyxAddRecent = addRecent
    return () => { global.__synclyxAddRecent = null }
  }, [addRecent])

  const isPro = plan === 'basic' || plan === 'pro'

  const handleToggleForeground = async (value) => {
    if (!isPro) {
      Alert.alert(
        'Pro feature',
        'Automatic background watching (no need to use Share) is available on the Basic and Pro plans. Use Share → Synclyx for free, unlimited manual capture in the meantime.'
      )
      return
    }
    if (value) {
      await startForegroundWatcher(user.uid, deviceName)
      setForegroundOn(true)
    } else {
      await stopForegroundWatcher()
      setForegroundOn(false)
    }
  }

  return (
    <ScrollView style={styles.screenTop} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: foregroundOn ? colors.success : colors.border }]} />
        <Text style={styles.statusText}>
          {foregroundOn ? 'Watching automatically' : 'Ready — use Share to capture'}
        </Text>
      </View>
      <Text style={styles.metaLine}>Signed in as {user?.email}</Text>
      <Text style={styles.metaLine}>This device: {deviceName}</Text>

      {/* Share-to-Synclyx explainer — always available, every plan */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📤 Share to Synclyx</Text>
        <Text style={styles.sectionDesc}>
          Highlight text anywhere on your phone → tap Share → tap Synclyx.
          It's saved to SyncBoard instantly. Works in any app, no setup needed.
        </Text>
      </View>

      {/* Foreground watcher — Pro gated */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🔄 Automatic background watching</Text>
        <Text style={styles.sectionDesc}>
          Captures every copy automatically, without opening Share each time.
          Android requires a permanent notification while this runs — that's
          an OS rule we can't turn off.
        </Text>
        {checkingPlan ? null : isPro ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.tertiary, fontSize: 13 }}>
              {foregroundOn ? 'Currently watching' : 'Currently off'}
            </Text>
            <Switch
              value={foregroundOn}
              onValueChange={handleToggleForeground}
              trackColor={{ true: colors.success, false: colors.border }}
            />
          </View>
        ) : (
          <View style={styles.proLockRow}>
            <Text style={styles.proLockText}>🔒 Upgrade to Basic or Pro to unlock automatic watching</Text>
          </View>
        )}
      </View>

      <Text style={styles.recentHeader}>Recently captured</Text>
      {recent.length === 0 ? (
        <Text style={styles.recentEmpty}>Nothing captured yet this session</Text>
      ) : (
        recent.map((item) => (
          <View key={item.id} style={styles.recentItem}>
            <Text style={styles.recentIcon}>{item.type === 'link' ? '🔗' : item.type === 'code' ? '💻' : '📄'}</Text>
            <Text style={styles.recentText} numberOfLines={1}>{item.content}</Text>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.buttonSecondary} onPress={() => auth.signOut()}>
        <Text style={styles.buttonSecondaryText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}
