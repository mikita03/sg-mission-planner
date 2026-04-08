import { useState, useEffect, useCallback } from 'react';
import type { Block, ParentCategory } from '../types';
import { genId } from '../utils/time';
import { legacyToCategory } from '../constants/categories';
import { ref, onValue, set, update, remove } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';

/** Normalize any block data (handles legacy + missing fields) */
function normalizeBlock(raw: any): Block {
  if (!raw || typeof raw !== 'object') {
    return createBlock({});
  }
  // Legacy migration: old 'type' field → new category/subType
  let category = raw.category || '';
  let subType = raw.subType || '';
  if (!category && raw.type) {
    const mapped = legacyToCategory(raw.type);
    category = mapped.category;
    subType = mapped.subType;
  }
  if (!category) category = 'reserve';

  return {
    id: raw.id || genId(),
    day: raw.day || 'd0',
    team: raw.team || 'A',
    start: raw.start || '10:00',
    dur: raw.dur || 60,
    category: category as ParentCategory,
    subType: subType || '',
    label: raw.label || '',
    detail: raw.detail || '',
    location: raw.location || '',
    fromLocation: raw.fromLocation || '',
    contact: raw.contact || '',
    assignee: raw.assignee || '',
    memo: raw.memo || '',
    mapUrl: raw.mapUrl || '',
    draft: raw.draft ?? false,
    status: raw.status || 'pending',
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    editedBy: raw.editedBy || '',
    editedAt: raw.editedAt || 0,
  };
}

export function createBlock(p: Partial<Block>): Block {
  return normalizeBlock({ id: genId(), ...p });
}

function mkVisit() {
  return [
    { start:'9:15',dur:45, category:'move' as const,subType:'taxi', label:'タクシー', fromLocation:'ホテル', location:'訪問先' },
    { start:'10:00',dur:60, category:'visit' as const, label:'訪問 1' },
    { start:'11:00',dur:15, category:'move' as const,subType:'walk', label:'徒歩', location:'カフェ' },
    { start:'11:15',dur:30, category:'review' as const, label:'振り返り' },
    { start:'11:45',dur:75, category:'food' as const,subType:'lunch', label:'ランチ' },
    { start:'13:00',dur:30, category:'move' as const,subType:'taxi', label:'タクシー', location:'訪問先' },
    { start:'13:30',dur:60, category:'visit' as const, label:'訪問 2' },
    { start:'14:30',dur:15, category:'move' as const,subType:'walk', label:'徒歩', location:'カフェ' },
    { start:'14:45',dur:30, category:'review' as const, label:'振り返り' },
    { start:'15:15',dur:75, category:'reserve' as const, label:'予備', detail:'訪問3 or バッファ' },
    { start:'16:30',dur:30, category:'move' as const,subType:'mrt', label:'MRT', location:'共有場所' },
  ];
}
function mkEvent() {
  return [
    { start:'8:00',dur:60, category:'move' as const,subType:'taxi', label:'タクシー', fromLocation:'ホテル', location:'EXPO' },
    { start:'9:00',dur:180, category:'atxsg' as const, label:'ATxSG', detail:'午前セッション' },
    { start:'12:00',dur:60, category:'food' as const,subType:'lunch', label:'ランチ', detail:'会場内' },
    { start:'13:00',dur:240, category:'atxsg' as const, label:'ATxSG', detail:'午後セッション' },
  ];
}
function mkEvening() {
  return [
    { start:'17:00',dur:30, category:'move' as const,subType:'mrt', label:'MRT', location:'共有場所' },
    { start:'17:30',dur:90, category:'sync' as const, label:'チーム間共有' },
    { start:'19:00',dur:30, category:'move' as const,subType:'taxi', label:'タクシー', location:'レストラン' },
    { start:'19:30',dur:90, category:'food' as const,subType:'dinner', label:'ディナー' },
  ];
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
      ...cfg.a().map(p => createBlock({ ...p, day, team: 'A' })),
      ...mkEvening().map(p => createBlock({ ...p, day, team: 'A' })),
      ...cfg.b().map(p => createBlock({ ...p, day, team: 'B' })),
      ...mkEvening().map(p => createBlock({ ...p, day, team: 'B' })),
    );
  });
  return blocks;
}

