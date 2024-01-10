const grameneDocs = {
  name: 'grameneDocs',
  getReducer: () => {
    const initialState = {
      genes: {},
      trees: {},
      domains: {},
      pathways: {},
      expression: {},
      sequences: {},
      rnaSequences: {},
      pepSequences: {},
      studies: {}
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
        case 'ATLAS_STUDIES_RECEIVED':
          newState = Object.assign({}, state);
          newState.studies = Object.assign({}, state.studies, payload);
          return newState;
        case 'ATLAS_SAMPLES_REQUESTED':
          if (!state.studies[payload].hasOwnProperty('samples')) {
            newState = Object.assign({},state);
            newState.studies[payload].samples = [];
            return newState;
          }
          break;
        case 'ATLAS_SAMPLES_RECEIVED':
          newState = Object.assign({}, state);
          newState.studies[payload.id].samples = payload.samples;
          return newState;
        case 'GENE_SEQUENCE_REQUESTED':
          if (!state.sequences.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState.sequences[payload] = {};
            return newState;
          }
          break;
        case 'RNA_SEQUENCE_REQUESTED':
          if (!state.rnaSequences.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState.rnaSequences[payload] = {};
            return newState;
          }
          break;
        case 'PEP_SEQUENCE_REQUESTED':
          if (!state.rnaSequences.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState.pepSequences[payload] = {};
            return newState;
          }
          break;
        case 'GENE_SEQUENCE_RECEIVED':
          newState = Object.assign({}, state);
          newState.sequences = Object.assign({}, state.sequences);
          newState.sequences[payload.id] = payload.geneSeq;
          return newState;
        case 'RNA_SEQUENCE_RECEIVED':
          newState = Object.assign({}, state);
          newState.rnaSequences = Object.assign({}, state.rnaSequences);
          newState.rnaSequences[payload.id] = payload.RnaSeq;
          return newState;
        case 'PEP_SEQUENCE_RECEIVED':
          newState = Object.assign({}, state);
          newState.pepSequences = Object.assign({}, state.pepSequences);
          newState.pepSequences[payload.id] = payload.PepSeq;
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
      if (newIds.length === 1) newIds.push(0);
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
  doRequestExpressionStudies: id => ({dispatch, store}) => {
    fetch(`${store.selectGrameneAPI()}/experiments?rows=-1`)
      .then(res => res.json())
      .then(res => {
        let studies = {};
        res.forEach(s => {
          studies[s._id] = s;
          if (! studies.hasOwnProperty('taxon_id')) {
            studies[s.taxon_id] = []
          }
          studies[s.taxon_id].push(s._id)
        })
        dispatch({type: 'ATLAS_STUDIES_RECEIVED', payload: studies})
      })
  },
  doRequestStudyMetadata: id => ({dispatch, store}) => {
    const studies = store.selectAtlasStudies();
    if (!studies[id].hasOwnProperty('samples')) {
      dispatch({type: 'ATLAS_SAMPLES_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/assays?experiment=${id}&rows=-1`)
        .then(res => res.json())
        .then(samples => {
          dispatch({type: 'ATLAS_SAMPLES_RECEIVED', payload: {id, samples}})
        })
    }
  },
  doRequestGeneSequence: gene => ({dispatch, store}) => {
    const maps = store.selectGrameneMaps();
    const seqs = store.selectGeneSequences();
    const id = gene._id;
    const MAX_FLANK = 2000;
    if (!seqs.hasOwnProperty(id)) {
      dispatch({type: 'GENE_SEQUENCE_REQUESTED', payload: id});
      const start = gene.location.start > MAX_FLANK ? gene.location.start - MAX_FLANK : 1;
      const dnaLength = maps[gene.taxon_id].regionLength[gene.location.region];
      const end = gene.location.end + MAX_FLANK > dnaLength ? dnaLength : gene.location.end + MAX_FLANK;
      fetch(`${store.selectEnsemblAPI()}/sequence/region/${gene.system_name}/${gene.location.region}:${start}..${end}:${gene.location.strand}?content-type=application/json`)
        .then(res => res.json())
        .then(geneSeq => {
          const x = geneSeq.id.split(':');
          geneSeq.genome = x[1];
          geneSeq.start = +x[3];
          geneSeq.end = +x[4];
          dispatch({type: 'GENE_SEQUENCE_RECEIVED', payload: {id, geneSeq}});
        })
    }
  },
  doRequestRnaSequence: id => ({dispatch, store}) => {
    const maps = store.selectGrameneMaps();
    const seqs = store.selectRnaSequences();
    if (!seqs.hasOwnProperty(id)) {
      dispatch({type: 'RNA_SEQUENCE_REQUESTED', payload: id});
      fetch(`${store.selectEnsemblAPI()}/sequence/id/${id}?type=cdna&content-type=application/json`)
        .then(res => res.json())
        .then(RnaSeq => {
          dispatch({type: 'RNA_SEQUENCE_RECEIVED', payload: {id, RnaSeq}});
        })
    }
  },
  doRequestPepSequence: id => ({dispatch, store}) => {
    const maps = store.selectGrameneMaps();
    const seqs = store.selectPepSequences();
    if (!seqs.hasOwnProperty(id)) {
      dispatch({type: 'PEP_SEQUENCE_REQUESTED', payload: id});
      fetch(`${store.selectEnsemblAPI()}/sequence/id/${id}?type=protein&content-type=application/json`)
        .then(res => res.json())
        .then(PepSeq => {
          dispatch({type: 'PEP_SEQUENCE_RECEIVED', payload: {id, PepSeq}});
        })
    }
  },
  doRequestParalogExpression: id => ({dispatch, store}) => {
    const expr = store.selectParalogExpression();
    if (!expr.hasOwnProperty(id)) {
      dispatch({type: 'PARALOG_EXPRESSION_REQUESTED', payload: id});
      fetch(`${store.selectGrameneAPI()}/search?q=homology__within_species_paralog:${id}&fl=id,atlas_id,name,*__expr&rows=100`)
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
            if (d.atlas_id) {
              p.atlas_id = d.atlas_id;
              delete d.atlas_id;
            }
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
  selectParalogExpression: state => state.grameneDocs.expression,
  selectGeneSequences: state => state.grameneDocs.sequences,
  selectRnaSequences: state => state.grameneDocs.rnaSequences,
  selectPepSequences: state => state.grameneDocs.pepSequences,
  selectAtlasStudies: state => state.grameneDocs.studies
};

export default grameneDocs;
