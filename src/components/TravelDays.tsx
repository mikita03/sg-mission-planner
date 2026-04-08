import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase';
import { ic } from '../constants/categories';

export interface TravelDayData {
  arrival: {
    flight: string;     // e.g. "SQ637"
    departure: string;  // e.g. "NRT 18:00"
    arrivalTime: string; // e.g. "SIN 23:30"
    hotel: string;
    hotelCI: string;    // check-in time
    memo: string;
  };
  departure: {
    hotelCO: string;    // check-out time
    flight: string;
    departure: string;
    arrivalTime: string;
    memo: string;
  };
}

const STORAGE_KEY = 'sg_mission_travel';

function defaultTravel(): TravelDayData {
  return {
    arrival: { flight: '', departure: 'NRT 18:00', arrivalTime: 'SIN 23:30', hotel: '', hotelCI: '24:00', memo: '' },
    departure: { hotelCO: '08:00', flight: '', departure: 'SIN 24:00', arrivalTime: 'NRT（翌日）', memo: '' },
  };
}

function loadFromStorage(): TravelDayData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...defaultTravel(), ...JSON.parse(saved) };
  } catch { /* */ }
  return defaultTravel();
}

export function TravelDays() {
  const [data, setData] = useState<TravelDayData>(loadFromStorage);
  const [editArrival, setEditArrival] = useState(false);
  const [editDeparture, setEditDeparture] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const unsub = onValue(ref(db, 'travel'), (snap) => {
      const val = snap.val();
      if (val) {
        setData({ ...defaultTravel(), ...val });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch { /* */ }
      }
    });
    return () => unsub();
  }, []);

  const save = useCallback((newData: TravelDayData) => {
    setData(newData);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* */ }
    if (isFirebaseConfigured && db) set(ref(db, 'travel'), newData).catch(() => {});
  }, []);

  const updateArrival = (field: string, value: string) => {
    save({ ...data, arrival: { ...data.arrival, [field]: value } });
  };
  const updateDeparture = (field: string, value: string) => {
    save({ ...data, departure: { ...data.departure, [field]: value } });
  };

  const inputStyle = {
    padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani, sans-serif',
    fontSize: 13, width: '100%',
  };

  return (
    <div className="travel-grid" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12,
      animation: 'fadeIn .4s ease',
    }}>
      {/* Arrival Card */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '10px 14px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--neon-cyan), transparent)', opacity: 0.5 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plane') }} />
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
              5/17 SUN — ARRIVAL
            </span>
          </div>
          <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={() => setEditArrival(!editArrival)}>{editArrival ? 'DONE' : 'EDIT'}</button>
        </div>

        {!editArrival ? (
          <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text2)', lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>✈</span>{data.arrival.departure} → {data.arrival.arrivalTime}</div>
            {data.arrival.flight && <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>便</span>{data.arrival.flight}</div>}
            <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>🏨</span>{data.arrival.hotel || '未定'} CI {data.arrival.hotelCI}</div>
            {data.arrival.memo && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>{data.arrival.memo}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={data.arrival.departure} placeholder="出発 (NRT 18:00)" onChange={e => updateArrival('departure', e.target.value)} />
              <input style={inputStyle} value={data.arrival.arrivalTime} placeholder="到着 (SIN 23:30)" onChange={e => updateArrival('arrivalTime', e.target.value)} />
            </div>
            <input style={inputStyle} value={data.arrival.flight} placeholder="便名 (SQ637)" onChange={e => updateArrival('flight', e.target.value)} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={data.arrival.hotel} placeholder="ホテル名" onChange={e => updateArrival('hotel', e.target.value)} />
              <input style={{ ...inputStyle, width: 80 }} value={data.arrival.hotelCI} placeholder="CI時刻" onChange={e => updateArrival('hotelCI', e.target.value)} />
            </div>
            <input style={inputStyle} value={data.arrival.memo} placeholder="メモ" onChange={e => updateArrival('memo', e.target.value)} />
          </div>
        )}
      </div>

      {/* Departure Card */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '10px 14px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--neon-purple), transparent)', opacity: 0.5 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic('plane') }} />
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 12, color: 'var(--neon-purple)', letterSpacing: '.08em' }}>
              5/22 FRI — DEPARTURE
            </span>
          </div>
          <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={() => setEditDeparture(!editDeparture)}>{editDeparture ? 'DONE' : 'EDIT'}</button>
        </div>

        {!editDeparture ? (
          <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text2)', lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>🏨</span>CO {data.departure.hotelCO}</div>
            <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>✈</span>{data.departure.departure} → {data.departure.arrivalTime}</div>
            {data.departure.flight && <div><span style={{ color: 'var(--text3)', marginRight: 8 }}>便</span>{data.departure.flight}</div>}
            {data.departure.memo && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>{data.departure.memo}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <input style={inputStyle} value={data.departure.hotelCO} placeholder="チェックアウト時刻" onChange={e => updateDeparture('hotelCO', e.target.value)} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={data.departure.departure} placeholder="出発 (SIN 10:00)" onChange={e => updateDeparture('departure', e.target.value)} />
              <input style={inputStyle} value={data.departure.arrivalTime} placeholder="到着 (NRT 18:00)" onChange={e => updateDeparture('arrivalTime', e.target.value)} />
            </div>
            <input style={inputStyle} value={data.departure.flight} placeholder="便名" onChange={e => updateDeparture('flight', e.target.value)} />
            <input style={inputStyle} value={data.departure.memo} placeholder="メモ" onChange={e => updateDeparture('memo', e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Get travel data from localStorage (for PDF) */
export function getTravelData(): TravelDayData {
  return loadFromStorage();
}
