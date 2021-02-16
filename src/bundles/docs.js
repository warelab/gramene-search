const grameneDocs = {
  name: 'grameneDocs',
  getReducer: () => {
    const initialState = {
      genes: {},
      trees: {},
      domains: {},
      pathways: {}
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
          newState.genes = Object.assign({}, state.genes, payload);
          return newState;
        case 'GRAMENE_TREE_REQUESTED':
          if (!state.trees.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState.trees[payload] = {};
            return newState;
          }
          break;
        case 'GRAMENE_TREE_RECEIVED':
          newState = Object.assign({}, state);
          newState.trees = Object.assign({}, state.trees, payload);
          return newState;
        // case 'GRAMENE_PATHWAYS_REQUESTED':
          // newState = Object.assign({}, state);
          // payload.forEach(id => {
          //   if (!state.pathways.hasOwnProperty(id)) {
          //     newState.pathways[id] = {};
          //   }
          // });
          // return newState;
        case 'GRAMENE_PATHWAYS_RECEIVED':
          newState = Object.assign({}, state);
          newState.pathways = Object.assign({}, state.pathways, payload);
          return newState;
      }
      return state;
    }
  },
  doRequestGrameneGene: id => ({dispatch, store}) => {
    const genes = store.selectGrameneGenes();
    if (!genes.hasOwnProperty(id)) {
      // dispatch({type: 'GRAMENE_GENE_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/genes?idList=${id}`)
        .then(res => res.json())
        .then(res => {
          let genes = {};
          res.forEach(g => {
            genes[g._id] = g;
          });
          dispatch({type: 'GRAMENE_GENE_RECEIVED', payload: genes})
        })
    }
  },
  doRequestGrameneTree: id => ({dispatch, store}) => {
    const trees = store.selectGrameneTrees();
    if (!trees.hasOwnProperty(id)) {
      dispatch({type: 'GRAMENE_TREE_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/genetrees?idList=${id}`)
        .then(res => res.json())
        .then(res => {
          let trees = {};
          res.forEach(t => {
            trees[t._id] = t;
          });
          dispatch({type: 'GRAMENE_TREE_RECEIVED', payload: trees})
        })
    }
  },
  doRequestGramenePathways: ids => ({dispatch, store}) => {
    const pathways = store.selectGramenePathways();
    let newIds = ids.filter(id => !pathways.hasOwnProperty(id));
    if (newIds) {
      dispatch({type: 'GRAMENE_PATHWAYS_REQUESTED', payload: newIds});
      fetch(`${store.selectGrameneAPI()}/pathways?idList=${newIds.join(',')}`)
        .then(res => res.json())
        .then(res => {
          let pathways = {};
          res.forEach(p => {
            pathways[p._id] = p;
          });
          dispatch({type: 'GRAMENE_PATHWAYS_RECEIVED', payload: pathways})
        })
    }
  },
  selectGrameneGenes: state => state.grameneDocs.genes,
  selectGrameneTrees: state => state.grameneDocs.trees,
  selectGramenePathways: state => state.grameneDocs.pathways
};

export default grameneDocs;
