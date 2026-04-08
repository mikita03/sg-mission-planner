import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { DAYS, ic } from '../constants/categories';
import { MdText } from './MarkdownField';

const REACTIONS = ['👍', '👀', '💡', '🔥', '⚠️'];

interface ReviewEntry {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  reactions?: Record<string, string[]>;
  pinned?: boolean; // 9-4
}

interface DayTeamReview {
  outcomes: ReviewEntry[];
  improvements: ReviewEntry[];
  sharing: ReviewEntry[];
  freeText: ReviewEntry[];
}

interface ReviewData {
  dayTeams: Record<string, DayTeamReview>;
  overall: ReviewEntry[];
}

const STORAGE_KEY = 'sg_mission_review_v2';
let _rc = Date.now();
function rid() { return 'rv' + (++_rc).toString(36); }

function emptyDayTeamReview(): DayTeamReview {
  return { outcomes: [], improvements: [], sharing: [], freeText: [] };
}

function defaultReview(): ReviewData {
  const dayTeams: Record<string, DayTeamReview> = {};
  DAYS.forEach(d => { dayTeams[`${d.key}_A`] = emptyDayTeamReview(); dayTeams[`${d.key}_B`] = emptyDayTeamReview(); });
  return { dayTeams, overall: [] };
}

function ensureIds(entries: any[]): ReviewEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({ ...e, id: e.id || rid(), reactions: e.reactions || {} }));
}

