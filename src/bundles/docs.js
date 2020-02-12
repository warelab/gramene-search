const grameneDocs = {
  name: 'grameneDocs',
  getReducer: () => {
    const initialState = {
      genes: {},
      domains: {}
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_GENE_REQUESTED':
          if (!state.genes.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState.genes[payload] = {};
            return newState;
          }
          break;
        case 'GRAMENE_GENE_RECEIVED':
          newState = Object.assign({}, state);
          newState.genes[payload._id] = payload;
          return newState;
      }
      return state;
    }
  },
  doRequestGrameneGene: id => ({dispatch, store}) => {
    const genes = store.selectGrameneGenes();
    if (!genes.hasOwnProperty(id)) {
      dispatch({type: 'GRAMENE_GENE_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/genes?idList=${id}`)
        .then(res => res.json())
        .then(res => {
          dispatch({type: 'GRAMENE_GENE_RECEIVED', payload: res[0]})
        })
    }
  },
  selectGrameneGenes: state => state.grameneDocs.genes
};

export default grameneDocs;