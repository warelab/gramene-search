const EXPR_FIELD_RE = /^(E[-_][A-Za-z0-9_-]+?)_g(\d+)__expr$/;
const DIFFEXPR_FIELD_RE = /^(E[-_][A-Za-z0-9_-]+?)_g(\d+)_g(\d+)_(pval|logfc|l2fc)_attr_([a-z])$/;

export const EXPRESSION_EXTRA_COLUMNS = [
  'experiment',
  'experiment_name',
  'assay',
  'sample',
  'value'
];

export const DIFFEXPRESSION_EXTRA_COLUMNS = [
  'diff_experiment',
  'diff_experiment_name',
  'group1_factors',
  'group2_factors',
  'l2fc',
  'pval'
];

export function parseExprFieldName(name) {
  const m = name.match(EXPR_FIELD_RE);
  if (!m) return null;
  return {
    experimentId: m[1].replace(/_/g, '-'),
    group: 'g' + m[2],
    solrField: name
  };
}

export function parseDiffExprFieldName(name) {
  const m = name.match(DIFFEXPR_FIELD_RE);
  if (!m) return null;
  return {
    experimentId: m[1].replace(/_/g, '-'),
    group1: 'g' + m[2],
    group2: 'g' + m[3],
    stat: m[4],
    solrField: name
  };
}

export function isExpressionField(name, catalog) {
  const entry = catalog && catalog.fields && catalog.fields[name];
  if (entry && entry.expression) return true;
  return parseExprFieldName(name) !== null;
}

export function isDiffExpressionField(name, catalog) {
  const entry = catalog && catalog.fields && catalog.fields[name];
  if (entry && entry.diffExpression) return true;
  return parseDiffExprFieldName(name) !== null;
}

export function partitionFields(fieldNames, catalog) {
  const expressionFields = [];
  const diffExpressionFields = [];
  const nonExpressionFields = [];
  for (const n of fieldNames) {
    if (isDiffExpressionField(n, catalog)) diffExpressionFields.push(n);
    else if (isExpressionField(n, catalog)) expressionFields.push(n);
    else nonExpressionFields.push(n);
  }
  return { expressionFields, diffExpressionFields, nonExpressionFields };
}

function joinLabels(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(f => f && f.label).filter(Boolean).join('; ');
}

export function buildExperimentIndex(expressionStudies) {
  const index = {};
  if (!expressionStudies) return index;
  for (const arr of Object.values(expressionStudies)) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) if (e && e._id) index[e._id] = e;
  }
  return index;
}

function findAssay(expressionSamples, experimentId, group) {
  if (!expressionSamples) return null;
  const arr = expressionSamples[experimentId];
  if (!arr) return null;
  return arr.find(a => a.group === group) || null;
}

export function resolveExpressionForDoc(doc, expressionFields, expressionStudies, expressionSamples) {
  const rows = [];
  const experimentIndex = buildExperimentIndex(expressionStudies);
  for (const fieldName of expressionFields) {
    const parsed = parseExprFieldName(fieldName);
    if (!parsed) continue;
    const val = doc[fieldName];
    if (val === undefined || val === null) continue;
    const exp = experimentIndex[parsed.experimentId];
    const assay = findAssay(expressionSamples, parsed.experimentId, parsed.group);
    rows.push({
      field: fieldName,
      experiment: parsed.experimentId,
      experiment_name: exp ? (exp.description || exp.title || exp.name || '') : '',
      assay: parsed.group,
      sample: assay ? joinLabels(assay.factor) || joinLabels(assay.characteristic) : '',
      value: val
    });
  }
  return rows;
}

export function resolveDiffExpressionForDoc(doc, diffExpressionFields, expressionStudies, expressionSamples) {
  const experimentIndex = buildExperimentIndex(expressionStudies);
  const byContrast = new Map();
  for (const fieldName of diffExpressionFields) {
    const parsed = parseDiffExprFieldName(fieldName);
    if (!parsed) continue;
    const val = doc[fieldName];
    if (val === undefined || val === null) continue;
    const key = `${parsed.experimentId}|${parsed.group1}|${parsed.group2}`;
    let entry = byContrast.get(key);
    if (!entry) {
      entry = {
        experimentId: parsed.experimentId,
        group1: parsed.group1,
        group2: parsed.group2,
        pval: '',
        l2fc: ''
      };
      byContrast.set(key, entry);
    }
    if (parsed.stat === 'pval') entry.pval = val;
    else entry.l2fc = val; // l2fc or logfc
  }
  const rows = [];
  for (const entry of byContrast.values()) {
    const exp = experimentIndex[entry.experimentId];
    const assay1 = findAssay(expressionSamples, entry.experimentId, entry.group1);
    const assay2 = findAssay(expressionSamples, entry.experimentId, entry.group2);
    rows.push({
      diff_experiment: entry.experimentId,
      diff_experiment_name: exp ? (exp.description || exp.title || exp.name || '') : '',
      group1_factors: assay1 ? joinLabels(assay1.factor) || joinLabels(assay1.characteristic) : entry.group1,
      group2_factors: assay2 ? joinLabels(assay2.factor) || joinLabels(assay2.characteristic) : entry.group2,
      l2fc: entry.l2fc,
      pval: entry.pval
    });
  }
  return rows;
}
