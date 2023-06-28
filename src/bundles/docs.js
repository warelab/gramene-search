const grameneDocs = {
  name: 'grameneDocs',
  getReducer: () => {
    const initialState = {
      genes: {},
      trees: {},
      domains: {},
      pathways: {},
      expression: {}
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
        case 'PARALOG_EXPRESSION_REQUESTED':
          if (!state.expression.hasOwnProperty(payload)) {
            newState = Object.assign({},state);
            newState.expression[payload] = [];
            return newState;
          }
          break;
        case 'PARALOG_EXPRESSION_RECEIVED':
          newState = Object.assign({}, state);
          newState.expression = Object.assign({}, state.expression);
          newState.expression[payload.id] = payload.paralogs;
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
    const maps = store.selectGrameneMaps();
    if (!trees.hasOwnProperty(id)) {
      dispatch({type: 'GRAMENE_TREE_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/genetrees?idList=${id}`)
        .then(res => res.json())
        .then(res => {
          let trees = {};
          res.forEach(t => {
            function update_taxon_name(node) {
              if (maps.hasOwnProperty(node.taxon_id)) {
                node.taxon_name = maps[node.taxon_id].display_name
              }
              else if (node.taxon_id === 1100004558) {
                node.taxon_name = "Sorghum bicolor"
              }
              if (node.taxon_id === 45770001 && node.hasOwnProperty('children')) {
                node.taxon_name = "Zea mays"
              }
              if (node.taxon_id === 297600009 && node.hasOwnProperty('children')) {
                node.taxon_name = "Vitis vinifera"
              }
              if (node.hasOwnProperty('children')) {
                node.children.forEach(c => update_taxon_name(c))
              }
            }
            update_taxon_name(t);
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
  doRequestParalogExpression: id => ({dispatch, store}) => {
    const expr = store.selectParalogExpression();
    if (!expr.hasOwnProperty(id)) {
      dispatch({type: 'PARALOG_EXPRESSION_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/search?q=homology__within_species_paralog:${id}&fl=id,name,*__expr&rows=100`)
        .then(res => res.json())
        .then(res => {
          const assay_re = /(.+)_g(\d+)/;
          const paralogs = res.response.docs.map(d => {
            let p = {
              id: d.id,
              name: d.name,
              experiments: {},
              min:1000,
              max:0
            };
            delete d.id;
            delete d.name;
            Object.entries(d).forEach(assay => {
              const parsed = assay[0].match(assay_re);
              const expr = parsed[1].replace('_','-').replace('-tpms','');
              if (! p.experiments.hasOwnProperty(expr)) {
                p.experiments[expr] = [];
              }
              const g = parsed[2] - 1;
              const e = d[assay[0]];
              if (e < p.min) p.min = e;
              if (e > p.max) p.max = e;
              p.experiments[expr][g] = e;
            });
            return p;
          }).map(p => {
            for (const expr in p.experiments) {
              p.experiments[expr] = p.experiments[expr].filter(e => e >= 0);
            }
            return p;
          });
          dispatch({type: 'PARALOG_EXPRESSION_RECEIVED', payload: {id, paralogs}});
        })
    }
  },
  selectGrameneGenes: state => state.grameneDocs.genes,
  selectGrameneTrees: state => state.grameneDocs.trees,
  selectGramenePathways: state => state.grameneDocs.pathways,
  selectParalogExpression: state => state.grameneDocs.expression
};

export default grameneDocs;
