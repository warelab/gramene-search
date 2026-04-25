import React, { useState, useMemo, useEffect } from 'react';
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
      (sample.factor || []).forEach(f => {
        props[`fac:${f.type}`] = f.label;
        factorTypes.add(f.type);
        usedFactorTypes.add(f.type);
      });
      (sample.characteristic || []).forEach(c => {
        if (usedFactorTypes.has(c.type)) return; // factor takes precedence
        props[`char:${c.type}`] = c.label;
        charTypes.add(c.type);
      });

      records.push({ fieldName, studyId, group, props });
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

function labelForKey(key, tree) {
  for (const grp of tree) {
    for (const t of grp.types) if (t.key === key) return t.label;
  }
  return key;
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
  const availableAttrs = taxon && exprViz.byTaxon[taxon] && exprViz.byTaxon[taxon].availableAttrs;

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

  const fieldExistence = taxon && exprViz.byTaxon[taxon] && exprViz.byTaxon[taxon].fieldExistence;
  const existenceStatus = taxon && exprViz.byTaxon[taxon] && exprViz.byTaxon[taxon].existenceStatus;

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
    { group: 'experiment', label: 'Experiment', types: EXPERIMENT_KEYS },
    { group: 'factors', label: 'Factors', types: factorTypes.map(t => ({ key: `fac:${t}`, label: t })) },
    { group: 'characteristics', label: 'Characteristics', types: charTypes.map(t => ({ key: `char:${t}`, label: t })) }
  ], [factorTypes, charTypes]);

  const [selections, setSelections] = useState({});
  const [expandedKey, setExpandedKey] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [valueSort, setValueSort] = useState('count');
  const [orderedSelectedKeys, setOrderedSelectedKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const searchLc = searchQuery.trim().toLowerCase();
  const isSearching = searchLc.length > 0;

  // Distinct values per property type, ignoring the type's own selection but
  // applying every other selected type. Counts shown next to a property type
  // reflect "how many distinct values exist among the fields currently
  // matching the rest of the filter."
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

  // Reset state when modal (re)opens for a taxon.
  useEffect(() => {
    if (open && taxon) {
      setSelections({});
      setExpandedKey(null);
      setCollapsedGroups({});
      setOrderedSelectedKeys([]);
      setSearchQuery('');
    }
  }, [open, taxon]);

  // Keep orderedSelectedKeys in sync with selections (preserves the order in
  // which the user first selected each property type).
  useEffect(() => {
    setOrderedSelectedKeys(prev => {
      const active = Object.keys(selections);
      const activeSet = new Set(active);
      const kept = prev.filter(k => activeSet.has(k));
      const newOnes = active.filter(k => !prev.includes(k));
      return [...kept, ...newOnes];
    });
  }, [selections]);

  const matchingFields = useMemo(
    () => records.filter(r => fieldMatches(r, selections, null)),
    [records, selections]
  );

  if (!open) return null;

  const toggleValue = (key, value) => {
    setSelections(prev => {
      const next = { ...prev };
      const set = new Set(next[key] || []);
      if (set.has(value)) set.delete(value); else set.add(value);
      if (set.size === 0) delete next[key]; else next[key] = set;
      return next;
    });
  };

  const clearTypeSelection = (key) => {
    setSelections(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleGroup = (g) => setCollapsedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const renderValues = (key, typeLabelMatches) => {
    const counts = valueCounts(records, key, selections);
    let entries = Array.from(counts.entries());
    if (isSearching && !typeLabelMatches) {
      entries = entries.filter(([v]) => String(v).toLowerCase().includes(searchLc));
    }
    if (valueSort === 'name') entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    else entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const sel = selections[key] || new Set();

    return (
      <div className="exprviz-tree-values">
        <div className="exprviz-values-toolbar">
          <ToggleButtonGroup
            type="radio"
            name={`exprviz-vsort-${key}`}
            size="sm"
            value={valueSort}
            onChange={setValueSort}
          >
            <ToggleButton id={`exprviz-vsort-name-${key}`} value="name" variant="outline-secondary">Name</ToggleButton>
            <ToggleButton id={`exprviz-vsort-count-${key}`} value="count" variant="outline-secondary">Count</ToggleButton>
          </ToggleButtonGroup>
          {sel.size > 0 && (
            <Button size="sm" variant="link" onClick={() => clearTypeSelection(key)}>clear</Button>
          )}
        </div>
        {entries.map(([v, c]) => (
          <label key={v} className="exprviz-tree-value">
            <input type="checkbox" checked={sel.has(v)} onChange={() => toggleValue(key, v)} />
            <span className="exprviz-tree-value-label" title={v}>{v}</span>
            <span className="exprviz-tree-value-count">{c}</span>
          </label>
        ))}
        {entries.length === 0 && <em className="exprviz-tree-empty">No values</em>}
      </div>
    );
  };

  return (
    <Modal show={open} onHide={() => doToggleExprVizFieldsModal(taxon, false)} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>
          Filter expression fields ({matchingFields.length} of {records.length} match)
          {existenceStatus === 'loading' && (
            <span className="exprviz-modal-loading"> · checking field availability…</span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="exprviz-fields-layout">
          <div className="exprviz-tree">
            <input
              type="text"
              className="exprviz-tree-search"
              placeholder="Search property types and values…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {propTree.map(grp => {
              const typeRows = grp.types.map(t => {
                const numValues = (valueSetByKey[t.key] && valueSetByKey[t.key].size) || 0;
                if (numValues === 0) return null;
                const typeLabelMatches = isSearching && t.label.toLowerCase().includes(searchLc);
                let matchingValueCount = numValues;
                if (isSearching && !typeLabelMatches) {
                  const vset = valueSetByKey[t.key] || new Set();
                  matchingValueCount = 0;
                  for (const v of vset) if (String(v).toLowerCase().includes(searchLc)) matchingValueCount++;
                  if (matchingValueCount === 0) return null;
                }
                const sel = selections[t.key];
                const selCount = sel ? sel.size : 0;
                const isExpanded = isSearching ? !typeLabelMatches : (expandedKey === t.key);
                return (
                  <div key={t.key} className={`exprviz-tree-type${selCount > 0 ? ' is-active' : ''}`}>
                    <div
                      className="exprviz-tree-type-header"
                      onClick={() => setExpandedKey(isExpanded ? null : t.key)}
                    >
                      <span className="exprviz-tree-caret">{isExpanded ? '▾' : '▸'}</span>
                      <span className="exprviz-tree-type-label">{t.label}</span>
                      <span className="exprviz-tree-type-count">
                        {selCount > 0 ? `${selCount}/${numValues}` : numValues}
                      </span>
                    </div>
                    {isExpanded && renderValues(t.key, typeLabelMatches)}
                  </div>
                );
              }).filter(Boolean);
              if (isSearching && typeRows.length === 0) return null;
              const groupCollapsed = !isSearching && collapsedGroups[grp.group];
              return (
                <div key={grp.group} className="exprviz-tree-group">
                  <div className="exprviz-tree-group-header" onClick={() => toggleGroup(grp.group)}>
                    <span className="exprviz-tree-caret">{groupCollapsed ? '▶' : '▼'}</span>
                    <strong>{grp.label}</strong>
                  </div>
                  {!groupCollapsed && grp.types.length === 0 && (
                    <div className="exprviz-tree-empty"><em>(none)</em></div>
                  )}
                  {!groupCollapsed && typeRows}
                </div>
              );
            })}
          </div>
          <div className="exprviz-fields-preview">
            <table className="exprviz-fields-table">
              <thead>
                <tr>
                  <th>Field</th>
                  {orderedSelectedKeys.map(k => <th key={k}>{labelForKey(k, propTree)}</th>)}
                </tr>
              </thead>
              <tbody>
                {matchingFields.map(f => (
                  <tr key={f.fieldName}>
                    <td title={f.fieldName}>{f.fieldName.replace(/__expr$/, '')}</td>
                    {orderedSelectedKeys.map(k => <td key={k}>{f.props[k] || ''}</td>)}
                  </tr>
                ))}
                {matchingFields.length === 0 && (
                  <tr><td colSpan={1 + orderedSelectedKeys.length}><em>No matching fields</em></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => doToggleExprVizFieldsModal(taxon, false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={matchingFields.length === 0}
          onClick={() => {
            doSetExprVizFields(taxon, matchingFields.map(f => f.fieldName));
            doToggleExprVizFieldsModal(taxon, false);
          }}
        >
          Apply ({matchingFields.length} fields)
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
