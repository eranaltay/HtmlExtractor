import React, { useState } from 'react';
import './App.css';

const BACKEND = '/extract';

export default function App() {
  const [prefix, setPrefix] = useState('');
  const [suffixesText, setSuffixesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const handleExtract = async (e) => {
    e.preventDefault();
    setError('');
    setResults(null);

    const suffixes = suffixesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!prefix.trim()) {
      setError('Please enter a URL prefix.');
      return;
    }
    if (suffixes.length === 0) {
      setError('Please enter at least one URL suffix.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(BACKEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: prefix.trim(), suffixes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>HTML Field Extractor</h1>
        <p>Enter a URL prefix and one or more suffixes to extract form field values from each page.</p>
      </header>

      <form className="card" onSubmit={handleExtract}>
        <div className="form-group">
          <label htmlFor="prefix">URL Prefix</label>
          <input
            id="prefix"
            type="url"
            placeholder="https://example.com/forms"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            dir="auto"
          />
          <span className="hint">The base URL shared by all pages</span>
        </div>

        <div className="form-group">
          <label htmlFor="suffixes">URL Suffixes <small>(one per line)</small></label>
          <textarea
            id="suffixes"
            rows={6}
            placeholder={`/page-1\n/page-2\n/page-3`}
            value={suffixesText}
            onChange={(e) => setSuffixesText(e.target.value)}
            dir="auto"
          />
          <span className="hint">
            Each suffix will be appended to the prefix to form a full URL
          </span>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Extracting…' : 'Extract Fields'}
        </button>
      </form>

      {results && (
        <section className="results">
          <h2>Results <span className="badge">{results.length} URL{results.length !== 1 ? 's' : ''}</span></h2>
          {results.map((r) => (
            <UrlResult key={r.url} result={r} />
          ))}
        </section>
      )}
    </div>
  );
}

function UrlResult({ result }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`url-card ${result.success ? '' : 'url-card--error'}`}>
      <button className="url-card__header" onClick={() => setOpen((o) => !o)}>
        <span className="url-label" dir="auto">{result.url}</span>
        <span className="toggle-icon">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="url-card__body">
          {!result.success ? (
            <p className="fetch-error">Failed to fetch: {result.error}</p>
          ) : result.fields.length === 0 ? (
            <p className="no-fields">No form fields found on this page.</p>
          ) : (
            <table className="fields-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Header / Label</th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Value / Selection</th>
                </tr>
              </thead>
              <tbody>
                {result.fields.map((field, i) => (
                  <FieldRow key={i} index={i + 1} field={field} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ index, field }) {
  let valueCell;

  if (field.type === 'select') {
    const selected = field.selectedValues;
    valueCell = (
      <span dir="auto">
        {selected.length > 0 ? (
          selected.map((v, i) => (
            <span key={i} className="tag">{v}</span>
          ))
        ) : (
          <em className="muted">none selected</em>
        )}
      </span>
    );
  } else if (field.type === 'checkbox' || field.type === 'radio') {
    valueCell = (
      <span className={`bool-badge ${field.checked ? 'bool-badge--yes' : 'bool-badge--no'}`}>
        {field.checked ? 'Checked' : 'Unchecked'}
        {field.value ? ` (${field.value})` : ''}
      </span>
    );
  } else {
    valueCell = (
      <span dir="auto" className={field.value ? '' : 'muted'}>
        {field.value || <em>(empty)</em>}
      </span>
    );
  }

  return (
    <tr>
      <td className="col-idx">{index}</td>
      <td dir="auto" className="col-header">{field.header}</td>
      <td><span className="type-badge">{field.type}</span></td>
      <td dir="auto" className="col-name">{field.name || <em className="muted">—</em>}</td>
      <td>{valueCell}</td>
    </tr>
  );
}