export function Review({ userName }: { userName?: string }) {
  const [data, setData] = useState<ReviewData>(defaultReview());
  const [expandedDay, setExpandedDay] = useState<string | null>('d0');
  const [activeTeamTab, setActiveTeamTab] = useState<'A' | 'B'>('A');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, boolean>>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // 9-5

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const revRef = ref(db, 'review_v2');
      const unsub = onValue(revRef, (snap) => {
        const val = snap.val();
        if (val && val.dayTeams) {
          const merged = defaultReview();
          Object.keys(val.dayTeams || {}).forEach(k => {
            if (merged.dayTeams[k]) {
              const src = val.dayTeams[k];
              merged.dayTeams[k] = {
                outcomes: ensureIds(src.outcomes), improvements: ensureIds(src.improvements),
                sharing: ensureIds(src.sharing), freeText: ensureIds(src.freeText),
              };
            }
          });
          merged.overall = ensureIds(val.overall);
          setData(merged);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
        } else {
          const d = defaultReview();
          try { set(revRef, d); } catch {}
          setData(d);
        }
      });
      return () => unsub();
    } else {
      try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setData(JSON.parse(saved)); } catch {}
    }
  }, []);

  const save = useCallback((newData: ReviewData) => {
    setData(newData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch {}
    if (isFirebaseConfigured && db) set(ref(db, 'review_v2'), newData);
  }, []);

  // ═══ Entry CRUD ═══
  const addEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { id: rid(), text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now(), reactions: {} };
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: [...dt[field], entry] } } });
    setInputs(prev => ({ ...prev, [`${dayTeamKey}_${field}`]: '' }));
  }, [data, save, userName]);

  const editEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, entryId: string, newText: string) => {
    if (!newText.trim()) return;
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    const updated = (dt[field] || []).map((e: ReviewEntry) => e.id === entryId ? { ...e, text: newText.trim() } : e);
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: updated } } });
    setEditingEntryId(null);
  }, [data, save]);

  const deleteEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, entryId: string) => {
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: (dt[field] || []).filter((e: ReviewEntry) => e.id !== entryId) } } });
  }, [data, save]);

  const toggleReaction = useCallback((dayTeamKey: string, field: keyof DayTeamReview, entryId: string, emoji: string) => {
    const name = userName || 'Anonymous';
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    const updated = (dt[field] || []).map((e: ReviewEntry) => {
      if (e.id !== entryId) return e;
      const reactions = { ...(e.reactions || {}) };
      const users = reactions[emoji] || [];
      if (users.includes(name)) {
        reactions[emoji] = users.filter(u => u !== name);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...users, name];
      }
      return { ...e, reactions };
    });
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: updated } } });
  }, [data, save, userName]);

  // ═══ Overall CRUD ═══
  const addOverall = useCallback((text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { id: rid(), text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now(), reactions: {} };
    save({ ...data, overall: [...data.overall, entry] });
    setInputs(prev => ({ ...prev, overall: '' }));
  }, [data, save, userName]);

  const editOverall = useCallback((entryId: string, newText: string) => {
    if (!newText.trim()) return;
    save({ ...data, overall: data.overall.map(e => e.id === entryId ? { ...e, text: newText.trim() } : e) });
    setEditingEntryId(null);
  }, [data, save]);

  const deleteOverall = useCallback((entryId: string) => {
    save({ ...data, overall: data.overall.filter(e => e.id !== entryId) });
  }, [data, save]);

  const toggleOverallReaction = useCallback((entryId: string, emoji: string) => {
    const name = userName || 'Anonymous';
    save({ ...data, overall: data.overall.map(e => {
      if (e.id !== entryId) return e;
      const reactions = { ...(e.reactions || {}) };
      const users = reactions[emoji] || [];
      if (users.includes(name)) {
        reactions[emoji] = users.filter(u => u !== name);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else { reactions[emoji] = [...users, name]; }
      return { ...e, reactions };
    }) });
  }, [data, save, userName]);

  // 9-4: Pin toggle
  const pinEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, entryId: string) => {
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    const updated = (dt[field] || []).map((e: ReviewEntry) => e.id === entryId ? { ...e, pinned: !e.pinned } : e);
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: updated } } });
  }, [data, save]);

  const pinOverall = useCallback((entryId: string) => {
    save({ ...data, overall: data.overall.map(e => e.id === entryId ? { ...e, pinned: !e.pinned } : e) });
  }, [data, save]);

  // 9-6: Markdown export
  function exportMarkdown() {
    let md = '# SG Mission Review 2026\n\n';
    DAYS.forEach(day => {
      md += `## ${day.label}\n\n`;
      (['A', 'B'] as const).forEach(team => {
        const dt = data.dayTeams[`${day.key}_${team}`];
        if (!dt) return;
        md += `### Team ${team}\n\n`;
        FIELDS.forEach(f => {
          const entries = ensureIds(dt[f.key] || []);
          if (entries.length === 0) return;
          md += `#### ${f.label}\n\n`;
          entries.forEach(e => { md += `- **${e.author}**: ${e.text}\n`; });
          md += '\n';
        });
      });
    });
    if (data.overall.length > 0) {
      md += `## Overall\n\n`;
      data.overall.forEach(e => { md += `- **${e.author}**: ${e.text}\n`; });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = 'SG_MISSION_REVIEW_2026.md'; a.click();
  }

  const FIELDS: { key: keyof DayTeamReview; label: string; placeholder: string; icon: string }[] = [
    { key: 'outcomes', label: '成果・所感', placeholder: '訪問先での成果、得られた情報、印象など\nMarkdown対応（**太字**, - リスト）', icon: 'target' },
    { key: 'improvements', label: '改善点', placeholder: '次回への申し送り、改善すべきこと', icon: 'edit' },
    { key: 'sharing', label: 'チーム共有', placeholder: 'チーム全体に共有すべきこと', icon: 'sync' },
    { key: 'freeText', label: '自由メモ', placeholder: 'その他メモ', icon: 'note' },
  ];

  function countEntries(dayTeamKey: string): number {
    const dt = data.dayTeams[dayTeamKey];
    if (!dt) return 0;
    return [dt.outcomes, dt.improvements, dt.sharing, dt.freeText].filter(a => Array.isArray(a) && a.length > 0).length;
  }

  // ═══ Render Entries ═══
  function renderEntries(
    entries: ReviewEntry[],
    onDelete: (id: string) => void,
    onEdit: (id: string, text: string) => void,
    onReaction: (id: string, emoji: string) => void,
    onPin: (id: string) => void,
    borderColor = 'var(--neon-cyan)',
  ) {
    // 9-5: Filter by search + 9-4: Sort pinned first
    const q = searchQuery.toLowerCase().trim();
    const filtered = entries
      .filter(e => !q || e.text.toLowerCase().includes(q) || e.author.toLowerCase().includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    if (filtered.length === 0) return null;
    const me = userName || 'Anonymous';

    return (
      <div style={{ marginBottom: 8 }}>
        {filtered.map(e => {
          const isEditing = editingEntryId === e.id;
          const reactions = e.reactions || {};

          return (
            <div key={e.id || e.timestamp} className="comment-item review-entry" style={{ borderLeftColor: e.pinned ? 'var(--neon-amber)' : borderColor, position: 'relative', animationDelay: `${0.05 * filtered.indexOf(e)}s` }}>
              {e.pinned && <span style={{ position: 'absolute', top: 4, right: 8, fontSize: 10, color: 'var(--neon-amber)' }}>📌</span>}
              {/* Header */}
              <div className="comment-author">
                <span>{e.author}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="comment-time">
                    {new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button onClick={() => onPin(e.id)}
                    style={{ background: 'none', border: 'none', color: e.pinned ? 'var(--neon-amber)' : 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: e.pinned ? 1 : 0.5, transition: 'opacity .15s' }}
                    onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')}
                    onMouseLeave={ev => (ev.currentTarget.style.opacity = e.pinned ? '1' : '0.5')}
                    title="ピン留め">📌</button>
                  <button onClick={() => { setEditingEntryId(e.id); setEditText(e.text); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: 0.5, transition: 'opacity .15s' }}
                    onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')}
                    onMouseLeave={ev => (ev.currentTarget.style.opacity = '0.5')}
                    title="編集">✎</button>
                  <button onClick={() => onDelete(e.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: 0.5, transition: 'opacity .15s' }}
                    onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')}
                    onMouseLeave={ev => (ev.currentTarget.style.opacity = '0.5')}
                    title="削除">✕</button>
                </div>
              </div>

              {/* Content: view or edit */}
              {isEditing ? (
                <div style={{ marginTop: 4 }}>
                  <textarea value={editText} onChange={ev => setEditText(ev.target.value)}
                    className="comment-input" autoFocus
                    style={{ width: '100%', minHeight: 50, resize: 'vertical', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, display: 'block' }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                    <button className="btn" style={{ padding: '3px 10px', fontSize: 11 }}
                      onClick={() => setEditingEntryId(null)}>CANCEL</button>
                    <button className="comment-send" style={{ padding: '3px 10px' }}
                      onClick={() => onEdit(e.id, editText)}
                      disabled={!editText.trim()}>SAVE</button>
                  </div>
                </div>
              ) : (
                <div className="comment-text"><MdText text={e.text} /></div>
              )}

              {/* Reactions */}
              {!isEditing && (
                <div className="review-reactions">
                  {/* Existing reactions (always visible if any) */}
                  {Object.entries(reactions).map(([emoji, users]) => {
                    if (!Array.isArray(users) || users.length === 0) return null;
                    const isMine = users.includes(me);
                    return (
                      <button key={emoji} onClick={() => onReaction(e.id, emoji)}
                        title={users.join(', ')}
                        style={{
                          padding: '2px 6px', borderRadius: 10, border: `1px solid ${isMine ? 'var(--neon-cyan)' : 'var(--border)'}`,
                          background: isMine ? '#00e5ff10' : 'var(--bg)', cursor: 'pointer',
                          fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3,
                          transition: 'all .15s',
                        }}>
                        <span>{emoji}</span>
                        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: isMine ? 'var(--neon-cyan)' : 'var(--text3)' }}>{users.length}</span>
                      </button>
                    );
                  })}
                  {/* Add reaction picker - only on hover */}
                  <span className="reaction-picker-toggle">
                    {REACTIONS.filter(r => !reactions[r]).map(emoji => (
                      <button key={emoji} onClick={() => onReaction(e.id, emoji)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                          padding: '2px 3px', opacity: 0.5, transition: 'opacity .15s',
                        }}
                        onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')}
                        onMouseLeave={ev => (ev.currentTarget.style.opacity = '0.5')}>
                        {emoji}
                      </button>
                    ))}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══ Render Input ═══
  function renderInput(inputKey: string, placeholder: string, onPost: (text: string) => void) {
    const val = inputs[inputKey] || '';
    const showPreview = previews[inputKey] || false;

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button className="md-toggle"
            onClick={() => setPreviews(prev => ({ ...prev, [inputKey]: !showPreview }))}>
            {showPreview ? '✎ Edit' : '▣ Preview'}
          </button>
        </div>
        {showPreview ? (
          <div className="md-preview" style={{ minHeight: 50, marginBottom: 6 }}
            onClick={() => setPreviews(prev => ({ ...prev, [inputKey]: false }))}>
            {val ? <MdText text={val} /> : <span className="md-empty">{placeholder}</span>}
          </div>
        ) : (
          <textarea className="comment-input"
            style={{ width: '100%', minHeight: 50, resize: 'vertical', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, display: 'block' }}
            value={val} placeholder={placeholder}
            onChange={e => setInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                if (val.trim()) { onPost(val); setPreviews(prev => ({ ...prev, [inputKey]: false })); }
              }
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text3)' }}>
            Shift+Enter: 投稿 / Enter: 改行 / Markdown対応
          </span>
          <button className="comment-send" onClick={() => { if (val.trim()) { onPost(val); setPreviews(prev => ({ ...prev, [inputKey]: false })); } }}
            disabled={!val.trim()}>POST</button>
        </div>
      </div>
    );
  }

  // 9-6: Markdown export
  function exportMarkdown() {
    let md = '# SG MISSION REVIEW 2026\n\n';
    DAYS.forEach(day => {
      md += `## ${day.label} — ${day.desc}\n\n`;
      (['A', 'B'] as const).forEach(team => {
        const dt = data.dayTeams[`${day.key}_${team}`];
        if (!dt) return;
        md += `### Team ${team}\n\n`;
        const FIELDS: { key: keyof DayTeamReview; label: string }[] = [
          { key: 'outcomes', label: '成果' }, { key: 'improvements', label: '改善' },
          { key: 'sharing', label: '共有' }, { key: 'freeText', label: '自由記入' },
        ];
        FIELDS.forEach(f => {
          const entries = ensureIds(dt[f.key] || []);
          if (entries.length === 0) return;
          md += `#### ${f.label}\n\n`;
          entries.forEach(e => { md += `- ${e.text} *(${e.author})*\n`; });
          md += '\n';
        });
      });
    });
    if (data.overall.length > 0) {
      md += `## Overall\n\n`;
      ensureIds(data.overall).forEach(e => { md += `- ${e.text} *(${e.author})*\n`; });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = 'SG_MISSION_REVIEW.md'; a.click();
  }

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 15, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>MISSION REVIEW</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {userName && <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>{userName}</span>}
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={exportMarkdown}>
            <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('download') }} /> MD
          </button>
        </div>
      </div>
      {/* 9-5: Search */}
      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        placeholder="投稿を検索..." style={{ width: '100%', marginBottom: 10, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani', fontSize: 13 }} />

      {DAYS.map(day => {
        const isExpanded = expandedDay === day.key;
        const progA = countEntries(`${day.key}_A`);
        const progB = countEntries(`${day.key}_B`);

        return (
          <div key={day.key} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8, overflow: 'hidden' }}>
            <div className="review-day-header" onClick={() => setExpandedDay(isExpanded ? null : day.key)}
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: isExpanded ? 'linear-gradient(135deg, #00e5ff08, #3d8bfd08)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, fontWeight: 600, color: isExpanded ? 'var(--neon-cyan)' : 'var(--text2)', letterSpacing: '.08em' }}>{day.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{day.desc}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: progA > 0 ? 'var(--neon-emerald)' : 'var(--text3)' }}>A:{progA}/4</span>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: progB > 0 ? 'var(--neon-emerald)' : 'var(--text3)' }}>B:{progB}/4</span>
                <span style={{ transform: isExpanded ? 'rotate(180deg)' : '', transition: 'transform .2s', display: 'inline-flex', color: 'var(--text3)' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 16px 16px', animation: 'fadeIn .3s ease' }}>
                <div className="decompress-line" />
                <div style={{ display: 'flex', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', width: 'fit-content' }}>
                  {(['A', 'B'] as const).map(t => (
                    <button key={t} className={`team-tab-${t.toLowerCase()}${activeTeamTab === t ? ' active' : ''}`} onClick={() => setActiveTeamTab(t)} style={{
                      padding: '6px 20px', border: 'none', cursor: 'pointer',
                      fontFamily: 'Rajdhani, sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: '.06em',
                      background: activeTeamTab === t ? undefined : 'var(--bg2)',
                      color: activeTeamTab === t ? undefined : 'var(--text3)',
                      borderRight: t === 'A' ? '1px solid var(--border)' : 'none',
                    }}>TEAM {t}</button>
                  ))}
                </div>

                {FIELDS.map(f => {
                  const dtKey = `${day.key}_${activeTeamTab}`;
                  const dt = data.dayTeams[dtKey] || emptyDayTeamReview();
                  const entries = ensureIds(dt[f.key] || []);
                  const inputKey = `${dtKey}_${f.key}`;

                  return (
                    <div key={f.key} style={{ marginBottom: 14 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                        fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic(f.icon) }} />
                        {f.label}
                        {entries.length > 0 && <span style={{ color: 'var(--neon-emerald)' }}>({entries.length})</span>}
                      </label>
                      {renderEntries(entries,
                        (id) => deleteEntry(dtKey, f.key, id),
                        (id, text) => editEntry(dtKey, f.key, id, text),
                        (id, emoji) => toggleReaction(dtKey, f.key, id, emoji),
                        (id) => pinEntry(dtKey, f.key, id),
                      )}
                      {renderInput(inputKey, f.placeholder, (text) => addEntry(dtKey, f.key, text))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Overall */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-purple)', letterSpacing: '.08em' }}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('clipboard') }} />
          OVERALL MISSION REVIEW
        </label>
        {renderEntries(ensureIds(data.overall), deleteOverall, editOverall, toggleOverallReaction, pinOverall, 'var(--neon-purple)')}
        {renderInput('overall', '出張全体の振り返り、次のアクション\nMarkdown対応', addOverall)}
      </div>
    </div>
  );
}