const LOCAL_KEY = 'sg_mission_v4';

export function useBlocks(userName?: string) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'firebase' | 'local'>('local');

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      try {
        for (const key of [LOCAL_KEY, 'sg8']) {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setBlocks(parsed.map(normalizeBlock));
              setLoaded(true);
              setMode('local');
              return;
            }
          }
        }
      } catch { /* */ }
      setBlocks(generateDefault());
      setLoaded(true);
      setMode('local');
      return;
    }

    setMode('firebase');
    const timeout = setTimeout(() => { if (!loaded) setLoaded(true); }, 3000);
    const unsub = onValue(ref(db!, 'blocks'), (snapshot) => {
      clearTimeout(timeout);
      const data = snapshot.val();
      if (data) {
        setBlocks(Object.values(data).map((b: any) => normalizeBlock(b)));
      } else {
        const defaults = generateDefault();
        const obj: Record<string, Block> = {};
        defaults.forEach(b => { obj[b.id] = b; });
        set(ref(db!, 'blocks'), obj);
        setBlocks(defaults);
      }
      setLoaded(true);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (loaded && blocks.length > 0) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(blocks)); } catch { /* */ }
    }
  }, [blocks, loaded]);

  const addBlock = useCallback((partial: Partial<Block>) => {
    const block = createBlock({ ...partial, editedBy: userName || '', editedAt: Date.now() });
    if (mode === 'firebase' && db) set(ref(db, `blocks/${block.id}`), block);
    else setBlocks(prev => [...prev, block]);
    return block;
  }, [mode, userName]);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    const patched = { ...updates, editedBy: userName || '', editedAt: Date.now() };
    if (mode === 'firebase' && db) update(ref(db, `blocks/${id}`), patched);
    else setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patched } : b));
  }, [mode, userName]);

  const deleteBlock = useCallback((id: string) => {
    if (mode === 'firebase' && db) remove(ref(db, `blocks/${id}`));
    else setBlocks(prev => prev.filter(b => b.id !== id));
  }, [mode]);

  const duplicateBlock = useCallback((id: string) => {
    const orig = blocks.find(b => b.id === id);
    if (!orig) return null;
    const [h, m] = orig.start.split(':').map(Number);
    const total = h * 60 + m + 15;
    const dup = createBlock({
      ...orig, id: genId(),
      start: `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`,
      detail: '', draft: true, editedBy: userName || '', editedAt: Date.now(),
    });
    if (mode === 'firebase' && db) set(ref(db, `blocks/${dup.id}`), dup);
    else setBlocks(prev => [...prev, dup]);
    return dup;
  }, [blocks, mode, userName]);

  const addComment = useCallback((blockId: string, text: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const comment = { id: genId(), author: userName || 'Anonymous', text, timestamp: Date.now() };
    const updatedComments = [...(block.comments || []), comment];
    if (mode === 'firebase' && db) update(ref(db, `blocks/${blockId}`), { comments: updatedComments });
    else setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, comments: updatedComments } : b));
  }, [blocks, mode, userName]);

  /** Check if adjacent movement block exists */
  const hasAdjacentMove = useCallback((day: string, team: string, startMin: number, direction: 'before' | 'after'): boolean => {
    return blocks.some(b => {
      if (b.day !== day || b.team !== team || b.category !== 'move') return false;
      const [h, m] = b.start.split(':').map(Number);
      const bStart = (h - 6) * 60 + m;
      const bEnd = bStart + b.dur;
      if (direction === 'before') return Math.abs(bEnd - startMin) <= 15;
      return Math.abs(bStart - (startMin)) <= 15;
    });
  }, [blocks]);

  return { blocks, loaded, mode, addBlock, updateBlock, deleteBlock, duplicateBlock, addComment, hasAdjacentMove };
}
