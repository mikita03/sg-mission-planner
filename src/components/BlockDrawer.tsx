import { useState, useEffect } from 'react';
import type { Block, ParentCategory } from '../types';
import { DAYS, getCatDisplay, ic, PARENT_CATEGORIES, PARENT_CATEGORY_KEYS } from '../constants/categories';
import { m2t, t2m } from '../utils/time';

type WizardStep = 'category' | 'details' | 'movement' | 'edit';

interface Props {
  block: Block | null;
  open: boolean;
  wizardMode: boolean;           // true = new block creation wizard
  userName?: string;
  hasAdjacentMove: (day: string, team: string, startMin: number, dir: 'before' | 'after') => boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddComment: (blockId: string, text: string) => void;
  onAddMovement: (partial: Partial<Block>) => void;
}

export function BlockDrawer({ block, open, wizardMode, userName, hasAdjacentMove, onClose, onUpdate, onDelete, onDuplicate, onAddComment, onAddMovement }: Props) {
  const [step, setStep] = useState<WizardStep>('category');
  const [commentText, setCommentText] = useState('');
  const [moveBefore, setMoveBefore] = useState({ add: false, subType: 'taxi', dur: 30, from: '' });
  const [moveAfter, setMoveAfter] = useState({ add: false, subType: 'taxi', dur: 30, to: '' });

  // Reset wizard step when block changes
  useEffect(() => {
    if (wizardMode && open) {
      setStep('category');
    } else if (open && !wizardMode) {
      setStep('edit');
    }
    setCommentText('');
    setMoveBefore({ add: false, subType: 'taxi', dur: 30, from: '' });
    setMoveAfter({ add: false, subType: 'taxi', dur: 30, to: '' });
  }, [block?.id, open, wizardMode]);

  if (!block) return null;
  const cat = getCatDisplay(block.category, block.subType);
  const endTime = m2t(t2m(block.start) + block.dur);
  const needsMove = block.category === 'visit' || block.category === 'food' || block.category === 'atxsg';
  const comments = Array.isArray(block.comments) ? block.comments : [];

  function handleChange(field: keyof Block, value: unknown) {
    onUpdate(block!.id, { [field]: value });
  }

  function handleCategorySelect(category: ParentCategory) {
    onUpdate(block!.id, { category, subType: '', label: PARENT_CATEGORIES[category].lbl });
    const pc = PARENT_CATEGORIES[category];
    if (pc.subTypes) {
      // Stay on category step to pick sub-type
    } else {
      setStep('details');
    }
  }

  function handleSubTypeSelect(subType: string) {
    const pc = PARENT_CATEGORIES[block!.category];
    const sub = pc?.subTypes?.[subType];
    onUpdate(block!.id, { subType, label: sub?.lbl || subType });
    setStep('details');
  }

  function handleDetailsNext() {
    if (needsMove) {
      // Check adjacent moves
      const startMin = t2m(block!.start);
      const endMin = startMin + block!.dur;
      const hasBefore = hasAdjacentMove(block!.day, block!.team, startMin, 'before');
      const hasAfter = hasAdjacentMove(block!.day, block!.team, endMin, 'after');
      if (!hasBefore || !hasAfter) {
        setMoveBefore(prev => ({ ...prev, add: false }));
        setMoveAfter(prev => ({ ...prev, add: false }));
        setStep('movement');
        return;
      }
    }
    // No movement needed, confirm
    handleConfirm();
  }

  function handleConfirm() {
    onUpdate(block!.id, { draft: false });
    // Add movement blocks if requested
    const startMin = t2m(block!.start);
    const endMin = startMin + block!.dur;
    if (moveBefore.add) {
      onAddMovement({
        day: block!.day, team: block!.team,
        category: 'move', subType: moveBefore.subType,
        start: m2t(startMin - moveBefore.dur), dur: moveBefore.dur,
        fromLocation: moveBefore.from, location: block!.location || block!.detail || '',
        label: getCatDisplay('move', moveBefore.subType).lbl,
        draft: false,
      });
    }
    if (moveAfter.add) {
      onAddMovement({
        day: block!.day, team: block!.team,
        category: 'move', subType: moveAfter.subType,
        start: m2t(endMin), dur: moveAfter.dur,
        fromLocation: block!.location || block!.detail || '', location: moveAfter.to,
        label: getCatDisplay('move', moveAfter.subType).lbl,
        draft: false,
      });
    }
    onClose();
  }

  function mapsUrl(location: string) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location + ' Singapore')}`;
  }

  function handleSendComment() {
    if (!commentText.trim()) return;
    onAddComment(block!.id, commentText.trim());
    setCommentText('');
  }

  // ═══ Step Indicator ═══
  const steps = wizardMode
    ? (needsMove ? ['category', 'details', 'movement'] : ['category', 'details'])
    : [];
  const stepIdx = steps.indexOf(step);

  return (
    <>
      <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        {open && <div className="drawer-scan" key={block.id} />}

        <div className="drawer-header">
          <h3>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic(cat.ico) }} />
            {wizardMode ? ' NEW BLOCK' : ' BLOCK DETAIL'}
          </h3>
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Step indicator */}
        {wizardMode && steps.length > 0 && (
          <div className="wizard-steps">
            {steps.map((s, i) => (
              <span key={s} className={`wizard-dot${i <= stepIdx ? ' active' : ''}`} />
            ))}
            <span className="wizard-label">
              {step === 'category' ? 'カテゴリ選択' : step === 'details' ? '詳細入力' : '移動設定'}
            </span>
          </div>
        )}

        <div className="drawer-body">
          {/* Time display (always visible) */}
          <div className="drawer-time-display">
            {block.start} – {endTime} ({block.dur}m) ｜ {DAYS[parseInt(block.day[1])]?.label} Team {block.team}
          </div>

          {/* ═══ STEP: Category Selection ═══ */}
          {step === 'category' && (
            <div className="wizard-category-grid">
              {PARENT_CATEGORY_KEYS.map(key => {
                const pc = PARENT_CATEGORIES[key];
                const isSelected = block.category === key;
                return (
                  <button key={key} className={`wizard-cat-btn bk-${pc.cls}${isSelected ? ' selected' : ''}`}
                    onClick={() => handleCategorySelect(key)}>
                    <span className="ic" dangerouslySetInnerHTML={{ __html: ic(pc.ico) }} />
                    <span>{pc.lbl}</span>
                  </button>
                );
              })}

              {/* Sub-type selection if parent has sub-types */}
              {block.category && PARENT_CATEGORIES[block.category]?.subTypes && (
                <div className="wizard-subtypes">
                  <div className="wizard-sub-label">種類を選択</div>
                  <div className="wizard-subtype-grid">
                    {Object.entries(PARENT_CATEGORIES[block.category].subTypes!).map(([key, sub]) => (
                      <button key={key} className={`wizard-sub-btn${block.subType === key ? ' selected' : ''}`}
                        onClick={() => handleSubTypeSelect(key)}>
                        <span className="ic" dangerouslySetInnerHTML={{ __html: ic(sub.ico) }} />
                        <span>{sub.lbl}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Details (category-specific) ═══ */}
          {step === 'details' && (
            <div className="wizard-details">
              {block.category === 'visit' && (
                <>
                  <div className="drawer-field"><label>企業名</label>
                    <input type="text" value={block.detail} placeholder="例: Grab Holdings" onChange={e => handleChange('detail', e.target.value)} autoFocus /></div>
                  <div className="drawer-field"><label>場所</label>
                    <input type="text" value={block.location} placeholder="例: One North" onChange={e => handleChange('location', e.target.value)} />
                    {block.location?.trim() && <a href={mapsUrl(block.location)} target="_blank" rel="noopener noreferrer" className="maps-link"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>MAPS</a>}
                  </div>
                  <div className="drawer-field"><label>連絡先</label>
                    <input type="text" value={block.contact} placeholder="メールまたは電話" onChange={e => handleChange('contact', e.target.value)} /></div>
                  <div className="drawer-field"><label>担当者</label>
                    <input type="text" value={block.assignee} placeholder="担当者名" onChange={e => handleChange('assignee', e.target.value)} /></div>
                </>
              )}
              {block.category === 'move' && (
                <>
                  <div className="drawer-field"><label>出発地</label>
                    <input type="text" value={block.fromLocation} placeholder="例: ホテル" onChange={e => handleChange('fromLocation', e.target.value)} autoFocus /></div>
                  <div className="drawer-field"><label>行先</label>
                    <input type="text" value={block.location} placeholder="例: 訪問先" onChange={e => handleChange('location', e.target.value)} /></div>
                </>
              )}
              {block.category === 'food' && (
                <>
                  <div className="drawer-field"><label>店名</label>
                    <input type="text" value={block.detail} placeholder="例: Lau Pa Sat" onChange={e => handleChange('detail', e.target.value)} autoFocus /></div>
                  <div className="drawer-field"><label>場所</label>
                    <input type="text" value={block.location} placeholder="例: Raffles Place" onChange={e => handleChange('location', e.target.value)} />
                    {block.location?.trim() && <a href={mapsUrl(block.location)} target="_blank" rel="noopener noreferrer" className="maps-link"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>MAPS</a>}
                  </div>
                </>
              )}
              {block.category === 'atxsg' && (
                <div className="drawer-field"><label>セッション名</label>
                  <input type="text" value={block.detail} placeholder="例: AI Innovation Summit" onChange={e => handleChange('detail', e.target.value)} autoFocus /></div>
              )}
              {block.category === 'sync' && (
                <div className="drawer-field"><label>議題</label>
                  <input type="text" value={block.detail} placeholder="例: 午前の振り返り" onChange={e => handleChange('detail', e.target.value)} autoFocus /></div>
              )}
              {(block.category === 'reserve' || block.category === 'review') && (
                <div className="drawer-field"><label>メモ</label>
                  <input type="text" value={block.memo} placeholder="用途など" onChange={e => handleChange('memo', e.target.value)} autoFocus /></div>
              )}

              {/* Label override */}
              <div className="drawer-field"><label>表示ラベル</label>
                <input type="text" value={block.label} placeholder="カレンダー表示名" onChange={e => handleChange('label', e.target.value)} /></div>

              <div className="wizard-nav">
                <button className="btn" onClick={() => setStep('category')}>← BACK</button>
                <button className="btn btn-primary" onClick={handleDetailsNext}>
                  {needsMove ? 'NEXT →' : '確定'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP: Movement Suggestion ═══ */}
          {step === 'movement' && (
            <div className="wizard-movement">
              <div className="wizard-move-title">移動ブロックを追加しますか？</div>

              {/* Before movement */}
              {!hasAdjacentMove(block.day, block.team, t2m(block.start), 'before') && (
                <div className="wizard-move-card">
                  <label className="wizard-move-toggle">
                    <input type="checkbox" checked={moveBefore.add} onChange={e => setMoveBefore(prev => ({ ...prev, add: e.target.checked }))} />
                    <span>この予定の<strong>前</strong>に移動を追加</span>
                  </label>
                  {moveBefore.add && (
                    <div className="wizard-move-fields">
                      <div className="drawer-field"><label>手段</label>
                        <select value={moveBefore.subType} onChange={e => setMoveBefore(prev => ({ ...prev, subType: e.target.value }))}>
                          <option value="taxi">タクシー</option><option value="mrt">MRT</option>
                          <option value="walk">徒歩</option><option value="flight">飛行機</option>
                        </select></div>
                      <div className="drawer-field"><label>所要時間</label>
                        <select value={moveBefore.dur} onChange={e => setMoveBefore(prev => ({ ...prev, dur: Number(e.target.value) }))}>
                          {[15,30,45,60,90].map(m => <option key={m} value={m}>{m}分</option>)}
                        </select></div>
                      <div className="drawer-field"><label>出発地</label>
                        <input type="text" value={moveBefore.from} placeholder="例: ホテル" onChange={e => setMoveBefore(prev => ({ ...prev, from: e.target.value }))} /></div>
                    </div>
                  )}
                </div>
              )}

              {/* After movement */}
              {!hasAdjacentMove(block.day, block.team, t2m(block.start) + block.dur, 'after') && (
                <div className="wizard-move-card">
                  <label className="wizard-move-toggle">
                    <input type="checkbox" checked={moveAfter.add} onChange={e => setMoveAfter(prev => ({ ...prev, add: e.target.checked }))} />
                    <span>この予定の<strong>後</strong>に移動を追加</span>
                  </label>
                  {moveAfter.add && (
                    <div className="wizard-move-fields">
                      <div className="drawer-field"><label>手段</label>
                        <select value={moveAfter.subType} onChange={e => setMoveAfter(prev => ({ ...prev, subType: e.target.value }))}>
                          <option value="taxi">タクシー</option><option value="mrt">MRT</option>
                          <option value="walk">徒歩</option><option value="flight">飛行機</option>
                        </select></div>
                      <div className="drawer-field"><label>所要時間</label>
                        <select value={moveAfter.dur} onChange={e => setMoveAfter(prev => ({ ...prev, dur: Number(e.target.value) }))}>
                          {[15,30,45,60,90].map(m => <option key={m} value={m}>{m}分</option>)}
                        </select></div>
                      <div className="drawer-field"><label>行先</label>
                        <input type="text" value={moveAfter.to} placeholder="例: 次の訪問先" onChange={e => setMoveAfter(prev => ({ ...prev, to: e.target.value }))} /></div>
                    </div>
                  )}
                </div>
              )}

              <div className="wizard-nav">
                <button className="btn" onClick={() => setStep('details')}>← BACK</button>
                <button className="btn btn-primary" onClick={handleConfirm}>確定</button>
              </div>
            </div>
          )}

          {/* ═══ EDIT MODE (existing block) ═══ */}
          {step === 'edit' && (
            <>
              {/* Category display + change */}
              <div className="drawer-field"><label>カテゴリ</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PARENT_CATEGORY_KEYS.map(key => {
                    const pc = PARENT_CATEGORIES[key];
                    return (
                      <button key={key} className={`wizard-cat-btn-sm bk-${pc.cls}${block.category === key ? ' selected' : ''}`}
                        onClick={() => {
                          handleChange('category', key);
                          handleChange('label', pc.lbl);
                          if (!pc.subTypes) handleChange('subType', '');
                        }}>
                        <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic(pc.ico) }} />
                        {pc.lbl}
                      </button>
                    );
                  })}
                </div>
                {PARENT_CATEGORIES[block.category]?.subTypes && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {Object.entries(PARENT_CATEGORIES[block.category].subTypes!).map(([key, sub]) => (
                      <button key={key} className={`wizard-sub-btn-sm${block.subType === key ? ' selected' : ''}`}
                        onClick={() => { handleChange('subType', key); handleChange('label', sub.lbl); }}>
                        {sub.lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Time */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="drawer-field" style={{ flex: 1 }}><label>Day</label>
                  <select value={block.day} onChange={e => handleChange('day', e.target.value)}>
                    {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select></div>
                <div className="drawer-field" style={{ flex: 1 }}><label>Team</label>
                  <select value={block.team} onChange={e => handleChange('team', e.target.value)}>
                    <option value="A">TEAM A</option><option value="B">TEAM B</option>
                  </select></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="drawer-field" style={{ flex: 1 }}><label>Start</label>
                  <input type="time" value={block.start} step={900} onChange={e => handleChange('start', e.target.value)} /></div>
                <div className="drawer-field" style={{ flex: 1 }}><label>Duration</label>
                  <select value={block.dur} onChange={e => handleChange('dur', Number(e.target.value))}>
                    {[15,30,45,60,90,120,180,240].map(m => <option key={m} value={m}>{m}m</option>)}
                  </select></div>
              </div>

              {/* Category-specific fields */}
              {block.category === 'visit' && (
                <>
                  <div className="drawer-field"><label>企業名</label><input type="text" value={block.detail} onChange={e => handleChange('detail', e.target.value)} /></div>
                  <div className="drawer-field"><label>場所</label>
                    <input type="text" value={block.location} onChange={e => handleChange('location', e.target.value)} />
                    {block.location?.trim() && <a href={mapsUrl(block.location)} target="_blank" rel="noopener noreferrer" className="maps-link"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>MAPS</a>}
                  </div>
                  <div className="drawer-field"><label>連絡先</label><input type="text" value={block.contact} onChange={e => handleChange('contact', e.target.value)} /></div>
                  <div className="drawer-field"><label>担当者</label><input type="text" value={block.assignee} onChange={e => handleChange('assignee', e.target.value)} /></div>
                </>
              )}
              {block.category === 'move' && (
                <>
                  <div className="drawer-field"><label>出発地</label><input type="text" value={block.fromLocation} onChange={e => handleChange('fromLocation', e.target.value)} /></div>
                  <div className="drawer-field"><label>行先</label><input type="text" value={block.location} onChange={e => handleChange('location', e.target.value)} /></div>
                </>
              )}
              {block.category === 'food' && (
                <>
                  <div className="drawer-field"><label>店名</label><input type="text" value={block.detail} onChange={e => handleChange('detail', e.target.value)} /></div>
                  <div className="drawer-field"><label>場所</label><input type="text" value={block.location} onChange={e => handleChange('location', e.target.value)} /></div>
                </>
              )}
              {(block.category === 'atxsg' || block.category === 'sync') && (
                <div className="drawer-field"><label>詳細</label><input type="text" value={block.detail} onChange={e => handleChange('detail', e.target.value)} /></div>
              )}

              {/* Label + Memo */}
              <div className="drawer-field"><label>表示ラベル</label><input type="text" value={block.label} onChange={e => handleChange('label', e.target.value)} /></div>
              <div className="drawer-field"><label>メモ</label><textarea value={block.memo} onChange={e => handleChange('memo', e.target.value)} /></div>

              {/* Draft toggle */}
              {block.draft && (
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => handleChange('draft', false)}>
                  <span className="ic" dangerouslySetInnerHTML={{ __html: ic('check') }} /> 確定する
                </button>
              )}

              {/* Comments */}
              <div className="comment-thread">
                <div className="comment-thread-title">
                  <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ic('edit') }} />
                  COMMENTS ({comments.length})
                </div>
                {comments.length > 0 && (
                  <div className="comment-list">
                    {comments.map(c => (
                      <div key={c.id} className="comment-item">
                        <div className="comment-author"><span>{c.author}</span>
                          <span className="comment-time">{new Date(c.timestamp).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                        <div className="comment-text">{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="comment-input-wrap">
                  <input className="comment-input" type="text" value={commentText}
                    placeholder={`${userName || 'You'} としてコメント...`}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendComment(); }} />
                  <button className="comment-send" onClick={handleSendComment} disabled={!commentText.trim()}>SEND</button>
                </div>
              </div>

              {/* Meta */}
              {block.editedAt > 0 && (
                <div className="drawer-meta">
                  {block.editedBy && `Edited by ${block.editedBy} · `}
                  {new Date(block.editedAt).toLocaleString('ja-JP')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer - only in edit mode */}
        {step === 'edit' && (
          <div className="drawer-footer">
            <button className="btn btn-danger" onClick={() => { onDelete(block.id); onClose(); }}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic('trash') }} /> DELETE
            </button>
            <button className="btn" onClick={() => onDuplicate(block.id)}>
              <span className="ic" dangerouslySetInnerHTML={{ __html: ic('copy') }} /> DUPLICATE
            </button>
          </div>
        )}
      </div>
    </>
  );
}
