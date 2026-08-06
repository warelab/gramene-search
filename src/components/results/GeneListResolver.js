import React, { useMemo, useState } from 'react';
import { Button, Form, Badge } from 'react-bootstrap';
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';
import './geneList.css';

// Conflict rows rendered before the "show N more" cap, mirroring the Refine
// sidebar's INITIAL_VISIBLE. A large paste can produce hundreds of conflicts.
const INITIAL_VISIBLE = 25;
// Candidates shown per row before collapsing. Nothing guarantees 15 is the ceiling.
const MAX_CANDIDATES = 50;
// Genome bulk buttons offered. More than this and the toolbar is worse than the rows.
const MAX_GENOME_ACTIONS = 6;

// A collapsible bucket with a count, following facets/FacetCounts.js FacetGroup.
// An empty bucket renders nothing rather than an empty heading.
const Bucket = ({ title, count, tone, defaultOpen, actions, children }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!count) return null;
  return (
    <div className={`glr-bucket glr-bucket-${tone}`}>
      <div className="glr-bucket-header" onClick={() => setOpen(!open)}>
        <span className="glr-caret">{open ? <BsChevronDown /> : <BsChevronRight />}</span>
        <span className="glr-bucket-title">{title}</span>
        <span className="glr-bucket-count">{count.toLocaleString()}</span>
        {actions && <span className="glr-bucket-actions">{actions}</span>}
      </div>
      {open && <div className="glr-bucket-body">{children}</div>}
    </div>
  );
};

