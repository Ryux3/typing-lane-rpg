import { initializeApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig'

type FirebaseServices = {
  auth: Auth
  db: Firestore
  googleProvider: GoogleAuthProvider
}

let services: FirebaseServices | null = null

export function getFirebaseServices() {
  if (!isFirebaseConfigured) return null
  if (services) return services

  const firebaseApp = initializeApp(firebaseConfig)
  services = {
    auth: getAuth(firebaseApp),
    db: getFirestore(firebaseApp),
    googleProvider: new GoogleAuthProvider(),
  }

  return services
}
