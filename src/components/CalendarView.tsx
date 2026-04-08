import { useRef, useState, useEffect } from 'react';
import type { Block } from '../types';
import { SH, EH, PPM, SNAP, TMIN, TPX, DAYS, getCatDisplay, getCatCls, ic } from '../constants/categories';
import { t2m, m2t, m2px, snap, getSGT } from '../utils/time';
import { getMapsLink } from '../utils/maps';
import { addTrail, addRipple } from './Shared';

interface Props {
  blocks: Block[];
  currentView: number;
  selectedId: string | null;
  filterTypes: Set<string> | null;
  isMobile?: boolean;
  mobileDay?: number;
  getBlockEditor: (blockId: string) => string | null;
  onSelectBlock: (id: string) => void;
  onUpdateBlock: (id: string, updates: Partial<Block>) => void;
  onStartCreate: (day: string, team: string, start: string, dur: number) => void;
}

interface HoverInfo {
  block: Block;
  x: number;
  y: number;
}

export function CalendarView({ blocks, currentView, selectedId, filterTypes, isMobile, mobileDay, getBlockEditor, onSelectBlock, onUpdateBlock, onStartCreate }: Props) {
  const days = isMobile && mobileDay !== undefined ? [mobileDay] : currentView === 0 ? [0, 1] : [2, 3];
  const dragRef = useRef<{ id: string; el: HTMLElement; lane: HTMLElement; grabOffset: number; origTop: number } | null>(null);
  const createRef = useRef<{ lane: HTMLElement; day: string; team: string; startY: number; el: HTMLDivElement | null } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const hoverTimeout = useRef<number>(0);

  // Time indicator
  const [nowMin, setNowMin] = useState(() => {
    const s = getSGT(); return (s.getHours() - SH) * 60 + s.getMinutes();
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const s = getSGT(); setNowMin((s.getHours() - SH) * 60 + s.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Day stats
  function getDayStats(dayKey: string) {
    const dayBlocks = blocks.filter(b => b && b.day === dayKey);
    const visits = dayBlocks.filter(b => b.category === 'visit').length;
    const confirmed = dayBlocks.filter(b => b.category === 'visit' && !b.draft).length;
    const travelMin = dayBlocks.filter(b => b.category === 'move').reduce((s, b) => s + b.dur, 0);
    return { visits, confirmed, travelMin };
  }

  // ═══ Overlap Detection ═══
  function getOverlappingIds(): Set<string> {
    const ids = new Set<string>();
    for (const day of ['d0','d1','d2','d3']) {
      for (const team of ['A','B']) {
        const lane = blocks.filter(b => b && b.day === day && b.team === team && !b.draft);
        for (let i = 0; i < lane.length; i++) {
          const aS = t2m(lane[i].start), aE = aS + lane[i].dur;
          for (let j = i + 1; j < lane.length; j++) {
            const bS = t2m(lane[j].start), bE = bS + lane[j].dur;
            if (aS < bE && bS < aE) { ids.add(lane[i].id); ids.add(lane[j].id); }
          }
        }
      }
    }
    return ids;
  }
  const overlappingIds = getOverlappingIds();

  // ═══ Next Event Detection ═══
  const nextBlockId = (() => {
    const sgt = getSGT();
    const dayIdx = sgt.getDate() - 18; // 18=May 18
    if (sgt.getMonth() !== 4 || dayIdx < 0 || dayIdx > 3) return null;
    const dayKey = `d${dayIdx}`;
    const nowM = (sgt.getHours() - SH) * 60 + sgt.getMinutes();
    let best: Block | null = null;
    let bestStart = Infinity;
    for (const b of blocks) {
      if (b.day !== dayKey || b.draft) continue;
      const s = t2m(b.start);
      if (s >= nowM && s < bestStart) { bestStart = s; best = b; }
    }
    return best?.id || null;
  })();

  // ═══ Block Drag (move) ═══
  function showSnapGuides(lane: HTMLElement, dayKey: string, team: string, excludeId: string) {
    const guides: number[] = [];
    blocks.filter(b => b.day === dayKey && b.team === team && b.id !== excludeId && !b.draft)
      .forEach(b => { const s = t2m(b.start); guides.push(s, s + b.dur); });
    const unique = [...new Set(guides)];
    unique.forEach(m => {
      const g = document.createElement('div');
      g.className = 'snap-guide';
      g.style.top = m2px(m) + 'px';
      lane.appendChild(g);
    });
  }
  function clearSnapGuides() {
    document.querySelectorAll('.snap-guide').forEach(el => el.remove());
  }

  function onBlockMouseDown(e: React.MouseEvent, blockId: string) {
    if (e.button !== 0) return;
    const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
    if (!el) return;
    const lane = el.closest('.tl') as HTMLElement;
    if (!lane) return;
    e.preventDefault();
    
    const grabOffset = e.clientY - el.getBoundingClientRect().top;
    const origTop = parseFloat(el.style.top);
    el.classList.add('dragging');
    dragRef.current = { id: blockId, el, lane, grabOffset, origTop };
    const bl = blocks.find(b => b.id === blockId);
    if (bl) showSnapGuides(lane, bl.day, bl.team, blockId);
    let lastMouse = { x: 0, y: 0 };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const lr2 = dragRef.current.lane.getBoundingClientRect();
      let nm = snap((ev.clientY - lr2.top - dragRef.current.grabOffset) / PPM);
      nm = Math.max(0, Math.min(TMIN - SNAP, nm));
      dragRef.current.el.style.top = m2px(nm) + 'px';
      const bl = blocks.find(b => b.id === dragRef.current!.id);
      const timeEl = dragRef.current.el.querySelector('.bk-time');
      if (timeEl && bl) timeEl.textContent = `${m2t(nm)} – ${m2t(nm + bl.dur)} (${bl.dur}m)`;
      addTrail(ev.clientX, ev.clientY);
      lastMouse = { x: ev.clientX, y: ev.clientY };
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current) return;
      dragRef.current.el.classList.remove('dragging');
      const nm = snap(parseFloat(dragRef.current.el.style.top) / PPM);
      const origNm = snap(dragRef.current.origTop / PPM);
      if (nm !== origNm) { onUpdateBlock(dragRef.current.id, { start: m2t(nm) }); addRipple(lastMouse.x, lastMouse.y); }
      clearSnapGuides();
      dragRef.current = null;
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ═══ Block Resize ═══
  function onResizeMouseDown(e: React.MouseEvent, blockId: string) {
    e.preventDefault(); e.stopPropagation();
    const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
    if (!el) return;
    const startY = e.clientY;
    const startH = parseFloat(el.style.height);
    let lastMouse = { x: 0, y: 0 };

    function onMove(ev: MouseEvent) {
      let nd = snap((startH + (ev.clientY - startY)) / PPM);
      nd = Math.max(SNAP, nd);
      el.style.height = (nd * PPM) + 'px';
      const bl = blocks.find(b => b.id === blockId);
      const timeEl = el.querySelector('.bk-time');
      if (timeEl && bl) timeEl.textContent = `${bl.start} – ${m2t(t2m(bl.start) + nd)} (${nd}m)`;
      addTrail(ev.clientX, ev.clientY, '168,85,247');
      lastMouse = { x: ev.clientX, y: ev.clientY };
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const nd = Math.max(SNAP, snap(parseFloat(el.style.height) / PPM));
      onUpdateBlock(blockId, { dur: nd });
      addRipple(lastMouse.x, lastMouse.y, '168,85,247');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ═══ Top Resize (change start time + duration) ═══
  function onTopResizeMouseDown(e: React.MouseEvent, blockId: string) {
    e.preventDefault(); e.stopPropagation();
    const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
    if (!el) return;
    const bl = blocks.find(b => b.id === blockId);
    if (!bl) return;
    const origStartMin = t2m(bl.start);
    const origEndMin = origStartMin + bl.dur;
    const startY = e.clientY;
    const startTop = parseFloat(el.style.top);
    let lastMouse = { x: 0, y: 0 };

    function onMove(ev: MouseEvent) {
      const deltaY = ev.clientY - startY;
      let newStartMin = snap(startTop / PPM + deltaY / PPM);
      newStartMin = Math.max(0, Math.min(origEndMin - SNAP, newStartMin));
      const newDur = origEndMin - newStartMin;
      el.style.top = m2px(newStartMin) + 'px';
      el.style.height = (newDur * PPM) + 'px';
      const timeEl = el.querySelector('.bk-time');
      if (timeEl) timeEl.textContent = `${m2t(newStartMin)} – ${m2t(origEndMin)} (${newDur}m)`;
      addTrail(ev.clientX, ev.clientY, '0,229,255');
      lastMouse = { x: ev.clientX, y: ev.clientY };
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const newStartMin = snap(parseFloat(el.style.top) / PPM);
      const newDur = origEndMin - newStartMin;
      onUpdateBlock(blockId, { start: m2t(newStartMin), dur: Math.max(SNAP, newDur) });
      addRipple(lastMouse.x, lastMouse.y, '0,229,255');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ═══ Drag-to-Create on empty space ═══
  function onLaneMouseDown(e: React.MouseEvent, dayKey: string, team: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.bk')) return;
    e.preventDefault();
    const lane = e.currentTarget as HTMLElement;
    
    const laneRect = lane.getBoundingClientRect();
    const startMin = snap((e.clientY - laneRect.top) / PPM);

    // Create visual drag preview
    const preview = document.createElement('div');
    preview.className = 'drag-create-preview';
    preview.style.position = 'absolute';
    preview.style.left = '3px';
    preview.style.right = '3px';
    preview.style.top = m2px(startMin) + 'px';
    preview.style.height = (SNAP * PPM) + 'px';
    preview.innerHTML = `<span class="drag-create-time">${m2t(startMin)} – ${m2t(startMin + SNAP)}</span>`;
    lane.appendChild(preview);

    createRef.current = { lane, day: dayKey, team, startY: e.clientY, el: preview };

    function onMove(ev: MouseEvent) {
      if (!createRef.current?.el) return;
      const lr2 = createRef.current.lane.getBoundingClientRect();
      let endMin = snap((ev.clientY - lr2.top) / PPM);
      endMin = Math.max(startMin + SNAP, Math.min(TMIN, endMin));
      const dur = endMin - startMin;
      createRef.current.el.style.height = (dur * PPM) + 'px';
      const timeSpan = createRef.current.el.querySelector('.drag-create-time');
      if (timeSpan) timeSpan.textContent = `${m2t(startMin)} – ${m2t(startMin + dur)} (${dur}m)`;
    }

    function onUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!createRef.current?.el) return;
      const lr2 = createRef.current.lane.getBoundingClientRect();
      let endMin = snap((ev.clientY - lr2.top) / PPM);
      if (endMin <= startMin) endMin = startMin + SNAP;
      endMin = Math.min(TMIN, endMin);
      const dur = endMin - startMin;
      createRef.current.el.remove();

      // Open wizard drawer with pre-set time
      onStartCreate(dayKey, team, m2t(startMin), dur);
      addRipple(ev.clientX, ev.clientY, '0,229,255');
      createRef.current = null;
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ═══ Hover Preview ═══
  function onBlockMouseEnter(e: React.MouseEvent, block: Block) {
    clearTimeout(hoverTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimeout.current = window.setTimeout(() => {
      setHoverInfo({ block, x: rect.right + 8, y: rect.top });
    }, 400);
  }

  function onBlockMouseLeave() {
    clearTimeout(hoverTimeout.current);
    // Delay hide so user can move mouse to the hover card
    hoverTimeout.current = window.setTimeout(() => setHoverInfo(null), 200);
  }

  // ═══ Render Block ═══
  function renderBlock(b: Block, idx: number) {
    const cat = getCatDisplay(b.category, b.subType);
    const cls = getCatCls(b.category, b.subType);
    const sm = t2m(b.start);
    const hpx = b.dur * PPM;
    const isFiltered = filterTypes && !filterTypes.has(b.category);
    const editor = getBlockEditor(b.id);
    const isLocked = !!editor;
    const isDraft = b.draft;
    const isOverlap = overlappingIds.has(b.id);
    const isNext = b.id === nextBlockId;
    // 8-1: Chain detection (move↔visit connection)
    const bEnd = t2m(b.start) + b.dur;
    const bStart = t2m(b.start);
    const isChainStart = (b.category === 'move') && blocks.some(o => o.day === b.day && o.team === b.team && o.id !== b.id && (o.category === 'visit' || o.category === 'food' || o.category === 'atxsg') && Math.abs(t2m(o.start) - bEnd) <= 5);
    const isChainEnd = (b.category === 'visit' || b.category === 'food' || b.category === 'atxsg') && blocks.some(o => o.day === b.day && o.team === b.team && o.id !== b.id && o.category === 'move' && Math.abs(t2m(o.start) + o.dur - bStart) <= 5);
    const classes = `bk bk-${cls}${selectedId === b.id ? ' selected' : ''}${isFiltered ? ' filtered-out' : ''}${isDraft ? ' draft' : ''}${isOverlap ? ' overlap-warn' : ''}${isNext ? ' next-block' : ''}${isChainStart ? ' chain-start' : ''}${isChainEnd ? ' chain-end' : ''}`;

    return (
      <div
        key={b.id}
        className={classes}
        data-block-id={b.id}
        style={{
          position: 'absolute', top: m2px(sm), left: 3, right: 3, height: hpx,
          animationDelay: `${idx * 0.04}s`,
          ...(isLocked ? { outline: '1px dashed var(--neon-amber)', opacity: 0.7 } : {}),
        }}
        onClick={(e) => { e.stopPropagation(); onSelectBlock(b.id); }}
        onMouseDown={(e) => { if (isLocked) return; const t = (e.target as HTMLElement); if (!t.closest('.rh') && !t.closest('.rh-top')) onBlockMouseDown(e, b.id); }}
        onMouseEnter={(e) => onBlockMouseEnter(e, b)}
        onMouseLeave={onBlockMouseLeave}
      >
        <div className="bk-time">{b.start} – {m2t(t2m(b.start) + b.dur)} ({b.dur}m)</div>
        <div className="bk-label">
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic(cat.ico) }} />
          {b.label || cat.lbl}
          {isDraft && <span className="draft-tag">仮</span>}
          {isOverlap && <span className="overlap-tag">⚠重複</span>}
          {isNext && <span className="next-tag">NEXT▸</span>}
        </div>
        {(b.category === 'visit' || b.category === 'reserve') && b.status && b.status !== 'pending' && hpx > 30 && (
          <div className="bk-status">
            <span className={`status-badge st-${b.status}`}>
              {b.status === 'confirmed' ? '確定' : b.status === 'negotiating' ? '交渉中' : 'キャンセル'}
            </span>
          </div>
        )}
        {isLocked && hpx > 35 && (
          <div style={{ fontSize: 10, color: 'var(--neon-amber)', fontFamily: 'Share Tech Mono, monospace', marginTop: 1 }}>{editor} editing...</div>
        )}
        {!isLocked && b.detail && hpx > 40 && <div className="bk-detail">{b.detail}</div>}
        {!isLocked && Array.isArray(b.comments) && b.comments.length > 0 && hpx > 50 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Share Tech Mono', marginTop: 1 }}>
            {b.comments.length} comment{b.comments.length > 1 ? 's' : ''}
          </div>
        )}
        {!isLocked && <div className="rh-top" onMouseDown={(e) => onTopResizeMouseDown(e, b.id)} />}
        {!isLocked && <div className="rh" onMouseDown={(e) => onResizeMouseDown(e, b.id)} />}
      </div>
    );
  }

  return (
    <>
      {/* Day Summary */}
      <div className="day-summary">
        {days.map(di => {
          const s = getDayStats(`d${di}`);
          return (
            <div key={di} style={{ display: 'flex', gap: 6 }}>
              <div className="day-stat">{DAYS[di].label}: <span className="stat-val">{s.confirmed}/{s.visits}</span> visits</div>
              <div className="day-stat">Travel: <span className="stat-val">{s.travelMin}m</span></div>
            </div>
          );
        })}
      </div>

      {/* Calendar */}
      <div className={`cal-wrap${isMobile ? ' cal-single-day' : ''}`} onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mouse-x', ((e.clientX - rect.left) / rect.width * 100).toFixed(1) + '%');
        e.currentTarget.style.setProperty('--mouse-y', ((e.clientY - rect.top) / rect.height * 100).toFixed(1) + '%');
      }}>
        {/* Header row */}
        <div className="cal-header">
          <div className="ch-corner" />
          {days.map(di => (
            <div key={di} className="ch-day">
              <div className="dl">{DAYS[di].label}</div>
              <div className="dn">{DAYS[di].desc}</div>
              <div className="tr"><span>A</span><span>B</span></div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="cal-body-wrap">
          <div className="cal-body">
            {/* Time column */}
            <div className="tc" style={{ height: TPX }}>
              {Array.from({ length: EH - SH }, (_, i) => (
                <div key={i} className="tm" style={{ top: m2px(i * 60) }}>{SH + i}:00</div>
              ))}
              {nowMin >= 0 && nowMin <= TMIN && (
                <div className="now-line" style={{ top: m2px(nowMin) }}><span className="now-dot" /></div>
              )}
            </div>

            {/* Day columns with team lanes */}
            {days.map(di => {
              const dayKey = `d${di}` as Block['day'];
              return (
                <div key={di} className="dc" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {(['A', 'B'] as const).map(team => (
                    <div key={team} className="tl" style={{ height: TPX, position: 'relative', borderRight: team === 'A' ? '1px solid var(--border)' : 'none' }}
                      onMouseDown={e => onLaneMouseDown(e, dayKey, team)}>
                      {Array.from({ length: EH - SH }, (_, i) => (
                        <div key={i} className="gl" style={{ top: m2px(i * 60) }} />
                      ))}
                      {blocks
                        .filter(b => b && b.day === dayKey && b.team === team && b.start && b.category)
                        .sort((a, b) => t2m(a.start) - t2m(b.start))
                        .map((b, idx) => renderBlock(b, idx))
                      }
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover Preview Card */}
      {hoverInfo && (
        <div className="hover-card"
          style={{
            left: Math.min(hoverInfo.x, window.innerWidth - 280),
            top: Math.min(hoverInfo.y, window.innerHeight - 200),
          }}
          onMouseEnter={() => clearTimeout(hoverTimeout.current)}
          onMouseLeave={() => setHoverInfo(null)}
        >
          {(() => {
            const b = hoverInfo.block;
            const cat = getCatDisplay(b.category, b.subType);
            return (
              <>
                <div className="hover-card-header">
                  <span className="ic" dangerouslySetInnerHTML={{ __html: ic(cat.ico) }} />
                  <span>{b.label || cat.lbl}</span>
                  {b.draft && <span className="draft-tag">仮</span>}
                </div>
                <div className="hover-card-time">{b.start} – {m2t(t2m(b.start) + b.dur)} ({b.dur}m)</div>
                {b.detail && <div className="hover-card-detail">{b.detail}</div>}
                {b.location && <div className="hover-card-location"><span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('pin') }} /> {b.location}
                  {getMapsLink(b.location, b.mapUrl) && <a href={getMapsLink(b.location, b.mapUrl)} target="_blank" rel="noopener noreferrer" className="maps-link" style={{ marginLeft: 4 }} onClick={e => e.stopPropagation()}>MAP</a>}
                </div>}
                {b.fromLocation && <div className="hover-card-location"><span style={{ color: 'var(--text3)' }}>From:</span> {b.fromLocation}</div>}
                {b.memo && <div className="hover-card-memo">{b.memo}</div>}
                <div className="hover-card-actions">
                  <button onClick={() => { setHoverInfo(null); onSelectBlock(b.id); }}>
                    <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('edit') }} /> 編集
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
