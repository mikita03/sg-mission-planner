import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from '../firebase';
import { ic } from '../constants/categories';
import { triggerGlitch } from './Shared';

/** Convert full-width numbers to half-width and parse */
function toNum(v: string): number {
  const hw = v.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^\d.-]/g, '');
  const n = Number(hw);
  return isNaN(n) ? 0 : n;
}

interface BudgetItem {
  id: string;
  category: string;
  name: string;
  unitPrice: number;
  quantity: number;
  currency: 'SGD' | 'JPY';
  actual: number;
}

interface ExpenseEntry {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  currency: 'SGD' | 'JPY';
  paidBy: string;
  photoUrl: string;
  createdAt: number;
}

interface BudgetData {
  items: BudgetItem[];
  rateJPY: number;
  budgetLimit: number;
}

const DEFAULT_RATE = 115;
const DEFAULT_LIMIT = 8000;
const CATEGORIES = ['フライト', 'MRT/交通', 'タクシー', '宿泊', 'ランチ', 'ディナー', '会議室', '通信費', 'その他'];
const STORAGE_KEY = 'sg_mission_budget';

let _idC = Date.now();
function bid() { return 'bud' + (++_idC).toString(36); }

function defaultItems(): BudgetItem[] {
  return [
    { id: bid(), category: 'フライト', name: '往復航空券（1名）', unitPrice: 800, quantity: 4, currency: 'SGD', actual: 0 },
    { id: bid(), category: '宿泊', name: 'ホテル（1泊1室）', unitPrice: 200, quantity: 8, currency: 'SGD', actual: 0 },
    { id: bid(), category: 'タクシー', name: 'Grab（1回平均）', unitPrice: 15, quantity: 16, currency: 'SGD', actual: 0 },
    { id: bid(), category: 'MRT/交通', name: 'MRT（1回平均）', unitPrice: 2, quantity: 20, currency: 'SGD', actual: 0 },
    { id: bid(), category: 'ランチ', name: 'ランチ（1名1食）', unitPrice: 15, quantity: 16, currency: 'SGD', actual: 0 },
    { id: bid(), category: 'ディナー', name: 'ディナー（1名1食）', unitPrice: 50, quantity: 16, currency: 'SGD', actual: 0 },
  ];
}

