import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

// ═══ Migrate old localStorage data BEFORE React mounts ═══
try {
  ['sg_mission_v4', 'sg8'].forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let needsFix = false;
        const fixed = parsed.map((b: any) => {
          if (!b || typeof b !== 'object') return null;
          if (!('status' in b) || !('comments' in b)) needsFix = true;
          return {
            ...b,
            status: b.status || 'pending',
            comments: Array.isArray(b.comments) ? b.comments : [],
            assignee: b.assignee ?? '',
            memo: b.memo ?? '',
            editedBy: b.editedBy ?? '',
            editedAt: b.editedAt ?? 0,
          };
        }).filter(Boolean);
        if (needsFix) {
          localStorage.setItem(key, JSON.stringify(fixed));
          console.log(`[MIGRATE] Fixed ${key}: added missing fields`);
        }
      }
    }
  });
} catch (e) {
  console.warn('[MIGRATE] Error:', e);
}

createRoot(document.getElementById('root')!).render(<App />)
