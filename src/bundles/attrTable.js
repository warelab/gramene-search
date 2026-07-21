import { createSelector } from 'redux-bundler';
import { EXPR_ATTR_FIELDS } from '../components/exprAttrs/exprAttrCommon';

// Backing store for the "Attribute table" view: the genes in the current search
// result set, fetched in pages and rendered as a gene × attribute table (basic
// identity columns + the expression-attribute heatmap + any extra attribute
// columns the user picks from the field catalog).
//
// Paging mirrors exprViz's doFetchExprVizData: a recursive fetchPage(offset)
// with a request-id guard so a superseded fetch can never write stale rows.

const PAGE_SIZE = 1000;
const MAX_GENES = 5000;

// Identity/basic columns that are always fetched.
const BASE_FIELDS = ['id', 'name', 'system_name', 'taxon_id', 'biotype', 'region', 'start', 'end'];

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

function computeSignature(q, g, m, selectedFields) {
  return `${q}|${genomeSubset(g, m).key}|${(selectedFields || []).slice().sort().join(',')}`;
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
      selectedFields: [] // extra attribute columns chosen from the field catalog
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
          const set = new Set(state.selectedFields);
          if (set.has(payload)) set.delete(payload);
          else set.add(payload);
          return { ...state, selectedFields: [...set] };
        }

        case 'ATTRTABLE_FIELDS_BULK_SET': {
          const set = new Set(state.selectedFields);
          (payload.names || []).forEach(n => {
            if (payload.selected) set.add(n);
            else set.delete(n);
          });
          return { ...state, selectedFields: [...set] };
        }

        case 'GRAMENE_SEARCH_CLEARED':
          return { ...initialState, selectedFields: state.selectedFields };

        default:
          return state;
      }
    };
  },

  doFetchAttrTable: () => ({ dispatch, store }) => {
    const { selectedFields } = store.selectAttrTable();
    const q = store.selectGrameneFiltersQueryString();
    const { fq } = genomeSubset(store.selectGrameneGenomes(), store.selectGrameneMaps());
    const signature = computeSignature(
      q, store.selectGrameneGenomes(), store.selectGrameneMaps(), selectedFields
    );
    const requestId = ++fetchPendingId;
    dispatch({ type: 'ATTRTABLE_FETCH_STARTED', payload: { requestId, signature } });

    const api = store.selectGrameneAPI();
    // Explicit fl — never fl=*, which would drag in every per-sample __expr column.
    const fl = [...new Set([...BASE_FIELDS, ...EXPR_ATTR_FIELDS, ...selectedFields])].join(',');

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

  selectAttrTable: state => state.attrTable,
  selectAttrTableSelectedFields: state => state.attrTable.selectedFields,

  // Fetch only while the view is actually on, and only when the query context or
  // the chosen columns have changed. A toggle made mid-load is picked up when the
  // in-flight fetch settles (the signature will no longer match).
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
      const sig = computeSignature(q, g, m, at.selectedFields);
      if (at.signature === sig && (at.status === 'ready' || at.status === 'error')) return;
      return { actionCreator: 'doFetchAttrTable' };
    }
  )
};

export const ATTR_TABLE_LIMITS = { PAGE_SIZE, MAX_GENES };
export default attrTable;
