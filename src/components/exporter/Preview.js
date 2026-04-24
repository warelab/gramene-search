import React, { useEffect, useMemo } from 'react';
import { connect } from 'redux-bundler-react';
import { buildTableData, toJSON } from './formatters';
import { ANCESTOR_FIELD_MAP, collectAncestorIds } from './ancestorsResolver';

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
    doSetExporterFormat,
    doEnsureOntologyRecords,
    doRequestGramenePathways
  } = props;

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
    ontologies
  };

  return (
    <div className="exporter-preview">
      <div className="exporter-preview-toolbar">
        <span className="exporter-preview-title"><b>Preview</b> (first 20 genes)</span>
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
        {renderStatus()}
      </div>
      <div className="exporter-preview-body">
        {format === 'tsv' ? (
          <TSVTable docs={docs} fields={fields} catalog={catalog} resolverCtx={resolverCtx}/>
        ) : (
          <pre className="exporter-preview-json">{toJSON(docs, fields, resolverCtx)}</pre>
        )}
      </div>
    </div>
  );
};

const TSVTable = ({ docs, fields, catalog, resolverCtx }) => {
  const { header, headerKeys, rows } = buildTableData(docs, fields, catalog, resolverCtx);
  return (
    <div className="exporter-preview-tsv-scroll">
      <table className="exporter-preview-tsv">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={headerKeys[i]} title={headerKeys[i]}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((c, i) => (
                <td key={headerKeys[i]} title={c}>{c}</td>
              ))}
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
  'doSetExporterFormat',
  'doEnsureOntologyRecords',
  'doRequestGramenePathways',
  PreviewCmp
);
