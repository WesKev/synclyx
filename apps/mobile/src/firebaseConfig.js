// Same PUBLIC client config as apps/web and apps/desktop — safe to embed,
// these identify the project, not a secret. Real security is Firestore's
// Security Rules (uid-scoped ownership).

import { initializeApp } from 'firebase/app'
import { initializeAuth, getReactNativePersistence } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import AsyncStorage from '@react-native-async-storage/async-storage'

const firebaseConfig = {
  apiKey: 'AIzaSyDBGacqYJ5Aod8LJCWUW5pqIM2oTvGQjsc',
  authDomain: 'synclyx-app.firebaseapp.com',
  projectId: 'synclyx-app',
  storageBucket: 'synclyx-app.firebasestorage.app',
  messagingSenderId: '193657171350',
  appId: '1:193657171350:web:151a8f33e2962aae7041b7',
}

export const app = initializeApp(firebaseConfig)

// React Native has no browser localStorage — without this, the user would
// have to sign in again every single time the app restarts.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
})

// React Native's networking layer doesn't support the streaming connection
// Firestore's default transport expects — without forcing long-polling,
// writes silently queue and never reach the server on real devices, even
// though everything looks fine in a browser-based test.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
})
