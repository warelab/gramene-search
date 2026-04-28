import { getConfiguredCache } from 'money-clip';

const ONT_KEYS = ['GO', 'PO', 'TO', 'domains'];

// Dedicated IndexedDB store for ontology records. The full term set per
// ontology is stable enough to keep around indefinitely (default maxAge of
// `Infinity`), and we don't want it to share the short TTL of the app-wide
// cache configured in demo.js.
const cache = getConfiguredCache({
  version: 1,
  name: 'gramene_ontologies'
});

const inflight = {};

const ontologies = {
  name: 'ontologies',

  getReducer: () => {
    const initialState = { GO: {}, PO: {}, TO: {}, domains: {}, loaded: {} };
    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'ONTOLOGY_BULK_LOADED':
          return {
            ...state,
            [payload.key]: payload.records,
            loaded: { ...state.loaded, [payload.key]: true }
          };
        default:
          return state;
      }
    };
  },

  // Signature kept for backward compatibility — the `ids` argument is
  // ignored. On first call per ontology key we load the full term set
  // (cache hit if available, otherwise `${api}/${key}?rows=-1`) and
  // dispatch a single bulk load. Subsequent calls are no-ops.
  doEnsureOntologyRecords: (key, _ids) => ({ dispatch, store }) => {
    if (!ONT_KEYS.includes(key)) return Promise.resolve();
    const state = store.selectOntologies();
    if (state.loaded && state.loaded[key]) return Promise.resolve();
    if (inflight[key]) return inflight[key];

    inflight[key] = cache.get(key)
      .then(cached => {
        if (cached) {
          dispatch({ type: 'ONTOLOGY_BULK_LOADED', payload: { key, records: cached } });
          return;
        }
        const api = store.selectGrameneAPI();
        return fetch(`${api}/${key}?rows=-1`)
          .then(r => r.json())
          .then(docs => {
            const records = {};
            for (const d of (docs || [])) {
              if (d && d._id != null) records[d._id] = d;
            }
            dispatch({ type: 'ONTOLOGY_BULK_LOADED', payload: { key, records } });
            cache.set(key, records).catch(e => console.warn('Failed to cache ontology', key, e));
          });
      })
      .catch(err => {
        console.error(`Failed to load ontology ${key}`, err);
      })
      .finally(() => {
        delete inflight[key];
      });

    return inflight[key];
  },

  selectOntologies: state => state.ontologies
};

export default ontologies;
