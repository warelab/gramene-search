// Shared vocabulary and helpers for the sorghum_v11 per-gene expression
// attributes (`expr_*__attr_*`). Used by both the Homology tbrowse Expression
// zone (results/details/exprAttrsZone.js) and the Attribute table view
// (attrTable/AttrTableView.js) so organ ordering and the ordinal level colors
// stay a single source of truth.

// Canonical anatomical ordering (vegetative → reproductive → seed). Organs not
// listed here are appended alphabetically so nothing is ever dropped.
export const ORGAN_ORDER = [
  'root', 'shoot', 'stem', 'leaf', 'meristem', 'vasculature', 'tuber', 'cotyledon',
  'inflorescence', 'flower', 'anther_pollen', 'fruit', 'pericarp', 'seed', 'endosperm', 'embryo',
];

// Short column-header codes; unknown organs fall back to their first 3 letters.
export const ORGAN_ABBR = {
  root: 'rt', shoot: 'sht', stem: 'stm', leaf: 'lf', meristem: 'mer', vasculature: 'vas',
  tuber: 'tbr', cotyledon: 'cot', inflorescence: 'inf', flower: 'flw', anther_pollen: 'ant',
  fruit: 'frt', pericarp: 'per', seed: 'sd', endosperm: 'end', embryo: 'emb',
};
export const abbrOrgan = (o) => ORGAN_ABBR[o] || o.slice(0, 3);
export const organLabel = (o) => o.replace(/_/g, ' ');

// Ordinal expression level → color. not_expressed gets a distinct pale tint (it
// IS a measurement); an organ a species doesn't report stays transparent (= not
// assayed). Ramp matches exprViz/HeatmapPlot's pale→dark blue.
export const LEVEL_ORDER = ['not_expressed', 'low', 'medium', 'high', 'very_high'];
export const LEVEL_COLOR = {
  not_expressed: '#eef2f6',
  low: '#cfe0ee',
  medium: '#8fbbdc',
  high: '#3f86c2',
  very_high: '#0a3d72',
};
export const LEVEL_LABEL = {
  not_expressed: 'not expressed', low: 'low', medium: 'medium', high: 'high', very_high: 'very high',
};
// Rank for sorting an organ column by severity rather than alphabetically.
export const LEVEL_RANK = LEVEL_ORDER.reduce((m, l, i) => { m[l] = i; return m; }, {});

// Stress chips: activated (induced) = cool, repressed = warm.
export const STRESS = {
  up: { bg: '#eaf2fb', fg: '#2e6fae' },
  down: { bg: '#fdecea', fg: '#c0392b' },
};
export const MARKER = '#d35400'; // specific-to dot / enhanced-in outline

/** Parse `["root:low","shoot:medium"]` into `{root:'low', shoot:'medium'}`. */
export function parseOrganLevels(tokens) {
  const out = {};
  (tokens || []).forEach((t) => {
    const i = t.lastIndexOf(':');
    if (i < 0) return;
    out[t.slice(0, i)] = t.slice(i + 1);
  });
  return out;
}

/** Order an organ set canonically; unknown organs appended alphabetically. */
export function orderOrgans(organs) {
  const set = organs instanceof Set ? organs : new Set(organs || []);
  const known = ORGAN_ORDER.filter((o) => set.has(o));
  const unknown = [...set].filter((o) => !ORGAN_ORDER.includes(o)).sort();
  return [...known, ...unknown];
}

/**
 * Pull the expression attributes off one search doc into a normalized shape.
 * Everything is optional — genes without expression data yield empty values.
 */
export function extractExprAttrs(doc) {
  const d = doc || {};
  const cls = d.expr_class__attr_ss || [];
  const maxTpm = Number.isFinite(+d.expr_max_tpm__attr_f) ? +d.expr_max_tpm__attr_f : null;
  const tau = Number.isFinite(+d.expr_tau__attr_f) ? +d.expr_tau__attr_f : null;
  return {
    organLevels: parseOrganLevels(d.expr_organ_level__attr_ss),
    specificTo: new Set(d.expr_specific_to__attr_ss || []),
    enhancedIn: new Set(d.expr_enhanced_in__attr_ss || []),
    highIn: new Set(d.expr_high_in__attr_ss || []),
    cls,
    maxTpm,
    tau,
    nOrgans: Number.isFinite(+d.expr_n_organs_detected__attr_i) ? +d.expr_n_organs_detected__attr_i : null,
    activatedBy: d.expr_activated_by__attr_ss || [],
    repressedBy: d.expr_repressed_by__attr_ss || [],
  };
}

/** Log-scaled position of v within [min,max]; null when not a number. */
export function tpmFraction(v, range) {
  if (!Number.isFinite(v)) return null;
  const lo = Math.log10(((range && range.min) || 0) + 1);
  const hi = Math.log10(((range && range.max) || 0) + 1);
  if (hi <= lo) return 0.5;
  return Math.max(0, Math.min(1, (Math.log10(v + 1) - lo) / (hi - lo)));
}

/** Blue heat background for a Max TPM cell, or transparent. */
export function tpmBackground(v, range) {
  const f = tpmFraction(v, range);
  if (f === null) return 'transparent';
  return `rgba(33, 102, 172, ${(0.1 + 0.65 * f).toFixed(3)})`;
}

export function fmtTpm(v) {
  if (!Number.isFinite(v)) return '';
  return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

export function fmtClass(cls) {
  return cls && cls.length ? cls.map((c) => c.replace(/_/g, ' ')).join(', ') : null;
}

/** The expr_* fields the table/zone always need fetched. */
export const EXPR_ATTR_FIELDS = [
  'expr_class__attr_ss',
  'expr_organ_level__attr_ss',
  'expr_specific_to__attr_ss',
  'expr_enhanced_in__attr_ss',
  'expr_high_in__attr_ss',
  'expr_activated_by__attr_ss',
  'expr_repressed_by__attr_ss',
  'expr_tau__attr_f',
  'expr_max_tpm__attr_f',
  'expr_n_organs_detected__attr_i',
];
