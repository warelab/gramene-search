import { createSelector } from 'redux-bundler';

// State shape:
// {
//   pivot: { status, signature, data: { [taxon_id]: <gene count> }, error, requestId },
//   activeTaxon: <taxon_id|null>,
//   byTaxon: {
//     [taxon_id]: {
//       selectedFields: [<solr field name>...],
//       fieldsModalOpen: <bool>,
//       fetch: { status, offset, total, signature, requestId, error },
//       rows: [<doc>...]
//     }
//   }
// }
// Per-taxon study lists are derived in the view layer from expressionStudies.

const PAGE_SIZE = 200;

let pivotPendingId = 0;
const fetchPending = {}; // per-taxon request id
const attrsPending = {}; // per-taxon request id for available attrs

function pivotSignature(store) {
  const q = store.selectGrameneFiltersQueryString();
  const g = store.selectGrameneGenomes();
  const m = store.selectGrameneMaps() || {};
  const taxa = Object.keys(g.active || {}).filter(tid => m[tid] && !m[tid].hidden);
  return `${q}|${taxa.sort().join(',')}`;
}

function fetchSignature(store, taxon) {
  const q = store.selectGrameneFiltersQueryString();
  const ev = store.selectExprViz();
  const sel = (ev.byTaxon[taxon] && ev.byTaxon[taxon].selectedFields) || [];
  return `${q}|${taxon}|${sel.slice().sort().join(',')}`;
}

const ALWAYS_FL = ['id', 'name', 'system_name', 'taxon_id'];

