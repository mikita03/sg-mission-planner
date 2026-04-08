import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { ic } from '../constants/categories';
import { triggerGlitch } from './Shared';

const BUDGET_LIMIT_SGD = 8000; // overage threshold

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
  rateJPY: number;
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

export function Budget(_props: { userName?: string; isMobile?: boolean }) {
  const [data, setData] = useState<BudgetData>({ items: defaultItems(), rateJPY: DEFAULT_RATE });
  const [loaded, setLoaded] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<'SGD' | 'JPY'>('SGD');

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const budgetRef = ref(db, 'budget');
      const unsub = onValue(budgetRef, (snap) => {
        const val = snap.val();
        if (val && val.items) { setData(val); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch {} }
        else { const d = { items: defaultItems(), rateJPY: DEFAULT_RATE }; set(budgetRef, d); setData(d); }
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
    save({ ...data, items: [...data.items, { id: bid(), category: 'その他', name: '', unitPrice: 0, quantity: 1, currency: 'SGD' }] });
  }, [data, save]);

  const removeItem = useCallback((id: string) => {
    save({ ...data, items: data.items.filter(item => item.id !== id) });
  }, [data, save]);

  const setRate = useCallback((rate: number) => { save({ ...data, rateJPY: rate }); }, [data, save]);

  const toSGD = useCallback((item: BudgetItem) => {
    return item.currency === 'SGD' ? item.unitPrice * item.quantity : (item.unitPrice * item.quantity) / data.rateJPY;
  }, [data.rateJPY]);

  const total = useMemo(() => data.items.reduce((s, item) => s + toSGD(item), 0), [data.items, toSGD]);
  const perPerson = total / 4;
  const isOverBudget = total > BUDGET_LIMIT_SGD;

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)' }}>1 SGD =</span>
          <input type="number" value={data.rateJPY} onChange={e => setRate(Number(e.target.value))}
            style={{ ...inputStyle, width: 70, textAlign: 'center' as const, fontSize: 13 }} />
          <span style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text3)' }}>JPY</span>
          <button className="btn" style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => { setDisplayCurrency(prev => prev === 'SGD' ? 'JPY' : 'SGD'); triggerGlitch(); }}>
            {displayCurrency}
          </button>
        </div>
      </div>

      {/* 8-5: Overage Alert */}
      {isOverBudget && (
        <div className="budget-alert">
          <span style={{ fontSize: 16 }}>⚠</span>
          予算上限 {displayAmount(BUDGET_LIMIT_SGD)} を超過しています（{displayAmount(total - BUDGET_LIMIT_SGD)} オーバー）
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="info-card" style={{ flex: 1, minWidth: 140 }}>
          <div className="info-label">TOTAL</div>
          <div className="countup" style={{ fontFamily: 'Orbitron, monospace', fontSize: 24, fontWeight: 700, color: isOverBudget ? 'var(--neon-red)' : 'var(--neon-cyan)', textShadow: `0 0 10px ${isOverBudget ? '#ef444440' : '#00e5ff40'}`, letterSpacing: '.04em', marginTop: 4 }}>
            {displayAmount(displayTotal)}
          </div>
        </div>
        <div className="info-card" style={{ flex: 1, minWidth: 140 }}>
          <div className="info-label">PER PERSON (÷4)</div>
          <div className="countup" style={{ fontFamily: 'Orbitron, monospace', fontSize: 24, fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 10px #00e5ff40', letterSpacing: '.04em', marginTop: 4 }}>
            {displayAmount(displayTotal / 4)}
          </div>
        </div>
        <div className="info-card" style={{ flex: 2, minWidth: 220 }}>
          <div className="info-label">BY CATEGORY</div>
          <div style={{ marginTop: 8 }}>
            {Object.entries(catTotals).map(([cat, val]) => {
              const pct = total > 0 ? (val / total * 100) : 0;
              const barClass = ['フライト','MRT/交通','タクシー'].includes(cat) ? 'cat-transport'
                : cat === '宿泊' ? 'cat-stay'
                : ['ランチ','ディナー'].includes(cat) ? 'cat-food' : 'cat-other';
              return (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
                    <span>{cat}</span>
                    <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--neon-cyan)' }}>{displayAmount(val)}</span>
                  </div>
                  <div className="neon-bar-track"><div className={`neon-bar-fill ${barClass}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
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
              <th style={{ width: 110, fontSize: 11 }}>UNIT PRICE</th>
              <th style={{ width: 65, fontSize: 11 }}>CUR.</th>
              <th style={{ width: 65, fontSize: 11 }}>QTY</th>
              <th style={{ width: 120, fontSize: 11 }}>SUBTOTAL</th>
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
                  <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                    style={{ ...inputStyle, width: '100%', textAlign: 'right' as const }} />
                </td>
                <td>
                  <select value={item.currency} onChange={e => updateItem(item.id, 'currency', e.target.value)}
                    style={{ ...inputStyle, width: '100%', fontSize: 13 }}>
                    <option value="SGD">SGD</option><option value="JPY">JPY</option>
                  </select>
                </td>
                <td>
                  <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))}
                    style={{ ...inputStyle, width: '100%', textAlign: 'right' as const }} />
                </td>
                <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 15, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 4px #00e5ff20', letterSpacing: '.03em' }}>
                  {displayAmount(toSGD(item))}
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
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'Orbitron, monospace', fontSize: 13, color: 'var(--text2)', letterSpacing: '.08em', padding: '12px 10px' }}>
                TOTAL
              </td>
              <td style={{ fontFamily: 'Orbitron, monospace', fontSize: 20, fontWeight: 700, color: 'var(--neon-cyan)', textAlign: 'right', textShadow: '0 0 8px #00e5ff30', padding: '12px 10px' }}>
                {displayAmount(total)}
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
    </div>
  );
}
