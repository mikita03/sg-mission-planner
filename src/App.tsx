import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Tab, Block } from './types';
import { useBlocks } from './hooks/useBlocks';
import { useUser } from './hooks/useUser';
import { usePresence } from './hooks/usePresence';
import { useIsMobile } from './hooks/useIsMobile';
import { ic, DAYS, PARENT_CATEGORIES, PARENT_CATEGORY_KEYS } from './constants/categories';
import { getSGT, formatSGTDate, formatSGTTime } from './utils/time';

import { BootScreen, ParticleCanvas, FxCanvas, HudFrame, MouseGlow, Toast, showToast, triggerGlitch } from './components/Shared';
import { LoginBackground } from './components/LoginBackground';
import { CalendarView } from './components/CalendarView';
import { BlockDrawer } from './components/BlockDrawer';
import { VisitList } from './components/VisitList';
import { Budget } from './components/Budget';
import { Review } from './components/Review';
import { CovertExport } from './components/CovertExport';
import { TeamRosterPanel } from './components/TeamRoster';
import { TravelDays } from './components/TravelDays';
import { isFirebaseConfigured, db } from './firebase';
import { ref, onValue, update } from 'firebase/database';
import authAssetImg from './assets/auth_asset.png';

const MISSION_START = new Date('2026-05-18T00:00:00+08:00');

