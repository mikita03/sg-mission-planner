import { useState, useEffect, useCallback, useRef } from 'react';
import type { Block } from '../types';
import { genId } from '../utils/time';
import { ref, onValue, set, update, remove } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';

/* ═══ Default Schedule Templates ═══ */
function mkVisit(): Partial<Block>[] {
  return [
    { start:'9:15',dur:45,type:'hotel_move',label:'ホテル移動',detail:'ホテル→訪問先' },
    { start:'10:00',dur:60,type:'visit',label:'訪問 1',detail:'' },
    { start:'11:00',dur:15,type:'walk',label:'徒歩',detail:'→カフェ' },
    { start:'11:15',dur:30,type:'review',label:'振り返り',detail:'' },
    { start:'11:45',dur:75,type:'lunch',label:'ランチ+移動',detail:'' },
    { start:'13:00',dur:30,type:'taxi',label:'タクシー',detail:'→訪問先' },
    { start:'13:30',dur:60,type:'visit',label:'訪問 2',detail:'' },
    { start:'14:30',dur:15,type:'walk',label:'徒歩',detail:'→カフェ' },
    { start:'14:45',dur:30,type:'review',label:'振り返り',detail:'' },
    { start:'15:15',dur:75,type:'reserve',label:'予備',detail:'訪問3 or バッファ' },
    { start:'16:30',dur:30,type:'mrt',label:'MRT',detail:'→共有場所' },
  ];
}
function mkEvent(): Partial<Block>[] {
  return [
    { start:'8:00',dur:60,type:'taxi',label:'タクシー',detail:'ホテル→EXPO' },
    { start:'9:00',dur:180,type:'event',label:'ATxSG',detail:'午前セッション' },
    { start:'12:00',dur:60,type:'lunch',label:'ランチ',detail:'会場内' },
    { start:'13:00',dur:240,type:'event',label:'ATxSG',detail:'午後セッション' },
  ];
}
function mkEvening(): Partial<Block>[] {
  return [
    { start:'17:00',dur:30,type:'mrt',label:'MRT',detail:'→共有場所' },
    { start:'17:30',dur:90,type:'sync',label:'チーム間共有',detail:'' },
    { start:'19:00',dur:30,type:'taxi',label:'タクシー',detail:'→レストラン' },
    { start:'19:30',dur:90,type:'dinner',label:'ディナー',detail:'' },
  ];
}

function newBlock(p: Partial<Block>): Block {
  return {
    id: p.id || genId(),
    day: (p.day || 'd0') as Block['day'],
    team: (p.team || 'A') as Block['team'],
    start: p.start || '10:00',
    dur: p.dur || 60,
    type: p.type || 'visit',
    label: p.label || '',
    detail: p.detail || '',
    location: p.location || '',
    contact: p.contact || '',
    assignee: p.assignee || '',
    memo: p.memo || '',
    status: p.status || 'pending',
    comments: p.comments || [],
    editedBy: p.editedBy || '',
    editedAt: p.editedAt || 0,
  };
}

function generateDefault(): Block[] {
  const configs = [
    { a: mkVisit, b: mkVisit },
    { a: mkVisit, b: mkVisit },
    { a: mkEvent, b: mkVisit },
    { a: mkVisit, b: mkEvent },
  ];
  const blocks: Block[] = [];
  configs.forEach((cfg, i) => {
    const day = `d${i}` as Block['day'];
    blocks.push(
      ...cfg.a().map(p => newBlock({ ...p, day, team: 'A' })),
      ...mkEvening().map(p => newBlock({ ...p, day, team: 'A' })),
      ...cfg.b().map(p => newBlock({ ...p, day, team: 'B' })),
      ...mkEvening().map(p => newBlock({ ...p, day, team: 'B' })),
    );
  });
  return blocks;
}

const LOCAL_KEY = 'sg_mission_v4';

