import { initializeApp, getApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const ENV = import.meta.env

export const firebaseConfig = {
  apiKey: ENV.VITE_FIREBASE_API_KEY,
  authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.VITE_FIREBASE_APP_ID,
}

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
)

let firebaseSingleton = null

export function getAccountsFirebase() {
  if (!firebaseReady) return null
  if (!firebaseSingleton) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    firebaseSingleton = { app, auth: getAuth(app), db: getFirestore(app) }
  }
  return firebaseSingleton
}