export default function App() {
  const { user, needsLogin, needsPassphrase, passphraseError, justLoggedIn, pendingUser, signInWithGoogle, submitPassphrase, signInLocal, signOut, clearJustLoggedIn } = useUser();
  const { blocks, loaded, mode, addBlock, updateBlock, deleteBlock, duplicateBlock, addComment, hasAdjacentMove } = useBlocks(user?.name);
  const { otherOnlineUsers, setActiveBlock, getBlockEditor } = usePresence(user?.uid || null);
  const [localNameInput, setLocalNameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [booted, setBooted] = useState(false);
  const [showCovert, setShowCovert] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [currentView, setCurrentView] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<string> | null>(null);
  const [wizardMode, setWizardMode] = useState(false);
  const isMobile = useIsMobile();
  const [mobileDay, setMobileDay] = useState(0);
  const [clipboard, setClipboard] = useState<Block | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lightMode, setLightMode] = useState(false);

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
      { path: 'visit_tags', key: 'sg_mission_tags' },
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

  // 5-5: Remote change notification
  const prevBlocksRef = useRef<Map<string, number>>(new Map());
  const initRef = useRef(false);
  useEffect(() => {
    if (!loaded || !blocks.length) return;
    const prev = prevBlocksRef.current;
    if (!initRef.current) {
      // First load - just populate, don't notify
      blocks.forEach(b => prev.set(b.id, b.editedAt || 0));
      initRef.current = true;
      return;
    }
    const myName = user?.name || '';
    for (const b of blocks) {
      const oldAt = prev.get(b.id) || 0;
      if (b.editedAt && b.editedAt > oldAt && b.editedBy && b.editedBy !== myName) {
        showToast(`${b.editedBy} が「${b.label || b.category}」を更新`);
        break; // one toast per batch
      }
    }
    const next = new Map<string, number>();
    blocks.forEach(b => next.set(b.id, b.editedAt || 0));
    prevBlocksRef.current = next;
  }, [blocks, loaded, user?.name]);

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
    // 5-4: Clear blockId in visit_candidates that reference this block
    try {
      const raw = localStorage.getItem('sg_mission_visits');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const updated = arr.map((c: any) => c.blockId === id ? { ...c, blockId: '' } : c);
          localStorage.setItem('sg_mission_visits', JSON.stringify(updated));
          if (isFirebaseConfigured && db) {
            const obj: Record<string, any> = {};
            updated.forEach((c: any) => { obj[c.id] = c; });
            update(ref(db!, 'visit_candidates'), obj).catch(() => {});
          }
        }
      }
    } catch { /* */ }
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

  // 7-2: Copy & Paste
  const handleCopyBlock = useCallback((id: string) => {
    const block = blocks.find(b => b.id === id);
    if (block) { setClipboard({ ...block }); showToast('COPIED'); }
  }, [blocks]);

  const handlePasteBlock = useCallback((day: string, team: string) => {
    if (!clipboard) return;
    const { id: _id, draft: _d, editedBy: _e, editedAt: _a, comments: _c, ...rest } = clipboard;
    const newBlock = addBlock({ ...rest, day: day as Block['day'], team: team as Block['team'], draft: false });
    setSelectedBlockId(newBlock.id);
    showToast('PASTED');
  }, [clipboard, addBlock]);

  // 7-5: Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }
      if (e.key === 'Escape') { handleCloseDrawer(); setShowShortcuts(false); return; }
      if (e.key === 'c' && selectedBlockId) { handleCopyBlock(selectedBlockId); return; }
      if (e.key === 'Delete' && selectedBlockId) { const b = blocks.find(bl => bl.id === selectedBlockId); if (b && !b.draft) handleDeleteBlock(selectedBlockId); return; }
      if (e.key === '1') handleTabSwitch('schedule');
      if (e.key === '2') handleTabSwitch('visits');
      if (e.key === '3') handleTabSwitch('budget');
      if (e.key === '4') handleTabSwitch('review');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBlockId, handleCopyBlock, handleDeleteBlock, handleCloseDrawer, handleTabSwitch, blocks]);

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
      {/* Boot screen — only after login */}
      {user && !booted && !justLoggedIn && <BootScreen onDone={() => setBooted(true)} />}

      {/* ACCESS GRANTED animation */}
      {justLoggedIn && (
        <div className="modal-overlay" style={{ zIndex: 9997, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', animation: 'authPanelIn .5s ease' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid var(--neon-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 0 30px rgba(16,185,129,.4), inset 0 0 20px rgba(16,185,129,.1)', animation: 'pulse-cyan 1.5s infinite' }}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--neon-emerald)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 24, color: 'var(--neon-emerald)', letterSpacing: '.15em', marginBottom: 8, textShadow: '0 0 20px rgba(16,185,129,.5)' }}>ACCESS GRANTED</div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
              Welcome, {user?.name || 'Operative'}
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', letterSpacing: '.08em' }}>
              CLEARANCE LEVEL: AUTHORIZED
            </div>
            <button className="btn" style={{ marginTop: 24, padding: '10px 40px', fontSize: 13, letterSpacing: '.1em', borderColor: 'var(--neon-emerald)', color: 'var(--neon-emerald)' }}
              onClick={() => { clearJustLoggedIn(); setBooted(false); }}>
              PROCEED TO MISSION
            </button>
          </div>
        </div>
      )}
      {/* Background — different for login vs app */}
      {!user ? <LoginBackground /> : (
        <>
          <ParticleCanvas />
          <FxCanvas />
          <HudFrame />
          <MouseGlow />
        </>
      )}
      <Toast />

      {/* Covert Ops PDF Export */}
      {showCovert && <CovertExport blocks={blocks} onDone={() => { setShowCovert(false); showToast('DOCUMENT EXTRACTED'); }} />}

      {/* ═══ Passphrase Verification ═══ */}
      {needsPassphrase && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-panel auth-verify-panel" style={{ width: 400, textAlign: 'center', padding: 0, overflow: 'hidden', border: '1px solid var(--neon-cyan)', boxShadow: '0 0 40px rgba(0,229,255,.15), inset 0 0 30px rgba(0,229,255,.03)' }}>
            {/* Header bar */}
            <div style={{ background: 'linear-gradient(90deg, rgba(0,229,255,.15), transparent, rgba(0,229,255,.15))', padding: '14px 20px', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, color: 'var(--neon-cyan)', letterSpacing: '.2em' }}>▸ IDENTITY VERIFICATION PROTOCOL</div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px 20px' }}>
              {pendingUser && (
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 16, padding: '4px 10px', background: 'var(--bg)', borderRadius: 20, display: 'inline-block' }}>
                  {pendingUser.email}
                </div>
              )}

              {/* Image with scan effect */}
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                <img src={authAssetImg} alt="Identify" style={{ width: 150, height: 150, borderRadius: 12, border: '2px solid var(--neon-cyan)', objectFit: 'cover', boxShadow: '0 0 20px rgba(0,229,255,.2)' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, background: 'linear-gradient(180deg, transparent 0%, transparent 45%, rgba(0,229,255,.08) 50%, transparent 55%, transparent 100%)', backgroundSize: '100% 200%', animation: 'scanMove 3s linear infinite' }} />
                <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--neon-cyan)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border2)', letterSpacing: '.1em' }}>TARGET</div>
              </div>

              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--text)', marginBottom: 6, letterSpacing: '.06em' }}>
                What is this character's name?
              </div>
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text3)', marginBottom: 16 }}>
                正しい名前を入力してアクセス権を取得
              </div>

              <input type="text" value={passphraseInput} placeholder="Enter name..."
                onChange={e => { setPassphraseInput(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter' && passphraseInput.trim()) submitPassphrase(passphraseInput.trim()); }}
                style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', border: `1px solid ${passphraseError ? 'var(--neon-red)' : 'var(--neon-cyan)'}`, borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Share Tech Mono', fontSize: 16, textAlign: 'center', marginBottom: 10, boxShadow: passphraseError ? '0 0 10px rgba(239,68,68,.2)' : '0 0 10px rgba(0,229,255,.1)', outline: 'none', letterSpacing: '.05em' }}
                autoFocus />
              {passphraseError && (
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--neon-red)', marginBottom: 8, animation: 'fadeIn .3s' }}>⚠ IDENTIFICATION FAILED — TRY AGAIN</div>
              )}
              <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14, letterSpacing: '.1em' }}
                onClick={() => passphraseInput.trim() && submitPassphrase(passphraseInput.trim())}
                disabled={!passphraseInput.trim()}>AUTHENTICATE</button>
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px', background: 'rgba(0,0,0,.2)' }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Share Tech Mono', fontSize: 10, letterSpacing: '.06em' }} onClick={signOut}>
                ← 別のアカウントでログイン
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Login — Full screen cyberpunk ═══ */}
      {needsLogin && !needsPassphrase && (
        <div className="login-screen">
          {/* Scanline overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,.02) 2px, rgba(0,229,255,.02) 4px)', pointerEvents: 'none', zIndex: 1 }} />

          {/* HUD corners */}
          <div style={{ position: 'absolute', top: 20, left: 20, width: 40, height: 40, borderTop: '2px solid var(--neon-cyan)', borderLeft: '2px solid var(--neon-cyan)', opacity: .4 }} />
          <div style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderTop: '2px solid var(--neon-cyan)', borderRight: '2px solid var(--neon-cyan)', opacity: .4 }} />
          <div style={{ position: 'absolute', bottom: 20, left: 20, width: 40, height: 40, borderBottom: '2px solid var(--neon-cyan)', borderLeft: '2px solid var(--neon-cyan)', opacity: .4 }} />
          <div style={{ position: 'absolute', bottom: 20, right: 20, width: 40, height: 40, borderBottom: '2px solid var(--neon-cyan)', borderRight: '2px solid var(--neon-cyan)', opacity: .4 }} />

          {/* Top bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--neon-cyan), transparent)', opacity: .5 }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--neon-cyan), transparent)', opacity: .3 }} />

          <div className="login-content">
            {/* Title */}
            <div className="login-icon">
              <span className="ic ic-xl" dangerouslySetInnerHTML={{ __html: ic('satellite') }} />
            </div>
            <div className="login-title">SG MISSION</div>
            <div className="login-subtitle">SINGAPORE 2026 // OPERATIONS PLANNER</div>

            {/* Terminal lines */}
            <div className="login-terminal">
              <div className="login-line l1">[SYS] Secure connection established</div>
              <div className="login-line l2">[NET] Encryption: AES-256-GCM</div>
              <div className="login-line l3">[AUTH] Awaiting operator credentials...</div>
            </div>

            {/* Login button */}
            <div className="login-action">
              <button className="btn btn-primary login-btn" onClick={signInWithGoogle}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                AUTHENTICATE WITH GOOGLE
              </button>
            </div>

            {!isFirebaseConfigured && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text3)' }}>DEV MODE</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={localNameInput} placeholder="ニックネーム（開発用）"
                    onChange={e => setLocalNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && localNameInput.trim()) signInLocal(localNameInput.trim()); }}
                    style={{ flex: 1, padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'Rajdhani', fontSize: 14 }} />
                  <button className="btn" onClick={() => localNameInput.trim() && signInLocal(localNameInput.trim())} disabled={!localNameInput.trim()}>ENTER</button>
                </div>
              </div>
            )}

            <div className="login-footer">
              CLASSIFIED // AUTHORIZED PERSONNEL ONLY
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
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />}
                {user.name}
                {user.email && <button onClick={signOut} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '0 2px' }} title="ログアウト">✕</button>}
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
            <button className="btn" onClick={() => {
              const next = !lightMode;
              setLightMode(next);
              document.body.classList.toggle('light-mode', next);
              triggerGlitch();
              showToast(next ? 'LIGHT MODE' : 'DARK MODE');
            }} style={{ padding: '6px 10px' }}>
              {lightMode ? '🌙' : '☀️'}
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
                {!isMobile ? (
                  <div className="view-toggle">
                    {[0, 1].map(v => (
                      <button key={v} className={currentView === v ? 'active' : ''} onClick={() => handleViewToggle(v)}>
                        {v === 0 ? '5/18 MON – 5/19 TUE' : '5/20 WED – 5/21 THU'}
                        <span className="phase">{v === 0 ? 'PHASE 1: VISITS' : 'PHASE 2: ATxSG'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mobile-day-selector">
                    {DAYS.map((d, i) => (
                      <button key={i} className={mobileDay === i ? 'active' : ''} onClick={() => setMobileDay(i)}>
                        {d.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}

                {/* Team Roster */}
                {!isMobile && <TeamRosterPanel visibleDays={currentView === 0 ? [0, 1] : [2, 3]} />}

                {/* 7-2: Paste Banner */}
                {clipboard && (
                  <div className="paste-banner">
                    <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('copy') }} />
                    <span>「{clipboard.label || clipboard.category}」をコピー中</span>
                    <select id="paste-day" defaultValue={isMobile ? `d${mobileDay}` : `d${currentView * 2}`}>
                      {DAYS.map(d => <option key={d.key} value={d.key}>{d.label.split(' ')[0]}</option>)}
                    </select>
                    <select id="paste-team" defaultValue="A">
                      <option value="A">Team A</option><option value="B">Team B</option>
                    </select>
                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => {
                      const day = (document.getElementById('paste-day') as HTMLSelectElement).value;
                      const team = (document.getElementById('paste-team') as HTMLSelectElement).value;
                      handlePasteBlock(day, team);
                    }}>PASTE</button>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setClipboard(null)}>✕</button>
                  </div>
                )}

                <CalendarView
                  blocks={blocks}
                  currentView={currentView}
                  selectedId={selectedBlockId}
                  filterTypes={filterTypes}
                  isMobile={isMobile}
                  mobileDay={mobileDay}
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
              <Budget userName={user?.name} isMobile={isMobile} />
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
            onCopy={handleCopyBlock}
            onAddComment={addComment}
            onAddMovement={handleAddBlock}
          />
        </div>
      </div>

      {/* 7-5: Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowShortcuts(false)}>
          <div className="modal-panel" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: 'Orbitron, monospace', fontSize: 14, color: 'var(--neon-cyan)', letterSpacing: '.1em' }}>KEYBOARD SHORTCUTS</h2>
              <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setShowShortcuts(false)}>CLOSE</button>
            </div>
            <div className="shortcut-list">
              {[
                ['?', 'ショートカット一覧を表示'],
                ['Esc', '選択解除 / ドロワーを閉じる'],
                ['c', '選択中ブロックをコピー'],
                ['Delete', '選択中ブロックを削除'],
                ['1-4', 'タブ切替（Schedule / Visits / Budget / Review）'],
              ].map(([key, desc]) => (
                <div key={key} className="shortcut-row">
                  <kbd>{key}</kbd>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Mobile Bottom Nav (6-5) ═══ */}
      {isMobile && (
        <nav className="bottom-nav">
          {TABS.map(tab => (
            <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => handleTabSwitch(tab.key as Tab)}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic(tab.ico) }} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
