import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import type { Block } from '../types';
import { DAYS, ic } from '../constants/categories';
import { t2m, m2t, genId } from '../utils/time';
import { showToast } from './Shared';

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
}

const STORAGE_KEY = 'sg_mission_visits';
const STATUS_OPTIONS = [
  { value: 'candidate', label: '候補', cls: 'st-pending' },
  { value: 'approaching', label: '打診中', cls: 'st-negotiating' },
  { value: 'confirmed', label: '確定', cls: 'st-confirmed' },
  { value: 'cancelled', label: 'キャンセル', cls: 'st-cancelled' },
];
const PRIORITY_OPTIONS = [
  { value: 'high', label: '高', color: 'var(--neon-red)' },
  { value: 'medium', label: '中', color: 'var(--neon-amber)' },
  { value: 'low', label: '低', color: 'var(--text3)' },
];
const DEFAULT_TAGS = ['FinTech', 'EC', 'AI/ML', 'SaaS', 'Gov', 'Logistics', 'Healthcare', 'Startup'];
const TAG_STORAGE_KEY = 'sg_mission_tags';

function loadTags(): string[] {
  try {
    const saved = localStorage.getItem(TAG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* */ }
  return [...DEFAULT_TAGS];
}

function defaultCandidate(userName: string): VisitCandidate {
  return {
    id: genId(), company: '', contact: '', location: '', assignee: '', memo: '',
    status: 'candidate', priority: 'medium', tags: [],
    day: '', team: 'A', startTime: '', duration: 60, blockId: '',
    createdBy: userName, createdAt: Date.now(),
  };
}

function loadCandidates(): VisitCandidate[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* */ }
  return [];
}

interface Props {
  blocks: Block[];
  userName?: string;
  onAddBlock: (partial: Partial<Block>) => Block;
  onSelectBlock: (id: string) => void;
}

