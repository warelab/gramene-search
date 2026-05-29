// Serializer/deserializer for shareable gene-search views.
//
// `selectViewSnapshot` produces a versioned JSON-safe blob from the current
// store state. `doApplyViewSnapshot` validates a blob and restores it via
// existing action creators. Persistence + UI live in later phases — this
// bundle is the pure state-shape layer they build on.
//
// Snapshot schema, v1:
// {
//   v: 1,
//   capturedAt: <ISO 8601 string>,
//   site: <subsite id>,
//   filters: <grameneFilters tree, stripped of ephemeral UI flags>,
//   views: { on: [id,...], touched: {id: true, ...} },
//   genomeSubset: { taxonId: true, ... } | null,
//   searchPage: { offset: number, rows: number } | null,
//   expandedDetails: [
//     { geneId,
//       expandedDetail: string|null,
//       fullscreen: boolean,
//       homology: { viewer, height, tbrowse: <ViewState> } | undefined
//     }, ...
//   ]
// }
//
// Anything not in this schema is intentionally NOT persisted — async fetch
// caches, search-results, pagination cursors mid-flight, etc. all rehydrate
// from the API once the snapshot is applied.

const SCHEMA_VERSION = 1;

// Keys on a filter node we want to keep. Everything else (showMenu, marked,
// status flags from the root, etc.) is ephemeral UI and not meaningful in a
// shared view.
const FILTER_NODE_KEEP = [
  'leftIdx', 'rightIdx', 'operation', 'negate',
  'fq_field', 'fq_value', 'name', 'category',
  'warning'
];
const FILTER_ROOT_KEEP = [
  'operation', 'negate', 'leftIdx', 'rightIdx',
  'children', 'searchOffset', 'rows'
];

const cleanFilterNode = (node) => {
  const out = {};
  for (const k of FILTER_NODE_KEEP) {
    if (node[k] !== undefined) out[k] = node[k];
  }
  if (Array.isArray(node.children)) {
    out.children = node.children.map(cleanFilterNode);
  }
  return out;
};

const cleanFilters = (filters) => {
  const out = {};
  for (const k of FILTER_ROOT_KEEP) {
    if (filters[k] !== undefined) out[k] = filters[k];
  }
  if (Array.isArray(filters.children)) {
    out.children = filters.children.map(cleanFilterNode);
  }
  return out;
};

// Drop bundle entries that hold no meaningful state (e.g. a row the user
// scrolled past but never opened). Otherwise snapshots bloat with empties.
const isMeaningfulGene = (entry) => {
  if (!entry) return false;
  if (entry.expandedDetail) return true;
  if (entry.fullscreen) return true;
  if (entry.homology && (
    entry.homology.viewer !== undefined ||
    entry.homology.height !== undefined ||
    entry.homology.tbrowse !== undefined
  )) return true;
  return false;
};

