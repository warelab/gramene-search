import {
  partitionFields,
  resolveExpressionForDoc,
  EXPRESSION_EXTRA_COLUMNS
} from './expressionResolver';
import {
  ANCESTOR_FIELD_MAP,
  isAncestorField,
  formatAncestorsCellTSV,
  formatAncestorsJSON
} from './ancestorsResolver';

function scrubTSV(s) {
  return String(s).replace(/[\t\r\n]/g, ' ');
}

function formatCellTSV(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatCellTSV).join('|');
  if (typeof value === 'object') return JSON.stringify(value);
  return scrubTSV(value);
}

function formatDocFieldTSV(doc, name, resolverCtx) {
  if (isAncestorField(name)) {
    const ontKey = ANCESTOR_FIELD_MAP[name];
    const ids = Array.isArray(doc[name]) ? doc[name] : [];
    return scrubTSV(formatAncestorsCellTSV(ontKey, ids, doc.taxon_id, resolverCtx));
  }
  return formatCellTSV(doc[name]);
}

export function buildTSVHeader(fieldNames, catalog) {
  return fieldNames.map(n => {
    const f = catalog && catalog.fields && catalog.fields[n];
    if (!f) return n;
    return f.tsvHeader || f.label;
  });
}

export function buildTSVRow(doc, fieldNames, resolverCtx) {
  return fieldNames.map(n => formatDocFieldTSV(doc, n, resolverCtx));
}

export function toTSV(docs, fieldNames, catalog, resolverCtx) {
  const { expressionFields, nonExpressionFields } = partitionFields(fieldNames, catalog);

  if (expressionFields.length === 0) {
    const header = buildTSVHeader(fieldNames, catalog).join('\t');
    const rows = (docs || []).map(d => buildTSVRow(d, fieldNames, resolverCtx).join('\t'));
    return [header, ...rows].join('\n');
  }

  const expressionStudies = resolverCtx && resolverCtx.expressionStudies;
  const expressionSamples = resolverCtx && resolverCtx.expressionSamples;

  const header = [
    ...buildTSVHeader(nonExpressionFields, catalog),
    ...EXPRESSION_EXTRA_COLUMNS
  ].join('\t');

  const lines = [header];
  for (const doc of (docs || [])) {
    const baseCells = buildTSVRow(doc, nonExpressionFields, resolverCtx);
    const exprRows = resolveExpressionForDoc(
      doc,
      expressionFields,
      expressionStudies,
      expressionSamples
    );
    if (exprRows.length === 0) {
      lines.push([...baseCells, '', '', '', '', ''].join('\t'));
    } else {
      for (const er of exprRows) {
        lines.push([
          ...baseCells,
          scrubTSV(er.experiment),
          scrubTSV(er.experiment_name),
          scrubTSV(er.assay),
          scrubTSV(er.sample),
          scrubTSV(er.value)
        ].join('\t'));
      }
    }
  }
  return lines.join('\n');
}

export function buildTableData(docs, fieldNames, catalog, resolverCtx) {
  const { expressionFields, nonExpressionFields } = partitionFields(fieldNames, catalog);

  if (expressionFields.length === 0) {
    return {
      header: buildTSVHeader(fieldNames, catalog),
      headerKeys: fieldNames.slice(),
      rows: (docs || []).map(d => buildTSVRow(d, fieldNames, resolverCtx))
    };
  }

  const expressionStudies = resolverCtx && resolverCtx.expressionStudies;
  const expressionSamples = resolverCtx && resolverCtx.expressionSamples;
  const header = [...buildTSVHeader(nonExpressionFields, catalog), ...EXPRESSION_EXTRA_COLUMNS];
  const headerKeys = [...nonExpressionFields, ...EXPRESSION_EXTRA_COLUMNS];
  const rows = [];
  for (const doc of (docs || [])) {
    const base = buildTSVRow(doc, nonExpressionFields, resolverCtx);
    const exprRows = resolveExpressionForDoc(doc, expressionFields, expressionStudies, expressionSamples);
    if (exprRows.length === 0) {
      rows.push([...base, '', '', '', '', '']);
    } else {
      for (const er of exprRows) {
        rows.push([
          ...base,
          String(er.experiment || ''),
          String(er.experiment_name || ''),
          String(er.assay || ''),
          String(er.sample || ''),
          er.value == null ? '' : String(er.value)
        ]);
      }
    }
  }
  return { header, headerKeys, rows };
}

export function toJSONRows(docs, fieldNames, resolverCtx) {
  return (docs || []).map(d => {
    const row = {};
    for (const n of fieldNames) {
      if (isAncestorField(n)) {
        const ontKey = ANCESTOR_FIELD_MAP[n];
        const ids = Array.isArray(d[n]) ? d[n] : [];
        row[n] = formatAncestorsJSON(ontKey, ids, d.taxon_id, resolverCtx);
      } else {
        row[n] = d[n] !== undefined ? d[n] : null;
      }
    }
    return row;
  });
}

export function toJSON(docs, fieldNames, resolverCtx) {
  return JSON.stringify(toJSONRows(docs, fieldNames, resolverCtx), null, 2);
}
