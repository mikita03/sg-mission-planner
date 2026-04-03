import { useState, useEffect, useCallback, useMemo } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { ic } from '../constants/categories';
import { triggerGlitch } from './Shared';

interface BudgetItem {
  id: string;
  category: string;
  name: string;
  unitPrice: number;
  quantity: number;
  currency: 'SGD' | 'JPY';
}

interface BudgetData {
  items: BudgetItem[];
  rateJPY: number; // 1 SGD = X JPY
}

const DEFAULT_RATE = 115;
const CATEGORIES = ['フライト', 'MRT/交通', 'タクシー', '宿泊', 'ランチ', 'ディナー', '会議室', '通信費', 'その他'];
const STORAGE_KEY = 'sg_mission_budget';

let _idC = Date.now();
function bid() { return 'bud' + (++_idC).toString(36); }

function defaultItems(): BudgetItem[] {
  return [
    { id: bid(), category: 'フライト', name: '往復航空券（1名）', unitPrice: 800, quantity: 4, currency: 'SGD' },
    { id: bid(), category: '宿泊', name: 'ホテル（1泊1室）', unitPrice: 200, quantity: 8, currency: 'SGD' },
    { id: bid(), category: 'タクシー', name: 'Grab（1回平均）', unitPrice: 15, quantity: 16, currency: 'SGD' },
    { id: bid(), category: 'MRT/交通', name: 'MRT（1回平均）', unitPrice: 2, quantity: 20, currency: 'SGD' },
    { id: bid(), category: 'ランチ', name: 'ランチ（1名1食）', unitPrice: 15, quantity: 16, currency: 'SGD' },
    { id: bid(), category: 'ディナー', name: 'ディナー（1名1食）', unitPrice: 50, quantity: 16, currency: 'SGD' },
  ];
}

