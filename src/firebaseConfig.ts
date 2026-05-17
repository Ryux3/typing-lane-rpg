const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const configuredAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined

function resolveAuthDomain() {
  if (!projectId) return configuredAuthDomain
  if (!configuredAuthDomain) return `${projectId}.firebaseapp.com`

  const currentHost = typeof window === 'undefined' ? '' : window.location.host
  const looksLikeNetlifyHost = configuredAuthDomain.includes('netlify.app') || configuredAuthDomain.includes('netlify.live')
  const pointsAtCurrentSite = currentHost && configuredAuthDomain === currentHost
  return looksLikeNetlifyHost || pointsAtCurrentSite ? `${projectId}.firebaseapp.com` : configuredAuthDomain
}

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: resolveAuthDomain(),
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId)
