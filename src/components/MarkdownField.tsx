import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export function MarkdownField({ value, onChange, placeholder, label, readOnly, minHeight = 60 }: Props) {
  const [editing, setEditing] = useState(false);

  if (readOnly) {
    return (
      <div className="md-preview">
        {value ? <ReactMarkdown>{value}</ReactMarkdown> : <span className="md-empty">{placeholder || '—'}</span>}
      </div>
    );
  }

  return (
    <div className="drawer-field">
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label>{label}</label>
          <button
            type="button"
            className="md-toggle"
            onClick={() => setEditing(!editing)}
          >
            {editing ? '▣ Preview' : '✎ Edit'}
          </button>
        </div>
      )}

      {editing ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Markdown記法が使えます（**太字**, - リスト, ## 見出し）'}
          style={{ minHeight }}
          autoFocus
        />
      ) : (
        <div className="md-preview" onClick={() => setEditing(true)} style={{ minHeight, cursor: 'text' }}>
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <span className="md-empty">{placeholder || 'クリックして入力...'}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline markdown renderer for preview/read-only contexts */
export function MdText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="md-preview md-inline">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
