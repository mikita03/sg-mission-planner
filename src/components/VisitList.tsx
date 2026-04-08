import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import type { Block } from '../types';
import { DAYS, ic } from '../constants/categories';
import { t2m, m2t, genId } from '../utils/time';
import { showToast } from './Shared';
import { MarkdownField, MdText } from './MarkdownField';

export interface VisitCandidate {
  id: string;
  company: string;
  contact: string;
  location: string;
  assignee: string;
  memo: string;
  status: 'candidate' | 'approaching' | 'confirmed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  day: string;
  team: string;
  startTime: string;
  duration: number;
  blockId: string;
  createdBy: string;
  createdAt: number;
  sortOrder: number;
}

const STORAGE_KEY = 'sg_mission_visits';
const DEFAULT_TAGS = ['FinTech', 'EC', 'AI/ML', 'SaaS', 'Gov', 'Logistics', 'Healthcare', 'Startup'];
const TAG_STORAGE_KEY = 'sg_mission_tags';
const COLUMNS: { key: VisitCandidate['status']; label: string; cls: string }[] = [
  { key: 'candidate', label: 'CANDIDATE', cls: 'col-candidate' },
  { key: 'approaching', label: 'APPROACHING', cls: 'col-approaching' },
  { key: 'confirmed', label: 'CONFIRMED', cls: 'col-confirmed' },
  { key: 'cancelled', label: 'CANCELLED', cls: 'col-cancelled' },
];
const PRIORITY_OPTIONS = [
  { value: 'high', label: '高', color: 'var(--neon-red)' },
  { value: 'medium', label: '中', color: 'var(--neon-amber)' },
  { value: 'low', label: '低', color: 'var(--text3)' },
];

function loadCandidates(): VisitCandidate[] {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {} return [];
}
function loadTags(): string[] {
  try { const s = localStorage.getItem(TAG_STORAGE_KEY); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; } } catch {} return [...DEFAULT_TAGS];
}

interface Props {
  blocks: Block[];
  userName?: string;
  onAddBlock: (partial: Partial<Block>) => Block;
  onSelectBlock: (id: string) => void;
}

