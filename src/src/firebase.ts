import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY || '',
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN || '',
  databaseURL: import.meta.env.VITE_FB_DATABASE_URL || '',
  projectId: import.meta.env.VITE_FB_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FB_APP_ID || '',
};

// Check if Firebase is configured
export const isFirebaseConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

export const db = app ? getDatabase(app) : null;
export const auth = app ? getAuth(app) : null;
