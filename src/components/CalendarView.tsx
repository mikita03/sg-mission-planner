import { useRef, useCallback, useState, useEffect } from 'react';
import type { Block } from '../types';
import { SH, EH, PPM, SNAP, TMIN, TPX, DAYS, getCat, ic, CAT, ALL_TYPES } from '../constants/categories';
import { t2m, m2t, m2px, snap, getSGT } from '../utils/time';
import { addTrail, addRipple } from './Shared';

interface Props {
  blocks: Block[];
  currentView: number;
  selectedId: string | null;
  filterTypes: Set<string> | null;
  getBlockEditor: (blockId: string) => string | null;
  onSelectBlock: (id: string) => void;
  onUpdateBlock: (id: string, updates: Partial<Block>) => void;
  onAddBlock: (partial: Partial<Block>) => void;
}

export function CalendarView({ blocks, currentView, selectedId, filterTypes, getBlockEditor, onSelectBlock, onUpdateBlock, onAddBlock }: Props) {
  const days = currentView === 0 ? [0, 1] : [2, 3];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [catPicker, setCatPicker] = useState<{ x: number; y: number; day: string; team: string; start: string } | null>(null);

  // Time needle
  const [needleMin, setNeedleMin] = useState<number | null>(null);
  const [needleDay, setNeedleDay] = useState<number | null>(null);

  useEffect(() => {
    function updateNeedle() {
      const sgt = getSGT();
      const todayStr = `${sgt.getFullYear()}-${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(sgt.getDate()).padStart(2, '0')}`;
      const dayIdx = DAYS.findIndex(d => d.date === todayStr);
      if (dayIdx >= 0 && days.includes(dayIdx)) {
        const h = sgt.getHours(), m = sgt.getMinutes();
        if (h >= SH && h < EH) {
          setNeedleMin((h - SH) * 60 + m);
          setNeedleDay(dayIdx);
          return;
        }
      }
      setNeedleMin(null);
      setNeedleDay(null);
    }
    updateNeedle();
    const timer = setInterval(updateNeedle, 10000);
    return () => clearInterval(timer);
  }, [currentView]);

  // Day summary stats
  function getDayStats(dayKey: string) {
    const dayBlocks = blocks.filter(b => b.day === dayKey);
    const visits = dayBlocks.filter(b => b.type === 'visit');
    const confirmed = visits.filter(b => b.detail?.trim());
    const travelTypes = ['flight', 'mrt', 'taxi', 'walk', 'hotel_move', 'travel'];
    const travelMin = dayBlocks.filter(b => travelTypes.includes(b.type)).reduce((s, b) => s + b.dur, 0);
    return { total: dayBlocks.length, visits: visits.length, confirmed: confirmed.length, travelMin };
  }

  // Empty space click handler
  const handleLaneClick = useCallback((e: React.MouseEvent, dayKey: string, team: string) => {
    if ((e.target as HTMLElement).closest('.bk')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const minutes = snap(relY / PPM);
    const time = m2t(Math.max(0, Math.min(TMIN - SNAP, minutes)));
    setCatPicker({ x: e.clientX, y: e.clientY, day: dayKey, team, start: time });
  }, []);

  const handleCatSelect = useCallback((type: string) => {
    if (!catPicker) return;
    onAddBlock({
      day: catPicker.day as Block['day'],
      team: catPicker.team as Block['team'],
      start: catPicker.start,
      dur: 60,
      type,
      label: CAT[type]?.lbl || type,
    });
    setCatPicker(null);
  }, [catPicker, onAddBlock]);

  // Close cat picker on outside click
  useEffect(() => {
    if (!catPicker) return;
    const handler = () => setCatPicker(null);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [catPicker]);

  // Drag state
  const dragRef = useRef<{
    id: string; el: HTMLElement; lane: HTMLElement;
    grabOffset: number; origTop: number;
  } | null>(null);

  function onBlockMouseDown(e: React.MouseEvent, blockId: string) {
    if (e.button !== 0) return;
    const el = (e.currentTarget as HTMLElement);
    const lane = el.parentElement!;
    const lr = lane.getBoundingClientRect();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const bm = t2m(block.start);
    const grabOffset = (e.clientY - lr.top) - m2px(bm);
    const origTop = m2px(bm);

    e.preventDefault();
    el.classList.add('dragging');
    dragRef.current = { id: blockId, el, lane, grabOffset, origTop };

    let lastMouse = { x: 0, y: 0 };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const lr = dragRef.current.lane.getBoundingClientRect();
      let nm = snap((ev.clientY - lr.top - dragRef.current.grabOffset) / PPM);
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
      if (nm !== origNm) {
        onUpdateBlock(dragRef.current.id, { start: m2t(nm) });
        addRipple(lastMouse.x, lastMouse.y);
      }
      dragRef.current = null;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Resize state
  function onResizeMouseDown(e: React.MouseEvent, blockId: string) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
    if (!el) return;
    const startY = e.clientY;
    const startH = parseFloat(el.style.height);

    let lastResizeMouse = { x: 0, y: 0 };

    function onMove(ev: MouseEvent) {
      let nd = snap((startH + (ev.clientY - startY)) / PPM);
      nd = Math.max(SNAP, nd);
      el.style.height = (nd * PPM) + 'px';
      const bl = blocks.find(b => b.id === blockId);
      const timeEl = el.querySelector('.bk-time');
      if (timeEl && bl) timeEl.textContent = `${bl.start} – ${m2t(t2m(bl.start) + nd)} (${nd}m)`;
      addTrail(ev.clientX, ev.clientY, '168,85,247');
      lastResizeMouse = { x: ev.clientX, y: ev.clientY };
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const nd = Math.max(SNAP, snap(parseFloat(el.style.height) / PPM));
      onUpdateBlock(blockId, { dur: nd });
      addRipple(lastResizeMouse.x, lastResizeMouse.y, '168,85,247');
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function renderBlock(b: Block, idx: number) {
    const cat = getCat(b.type);
    const sm = t2m(b.start);
    const hpx = b.dur * PPM;
    const isFiltered = filterTypes && !filterTypes.has(b.type);
    const editor = getBlockEditor(b.id);
    const isLocked = !!editor;
    const classes = `bk ${cat.cls}${selectedId === b.id ? ' selected' : ''}${isFiltered ? ' filtered-out' : ''}`;

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
        onMouseDown={(e) => {
          if (isLocked) return;
          if (!(e.target as HTMLElement).closest('.rh')) onBlockMouseDown(e, b.id);
        }}
      >
        <div className="bk-time">{b.start} – {m2t(t2m(b.start) + b.dur)} ({b.dur}m)</div>
        <div className="bk-label">
          <span className="ic" dangerouslySetInnerHTML={{ __html: ic(cat.ico) }} />
          {b.label}
        </div>
        {/* Status badge for visit/reserve */}
        {(b.type === 'visit' || b.type === 'reserve') && b.status && b.status !== 'pending' && hpx > 30 && (
          <div className="bk-status">
            <span className={`status-badge st-${b.status}`}>
              {b.status === 'confirmed' ? '確定' : b.status === 'negotiating' ? '交渉中' : 'キャンセル'}
            </span>
          </div>
        )}
        {isLocked && hpx > 35 && (
          <div style={{ fontSize: 9, color: 'var(--neon-amber)', fontFamily: 'Share Tech Mono, monospace', marginTop: 1 }}>
            {editor} editing...
          </div>
        )}
        {!isLocked && b.detail && hpx > 40 && <div className="bk-detail">{b.detail}</div>}
        {!isLocked && (Array.isArray(b.comments) && b.comments.length > 0) && hpx > 50 && (
          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'Share Tech Mono', marginTop: 1 }}>
            {b.comments.length} comment{b.comments.length > 1 ? 's' : ''}
          </div>
        )}
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

      {/* View Toggle */}
      <div className="view-toggle">
        {[0, 1].map(v => (
          <button key={v} className={currentView === v ? 'active' : ''} style={{ pointerEvents: 'none' }}>
            {v === 0 ? '5/18 MON – 5/19 TUE' : '5/20 WED – 5/21 THU'}
            <span className="phase">{v === 0 ? 'PHASE 1: VISITS' : 'PHASE 2: ATxSG'}</span>
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="cal-outer">
        <div className="cal-wrap" onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
          const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
          e.currentTarget.style.setProperty('--mouse-x', x + '%');
          e.currentTarget.style.setProperty('--mouse-y', y + '%');
        }}>
          {/* Header */}
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
          <div className="cal-body-wrap" ref={scrollRef}>
            <div className="cal-body">
              {/* Time column */}
              <div className="tc" style={{ position: 'relative', height: TPX }}>
                {Array.from({ length: EH - SH + 1 }, (_, i) => (
                  <div key={i} className="tm" style={{ top: m2px(i * 60) }}>{SH + i}:00</div>
                ))}
              </div>

              {/* Day columns */}
              {days.map(di => (
                <div key={di} className="db" style={{ height: TPX }} data-day={`d${di}`}>
                  {/* Grid lines */}
                  {Array.from({ length: (EH - SH) * 2 + 1 }, (_, i) => {
                    const min = i * 30;
                    if (min > TMIN) return null;
                    return <div key={i} className={`gl ${i % 2 === 0 ? 'h' : 'hf'}`} style={{ top: m2px(min) }} />;
                  })}
                  <div className="cl-divider" />

                  {/* Time needle */}
                  {needleDay === di && needleMin !== null && (
                    <div className="time-needle" style={{ top: m2px(needleMin) }}>
                      <span className="time-needle-label">
                        {Math.floor(needleMin / 60) + SH}:{String(needleMin % 60).padStart(2, '0')} SGT
                      </span>
                    </div>
                  )}

                  {/* Lanes */}
                  {(['A', 'B'] as const).map(team => (
                    <div key={team} className="ln" onClick={e => handleLaneClick(e, `d${di}`, team)}>
                      <div className="ln-click-area" />
                      {blocks
                        .filter(b => b.day === `d${di}` && b.team === team)
                        .sort((a, b) => t2m(a.start) - t2m(b.start))
                        .map((b, idx) => renderBlock(b, idx))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Category Picker (for empty space click) */}
      {catPicker && (
        <div
          className="cat-picker"
          style={{ left: Math.min(catPicker.x, window.innerWidth - 280), top: Math.min(catPicker.y, window.innerHeight - 300) }}
          onClick={e => e.stopPropagation()}
        >
          {ALL_TYPES.map(k => (
            <button key={k} onClick={() => handleCatSelect(k)}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic(CAT[k].ico) }} />
              <span>{CAT[k].lbl}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