export function useBlocks(userName?: string) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'firebase' | 'local'>('local');
  const skipNextSync = useRef(false);

  // ═══ Firebase mode ═══
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      // Local-only fallback
      try {
        const saved = localStorage.getItem(LOCAL_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBlocks(parsed);
            setLoaded(true);
            setMode('local');
            return;
          }
        }
        // Try legacy
        const legacy = localStorage.getItem('sg8');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBlocks(parsed);
            setLoaded(true);
            setMode('local');
            return;
          }
        }
      } catch { /* ignore */ }
      setBlocks(generateDefault());
      setLoaded(true);
      setMode('local');
      return;
    }

    // Firebase: listen for changes
    setMode('firebase');
    const blocksRef = ref(db, 'blocks');

    const unsub = onValue(blocksRef, (snapshot) => {
      if (skipNextSync.current) {
        skipNextSync.current = false;
        return;
      }
      const data = snapshot.val();
      if (data) {
        const arr = Object.values(data) as Block[];
        setBlocks(arr);
      } else {
        // Empty DB: initialize with defaults
        const defaults = generateDefault();
        const obj: Record<string, Block> = {};
        defaults.forEach(b => { obj[b.id] = b; });
        set(blocksRef, obj);
        setBlocks(defaults);
      }
      setLoaded(true);
    });

    return () => unsub();
  }, []);

  // Local save (backup + offline)
  useEffect(() => {
    if (loaded && blocks.length > 0) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(blocks)); } catch { /* ignore */ }
    }
  }, [blocks, loaded]);

  // ═══ CRUD Operations ═══

  const addBlock = useCallback((partial: Partial<Block>) => {
    const block = newBlock({
      ...partial,
      editedBy: userName || '',
      editedAt: Date.now(),
    });

    if (mode === 'firebase' && db) {
      set(ref(db, `blocks/${block.id}`), block);
    } else {
      setBlocks(prev => [...prev, block]);
    }
    return block;
  }, [mode, userName]);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    const patchedUpdates = {
      ...updates,
      editedBy: userName || updates.editedBy || '',
      editedAt: Date.now(),
    };

    if (mode === 'firebase' && db) {
      update(ref(db, `blocks/${id}`), patchedUpdates);
    } else {
      setBlocks(prev => prev.map(b =>
        b.id === id ? { ...b, ...patchedUpdates } : b
      ));
    }
  }, [mode, userName]);

  const deleteBlock = useCallback((id: string) => {
    if (mode === 'firebase' && db) {
      remove(ref(db, `blocks/${id}`));
    } else {
      setBlocks(prev => prev.filter(b => b.id !== id));
    }
  }, [mode]);

  const duplicateBlock = useCallback((id: string) => {
    const original = blocks.find(b => b.id === id);
    if (!original) return null;
    const dup = newBlock({
      ...original,
      id: genId(),
      start: (() => {
        const [h, m] = original.start.split(':').map(Number);
        const total = h * 60 + m + 15;
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      })(),
      detail: '',
      editedBy: userName || '',
      editedAt: Date.now(),
    });

    if (mode === 'firebase' && db) {
      set(ref(db, `blocks/${dup.id}`), dup);
    } else {
      setBlocks(prev => [...prev, dup]);
    }
    return dup;
  }, [blocks, mode, userName]);

  const addComment = useCallback((blockId: string, text: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const comment = {
      id: genId(),
      author: userName || 'Anonymous',
      text,
      timestamp: Date.now(),
    };
    const updatedComments = [...(block.comments || []), comment];
    if (mode === 'firebase' && db) {
      update(ref(db, `blocks/${blockId}`), { comments: updatedComments });
    } else {
      setBlocks(prev => prev.map(b =>
        b.id === blockId ? { ...b, comments: updatedComments } : b
      ));
    }
  }, [blocks, mode, userName]);

  return { blocks, loaded, mode, addBlock, updateBlock, deleteBlock, duplicateBlock, addComment };
}