export function VisitList({ blocks, userName, onAddBlock, onSelectBlock }: Props) {
  const [candidates, setCandidates] = useState<VisitCandidate[]>(loadCandidates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagPresets, setTagPresets] = useState<string[]>(loadTags);

  // Sync tags from Firebase
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const unsub = onValue(ref(db, 'visit_tags'), (snap) => {
      const val = snap.val();
      if (val && Array.isArray(val)) {
        setTagPresets(val);
        try { localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(val)); } catch {}
      }
    });
    return () => unsub();
  }, []);

  const saveTags = useCallback((newTags: string[]) => {
    setTagPresets(newTags);
    try { localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(newTags)); } catch {}
    if (isFirebaseConfigured && db) set(ref(db, 'visit_tags'), newTags);
  }, []);

  const addTagPreset = useCallback((tag: string) => {
    if (!tag.trim() || tagPresets.includes(tag.trim())) return;
    saveTags([...tagPresets, tag.trim()]);
  }, [tagPresets, saveTags]);

  const removeTagPreset = useCallback((tag: string) => {
    saveTags(tagPresets.filter(t => t !== tag));
  }, [tagPresets, saveTags]);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // Firebase sync
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const unsub = onValue(ref(db, 'visit_candidates'), (snap) => {
      const val = snap.val();
      if (val) {
        const arr = Array.isArray(val) ? val : Object.values(val) as VisitCandidate[];
        setCandidates(arr);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch { /* */ }
      }
    });
    return () => unsub();
  }, []);

  const save = useCallback((newCandidates: VisitCandidate[]) => {
    setCandidates(newCandidates);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newCandidates)); } catch { /* */ }
    if (isFirebaseConfigured && db) {
      const obj: Record<string, VisitCandidate> = {};
      newCandidates.forEach(c => { obj[c.id] = c; });
      set(ref(db, 'visit_candidates'), obj);
    }
  }, []);

  const addCandidate = useCallback(() => {
    const nc = defaultCandidate(userName || 'Anonymous');
    const updated = [...candidates, nc];
    save(updated);
    setEditingId(nc.id);
  }, [candidates, save, userName]);

  const updateCandidate = useCallback((id: string, updates: Partial<VisitCandidate>) => {
    save(candidates.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [candidates, save]);

  const deleteCandidate = useCallback((id: string) => {
    save(candidates.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  }, [candidates, save, editingId]);

  const confirmCandidate = useCallback((id: string) => {
    const c = candidates.find(v => v.id === id);
    if (!c) return;
    if (!c.day || !c.startTime) {
      showToast('日時を入力してください');
      setEditingId(id);
      return;
    }
    // Create block in schedule
    const block = onAddBlock({
      day: c.day as Block['day'],
      team: c.team as Block['team'],
      start: c.startTime,
      dur: c.duration || 60,
      category: 'visit',
      subType: '',
      label: c.company,
      detail: c.company,
      location: c.location,
      contact: c.contact,
      assignee: c.assignee,
      memo: c.memo,
      draft: false,
    });
    updateCandidate(id, { status: 'confirmed', blockId: block.id });
    showToast('SCHEDULED');
  }, [candidates, onAddBlock, updateCandidate]);

  // Scheduled visits from calendar
  const scheduledVisits = blocks.filter(b => b && b.category === 'visit' && !b.draft);

  // Filtered candidates
  const filteredCandidates = filterStatus
    ? candidates.filter(c => c.status === filterStatus)
    : candidates;

  // Stats
  const stats = {
    total: candidates.length,
    confirmed: candidates.filter(c => c.status === 'confirmed').length,
    approaching: candidates.filter(c => c.status === 'approaching').length,
    candidate: candidates.filter(c => c.status === 'candidate').length,
  };

  const inputStyle = {
    padding: '6px 9px', background: 'var(--bg)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif', fontSize: 13,
    width: '100%',
  };

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          VISIT CANDIDATES
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Stats */}
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text3)' }}>
            {stats.confirmed}/{stats.total} confirmed
          </span>
          <button className="btn btn-primary" onClick={addCandidate}>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plus') }} /> ADD
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`wizard-sub-btn-sm${!filterStatus ? ' selected' : ''}`}
          onClick={() => setFilterStatus(null)}>ALL ({stats.total})</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} className={`wizard-sub-btn-sm${filterStatus === s.value ? ' selected' : ''}`}
            onClick={() => setFilterStatus(filterStatus === s.value ? null : s.value)}>
            {s.label} ({candidates.filter(c => c.status === s.value).length})
          </button>
        ))}
      </div>

      {/* Candidate Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {filteredCandidates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
            {candidates.length === 0 ? 'まだ訪問候補がありません。ADDボタンで追加してください。' : 'フィルターに一致する候補がありません。'}
          </div>
        )}
        {filteredCandidates.map(c => {
          const isEditing = editingId === c.id;
          const pri = PRIORITY_OPTIONS.find(p => p.value === c.priority) || PRIORITY_OPTIONS[1];
          const st = STATUS_OPTIONS.find(s => s.value === c.status) || STATUS_OPTIONS[0];

          return (
            <div key={c.id} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '10px 14px', position: 'relative', overflow: 'hidden',
              borderLeft: `3px solid ${pri.color}`,
              opacity: c.status === 'cancelled' ? 0.5 : 1,
            }}>
              {/* Compact view */}
              {!isEditing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => setEditingId(c.id)}>
                  {/* Priority dot */}
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: pri.color, flexShrink: 0 }} />

                  {/* Company */}
                  <span style={{ fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                    {c.company || '（未入力）'}
                  </span>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {c.tags.map(tag => (
                      <span key={tag} style={{
                        fontFamily: 'Share Tech Mono', fontSize: 9, padding: '2px 6px', borderRadius: 8,
                        background: 'var(--bg3)', color: 'var(--text2)', letterSpacing: '.04em',
                      }}>{tag}</span>
                    ))}
                  </div>

                  {/* Schedule info */}
                  {c.day && c.startTime && (
                    <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--neon-cyan)', flexShrink: 0 }}>
                      {DAYS[parseInt(c.day[1])]?.label.split(' ')[0]} {c.startTime} T{c.team}
                    </span>
                  )}

                  {/* Status */}
                  <span className={`status-badge ${st.cls}`}>{st.label}</span>
                </div>
              )}

              {/* Expanded edit view */}
              {isEditing && (
                <div style={{ animation: 'fadeIn .2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', letterSpacing: '.08em' }}>
                      CANDIDATE DETAIL
                    </span>
                    <button className="btn" style={{ padding: '2px 10px', fontSize: 11 }}
                      onClick={() => setEditingId(null)}>CLOSE</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="drawer-field"><label>企業名</label>
                      <input style={inputStyle} value={c.company} placeholder="企業名"
                        onChange={e => updateCandidate(c.id, { company: e.target.value })} autoFocus /></div>
                    <div className="drawer-field"><label>場所</label>
                      <input style={inputStyle} value={c.location} placeholder="場所"
                        onChange={e => updateCandidate(c.id, { location: e.target.value })} /></div>
                    <div className="drawer-field"><label>連絡先</label>
                      <input style={inputStyle} value={c.contact} placeholder="連絡先"
                        onChange={e => updateCandidate(c.id, { contact: e.target.value })} /></div>
                    <div className="drawer-field"><label>担当者</label>
                      <input style={inputStyle} value={c.assignee} placeholder="担当者名"
                        onChange={e => updateCandidate(c.id, { assignee: e.target.value })} /></div>
                  </div>

                  <div className="drawer-field" style={{ marginTop: 8 }}><label>メモ</label>
                    <textarea style={{ ...inputStyle, minHeight: 40 }} value={c.memo} placeholder="メモ"
                      onChange={e => updateCandidate(c.id, { memo: e.target.value })} /></div>

                  {/* Priority & Status */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div className="drawer-field"><label>優先度</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {PRIORITY_OPTIONS.map(p => (
                          <button key={p.value} className={`wizard-sub-btn-sm${c.priority === p.value ? ' selected' : ''}`}
                            style={{ borderColor: c.priority === p.value ? p.color : undefined, color: c.priority === p.value ? p.color : undefined }}
                            onClick={() => updateCandidate(c.id, { priority: p.value as VisitCandidate['priority'] })}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="drawer-field"><label>ステータス</label>
                      <select style={inputStyle} value={c.status}
                        onChange={e => {
                          const newStatus = e.target.value as VisitCandidate['status'];
                          if (newStatus === 'confirmed') {
                            confirmCandidate(c.id);
                          } else {
                            updateCandidate(c.id, { status: newStatus });
                          }
                        }}>
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="drawer-field" style={{ marginTop: 8 }}><label>タグ</label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {tagPresets.map(tag => (
                        <span key={tag} style={{ position: 'relative', display: 'inline-flex' }}>
                          <button
                            className={`wizard-sub-btn-sm${c.tags.includes(tag) ? ' selected' : ''}`}
                            onClick={() => {
                              const newTags = c.tags.includes(tag) ? c.tags.filter(t => t !== tag) : [...c.tags, tag];
                              updateCandidate(c.id, { tags: newTags });
                            }}>
                            {tag}
                          </button>
                          {!DEFAULT_TAGS.includes(tag) && (
                            <button
                              style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}
                              onClick={(e) => { e.stopPropagation(); removeTagPreset(tag); }}
                              title="タグを削除">×</button>
                          )}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input style={{ ...inputStyle, flex: 1 }} value={tagInput} placeholder="新しいタグを追加"
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && tagInput.trim()) {
                            addTagPreset(tagInput.trim());
                            updateCandidate(c.id, { tags: [...c.tags, tagInput.trim()] });
                            setTagInput('');
                          }
                        }} />
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => { if (tagInput.trim()) { addTagPreset(tagInput.trim()); updateCandidate(c.id, { tags: [...c.tags, tagInput.trim()] }); setTagInput(''); } }}>+</button>
                    </div>
                  </div>

                  {/* Schedule Info */}
                  <div style={{ marginTop: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>
                      SCHEDULE（確定時にカレンダーに反映）
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                      <div className="drawer-field"><label>日程</label>
                        <select style={inputStyle} value={c.day}
                          onChange={e => updateCandidate(c.id, { day: e.target.value })}>
                          <option value="">—</option>
                          {DAYS.map(d => <option key={d.key} value={d.key}>{d.label.split(' ')[0]}</option>)}
                        </select></div>
                      <div className="drawer-field"><label>Team</label>
                        <select style={inputStyle} value={c.team}
                          onChange={e => updateCandidate(c.id, { team: e.target.value })}>
                          <option value="A">A</option><option value="B">B</option>
                        </select></div>
                      <div className="drawer-field"><label>開始時刻</label>
                        <input type="time" style={inputStyle} value={c.startTime} step={900}
                          onChange={e => updateCandidate(c.id, { startTime: e.target.value })} /></div>
                      <div className="drawer-field"><label>時間(分)</label>
                        <select style={inputStyle} value={c.duration}
                          onChange={e => updateCandidate(c.id, { duration: Number(e.target.value) })}>
                          {[30,45,60,90,120].map(m => <option key={m} value={m}>{m}m</option>)}
                        </select></div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                    <button className="btn btn-danger" style={{ fontSize: 12 }}
                      onClick={() => deleteCandidate(c.id)}>
                      <span className="ic" dangerouslySetInnerHTML={{ __html: ic('trash') }} /> DELETE
                    </button>
                    {c.status !== 'confirmed' && (
                      <button className="btn btn-primary" style={{ fontSize: 12 }}
                        onClick={() => confirmCandidate(c.id)}>
                        <span className="ic" dangerouslySetInnerHTML={{ __html: ic('check') }} /> 確定してスケジュールに反映
                      </button>
                    )}
                    {c.status === 'confirmed' && c.blockId && (
                      <button className="btn" style={{ fontSize: 12 }}
                        onClick={() => { onSelectBlock(c.blockId); }}>
                        <span className="ic" dangerouslySetInnerHTML={{ __html: ic('calendar') }} /> スケジュールで見る
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scheduled Visits from Calendar */}
      <div>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--text2)', letterSpacing: '.08em', marginBottom: 10 }}>
          SCHEDULED VISITS
        </div>
        {scheduledVisits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
            カレンダーに訪問ブロックがありません
          </div>
        ) : (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
            <table className="visit-table">
              <thead><tr>
                <th>Day</th><th>Team</th><th>Time</th><th>Company</th><th>Location</th>
              </tr></thead>
              <tbody>
                {scheduledVisits
                  .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : t2m(a.start) - t2m(b.start))
                  .map(v => (
                  <tr key={v.id} onClick={() => onSelectBlock(v.id)} style={{ cursor: 'pointer' }}
                    className="visit-row-confirmed">
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
        )}
      </div>
    </div>
  );
}
