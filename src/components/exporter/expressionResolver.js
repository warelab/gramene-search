const EXPR_FIELD_RE = /^(E[-_][A-Za-z0-9_-]+?)_g(\d+)__expr$/;

export const EXPRESSION_EXTRA_COLUMNS = [
  'experiment',
  'experiment_name',
  'assay',
  'sample',
  'value'
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

export function isExpressionField(name, catalog) {
  const entry = catalog && catalog.fields && catalog.fields[name];
  if (entry && entry.expression) return true;
  return parseExprFieldName(name) !== null;
}

export function partitionFields(fieldNames, catalog) {
  const expressionFields = [];
  const nonExpressionFields = [];
  for (const n of fieldNames) {
    if (isExpressionField(n, catalog)) expressionFields.push(n);
    else nonExpressionFields.push(n);
  }
  return { expressionFields, nonExpressionFields };
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
      experiment_name: exp ? exp.name || '' : '',
      assay: parsed.group,
      sample: assay ? joinLabels(assay.factor) || joinLabels(assay.characteristic) : '',
      value: val
    });
  }
  return rows;
}
