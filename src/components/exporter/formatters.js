import {
  partitionFields,
  resolveExpressionForDoc,
  resolveDiffExpressionForDoc,
  EXPRESSION_EXTRA_COLUMNS,
  DIFFEXPRESSION_EXTRA_COLUMNS
} from './expressionResolver';
import {
  ANCESTOR_FIELD_MAP,
  isAncestorField,
  formatAncestorsCellTSV,
  formatAncestorsJSON,
  resolveAncestorsForDoc,
  ANCESTOR_EXTRA_COLUMNS
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

const EMPTY_EXPR_ROW = EXPRESSION_EXTRA_COLUMNS.map(() => '');
const EMPTY_DIFF_ROW = DIFFEXPRESSION_EXTRA_COLUMNS.map(() => '');
const EMPTY_ANC_ROW = ANCESTOR_EXTRA_COLUMNS.map(() => '');

function exprRowToCells(er) {
  return [
    scrubTSV(er.experiment),
    scrubTSV(er.experiment_name),
    scrubTSV(er.assay),
    scrubTSV(er.sample),
    scrubTSV(er.value)
  ];
}

function diffRowToCells(dr) {
  return [
    scrubTSV(dr.diff_experiment),
    scrubTSV(dr.diff_experiment_name),
    scrubTSV(dr.group1_factors),
    scrubTSV(dr.group2_factors),
    scrubTSV(dr.l2fc),
    scrubTSV(dr.pval)
  ];
}

function ancRowToCells(ar) {
  return [
    scrubTSV(ar.hierarchy),
    scrubTSV(ar.term_id),
    scrubTSV(ar.term_name),
    scrubTSV(ar.term_type)
  ];
}

function splitPlainAndAncestor(nonExpressionFields) {
  const ancestorFields = [];
  const plainFields = [];
  for (const n of nonExpressionFields) {
    if (isAncestorField(n)) ancestorFields.push(n);
    else plainFields.push(n);
  }
  return { ancestorFields, plainFields };
}

function buildExpandedRows(docs, plainFields, ancestorFields, expressionFields, diffExpressionFields, resolverCtx) {
  const expressionStudies = resolverCtx && resolverCtx.expressionStudies;
  const expressionSamples = resolverCtx && resolverCtx.expressionSamples;
  const cutoffs = resolverCtx && resolverCtx.cutoffs;
  const hasExpr = expressionFields.length > 0;
  const hasDiff = diffExpressionFields.length > 0;
  const hasAnc = ancestorFields.length > 0;
  const rows = [];
  for (const doc of (docs || [])) {
    const baseCells = buildTSVRow(doc, plainFields, resolverCtx);
    const ancRows = hasAnc
      ? resolveAncestorsForDoc(doc, ancestorFields, resolverCtx)
      : [];
    const exprRows = hasExpr
      ? resolveExpressionForDoc(doc, expressionFields, expressionStudies, expressionSamples, cutoffs)
      : [];
    const diffRows = hasDiff
      ? resolveDiffExpressionForDoc(doc, diffExpressionFields, expressionStudies, expressionSamples, cutoffs)
      : [];
    const ancCells = ancRows.length ? ancRows.map(ancRowToCells) : (hasAnc ? [EMPTY_ANC_ROW] : [null]);
    const exprCells = exprRows.length ? exprRows.map(exprRowToCells) : (hasExpr ? [EMPTY_EXPR_ROW] : [null]);
    const diffCells = diffRows.length ? diffRows.map(diffRowToCells) : (hasDiff ? [EMPTY_DIFF_ROW] : [null]);
    for (const a of ancCells) {
      for (const e of exprCells) {
        for (const d of diffCells) {
          const out = [...baseCells];
          if (a) out.push(...a);
          if (e) out.push(...e);
          if (d) out.push(...d);
          rows.push(out);
        }
      }
    }
  }
  return rows;
}

export function toTSV(docs, fieldNames, catalog, resolverCtx) {
  const { expressionFields, diffExpressionFields, nonExpressionFields } = partitionFields(fieldNames, catalog);
  const { ancestorFields, plainFields } = splitPlainAndAncestor(nonExpressionFields);

  if (expressionFields.length === 0 && diffExpressionFields.length === 0 && ancestorFields.length === 0) {
    const header = buildTSVHeader(fieldNames, catalog).join('\t');
    const rows = (docs || []).map(d => buildTSVRow(d, fieldNames, resolverCtx).join('\t'));
    return [header, ...rows].join('\n');
  }

  const header = [
    ...buildTSVHeader(plainFields, catalog),
    ...(ancestorFields.length ? ANCESTOR_EXTRA_COLUMNS : []),
    ...(expressionFields.length ? EXPRESSION_EXTRA_COLUMNS : []),
    ...(diffExpressionFields.length ? DIFFEXPRESSION_EXTRA_COLUMNS : [])
  ].join('\t');

  const rows = buildExpandedRows(docs, plainFields, ancestorFields, expressionFields, diffExpressionFields, resolverCtx);
  return [header, ...rows.map(r => r.join('\t'))].join('\n');
}

export function buildTableData(docs, fieldNames, catalog, resolverCtx) {
  const { expressionFields, diffExpressionFields, nonExpressionFields } = partitionFields(fieldNames, catalog);
  const { ancestorFields, plainFields } = splitPlainAndAncestor(nonExpressionFields);

  if (expressionFields.length === 0 && diffExpressionFields.length === 0 && ancestorFields.length === 0) {
    return {
      header: buildTSVHeader(fieldNames, catalog),
      headerKeys: fieldNames.slice(),
      rows: (docs || []).map(d => buildTSVRow(d, fieldNames, resolverCtx))
    };
  }

  const header = [
    ...buildTSVHeader(plainFields, catalog),
    ...(ancestorFields.length ? ANCESTOR_EXTRA_COLUMNS : []),
    ...(expressionFields.length ? EXPRESSION_EXTRA_COLUMNS : []),
    ...(diffExpressionFields.length ? DIFFEXPRESSION_EXTRA_COLUMNS : [])
  ];
  const headerKeys = [
    ...plainFields,
    ...(ancestorFields.length ? ANCESTOR_EXTRA_COLUMNS : []),
    ...(expressionFields.length ? EXPRESSION_EXTRA_COLUMNS : []),
    ...(diffExpressionFields.length ? DIFFEXPRESSION_EXTRA_COLUMNS : [])
  ];
  const rows = buildExpandedRows(docs, plainFields, ancestorFields, expressionFields, diffExpressionFields, resolverCtx);
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
