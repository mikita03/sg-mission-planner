import { SH, SNAP } from '../constants/categories';

/** "HH:MM" → minutes from start hour */
export function t2m(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h - SH) * 60 + m;
}

/** minutes from start hour → "HH:MM" */
export function m2t(m: number): string {
  const h = Math.floor(m / 60) + SH;
  const mm = m % 60;
  return `${h}:${mm < 10 ? '0' + mm : mm}`;
}

/** minutes → pixels */
export function m2px(m: number): number {
  return m * 2.0;
}

/** snap to interval */
export function snap(m: number): number {
  return Math.round(m / SNAP) * SNAP;
}

/** Generate unique ID */
let _idCounter = Date.now();
export function genId(): string {
  return 'b' + (++_idCounter).toString(36);
}

/** Get Singapore time */
export function getSGT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
}

/** Format SGT date */
export function formatSGTDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/** Format SGT time */
export function formatSGTTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