export function VisitList({ blocks, userName, onAddBlock, onSelectBlock }: Props) {
  const [candidates, setCandidates] = useState<VisitCandidate[]>(loadCandidates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagPresets, setTagPresets] = useState<string[]>(loadTags);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set()); // 9-8
  const dragRef = useRef<{ id: string; fromStatus: string } | null>(null);

  // Firebase sync
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const unsubs = [
      onValue(ref(db, 'visit_candidates'), (snap) => {
        const val = snap.val();
        if (val) {
          const arr = Object.values(val) as VisitCandidate[];
          setCandidates(arr);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
        }
      }),
      onValue(ref(db, 'visit_tags'), (snap) => {
        const val = snap.val();
        if (val && Array.isArray(val)) {
          setTagPresets(val);
          try { localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(val)); } catch {}
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const save = useCallback((newC: VisitCandidate[]) => {
    setCandidates(newC);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newC)); } catch {}
    if (isFirebaseConfigured && db) {
      const obj: Record<string, VisitCandidate> = {};
      newC.forEach(c => { obj[c.id] = c; });
      set(ref(db, 'visit_candidates'), obj);
    }
  }, []);

  const saveTags = useCallback((t: string[]) => {
    setTagPresets(t);
    try { localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(t)); } catch {}
    if (isFirebaseConfigured && db) set(ref(db, 'visit_tags'), t);
  }, []);

  const addCandidate = useCallback(() => {
    const nc: VisitCandidate = {
      id: genId(), company: '', contact: '', location: '', assignee: '', memo: '',
      status: 'candidate', priority: 'medium', tags: [],
      day: '', team: 'A', startTime: '', duration: 60, blockId: '',
      createdBy: userName || '', createdAt: Date.now(), sortOrder: Date.now(),
    };
    save([...candidates, nc]);
    setSelectedId(nc.id);
    setEditMode(true);
  }, [candidates, save, userName]);

  const updateCandidate = useCallback((id: string, updates: Partial<VisitCandidate>) => {
    save(candidates.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [candidates, save]);

  const deleteCandidate = useCallback((id: string) => {
    save(candidates.filter(c => c.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditMode(false); }
  }, [candidates, save, selectedId]);

  const scheduleCandidate = useCallback((id: string) => {
    const c = candidates.find(v => v.id === id);
    if (!c) return;
    if (!c.day || !c.startTime) { showToast('日時を入力してください'); return; }
    const block = onAddBlock({
      day: c.day as Block['day'], team: c.team as Block['team'],
      start: c.startTime, dur: c.duration || 60,
      category: 'visit', subType: '', label: c.company, detail: c.company,
      location: c.location, contact: c.contact, assignee: c.assignee, memo: c.memo, draft: false,
    });
    updateCandidate(id, { blockId: block.id });
    showToast('SCHEDULED');
  }, [candidates, onAddBlock, updateCandidate]);

  // 9-8: Bulk status change
  const toggleCheck = useCallback((id: string) => {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);
  const bulkSetStatus = useCallback((status: VisitCandidate['status']) => {
    const updated = candidates.map(c => checkedIds.has(c.id) ? { ...c, status } : c);
    save(updated);
    setCheckedIds(new Set());
    showToast(`${checkedIds.size} 件を ${status.toUpperCase()} に変更`);
  }, [candidates, checkedIds, save]);

  // Drag & drop between columns + reorder
  function onCardDragStart(e: React.DragEvent, id: string, status: string) {
    dragRef.current = { id, fromStatus: status };
    e.dataTransfer.effectAllowed = 'move';
  }
  function onColDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onColDrop(e: React.DragEvent, toStatus: VisitCandidate['status']) {
    e.preventDefault();
    if (!dragRef.current) return;
    const { id, fromStatus } = dragRef.current;
    if (fromStatus !== toStatus) {
      updateCandidate(id, { status: toStatus });
    }
    dragRef.current = null;
  }
  function onCardDrop(e: React.DragEvent, targetId: string, targetStatus: VisitCandidate['status']) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragRef.current || dragRef.current.id === targetId) { dragRef.current = null; return; }
    const { id, fromStatus } = dragRef.current;
    // Get sorted cards in target column
    const colCards = candidates.filter(c => c.status === targetStatus).sort((a, b) => (a.sortOrder || a.createdAt) - (b.sortOrder || b.createdAt));
    const targetIdx = colCards.findIndex(c => c.id === targetId);
    // Assign new sortOrder: place dragged card before the target
    const now = Date.now();
    const updates: { id: string; updates: Partial<VisitCandidate> }[] = [];
    colCards.splice(targetIdx, 0, candidates.find(c => c.id === id)!);
    const unique = colCards.filter((c, i, arr) => c && arr.findIndex(x => x.id === c.id) === i);
    unique.forEach((c, i) => {
      updates.push({ id: c.id, updates: { sortOrder: now + i, ...(c.id === id && fromStatus !== targetStatus ? { status: targetStatus } : {}) } });
    });
    const newC = candidates.map(c => {
      const u = updates.find(x => x.id === c.id);
      return u ? { ...c, ...u.updates } : c;
    });
    save(newC);
    dragRef.current = null;
  }

  const selected = selectedId ? candidates.find(c => c.id === selectedId) : null;
  const pri = selected ? PRIORITY_OPTIONS.find(p => p.value === selected.priority) : null;
  const inputStyle = {
    padding: '6px 9px', background: 'var(--bg)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, width: '100%',
  };

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          VISIT CANDIDATES
        </div>
        <button className="btn btn-primary" onClick={addCandidate}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plus') }} /> ADD
        </button>
      </div>

      {/* 7-4: Search */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="検索（企業名, 場所, タグ, 担当者）"
          style={{ ...inputStyle, width: '100%', fontSize: 13 }}
        />
      </div>

      {/* 9-8: Bulk Action Bar */}
      {checkedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'linear-gradient(135deg,rgba(0,229,255,.08),rgba(0,229,255,.03))', border: '1px solid var(--neon-cyan)', borderRadius: 'var(--radius)', fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--neon-cyan)', animation: 'fadeIn .2s ease' }}>
          <span>{checkedIds.size} 件選択</span>
          {COLUMNS.map(col => (
            <button key={col.key} className="btn" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => bulkSetStatus(col.key)}>{col.label}</button>
          ))}
          <button className="btn" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setCheckedIds(new Set())}>CLEAR</button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="kanban">
        {COLUMNS.map(col => {
          const q = searchQuery.toLowerCase().trim();
          const colCards = candidates.filter(c => {
            if (c.status !== col.key) return false;
            if (!q) return true;
            return c.company.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)
              || c.assignee.toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q));
          }).sort((a, b) => (a.sortOrder || a.createdAt) - (b.sortOrder || b.createdAt));
          return (
            <div key={col.key} className={`kanban-col ${col.cls}`}
              onDragOver={onColDragOver}
              onDrop={e => onColDrop(e, col.key)}>
              <div className="kanban-col-header">
                {col.label} <span className="count">{colCards.length}</span>
              </div>
              <div className="kanban-cards">
                {colCards.map(c => {
                  const p = PRIORITY_OPTIONS.find(pp => pp.value === c.priority) || PRIORITY_OPTIONS[1];
                  return (
                    <div key={c.id}
                      className={`kanban-card${selectedId === c.id ? ' selected' : ''}`}
                      draggable
                      onDragStart={e => onCardDragStart(e, c.id, c.status)}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                      onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                      onDrop={e => { e.currentTarget.classList.remove('drag-over'); onCardDrop(e, c.id, col.key); }}
                      onClick={() => { setSelectedId(selectedId === c.id ? null : c.id); setEditMode(false); }}>
                      <div className="kanban-card-company">
                        <input type="checkbox" checked={checkedIds.has(c.id)} onChange={() => toggleCheck(c.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ marginRight: 6, accentColor: 'var(--neon-cyan)', cursor: 'pointer' }} />
                        <span className="pri-dot" style={{ background: p.color }} />
                        {c.company || '（未入力）'}
                      </div>
                      {c.tags.length > 0 && (
                        <div className="kanban-card-tags">
                          {c.tags.map(t => <span key={t}>{t}</span>)}
                        </div>
                      )}
                      {c.location && <div className="kanban-card-info"><span>📍 {c.location}</span></div>}
                      {c.status === 'confirmed' && c.day && c.startTime && (
                        <div className="kanban-card-schedule">
                          {DAYS[parseInt(c.day[1])]?.label.split(' ')[0]} T{c.team} {c.startTime}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="kanban-drop-zone">ここにドロップ</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Panel (below kanban) */}
      {selected && (
        <div style={{
          marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '14px 16px', animation: 'fadeIn .2s ease',
          borderLeft: `3px solid ${pri?.color || 'var(--text3)'}`,
        }}>
          {/* Preview Mode */}
          {!editMode && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    {selected.company || '（未入力）'}
                  </div>
                  {selected.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {selected.tags.map(t => (
                        <span key={t} style={{ fontFamily: 'Share Tech Mono', fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditMode(true)}>
                    <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('edit') }} /> EDIT
                  </button>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => { setSelectedId(null); setEditMode(false); }}>
                    CLOSE
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontFamily: 'Rajdhani', fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
                {selected.location && <div><span style={{ color: 'var(--text3)', marginRight: 6 }}>📍</span>{selected.location}</div>}
                {selected.assignee && <div><span style={{ color: 'var(--text3)', marginRight: 6 }}>👤</span>{selected.assignee}</div>}
                {selected.contact && <div><span style={{ color: 'var(--text3)', marginRight: 6 }}>☎</span>{selected.contact}</div>}
                <div><span style={{ color: 'var(--text3)', marginRight: 6 }}>🏷</span>優先度: {pri?.label || '中'}</div>
              </div>

              {selected.memo && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 4, letterSpacing: '.06em' }}>MEMO</div>
                  <MdText text={selected.memo} />
                </div>
              )}

              {/* Quick status change */}
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginRight: 4 }}>STATUS:</span>
                {COLUMNS.map(col => (
                  <button key={col.key}
                    className={`wizard-sub-btn-sm${selected.status === col.key ? ' selected' : ''}`}
                    onClick={() => updateCandidate(selected.id, { status: col.key })}>
                    {col.label}
                  </button>
                ))}
              </div>

              {/* Schedule section for confirmed */}
              {selected.status === 'confirmed' && !selected.blockId && (
                <div style={{ marginTop: 10, padding: '10px 0', borderTop: '1px solid var(--border)', animation: 'fadeIn .3s ease' }}>
                  <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--neon-cyan)', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>
                    SCHEDULE — 日時を入力してカレンダーに反映
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, alignItems: 'end' }}>
                    <div className="drawer-field"><label>日程</label>
                      <select style={inputStyle} value={selected.day} onChange={e => updateCandidate(selected.id, { day: e.target.value })}>
                        <option value="">—</option>
                        {DAYS.map(d => <option key={d.key} value={d.key}>{d.label.split(' ')[0]}</option>)}
                      </select></div>
                    <div className="drawer-field"><label>Team</label>
                      <select style={inputStyle} value={selected.team} onChange={e => updateCandidate(selected.id, { team: e.target.value })}>
                        <option value="A">A</option><option value="B">B</option>
                      </select></div>
                    <div className="drawer-field"><label>開始時刻</label>
                      <input type="time" style={inputStyle} value={selected.startTime} step={900}
                        onChange={e => updateCandidate(selected.id, { startTime: e.target.value })} /></div>
                    <div className="drawer-field"><label>時間(分)</label>
                      <select style={inputStyle} value={selected.duration} onChange={e => updateCandidate(selected.id, { duration: Number(e.target.value) })}>
                        {[30,45,60,90,120].map(m => <option key={m} value={m}>{m}m</option>)}
                      </select></div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, width: '100%', marginTop: 8 }}
                    onClick={() => scheduleCandidate(selected.id)}
                    disabled={!selected.day || !selected.startTime}>
                    <span className="ic" dangerouslySetInnerHTML={{ __html: ic('calendar') }} /> スケジュールに反映
                  </button>
                </div>
              )}

              {selected.status === 'confirmed' && selected.blockId && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => onSelectBlock(selected.blockId)}>
                    <span className="ic" dangerouslySetInnerHTML={{ __html: ic('calendar') }} /> スケジュールで見る
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Edit Mode */}
          {editMode && (
            <div style={{ animation: 'fadeIn .2s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', letterSpacing: '.08em' }}>EDIT</span>
                <button className="btn" style={{ padding: '2px 10px', fontSize: 11 }}
                  onClick={() => setEditMode(false)}>DONE</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="drawer-field"><label>企業名</label>
                  <input style={inputStyle} value={selected.company} placeholder="企業名"
                    onChange={e => updateCandidate(selected.id, { company: e.target.value })} autoFocus /></div>
                <div className="drawer-field"><label>場所</label>
                  <input style={inputStyle} value={selected.location} placeholder="場所"
                    onChange={e => updateCandidate(selected.id, { location: e.target.value })} /></div>
                <div className="drawer-field"><label>連絡先</label>
                  <input style={inputStyle} value={selected.contact} placeholder="連絡先"
                    onChange={e => updateCandidate(selected.id, { contact: e.target.value })} /></div>
                <div className="drawer-field"><label>担当者</label>
                  <input style={inputStyle} value={selected.assignee} placeholder="担当者名"
                    onChange={e => updateCandidate(selected.id, { assignee: e.target.value })} /></div>
              </div>

              {/* Memo with Markdown */}
              <div style={{ marginTop: 8 }}>
                <MarkdownField
                  label="メモ"
                  value={selected.memo}
                  onChange={v => updateCandidate(selected.id, { memo: v })}
                  placeholder="Markdown記法が使えます"
                />
              </div>

              {/* Priority */}
              <div className="drawer-field" style={{ marginTop: 8 }}><label>優先度</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {PRIORITY_OPTIONS.map(p => (
                    <button key={p.value} className={`wizard-sub-btn-sm${selected.priority === p.value ? ' selected' : ''}`}
                      style={{ borderColor: selected.priority === p.value ? p.color : undefined, color: selected.priority === p.value ? p.color : undefined }}
                      onClick={() => updateCandidate(selected.id, { priority: p.value as VisitCandidate['priority'] })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="drawer-field" style={{ marginTop: 8 }}><label>タグ</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {tagPresets.map(tag => (
                    <span key={tag} style={{ position: 'relative', display: 'inline-flex' }}>
                      <button className={`wizard-sub-btn-sm${selected.tags.includes(tag) ? ' selected' : ''}`}
                        onClick={() => {
                          const nt = selected.tags.includes(tag) ? selected.tags.filter(t => t !== tag) : [...selected.tags, tag];
                          updateCandidate(selected.id, { tags: nt });
                        }}>{tag}</button>
                      {!DEFAULT_TAGS.includes(tag) && (
                        <button style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          onClick={e => { e.stopPropagation(); saveTags(tagPresets.filter(t => t !== tag)); }}>×</button>
                      )}
                    </span>
                  ))}
                  {!showTagInput ? (
                    <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setShowTagInput(true)}>+</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, animation: 'fadeIn .2s ease' }}>
                      <input style={{ ...inputStyle, width: 100 }} value={tagInput} placeholder="タグ名" autoFocus
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && tagInput.trim()) { saveTags([...tagPresets, tagInput.trim()]); updateCandidate(selected.id, { tags: [...selected.tags, tagInput.trim()] }); setTagInput(''); setShowTagInput(false); }
                          if (e.key === 'Escape') { setTagInput(''); setShowTagInput(false); }
                        }} />
                      <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => { if (tagInput.trim()) { saveTags([...tagPresets, tagInput.trim()]); updateCandidate(selected.id, { tags: [...selected.tags, tagInput.trim()] }); } setTagInput(''); setShowTagInput(false); }}>OK</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Delete */}
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-start' }}>
                <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => deleteCandidate(selected.id)}>
                  <span className="ic" dangerouslySetInnerHTML={{ __html: ic('trash') }} /> DELETE
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduled Visits */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--text2)', letterSpacing: '.08em', marginBottom: 8 }}>
          SCHEDULED VISITS
        </div>
        {(() => {
          const sv = blocks.filter(b => b && b.category === 'visit' && !b.draft);
          if (sv.length === 0) return <div style={{ textAlign: 'center', padding: 16, color: 'var(--text3)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>カレンダーに訪問ブロックがありません</div>;
          return (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
              <table className="visit-table">
                <thead><tr><th>Day</th><th>Team</th><th>Time</th><th>Company</th><th>Location</th></tr></thead>
                <tbody>
                  {sv.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : t2m(a.start) - t2m(b.start)).map(v => (
                    <tr key={v.id} onClick={() => onSelectBlock(v.id)} style={{ cursor: 'pointer' }} className="visit-row-confirmed">
                      <td>{DAYS[parseInt(v.day[1])]?.label.split(' ')[0]}</td>
                      <td>{v.team}</td>
                      <td style={{ fontFamily: 'Share Tech Mono', fontSize: 12 }}>{v.start}–{m2t(t2m(v.start) + v.dur)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--neon-emerald)' }}>{v.detail || v.label || '—'}</td>
                      <td style={{ color: 'var(--text2)' }}>{v.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
