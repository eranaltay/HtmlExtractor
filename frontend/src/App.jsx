import { useState } from 'react';

const FIELD_TYPE_LABELS = {
  text: 'Text',
  email: 'Email',
  number: 'Number',
  tel: 'Phone',
  url: 'URL',
  password: 'Password',
  date: 'Date',
  textarea: 'Textarea',
  select: 'Select / Dropdown',
  checkbox: 'Checkbox',
  radio: 'Radio',
  search: 'Search',
  color: 'Color',
  range: 'Range',
  file: 'File',
};

function FieldRow({ field, index }) {
  const typeLabel = FIELD_TYPE_LABELS[field.type] || field.type;
  const isEmpty = !field.value || field.value === 'unchecked';

  return (
    <tr style={{ background: index % 2 === 0 ? '#fafafa' : '#fff' }}>
      <td style={td}>{field.header || <span style={muted}>—</span>}</td>
      <td style={td}>{field.name || <span style={muted}>—</span>}</td>
      <td style={{ ...td, color: '#555' }}>{typeLabel}</td>
      <td
        style={{
          ...td,
          direction: /[\u0590-\u05FF]/.test(field.value) ? 'rtl' : 'ltr',
          color: isEmpty ? '#bbb' : '#111',
          fontStyle: isEmpty ? 'italic' : 'normal',
        }}
      >
        {isEmpty
          ? field.value === 'unchecked'
            ? '☐ unchecked'
            : '(empty)'
          : field.value === 'checked'
          ? '☑ checked'
          : field.value}
      </td>
    </tr>
  );
}

function UrlResult({ result }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={card}>
      <div
        style={cardHeader}
        onClick={() => setOpen((o) => !o)}
        title="Click to expand/collapse"
      >
        <span style={{ fontSize: 13, marginRight: 8, opacity: 0.6 }}>
          {open ? '▼' : '▶'}
        </span>
        <span style={urlText}>{result.url}</span>
        <span
          style={{
            ...badge,
            background: result.status === 'ok' ? '#d4edda' : '#f8d7da',
            color: result.status === 'ok' ? '#155724' : '#721c24',
          }}
        >
          {result.status === 'ok'
            ? `${result.fields.length} fields`
            : result.error}
        </span>
      </div>

      {open && result.status === 'ok' && result.fields.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={th}>Header / Label</th>
                <th style={th}>Field Name</th>
                <th style={th}>Type</th>
                <th style={th}>Value</th>
              </tr>
            </thead>
            <tbody>
              {result.fields.map((f, i) => (
                <FieldRow key={i} field={f} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && result.status === 'ok' && result.fields.length === 0 && (
        <p style={{ padding: '12px 16px', color: '#888', margin: 0 }}>
          No form fields found on this page.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [urlPrefix, setUrlPrefix] = useState('');
  const [suffixesRaw, setSuffixesRaw] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const suffixes = suffixesRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleExtract(e) {
    e.preventDefault();
    setError('');
    setResults([]);

    if (!urlPrefix.trim()) {
      setError('Please enter a URL prefix.');
      return;
    }
    if (suffixes.length === 0) {
      setError('Please enter at least one URL suffix.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlPrefix: urlPrefix.trim(), suffixes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setUrlPrefix('');
    setSuffixesRaw('');
    setResults([]);
    setError('');
  }

  return (
    <div style={root}>
      <h1 style={h1}>HTML Field Extractor</h1>
      <p style={subtitle}>
        Enter a URL prefix and a list of suffixes. The app will fetch each page
        and extract form field values with their nearest label/header.
      </p>

      <form onSubmit={handleExtract} style={formStyle}>
        <div style={formGroup}>
          <label style={label} htmlFor="urlPrefix">
            URL Prefix
          </label>
          <input
            id="urlPrefix"
            type="text"
            value={urlPrefix}
            onChange={(e) => setUrlPrefix(e.target.value)}
            placeholder="https://example.com/forms"
            style={inputStyle}
            dir="ltr"
          />
          <small style={hint}>
            e.g. <code>https://example.com</code> — suffixes will be appended
            with <code>/</code>
          </small>
        </div>

        <div style={formGroup}>
          <label style={label} htmlFor="suffixes">
            URL Suffixes{' '}
            <span style={muted}>(one per line)</span>
          </label>
          <textarea
            id="suffixes"
            value={suffixesRaw}
            onChange={(e) => setSuffixesRaw(e.target.value)}
            placeholder={`/contact\n/about\n/register`}
            style={{ ...inputStyle, height: 120, resize: 'vertical', fontFamily: 'monospace' }}
            dir="ltr"
          />
          {suffixes.length > 0 && (
            <small style={hint}>
              {suffixes.length} URL{suffixes.length !== 1 ? 's' : ''} queued
            </small>
          )}
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={loading} style={btnPrimary}>
            {loading ? 'Extracting…' : 'Extract Fields'}
          </button>
          <button type="button" onClick={handleClear} style={btnSecondary}>
            Clear
          </button>
        </div>
      </form>

      {loading && (
        <div style={loadingBox}>
          <div style={spinner} />
          Fetching {suffixes.length} page{suffixes.length !== 1 ? 's' : ''}…
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={h2}>
            Results{' '}
            <span style={muted}>
              ({results.length} page{results.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {results.map((r, i) => (
            <UrlResult key={i} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const root = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '32px 20px 80px',
  fontFamily: "'Segoe UI', Arial, sans-serif",
  color: '#222',
};

const h1 = { fontSize: 26, fontWeight: 700, marginBottom: 6 };
const h2 = { fontSize: 20, fontWeight: 600, marginBottom: 16 };
const subtitle = { color: '#555', marginBottom: 28, lineHeight: 1.5 };

const formStyle = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '24px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const formGroup = { display: 'flex', flexDirection: 'column', gap: 6 };

const label = { fontWeight: 600, fontSize: 14 };

const inputStyle = {
  border: '1px solid #ccc',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const hint = { color: '#888', fontSize: 12 };
const muted = { color: '#999', fontWeight: 400 };

const errorBox = {
  background: '#fff3cd',
  border: '1px solid #ffc107',
  borderRadius: 6,
  padding: '10px 14px',
  color: '#856404',
  fontSize: 14,
};

const btnPrimary = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 22px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary = {
  background: '#f1f5f9',
  color: '#444',
  border: '1px solid #ccc',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer',
};

const loadingBox = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 0',
  color: '#555',
};

const spinner = {
  width: 18,
  height: 18,
  border: '2px solid #ccc',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

const card = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  marginBottom: 16,
  overflow: 'hidden',
};

const cardHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  background: '#f8fafc',
  cursor: 'pointer',
  borderBottom: '1px solid #e2e8f0',
  userSelect: 'none',
};

const urlText = {
  flex: 1,
  fontSize: 13,
  fontFamily: 'monospace',
  wordBreak: 'break-all',
};

const badge = {
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const table = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const th = {
  textAlign: 'left',
  padding: '8px 14px',
  fontWeight: 600,
  borderBottom: '1px solid #e2e8f0',
  color: '#444',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const td = {
  padding: '8px 14px',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'top',
  wordBreak: 'break-word',
};
