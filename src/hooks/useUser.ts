import { useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { ref, set, get, onDisconnect } from 'firebase/database';
import { auth, db, googleProvider, isFirebaseConfigured } from '../firebase';

export interface UserInfo {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
}

const NICKNAME_KEY = 'sg_mission_nickname';
const VALID_ANSWERS = ['アンディーくん','アンディー','アンディ','＆aiくん','＆ai','&aiくん','&ai','andy','アンデイー','アンデイ'];

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function isValidAnswer(input: string): boolean {
  const n = normalizeAnswer(input);
  return VALID_ANSWERS.some(a => normalizeAnswer(a) === n);
}

export function useUser() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [passphraseError, setPassphraseError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingUser, setPendingUser] = useState<UserInfo | null>(null);

  async function checkAllowed(email: string): Promise<boolean> {
    if (!db) return true;
    try {
      const snap = await get(ref(db, 'allowed_users'));
      const val = snap.val();
      if (!val) return false;
      const emails: string[] = Array.isArray(val) ? val : Object.values(val);
      return emails.some(e => e.toLowerCase() === email.toLowerCase());
    } catch { return true; }
  }

  async function registerUser(email: string) {
    if (!db) return;
    const snap = await get(ref(db, 'allowed_users'));
    const val = snap.val();
    const emails: string[] = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    if (!emails.some(e => e.toLowerCase() === email.toLowerCase())) {
      emails.push(email);
      await set(ref(db, 'allowed_users'), emails);
    }
  }

  async function setupPresence(uid: string, name: string) {
    if (!db) return;
    const presRef = ref(db, `presence/${uid}`);
    await set(presRef, { name, activeBlock: null, lastSeen: Date.now(), online: true });
    onDisconnect(presRef).set({ name, activeBlock: null, lastSeen: Date.now(), online: false });
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      const savedName = localStorage.getItem(NICKNAME_KEY) || '';
      if (savedName) {
        setUser({ uid: 'local', name: savedName, email: '', photoURL: '' });
      } else { setNeedsLogin(true); }
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (firebaseUser.isAnonymous) {
          // Anonymous sessions no longer allowed — sign out and show login
          try { await firebaseSignOut(auth!); } catch { /* */ }
          setNeedsLogin(true);
          setLoading(false);
          return;
        }
        const email = firebaseUser.email || '';
        const name = firebaseUser.displayName || email.split('@')[0];
        const userInfo: UserInfo = { uid: firebaseUser.uid, name, email, photoURL: firebaseUser.photoURL || '' };
        const allowed = await checkAllowed(email);
        if (allowed) {
          localStorage.setItem(NICKNAME_KEY, name);
          setUser(userInfo);
          setNeedsLogin(false);
          setNeedsPassphrase(false);
          setupPresence(firebaseUser.uid, name);
        } else {
          setPendingUser(userInfo);
          setNeedsPassphrase(true);
          setNeedsLogin(false);
        }
      } else { setNeedsLogin(true); }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) return;
    try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error('Google sign-in error:', e); }
  }, []);

  const submitPassphrase = useCallback(async (input: string) => {
    if (!isValidAnswer(input)) {
      setPassphraseError(true);
      return;
    }
    if (pendingUser) {
      await registerUser(pendingUser.email);
      localStorage.setItem(NICKNAME_KEY, pendingUser.name);
      setUser(pendingUser);
      setNeedsPassphrase(false);
      setPassphraseError(false);
      setupPresence(pendingUser.uid, pendingUser.name);
    }
  }, [pendingUser]);

  const signInLocal = useCallback((name: string) => {
    localStorage.setItem(NICKNAME_KEY, name);
    setUser({ uid: 'local', name, email: '', photoURL: '' });
    setNeedsLogin(false);
  }, []);

  const signOut = useCallback(async () => {
    if (auth) { try { await firebaseSignOut(auth); } catch { /* */ } }
    localStorage.removeItem(NICKNAME_KEY);
    setUser(null);
    setPendingUser(null);
    setNeedsPassphrase(false);
    setNeedsLogin(true);
  }, []);

  return { user, needsLogin, needsPassphrase, passphraseError, loading, pendingUser, signInWithGoogle, submitPassphrase, signInLocal, signOut };
}
