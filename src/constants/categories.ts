import type { Category, DayInfo } from '../types';

export const ICONS: Record<string, string> = {
  satellite:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/><path d="M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
  building:'<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M10 22v-4h4v4"/></svg>',
  broadcast:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.49"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 19.07a10 10 0 010-14.14"/></svg>',
  clipboard:'<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="16" rx="1"/><path d="M9 2h6v3H9z"/><line x1="10" y1="10" x2="14" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/></svg>',
  clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  sync:'<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  utensils:'<svg viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M17 2c-2 0-5 2.5-5 6 0 3.5 3 5.5 5 6v8"/><line x1="17" y1="2" x2="17" y2="8"/></svg>',
  bowl:'<svg viewBox="0 0 24 24"><path d="M4 10a8 8 0 0016 0H4z"/><path d="M12 18v2"/><path d="M8 22h8"/><path d="M8 4c0-1 1-2 2-2M14 4c0-1-1-2-2-2"/></svg>',
  plane:'<svg viewBox="0 0 24 24"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5 7 3.5-4.5 4-2-.5-1.5 1.5 3.5 1.5 1.5 3.5 1.5-1.5-.5-2 4-4.5 3.5 7 .5-.3c.4-.2.6-.6.5-1.1z"/></svg>',
  train:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="16" rx="2"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="12" y1="3" x2="12" y2="11"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/><path d="M6 19l-2 3M18 19l2 3"/></svg>',
  car:'<svg viewBox="0 0 24 24"><path d="M5 17h14v-5H5z"/><path d="M6 12l2-5h8l2 5"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>',
  walk:'<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M10 22l2-7 3 3v6"/><path d="M14 13l-3-3-2 4"/><path d="M9 14l-3 8"/></svg>',
  bed:'<svg viewBox="0 0 24 24"><path d="M3 7v10"/><path d="M21 7v10"/><rect x="3" y="10" width="18" height="4" rx="1"/><path d="M3 17h18"/><path d="M6 10V7h3a2 2 0 012 2v1"/></svg>',
  note:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  pin:'<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 00-16 0"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  download:'<svg viewBox="0 0 24 24"><path d="M12 5v10"/><path d="M7 12l5 5 5-5"/><line x1="5" y1="19" x2="19" y2="19"/></svg>',
  gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  x:'<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  trash:'<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
  list:'<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  dollar:'<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  edit:'<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  move:'<svg viewBox="0 0 24 24"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
};

export function ic(name: string, cls?: string): string {
  return `<span class="ic ${cls || ''}">${ICONS[name] || ''}</span>`;
}

export const CAT: Record<string, Category> = {
  visit:      { cls: 'v',  lbl: '企業訪問',   ico: 'building' },
  event:      { cls: 'ev', lbl: 'ATxSG',      ico: 'broadcast' },
  review:     { cls: 'rv', lbl: '振り返り',   ico: 'note' },
  reserve:    { cls: 'rs', lbl: '予備枠',     ico: 'clock' },
  sync:       { cls: 'sy', lbl: 'チーム共有',  ico: 'sync' },
  dinner:     { cls: 'di', lbl: 'ディナー',   ico: 'utensils' },
  lunch:      { cls: 'lu', lbl: 'ランチ',     ico: 'bowl' },
  flight:     { cls: 'fl', lbl: '飛行機',     ico: 'plane' },
  mrt:        { cls: 'mr', lbl: 'MRT',        ico: 'train' },
  taxi:       { cls: 'tx', lbl: 'タクシー',   ico: 'car' },
  walk:       { cls: 'wk', lbl: '徒歩',      ico: 'walk' },
  hotel_move: { cls: 'ht', lbl: 'ホテル移動', ico: 'bed' },
  travel:     { cls: 'tv', lbl: '移動',       ico: 'walk' },
};

export const TRAVEL_TYPES = ['flight', 'mrt', 'taxi', 'walk', 'hotel_move'];
export const NON_TRAVEL_TYPES = ['visit', 'event', 'review', 'reserve', 'sync', 'lunch', 'dinner'];
export const ALL_TYPES = [...NON_TRAVEL_TYPES, ...TRAVEL_TYPES];

export function getCat(type: string): Category {
  return CAT[type] || CAT.travel;
}

export const DAYS: DayInfo[] = [
  { key: 'd0', label: '5/18 MON', desc: '両チーム訪問', date: '2026-05-18' },
  { key: 'd1', label: '5/19 TUE', desc: '両チーム訪問', date: '2026-05-19' },
  { key: 'd2', label: '5/20 WED', desc: 'A:ATxSG / B:訪問', date: '2026-05-20' },
  { key: 'd3', label: '5/21 THU', desc: 'A:訪問 / B:ATxSG', date: '2026-05-21' },
];

export const SH = 6;   // start hour
export const EH = 23;  // end hour
export const PPM = 2.0; // pixels per minute
export const SNAP = 15;  // snap interval in minutes
export const TMIN = (EH - SH) * 60;
export const TPX = TMIN * PPM;
