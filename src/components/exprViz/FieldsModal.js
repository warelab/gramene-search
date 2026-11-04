import React, { useState, useMemo, useEffect, useRef } from 'react';
import { connect } from 'redux-bundler-react';
import { Modal, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';

function speciesTaxonId(tid) {
  const n = +tid;
  return n > 1000000 ? Math.floor(n / 1000) : n;
}

const EXPERIMENT_KEYS = [
  { key: 'exp:study', label: 'Study' },
  { key: 'exp:type', label: 'Study type' },
  { key: 'exp:organism', label: 'Organism' }
];

// Value lists longer than this are truncated (selected values always shown)
// behind a "show all" toggle so one huge type (e.g. sample id) doesn't bury
// the rest of the panel.
const VALUE_LIMIT = 10;
const NO_FIELDS = [];

// One record per expression field (one sample group within one study).
// `props` is a flat map of property-key → value used for filtering and display.
function buildFieldRecords(taxon, studyIds, expressionStudies, expressionSamples, fieldCatalog, grameneMaps) {
  const records = [];
  const factorTypes = new Set();
  const charTypes = new Set();
  if (!expressionSamples || !expressionStudies) return { records, factorTypes: [], charTypes: [] };

  const studyById = {};
  const list = expressionStudies[taxon] || expressionStudies[speciesTaxonId(taxon)] || [];
  list.forEach(s => { studyById[s._id] = s; });

  for (const studyId of studyIds) {
    const study = studyById[studyId];
    if (!study) continue;
    const samples = expressionSamples[studyId];
    if (!samples) continue;

    const byGroup = {};
    for (const s of samples) if (!byGroup[s.group]) byGroup[s.group] = s;

    for (const group of Object.keys(byGroup)) {
      const sample = byGroup[group];
      const fieldName = `${studyId.replace(/-/g, '_')}_${group}__expr`;
      if (fieldCatalog && fieldCatalog.fields && !fieldCatalog.fields[fieldName]) continue;

      const props = {};
      props['exp:study'] = study.description || studyId;
      props['exp:type'] = study.type || '(unknown)';
      const taxon_id = study.taxon_id;
      const taxName = grameneMaps && (grameneMaps[taxon_id] || grameneMaps[speciesTaxonId(taxon_id)]);
      props['exp:organism'] = (taxName && taxName.display_name) || String(taxon_id);

      const usedFactorTypes = new Set();
      const factorLabels = [];
      (sample.factor || []).forEach(f => {
        props[`fac:${f.type}`] = f.label;
        factorTypes.add(f.type);
        usedFactorTypes.add(f.type);
        if (f.label) factorLabels.push(f.label);
      });
      let organ = null;
      (sample.characteristic || []).forEach(c => {
        if (c.type === 'organism part' && c.label) organ = c.label;
        if (usedFactorTypes.has(c.type)) return; // factor takes precedence
        props[`char:${c.type}`] = c.label;
        charTypes.add(c.type);
      });

      // Short, human-readable name for the field list (same precedence as the
      // plot's axis labels: factor values, then organism part, then group id).
      const sampleLabel = factorLabels.length ? factorLabels.join('; ') : (organ || group);
      records.push({ fieldName, studyId, group, sampleLabel, props });
    }
  }
  return {
    records,
    factorTypes: Array.from(factorTypes).sort(),
    charTypes: Array.from(charTypes).sort()
  };
}

function fieldMatches(field, selections, excludeKey) {
  for (const key of Object.keys(selections)) {
    if (key === excludeKey) continue;
    const values = selections[key];
    if (!values || values.size === 0) continue;
    const v = field.props[key];
    if (v == null || !values.has(v)) return false;
  }
  return true;
}

function valueCounts(records, key, selections) {
  const counts = new Map();
  for (const f of records) {
    if (!fieldMatches(f, selections, key)) continue;
    const v = f.props[key];
    if (v == null) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

function typeInfoForKey(key, tree) {
  for (const grp of tree) {
    for (const t of grp.types) if (t.key === key) return { label: t.label, groupLabel: grp.singular };
  }
  return { label: key, groupLabel: '' };
}

// Move focus among [data-nav] elements inside `root` with the arrow keys.
function moveFocus(root, dir) {
  const items = Array.from(root.querySelectorAll('[data-nav]'));
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement);
  let next;
  if (dir === 'first') next = 0;
  else if (dir === 'last') next = items.length - 1;
  else if (idx === -1) next = 0;
  else next = Math.max(0, Math.min(items.length - 1, idx + dir));
  items[next].focus();
  if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
}

function navKeyDown(e) {
  const map = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
  if (!(e.key in map)) return;
  // Let Home/End keep their text-editing meaning inside the search box.
  if ((e.key === 'Home' || e.key === 'End') && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  e.preventDefault();
  moveFocus(e.currentTarget, map[e.key]);
}

const FieldsModalCmp = props => {
  const {
    fieldCatalog,
    exprViz,
    expressionStudies,
    expressionSamples,
    grameneMaps,
    doToggleExprVizFieldsModal,
    doSetExprVizFields,
    doFetchExprVizFieldExistence
  } = props;

  const taxon = Object.keys(exprViz.byTaxon).find(t => exprViz.byTaxon[t].fieldsModalOpen);
  const open = !!taxon;
  const tabState = taxon && exprViz.byTaxon[taxon];
  const availableAttrs = tabState && tabState.availableAttrs;
  const currentFields = (tabState && tabState.selectedFields) || NO_FIELDS;

  const studyIds = useMemo(() => {
    if (!taxon || !expressionStudies) return [];
    const list = expressionStudies[taxon] || expressionStudies[speciesTaxonId(taxon)] || [];
    let ids = list.map(s => s._id);
    if (availableAttrs) {
      const allow = new Set(availableAttrs);
      ids = ids.filter(id => allow.has(id));
    }
    return ids;
  }, [taxon, expressionStudies, availableAttrs]);

  const allRecords = useMemo(
    () => buildFieldRecords(taxon, studyIds, expressionStudies, expressionSamples, fieldCatalog, grameneMaps),
    [taxon, studyIds, expressionStudies, expressionSamples, fieldCatalog, grameneMaps]
  );

  const candidateFields = useMemo(
    () => allRecords.records.map(r => r.fieldName),
    [allRecords]
  );

  // Trigger the field-existence facet check whenever the modal is open and
  // the candidate field list is known. The bundle caches per (q, taxon, fields).
  useEffect(() => {
    if (open && taxon && candidateFields.length > 0) {
      doFetchExprVizFieldExistence(taxon, candidateFields);
    }
  }, [open, taxon, candidateFields, doFetchExprVizFieldExistence]);

  const fieldExistence = tabState && tabState.fieldExistence;
  const existenceStatus = tabState && tabState.existenceStatus;

  // Once existence counts are loaded, drop fields with no data in the current
  // result set. Until then, render with the full candidate set so the modal
  // doesn't flash empty during the precheck.
  const { records, factorTypes, charTypes } = useMemo(() => {
    if (!fieldExistence) return allRecords;
    const live = new Set(Object.keys(fieldExistence).filter(f => fieldExistence[f] > 0));
    const filtered = allRecords.records.filter(r => live.has(r.fieldName));
    const factorTypes = new Set();
    const charTypes = new Set();
    for (const r of filtered) {
      for (const k of Object.keys(r.props)) {
        if (k.startsWith('fac:')) factorTypes.add(k.slice(4));
        else if (k.startsWith('char:')) charTypes.add(k.slice(5));
      }
    }
    return {
      records: filtered,
      factorTypes: Array.from(factorTypes).sort(),
      charTypes: Array.from(charTypes).sort()
    };
  }, [allRecords, fieldExistence]);

  const propTree = useMemo(() => [
    { group: 'experiment', label: 'Experiment', singular: 'Experiment', types: EXPERIMENT_KEYS },
    { group: 'factors', label: 'Factors', singular: 'Factor', types: factorTypes.map(t => ({ key: `fac:${t}`, label: t })) },
    { group: 'characteristics', label: 'Characteristics', singular: 'Characteristic', types: charTypes.map(t => ({ key: `char:${t}`, label: t })) }
  ], [factorTypes, charTypes]);

  // selections: property key → Set of chosen values (AND across keys, OR within).
  const [selections, setSelections] = useState({});
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [showAllKeys, setShowAllKeys] = useState(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [valueSort, setValueSort] = useState('count');
  const [searchQuery, setSearchQuery] = useState('');
  // Per-field checkboxes. null = every field checked; otherwise the Set of
  // checked field names. Seeded from the tab's current selection on open.
  const [included, setIncluded] = useState(null);
  const [seededFromCurrent, setSeededFromCurrent] = useState(false);
  const searchRef = useRef(null);
  const searchLc = searchQuery.trim().toLowerCase();
  const isSearching = searchLc.length > 0;

  // Distinct values per property type, ignoring the type's own selection but
  // applying every other selected type.
  const valueSetByKey = useMemo(() => {
    const allKeys = new Set();
    for (const r of records) for (const k of Object.keys(r.props)) allKeys.add(k);
    const m = {};
    for (const key of allKeys) {
      const set = new Set();
      for (const r of records) {
        if (!fieldMatches(r, selections, key)) continue;
        const v = r.props[key];
        if (v != null) set.add(v);
      }
      m[key] = set;
    }
    return m;
  }, [records, selections]);

  // Distinct values per property type across the unfiltered candidate set.
  // A type with a single value across every record can't discriminate (e.g.
  // "Organism" when every field belongs to the same species), so we hide it.
  const totalValueCountByKey = useMemo(() => {
    const m = {};
    for (const r of records) {
      for (const [k, v] of Object.entries(r.props)) {
        if (v == null) continue;
        if (!m[k]) m[k] = new Set();
        m[k].add(v);
      }
    }
    return m;
  }, [records]);

  // Reset state when modal (re)opens for a taxon.
  useEffect(() => {
    if (open && taxon) {
      setSelections({});
      setExpandedKeys(new Set());
      setShowAllKeys(new Set());
      setCollapsedGroups({});
      setSearchQuery('');
      const cur = (exprViz.byTaxon[taxon] && exprViz.byTaxon[taxon].selectedFields) || [];
      setIncluded(cur.length ? new Set(cur) : null);
      setSeededFromCurrent(cur.length > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taxon]);

  // Property keys with an active selection, in the order the user first
  // picked them (drives chip order and the extra field-list columns).
  // Derived synchronously so chips never lag a render behind the counts.
  const keyOrderRef = useRef([]);
  const orderedSelectedKeys = useMemo(() => {
    const active = Object.keys(selections);
    const activeSet = new Set(active);
    const prev = keyOrderRef.current;
    const kept = prev.filter(k => activeSet.has(k));
    const next = [...kept, ...active.filter(k => !kept.includes(k))];
    keyOrderRef.current = next;
    return next;
  }, [selections]);

  // Fields already shown in the tab are listed first so they aren't buried
  // among unchecked candidates when the modal opens on an existing selection.
  // The order is fixed for the modal's lifetime (currentFields doesn't change
  // while it's open), so rows never jump when toggled.
  const matchingFields = useMemo(() => {
    const m = records.filter(r => fieldMatches(r, selections, null));
    if (currentFields.length === 0) return m;
    const cur = new Set(currentFields);
    return [...m.filter(r => cur.has(r.fieldName)), ...m.filter(r => !cur.has(r.fieldName))];
  }, [records, selections, currentFields]);

  const isChecked = f => (included ? included.has(f) : true);
  const finalFields = matchingFields.filter(r => isChecked(r.fieldName));

  if (!open) return null;

  const close = () => doToggleExprVizFieldsModal(taxon, false);

  const toggleValue = (key, value) => {
    setSelections(prev => {
      const next = { ...prev };
      const set = new Set(next[key] || []);
      if (set.has(value)) set.delete(value); else set.add(value);
      if (set.size === 0) delete next[key]; else next[key] = set;
      return next;
    });
  };

  const clearTypeSelection = key => {
    setSelections(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleSetMember = (setter, key, force) => setter(prev => {
    const next = new Set(prev);
    const on = force === undefined ? !next.has(key) : force;
    if (on) next.add(key); else next.delete(key);
    return next;
  });

  const toggleGroup = g => setCollapsedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const toggleField = name => setIncluded(prev => {
    const next = new Set(prev || records.map(r => r.fieldName));
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const setMatchingChecked = on => setIncluded(prev => {
    const next = new Set(prev || records.map(r => r.fieldName));
    for (const r of matchingFields) {
      if (on) next.add(r.fieldName); else next.delete(r.fieldName);
    }
    return next;
  });

  const startOver = () => {
    setIncluded(null);
    setSeededFromCurrent(false);
  };

  const apply = () => {
    // Keep the existing column order for fields that stay selected; append
    // newly chosen fields in catalog order.
    const chosen = new Set(finalFields.map(r => r.fieldName));
    const kept = currentFields.filter(f => chosen.has(f));
    const keptSet = new Set(kept);
    const added = finalFields.map(r => r.fieldName).filter(f => !keptSet.has(f));
    doSetExprVizFields(taxon, [...kept, ...added]);
    close();
  };

  const onSearchKeyDown = e => {
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      e.stopPropagation(); // don't close the modal
      setSearchQuery('');
    }
  };

  // ---- Left panel: property types and their values ----------------------

  const renderValues = (key, typeLabelMatches, typeLabel) => {
    const counts = valueCounts(records, key, selections);
    let entries = Array.from(counts.entries());
    if (isSearching && !typeLabelMatches) {
      entries = entries.filter(([v]) => String(v).toLowerCase().includes(searchLc));
    }
    const sel = selections[key] || new Set();
    // Selected values first, then the chosen sort.
    entries.sort((a, b) => {
      const sa = sel.has(a[0]) ? 0 : 1;
      const sb = sel.has(b[0]) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (valueSort === 'name') return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
      return b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
    });
    // Selected values whose count dropped to 0 under other filters still
    // need a visible row so they can be unchecked.
    for (const v of sel) if (!counts.has(v)) entries.unshift([v, 0]);

    const showAll = showAllKeys.has(key) || isSearching;
    const limit = Math.max(VALUE_LIMIT, sel.size);
    const visible = showAll ? entries : entries.slice(0, limit);
    const hiddenCount = entries.length - visible.length;

    return (
      <div className="exprviz-tree-values" role="group" aria-label={`${typeLabel} values`}>
        {visible.map(([v, c]) => (
          <label key={v} className={`exprviz-tree-value${sel.has(v) ? ' is-checked' : ''}`}>
            <input
              type="checkbox"
              data-nav
              checked={sel.has(v)}
              onChange={() => toggleValue(key, v)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); toggleValue(key, v); } }}
            />
            <span className="exprviz-tree-value-label" title={v}>{v}</span>
            <span className="exprviz-tree-value-count">{c}</span>
          </label>
        ))}
        {entries.length === 0 && <em className="exprviz-tree-empty">No values</em>}
        {(hiddenCount > 0 || (showAllKeys.has(key) && !isSearching && entries.length > limit)) && (
          <button
            type="button"
            data-nav
            className="exprviz-link-btn exprviz-tree-more"
            onClick={() => toggleSetMember(setShowAllKeys, key)}
          >
            {hiddenCount > 0 ? `Show all ${entries.length} values` : 'Show fewer'}
          </button>
        )}
      </div>
    );
  };

  const renderTree = () => propTree.map(grp => {
    const typeRows = grp.types.map(t => {
      // Hide property types that can't discriminate among the candidates:
      // zero values, or a single value shared by every record.
      const totalDistinct = (totalValueCountByKey[t.key] && totalValueCountByKey[t.key].size) || 0;
      if (totalDistinct < 2) return null;
      const numValues = (valueSetByKey[t.key] && valueSetByKey[t.key].size) || 0;
      const sel = selections[t.key];
      const selCount = sel ? sel.size : 0;
      if (numValues === 0 && selCount === 0) return null;
      const typeLabelMatches = isSearching && t.label.toLowerCase().includes(searchLc);
      if (isSearching && !typeLabelMatches) {
        const vset = valueSetByKey[t.key] || new Set();
        let matching = 0;
        for (const v of vset) if (String(v).toLowerCase().includes(searchLc)) matching++;
        if (matching === 0) return null;
      }
      const isExpanded = (isSearching && !typeLabelMatches) || expandedKeys.has(t.key);
      const valuesId = `exprviz-vals-${t.key.replace(/[^a-z0-9]/gi, '_')}`;
      return (
        <div key={t.key} className={`exprviz-tree-type${selCount > 0 ? ' is-active' : ''}`}>
          <button
            type="button"
            data-nav
            className="exprviz-tree-type-header"
            aria-expanded={isExpanded}
            aria-controls={valuesId}
            onClick={() => toggleSetMember(setExpandedKeys, t.key, !isExpanded)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' && !isExpanded) { e.preventDefault(); toggleSetMember(setExpandedKeys, t.key, true); }
              else if (e.key === 'ArrowLeft' && isExpanded) { e.preventDefault(); toggleSetMember(setExpandedKeys, t.key, false); }
            }}
          >
            <span className="exprviz-tree-caret" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
            <span className="exprviz-tree-type-label">{t.label}</span>
            {selCount > 0 && <span className="exprviz-badge">{selCount} selected</span>}
            <span className="exprviz-tree-type-count" title={`${numValues} distinct values`}>{numValues}</span>
          </button>
          {!isExpanded && selCount > 0 && (
            <div className="exprviz-tree-type-selsummary" title={Array.from(sel).join(', ')}>
              {Array.from(sel).join(', ')}
            </div>
          )}
          {isExpanded && <div id={valuesId}>{renderValues(t.key, typeLabelMatches, t.label)}</div>}
        </div>
      );
    }).filter(Boolean);
    if (typeRows.length === 0) return null;
    const groupCollapsed = !isSearching && collapsedGroups[grp.group];
    const groupSel = grp.types.reduce((n, t) => n + (selections[t.key] ? selections[t.key].size : 0), 0);
    return (
      <div key={grp.group} className="exprviz-tree-group">
        <button
          type="button"
          data-nav
          className="exprviz-tree-group-header"
          aria-expanded={!groupCollapsed}
          onClick={() => toggleGroup(grp.group)}
          onKeyDown={e => {
            if (e.key === 'ArrowRight' && groupCollapsed) { e.preventDefault(); toggleGroup(grp.group); }
            else if (e.key === 'ArrowLeft' && !groupCollapsed) { e.preventDefault(); toggleGroup(grp.group); }
          }}
        >
          <span className="exprviz-tree-caret" aria-hidden="true">{groupCollapsed ? '▸' : '▾'}</span>
          <span className="exprviz-tree-group-label">{grp.label}</span>
          {groupSel > 0 && <span className="exprviz-badge">{groupSel}</span>}
          <span className="exprviz-tree-type-count">{typeRows.length} {typeRows.length === 1 ? 'type' : 'types'}</span>
        </button>
        {!groupCollapsed && typeRows}
      </div>
    );
  }).filter(Boolean);

  const treeContent = renderTree();

  // ---- Summary chips ------------------------------------------------------

  const chips = [];
  for (const key of orderedSelectedKeys) {
    const vals = selections[key];
    if (!vals) continue;
    const { label, groupLabel } = typeInfoForKey(key, propTree);
    for (const v of vals) {
      chips.push(
        <span key={`${key}\u0000${v}`} className="exprviz-chip">
          <span className="exprviz-chip-type">{groupLabel} · {label}:</span>
          <span className="exprviz-chip-value" title={v}>{v}</span>
          <button
            type="button"
            className="exprviz-chip-remove"
            aria-label={`Remove filter ${label}: ${v}`}
            onClick={() => toggleValue(key, v)}
          >×</button>
        </span>
      );
    }
  }

  const matchingChecked = finalFields.length;
  const uncheckedMatching = matchingFields.length - matchingChecked;

  return (
    <Modal
      show={open}
      onHide={close}
      size="xl"
      scrollable
      className="exprviz-fields-modal"
      onEntered={() => searchRef.current && searchRef.current.focus()}
    >
      <Modal.Header closeButton>
        <Modal.Title as="h5">
          Choose expression fields
          {existenceStatus === 'loading' && (
            <span className="exprviz-modal-loading"> · checking field availability…</span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="exprviz-summary" aria-live="polite">
          <div className="exprviz-summary-counts">
            <strong>{matchingChecked}</strong> of {records.length} fields will be shown
            {chips.length > 0 && <span className="text-muted"> · {matchingFields.length} match the filters</span>}
            {uncheckedMatching > 0 && <span className="text-muted"> · {uncheckedMatching} unchecked</span>}
          </div>
          <div className="exprviz-chips">
            {chips.length > 0 ? (
              <>
                {chips}
                <button type="button" className="exprviz-link-btn" onClick={() => setSelections({})}>
                  Clear all filters
                </button>
              </>
            ) : (
              <span className="text-muted exprviz-summary-hint">
                No filters. Pick property values on the left to narrow the list.
              </span>
            )}
          </div>
          {seededFromCurrent && included && (
            <div className="exprviz-summary-seeded">
              Starting from your current selection of {currentFields.length} fields.{' '}
              <button type="button" className="exprviz-link-btn" onClick={startOver}>
                Start over with all fields
              </button>
            </div>
          )}
        </div>
        <div className="exprviz-fields-layout">
          <div className="exprviz-tree-pane">
            <div className="exprviz-tree-toolbar">
              <input
                ref={searchRef}
                type="search"
                className="form-control form-control-sm exprviz-tree-search"
                placeholder="Search properties and values…"
                aria-label="Search property types and values"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  onSearchKeyDown(e);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const tree = e.currentTarget.closest('.exprviz-tree-pane').querySelector('.exprviz-tree');
                    if (tree) moveFocus(tree, 'first');
                  }
                }}
              />
              <div className="exprviz-tree-sort">
                <span className="text-muted">Sort values</span>
                <ToggleButtonGroup type="radio" name="exprviz-vsort" size="sm" value={valueSort} onChange={setValueSort}>
                  <ToggleButton id="exprviz-vsort-count" value="count" variant="outline-secondary">Count</ToggleButton>
                  <ToggleButton id="exprviz-vsort-name" value="name" variant="outline-secondary">A–Z</ToggleButton>
                </ToggleButtonGroup>
              </div>
            </div>
            <div
              className="exprviz-tree"
              onKeyDown={e => {
                if (e.key === 'ArrowUp' && document.activeElement === e.currentTarget.querySelector('[data-nav]')) {
                  e.preventDefault();
                  searchRef.current && searchRef.current.focus();
                  return;
                }
                navKeyDown(e);
              }}
            >
              {treeContent.length > 0 ? treeContent : (
                <em className="exprviz-tree-empty">
                  {isSearching ? `Nothing matches “${searchQuery.trim()}”.` : 'No properties to filter on.'}
                </em>
              )}
            </div>
            <div className="exprviz-kbd-hint text-muted">
              <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>→</kbd><kbd>←</kbd> open/close · <kbd>Space</kbd> toggle · <kbd>Esc</kbd> clear search
            </div>
          </div>
          <div className="exprviz-fields-preview">
            <div className="exprviz-fields-preview-toolbar">
              <strong>Matching fields ({matchingFields.length})</strong>
              <span className="exprviz-fields-preview-actions">
                <button type="button" className="exprviz-link-btn" disabled={uncheckedMatching === 0} onClick={() => setMatchingChecked(true)}>
                  Check all
                </button>
                <button type="button" className="exprviz-link-btn" disabled={matchingChecked === 0} onClick={() => setMatchingChecked(false)}>
                  Uncheck all
                </button>
              </span>
            </div>
            <div className="exprviz-fields-preview-scroll" onKeyDown={navKeyDown}>
              <table className="exprviz-fields-table">
                <thead>
                  <tr>
                    <th className="exprviz-fields-check" aria-label="Include"></th>
                    <th>Sample</th>
                    {orderedSelectedKeys.filter(k => k !== 'exp:study').map(k => {
                      const { label, groupLabel } = typeInfoForKey(k, propTree);
                      return <th key={k} className="exprviz-col-filtered" title={`${groupLabel}: ${label}`}>{label}</th>;
                    })}
                    <th>Study</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingFields.map(f => {
                    const checked = isChecked(f.fieldName);
                    return (
                      <tr
                        key={f.fieldName}
                        title={f.fieldName}
                        className={checked ? '' : 'is-unchecked'}
                        onClick={e => { if (e.target.tagName !== 'INPUT') toggleField(f.fieldName); }}
                      >
                        <td className="exprviz-fields-check">
                          <input
                            type="checkbox"
                            data-nav
                            checked={checked}
                            aria-label={`Include ${f.sampleLabel} (${f.props['exp:study']})`}
                            onChange={() => toggleField(f.fieldName)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); toggleField(f.fieldName); } }}
                          />
                        </td>
                        <td className="exprviz-fields-sample">{f.sampleLabel}</td>
                        {orderedSelectedKeys.filter(k => k !== 'exp:study').map(k => (
                          <td key={k} className="exprviz-col-filtered">{f.props[k] || ''}</td>
                        ))}
                        <td className="exprviz-fields-study">{f.props['exp:study']}</td>
                      </tr>
                    );
                  })}
                  {matchingFields.length === 0 && (
                    <tr><td colSpan={3 + orderedSelectedKeys.length}><em>No fields match these filters.</em></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <span className="me-auto text-muted small">
          {currentFields.length > 0 ? `Currently showing ${currentFields.length} fields` : 'No fields selected yet'}
        </span>
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant="primary" disabled={matchingChecked === 0} onClick={apply}>
          Apply ({matchingChecked} {matchingChecked === 1 ? 'field' : 'fields'})
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectExprViz',
  'selectExpressionStudies',
  'selectExpressionSamples',
  'selectGrameneMaps',
  'doToggleExprVizFieldsModal',
  'doSetExprVizFields',
  'doFetchExprVizFieldExistence',
  FieldsModalCmp
);
