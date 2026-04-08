import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Tab, Block } from './types';
import { useBlocks } from './hooks/useBlocks';
import { useUser } from './hooks/useUser';
import { usePresence } from './hooks/usePresence';
import { ic, DAYS, PARENT_CATEGORIES, PARENT_CATEGORY_KEYS } from './constants/categories';
import { getSGT, formatSGTDate, formatSGTTime } from './utils/time';

import { BootScreen, ParticleCanvas, FxCanvas, HudFrame, MouseGlow, Toast, showToast, triggerGlitch } from './components/Shared';
import { CalendarView } from './components/CalendarView';
import { BlockDrawer } from './components/BlockDrawer';
import { VisitList } from './components/VisitList';
import { Budget } from './components/Budget';
import { Review } from './components/Review';
import { CovertExport } from './components/CovertExport';
import { TeamRosterPanel } from './components/TeamRoster';
import { TravelDays } from './components/TravelDays';
import { isFirebaseConfigured, db } from './firebase';
import { ref, onValue } from 'firebase/database';

const MISSION_START = new Date('2026-05-18T00:00:00+08:00');

export default function App() {
  const { user, needsNickname, setNickname } = useUser();
  const { blocks, loaded, mode, addBlock, updateBlock, deleteBlock, duplicateBlock, addComment, hasAdjacentMove } = useBlocks(user?.name);
  const { otherOnlineUsers, setActiveBlock, getBlockEditor } = usePresence(user?.uid || null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [booted, setBooted] = useState(false);
  const [showCovert, setShowCovert] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [currentView, setCurrentView] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<string> | null>(null);
  const [wizardMode, setWizardMode] = useState(false);

  // Clocks
  const [sgtTime, setSgtTime] = useState('--:--:--');
  const [sgtDate, setSgtDate] = useState('----.--.--');
  const [countdown, setCountdown] = useState('--d --h --m');

  // Background sync: Firebase → localStorage for all data (ensures PDF has data)
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const syncs = [
      { path: 'budget', key: 'sg_mission_budget' },
      { path: 'review_v2', key: 'sg_mission_review_v2' },
      { path: 'roster', key: 'sg_mission_roster' },
      { path: 'travel', key: 'sg_mission_travel' },
      { path: 'visit_candidates', key: 'sg_mission_visits' },
    ];
    const unsubs = syncs.map(({ path, key }) =>
      onValue(ref(db!, path), (snap) => {
        const val = snap.val();
        if (val) {
          try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
        }
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    function tick() {
      const sgt = getSGT();
      setSgtTime(formatSGTTime(sgt));
      setSgtDate(formatSGTDate(sgt));
      const diff = MISSION_START.getTime() - Date.now();
      if (diff > 0) {
        const d = Math.floor(diff / 864e5);
        const h = Math.floor((diff % 864e5) / 36e5);
        const m = Math.floor((diff % 36e5) / 6e4);
        setCountdown(`${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`);
      } else {
        setCountdown('IN PROGRESS');
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Selected block
  const selectedBlock = useMemo(
    () => blocks.find(b => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );
  const drawerOpen = selectedBlock !== null;

  // Progress
  const confirmedVisits = useMemo(
    () => blocks.filter(b => b && b.category === 'visit' && b.detail?.trim()).length,
    [blocks]
  );
  const progressPct = Math.min(100, Math.round((confirmedVisits / 12) * 100));

  // Filter toggle
  const handleFilterToggle = useCallback((type: string) => {
    setFilterTypes(prev => {
      if (!prev) {
        // First click: show only this type
        return new Set([type]);
      }
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        return next.size === 0 ? null : next; // Reset if empty
      }
      next.add(type);
      return next;
    });
  }, []);

  const handleResetFilter = useCallback(() => setFilterTypes(null), []);

  // Clean up any current draft block (based on block.draft, NOT wizardMode)
  const cleanupDraft = useCallback(() => {
    if (selectedBlockId) {
      const block = blocks.find(b => b.id === selectedBlockId);
      if (block && block.draft) {
        deleteBlock(selectedBlockId);
        return true; // was cleaned
      }
    }
    return false;
  }, [selectedBlockId, blocks, deleteBlock]);

  // Block actions
  const handleSelectBlock = useCallback((id: string) => {
    // If clicking the SAME draft block, keep wizard open - do nothing
    if (selectedBlockId === id && wizardMode) return;

    // Clean up existing draft if switching to another block
    if (selectedBlockId && selectedBlockId !== id) {
      cleanupDraft();
    }

    const editor = getBlockEditor(id);
    if (editor) { showToast(`${editor} が編集中です`); return; }
    setSelectedBlockId(id);
    setWizardMode(false);
    setActiveBlock(id);
    if (activeTab === 'visits') {
      const block = blocks.find(b => b.id === id);
      if (block) {
        const dayIdx = parseInt(block.day[1]);
        setCurrentView(dayIdx < 2 ? 0 : 1);
        setActiveTab('schedule');
      }
    }
  }, [activeTab, blocks, getBlockEditor, setActiveBlock, selectedBlockId, wizardMode, cleanupDraft]);

  const handleCloseDrawer = useCallback((confirmed?: boolean) => {
    // Always delete draft blocks unless confirmed
    if (!confirmed) cleanupDraft();
    setSelectedBlockId(null);
    setWizardMode(false);
    setActiveBlock(null);
  }, [setActiveBlock, cleanupDraft]);

  const handleStartCreate = useCallback((day: string, team: string, start: string, dur: number) => {
    cleanupDraft();
    const newBlock = addBlock({ day: day as Block['day'], team: team as Block['team'], start, dur, draft: true, category: 'reserve', label: '' });
    setSelectedBlockId(newBlock.id);
    setWizardMode(true);
  }, [addBlock, cleanupDraft]);

  // Tab switch - clean up draft
  const handleTabSwitch = useCallback((tab: Tab) => {
    if (activeTab !== tab) {
      cleanupDraft();
      setSelectedBlockId(null);
      setWizardMode(false);
      setActiveBlock(null);
      triggerGlitch();
    }
    setActiveTab(tab);
  }, [activeTab, cleanupDraft, setActiveBlock]);

  // View toggle - clean up draft
  const handleViewToggle = useCallback((v: number) => {
    cleanupDraft();
    setSelectedBlockId(null);
    setWizardMode(false);
    setActiveBlock(null);
    setCurrentView(v);
  }, [cleanupDraft, setActiveBlock]);

  const handleAddBlock = useCallback((partial: Parameters<typeof addBlock>[0]) => {
    const newBlock = addBlock(partial);
    setSelectedBlockId(newBlock.id);
    showToast('DEPLOYED');
  }, [addBlock]);

  const handleUpdateBlock = useCallback((id: string, updates: Parameters<typeof updateBlock>[1]) => {
    updateBlock(id, updates);
  }, [updateBlock]);

  const handleDeleteBlock = useCallback((id: string) => {
    deleteBlock(id);
    setSelectedBlockId(null);
    setActiveBlock(null);
    showToast('DELETED');
  }, [deleteBlock, setActiveBlock]);

  const handleDuplicateBlock = useCallback((id: string) => {
    const newBlock = duplicateBlock(id);
    if (newBlock) {
      setSelectedBlockId(newBlock.id);
      showToast('DUPLICATED');
    }
  }, [duplicateBlock]);

  if (!loaded) return null;

  const TABS: { key: Tab; label: string; ico: string }[] = [
    { key: 'schedule', label: 'Schedule', ico: 'calendar' },
    { key: 'visits', label: 'Visit List', ico: 'list' },
    { key: 'budget', label: 'Budget', ico: 'dollar' },
    { key: 'review', label: 'Review', ico: 'edit' },
  ];

  const LEGEND_ITEMS = PARENT_CATEGORY_KEYS.map(key => ({
    key,
    label: PARENT_CATEGORIES[key].lbl,
    ico: PARENT_CATEGORIES[key].ico,
    cls: PARENT_CATEGORIES[key].cls,
  }));

  return (
    <>
      {!booted && <BootScreen onDone={() => setBooted(true)} />}
      <ParticleCanvas />
      <FxCanvas />
      <HudFrame />
      <MouseGlow />
      <Toast />

      {/* Covert Ops PDF Export */}
      {showCovert && <CovertExport blocks={blocks} onDone={() => { setShowCovert(false); showToast('DOCUMENT EXTRACTED'); }} />}

      {/* ═══ Nickname Modal ═══ */}
      {needsNickname && (
        <div className="modal-overlay" style={{ zIndex: 9998 }}>
          <div className="modal-panel" style={{ width: 360 }}>
            <h2>IDENTIFY YOURSELF</h2>
            <div className="drawer-field">
              <label>Nickname</label>
              <input type="text" value={nicknameInput} placeholder="例: 田中"
                onChange={e => setNicknameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && nicknameInput.trim()) setNickname(nicknameInput.trim()); }}
                autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary"
                onClick={() => nicknameInput.trim() && setNickname(nicknameInput.trim())}
                disabled={!nicknameInput.trim()}>
                ENTER
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`app ${booted ? '' : ''}`} style={{ opacity: booted ? 1 : 0, transition: 'opacity .6s' }}>
        {/* ═══ Header ═══ */}
        <div className="hd">
          <div>
            <h1>
              <span className="ic ic-xl" dangerouslySetInnerHTML={{ __html: ic('satellite') }} />
              {' '}SG MISSION // 2026
            </h1>
            <div className="meta">ARRIVAL 05.17 SUN 23:00 → DEPARTURE 05.21 THU ｜ 4 OPERATIVES ｜ TARGET: 8–12 VISITS</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Connection mode badge */}
            <span style={{
              fontFamily: 'Share Tech Mono, monospace', fontSize: 10, padding: '4px 10px',
              borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5,
              background: mode === 'firebase' ? '#10b98110' : 'var(--bg2)',
              color: mode === 'firebase' ? 'var(--neon-emerald)' : 'var(--text3)',
              border: `1px solid ${mode === 'firebase' ? '#10b98140' : 'var(--border)'}`,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                background: mode === 'firebase' ? 'var(--neon-emerald)' : 'var(--text3)',
                boxShadow: mode === 'firebase' ? '0 0 6px #10b98180' : 'none',
              }} />
              {mode === 'firebase' ? 'SYNCED' : 'LOCAL'}
            </span>

            {/* Online users */}
            {otherOnlineUsers.length > 0 && (
              <span style={{
                fontFamily: 'Share Tech Mono, monospace', fontSize: 10, padding: '4px 10px',
                borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5,
                background: '#3d8bfd10', color: 'var(--neon-blue)', border: '1px solid #3d8bfd30',
              }}>
                {otherOnlineUsers.map((name, i) => (
                  <span key={i} style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#3d8bfd30',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: 'var(--neon-blue)',
                  }}>{name[0]?.toUpperCase()}</span>
                ))}
                {otherOnlineUsers.join(', ')}
              </span>
            )}

            {/* Current user */}
            {user?.name && (
              <span style={{
                fontFamily: 'Share Tech Mono, monospace', fontSize: 10, padding: '4px 10px',
                borderRadius: 20, background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)',
              }}>
                {user.name}
              </span>
            )}

            <button className="btn" onClick={() => {
              const csv = 'Day,Start,End,Duration,Team,Type,Label,Detail,Location,Contact,Assignee,Memo\n' +
                blocks.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0)
                  .map(b => `${DAYS[parseInt(b.day[1])].date},${b.start},${b.dur},Team${b.team},${b.category}:${b.subType},"${b.label}","${b.detail}","${b.location}","${b.contact}","${b.assignee}","${b.memo}"`)
                  .join('\n');
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
              a.download = 'SG_MISSION_2026.csv'; a.click();
              showToast('CSV EXPORTED');
            }}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic('download') }} /> CSV
            </button>
            <button className="btn" onClick={() => setShowCovert(true)}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic('download') }} /> 工程表PDF
            </button>
          </div>
        </div>

        {/* ═══ Info Bar ═══ */}
        <div className="info-bar">
          <div className="info-card countdown">
            <div className="info-label">Mission Countdown</div>
            <div className="info-value">{countdown}</div>
            <div className="info-sub">until 2026.05.18</div>
          </div>
          <div className="info-card sgt">
            <div className="info-label">Singapore Time (SGT)</div>
            <div className="info-value">{sgtTime}</div>
            <div className="info-sub">{sgtDate}</div>
          </div>
          <div className="info-card" style={{ flex: '0 0 auto', paddingRight: 56 }}>
            <div className="info-label">System Status</div>
            <div className="info-value" style={{ fontSize: 13 }}>NOMINAL</div>
            <div className="info-sub">{blocks.length} blocks</div>
            <div className="radar-wrap"><div className="radar-ring"><div className="radar-sweep" /></div></div>
          </div>
        </div>

        {/* ═══ Progress ═══ */}
        <div className="progress-wrap">
          <div className="progress-header">
            <span className="progress-label">
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic('target') }} /> VISITS CONFIRMED
            </span>
            <span className="progress-count">{confirmedVisits}<span> / 12</span></span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* ═══ Tab Bar ═══ */}
        <div className="tab-bar">
          {TABS.map(tab => (
            <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => handleTabSwitch(tab.key as Tab)}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic(tab.ico) }} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Tab Content ═══ */}
        <div className="app-body">
          <div className={`app-main ${drawerOpen && activeTab === 'schedule' ? 'drawer-open' : ''}`}>
            {activeTab === 'schedule' && (
              <>
                {/* Legend (filterable) */}
                <div className="lg">
                  {LEGEND_ITEMS.map(item => {
                    const isActive = filterTypes ? filterTypes.has(item.key) : false;
                    const isDimmed = filterTypes && !filterTypes.has(item.key);
                    return (
                      <span key={item.key}
                        className={`lg-item bk-${item.cls} ${isActive ? 'active' : ''} ${isDimmed ? 'dimmed' : ''}`}
                        onClick={() => handleFilterToggle(item.key)}
                      >
                        <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic(item.ico) }} />
                        {item.label}
                      </span>
                    );
                  })}
                  {filterTypes && (
                    <span className="lg-item" onClick={handleResetFilter} style={{ color: 'var(--neon-cyan)' }}>
                      RESET
                    </span>
                  )}
                </div>

                {/* Travel Day Cards */}
                <TravelDays />

                {/* View Toggle */}
                <div className="view-toggle">
                  {[0, 1].map(v => (
                    <button key={v} className={currentView === v ? 'active' : ''} onClick={() => handleViewToggle(v)}>
                      {v === 0 ? '5/18 MON – 5/19 TUE' : '5/20 WED – 5/21 THU'}
                      <span className="phase">{v === 0 ? 'PHASE 1: VISITS' : 'PHASE 2: ATxSG'}</span>
                    </button>
                  ))}
                </div>

                {/* Team Roster */}
                <TeamRosterPanel visibleDays={currentView === 0 ? [0, 1] : [2, 3]} />

                <CalendarView
                  blocks={blocks}
                  currentView={currentView}
                  selectedId={selectedBlockId}
                  filterTypes={filterTypes}
                  getBlockEditor={getBlockEditor}
                  onSelectBlock={handleSelectBlock}
                  onUpdateBlock={handleUpdateBlock}
                  onStartCreate={handleStartCreate}
                />

                <div className="foot" style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
                  DRAG EMPTY: CREATE BLOCK ｜ CLICK BLOCK: OPEN DETAIL ｜ DRAG BLOCK: RESCHEDULE ｜ EDGE-DRAG: RESIZE ｜ LEGEND: FILTER
                </div>
              </>
            )}

            {activeTab === 'visits' && (
              <VisitList blocks={blocks} userName={user?.name} onAddBlock={addBlock} onSelectBlock={handleSelectBlock} />
            )}

            {activeTab === 'budget' && (
              <Budget userName={user?.name} />
            )}

            {activeTab === 'review' && (
              <Review userName={user?.name} />
            )}
          </div>

          {/* ═══ Block Drawer ═══ */}
          <BlockDrawer
            block={selectedBlock}
            open={drawerOpen}
            wizardMode={wizardMode}
            userName={user?.name}
            hasAdjacentMove={hasAdjacentMove}
            onClose={handleCloseDrawer}
            onUpdate={handleUpdateBlock}
            onDelete={handleDeleteBlock}
            onDuplicate={handleDuplicateBlock}
            onAddComment={addComment}
            onAddMovement={handleAddBlock}
          />
        </div>
      </div>
    </>
  );
}
