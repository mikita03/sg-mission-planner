import { useState, useEffect } from 'react';
import type { Block } from '../types';
import { exportBusinessPDF } from '../utils/pdf';
import { triggerGlitch } from './Shared';

const COVERT_LINES = [
  { t: '> INITIATING COVERT EXTRACTION...', c: 'cmd', d: 300 },
  { t: '[AUTH] BYPASSING CORPORATE FIREWALL......... ', c: 'info', d: 400 },
  { t: '[AUTH] ACCESS GRANTED — CLEARANCE LEVEL: Ω', c: 'ok', d: 350 },
  { t: '[SCAN] INTERCEPTING SCHEDULE DATA...', c: 'cmd', d: 300 },
  { t: '[DATA] 4 DAYS / 2 TEAMS / {COUNT} BLOCKS CAPTURED', c: 'data', d: 350 },
  { t: '[DATA] VISIT INTEL: {VISITS} TARGETS IDENTIFIED', c: 'data', d: 300 },
  { t: '[COMP] COMPILING CLASSIFIED DOCUMENT...', c: 'cmd', d: 400 },
  { t: '[ENC ] ENCODING: UTF-8 / FORMAT: PDF/A-1b', c: 'info', d: 250 },
  { t: '[ENC ] APPLYING COVER: "出張工程表"', c: 'highlight', d: 350 },
  { t: '[SEC ] WATERMARK: CONFIDENTIAL', c: 'data', d: 300 },
  { t: '[OUT ] DOCUMENT READY — DEPLOYING TO LOCAL FS', c: 'ok', d: 400 },
  { t: '> EXTRACTION COMPLETE. COVER YOUR TRACKS.', c: 'cmd', d: 500 },
];

interface Props {
  blocks: Block[];
  onDone: () => void;
}

export function CovertExport({ blocks, onDone }: Props) {
  const [lines, setLines] = useState<typeof COVERT_LINES>([]);
  const [progress, setProgress] = useState(0);
  const [stamped, setStamped] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    triggerGlitch();

    const visitCount = blocks.filter(b => b.type === 'visit' || b.type === 'reserve').length;
    const processed = COVERT_LINES.map(l => ({
      ...l,
      t: l.t.replace('{COUNT}', String(blocks.length)).replace('{VISITS}', String(visitCount)),
    }));

    let i = 0;
    function next() {
      if (i >= processed.length) {
        setProgress(100);
        // Stamp animation
        setTimeout(() => {
          triggerGlitch();
          setStamped(true);
        }, 300);
        // Actual PDF export
        setTimeout(() => {
          exportBusinessPDF(blocks);
        }, 800);
        // Close overlay
        setTimeout(() => {
          setDone(true);
          setTimeout(onDone, 600);
        }, 2000);
        return;
      }
      setLines(prev => [...prev, processed[i]]);
      setProgress(((i + 1) / processed.length) * 95);
      i++;
      setTimeout(next, processed[i - 1]?.d || 300);
    }

    setTimeout(next, 500);
  }, [blocks, onDone]);

  return (
    <div className="covert-overlay" style={{ opacity: done ? 0 : 1, transition: 'opacity .5s' }}>
      <div className="covert-content">
        <div className="covert-title">⚠ CLASSIFIED ⚠</div>
        <div className="covert-subtitle">DOCUMENT EXTRACTION IN PROGRESS</div>

        <div className="covert-terminal">
          {lines.map((l, i) => (
            <div key={i} className={`covert-line ${l.c}`}>{l.t}</div>
          ))}
          {!stamped && <span className="covert-cursor" />}
          <div className="covert-progress">
            <div className="covert-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={`covert-stamp ${stamped ? 'visible' : ''}`}>
          EXTRACTED
        </div>
      </div>
    </div>
  );
}
