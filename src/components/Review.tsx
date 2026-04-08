import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { DAYS, ic } from '../constants/categories';
import { MdText } from './MarkdownField';

interface ReviewEntry {
  id: string;
  text: string;
  author: string;
  timestamp: number;
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

// Ensure entries have ids (migration from old data)
function ensureIds(entries: any[]): ReviewEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({ ...e, id: e.id || rid() }));
}

export function Review({ userName }: { userName?: string }) {
  const [data, setData] = useState<ReviewData>(defaultReview());
  const [expandedDay, setExpandedDay] = useState<string | null>('d0');
  const [activeTeamTab, setActiveTeamTab] = useState<'A' | 'B'>('A');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, boolean>>({});

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
                outcomes: ensureIds(src.outcomes),
                improvements: ensureIds(src.improvements),
                sharing: ensureIds(src.sharing),
                freeText: ensureIds(src.freeText),
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
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setData(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const save = useCallback((newData: ReviewData) => {
    setData(newData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch {}
    if (isFirebaseConfigured && db) set(ref(db, 'review_v2'), newData);
  }, []);

  const addEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { id: rid(), text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now() };
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: [...dt[field], entry] } } });
    setInputs(prev => ({ ...prev, [`${dayTeamKey}_${field}`]: '' }));
  }, [data, save, userName]);

  const deleteEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, entryId: string) => {
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    const filtered = (dt[field] || []).filter((e: ReviewEntry) => e.id !== entryId);
    save({ ...data, dayTeams: { ...data.dayTeams, [dayTeamKey]: { ...dt, [field]: filtered } } });
  }, [data, save]);

  const addOverall = useCallback((text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { id: rid(), text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now() };
    save({ ...data, overall: [...data.overall, entry] });
    setInputs(prev => ({ ...prev, overall: '' }));
  }, [data, save, userName]);

  const deleteOverall = useCallback((entryId: string) => {
    save({ ...data, overall: data.overall.filter(e => e.id !== entryId) });
  }, [data, save]);

  const FIELDS: { key: keyof DayTeamReview; label: string; placeholder: string; icon: string }[] = [
    { key: 'outcomes', label: '成果・所感', placeholder: '訪問先での成果、得られた情報、印象など\nMarkdown記法が使えます（**太字**, - リスト）', icon: 'target' },
    { key: 'improvements', label: '改善点', placeholder: '次回への申し送り、改善すべきこと', icon: 'edit' },
    { key: 'sharing', label: 'チーム共有', placeholder: 'チーム全体に共有すべきこと', icon: 'sync' },
    { key: 'freeText', label: '自由メモ', placeholder: 'その他メモ', icon: 'note' },
  ];

  function countEntries(dayTeamKey: string): number {
    const dt = data.dayTeams[dayTeamKey];
    if (!dt) return 0;
    return [dt.outcomes, dt.improvements, dt.sharing, dt.freeText].filter(a => Array.isArray(a) && a.length > 0).length;
  }

  function renderEntries(entries: ReviewEntry[], onDelete: (id: string) => void, borderColor = 'var(--neon-cyan)') {
    if (entries.length === 0) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        {entries.map(e => (
          <div key={e.id || e.timestamp} className="comment-item" style={{ borderLeftColor: borderColor, position: 'relative', paddingRight: 28 }}>
            <div className="comment-author">
              <span>{e.author}</span>
              <span className="comment-time">
                {new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="comment-text"><MdText text={e.text} /></div>
            <button
              onClick={() => onDelete(e.id)}
              style={{
                position: 'absolute', top: 6, right: 6, background: 'none', border: 'none',
                color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: '2px 4px',
                opacity: 0.4, transition: 'opacity .15s',
              }}
              onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')}
              onMouseLeave={ev => (ev.currentTarget.style.opacity = '0.4')}
              title="削除"
            >✕</button>
          </div>
        ))}
      </div>
    );
  }

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
          <textarea
            className="comment-input"
            style={{ width: '100%', minHeight: 50, resize: 'vertical', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, display: 'block' }}
            value={val}
            placeholder={placeholder}
            onChange={e => setInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (val.trim()) { onPost(val); setPreviews(prev => ({ ...prev, [inputKey]: false })); }
              }
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text3)' }}>
            Enter: 投稿 / Shift+Enter: 改行 / Markdown対応
          </span>
          <button className="comment-send" onClick={() => { if (val.trim()) { onPost(val); setPreviews(prev => ({ ...prev, [inputKey]: false })); } }}
            disabled={!val.trim()}>POST</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 15, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          MISSION REVIEW
        </div>
        {userName && (
          <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>
            Posting as {userName}
          </div>
        )}
      </div>

      {/* Day Sections */}
      {DAYS.map(day => {
        const isExpanded = expandedDay === day.key;
        const progA = countEntries(`${day.key}_A`);
        const progB = countEntries(`${day.key}_B`);

        return (
          <div key={day.key} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            marginBottom: 8, overflow: 'hidden',
          }}>
            <div className="review-day-header" onClick={() => setExpandedDay(isExpanded ? null : day.key)}
              style={{
                padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: isExpanded ? 'linear-gradient(135deg, #00e5ff08, #3d8bfd08)' : 'transparent',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: 13, fontWeight: 600,
                  color: isExpanded ? 'var(--neon-cyan)' : 'var(--text2)', letterSpacing: '.08em',
                }}>{day.label}</span>
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

                {/* Team Toggle */}
                <div style={{ display: 'flex', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', width: 'fit-content' }}>
                  {(['A', 'B'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTeamTab(t)} style={{
                      padding: '6px 20px', border: 'none', cursor: 'pointer',
                      fontFamily: 'Rajdhani, sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: '.06em',
                      background: activeTeamTab === t ? 'linear-gradient(135deg, #00e5ff15, #3d8bfd15)' : 'var(--bg2)',
                      color: activeTeamTab === t ? 'var(--neon-cyan)' : 'var(--text3)',
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
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                        fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)',
                        textTransform: 'uppercase', letterSpacing: '.08em',
                      }}>
                        <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic(f.icon) }} />
                        {f.label}
                        {entries.length > 0 && <span style={{ color: 'var(--neon-emerald)' }}>({entries.length})</span>}
                      </label>

                      {renderEntries(entries, (entryId) => deleteEntry(dtKey, f.key, entryId))}
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
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-purple)', letterSpacing: '.08em',
        }}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('clipboard') }} />
          OVERALL MISSION REVIEW
        </label>

        {renderEntries(ensureIds(data.overall), deleteOverall, 'var(--neon-purple)')}
        {renderInput('overall', '出張全体の振り返り、次のアクション\nMarkdown記法が使えます', addOverall)}
      </div>
    </div>
  );
}
