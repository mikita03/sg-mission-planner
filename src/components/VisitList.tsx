import type { Block } from '../types';
import { DAYS } from '../constants/categories';
import { t2m, m2t } from '../utils/time';

interface Props {
  blocks: Block[];
  onSelectBlock: (id: string) => void;
}

export function VisitList({ blocks, onSelectBlock }: Props) {
  const visits = blocks
    .filter(b => b.type === 'visit' || b.type === 'reserve')
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      if (a.team !== b.team) return a.team < b.team ? -1 : 1;
      return t2m(a.start) - t2m(b.start);
    });

  const confirmed = visits.filter(v => v.detail?.trim()).length;

  return (
    <div style={{ animation: 'fadeIn .4s ease' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-cyan)', letterSpacing: '.08em' }}>
          VISIT STATUS
        </div>
        <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 12, color: 'var(--text2)' }}>
          {confirmed} / {visits.length} CONFIRMED
        </div>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table className="visit-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Day</th>
              <th>Team</th>
              <th>Time</th>
              <th>Company</th>
              <th>Location</th>
              <th>Contact</th>
              <th>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {visits.map(v => {
              const isConfirmed = v.status === 'confirmed';
              const dayInfo = DAYS[parseInt(v.day[1])];
              return (
                <tr key={v.id} onClick={() => onSelectBlock(v.id)}
                  className={isConfirmed ? 'visit-row-confirmed' : ''}>
                  <td>
                    <span className={`status-badge st-${v.status || 'pending'}`}>
                      {{ confirmed: '確定', negotiating: '交渉中', cancelled: 'キャンセル', pending: '未定' }[v.status || 'pending']}
                    </span>
                  </td>
                  <td>{dayInfo?.label || v.day}</td>
                  <td>{v.team}</td>
                  <td style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                    {v.start}–{m2t(t2m(v.start) + v.dur)}
                  </td>
                  <td style={{ fontWeight: isConfirmed ? 600 : 400, color: isConfirmed ? 'var(--neon-emerald)' : 'var(--text3)' }}>
                    {v.detail || '—'}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{v.location || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{v.contact || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{v.assignee || '—'}</td>
                </tr>
              );
            })}
            {visits.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                No visit blocks found
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
