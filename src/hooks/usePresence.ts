import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';

export interface PresenceEntry {
  name: string;
  activeBlock: string | null;
  lastSeen: number;
  online: boolean;
}

export function usePresence(userId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceEntry>>({});

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const presRef = ref(db, 'presence');
    const unsub = onValue(presRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Filter to online users or recently seen (within 60s)
        const now = Date.now();
        const filtered: Record<string, PresenceEntry> = {};
        for (const [uid, entry] of Object.entries(data as Record<string, PresenceEntry>)) {
          if (entry.online || (now - entry.lastSeen) < 60000) {
            filtered[uid] = entry;
          }
        }
        setOnlineUsers(filtered);
      } else {
        setOnlineUsers({});
      }
    });

    return () => unsub();
  }, []);

  // Set which block the current user is editing
  const setActiveBlock = useCallback(async (blockId: string | null) => {
    if (!isFirebaseConfigured || !db || !userId || userId === 'local') return;
    try {
      await update(ref(db!, `presence/${userId}`), {
        activeBlock: blockId,
        lastSeen: Date.now(),
      });
    } catch { /* ignore */ }
  }, [userId]);

  // Heartbeat - update lastSeen periodically
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !userId || userId === 'local') return;
    const timer = setInterval(() => {
      update(ref(db!, `presence/${userId}`), { lastSeen: Date.now() }).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [userId]);

  // Check if a block is being edited by someone else
  const getBlockEditor = useCallback((blockId: string): string | null => {
    if (!userId) return null;
    for (const [uid, entry] of Object.entries(onlineUsers)) {
      if (uid !== userId && entry.activeBlock === blockId && entry.online) {
        return entry.name;
      }
    }
    return null;
  }, [onlineUsers, userId]);

  // Get list of online user names (excluding self)
  const otherOnlineUsers = Object.entries(onlineUsers)
    .filter(([uid]) => uid !== userId)
    .map(([, entry]) => entry.name)
    .filter(Boolean);

  return { onlineUsers, otherOnlineUsers, setActiveBlock, getBlockEditor };
}
