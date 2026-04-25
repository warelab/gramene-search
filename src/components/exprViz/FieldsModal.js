import React, { useState, useMemo, useEffect } from 'react';
import { connect } from 'redux-bundler-react';
import { Modal, Button, Form } from 'react-bootstrap';

// Build candidate sample-group rows for a taxon's studies.
// Each row corresponds to one expression column: <studyId>_<group>__expr
// Columns are dynamic — union of factor/characteristic types across rows.
function buildRows(studyIds, expressionSamples, fieldCatalog) {
  if (!expressionSamples) return { rows: [], factorTypes: [], charTypes: [] };
  const factorTypes = new Set();
  const charTypes = new Set();
  const rows = [];
  for (const studyId of studyIds) {
    const samples = expressionSamples[studyId];
    if (!samples) continue;
    // Group by sample.group; one row per group.
    const byGroup = {};
    for (const s of samples) {
      if (!byGroup[s.group]) byGroup[s.group] = s;
    }
    for (const group of Object.keys(byGroup)) {
      const sample = byGroup[group];
      const fieldName = `${studyId.replace(/-/g, '_')}_${group}__expr`;
      if (fieldCatalog && fieldCatalog.fields && !fieldCatalog.fields[fieldName]) {
        // skip rows with no corresponding catalog field
        continue;
      }
      const factors = {};
      (sample.factor || []).forEach(f => {
        factors[f.type] = f.label;
        factorTypes.add(f.type);
      });
      const characteristics = {};
      (sample.characteristic || []).forEach(c => {
        if (factors[c.type] != null) return; // factor takes precedence
        characteristics[c.type] = c.label;
        charTypes.add(c.type);
      });
      rows.push({
        fieldName,
        studyId,
        group,
        replicates: samples.filter(s => s.group === group).length,
        factors,
        characteristics
      });
    }
  }
  return {
    rows,
    factorTypes: Array.from(factorTypes).sort(),
    charTypes: Array.from(charTypes).sort()
  };
}

function rowMatches(row, q) {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (row.fieldName.toLowerCase().includes(ql)) return true;
  for (const v of Object.values(row.factors)) if (String(v).toLowerCase().includes(ql)) return true;
  for (const v of Object.values(row.characteristics)) if (String(v).toLowerCase().includes(ql)) return true;
  return false;
}

function speciesTaxonId(tid) {
  const n = +tid;
  return n > 1000000 ? Math.floor(n / 1000) : n;
}

const FieldsModalCmp = props => {
  const {
    fieldCatalog,
    exprViz,
    expressionStudies,
    expressionSamples,
    doToggleExprVizFieldsModal,
    doSetExprVizFields
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

  const { rows, factorTypes, charTypes } = useMemo(
    () => buildRows(studyIds, expressionSamples, fieldCatalog),
    [studyIds, expressionSamples, fieldCatalog]
  );

  const [pending, setPending] = useState(new Set());
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (open && taxon) {
      setPending(new Set(exprViz.byTaxon[taxon].selectedFields || []));
      setFilter('');
    }
  }, [open, taxon]);

  if (!open) return null;

  const filtered = filter ? rows.filter(r => rowMatches(r, filter)) : rows;

  const toggle = name => {
    setPending(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const selectShown = () => setPending(prev => {
    const next = new Set(prev);
    filtered.forEach(r => next.add(r.fieldName));
    return next;
  });

  const deselectShown = () => setPending(prev => {
    const next = new Set(prev);
    filtered.forEach(r => next.delete(r.fieldName));
    return next;
  });

  return (
    <Modal show={open} onHide={() => doToggleExprVizFieldsModal(taxon, false)} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Select expression fields ({rows.length} groups across {studyIds.length} studies)</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="exprviz-fields-toolbar">
          <Form.Control
            size="sm"
            placeholder="Filter on factor / characteristic / field name…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <span className="exprviz-fields-count">
            {pending.size} selected · showing {filtered.length}/{rows.length}
          </span>
          <Button size="sm" variant="link" onClick={selectShown}>select shown</Button>
          <Button size="sm" variant="link" onClick={deselectShown}>deselect shown</Button>
          <Button size="sm" variant="link" onClick={() => setPending(new Set())}>clear</Button>
        </div>
        <div className="exprviz-fields-table-wrap">
          <table className="exprviz-fields-table">
            <thead>
              <tr>
                <th></th>
                <th>Study</th>
                <th>Group</th>
                <th>Reps</th>
                {factorTypes.map(t => <th key={'f-' + t} className="exprviz-col-factor">{t}</th>)}
                {charTypes.map(t => <th key={'c-' + t} className="exprviz-col-char">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.fieldName}>
                  <td>
                    <input
                      type="checkbox"
                      checked={pending.has(r.fieldName)}
                      onChange={() => toggle(r.fieldName)}
                    />
                  </td>
                  <td title={r.fieldName}>{r.studyId}</td>
                  <td>{r.group}</td>
                  <td>{r.replicates}</td>
                  {factorTypes.map(t => <td key={'f-' + t}>{r.factors[t] || ''}</td>)}
                  {charTypes.map(t => <td key={'c-' + t}>{r.characteristics[t] || ''}</td>)}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4 + factorTypes.length + charTypes.length}><em>No matching sample groups.</em></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => doToggleExprVizFieldsModal(taxon, false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            doSetExprVizFields(taxon, Array.from(pending));
            doToggleExprVizFieldsModal(taxon, false);
          }}
        >
          Apply
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
  'doToggleExprVizFieldsModal',
  'doSetExprVizFields',
  FieldsModalCmp
);
