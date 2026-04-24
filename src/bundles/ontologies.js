const ONT_KEYS = ['GO', 'PO', 'TO', 'domains'];
const BATCH_SIZE = 200;

const inflight = {};

const ontologies = {
  name: 'ontologies',
  getReducer: () => {
    const initialState = { GO: {}, PO: {}, TO: {}, domains: {} };
    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'ONTOLOGY_RECORDS_REQUESTED': {
          const { key, ids } = payload;
          const bucket = { ...state[key] };
          for (const id of ids) {
            if (!bucket.hasOwnProperty(id)) bucket[id] = null;
          }
          return { ...state, [key]: bucket };
        }
        case 'ONTOLOGY_RECORDS_RECEIVED': {
          const { key, records } = payload;
          return { ...state, [key]: { ...state[key], ...records } };
        }
        default:
          return state;
      }
    };
  },

  doEnsureOntologyRecords: (key, ids) => ({ dispatch, store }) => {
    if (!ONT_KEYS.includes(key)) return Promise.resolve();
    if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve();
    const existing = store.selectOntologies()[key] || {};
    const missing = [];
    for (const id of ids) {
      if (id == null) continue;
      const idNum = +id;
      if (!existing.hasOwnProperty(idNum) && !(inflight[key] && inflight[key].has(idNum))) {
        missing.push(idNum);
      }
    }
    if (missing.length === 0) return Promise.resolve();

    if (!inflight[key]) inflight[key] = new Set();
    for (const id of missing) inflight[key].add(id);
    dispatch({ type: 'ONTOLOGY_RECORDS_REQUESTED', payload: { key, ids: missing } });

    const api = store.selectGrameneAPI();
    const batches = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      batches.push(missing.slice(i, i + BATCH_SIZE));
    }

    const fetchBatch = (batch) => {
      const idList = batch.length === 1 ? `${batch[0]},0` : batch.join(',');
      return fetch(`${api}/${key}?idList=${idList}&rows=${batch.length + 1}`)
        .then(r => r.json())
        .then(docs => {
          const records = {};
          for (const d of (docs || [])) {
            if (d && d._id != null) records[d._id] = d;
          }
          for (const id of batch) {
            if (!records.hasOwnProperty(id)) records[id] = { _id: id, missing: true };
          }
          dispatch({ type: 'ONTOLOGY_RECORDS_RECEIVED', payload: { key, records } });
        })
        .catch(() => {
          const records = {};
          for (const id of batch) records[id] = { _id: id, missing: true };
          dispatch({ type: 'ONTOLOGY_RECORDS_RECEIVED', payload: { key, records } });
        })
        .finally(() => {
          for (const id of batch) inflight[key].delete(id);
        });
    };

    return Promise.all(batches.map(fetchBatch));
  },

  selectOntologies: state => state.ontologies
};

export default ontologies;
