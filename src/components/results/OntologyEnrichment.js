import React, { useEffect, useMemo, useState } from 'react';
import { connect } from 'redux-bundler-react';
import { Accordion, Form, Badge } from 'react-bootstrap';
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';
import './ontologyEnrichment.css';

function speciesTaxonId(tid) {
  const n = +tid;
  return n > 1000000 ? Math.floor(n / 1000) : n;
}

function genomeName(grameneMaps, tid) {
  if (!grameneMaps) return String(tid);
  const direct = grameneMaps[tid];
  if (direct && direct.display_name) return direct.display_name;
  const sp = grameneMaps[speciesTaxonId(tid)];
  if (sp && sp.display_name) return sp.display_name;
  return String(tid);
}

function fmtP(p) {
  if (p == null) return '';
  if (p === 0) return '0';
  if (p < 1e-4) return p.toExponential(2);
  return p.toPrecision(3);
}

function fmtFold(f) {
  if (!isFinite(f)) return '';
  if (f >= 100) return f.toFixed(0);
  return f.toFixed(2);
}

// ---------- species tree helpers ----------

function findRoots(tax) {
  return Object.values(tax).filter(n =>
    !n.is_a || n.is_a.length === 0 || !n.is_a.some(p => tax[p])
  );
}

// Place each facet tid onto a taxonomy node id (fall back to species level
// when the exact subspecies tid isn't in grameneTaxonomy).
function placeTaxa(taxonomy, taxa) {
  const placement = {};
  const byPlace = {};
  for (const { tid, count } of taxa) {
    const place = taxonomy[tid] ? +tid : speciesTaxonId(tid);
    placement[tid] = place;
    if (!byPlace[place]) byPlace[place] = [];
    byPlace[place].push({ tid, count });
  }
  return { placement, byPlace };
}

// Set of taxonomy node ids on the path from any placed leaf back to its root.
function relevantNodeIds(taxonomy, byPlace) {
  const out = new Set();
  for (const placeId of Object.keys(byPlace)) {
    let cur = taxonomy[placeId];
    const seen = new Set();
    while (cur && !seen.has(+cur._id)) {
      seen.add(+cur._id);
      out.add(+cur._id);
      const pid = cur.is_a && cur.is_a[0];
      cur = pid ? taxonomy[pid] : null;
    }
  }
  return out;
}

function relevantChildren(node, taxonomy, relevant) {
  return (node.children || [])
    .map(cid => taxonomy[cid])
    .filter(c => c && relevant.has(+c._id));
}

// Walk down through single-relevant-child internal nodes to a branch / leaf.
function compressChain(node, taxonomy, relevant, byPlace) {
  const chain = [node];
  let cur = node;
  while (true) {
    if (byPlace[cur._id]) break; // node itself is a placed leaf
    const kids = relevantChildren(cur, taxonomy, relevant);
    if (kids.length !== 1) break;
    cur = kids[0];
    chain.push(cur);
  }
  return { chain, terminal: cur };
}

const CHAIN_DISPLAY_MAX = 3;
function renderChain(chain) {
  const nameOf = n => n.short_name || n.name || String(n._id);
  if (chain.length <= CHAIN_DISPLAY_MAX) {
    return chain.map((n, i) => (
      <React.Fragment key={n._id}>
        {i > 0 && <span className="tax-sep"> › </span>}
        {nameOf(n)}
      </React.Fragment>
    ));
  }
  const first = chain[0];
  const last = chain[chain.length - 1];
  const middle = chain.slice(1, -1);
  const fullTitle = chain.map(nameOf).join(' › ');
  return (
    <>
      {nameOf(first)}
      <span className="tax-sep"> › </span>
      <span className="tax-ellipsis" title={fullTitle}>
        <span className="tax-ellipsis-short">…</span>
        <span className="tax-ellipsis-full">
          {middle.map(n => (
            <React.Fragment key={n._id}>
              {nameOf(n)}
              <span className="tax-sep"> › </span>
            </React.Fragment>
          ))}
        </span>
      </span>
      <span className="tax-sep"> › </span>
      {nameOf(last)}
    </>
  );
}

function dedupAdjacent(chain) {
  const out = [];
  for (const n of chain) {
    if (out.length && out[out.length - 1].name === n.name) {
      out[out.length - 1] = n;
    } else {
      out.push(n);
    }
  }
  return out;
}

