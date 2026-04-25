import { createSelector } from 'redux-bundler';

// State shape:
// {
//   pivot: { status, signature, data: { [taxon_id]: [ {value: studyId, count} ] } },
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

const PAGE_SIZE = 200;

let pivotPendingId = 0;
const fetchPending = {}; // per-taxon request id

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
        rows: []
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
    const url = `${api}/search?q=${q}${fq}&rows=0&facet=true&facet.pivot=${encodeURIComponent("{!facet.limit=-1 facet.mincount=1}taxon_id,expressed_in_gxa_attr_ss")}`;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        const pivots = (json && json.facet_counts && json.facet_counts.facet_pivot) || {};
        const key = Object.keys(pivots)[0];
        const arr = (key && pivots[key]) || [];
        const data = {};
        arr.forEach(taxonEntry => {
          const tid = taxonEntry.value;
          const studies = (taxonEntry.pivot || []).map(p => ({ value: p.value, count: p.count }));
          data[tid] = studies;
        });
        dispatch({ type: 'EXPRVIZ_PIVOT_SUCCEEDED', payload: { requestId, data } });
      })
      .catch(err => {
        dispatch({ type: 'EXPRVIZ_PIVOT_FAILED', payload: { requestId, error: String(err) } });
      });
  },

  doSetExprVizActiveTaxon: tid => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_ACTIVE_TAXON_SET', payload: tid }),

  doToggleExprVizFieldsModal: (taxon, open) => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_FIELDS_MODAL_TOGGLED', payload: { taxon, open: !!open } }),

  doSetExprVizFields: (taxon, fields) => ({ dispatch }) =>
    dispatch({ type: 'EXPRVIZ_FIELDS_SET', payload: { taxon, fields } }),

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