export function Budget(_props: { userName?: string; isMobile?: boolean }) {
  const [data, setData] = useState<BudgetData>({ items: defaultItems(), rateJPY: DEFAULT_RATE, budgetLimit: DEFAULT_LIMIT });
  const [loaded, setLoaded] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<'SGD' | 'JPY'>('JPY');

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const budgetRef = ref(db, 'budget');
      const unsub = onValue(budgetRef, (snap) => {
        const val = snap.val();
        if (val && val.items) { setData(val); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch {} }
        else { const d = { items: defaultItems(), rateJPY: DEFAULT_RATE, budgetLimit: DEFAULT_LIMIT }; set(budgetRef, d); setData(d); }
        setLoaded(true);
      });
      return () => unsub();
    } else {
      try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setData(JSON.parse(saved)); } catch { /* */ }
      setLoaded(true);
    }
  }, []);

  const save = useCallback((newData: BudgetData) => {
    setData(newData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* */ }
    if (isFirebaseConfigured && db) set(ref(db, 'budget'), newData);
  }, []);

  const updateItem = useCallback((id: string, field: keyof BudgetItem, value: string | number) => {
    save({ ...data, items: data.items.map(item => item.id === id ? { ...item, [field]: value } : item) });
  }, [data, save]);

  const addItem = useCallback(() => {
    save({ ...data, items: [...data.items, { id: bid(), category: 'その他', name: '', unitPrice: 0, quantity: 1, currency: displayCurrency, actual: 0 }] });
  }, [data, save, displayCurrency]);

  const removeItem = useCallback((id: string) => {
    save({ ...data, items: data.items.filter(item => item.id !== id) });
  }, [data, save]);

  const setRate = useCallback((rate: number) => { save({ ...data, rateJPY: rate }); }, [data, save]);

  const toSGD = useCallback((item: BudgetItem) => {
    return item.currency === 'SGD' ? item.unitPrice * item.quantity : (item.unitPrice * item.quantity) / data.rateJPY;
  }, [data.rateJPY]);

  const total = useMemo(() => data.items.reduce((s, item) => s + toSGD(item), 0), [data.items, toSGD]);
  const actualTotal = useMemo(() => data.items.reduce((s, item) => s + (item.actual || 0), 0), [data.items]);
  const variance = total - actualTotal;
  const isOverBudget = data.budgetLimit > 0 && total > data.budgetLimit;

  // 9-2: Dual currency display
  const dualAmount = useCallback((sgd: number) => {
    const s = `S$${sgd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    const j = `¥${Math.round(sgd * data.rateJPY).toLocaleString()}`;
    return displayCurrency === 'SGD' ? <>{s} <span style={{ fontSize: '0.65em', color: 'var(--text3)' }}>({j})</span></> : <>{j} <span style={{ fontSize: '0.65em', color: 'var(--text3)' }}>({s})</span></>;
  }, [displayCurrency, data.rateJPY]);

  // 8-4: Countup animation
  const [displayTotal, setDisplayTotal] = useState(0);
  const animRef = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const start = displayTotal;
    const diff = total - start;
    if (Math.abs(diff) < 1) { setDisplayTotal(total); return; }
    const duration = 600;
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayTotal(start + diff * ease);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
  }, [total]);

  const displayAmount = useCallback((sgd: number) => {
    if (displayCurrency === 'JPY') return `¥${Math.round(sgd * data.rateJPY).toLocaleString()}`;
    return `S$${sgd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }, [displayCurrency, data.rateJPY]);

  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    data.items.forEach(item => { map[item.category] = (map[item.category] || 0) + toSGD(item); });
    return map;
  }, [data.items, toSGD]);

  if (!loaded) return null;

  const inputStyle = {
    padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif', fontSize: 14,
  };

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          BUDGET PLANNER
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)' }}>1 SGD =</span>
          <input type="text" inputMode="decimal" value={data.rateJPY} onChange={e => setRate(toNum(e.target.value))}
            style={{ ...inputStyle, width: 70, textAlign: 'center' as const, fontSize: 13 }} />
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)' }}>JPY</span>
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>上限</span>
          <input type="text" inputMode="decimal" value={data.budgetLimit} onChange={e => save({ ...data, budgetLimit: toNum(e.target.value) })}
            style={{ ...inputStyle, width: 80, textAlign: 'center' as const, fontSize: 13 }} />
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)' }}>SGD</span>
          <button className="btn" style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => {
              const next = displayCurrency === 'SGD' ? 'JPY' : 'SGD';
              // Convert all items to the new currency
              const converted = data.items.map(item => {
                if (item.currency === next) return item; // already in target
                const newPrice = next === 'JPY'
                  ? Math.round(item.unitPrice * data.rateJPY)
                  : Math.round((item.unitPrice / data.rateJPY) * 100) / 100;
                return { ...item, unitPrice: newPrice, currency: next as 'SGD' | 'JPY' };
              });
              save({ ...data, items: converted });
              setDisplayCurrency(next);
              triggerGlitch();
            }}>
            {displayCurrency}
          </button>
        </div>
      </div>

      {/* 8-5: Overage Alert */}
      {isOverBudget && (
        <div className="budget-alert">
          <span style={{ fontSize: 16 }}>⚠</span>
          予算上限 {displayAmount(data.budgetLimit)} を超過しています（{displayAmount(total - data.budgetLimit)} オーバー）
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="info-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="info-label">BUDGET</div>
          <div className="countup" style={{ fontFamily: 'Orbitron, monospace', fontSize: 22, fontWeight: 700, color: isOverBudget ? 'var(--neon-red)' : 'var(--neon-cyan)', textShadow: `0 0 10px ${isOverBudget ? '#ef444440' : '#00e5ff40'}`, letterSpacing: '.04em', marginTop: 4 }}>
            {dualAmount(displayTotal)}
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>÷4 = {displayAmount(displayTotal / 4)}/人</div>
        </div>
        <div className="info-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="info-label">ACTUAL</div>
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 22, fontWeight: 700, color: actualTotal > 0 ? 'var(--neon-emerald)' : 'var(--text3)', textShadow: actualTotal > 0 ? '0 0 10px #10b98140' : 'none', letterSpacing: '.04em', marginTop: 4 }}>
            {dualAmount(actualTotal)}
          </div>
          {actualTotal > 0 && (
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: variance >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)', marginTop: 2 }}>
              差異: {variance >= 0 ? '▼' : '▲'}{displayAmount(Math.abs(variance))}
            </div>
          )}
        </div>
        <div className="info-card" style={{ flex: 2, minWidth: 280 }}>
          <div className="info-label">BY CATEGORY</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 9-3: Donut Chart */}
            {(() => {
              const entries = Object.entries(catTotals).filter(([, v]) => v > 0);
              const colors: Record<string, string> = { 'フライト': '#3d8bfd', 'MRT/交通': '#60a5fa', 'タクシー': '#818cf8', '宿泊': '#a855f7', 'ランチ': '#f59e0b', 'ディナー': '#ef4444', '会議室': '#10b981', '通信費': '#06b6d4', 'その他': '#6b7280' };
              let offset = 0;
              return (
                <>
                  <svg viewBox="0 0 140 140" width="130" height="130" style={{ flexShrink: 0 }}>
                    <circle cx="70" cy="70" r="55" fill="none" stroke="var(--border)" strokeWidth="16" />
                    {entries.map(([cat, val]) => {
                      const pct = total > 0 ? val / total : 0;
                      const circ = 2 * Math.PI * 55;
                      const dash = pct * circ;
                      const gap = circ - dash;
                      const el = <circle key={cat} cx="70" cy="70" r="55" fill="none" stroke={colors[cat] || '#6b7280'} strokeWidth="16" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 4px ${colors[cat] || '#6b7280'})`, transition: 'stroke-dasharray .5s ease' }} />;
                      offset += dash;
                      return el;
                    })}
                    <text x="70" y="66" textAnchor="middle" fill="var(--neon-cyan)" fontFamily="Orbitron" fontSize="14" fontWeight="700">{displayAmount(total)}</text>
                    <text x="70" y="82" textAnchor="middle" fill="var(--text3)" fontFamily="Share Tech Mono" fontSize="10">TOTAL</text>
                  </svg>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    {entries.map(([cat, val]) => {
                      const pct = total > 0 ? (val / total * 100) : 0;
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[cat] || '#6b7280', flexShrink: 0, boxShadow: `0 0 4px ${colors[cat] || '#6b7280'}` }} />
                          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 13, color: 'var(--text)', flex: 1, letterSpacing: '.03em' }}>{cat}</span>
                          <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--neon-cyan)', minWidth: 55, textAlign: 'right', letterSpacing: '.02em' }}>{displayAmount(val)}</span>
                          <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, fontWeight: 700, color: 'var(--text2)', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Items — Table (desktop) / Cards (mobile) */}
      {!_props.isMobile ? (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table className="visit-table" style={{ minWidth: 650 }}>
          <thead>
            <tr>
              <th style={{ width: 130, fontSize: 11 }}>CATEGORY</th>
              <th style={{ fontSize: 11 }}>ITEM</th>
              <th style={{ width: 140, fontSize: 11 }}>UNIT PRICE</th>
              <th style={{ width: 65, fontSize: 11 }}>QTY</th>
              <th style={{ width: 120, fontSize: 11 }}>SUBTOTAL</th>
              <th style={{ width: 100, fontSize: 11 }}>ACTUAL</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => (
              <tr key={item.id}>
                <td>
                  <select value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)}
                    style={{ ...inputStyle, width: '100%', fontSize: 13 }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                    placeholder="項目名" style={{ ...inputStyle, width: '100%' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="text" inputMode="decimal" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', toNum(e.target.value))}
                      style={{ ...inputStyle, flex: 1, textAlign: 'right' as const }} />
                    <span style={{ fontSize: 10, fontFamily: 'Share Tech Mono', color: item.currency === 'JPY' ? 'var(--neon-amber)' : 'var(--neon-cyan)', flexShrink: 0, minWidth: 24, textAlign: 'center' }}>
                      {item.currency === 'JPY' ? '¥' : 'S$'}
                    </span>
                  </div>
                </td>
                <td>
                  <input type="text" inputMode="decimal" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', toNum(e.target.value))}
                    style={{ ...inputStyle, width: '100%', textAlign: 'right' as const }} />
                </td>
                <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 15, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 4px #00e5ff20', letterSpacing: '.03em' }}>
                  {displayAmount(toSGD(item))}
                </td>
                <td>
                  <input type="text" inputMode="decimal" value={item.actual || ''} placeholder="—"
                    onChange={e => updateItem(item.id, 'actual', toNum(e.target.value))}
                    style={{ ...inputStyle, width: '100%', textAlign: 'right' as const, color: (item.actual || 0) > toSGD(item) ? 'var(--neon-red)' : 'var(--neon-emerald)' }} />
                </td>
                <td>
                  <button onClick={() => removeItem(item.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6 }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--neon-red)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
                    <span className="ic" dangerouslySetInnerHTML={{ __html: ic('x') }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--text2)', letterSpacing: '.08em', padding: '12px 10px' }}>
                TOTAL
              </td>
              <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 20, fontWeight: 700, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 8px #00e5ff30', padding: '12px 10px' }}>
                {displayAmount(total)}
              </td>
              <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, fontWeight: 700, color: actualTotal > 0 ? 'var(--neon-emerald)' : 'var(--text3)', textAlign: 'right', padding: '12px 10px' }}>
                {actualTotal > 0 ? displayAmount(actualTotal) : '—'}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      ) : (
      <div className="budget-cards">
        {data.items.map(item => (
          <div key={item.id} className="budget-card">
            <div className="budget-card-header">
              <span className="budget-card-cat">{item.category}</span>
              <span className="budget-card-total">{displayAmount(toSGD(item))}</span>
            </div>
            <div className="budget-card-name">{item.name || '（未入力）'}</div>
            <div className="budget-card-detail">
              {item.unitPrice.toLocaleString()} {item.currency} × {item.quantity}
            </div>
          </div>
        ))}
        <div style={{ padding: '12px 0', fontFamily: 'Orbitron, monospace', fontSize: 16, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 8px #00e5ff30' }}>
          TOTAL: {displayAmount(total)}
        </div>
      </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={addItem}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plus') }} /> ADD ITEM
        </button>
      </div>

      {/* ═══ EXPENSE TRACKER ═══ */}
      <ExpenseTracker userName={_props.userName} rateJPY={data.rateJPY} displayCurrency={displayCurrency} isMobile={_props.isMobile} />
    </div>
  );
}

/* ═══ Expense Tracker Sub-component ═══ */
const EXP_STORAGE_KEY = 'sg_mission_expenses';
const DATE_LABELS = ['Day 0 (出発)', 'Day 1', 'Day 2', 'Day 3', '前泊/その他'];
const DATE_KEYS = ['d0', 'd1', 'd2', 'd3', 'other'];

function ExpenseTracker({ userName, rateJPY, displayCurrency, isMobile }: { userName?: string; rateJPY: number; displayCurrency: 'SGD' | 'JPY'; isMobile?: boolean }) {
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: 'd1', category: 'タクシー', description: '', amount: '', currency: 'SGD' as 'SGD' | 'JPY', paidBy: userName || '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Compress image to max 800px, JPEG 0.7
  function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.7);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  function clearPhoto() { setPhotoFile(null); setPhotoPreview(''); if (fileRef.current) fileRef.current.value = ''; }

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const unsub = onValue(ref(db, 'expenses'), (snap) => {
        const val = snap.val();
        if (val) {
          const arr: ExpenseEntry[] = Array.isArray(val) ? val : Object.values(val);
          setExpenses(arr.filter(e => e && e.id));
          try { localStorage.setItem(EXP_STORAGE_KEY, JSON.stringify(arr)); } catch {}
        }
      });
      return () => unsub();
    } else {
      try { const saved = localStorage.getItem(EXP_STORAGE_KEY); if (saved) setExpenses(JSON.parse(saved)); } catch {}
    }
  }, []);

  function saveExpenses(next: ExpenseEntry[]) {
    setExpenses(next);
    try { localStorage.setItem(EXP_STORAGE_KEY, JSON.stringify(next)); } catch {}
    if (isFirebaseConfigured && db) set(ref(db, 'expenses'), next);
  }

  async function handleSubmit() {
    const amt = toNum(form.amount);
    if (!amt || !form.description.trim()) return;

    setUploading(true);
    let photoUrl = '';

    // Upload photo if selected
    if (photoFile && storage) {
      try {
        const compressed = await compressImage(photoFile);
        const id = 'exp' + (++_idC).toString(36);
        const sRef = storageRef(storage, `receipts/${id}.jpg`);
        await uploadBytes(sRef, compressed, { contentType: 'image/jpeg' });
        photoUrl = await getDownloadURL(sRef);

        if (editId) {
          saveExpenses(expenses.map(e => e.id === editId ? { ...e, date: form.date, category: form.category, description: form.description.trim(), amount: amt, currency: form.currency, paidBy: form.paidBy, photoUrl } : e));
          setEditId(null);
        } else {
          const entry: ExpenseEntry = { id, date: form.date, category: form.category, description: form.description.trim(), amount: amt, currency: form.currency, paidBy: form.paidBy || userName || '不明', photoUrl, createdAt: Date.now() };
          saveExpenses([...expenses, entry]);
        }
      } catch (err) { console.error('Photo upload error:', err); }
    } else {
      if (editId) {
        saveExpenses(expenses.map(e => e.id === editId ? { ...e, date: form.date, category: form.category, description: form.description.trim(), amount: amt, currency: form.currency, paidBy: form.paidBy } : e));
        setEditId(null);
      } else {
        const entry: ExpenseEntry = { id: 'exp' + (++_idC).toString(36), date: form.date, category: form.category, description: form.description.trim(), amount: amt, currency: form.currency, paidBy: form.paidBy || userName || '不明', photoUrl: '', createdAt: Date.now() };
        saveExpenses([...expenses, entry]);
      }
    }

    setForm({ ...form, description: '', amount: '' });
    clearPhoto();
    setShowForm(false);
    setUploading(false);
  }

  function startEdit(e: ExpenseEntry) {
    setForm({ date: e.date, category: e.category, description: e.description, amount: String(e.amount), currency: e.currency, paidBy: e.paidBy });
    setEditId(e.id);
    clearPhoto();
    setShowForm(true);
  }

  async function deleteExpense(id: string) {
    // Try delete photo from storage
    const exp = expenses.find(e => e.id === id);
    if (exp?.photoUrl && storage) {
      try { await deleteObject(storageRef(storage, `receipts/${id}.jpg`)); } catch { /* may not exist */ }
    }
    saveExpenses(expenses.filter(e => e.id !== id));
  }

  // Convert to SGD for totals
  function toSGD(amount: number, currency: 'SGD' | 'JPY') {
    return currency === 'SGD' ? amount : amount / rateJPY;
  }
  function displayAmt(sgd: number) {
    if (displayCurrency === 'JPY') return `¥${Math.round(sgd * rateJPY).toLocaleString()}`;
    return `S$${sgd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  // Per-person totals
  const personTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => {
      const sgd = toSGD(e.amount, e.currency);
      map[e.paidBy] = (map[e.paidBy] || 0) + sgd;
    });
    return map;
  }, [expenses, rateJPY]);

  const totalSGD = useMemo(() => expenses.reduce((s, e) => s + toSGD(e.amount, e.currency), 0), [expenses, rateJPY]);
  const people = Object.keys(personTotals);
  const avgPerPerson = people.length ? totalSGD / people.length : 0;

  // Settlement
  const settlements = useMemo(() => {
    if (people.length < 2) return [];
    const diffs = people.map(p => ({ name: p, diff: personTotals[p] - avgPerPerson }));
    const creditors = diffs.filter(d => d.diff > 0.5).sort((a, b) => b.diff - a.diff);
    const debtors = diffs.filter(d => d.diff < -0.5).sort((a, b) => a.diff - b.diff);
    const result: { from: string; to: string; amount: number }[] = [];
    let ci = 0, di = 0;
    const cr = creditors.map(c => ({ ...c }));
    const dr = debtors.map(d => ({ ...d, diff: -d.diff }));
    while (ci < cr.length && di < dr.length) {
      const amt = Math.min(cr[ci].diff, dr[di].diff);
      if (amt > 0.5) result.push({ from: dr[di].name, to: cr[ci].name, amount: amt });
      cr[ci].diff -= amt;
      dr[di].diff -= amt;
      if (cr[ci].diff < 0.5) ci++;
      if (dr[di].diff < 0.5) di++;
    }
    return result;
  }, [personTotals, avgPerPerson]);

  const inputStyle: React.CSSProperties = { padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani', fontSize: 14, width: '100%' };

  let _idC = Date.now();

  return (
    <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-amber)', letterSpacing: '.1em', margin: 0 }}>
          💳 EXPENSE LOG
        </h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ date: 'd1', category: 'タクシー', description: '', amount: '', currency: 'SGD', paidBy: userName || '' }); }}>
          {showForm ? 'CLOSE' : '+ ADD'}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ padding: 16, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>日付</label>
              <select value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...inputStyle }}>
                {DATE_KEYS.map((k, i) => <option key={k} value={k}>{DATE_LABELS[i]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>カテゴリ</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inputStyle }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>内容</label>
              <input style={inputStyle} value={form.description} placeholder="空港→ホテル Grab" onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>金額</label>
                <input style={inputStyle} type="text" inputMode="decimal" value={form.amount} placeholder="0" onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div style={{ width: 70 }}>
                <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>通貨</label>
                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as 'SGD' | 'JPY' })} style={{ ...inputStyle }}>
                  <option value="SGD">SGD</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>支払者</label>
              <input style={inputStyle} value={form.paidBy} placeholder="名前" onChange={e => setForm({ ...form, paidBy: e.target.value })} />
            </div>
            <div>
              <label style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 2, display: 'block' }}>📷 レシート写真</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect}
                style={{ fontFamily: 'Rajdhani', fontSize: 12, color: 'var(--text2)', width: '100%' }} />
              {photoPreview && (
                <div style={{ marginTop: 6, position: 'relative', display: 'inline-block' }}>
                  <img src={photoPreview} alt="preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border2)' }} />
                  <button onClick={clearPhoto} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--neon-red)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: 10, fontSize: 13 }} onClick={handleSubmit} disabled={uploading || !form.description.trim() || !toNum(form.amount)}>
            {uploading ? 'UPLOADING...' : editId ? 'UPDATE' : 'REGISTER'}
          </button>
        </div>
      )}

      {/* Expense list */}
      {expenses.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="budget-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>日</th>
                  <th>カテゴリ</th>
                  <th>内容</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th>支払者</th>
                  <th style={{ width: 36 }}>📷</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.sort((a, b) => DATE_KEYS.indexOf(a.date) - DATE_KEYS.indexOf(b.date) || a.createdAt - b.createdAt).map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text3)' }}>{e.date.toUpperCase()}</td>
                    <td style={{ fontSize: 11 }}>{e.category}</td>
                    <td>{e.description}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Share Tech Mono', whiteSpace: 'nowrap' }}>
                      {e.currency === 'SGD' ? `S$${e.amount}` : `¥${e.amount.toLocaleString()}`}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{e.paidBy}</td>
                    <td>
                      {e.photoUrl ? (
                        <img src={e.photoUrl} alt="receipt" onClick={() => setViewPhoto(e.photoUrl)}
                          style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border2)', cursor: 'pointer' }} />
                      ) : <span style={{ color: 'var(--text3)', fontSize: 10 }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: 2 }} onClick={() => startEdit(e)}>✏️</button>
                        <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: 2 }} onClick={() => deleteExpense(e.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-person summary */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(people.length, 4)}, 1fr)`, gap: 10 }}>
            {people.map(p => (
              <div key={p} style={{ padding: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{p}</div>
                <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, color: 'var(--text)' }}>{displayAmt(personTotals[p])}</div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: personTotals[p] > avgPerPerson ? 'var(--neon-red)' : 'var(--neon-emerald)', marginTop: 2 }}>
                  {personTotals[p] > avgPerPerson ? `+${displayAmt(personTotals[p] - avgPerPerson)}` : `-${displayAmt(avgPerPerson - personTotals[p])}`}
                </div>
              </div>
            ))}
          </div>

          {/* Settlement */}
          {settlements.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,229,255,.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--neon-cyan)', marginBottom: 8, letterSpacing: '.06em' }}>💸 SETTLEMENT</div>
              {settlements.map((s, i) => (
                <div key={i} style={{ fontFamily: 'Rajdhani', fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  {s.from} → {s.to}: <strong>{displayAmt(s.amount)}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div style={{ marginTop: 12, textAlign: 'right', fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-amber)' }}>
            TOTAL EXPENSES: {displayAmt(totalSGD)}
          </div>
        </>
      )}

      {expenses.length === 0 && !showForm && (
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
          No expenses recorded yet
        </div>
      )}

      {/* Photo viewer modal */}
      {viewPhoto && (
        <div onClick={() => setViewPhoto('')} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={viewPhoto} alt="receipt" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, border: '2px solid var(--neon-cyan)', boxShadow: '0 0 30px rgba(0,229,255,.2)' }} />
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>TAP ANYWHERE TO CLOSE</div>
          </div>
        </div>
      )}
    </div>
  );
}
