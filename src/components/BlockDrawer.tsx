import { useState } from 'react';
import type { Block, BlockStatus } from '../types';
import { CAT, ALL_TYPES, DAYS, getCat, ic, ICONS } from '../constants/categories';
import { m2t, t2m } from '../utils/time';

const STATUS_OPTIONS: { value: BlockStatus; label: string }[] = [
  { value: 'pending', label: 'PENDING / 未定' },
  { value: 'confirmed', label: 'CONFIRMED / 確定' },
  { value: 'negotiating', label: 'NEGOTIATING / 交渉中' },
  { value: 'cancelled', label: 'CANCELLED / キャンセル' },
];

interface Props {
  block: Block | null;
  open: boolean;
  userName?: string;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddComment: (blockId: string, text: string) => void;
}

export function BlockDrawer({ block, open, userName, onClose, onUpdate, onDelete, onDuplicate, onAddComment }: Props) {
  const [commentText, setCommentText] = useState('');

  if (!block) return null;
  const cat = getCat(block.type);
  const endTime = m2t(t2m(block.start) + block.dur);
  const isVisitType = block.type === 'visit' || block.type === 'reserve';
  const comments = block.comments || [];

  function handleChange(field: keyof Block, value: unknown) {
    onUpdate(block!.id, { [field]: value });
  }

  function handleSendComment() {
    if (!commentText.trim()) return;
    onAddComment(block!.id, commentText.trim());
    setCommentText('');
  }

  function mapsUrl(location: string) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location + ' Singapore')}`;
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`}>
        {open && <div className="drawer-scan" key={block.id} />}

        <div className="drawer-header">
          <h3>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic(cat.ico) }} />
            {' '}BLOCK DETAIL
          </h3>
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="drawer-body">
          {/* Status Badge (visit/reserve only) */}
          {isVisitType && (
            <div className="drawer-field">
              <label>Status</label>
              <select value={block.status || 'pending'} onChange={e => handleChange('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {/* Category */}
          <div className="drawer-field">
            <label>Category</label>
            <select value={block.type} onChange={e => {
              const t = e.target.value;
              handleChange('type', t);
              handleChange('label', CAT[t]?.lbl || t);
            }}>
              {ALL_TYPES.map(k => <option key={k} value={k}>{CAT[k].lbl}</option>)}
            </select>
          </div>

          {/* Day & Team */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="drawer-field" style={{ flex: 1 }}>
              <label>Day</label>
              <select value={block.day} onChange={e => handleChange('day', e.target.value)}>
                {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div className="drawer-field" style={{ flex: 1 }}>
              <label>Team</label>
              <select value={block.team} onChange={e => handleChange('team', e.target.value)}>
                <option value="A">TEAM A</option>
                <option value="B">TEAM B</option>
              </select>
            </div>
          </div>

          {/* Time & Duration */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="drawer-field" style={{ flex: 1 }}>
              <label>Start</label>
              <input type="time" value={block.start} step={900} onChange={e => handleChange('start', e.target.value)} />
            </div>
            <div className="drawer-field" style={{ flex: 1 }}>
              <label>Duration</label>
              <select value={block.dur} onChange={e => handleChange('dur', Number(e.target.value))}>
                {[15,30,45,60,90,120,180,240].map(m => <option key={m} value={m}>{m}m</option>)}
              </select>
            </div>
          </div>

          <div style={{ opacity: 0.4, fontFamily: 'Share Tech Mono', fontSize: 11, marginBottom: 10 }}>
            {block.start} – {endTime} ({block.dur}m)
          </div>

          {/* Label */}
          <div className="drawer-field">
            <label>Label</label>
            <input type="text" value={block.label} onChange={e => handleChange('label', e.target.value)} />
          </div>

          {/* Visit fields */}
          {isVisitType && (
            <>
              <div className="drawer-field">
                <label>Company / Detail</label>
                <input type="text" value={block.detail} placeholder="企業名を入力" onChange={e => handleChange('detail', e.target.value)} />
              </div>
              <div className="drawer-field">
                <label>Location</label>
                <input type="text" value={block.location} placeholder="場所" onChange={e => handleChange('location', e.target.value)} />
                {block.location?.trim() && (
                  <a href={mapsUrl(block.location)} target="_blank" rel="noopener noreferrer" className="maps-link">
                    <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    OPEN IN GOOGLE MAPS
                  </a>
                )}
              </div>
              <div className="drawer-field">
                <label>Contact</label>
                <input type="text" value={block.contact} placeholder="連絡先" onChange={e => handleChange('contact', e.target.value)} />
              </div>
              <div className="drawer-field">
                <label>Assignee</label>
                <input type="text" value={block.assignee} placeholder="担当者" onChange={e => handleChange('assignee', e.target.value)} />
              </div>
            </>
          )}

          {/* Non-visit detail */}
          {!isVisitType && (
            <div className="drawer-field">
              <label>Detail</label>
              <input type="text" value={block.detail} placeholder="詳細" onChange={e => handleChange('detail', e.target.value)} />
            </div>
          )}

          {/* Memo */}
          <div className="drawer-field">
            <label>Memo</label>
            <textarea value={block.memo} placeholder="メモ" onChange={e => handleChange('memo', e.target.value)} />
          </div>

          {/* Comment Thread */}
          <div className="comment-thread">
            <div className="comment-thread-title">
              <span className="ic ic-sm" dangerouslySetInnerHTML={{ __html: ICONS.edit ? ic('edit') : '' }} />
              COMMENTS ({comments.length})
            </div>

            {comments.length > 0 && (
              <div className="comment-list">
                {comments.map(c => (
                  <div key={c.id} className="comment-item">
                    <div className="comment-author">
                      <span>{c.author}</span>
                      <span className="comment-time">{new Date(c.timestamp).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                    </div>
                    <div className="comment-text">{c.text}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="comment-input-wrap">
              <input
                className="comment-input"
                type="text"
                value={commentText}
                placeholder={`${userName || 'You'} としてコメント...`}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendComment(); }}
              />
              <button className="comment-send" onClick={handleSendComment} disabled={!commentText.trim()}>
                SEND
              </button>
            </div>
          </div>

          {/* Meta */}
          {block.editedAt > 0 && (
            <div className="drawer-meta">
              {block.editedBy && `Edited by ${block.editedBy} · `}
              {new Date(block.editedAt).toLocaleString('ja-JP')}
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="btn btn-danger" onClick={() => { onDelete(block.id); onClose(); }}>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic('trash') }} /> DELETE
          </button>
          <button className="btn" onClick={() => onDuplicate(block.id)}>
            <span className="ic" dangerouslySetInnerHTML={{ __html: ic('copy') }} /> DUPLICATE
          </button>
        </div>
      </div>
    </>
  );
}
