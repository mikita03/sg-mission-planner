import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
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
          if (!b || typeof b !== 'object') { needsFix = true; return null; }
          if (!('status' in b) || !('comments' in b) || !('type' in b)) needsFix = true;
          return {
            id: b.id || String(Date.now()),
            day: b.day || 'd0',
            team: b.team || 'A',
            start: b.start || '10:00',
            dur: b.dur || 60,
            type: b.type || 'visit',
            label: b.label || '',
            detail: b.detail || '',
            location: b.location || '',
            contact: b.contact || '',
            assignee: b.assignee || '',
            memo: b.memo || '',
            status: b.status || 'pending',
            comments: Array.isArray(b.comments) ? b.comments : [],
            editedBy: b.editedBy || '',
            editedAt: b.editedAt || 0,
          };
        }).filter(Boolean);
        if (needsFix) {
          localStorage.setItem(key, JSON.stringify(fixed));
          console.log(`[MIGRATE] Fixed ${key}`);
        }
      }
    }
  });
} catch (e) {
  // If migration itself fails, nuke the data
  console.warn('[MIGRATE] Error, clearing data:', e);
  localStorage.removeItem('sg_mission_v4');
  localStorage.removeItem('sg8');
}

// ═══ Error Boundary ═══
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App crash:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#06080d', color: '#00e5ff', minHeight: '100vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'monospace', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, marginBottom: 16, color: '#ef4444' }}>⚠ SYSTEM ERROR</div>
          <div style={{ fontSize: 12, color: '#7a8ca0', marginBottom: 20, maxWidth: 500, lineHeight: 1.8 }}>
            {this.state.error.message}
          </div>
          <button onClick={() => {
            localStorage.removeItem('sg_mission_v4');
            localStorage.removeItem('sg8');
            window.location.reload();
          }} style={{
            background: '#111827', border: '1px solid #00e5ff', color: '#00e5ff',
            padding: '10px 24px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            fontFamily: 'monospace', letterSpacing: '.05em',
          }}>
            RESET & RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