const SpeciesTreeNode = ({
  node, depth, taxonomy, relevant, byPlace, grameneMaps,
  expanded, onToggleExpand, activeTaxon, onSelect
}) => {
  const { chain: rawChain, terminal } = compressChain(node, taxonomy, relevant, byPlace);
  const chain = dedupAdjacent(rawChain);
  const placed = byPlace[terminal._id] || [];
  const kids = relevantChildren(terminal, taxonomy, relevant);
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(+terminal._id);

  return (
    <div className="tax-node oe-tree-node">
      <div className="tax-row" style={{ paddingLeft: depth * 7 }}>
        {hasKids ? (
          <span className="tax-chevron" onClick={() => onToggleExpand(+terminal._id)}>
            {isOpen ? <BsChevronDown/> : <BsChevronRight/>}
          </span>
        ) : (
          <span className="tax-chevron-spacer"/>
        )}
        <span className={hasKids ? 'tax-label tax-label-internal' : 'tax-label'}>
          {renderChain(chain)}
        </span>
      </div>

      {placed.map(({ tid, count }) => {
        const isActive = String(activeTaxon) === String(tid);
        return (
          <div
            key={tid}
            className={'oe-tree-leaf' + (isActive ? ' oe-tree-leaf-active' : '')}
            style={{ paddingLeft: (depth + 1) * 7 + 18 }}
            onClick={() => onSelect(tid)}
          >
            <input
              type="radio"
              readOnly
              checked={isActive}
              onChange={() => onSelect(tid)}
            />
            <span className="oe-tree-leaf-name">{genomeName(grameneMaps, tid)}</span>
            <span className="oe-tree-leaf-count">{count.toLocaleString()}</span>
          </div>
        );
      })}

      {hasKids && isOpen && (
        <div className="tax-children">
          {kids.map(c => (
            <SpeciesTreeNode
              key={c._id}
              node={c}
              depth={depth + 1}
              taxonomy={taxonomy}
              relevant={relevant}
              byPlace={byPlace}
              grameneMaps={grameneMaps}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              activeTaxon={activeTaxon}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SpeciesTree = ({ taxonomy, grameneMaps, taxa, activeTaxon, onSelect }) => {
  const { placement, byPlace } = useMemo(() => placeTaxa(taxonomy, taxa), [taxonomy, taxa]);
  const relevant = useMemo(() => relevantNodeIds(taxonomy, byPlace), [taxonomy, byPlace]);
  const roots = useMemo(
    () => findRoots(taxonomy).filter(r => relevant.has(+r._id)),
    [taxonomy, relevant]
  );

  // Default: every relevant internal node expanded so the user sees the
  // full pruned tree on first paint.
  const [expanded, setExpanded] = useState(() => new Set(relevant));
  useEffect(() => {
    setExpanded(new Set(relevant));
  }, [relevant]);

  const handleToggle = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Skip the root spine: if a root has only one relevant child and isn't
  // itself a placed leaf, render from its child instead.
  const topLevel = [];
  for (const r of roots) {
    const { terminal } = compressChain(r, taxonomy, relevant, byPlace);
    if (byPlace[terminal._id]) {
      topLevel.push(r);
    } else {
      const kids = relevantChildren(terminal, taxonomy, relevant);
      kids.forEach(k => topLevel.push(k));
    }
  }

  return (
    <div className="oe-tree">
      {topLevel.map(n => (
        <SpeciesTreeNode
          key={n._id}
          node={n}
          depth={0}
          taxonomy={taxonomy}
          relevant={relevant}
          byPlace={byPlace}
          grameneMaps={grameneMaps}
          expanded={expanded}
          onToggleExpand={handleToggle}
          activeTaxon={activeTaxon}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

// ---------- enrichment panel ----------

const ControlsBar = ({ ui, onChange }) => (
  <div className="oe-controls">
    <Form.Group className="oe-control">
      <Form.Label>p.adjust ≤</Form.Label>
      <Form.Control
        type="number" step="0.01" min="0" max="1"
        value={ui.pAdjCutoff}
        onChange={e => onChange({ pAdjCutoff: +e.target.value })}
      />
    </Form.Group>
    <Form.Group className="oe-control">
      <Form.Label>minGSSize</Form.Label>
      <Form.Control
        type="number" step="1" min="1"
        value={ui.minGSSize}
        onChange={e => onChange({ minGSSize: Math.max(1, +e.target.value) })}
      />
    </Form.Group>
    <Form.Group className="oe-control">
      <Form.Label>maxGSSize</Form.Label>
      <Form.Control
        type="number" step="1" min="1"
        value={ui.maxGSSize}
        onChange={e => onChange({ maxGSSize: Math.max(1, +e.target.value) })}
      />
    </Form.Group>
    <Form.Check
      className="oe-control"
      type="switch"
      id="oe-most-specific"
      label="Drop ancestor terms"
      checked={!!ui.mostSpecific}
      onChange={e => onChange({ mostSpecific: e.target.checked })}
    />
    <Form.Group className="oe-control oe-control-grow">
      <Form.Label>Filter terms</Form.Label>
      <Form.Control
        type="text"
        placeholder="term id or name…"
        value={ui.search || ''}
        onChange={e => onChange({ search: e.target.value })}
      />
    </Form.Group>
  </div>
);

const TermRow = ({ row, showType, onAddFilter }) => {
  const handleClick = () => onAddFilter && onAddFilter(row);
  return (
    <tr onClick={handleClick} title="Click to add as a filter">
      <td className="oe-term-id">{row.term_display_id}</td>
      <td className="oe-term-name">{row.term_name || <em>(loading…)</em>}</td>
      {showType && <td className="oe-term-type">{row.term_namespace || ''}</td>}
      <td className="oe-num">{row.GeneRatio}</td>
      <td className="oe-num">{row.BgRatio}</td>
      <td className="oe-num">{fmtFold(row.FoldEnrichment)}</td>
      <td className="oe-num">{fmtP(row.pvalue)}</td>
      <td className="oe-num">{fmtP(row.pAdjust)}</td>
    </tr>
  );
};

// InterPro entry types and pathway types are useful per-row context
// (e.g. Domain vs Family vs Repeat for InterPro), and aren't reflected in
// the section title the way GO namespaces are. Show a Type column for
// those two ontologies only.
const ONTS_WITH_TYPE_COLUMN = new Set(['domains', 'pathways']);

const SORT_ACCESSORS = {
  term: r => r.term_display_id || '',
  name: r => (r.term_name || '').toLowerCase(),
  type: r => (r.term_namespace || '').toLowerCase(),
  count: r => r.Count,
  setSize: r => r.SetSize,
  fold: r => r.FoldEnrichment,
  p: r => r.pvalue,
  pAdj: r => r.pAdjust
};

// Defaults chosen so a single click does what the user usually wants:
// numeric "more interesting" columns descend; p-values and text columns ascend.
const SORT_DEFAULT_DIR = {
  term: 'asc', name: 'asc', type: 'asc',
  count: 'desc', setSize: 'desc', fold: 'desc',
  p: 'asc', pAdj: 'asc'
};

const SortableTh = ({ label, sortKey, activeKey, activeDir, onSort, numeric }) => {
  const active = activeKey === sortKey;
  const arrow = active ? (activeDir === 'asc' ? ' ▲' : ' ▼') : '';
  const cls = 'oe-sort-th'
    + (active ? ' oe-sort-th-active' : '')
    + (numeric ? ' oe-num' : '');
  return (
    <th className={cls} onClick={() => onSort(sortKey)}>
      {label}{arrow}
    </th>
  );
};

const OntologySection = ({ block, search, onAddFilter }) => {
  const filtered = useMemo(() => {
    if (!search) return block.rows;
    const needle = search.toLowerCase();
    return block.rows.filter(r =>
      (r.term_display_id && r.term_display_id.toLowerCase().includes(needle)) ||
      (r.term_name && r.term_name.toLowerCase().includes(needle))
    );
  }, [block.rows, search]);

  const showType = ONTS_WITH_TYPE_COLUMN.has(block.ontology);
  const [sortKey, setSortKey] = useState('pAdj');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULT_DIR[key] || 'asc');
    }
  };

  const sorted = useMemo(() => {
    const accessor = SORT_ACCESSORS[sortKey];
    if (!accessor) return filtered;
    const sign = sortDir === 'desc' ? -1 : 1;
    const arr = filtered.slice();
    arr.sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        if (va === vb) return 0;
        return (va - vb) * sign;
      }
      return String(va).localeCompare(String(vb)) * sign;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <Accordion.Item eventKey={block.ontology}>
      <Accordion.Header>
        <span className="oe-ont-title">{block.label}</span>
        <Badge bg="secondary" className="oe-ont-badge">
          {block.passing} significant / {block.tested} tested
        </Badge>
        {block.universeSize > 0 && (
          <Badge bg="light" text="dark" className="oe-ont-badge">
            input {block.deSize} / universe {block.universeSize.toLocaleString()}
          </Badge>
        )}
      </Accordion.Header>
      <Accordion.Body>
        {sorted.length === 0
          ? <em>No terms pass the current cutoffs.</em>
          : (
            <table className="oe-table">
              <thead>
                <tr>
                  <SortableTh label="Term"           sortKey="term"    activeKey={sortKey} activeDir={sortDir} onSort={handleSort}/>
                  <SortableTh label="Description"    sortKey="name"    activeKey={sortKey} activeDir={sortDir} onSort={handleSort}/>
                  {showType && <SortableTh label="Type" sortKey="type" activeKey={sortKey} activeDir={sortDir} onSort={handleSort}/>}
                  <SortableTh label="GeneRatio"      sortKey="count"   activeKey={sortKey} activeDir={sortDir} onSort={handleSort} numeric/>
                  <SortableTh label="BgRatio"        sortKey="setSize" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} numeric/>
                  <SortableTh label="FoldEnrichment" sortKey="fold"    activeKey={sortKey} activeDir={sortDir} onSort={handleSort} numeric/>
                  <SortableTh label="pvalue"         sortKey="p"       activeKey={sortKey} activeDir={sortDir} onSort={handleSort} numeric/>
                  <SortableTh label="p.adjust"       sortKey="pAdj"    activeKey={sortKey} activeDir={sortDir} onSort={handleSort} numeric/>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <TermRow
                    key={`${r.ontology}:${r.term_id}`}
                    row={r}
                    showType={showType}
                    onAddFilter={onAddFilter}
                  />
                ))}
              </tbody>
            </table>
          )
        }
      </Accordion.Body>
    </Accordion.Item>
  );
};

const TaxonPanel = ({ taxon, ontologyEnrichment, results, ui, onUiChange, onAddFilter }) => {
  if (!taxon) return <div className="oe-panel"><em>Select a species on the left.</em></div>;
  const t = ontologyEnrichment.byTaxon[taxon];
  if (!t) return <div className="oe-panel"><em>Initializing…</em></div>;
  if (t.fg.status === 'loading' || t.bg.status === 'loading' || t.fg.status === 'idle' || t.bg.status === 'idle') {
    return <div className="oe-panel oe-loading"><em>Loading enrichment…</em></div>;
  }
  if (t.fg.status === 'error') return <div className="oe-panel"><em>Foreground error: {t.fg.error}</em></div>;
  if (t.bg.status === 'error') return <div className="oe-panel"><em>Background error: {t.bg.error}</em></div>;
  if (!results) return <div className="oe-panel"><em>No data.</em></div>;

  const allBlocks = ui.ontology === 'all'
    ? Object.values(results)
    : (results[ui.ontology] ? [results[ui.ontology]] : []);
  // Hide ontologies that aren't used in this species at all.
  const blocks = allBlocks.filter(b => b.tested > 0);

  return (
    <div className="oe-panel">
      <div className="oe-summary">
        Foreground: <b>{t.fg.numFound.toLocaleString()}</b> genes &middot;
        Background: <b>{t.bg.numFound.toLocaleString()}</b> genes
      </div>
      <ControlsBar ui={ui} onChange={onUiChange} />
      <Accordion alwaysOpen defaultActiveKey={blocks.length === 1 ? blocks[0].ontology : undefined}>
        {blocks.map(b => (
          <OntologySection
            key={b.ontology}
            block={b}
            search={ui.search}
            onAddFilter={onAddFilter}
          />
        ))}
      </Accordion>
    </div>
  );
};

const OntologyEnrichmentViewCmp = props => {
  const {
    grameneSearch,
    grameneMaps,
    grameneTaxonomy,
    ontologyEnrichment,
    ontologyEnrichmentUI: ui,
    ontologyEnrichmentResults: results,
    doSetOntologyEnrichmentActiveTaxon,
    doSetOntologyEnrichmentUI,
    doFetchOntologyEnrichmentForeground,
    doFetchOntologyEnrichmentBackground,
    doAcceptGrameneSuggestion
  } = props;

  const taxa = useMemo(() => {
    if (!grameneSearch || !grameneSearch.facet_counts) return [];
    const arr = grameneSearch.facet_counts.facet_fields.taxon_id || [];
    const ids = [];
    const counts = {};
    for (let i = 0; i < arr.length; i += 2) {
      ids.push(arr[i]);
      counts[arr[i]] = +arr[i + 1];
    }
    if (grameneMaps) {
      ids.sort((a, b) => {
        const ma = grameneMaps[a] || grameneMaps[speciesTaxonId(a)];
        const mb = grameneMaps[b] || grameneMaps[speciesTaxonId(b)];
        return ((ma && ma.left_index) || 0) - ((mb && mb.left_index) || 0);
      });
    }
    return ids.map(tid => ({ tid, count: counts[tid] }));
  }, [grameneSearch, grameneMaps]);

  const activeTaxon = ontologyEnrichment.activeTaxon;

  const [treeWidth, setTreeWidth] = useState(280);
  const beginResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = treeWidth;
    const onMove = (ev) => {
      const next = Math.max(150, Math.min(800, startWidth + (ev.clientX - startX)));
      setTreeWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (taxa.length === 0) return;
    if (!activeTaxon || !taxa.find(t => String(t.tid) === String(activeTaxon))) {
      doSetOntologyEnrichmentActiveTaxon(taxa[0].tid);
    }
  }, [taxa, activeTaxon, doSetOntologyEnrichmentActiveTaxon]);

  useEffect(() => {
    if (!activeTaxon) return;
    const t = ontologyEnrichment.byTaxon[activeTaxon];
    if (!t) return;
    if (t.fg.status === 'idle') doFetchOntologyEnrichmentForeground(activeTaxon);
    if (t.bg.status === 'idle') doFetchOntologyEnrichmentBackground(activeTaxon);
  }, [activeTaxon, ontologyEnrichment, doFetchOntologyEnrichmentForeground, doFetchOntologyEnrichmentBackground]);

  if (taxa.length === 0) {
    return <div className="oe-view"><em>No species in the current results.</em></div>;
  }
  if (!grameneTaxonomy) {
    return <div className="oe-view"><em>Loading taxonomy…</em></div>;
  }

  const handleAddFilter = (row) => {
    if (!doAcceptGrameneSuggestion) return;
    const label = row.term_name
      ? `${row.term_display_id} ${row.term_name}`
      : row.term_display_id;
    doAcceptGrameneSuggestion({
      fq_field: row.field,
      fq_value: String(row.term_id),
      name: label,
      category: row.ontology_label
    });
  };

  return (
    <div className="oe-view oe-layout">
      <div className="oe-layout-tree" style={{ flex: `0 0 ${treeWidth}px` }}>
        <SpeciesTree
          taxonomy={grameneTaxonomy}
          grameneMaps={grameneMaps}
          taxa={taxa}
          activeTaxon={activeTaxon}
          onSelect={tid => doSetOntologyEnrichmentActiveTaxon(String(tid))}
        />
      </div>
      <div
        className="oe-splitter"
        onMouseDown={beginResize}
        title="Drag to resize"
      />
      <div className="oe-layout-panel">
        <TaxonPanel
          taxon={activeTaxon ? String(activeTaxon) : null}
          ontologyEnrichment={ontologyEnrichment}
          results={results}
          ui={ui}
          onUiChange={doSetOntologyEnrichmentUI}
          onAddFilter={handleAddFilter}
        />
      </div>
    </div>
  );
};

export default connect(
  'selectGrameneSearch',
  'selectGrameneMaps',
  'selectGrameneTaxonomy',
  'selectOntologyEnrichment',
  'selectOntologyEnrichmentUI',
  'selectOntologyEnrichmentResults',
  'doSetOntologyEnrichmentActiveTaxon',
  'doSetOntologyEnrichmentUI',
  'doFetchOntologyEnrichmentForeground',
  'doFetchOntologyEnrichmentBackground',
  'doAcceptGrameneSuggestion',
  OntologyEnrichmentViewCmp
);