export function Budget(_props: { userName?: string }) {
  const [data, setData] = useState<BudgetData>({ items: defaultItems(), rateJPY: DEFAULT_RATE });
  const [loaded, setLoaded] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<'SGD' | 'JPY'>('SGD');

  // Load
  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const budgetRef = ref(db, 'budget');
      const unsub = onValue(budgetRef, (snap) => {
        const val = snap.val();
        if (val && val.items) {
          setData(val);
        } else {
          const d = { items: defaultItems(), rateJPY: DEFAULT_RATE };
          set(budgetRef, d);
          setData(d);
        }
        setLoaded(true);
      });
      return () => unsub();
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) { setData(JSON.parse(saved)); }
      } catch { /* ignore */ }
      setLoaded(true);
    }
  }, []);

  // Save
  const save = useCallback((newData: BudgetData) => {
    setData(newData);
    if (isFirebaseConfigured && db) {
      set(ref(db, 'budget'), newData);
    } else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* */ }
    }
  }, []);

  const updateItem = useCallback((id: string, field: keyof BudgetItem, value: string | number) => {
    save({ ...data, items: data.items.map(item => item.id === id ? { ...item, [field]: value } : item) });
  }, [data, save]);

  const addItem = useCallback(() => {
    save({ ...data, items: [...data.items, { id: bid(), category: 'その他', name: '', unitPrice: 0, quantity: 1, currency: 'SGD' }] });
  }, [data, save]);

  const removeItem = useCallback((id: string) => {
    save({ ...data, items: data.items.filter(item => item.id !== id) });
  }, [data, save]);

  const setRate = useCallback((rate: number) => {
    save({ ...data, rateJPY: rate });
  }, [data, save]);

  // Calculations
  const toSGD = useCallback((item: BudgetItem) => {
    return item.currency === 'SGD' ? item.unitPrice * item.quantity : (item.unitPrice * item.quantity) / data.rateJPY;
  }, [data.rateJPY]);

  const total = useMemo(() => data.items.reduce((s, item) => s + toSGD(item), 0), [data.items, toSGD]);
  const perPerson = total / 4;

  const displayAmount = useCallback((sgd: number) => {
    if (displayCurrency === 'JPY') return `¥${Math.round(sgd * data.rateJPY).toLocaleString()}`;
    return `S$${sgd.toFixed(2)}`;
  }, [displayCurrency, data.rateJPY]);

  // Category subtotals
  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    data.items.forEach(item => {
      map[item.category] = (map[item.category] || 0) + toSGD(item);
    });
    return map;
  }, [data.items, toSGD]);

  if (!loaded) return null;

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          BUDGET PLANNER
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 10, color: 'var(--text3)' }}>
            1 SGD = 
          </span>
          <input type="number" value={data.rateJPY} onChange={e => setRate(Number(e.target.value))}
            style={{
              width: 60, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border2)',
              borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Share Tech Mono',
              fontSize: 12, textAlign: 'center',
            }} />
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 10, color: 'var(--text3)' }}>JPY</span>
          <button className="btn" style={{ padding: '4px 12px' }}
            onClick={() => { setDisplayCurrency(prev => prev === 'SGD' ? 'JPY' : 'SGD'); triggerGlitch(); }}>
            {displayCurrency}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="info-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="info-label">Total</div>
          <div className="info-value" style={{ fontSize: 18 }}>{displayAmount(total)}</div>
        </div>
        <div className="info-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="info-label">Per Person (÷4)</div>
          <div className="info-value" style={{ fontSize: 18 }}>{displayAmount(perPerson)}</div>
        </div>
        <div className="info-card" style={{ flex: 2, minWidth: 200 }}>
          <div className="info-label">By Category</div>
          <div style={{ marginTop: 6 }}>
            {Object.entries(catTotals).map(([cat, val]) => {
              const pct = total > 0 ? (val / total * 100) : 0;
              const barClass = ['フライト','MRT/交通','タクシー'].includes(cat) ? 'cat-transport'
                : cat === '宿泊' ? 'cat-stay'
                : ['ランチ','ディナー'].includes(cat) ? 'cat-food' : 'cat-other';
              return (
                <div key={cat} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text2)' }}>
                    <span>{cat}</span>
                    <span style={{ color: 'var(--neon-cyan)' }}>{displayAmount(val)}</span>
                  </div>
                  <div className="neon-bar-track">
                    <div className={`neon-bar-fill ${barClass}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table className="visit-table" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Category</th>
              <th>Item</th>
              <th style={{ width: 100 }}>Unit Price</th>
              <th style={{ width: 60 }}>Cur.</th>
              <th style={{ width: 60 }}>Qty</th>
              <th style={{ width: 100 }}>Subtotal</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => (
              <tr key={item.id}>
                <td>
                  <select value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)}
                    style={{ width: '100%', padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                    placeholder="項目名"
                    style={{ width: '100%', padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </td>
                <td>
                  <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                    style={{ width: '100%', padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontSize: 12, textAlign: 'right' }} />
                </td>
                <td>
                  <select value={item.currency} onChange={e => updateItem(item.id, 'currency', e.target.value)}
                    style={{ width: '100%', padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontSize: 11 }}>
                    <option value="SGD">SGD</option>
                    <option value="JPY">JPY</option>
                  </select>
                </td>
                <td>
                  <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))}
                    style={{ width: '100%', padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontSize: 12, textAlign: 'right' }} />
                </td>
                <td style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--neon-cyan)', textAlign: 'right' }}>
                  {displayAmount(toSGD(item))}
                </td>
                <td>
                  <button onClick={() => removeItem(item.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, transition: 'color .15s' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--neon-red)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--text3)'}>
                    <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('x') }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'Orbitron, monospace', fontSize: 11, color: 'var(--text2)', letterSpacing: '.06em' }}>
                TOTAL
              </td>
              <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 6px #00e5ff30' }}>
                {displayAmount(total)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="btn" onClick={addItem}>
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plus') }} /> ADD ITEM
        </button>
      </div>
    </div>
  );
}
