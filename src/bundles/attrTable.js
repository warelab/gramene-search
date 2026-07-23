import { createSelector } from 'redux-bundler';
import { EXPR_ATTR_FIELDS } from '../components/exprAttrs/exprAttrCommon';

// Backing store for the "Attribute table" view: the genes in the current search
// result set, fetched in pages and rendered as a gene × attribute table.
//
// Paging mirrors exprViz's doFetchExprVizData: a recursive fetchPage(offset)
// with a request-id guard so a superseded fetch can never write stale rows.
//
// The offered columns are deliberately limited to two field-catalog groups —
// Core identifiers and Expression attributes — and *all* of them are fetched up
// front. That keeps the column picker a pure visibility control: toggling a
// column is instant and never triggers a refetch.

const PAGE_SIZE = 1000;
const MAX_GENES = 5000;

// The catalog groups whose fields the column picker offers.
const OFFERED_GROUPS = ['core', 'exprattrs'];

// The 'core' group's fields (bundles/../fieldCatalog.overlay.json).
const CORE_FIELDS = [
  'id', 'name', 'alt_id', 'synonyms', 'description', 'summary',
  'biotype', 'system_name', 'taxon_id', 'db_type'
];

// Always fetched, so visibility toggles never need the network. taxon_id is
// needed by the genome filter even when its column is hidden.
const FETCH_FIELDS = [...new Set([...CORE_FIELDS, ...EXPR_ATTR_FIELDS])];

// Default columns, in display order. The two stress fields are adjacent so the
// view can merge them into a single "Activated/Repressed by condition" column.
const DEFAULT_VISIBLE = [
  'id',
  'expr_max_tpm__attr_f',
  'expr_organ_level__attr_ss',
  'expr_class__attr_ss',
  'expr_activated_by__attr_ss', 'expr_repressed_by__attr_ss'
];

let fetchPendingId = 0;

// Only send fq=taxon_id:(...) when the user has actually subset the genomes —
// same rule the main search uses (see bundles/api.js), so the table matches the
// visible result set without bloating the URL.
function genomeSubset(g, m) {
  const maps = m || {};
  const visibleTaxa = Object.keys(maps).filter(tid => !maps[tid].hidden);
  const activeVisible = Object.keys((g && g.active) || {}).filter(tid => maps[tid] && !maps[tid].hidden);
  const subset = activeVisible.length > 0 && activeVisible.length < visibleTaxa.length;
  const sorted = activeVisible.slice().sort();
  return {
    fq: subset ? `&fq=taxon_id:(${sorted.join(' OR ')})` : '',
    key: subset ? sorted.join(',') : ''
  };
}

// Visible columns are deliberately NOT part of the signature — they don't
// affect what we fetch.
function computeSignature(q, g, m) {
  return `${q}|${genomeSubset(g, m).key}`;
}

