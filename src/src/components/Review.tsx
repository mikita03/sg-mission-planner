import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { DAYS, ic } from '../constants/categories';

interface DayReview {
  outcomes: string;    // 訪問の成果・所感
  improvements: string; // 改善点・次回への申し送り
  sharing: string;     // チームへの共有事項
  freeText: string;    // 自由記述
}

interface ReviewData {
  days: Record<string, DayReview>;
  overall: string;
}

const STORAGE_KEY = 'sg_mission_review';

function emptyDayReview(): DayReview {
  return { outcomes: '', improvements: '', sharing: '', freeText: '' };
}

function defaultReview(): ReviewData {
  const days: Record<string, DayReview> = {};
  DAYS.forEach(d => { days[d.key] = emptyDayReview(); });
  return { days, overall: '' };
}

export function Review({ userName }: { userName?: string }) {
  const [data, setData] = useState<ReviewData>(defaultReview());
  const [loaded, setLoaded] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>('d0');

  // Load
  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const revRef = ref(db, 'review');
      const unsub = onValue(revRef, (snap) => {
        const val = snap.val();
        if (val && val.days) {
          // Merge with defaults to ensure all keys exist
          const merged = defaultReview();
          Object.keys(val.days || {}).forEach(k => {
            if (merged.days[k]) {
              merged.days[k] = { ...merged.days[k], ...val.days[k] };
            }
          });
          merged.overall = val.overall || '';
          setData(merged);
        } else {
          const d = defaultReview();
          set(revRef, d);
          setData(d);
        }
        setLoaded(true);
      });
      return () => unsub();
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const merged = defaultReview();
          Object.keys(parsed.days || {}).forEach(k => {
            if (merged.days[k]) merged.days[k] = { ...merged.days[k], ...parsed.days[k] };
          });
          merged.overall = parsed.overall || '';
          setData(merged);
        }
      } catch { /* ignore */ }
      setLoaded(true);
    }
  }, []);

  // Save
  const save = useCallback((newData: ReviewData) => {
    setData(newData);
    if (isFirebaseConfigured && db) {
      set(ref(db, 'review'), newData);
    } else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* */ }
    }
  }, []);

  const updateDayField = useCallback((dayKey: string, field: keyof DayReview, value: string) => {
    const newData = {
      ...data,
      days: { ...data.days, [dayKey]: { ...data.days[dayKey], [field]: value } },
    };
    save(newData);
  }, [data, save]);

  const updateOverall = useCallback((value: string) => {
    save({ ...data, overall: value });
  }, [data, save]);

  if (!loaded) return null;

  const FIELDS: { key: keyof DayReview; label: string; placeholder: string; icon: string }[] = [
    { key: 'outcomes', label: 'OUTCOMES / 成果・所感', placeholder: '訪問先での成果、得られた情報、印象など', icon: 'target' },
    { key: 'improvements', label: 'IMPROVEMENTS / 改善点', placeholder: '次回への申し送り、改善すべきこと', icon: 'edit' },
    { key: 'sharing', label: 'TEAM SHARING / 共有事項', placeholder: 'チーム全体に共有すべきこと', icon: 'sync' },
    { key: 'freeText', label: 'FREE NOTES / 自由記述', placeholder: 'その他メモ', icon: 'note' },
  ];

  // Count non-empty fields per day
  function dayProgress(dayKey: string): number {
    const dr = data.days[dayKey];
    if (!dr) return 0;
    return [dr.outcomes, dr.improvements, dr.sharing, dr.freeText].filter(v => v.trim()).length;
  }

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          MISSION REVIEW
        </div>
        <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>
          {userName && `Editing as ${userName}`}
        </div>
      </div>

      {/* Day Sections */}
      {DAYS.map(day => {
        const isExpanded = expandedDay === day.key;
        const prog = dayProgress(day.key);
        const dr = data.days[day.key] || emptyDayReview();

        return (
          <div key={day.key} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            marginBottom: 8, overflow: 'hidden', transition: 'all .3s',
          }}>
            {/* Day Header (clickable) */}
            <div
              onClick={() => setExpandedDay(isExpanded ? null : day.key)}
              className="review-day-header"
              style={{
                padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', transition: 'background .15s',
                background: isExpanded ? 'linear-gradient(135deg, #00e5ff08, #3d8bfd08)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: 12, fontWeight: 600,
                  color: isExpanded ? 'var(--neon-cyan)' : 'var(--text2)', letterSpacing: '.08em',
                  transition: 'color .2s',
                }}>
                  {day.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{day.desc}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: 'Share Tech Mono', fontSize: 10,
                  color: prog === 4 ? 'var(--neon-emerald)' : prog > 0 ? 'var(--neon-amber)' : 'var(--text3)',
                }}>
                  {prog}/4 FIELDS
                </span>
                {/* Mini energy bar */}
                <div style={{ width: 40, height: 3, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div className={prog > 0 ? 'energy-bar' : ''} style={{
                    width: `${prog / 4 * 100}%`, height: '100%', borderRadius: 3, transition: 'width .4s',
                    background: prog === 4 ? 'var(--neon-emerald)' : 'var(--neon-amber)',
                  }} />
                </div>
                <span style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform .2s', display: 'inline-flex', color: 'var(--text3)',
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Day Content (collapsible) */}
            {isExpanded && (
              <div style={{ padding: '0 16px 16px', animation: 'fadeIn .3s ease' }}>
                {/* Decompress flash line */}
                <div className="decompress-line" key={day.key + '-flash'} />
                {FIELDS.map(f => (
                  <div key={f.key} style={{ marginBottom: 12 }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                      fontFamily: 'Share Tech Mono, monospace', fontSize: 10, color: 'var(--text3)',
                      textTransform: 'uppercase', letterSpacing: '.08em',
                    }}>
                      <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic(f.icon) }} />
                      {f.label}
                    </label>
                    <textarea
                      value={dr[f.key]}
                      onChange={e => updateDayField(day.key, f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      style={{
                        width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border2)',
                        borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif',
                        fontSize: 13, resize: 'vertical', minHeight: 50, transition: 'border-color .2s',
                      }}
                      onFocus={e => (e.target.style.borderColor = 'var(--neon-cyan)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Overall Review */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 16, marginTop: 4,
      }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          fontFamily: 'Orbitron, monospace', fontSize: 11, color: 'var(--neon-purple)',
          letterSpacing: '.08em',
        }}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('clipboard') }} />
          OVERALL MISSION REVIEW
        </label>
        <textarea
          value={data.overall}
          onChange={e => updateOverall(e.target.value)}
          placeholder="出張全体の振り返り、次のアクション、全体所感など"
          rows={5}
          style={{
            width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border2)',
            borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif',
            fontSize: 13, resize: 'vertical', minHeight: 80, transition: 'border-color .2s',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--neon-purple)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
        />
      </div>
    </div>
  );
}