const exprViz = {
  name: 'exprViz',

  getReducer: () => {
    const initialState = {
      pivot: { status: 'idle', signature: null, data: {}, error: null, requestId: 0 },
      activeTaxon: null,
      byTaxon: {}
    };

    function ensureTaxon(state, taxon) {
      if (state.byTaxon[taxon]) return state.byTaxon[taxon];
      return {
        selectedFields: [],
        fieldsModalOpen: false,
        fetch: { status: 'idle', offset: 0, total: 0, signature: null, requestId: 0, error: null },
        rows: [],
        availableAttrs: null,
        attrsSignature: null,
        attrsRequestId: 0
      };
    }

    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'EXPRVIZ_PIVOT_STARTED':
          return { ...state, pivot: { status: 'loading', signature: payload.signature, data: state.pivot.data, error: null, requestId: payload.requestId } };
        case 'EXPRVIZ_PIVOT_SUCCEEDED':
          if (payload.requestId !== state.pivot.requestId) return state;
          return { ...state, pivot: { status: 'ready', signature: state.pivot.signature, data: payload.data, error: null, requestId: payload.requestId } };
        case 'EXPRVIZ_PIVOT_FAILED':
          if (payload.requestId !== state.pivot.requestId) return state;
          return { ...state, pivot: { ...state.pivot, status: 'error', error: payload.error } };

        case 'EXPRVIZ_ACTIVE_TAXON_SET':
          return { ...state, activeTaxon: payload };

        case 'EXPRVIZ_FIELDS_MODAL_TOGGLED': {
          const t = ensureTaxon(state, payload.taxon);
          return {
            ...state,
            byTaxon: { ...state.byTaxon, [payload.taxon]: { ...t, fieldsModalOpen: payload.open } }
          };
        }
        case 'EXPRVIZ_FIELDS_SET': {
          const t = ensureTaxon(state, payload.taxon);
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: {
                ...t,
                selectedFields: payload.fields,
                rows: [],
                fetch: { status: 'idle', offset: 0, total: 0, signature: null, requestId: 0, error: null }
              }
            }
          };
        }
        case 'EXPRVIZ_FIELDS_REORDERED': {
          const t = state.byTaxon[payload.taxon];
          if (!t) return state;
          // Same set of fields — preserve rows; only the column/axis order changes.
          const setA = new Set(t.selectedFields);
          const setB = new Set(payload.fields);
          if (setA.size !== setB.size || ![...setA].every(f => setB.has(f))) {
            return state;
          }
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, selectedFields: payload.fields }
            }
          };
        }

        case 'EXPRVIZ_FETCH_STARTED': {
          const t = ensureTaxon(state, payload.taxon);
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: {
                ...t,
                fetch: { ...t.fetch, status: 'loading', signature: payload.signature, requestId: payload.requestId, error: null }
              }
            }
          };
        }
        case 'EXPRVIZ_FETCH_BATCH': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.fetch.requestId) return state;
          const rows = t.rows.concat(payload.docs);
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: {
                ...t,
                rows,
                fetch: { ...t.fetch, offset: rows.length, total: payload.total, status: rows.length >= payload.total ? 'done' : 'loading' }
              }
            }
          };
        }
        case 'EXPRVIZ_FETCH_FAILED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.fetch.requestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, fetch: { ...t.fetch, status: 'error', error: payload.error } }
            }
          };
        }

        case 'EXPRVIZ_ATTRS_STARTED': {
          const t = ensureTaxon(state, payload.taxon);
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, attrsRequestId: payload.requestId, attrsSignature: payload.signature }
            }
          };
        }
        case 'EXPRVIZ_ATTRS_SUCCEEDED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.attrsRequestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, availableAttrs: payload.attrs }
            }
          };
        }

        case 'GRAMENE_SEARCH_CLEARED': {
          // Search context changed — invalidate pivot and any loaded rows.
          // Selected fields are kept so the user can re-run the load.
          const newByTaxon = {};
          for (const tid of Object.keys(state.byTaxon)) {
            newByTaxon[tid] = {
              ...state.byTaxon[tid],
              rows: [],
              fetch: { status: 'idle', offset: 0, total: 0, signature: null, requestId: 0, error: null },
              availableAttrs: null,
              attrsSignature: null
            };
          }
          return {
            ...state,
            pivot: { status: 'idle', signature: null, data: {}, error: null, requestId: 0 },
            byTaxon: newByTaxon
          };
        }

        default:
          return state;
      }
    };
  },

  doFetchExprVizPivot: () => ({ dispatch, store }) => {
    const requestId = ++pivotPendingId;
    const signature = pivotSignature(store);
    dispatch({ type: 'EXPRVIZ_PIVOT_STARTED', payload: { requestId, signature } });

    const api = store.selectGrameneAPI();
    const q = store.selectGrameneFiltersQueryString();
    const g = store.selectGrameneGenomes();
    const m = store.selectGrameneMaps() || {};
    const taxa = Object.keys(g.active || {}).filter(tid => m[tid] && !m[tid].hidden);
    const fq = taxa.length ? `&fq=taxon_id:(${taxa.join(' OR ')})` : '';
    const facetField = "{!facet.limit='300' facet.mincount='1' key='taxon_id'}taxon_id";
    const url = `${api}/search?q=${q}${fq}&fq=expressed_in_gxa_attr_ss:*&rows=0&facet=true&facet.field=${facetField}`;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        const arr = (json && json.facet_counts && json.facet_counts.facet_fields && json.facet_counts.facet_fields.taxon_id) || [];
        const data = {};
        for (let i = 0; i < arr.length; i += 2) {
          data[arr[i]] = arr[i + 1];
        }
        if (Object.keys(data).length === 0) {
          console.warn('[exprViz] no taxon_ids found with expression', { url, json });
        }
        dispatch({ type: 'EXPRVIZ_PIVOT_SUCCEEDED', payload: { requestId, data } });
      })
      .catch(err => {
        dispatch({ type: 'EXPRVIZ_PIVOT_FAILED', payload: { requestId, error: String(err) } });
      });
  },

  doSetExprVizActiveTaxon: tid => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_ACTIVE_TAXON_SET', payload: tid }),

  doToggleExprVizFieldsModal: (taxon, open) => ({ dispatch, store }) => {
    dispatch({ type: 'EXPRVIZ_FIELDS_MODAL_TOGGLED', payload: { taxon, open: !!open } });
    if (open) store.doFetchExprVizAvailableAttrs(taxon);
  },

  doFetchExprVizAvailableAttrs: taxon => ({ dispatch, store }) => {
    const q = store.selectGrameneFiltersQueryString();
    const signature = `${q}|${taxon}`;
    const ev = store.selectExprViz();
    const t = ev.byTaxon[taxon];
    if (t && t.availableAttrs && t.attrsSignature === signature) return;
    const requestId = (attrsPending[taxon] = (attrsPending[taxon] || 0) + 1);
    dispatch({ type: 'EXPRVIZ_ATTRS_STARTED', payload: { taxon, requestId, signature } });

    const api = store.selectGrameneAPI();
    const facetField = "{!facet.limit='2000' facet.mincount='1' key='attrs'}expressed_in_gxa_attr_ss";
    const url = `${api}/search?q=${q}&fq=taxon_id:${taxon}&fq=expressed_in_gxa_attr_ss:*&rows=0&facet=true&facet.field=${facetField}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (requestId !== attrsPending[taxon]) return;
        const arr = (json && json.facet_counts && json.facet_counts.facet_fields && json.facet_counts.facet_fields.attrs) || [];
        const attrs = [];
        for (let i = 0; i < arr.length; i += 2) attrs.push(arr[i]);
        dispatch({ type: 'EXPRVIZ_ATTRS_SUCCEEDED', payload: { taxon, requestId, attrs } });
      })
      .catch(() => { /* swallow — non-fatal; modal still works without filtering */ });
  },

  doSetExprVizFields: (taxon, fields) => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_FIELDS_SET', payload: { taxon, fields } }),

  doReorderExprVizFields: (taxon, fields) => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_FIELDS_REORDERED', payload: { taxon, fields } }),

  doFetchExprVizData: taxon => ({ dispatch, store }) => {
    const ev = store.selectExprViz();
    const t = ev.byTaxon[taxon];
    if (!t || t.selectedFields.length === 0) return;
    const requestId = (fetchPending[taxon] = (fetchPending[taxon] || 0) + 1);
    const signature = fetchSignature(store, taxon);
    dispatch({ type: 'EXPRVIZ_FETCH_STARTED', payload: { taxon, requestId, signature } });

    const api = store.selectGrameneAPI();
    const q = store.selectGrameneFiltersQueryString();
    const fl = [...new Set([...ALWAYS_FL, ...t.selectedFields])].join(',');

    const fetchPage = (offset) => {
      if (requestId !== fetchPending[taxon]) return; // superseded
      const url = `${api}/search?q=${q}&fq=taxon_id:${taxon}&fl=${fl}&rows=${PAGE_SIZE}&start=${offset}`;
      fetch(url)
        .then(r => r.json())
        .then(json => {
          if (requestId !== fetchPending[taxon]) return;
          const docs = (json.response && json.response.docs) || [];
          const total = (json.response && json.response.numFound) || 0;
          dispatch({ type: 'EXPRVIZ_FETCH_BATCH', payload: { taxon, requestId, docs, total } });
          const next = offset + docs.length;
          if (docs.length > 0 && next < total) {
            fetchPage(next);
          }
        })
        .catch(err => {
          dispatch({ type: 'EXPRVIZ_FETCH_FAILED', payload: { taxon, requestId, error: String(err) } });
        });
    };
    fetchPage(0);
  },

  reactExprVizPivot: createSelector(
    'selectExprViz',
    'selectGrameneFiltersStatus',
    'selectGrameneViews',
    'selectGrameneFiltersQueryString',
    'selectGrameneGenomes',
    'selectGrameneMaps',
    (ev, filtersStatus, views, q, g, m) => {
      if (!ev || filtersStatus === 'init') return;
      const onView = views && views.options && views.options.find(v => v.id === 'exprViz');
      if (!onView || onView.show !== 'on') return;
      const maps = m || {};
      const taxa = Object.keys((g && g.active) || {}).filter(tid => maps[tid] && !maps[tid].hidden);
      const sig = `${q}|${taxa.sort().join(',')}`;
      if (ev.pivot.status === 'loading') return;
      if (ev.pivot.signature === sig && ev.pivot.status === 'ready') return;
      return { actionCreator: 'doFetchExprVizPivot' };
    }
  ),

  selectExprViz: state => state.exprViz,
  selectExprVizPivot: state => state.exprViz.pivot,
  selectExprVizActiveTaxon: state => state.exprViz.activeTaxon,
  selectExprVizByTaxon: state => state.exprViz.byTaxon
};

export default exprViz;
