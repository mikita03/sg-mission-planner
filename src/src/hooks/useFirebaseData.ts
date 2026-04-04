import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';

/**
 * Hook that loads data from Firebase with localStorage fallback.
 * If Firebase doesn't respond within 3s, falls back to localStorage.
 */
export function useFirebaseData<T>(
  firebasePath: string,
  localStorageKey: string,
  defaultValue: T,
  validate?: (val: unknown) => T | null,
) {
  const [data, setData] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    // Try localStorage first (always, as immediate fallback)
    try {
      const saved = localStorage.getItem(localStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          setData(validate ? (validate(parsed) || defaultValue) : parsed);
        }
      }
    } catch { /* ignore */ }

    if (isFirebaseConfigured && db) {
      // Timeout: if Firebase hasn't responded in 3s, mark as loaded anyway
      const timeout = setTimeout(() => {
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      }, 3000);

      const unsub = onValue(ref(db, firebasePath), (snap) => {
        clearTimeout(timeout);
        const val = snap.val();
        if (val) {
          const validated = validate ? validate(val) : val as T;
          if (validated) setData(validated);
        }
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      }, () => {
        // Error handler
        clearTimeout(timeout);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      });

      return () => { unsub(); clearTimeout(timeout); };
    } else {
      setLoaded(true);
    }
  }, []);

  const save = useCallback((newData: T) => {
    setData(newData);
    if (isFirebaseConfigured && db) {
      set(ref(db, firebasePath), newData).catch(() => {});
    }
    try { localStorage.setItem(localStorageKey, JSON.stringify(newData)); } catch { /* */ }
  }, [firebasePath, localStorageKey]);

  return { data, loaded, save, setData };
}
