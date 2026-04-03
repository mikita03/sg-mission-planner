import { useEffect, useRef, useState } from 'react';

/* ═══ Boot Screen ═══ */
const BOOT_LINES = [
  { t: '[SYS] INITIALIZING MISSION PLANNER v4.0...', cls: 'sys' },
  { t: '[NET] ESTABLISHING SECURE UPLINK...', cls: 'sys' },
  { t: '[DB ] LOADING SCHEDULE BLOCKS...................... OK', cls: 'ok' },
  { t: '[GPS] COORDINATES: 1.3521°N, 103.8198°E.......... OK', cls: 'ok' },
  { t: '[TZ ] TIMEZONE: UTC+8 (SGT)...................... OK', cls: 'ok' },
  { t: '[HUD] HEADS-UP DISPLAY ACTIVE..................... OK', cls: 'ok' },
  { t: '[FX ] PARTICLE SYSTEM + TRAIL ENGINE.............. OK', cls: 'ok' },
  { t: '[SYS] ALL SYSTEMS NOMINAL', cls: 'ok' },
];

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<typeof BOOT_LINES>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const timer = () => {
      if (i >= BOOT_LINES.length) {
        setProgress(100);
        setTimeout(() => { setDone(true); setTimeout(onDone, 800); }, 400);
        return;
      }
      setLines(prev => [...prev, BOOT_LINES[i]]);
      setProgress(((i + 1) / BOOT_LINES.length) * 100);
      i++;
      setTimeout(timer, 180 + Math.random() * 120);
    };
    setTimeout(timer, 400);
  }, [onDone]);

  return (
    <div className={`boot-screen ${done ? 'done' : ''}`}>
      <div className="boot-content">
        <div className="boot-logo">SG MISSION 2026</div>
        <div>{lines.map((l, i) => (
          <div key={i} className={`boot-line ${l?.cls || ''}`}>{l.t}</div>
        ))}</div>
        <div className="boot-bar">
          <div className="boot-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ═══ Particle Canvas ═══ */
export function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let W = 0, H = 0, animId = 0;
    const N = 50;
    const P = Array.from({ length: N }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.3, a: Math.random() * 0.25 + 0.05,
    }));
    function resize() { W = c!.width = window.innerWidth; H = c!.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);
    function draw() {
      ctx!.clearRect(0, 0, W, H);
      P.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(0,229,255,${p.a})`; ctx!.fill();
      });
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          ctx!.beginPath(); ctx!.moveTo(P[i].x, P[i].y); ctx!.lineTo(P[j].x, P[j].y);
          ctx!.strokeStyle = `rgba(0,229,255,${0.04 * (1 - d / 100)})`; ctx!.stroke();
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="particle-canvas" />;
}

/* ═══ FX Canvas — trails, ripples ═══ */
interface Trail { x: number; y: number; a: number; color: string; }
interface Ripple { x: number; y: number; r: number; a: number; color: string; }

const _trails: Trail[] = [];
const _ripples: Ripple[] = [];

export function addTrail(x: number, y: number, color = '0,229,255') {
  _trails.push({ x, y, a: 0.5, color });
}
export function addRipple(x: number, y: number, color = '0,229,255') {
  _ripples.push({ x, y, r: 0, a: 0.6, color });
}

export function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let W = 0, H = 0, animId = 0;
    function resize() { W = c!.width = window.innerWidth; H = c!.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      // Trails — neon streaks with glow
      for (let i = _trails.length - 1; i >= 0; i--) {
        const t = _trails[i];
        ctx!.beginPath(); ctx!.arc(t.x, t.y, 2 + t.a * 3, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${t.color},${t.a * 0.6})`;
        ctx!.shadowColor = `rgba(${t.color},${t.a})`;
        ctx!.shadowBlur = 8;
        ctx!.fill();
        ctx!.shadowBlur = 0;
        t.a -= 0.015;
        if (t.a <= 0) _trails.splice(i, 1);
      }
      // Ripples — double ring + electric pulse
      for (let i = _ripples.length - 1; i >= 0; i--) {
        const rp = _ripples[i];
        // Outer ring
        ctx!.beginPath(); ctx!.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${rp.color},${rp.a})`;
        ctx!.lineWidth = 2; ctx!.stroke();
        // Inner ring
        if (rp.r > 10) {
          ctx!.beginPath(); ctx!.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(${rp.color},${rp.a * 0.5})`;
          ctx!.lineWidth = 1; ctx!.stroke();
        }
        // Electric pulse dots
        if (rp.a > 0.2) {
          for (let k = 0; k < 6; k++) {
            const angle = (k / 6) * Math.PI * 2 + rp.r * 0.05;
            const px = rp.x + Math.cos(angle) * rp.r;
            const py = rp.y + Math.sin(angle) * rp.r;
            ctx!.beginPath(); ctx!.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx!.fillStyle = `rgba(${rp.color},${rp.a})`; ctx!.fill();
          }
        }
        rp.r += 2.5; rp.a -= 0.015;
        if (rp.a <= 0) _ripples.splice(i, 1);
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fx-canvas" />;
}

/* ═══ HUD Frame ═══ */
export function HudFrame() {
  return (
    <div className="hud-frame">
      <div className="hud-corner hud-corner--tl" />
      <div className="hud-corner hud-corner--tr" />
      <div className="hud-corner hud-corner--bl" />
      <div className="hud-corner hud-corner--br" />
      <div className="hud-label hud-label--tl">SG-MISSION-2026 // HUD v4.0</div>
      <div className="hud-label hud-label--br">OPERATIVES: 4 // STATUS: ACTIVE</div>
    </div>
  );
}

/* ═══ Mouse Glow ═══ */
export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (ref.current) {
        ref.current.style.left = e.clientX + 'px';
        ref.current.style.top = e.clientY + 'px';
        ref.current.classList.add('visible');
      }
    }
    function onLeave() { ref.current?.classList.remove('visible'); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); };
  }, []);
  return <div ref={ref} className="mouse-glow" />;
}

/* ═══ Glitch Band (triggered on tab switch) ═══ */
export function triggerGlitch() {
  const el = document.createElement('div');
  el.className = 'glitch-band';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

/* ═══ Toast ═══ */
let _toastTimer = 0;
export function showToast(msg: string) {
  const el = document.getElementById('globalToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = window.setTimeout(() => el.classList.remove('show'), 2000);
}

export function Toast() {
  return <div className="tt" id="globalToast" />;
}