const viewSnapshot = {
  name: 'viewSnapshot',
  // No reducer — this bundle is pure derivation + dispatch orchestration.
  getReducer: () => (state = {}) => state,

  selectViewSnapshot: createSnapshotSelector(),

  // Apply a snapshot to the store. Returns an array of unresolved-id warnings
  // so the caller can surface a non-blocking notice. The action creators we
  // delegate to are existing ones; nothing here knows about API/UI/share-link
  // — that's later phases.
  doApplyViewSnapshot: (snapshot) => ({dispatch, store}) => {
    const warnings = validateSnapshot(snapshot);
    if (warnings.fatal) {
      console.warn('viewSnapshot: refusing to apply', warnings.fatal);
      return { applied: false, warnings };
    }

    // 1. Filters (also clears search; replays a fresh fetch).
    if (snapshot.filters) {
      dispatch({
        type: 'BATCH_ACTIONS', actions: [
          {type: 'GRAMENE_SEARCH_CLEARED'},
          {type: 'GRAMENE_FILTERS_REPLACED', payload: cloneForDispatch(snapshot.filters)}
        ]
      });
    }

    // 2. Views.
    if (snapshot.views) {
      dispatch({
        type: 'GRAMENE_VIEWS_REPLACED',
        payload: {
          on: snapshot.views.on || [],
          touched: snapshot.views.touched || {}
        }
      });
    }

    // 3. Genome subset, if present.
    if (snapshot.genomeSubset && Object.keys(snapshot.genomeSubset).length) {
      dispatch({type: 'GRAMENE_GENOMES_UPDATED', payload: {...snapshot.genomeSubset}});
    }

    // 4. Per-gene UI state (expandedDetail, fullscreen, homology viewer/
    //    height, tbrowse view state). Replace wholesale via the uiViewState
    //    bundle's bulk action.
    const byGene = {};
    if (Array.isArray(snapshot.expandedDetails)) {
      for (const e of snapshot.expandedDetails) {
        if (!e || !e.geneId) continue;
        byGene[e.geneId] = {
          expandedDetail: e.expandedDetail || null,
          fullscreen: !!e.fullscreen,
          homology: e.homology ? {...e.homology} : {}
        };
      }
    }
    dispatch({type: 'UI_VIEW_STATE_REPLACED', payload: {byGene}});

    return { applied: true, warnings };
  },

  // Helper exposed for the bootstrap path that wants to read warnings without
  // dispatching. Returns { fatal: <string|null>, unresolved: { ids/taxa/views/genes lists } }.
  doValidateViewSnapshot: (snapshot) => () => validateSnapshot(snapshot)
};

function createSnapshotSelector() {
  // We deliberately don't memoize with createSelector — snapshots are taken
  // on demand (Save button click, link generation) rather than on every
  // store tick, so a fresh build is fine and avoids stale-dep bugs.
  return (state) => buildSnapshot(state);
}

function buildSnapshot(state) {
  const snap = {
    v: SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    site: (state.config && state.config.id) || null,
  };

  if (state.grameneFilters) {
    snap.filters = cleanFilters(state.grameneFilters);
    snap.searchPage = {
      offset: state.grameneFilters.searchOffset || 0,
      rows: state.grameneFilters.rows || 20
    };
  }

  if (state.grameneViews && Array.isArray(state.grameneViews.options)) {
    snap.views = {
      on: state.grameneViews.options
        .filter(v => v && v.show === 'on')
        .map(v => v.id),
      touched: {...(state.grameneViews.touched || {})}
    };
  }

  if (state.grameneGenomes && state.grameneGenomes.active) {
    const keys = Object.keys(state.grameneGenomes.active);
    if (keys.length) {
      snap.genomeSubset = {};
      for (const k of keys) snap.genomeSubset[k] = true;
    } else {
      snap.genomeSubset = null;
    }
  }

  if (state.uiViewState && state.uiViewState.byGene) {
    snap.expandedDetails = Object.entries(state.uiViewState.byGene)
      .filter(([, e]) => isMeaningfulGene(e))
      .map(([geneId, e]) => ({
        geneId,
        expandedDetail: e.expandedDetail || null,
        fullscreen: !!e.fullscreen,
        homology: e.homology && Object.keys(e.homology).length ? {...e.homology} : undefined
      }));
  } else {
    snap.expandedDetails = [];
  }

  return snap;
}

function validateSnapshot(snapshot) {
  const warnings = { fatal: null, unresolved: { views: [], genes: [], taxa: [] } };
  if (!snapshot || typeof snapshot !== 'object') {
    warnings.fatal = 'snapshot is not an object';
    return warnings;
  }
  if (snapshot.v !== SCHEMA_VERSION) {
    warnings.fatal = `unsupported snapshot version ${snapshot.v} (expected ${SCHEMA_VERSION})`;
    return warnings;
  }
  // Strict-id checks happen later — they need the store's grameneMaps,
  // grameneTaxonomy, etc. which are async-loaded. The boot path will call
  // doValidateViewSnapshot again after those land. For now we just
  // structurally validate.
  return warnings;
}

// JSON.parse(JSON.stringify(x)) — bundles see a wholly fresh object so
// reducers can't accidentally mutate the snapshot we're holding for retry.
function cloneForDispatch(x) {
  return JSON.parse(JSON.stringify(x));
}

export default viewSnapshot;
