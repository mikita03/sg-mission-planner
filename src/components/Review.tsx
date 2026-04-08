import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { DAYS, ic } from '../constants/categories';
import { MdText } from './MarkdownField';

interface ReviewEntry {
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
  dayTeams: Record<string, DayTeamReview>;  // key: "d0_A", "d0_B" etc.
  overall: ReviewEntry[];
}

const STORAGE_KEY = 'sg_mission_review_v2';

function emptyDayTeamReview(): DayTeamReview {
  return { outcomes: [], improvements: [], sharing: [], freeText: [] };
}

function defaultReview(): ReviewData {
  const dayTeams: Record<string, DayTeamReview> = {};
  DAYS.forEach(d => {
    dayTeams[`${d.key}_A`] = emptyDayTeamReview();
    dayTeams[`${d.key}_B`] = emptyDayTeamReview();
  });
  return { dayTeams, overall: [] };
}

export function Review({ userName }: { userName?: string }) {
  const [data, setData] = useState<ReviewData>(defaultReview());
  const [expandedDay, setExpandedDay] = useState<string | null>('d0');
  const [activeTeamTab, setActiveTeamTab] = useState<'A' | 'B'>('A');
  const [inputs, setInputs] = useState<Record<string, string>>({});

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
                outcomes: Array.isArray(src.outcomes) ? src.outcomes : [],
                improvements: Array.isArray(src.improvements) ? src.improvements : [],
                sharing: Array.isArray(src.sharing) ? src.sharing : [],
                freeText: Array.isArray(src.freeText) ? src.freeText : [],
              };
            }
          });
          merged.overall = Array.isArray(val.overall) ? val.overall : [];
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
      } catch { /* */ }
    }
  }, []);

  const save = useCallback((newData: ReviewData) => {
    setData(newData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* */ }
    if (isFirebaseConfigured && db) {
      set(ref(db, 'review_v2'), newData);
    }
  }, []);

  const addEntry = useCallback((dayTeamKey: string, field: keyof DayTeamReview, text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now() };
    const dt = data.dayTeams[dayTeamKey] || emptyDayTeamReview();
    save({
      ...data,
      dayTeams: {
        ...data.dayTeams,
        [dayTeamKey]: { ...dt, [field]: [...dt[field], entry] },
      },
    });
    setInputs(prev => ({ ...prev, [`${dayTeamKey}_${field}`]: '' }));
  }, [data, save, userName]);

  const addOverall = useCallback((text: string) => {
    if (!text.trim()) return;
    const entry: ReviewEntry = { text: text.trim(), author: userName || 'Anonymous', timestamp: Date.now() };
    save({ ...data, overall: [...data.overall, entry] });
    setInputs(prev => ({ ...prev, overall: '' }));
  }, [data, save, userName]);

  const FIELDS: { key: keyof DayTeamReview; label: string; placeholder: string; icon: string }[] = [
    { key: 'outcomes', label: '成果・所感', placeholder: '訪問先での成果、得られた情報、印象など', icon: 'target' },
    { key: 'improvements', label: '改善点', placeholder: '次回への申し送り、改善すべきこと', icon: 'edit' },
    { key: 'sharing', label: 'チーム共有', placeholder: 'チーム全体に共有すべきこと', icon: 'sync' },
    { key: 'freeText', label: '自由メモ', placeholder: 'その他メモ', icon: 'note' },
  ];

  function countEntries(dayTeamKey: string): number {
    const dt = data.dayTeams[dayTeamKey];
    if (!dt) return 0;
    return [dt.outcomes, dt.improvements, dt.sharing, dt.freeText].filter(a => Array.isArray(a) && a.length > 0).length;
  }

  function renderEntries(entries: ReviewEntry[]) {
    if (entries.length === 0) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        {entries.map((e, i) => (
          <div key={i} className="comment-item" style={{ borderLeftColor: 'var(--neon-cyan)' }}>
            <div className="comment-author">
              <span>{e.author}</span>
              <span className="comment-time">
                {new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="comment-text"><MdText text={e.text} /></div>
          </div>
        ))}
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
            {/* Day Header */}
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

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: '0 16px 16px', animation: 'fadeIn .3s ease' }}>
                <div className="decompress-line" />

                {/* Team A/B Toggle */}
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

                {/* Fields */}
                {FIELDS.map(f => {
                  const dtKey = `${day.key}_${activeTeamTab}`;
                  const dt = data.dayTeams[dtKey] || emptyDayTeamReview();
                  const entries = (Array.isArray(dt[f.key]) ? dt[f.key] : []) as ReviewEntry[];
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

                      {renderEntries(entries)}

                      <div className="comment-input-wrap">
                        <input
                          className="comment-input"
                          type="text"
                          value={inputs[inputKey] || ''}
                          placeholder={f.placeholder}
                          onChange={e => setInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addEntry(dtKey, f.key, inputs[inputKey] || ''); }}
                        />
                        <button className="comment-send" onClick={() => addEntry(dtKey, f.key, inputs[inputKey] || '')}
                          disabled={!(inputs[inputKey] || '').trim()}>POST</button>
                      </div>
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

        {data.overall.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {data.overall.map((e, i) => (
              <div key={i} className="comment-item" style={{ borderLeftColor: 'var(--neon-purple)' }}>
                <div className="comment-author"><span>{e.author}</span>
                  <span className="comment-time">{new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="comment-text"><MdText text={e.text} /></div>
              </div>
            ))}
          </div>
        )}

        <div className="comment-input-wrap">
          <input className="comment-input" type="text" value={inputs['overall'] || ''}
            placeholder="出張全体の振り返り、次のアクション"
            onChange={e => setInputs(prev => ({ ...prev, overall: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addOverall(inputs['overall'] || ''); }} />
          <button className="comment-send" onClick={() => addOverall(inputs['overall'] || '')}
            disabled={!(inputs['overall'] || '').trim()}>POST</button>
        </div>
      </div>
    </div>
  );
}