/** "sorghum_bicolort2tcas" -> "Sorghum bicolort2tcas" */
function speciesLabel(systemName) {
  if (!systemName) return null;
  const s = systemName.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pure resolver for a validation response.
 *
 * `choices` is keyed by INDEX into `ambiguous`, not by the input string: a pasted
 * token can be anything, and `obj['__proto__'] = [...]` on a plain object sets the
 * prototype instead of a key.
 *
 * An index with NO entry keeps *all* of that input's matches — the "nothing is
 * silently dropped" default. An index mapped to `[]` means the user explicitly
 * dropped the row, which is why every read tests `undefined` rather than falsiness.
 */
const GeneListResolver = ({ validation, choices, meta, onChange }) => {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState({});

  const { resolved, ambiguous, unknown } = validation;

  const keptFor = (i, a) => (choices[i] === undefined ? a.matches : choices[i]);

  const setKept = (i, a, next) => {
    const c = { ...choices };
    // Drop back to the default when everything is kept, so "untouched" and
    // "explicitly kept all" stay indistinguishable and the state stays small.
    if (next.length === a.matches.length) delete c[i];
    else c[i] = next;
    onChange(c);
  };

  const toggle = (i, a, id) => {
    const cur = keptFor(i, a);
    setKept(i, a, cur.indexOf(id) === -1 ? [...cur, id] : cur.filter(x => x !== id));
  };

  /**
   * Which genomes would actually narrow something.
   *
   * A plain "prefer sorghum" button is useless on this index: 94 of its ~100
   * genomes are sorghum accessions, so a conflict like Sobic.001G000200 — whose
   * candidates are sorghum_bicolor and sorghum_bicolort2tcas — is entirely
   * sorghum on both sides. The useful axis is the individual genome, and only
   * those that would change a row are worth offering.
   */
  const genomeActions = useMemo(() => {
    const tally = new Map();
    ambiguous.forEach(a => {
      const names = new Set();
      a.matches.forEach(id => { const d = meta[id]; if (d && d.system_name) names.add(d.system_name); });
      names.forEach(sn => {
        const kept = a.matches.filter(id => meta[id] && meta[id].system_name === sn);
        // Only counts if it narrows: keeping every candidate is a no-op.
        if (kept.length && kept.length < a.matches.length) {
          tally.set(sn, (tally.get(sn) || 0) + 1);
        }
      });
    });
    return [...tally.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, MAX_GENOME_ACTIONS);
  }, [ambiguous, meta]);

  const applyGenome = (systemName) => (e) => {
    e.stopPropagation();
    const c = { ...choices };
    ambiguous.forEach((a, i) => {
      const kept = a.matches.filter(id => meta[id] && meta[id].system_name === systemName);
      // Rows with no candidate in this genome are left exactly as they are,
      // rather than emptied.
      if (kept.length && kept.length < a.matches.length) c[i] = kept;
    });
    onChange(c);
  };

  const bulk = (mode) => (e) => {
    // These buttons sit inside the clickable header; don't collapse the section.
    e.stopPropagation();
    if (mode === 'all') return onChange({});
    const c = {};
    ambiguous.forEach((a, i) => {
      if (mode === 'first' && a.matches.length > 1) c[i] = [a.matches[0]];
      if (mode === 'none') c[i] = [];
    });
    onChange(c);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withIndex = ambiguous.map((a, i) => ({ a, i }));
    if (!q) return withIndex;
    return withIndex.filter(({ a }) =>
      a.input.toLowerCase().indexOf(q) !== -1 ||
      a.matches.some(id => id.toLowerCase().indexOf(q) !== -1)
    );
  }, [ambiguous, query]);

  const shown = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  const candidate = (i, a, id) => {
    const doc = meta[id];
    const kept = keptFor(i, a).indexOf(id) !== -1;
    const species = speciesLabel(doc && doc.system_name);
    return (
      <label key={id} className={`glr-candidate${kept ? ' glr-candidate-kept' : ''}`}>
        <input type="checkbox" checked={kept} onChange={() => toggle(i, a, id)} />
        <span className="glr-candidate-id">{id}</span>
        {species
          ? <span className="glr-candidate-species">{species}</span>
          : <span className="glr-candidate-species glr-muted">…</span>}
        {doc && doc.description && (
          <span className="glr-candidate-desc" title={doc.description}>{doc.description}</span>
        )}
        <button type="button" className="glr-only" title="Keep only this one"
                onClick={() => setKept(i, a, [id])}>only</button>
      </label>
    );
  };

  const row = ({ a, i }) => {
    const kept = keptFor(i, a);
    // Long candidate lists start collapsed so a 15-match row doesn't bury the rest.
    const isOpen = expanded[i] !== undefined ? expanded[i] : a.matches.length <= 3;
    const visible = isOpen ? a.matches.slice(0, MAX_CANDIDATES) : [];
    return (
      <div className="glr-row" key={i}>
        <div className="glr-input">
          <button type="button" className="glr-row-toggle"
                  onClick={() => setExpanded(s => ({ ...s, [i]: !isOpen }))}>
            {isOpen ? <BsChevronDown /> : <BsChevronRight />}
          </button>
          {a.input}
          <Badge bg={kept.length === 0 ? 'danger' : 'secondary'} className="glr-input-count">
            {kept.length}/{a.matches.length}
          </Badge>
        </div>
        <div className="glr-candidates">
          {isOpen
            ? <>
                {visible.map(id => candidate(i, a, id))}
                {a.matches.length > MAX_CANDIDATES && (
                  <span className="glr-hint">
                    … {a.matches.length - MAX_CANDIDATES} more. Search to narrow.
                  </span>
                )}
                <span className="glr-row-bulk">
                  <button type="button" className="glr-only" onClick={() => setKept(i, a, a.matches)}>all</button>
                  <button type="button" className="glr-only" onClick={() => setKept(i, a, [])}>none</button>
                </span>
              </>
            : <span className="glr-collapsed">
                {a.matches.length} candidates — {kept.length === a.matches.length
                  ? 'all kept'
                  : `${kept.length} kept`}
              </span>}
        </div>
      </div>
    );
  };

  return (
    <div className="glr">
      <Bucket
        title="Conflicts — one identifier, several genes"
        count={ambiguous.length}
        tone="warn"
        defaultOpen={true}
        actions={
          <>
            <Button size="sm" variant="outline-secondary" onClick={bulk('first')}>Keep first</Button>{' '}
            <Button size="sm" variant="outline-secondary" onClick={bulk('none')}>Drop all</Button>{' '}
            <Button size="sm" variant="outline-secondary" onClick={bulk('all')}>Reset</Button>
          </>
        }
      >
        <p className="glr-hint">
          These identifiers match more than one gene. <strong>All matches are kept
          unless you narrow them</strong> — untick what you don't want, or use
          <em> only</em> to keep a single gene.
        </p>

        {genomeActions.length > 0 && (
          <div className="glr-genomes">
            <span className="glr-hint glr-genomes-label">Keep only matches from:</span>
            {genomeActions.map(([sn, n]) => (
              <Button key={sn} size="sm" variant="outline-primary"
                      className="glr-genome-btn" onClick={applyGenome(sn)}>
                {speciesLabel(sn)}
                <Badge bg="light" text="dark" className="glr-genome-count">
                  narrows {n.toLocaleString()}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {ambiguous.length > INITIAL_VISIBLE && (
          <Form.Control type="search" size="sm" className="glr-search"
                        placeholder="Search conflicts…" value={query}
                        onChange={(e) => { setQuery(e.target.value); setShowAll(false); }} />
        )}

        {shown.map(row)}

        {filtered.length > shown.length && (
          <button type="button" className="glr-more" onClick={() => setShowAll(true)}>
            show {(filtered.length - shown.length).toLocaleString()} more
          </button>
        )}
        {query && filtered.length === 0 && <p className="glr-hint">No conflicts match “{query}”.</p>}
      </Bucket>

      <Bucket title="Resolved" count={resolved.length} tone="ok" defaultOpen={false}>
        <div className="glr-resolved">
          {resolved.map((r, i) => (
            <div className="glr-resolved-row" key={i}>
              <span className="glr-resolved-input">{r.input}</span>
              {r.input !== r.id && <><span className="glr-arrow">→</span>
                <span className="glr-resolved-id">{r.id}</span></>}
            </div>
          ))}
        </div>
      </Bucket>

      <Bucket
        title="Not recognised"
        count={unknown.length}
        tone="bad"
        defaultOpen={false}
        actions={
          <Button size="sm" variant="outline-secondary"
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(unknown.join('\n')); }}>
            Copy
          </Button>
        }
      >
        <p className="glr-hint">
          No gene matches these. Matching is case-sensitive for stable IDs, so a
          lowercased ID may not be found even when the gene exists.
        </p>
        <pre className="glr-unknown">{unknown.join('\n')}</pre>
      </Bucket>
    </div>
  );
};

export default GeneListResolver;
