import { createSelector } from 'redux-bundler';

// Backing store for the sidebar "Refine" section: facet counts over the current
// search result set for a small, configurable set of categorical fields. Each
// group is one Solr field; clicking a value's count adds an AND filter for that
// field:value (see FacetCounts.js -> doAcceptGrameneSuggestion).
//
// Cost control: a single rows=0 faceted request per (query, genome-subset)
// signature, and only while the section is open — a collapsed Refine section
// never hits the network. The request-id guard mirrors bundles/attrTable.js so
// a superseded fetch can't write stale counts.

// Ordered groups. `heading` is the human label (also the filter category shown
// in the Filters panel). `hide` (optional) lists raw facet values to drop from
// the group — present on ~everything or not useful to filter on. Add/remove
// fields or hidden values here to change what Refine offers.
export const FACET_GROUPS = [
  {
    field: 'capabilities',
    heading: 'Available data',
    hide: ['expression_attributes', 'location', 'taxonomy', 'xrefs', 'familyRoot', 'MAKER', 'Grassius'],
    // Per-value display overrides (raw value -> label). Anything not listed falls
    // back to underscores->spaces. The raw value is still what gets filtered on.
    labels: {
      expression: 'Expression',
      homology: 'Homology',
      domains: 'Domains',
      grassius_homolog: 'Grassius',
      GO: 'Gene Ontology',
      PO: 'Plant Ontology',
      TO: 'Trait Ontology',
      QTL_TO: 'QTL',
      VEP: 'Loss-of-function variants',
      pubs: 'Curated in literature',
    },
  },
  { field: 'expr_class__attr_ss', heading: 'Expression class' },
  { field: 'grassius_homolog__attr_ss', heading: 'TF family (GRASSIUS)' },
];

const FACET_FIELDS = FACET_GROUPS.map((g) => g.field);
// field -> Set of raw values to omit from the rendered group.
const HIDE_BY_FIELD = {};
FACET_GROUPS.forEach((g) => {
  if (g.hide && g.hide.length) HIDE_BY_FIELD[g.field] = new Set(g.hide);
});
// The output key of a Solr facet defaults to the field name, so no {!key=...}
// local params are needed — just one facet.field per field.
const FACET_PARAMS = FACET_FIELDS.map((f) => `facet.field=${f}`).join('&');

let fetchPendingId = 0;

// Same rule the main search uses: only constrain by taxon_id when the user has
// actually subset the visible genomes (see bundles/api.js). Keeps counts in step
// with the visible result set without bloating the URL.
function genomeSubset(g, m) {
  const maps = m || {};
  const visibleTaxa = Object.keys(maps).filter((tid) => !maps[tid].hidden);
  const activeVisible = Object.keys((g && g.active) || {}).filter((tid) => maps[tid] && !maps[tid].hidden);
  const subset = activeVisible.length > 0 && activeVisible.length < visibleTaxa.length;
  const sorted = activeVisible.slice().sort();
  return {
    fq: subset ? `&fq=taxon_id:(${sorted.join(' OR ')})` : '',
    key: subset ? sorted.join(',') : '',
  };
}

function computeSignature(q, g, m) {
  return `${q}|${genomeSubset(g, m).key}`;
}

const facetCounts = {
  name: 'facetCounts',

  getReducer: () => {
    const initialState = {
      status: 'idle', // idle | loading | ready | error
      signature: null,
      groups: {}, // field -> [{ value, count }]
      error: null,
      requestId: 0,
      open: false, // collapsed by default
    };

    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'FACETCOUNTS_TOGGLE_OPEN':
          return { ...state, open: typeof payload === 'boolean' ? payload : !state.open };

        case 'FACETCOUNTS_FETCH_STARTED':
          // Keep the previous groups visible during a refetch (smooth update);
          // they're replaced when the new counts land.
          return {
            ...state,
            status: 'loading',
            error: null,
            signature: payload.signature,
            requestId: payload.requestId,
          };

        case 'FACETCOUNTS_FETCH_DONE':
          if (payload.requestId !== state.requestId) return state; // superseded
          return { ...state, status: 'ready', groups: payload.groups };

        case 'FACETCOUNTS_FETCH_FAILED':
          if (payload.requestId !== state.requestId) return state;
          return { ...state, status: 'error', error: payload.error };

        default:
          return state;
      }
    };
  },

  doToggleFacetCounts: (open) => ({ dispatch }) =>
    dispatch({ type: 'FACETCOUNTS_TOGGLE_OPEN', payload: open }),

  doFetchFacetCounts: () => ({ dispatch, store }) => {
    const q = store.selectGrameneFiltersQueryString();
    const { fq } = genomeSubset(store.selectGrameneGenomes(), store.selectGrameneMaps());
    const signature = computeSignature(q, store.selectGrameneGenomes(), store.selectGrameneMaps());
    const requestId = ++fetchPendingId;
    dispatch({ type: 'FACETCOUNTS_FETCH_STARTED', payload: { requestId, signature } });

    const api = store.selectGrameneAPI();
    const url = `${api}/search?q=${q}${fq}&rows=0&facet=true&facet.mincount=1&facet.limit=-1&${FACET_PARAMS}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (requestId !== fetchPendingId) return;
        const ff = (json.facet_counts && json.facet_counts.facet_fields) || {};
        const groups = {};
        FACET_FIELDS.forEach((f) => {
          const arr = ff[f] || [];
          const hidden = HIDE_BY_FIELD[f];
          const vals = [];
          for (let i = 0; i < arr.length; i += 2) {
            if (hidden && hidden.has(arr[i])) continue;
            vals.push({ value: arr[i], count: arr[i + 1] });
          }
          groups[f] = vals;
        });
        dispatch({ type: 'FACETCOUNTS_FETCH_DONE', payload: { requestId, groups } });
      })
      .catch((err) => {
        dispatch({ type: 'FACETCOUNTS_FETCH_FAILED', payload: { requestId, error: String(err) } });
      });
  },

  selectFacetCounts: (state) => state.facetCounts,
  selectFacetCountsOpen: (state) => state.facetCounts.open,
  selectFacetCountsGroups: (state) => state.facetCounts.groups,

  // Fetch only while the section is open, once per unique (query, genomes).
  reactFacetCountsFetch: createSelector(
    'selectFacetCounts',
    'selectGrameneFiltersStatus',
    'selectGrameneFiltersQueryString',
    'selectGrameneGenomes',
    'selectGrameneMaps',
    (fc, filtersStatus, q, g, m) => {
      if (!fc || !fc.open) return;
      if (filtersStatus === 'init') return;
      if (fc.status === 'loading') return;
      const sig = computeSignature(q, g, m);
      if (fc.signature === sig && (fc.status === 'ready' || fc.status === 'error')) return;
      return { actionCreator: 'doFetchFacetCounts' };
    }
  ),
};

export default facetCounts;
