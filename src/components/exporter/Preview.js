import React, { useEffect, useMemo, useState, useRef } from 'react';
import { connect } from 'redux-bundler-react';
import { BsArrowLeftShort, BsArrowRightShort, BsSliders } from 'react-icons/bs';
import { buildTableData, toJSON } from './formatters';
import { ANCESTOR_FIELD_MAP, collectAncestorIds } from './ancestorsResolver';
import CutoffsModal from './CutoffsModal';

const PreviewCmp = props => {
  const {
    fieldCatalog: catalog,
    exporterSelectedFields: fields,
    exporterFormat: format,
    exporterPreview: preview,
    expressionStudies,
    expressionSamples,
    grameneTaxonomy,
    gramenePathways,
    ontologies,
    exporterCutoffs,
    doSetExporterFormat,
    doReorderExporterFields,
    doClearExporterFields,
    doSetExporterCutoffs,
    doEnsureOntologyRecords,
    doRequestGramenePathways
  } = props;

  const [showCutoffs, setShowCutoffs] = useState(false);
  const docs = preview.data || [];

  const ancestorFieldsSelected = useMemo(
    () => fields.filter(n => ANCESTOR_FIELD_MAP[n]),
    [fields]
  );

  useEffect(() => {
    if (ancestorFieldsSelected.length === 0 || docs.length === 0) return;
    const idsByOnt = collectAncestorIds(docs, ancestorFieldsSelected);
    for (const [ontKey, ids] of Object.entries(idsByOnt)) {
      if (!ids.length) continue;
      if (ontKey === 'taxonomy') continue; // already cached globally
      if (ontKey === 'pathways') {
        if (doRequestGramenePathways) doRequestGramenePathways(ids);
        continue;
      }
      if (doEnsureOntologyRecords) doEnsureOntologyRecords(ontKey, ids);
    }
  }, [docs, ancestorFieldsSelected, doEnsureOntologyRecords, doRequestGramenePathways]);

  if (fields.length === 0) {
    return (
      <div className="exporter-preview-empty">
        <em>Select at least one field to preview.</em>
      </div>
    );
  }

  const renderStatus = () => {
    if (preview.status === 'loading') return <small className="exporter-preview-status">Loading…</small>;
    if (preview.status === 'error') return <small className="exporter-preview-status error">Error: {preview.error}</small>;
    if (preview.status === 'stale') return <small className="exporter-preview-status">Refreshing…</small>;
    if (preview.status === 'idle') return <small className="exporter-preview-status">Idle</small>;
    return null;
  };

  const resolverCtx = {
    expressionStudies,
    expressionSamples,
    taxonomy: grameneTaxonomy,
    pathways: gramenePathways,
    ontologies,
    cutoffs: exporterCutoffs
  };

  const moveField = (name, delta) => {
    const idx = fields.indexOf(name);
    if (idx === -1) return;
    const target = idx + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    doReorderExporterFields(next);
  };

  return (
    <div className="exporter-preview">
      <div className="exporter-preview-toolbar">
        <span className="exporter-preview-title"><b>Preview</b> (first 20 genes)</span>
        <span className="exporter-preview-fields-count">
          {fields.length} field{fields.length === 1 ? '' : 's'}
          {fields.length > 0 && (
            <button
              className="btn btn-sm btn-link exporter-clear-btn"
              onClick={doClearExporterFields}
            >clear</button>
          )}
        </span>
        <span className="exporter-preview-format">
          <label>
            <input
              type="radio"
              name="exporter-format"
              value="tsv"
              checked={format === 'tsv'}
              onChange={() => doSetExporterFormat('tsv')}
            /> TSV
          </label>
          <label>
            <input
              type="radio"
              name="exporter-format"
              value="json"
              checked={format === 'json'}
              onChange={() => doSetExporterFormat('json')}
            /> JSON
          </label>
        </span>
        <button
          type="button"
          className="btn btn-sm btn-light exporter-cutoffs-btn"
          onClick={() => setShowCutoffs(true)}
          title="Expression cutoffs"
        >
          <BsSliders/> Cutoffs
        </button>
        {renderStatus()}
      </div>
      {showCutoffs && (
        <CutoffsModal
          cutoffs={exporterCutoffs}
          onApply={doSetExporterCutoffs}
          onClose={() => setShowCutoffs(false)}
        />
      )}
      <div className="exporter-preview-body">
        {format === 'tsv' ? (
          <TSVTable
            docs={docs}
            fields={fields}
            catalog={catalog}
            resolverCtx={resolverCtx}
            onMoveField={moveField}
          />
        ) : (
          <pre className="exporter-preview-json">{toJSON(docs, fields, resolverCtx)}</pre>
        )}
      </div>
    </div>
  );
};

