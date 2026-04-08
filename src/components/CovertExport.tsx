import { useState, useEffect, useRef } from 'react';
import type { Block } from '../types';
import { exportBusinessPDF } from '../utils/pdf';
import { triggerGlitch } from './Shared';

const COVERT_LINES = [
  { t: '> INITIATING COVERT EXTRACTION...', cls: 'cmd', d: 300 },
  { t: '[SYS ] KERNEL: sg-mission-planner v4.8.2', cls: 'info', d: 200 },
  { t: '[AUTH] BYPASSING CORPORATE FIREWALL......... ', cls: 'info', d: 400 },
  { t: '[AUTH] ACCESS GRANTED — CLEARANCE LEVEL: Ω', cls: 'ok', d: 350 },
  { t: '[NET ] ESTABLISHING SECURE TUNNEL ████████', cls: 'info', d: 250 },
  { t: '[SCAN] INTERCEPTING SCHEDULE DATA...', cls: 'cmd', d: 300 },
  { t: '[DATA] 4 DAYS / 2 TEAMS / {COUNT} BLOCKS CAPTURED', cls: 'data', d: 350 },
  { t: '[DATA] VISIT INTEL: {VISITS} TARGETS IDENTIFIED', cls: 'data', d: 300 },
  { t: '[COMP] COMPILING CLASSIFIED DOCUMENT...', cls: 'cmd', d: 400 },
  { t: '[ENC ] ENCODING: UTF-8 / FORMAT: PDF/A-1b', cls: 'info', d: 250 },
  { t: '[ENC ] APPLYING COVER: "出張工程表"', cls: 'highlight', d: 350 },
  { t: '[SEC ] WATERMARK: CONFIDENTIAL', cls: 'data', d: 300 },
  { t: '[SEC ] ANTI-TAMPER: SHA-256 HASH EMBEDDED', cls: 'info', d: 200 },
  { t: '[OUT ] DOCUMENT READY — DEPLOYING TO LOCAL FS', cls: 'ok', d: 400 },
  { t: '> EXTRACTION COMPLETE. COVER YOUR TRACKS.', cls: 'cmd', d: 500 },
];

interface Props {
  blocks: Block[];
  onDone: () => void;
}

export function CovertExport({ blocks, onDone }: Props) {
  const [lines, setLines] = useState<{ t: string; cls: string; d: number }[]>([]);
  const [progress, setProgress] = useState(0);
  const [stamped, setStamped] = useState(false);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    triggerGlitch();

    const visitCount = blocks.filter(b => b && (b.type === 'visit' || b.type === 'reserve')).length;
    const processed = COVERT_LINES.map(l => ({
      ...l,
      t: l.t.replace('{COUNT}', String(blocks.length)).replace('{VISITS}', String(visitCount)),
    }));

    let i = 0;
    let cancelled = false;
    function next() {
      if (cancelled) return;
      if (i >= processed.length) {
        setProgress(100);
        setTimeout(() => { if (cancelled) return; triggerGlitch(); setStamped(true); }, 300);
        setTimeout(() => { if (cancelled) return; exportBusinessPDF(blocks).catch(e => console.error('PDF error:', e)); }, 800);
        setTimeout(() => { if (cancelled) return; setDone(true); setTimeout(() => onDoneRef.current(), 600); }, 2000);
        return;
      }
      const line = processed[i];
      setLines(prev => [...prev, line]);
      setProgress(((i + 1) / processed.length) * 95);
      const delay = line.d || 300;
      i++;
      setTimeout(next, delay);
    }
    setTimeout(next, 500);
    return () => { cancelled = true; };
  }, []); // empty deps - run once only

  return (
    <div className="covert-overlay" style={{ opacity: done ? 0 : 1, transition: 'opacity .5s' }}>
      <div className={`covert-content${stamped ? ' covert-glitch' : ''}`}>
        <div className="covert-title">⚠ CLASSIFIED ⚠</div>
        <div className="covert-subtitle">DOCUMENT EXTRACTION IN PROGRESS</div>
        <div className="covert-terminal">
          {lines.map((l, i) => (
            <div key={i} className={`covert-line ${l.cls}`}>{l.t}</div>
          ))}
          {!stamped && <span className="covert-cursor" />}
          <div className="covert-progress">
            <div className="covert-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={`covert-stamp ${stamped ? 'visible' : ''}`}>EXTRACTED</div>
      </div>
    </div>
  );
}