const attrTable = {
  name: 'attrTable',

  getReducer: () => {
    const initialState = {
      status: 'idle', // idle | loading | ready | error
      docs: [],
      total: 0,
      truncated: false,
      signature: null,
      error: null,
      requestId: 0,
      visibleFields: DEFAULT_VISIBLE.slice()
    };

    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'ATTRTABLE_FETCH_STARTED':
          return {
            ...state,
            status: 'loading',
            docs: [],
            total: 0,
            truncated: false,
            error: null,
            signature: payload.signature,
            requestId: payload.requestId
          };

        case 'ATTRTABLE_FETCH_BATCH': {
          if (payload.requestId !== state.requestId) return state; // superseded
          const docs = state.docs.concat(payload.docs);
          const target = Math.min(payload.total, MAX_GENES);
          return {
            ...state,
            docs,
            total: payload.total,
            truncated: payload.total > MAX_GENES,
            status: docs.length >= target ? 'ready' : 'loading'
          };
        }

        case 'ATTRTABLE_FETCH_FAILED':
          if (payload.requestId !== state.requestId) return state;
          return { ...state, status: 'error', error: payload.error };

        case 'ATTRTABLE_FIELD_TOGGLED': {
          const set = new Set(state.visibleFields);
          if (set.has(payload)) set.delete(payload);
          else set.add(payload);
          return { ...state, visibleFields: [...set] };
        }

        case 'ATTRTABLE_FIELDS_BULK_SET': {
          const set = new Set(state.visibleFields);
          (payload.names || []).forEach(n => {
            if (payload.selected) set.add(n);
            else set.delete(n);
          });
          return { ...state, visibleFields: [...set] };
        }

        case 'ATTRTABLE_FIELDS_RESET':
          return { ...state, visibleFields: DEFAULT_VISIBLE.slice() };

        case 'GRAMENE_SEARCH_CLEARED':
          return { ...initialState, visibleFields: state.visibleFields };

        default:
          return state;
      }
    };
  },

  doFetchAttrTable: () => ({ dispatch, store }) => {
    const q = store.selectGrameneFiltersQueryString();
    const { fq } = genomeSubset(store.selectGrameneGenomes(), store.selectGrameneMaps());
    const signature = computeSignature(q, store.selectGrameneGenomes(), store.selectGrameneMaps());
    const requestId = ++fetchPendingId;
    dispatch({ type: 'ATTRTABLE_FETCH_STARTED', payload: { requestId, signature } });

    const api = store.selectGrameneAPI();
    // Explicit fl — never fl=*, which would drag in every per-sample __expr column.
    const fl = FETCH_FIELDS.join(',');

    const fetchPage = (offset) => {
      if (requestId !== fetchPendingId) return; // superseded
      const rows = Math.min(PAGE_SIZE, MAX_GENES - offset);
      if (rows <= 0) return;
      const url = `${api}/search?q=${q}${fq}&fl=${fl}&rows=${rows}&start=${offset}`;
      fetch(url)
        .then(r => r.json())
        .then(json => {
          if (requestId !== fetchPendingId) return;
          const docs = (json.response && json.response.docs) || [];
          const total = (json.response && json.response.numFound) || 0;
          dispatch({ type: 'ATTRTABLE_FETCH_BATCH', payload: { requestId, docs, total } });
          const next = offset + docs.length;
          if (docs.length > 0 && next < Math.min(total, MAX_GENES)) fetchPage(next);
        })
        .catch(err => {
          dispatch({ type: 'ATTRTABLE_FETCH_FAILED', payload: { requestId, error: String(err) } });
        });
    };
    fetchPage(0);
  },

  doToggleAttrTableField: name => ({ dispatch }) =>
    dispatch({ type: 'ATTRTABLE_FIELD_TOGGLED', payload: name }),

  doBulkSetAttrTableFields: (names, selected) => ({ dispatch }) =>
    dispatch({ type: 'ATTRTABLE_FIELDS_BULK_SET', payload: { names, selected } }),

  doResetAttrTableFields: () => ({ dispatch }) =>
    dispatch({ type: 'ATTRTABLE_FIELDS_RESET' }),

  selectAttrTable: state => state.attrTable,
  selectAttrTableVisibleFields: state => state.attrTable.visibleFields,

  // Fetch only while the view is on, and only when the query context changes.
  reactAttrTableFetch: createSelector(
    'selectAttrTable',
    'selectGrameneFiltersStatus',
    'selectGrameneViewsOn',
    'selectGrameneFiltersQueryString',
    'selectGrameneGenomes',
    'selectGrameneMaps',
    (at, filtersStatus, viewsOn, q, g, m) => {
      if (!at || filtersStatus === 'init') return;
      if (!viewsOn || !viewsOn.has('attrTable')) return;
      if (at.status === 'loading') return;
      const sig = computeSignature(q, g, m);
      if (at.signature === sig && (at.status === 'ready' || at.status === 'error')) return;
      return { actionCreator: 'doFetchAttrTable' };
    }
  )
};

export const ATTR_TABLE_LIMITS = { PAGE_SIZE, MAX_GENES };
export { OFFERED_GROUPS, CORE_FIELDS, DEFAULT_VISIBLE };
export default attrTable;
