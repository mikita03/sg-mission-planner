import { useState, useEffect, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ref, set, onDisconnect } from 'firebase/database';
import { auth, db, isFirebaseConfigured } from '../firebase';

export interface UserInfo {
  uid: string;
  name: string;
}

const NICKNAME_KEY = 'sg_mission_nickname';

export function useUser() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      // Fallback: local-only mode
      const savedName = localStorage.getItem(NICKNAME_KEY) || '';
      if (savedName) {
        setUser({ uid: 'local', name: savedName });
      } else {
        setNeedsNickname(true);
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const savedName = localStorage.getItem(NICKNAME_KEY) || '';
        if (savedName) {
          setUser({ uid: firebaseUser.uid, name: savedName });
          // Write presence
          const presRef = ref(db!, `presence/${firebaseUser.uid}`);
          await set(presRef, {
            name: savedName,
            activeBlock: null,
            lastSeen: Date.now(),
            online: true,
          });
          // Remove presence on disconnect
          onDisconnect(presRef).set({
            name: savedName,
            activeBlock: null,
            lastSeen: Date.now(),
            online: false,
          });
        } else {
          setUser({ uid: firebaseUser.uid, name: '' });
          setNeedsNickname(true);
        }
        setLoading(false);
      } else {
        // Sign in anonymously
        try {
          await signInAnonymously(auth!);
        } catch (e) {
          console.error('Auth error:', e);
          setUser({ uid: 'local', name: localStorage.getItem(NICKNAME_KEY) || 'Anonymous' });
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const setNickname = useCallback(async (name: string) => {
    localStorage.setItem(NICKNAME_KEY, name);
    const uid = user?.uid || 'local';
    setUser({ uid, name });
    setNeedsNickname(false);

    if (isFirebaseConfigured && db && uid !== 'local') {
      const presRef = ref(db, `presence/${uid}`);
      await set(presRef, {
        name,
        activeBlock: null,
        lastSeen: Date.now(),
        online: true,
      });
      onDisconnect(presRef).set({
        name,
        activeBlock: null,
        lastSeen: Date.now(),
        online: false,
      });
    }
  }, [user]);

  return { user, needsNickname, setNickname, loading };
}
