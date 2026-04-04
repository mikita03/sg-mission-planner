import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import type { TeamRoster } from '../types';
import { DAYS, ic } from '../constants/categories';

const STORAGE_KEY = 'sg_mission_roster';

function defaultRoster(): TeamRoster {
  const r: TeamRoster = {};
  DAYS.forEach(d => {
    r[`${d.key}_A`] = [];
    r[`${d.key}_B`] = [];
  });
  return r;
}

// Load from localStorage SYNCHRONOUSLY on init (not in useEffect)
function loadFromStorage(): TeamRoster {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const merged = defaultRoster();
        Object.keys(parsed).forEach(k => {
          if (k in merged) merged[k] = Array.isArray(parsed[k]) ? parsed[k] : [];
        });
        return merged;
      }
    }
  } catch { /* */ }
  return defaultRoster();
}

interface Props {
  visibleDays: number[];
}

export function TeamRosterPanel({ visibleDays }: Props) {
  const [roster, setRoster] = useState<TeamRoster>(loadFromStorage); // sync load
  const [editing, setEditing] = useState(false);
  const [editInputs, setEditInputs] = useState<Record<string, string>>({});

  // Firebase sync (updates in background)
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const rRef = ref(db, 'roster');
    const unsub = onValue(rRef, (snap) => {
      const val = snap.val();
      if (val) {
        const merged = defaultRoster();
        Object.keys(val).forEach(k => {
          if (k in merged) merged[k] = Array.isArray(val[k]) ? val[k] : [];
        });
        setRoster(merged);
        // Also update localStorage for next mount
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* */ }
      }
    });
    return () => unsub();
  }, []);

  const save = useCallback((newRoster: TeamRoster) => {
    setRoster(newRoster);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newRoster)); } catch { /* */ }
    if (isFirebaseConfigured && db) {
      set(ref(db, 'roster'), newRoster).catch(() => {});
    }
  }, []);

  const handleSave = useCallback(() => {
    const newRoster = { ...roster };
    Object.keys(editInputs).forEach(key => {
      newRoster[key] = editInputs[key].split(',').map(s => s.trim()).filter(Boolean);
    });
    save(newRoster);
    setEditing(false);
  }, [roster, editInputs, save]);

  const startEdit = useCallback(() => {
    const inputs: Record<string, string> = {};
    Object.keys(roster).forEach(k => {
      inputs[k] = (roster[k] || []).join(', ');
    });
    setEditInputs(inputs);
    setEditing(true);
  }, [roster]);

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '10px 14px', marginBottom: 10, animation: 'fadeIn .4s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 8 : 4 }}>
        <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('user') }} />
          TEAM ROSTER
        </span>
        <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }}
          onClick={editing ? handleSave : startEdit}>
          {editing ? 'SAVE' : 'EDIT'}
        </button>
      </div>

      {!editing ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {visibleDays.map(di => {
            const dayKey = `d${di}`;
            const membersA = roster[`${dayKey}_A`] || [];
            const membersB = roster[`${dayKey}_B`] || [];
            return (
              <div key={di} style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-cyan)', marginBottom: 4, letterSpacing: '.06em' }}>
                  {DAYS[di].label}
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>A:</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{membersA.length > 0 ? membersA.join(', ') : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>B:</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{membersB.length > 0 ? membersB.join(', ') : '—'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {DAYS.map((day, di) => (
            <div key={di} style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-cyan)', marginBottom: 6 }}>
                {day.label}
              </div>
              {(['A', 'B'] as const).map(t => (
                <div key={t} style={{ marginBottom: 6 }}>
                  <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 }}>
                    TEAM {t}
                  </label>
                  <input type="text"
                    value={editInputs[`${day.key}_${t}`] || ''}
                    onChange={e => setEditInputs(prev => ({ ...prev, [`${day.key}_${t}`]: e.target.value }))}
                    placeholder="名前をカンマ区切り"
                    style={{
                      width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border2)',
                      borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif', fontSize: 13,
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