const MIN_COL_WIDTH = 40;

const TSVTable = ({ docs, fields, catalog, resolverCtx, onMoveField }) => {
  const { header, headerKeys, rows } = buildTableData(docs, fields, catalog, resolverCtx);
  const reorderableCount = fields.length;
  const [colWidths, setColWidths] = useState({});
  const thRefs = useRef({});

  const startResize = (key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const th = thRefs.current[key];
    const startWidth = (th && th.getBoundingClientRect().width) || 100;
    const startX = e.clientX;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const next = Math.max(MIN_COL_WIDTH, startWidth + delta);
      setColWidths(prev => ({ ...prev, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="exporter-preview-tsv-scroll">
      <table className="exporter-preview-tsv">
        <thead>
          <tr>
            {header.map((h, i) => {
              const key = headerKeys[i];
              const fieldIdx = fields.indexOf(key);
              const reorderable = fieldIdx !== -1;
              const w = colWidths[key];
              const thStyle = w ? { width: `${w}px`, maxWidth: `${w}px`, minWidth: `${w}px` } : undefined;
              return (
                <th key={key} title={key} style={thStyle} ref={el => { thRefs.current[key] = el; }}>
                  <div className="exporter-preview-th-inner">
                    <button
                      type="button"
                      className="exporter-preview-reorder-btn"
                      disabled={!reorderable || fieldIdx === 0}
                      onClick={() => onMoveField(key, -1)}
                      title="Move left"
                    ><BsArrowLeftShort/></button>
                    <span className="exporter-preview-th-label">{h}</span>
                    <button
                      type="button"
                      className="exporter-preview-reorder-btn"
                      disabled={!reorderable || fieldIdx === reorderableCount - 1}
                      onClick={() => onMoveField(key, 1)}
                      title="Move right"
                    ><BsArrowRightShort/></button>
                  </div>
                  <span
                    className="exporter-preview-col-resizer"
                    onPointerDown={startResize(key)}
                    onDoubleClick={() => setColWidths(prev => { const n = { ...prev }; delete n[key]; return n; })}
                    title="Drag to resize · double-click to reset"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((c, i) => {
                const key = headerKeys[i];
                const w = colWidths[key];
                const tdStyle = w ? { width: `${w}px`, maxWidth: `${w}px`, minWidth: `${w}px` } : undefined;
                return (
                  <td key={key} title={c} style={tdStyle}>{c}</td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={header.length} className="exporter-preview-empty-row">
                <em>No rows.</em>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectExporterSelectedFields',
  'selectExporterFormat',
  'selectExporterPreview',
  'selectExpressionStudies',
  'selectExpressionSamples',
  'selectGrameneTaxonomy',
  'selectGramenePathways',
  'selectOntologies',
  'selectExporterCutoffs',
  'doSetExporterFormat',
  'doReorderExporterFields',
  'doClearExporterFields',
  'doSetExporterCutoffs',
  'doEnsureOntologyRecords',
  'doRequestGramenePathways',
  PreviewCmp
);
