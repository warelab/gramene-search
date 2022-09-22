import { createAsyncResourceBundle, createSelector } from 'redux-bundler'
import _ from 'lodash'
import binsClient from "gramene-bins-client";
import treesClient from "gramene-trees-client";
import {build} from "gramene-taxonomy-with-genomes";

const facets = [
  "{!facet.limit='200' facet.mincount='1' key='taxon_id'}taxon_id",
  "{!facet.limit='100' facet.mincount='1' key='genetree'}gene_tree",
  "{!facet.limit='100' facet.mincount='1' key='pathways'}pathways__ancestors",
  "{!facet.limit='100' facet.mincount='1' key='domains'}domain_roots",
  "{!facet.limit='-1' facet.mincount='1' key='fixed_1000__bin'}fixed_1000__bin"
];
const genomesOfInterest = '(taxon_id:2769) OR (taxon_id:3055) OR (taxon_id:3218) OR (taxon_id:3702) OR (taxon_id:3847) OR (taxon_id:4555) OR (taxon_id:4558) OR (taxon_id:4577) OR (taxon_id:13333) OR (taxon_id:15368) OR (taxon_id:29760) OR (taxon_id:39947) OR (taxon_id:55577) OR (taxon_id:88036) OR (taxon_id:214687)';

const grameneSuggestions = createAsyncResourceBundle( {
  name: 'grameneSuggestions',
  actionBaseType: 'GRAMENE_SUGGESTIONS',
  persist: false,
  getPromise: ({store}) => {
    const t = store.selectSuggestionsQuery().replaceAll(':',' ').trim();
    const g = store.selectGrameneGenomes();
    return fetch(`${store.selectGrameneAPI()}/suggest?q={!boost b=relevance}name:${t}^3 id:${t}^5 synonym:${t}^2 text:${t}*^1`)
      .then(res => res.json())
      .then(suggestions => {
        if (Object.keys(g.active).length > 0) {
          suggestions.grouped.category.groups.forEach(group => {
            group.doclist.docs.forEach(sugg => {
              sugg.num_genes = 0;
              sugg.taxon_id.forEach((id,idx) => {
                if (g.active[id]) {
                  sugg.num_genes += sugg.taxon_freq[idx]
                }
              })
            })
          })
        }
        return suggestions
      })
  }
});

grameneSuggestions.reactGrameneSuggestions = createSelector(
  'selectGrameneSuggestionsShouldUpdate',
  'selectSuggestionsQuery',
  (shouldUpdate, queryString) => {
    if (shouldUpdate && queryString) {
      return { actionCreator: 'doFetchGrameneSuggestions' }
    }
  }
);

grameneSuggestions.selectGrameneSuggestionsStatus = createSelector(
  'selectGrameneSuggestionsShouldUpdate',
  'selectGrameneSuggestionsIsLoading',
  'selectGrameneSuggestionsRaw',
  'selectSuggestionsQuery',
  (shouldUpdate, isLoading, suggestionsRaw, queryString) => {
    if (!queryString) return '';
    if (shouldUpdate) return 'update needed';
    if (isLoading) return 'loading';
    if (suggestionsRaw) return suggestionsRaw.data.grouped.category.matches + ' terms';
    return 'error';
  }
);

grameneSuggestions.selectGrameneSuggestionsReady = createSelector(
  'selectGrameneSuggestionsStatus',
  (status) => {
    const regex = RegExp('terms$');
    return regex.test(status);
  }
);

grameneSuggestions.doFocusFirstGrameneSuggestion = arg => ({dispatch, getState}) => {
  console.log('inside doFocusFirstGrameneSuggestion');
};

const grameneTaxonomy = createAsyncResourceBundle({
  name: 'grameneTaxonomy',
  actionBaseType: 'GRAMENE_TAXONOMY',
  persist: true,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/taxonomy?subset=gramene&rows=-1`)
      .then(res => res.json())
      .then(taxNodes => {
        let taxonomy = _.keyBy(taxNodes, '_id');
        taxNodes.forEach(t => {
          t._id = +t._id; // ensure taxonomy id is a number
          if (t.hasOwnProperty("is_a")) {
            t.is_a.forEach(p_id => {
              const p = taxonomy[p_id];
              if (!p.hasOwnProperty('children')) p.children = [];
              p.children.push(t._id)
            })
          }
        });
        return taxonomy
      })
  }
});
grameneTaxonomy.reactGrameneTaxonomy = createSelector(
  'selectGrameneTaxonomyShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchGrameneTaxonomy' }
    }
  }
);
const grameneMaps = createAsyncResourceBundle({
  name: 'grameneMaps',
  actionBaseType: 'GRAMENE_MAPS',
  persist: true,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/maps?rows=-1`)
      .then(res => res.json())
      .then(maps => _.keyBy(maps, 'taxon_id'))
  }
});
grameneMaps.reactGrameneMaps = createSelector(
  'selectGrameneMapsShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchGrameneMaps' }
    }
  }
);

const curatedGenes = createAsyncResourceBundle( {
  name: 'curatedGenes',
  actionBaseType: 'CURATED_GENES',
  persist: true,
  getPromise: ({store}) => {
    return fetch(`https://devdata.gramene.org/curation/curations?rows=0&minFlagged=2`)
      .then(res => res.json())
      .then(curation => _.keyBy(curation.genes, 'gene_id'))
  }
});
curatedGenes.reactCuratedGenes = createSelector(
  'selectCuratedGenesShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchCuratedGenes' }
    }
  }
);

const grameneExpressionStudies = createAsyncResourceBundle( {
  name: 'grameneExpressionStudies',
  actionBaseType: 'GRAMENE_EXPRESSION_STUDIES',
  persist: true,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/experiments?rows=-1`)
      .then(res => res.json())
      .then(res => _.keyBy(res, '_id'))
  }
});
grameneExpressionStudies.reactGrameneExpressionStudies = createSelector(
  'selectGrameneExpressionStudiesShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchGrameneExpressionStudies' }
    }
  }
);

const grameneExpressionAssays = createAsyncResourceBundle( {
  name: 'grameneExpressionAssays',
  actionBaseType: 'GRAMENE_EXPRESSION_ASSAYS',
  persist: true,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/assays?rows=-1`)
      .then(res => res.json())
      .then(res => {
        let expr={};
        res.forEach(assay => {
          if (!expr.hasOwnProperty(assay.taxon_id)) {
            expr[assay.taxon_id] = {};
          }
          if (!expr[assay.taxon_id].hasOwnProperty(assay.experiment)) {
            expr[assay.taxon_id][assay.experiment] = [];
          }
          assay.order = +assay.group.replace('g','');
          expr[assay.taxon_id][assay.experiment].push(assay);
        });
        // sort each experiment
        for (const tid in expr) {
          for (const exp in expr[tid]) {
            expr[tid][exp].sort((a,b) => a.order - b.order);
          }
        }
        return expr;
      })
  }
});
grameneExpressionAssays.reactGrameneExpressionAssays = createSelector(
  'selectGrameneExpressionAssaysShouldUpdate',
  (shouldUpdate) => {
    if (shouldUpdate) {
      return { actionCreator: 'doFetchGrameneExpressionAssays' }
    }
  }
);

const grameneSearch = createAsyncResourceBundle({
  name: 'grameneSearch',
  actionBaseType: 'GRAMENE_SEARCH',
  persist: false,
  getPromise: ({store}) => {
    const offset = store.selectGrameneSearchOffset();
    const rows = store.selectGrameneSearchRows();
    const g = store.selectGrameneGenomes();
    const taxa = Object.keys(g.active);
    let fq='';
    if (taxa.length) {
      console.log('search add a fq for ',taxa);
      fq = `&fq=taxon_id:(${taxa.join(' OR ')})`;
    }
    return fetch(`${store.selectGrameneAPI()}/search?q=${store.selectGrameneFiltersQueryString()}&facet.field=${facets}&rows=${rows}&start=${offset}${fq}`)
      .then(res => res.json())
      .then(res => {
        res.response.docs.forEach(d => {
          d.can_show = {};
          d.capabilities.forEach(c => {
            d.can_show[c]=true;
          })
        });
        return res;
      })
  }
});
grameneSearch.reactGrameneSearch = createSelector(
  'selectGrameneSearchShouldUpdate',
  'selectGrameneFiltersStatus',
  (shouldUpdate, status) => {
    if (shouldUpdate && status === 'search') {
      return { actionCreator: 'doFetchGrameneSearch' }
    }
  }
);

function formatFacetCountsForViz(a) {
  let res = {
    count: a.length/2,
    displayName: "fixed_1000__bin",
    data: {},
    sorted: []
  };
  let counts = [];
  for(let i=0;i<a.length;i+=2) {
    const fc = {
      id: +a[i],
      count: +a[i+1]
    };
    res.data[a[i]] = fc;
    counts.push(fc);
  }
  res.sorted = counts.sort((a,b) => a.id - b.id);
  return res;
}

// bundle to prepare data for the TaxDist component
const grameneTaxDist = {
  name: 'grameneTaxDist',
  getReducer: () => {
    const initialState = {};
    return (state = initialState, {type, payload}) => {
      return state;
    }
  },
  selectGrameneTaxDist: createSelector(
    'selectGrameneSearch',
    'selectGrameneTaxonomy',
    'selectGrameneMaps',
    (grameneSearch,grameneTaxonomy,grameneMaps) => {
      if (grameneSearch && grameneTaxonomy && grameneMaps) {
        _.forIn(grameneMaps, (map, tid) => {
          grameneTaxonomy[tid].name = map.display_name;
        });
        const binnedResults = formatFacetCountsForViz(grameneSearch.facet_counts.facet_fields.fixed_1000__bin);
        let speciesTree = treesClient.taxonomy.tree(Object.values(grameneTaxonomy));
        let binMapper = binsClient.bins(grameneMaps);
        let taxDist = build(binMapper, speciesTree);
        taxDist.setBinType('fixed',1000);
        taxDist.setResults(binnedResults);
        return taxDist;
      }
      return null;
    }
  )
};

// this query will give the sorghum orthologs of AT1G01260
// want to provide these on non-sorghum genes if available
// http://data.gramene.org/search?q=homology__all_orthologs:AT1G01260&fq=taxon_id:4558&fl=id
const grameneOrthologs = {
  name: 'grameneOrthologs',
  getReducer: () => {
    const initialState = {};
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_ORTHOLOGS_REQUESTED':
          if (!state.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState[payload] = [];
            return newState;
          }
          break;
        case 'GRAMENE_ORTHOLOGS_RECEIVED':
          return Object.assign({}, state, payload);
      }
      return state;
    }
  },
  doRequestOrthologs: geneId => ({dispatch, store}) => {
    const orthologs = store.selectGrameneOrthologs();
    if (!orthologs.hasOwnProperty(geneId)) {
      dispatch({type: 'GRAMENE_ORTHOLOGS_REQUESTED', payload: geneId});
      const API = store.selectGrameneAPI();
      const taxonId = store.selectTargetTaxonId();
      fetch(`${API}/search?q=homology__all_orthologs:${geneId}&fq=taxon_id:${taxonId}&fl=id`)
        .then(res => res.json())
        .then(res => {
          let newOrthologs = {};
          newOrthologs[geneId] = res.response.docs.map(d => d.id);
          dispatch({type: 'GRAMENE_ORTHOLOGS_RECEIVED', payload: newOrthologs})
        })
    }
  },
  selectGrameneOrthologs: state => state.grameneOrthologs
};


// function selectFacetIDs(store, field) {
//   const path = `grameneGenes.data.facet_counts.facet_fields.${field}`;
//   if (_.has(store,path)) {
//     const flat_facets = _.get(store,path);
//     let idList = [];
//     if (isNaN(+flat_facets[0])) {
//       for (let i = 0; i < flat_facets.length; i += 2) {
//         idList.push(flat_facets[i])
//       }
//     }
//     else {
//       for (let i = 0; i < flat_facets.length; i += 2) {
//         idList.push(+flat_facets[i])
//       }
//       if (idList.length === 1) idList.push(0);
//     }
//     return idList;
//   }
// }
//
// grameneGenes.selectDomainFacets = store => selectFacetIDs(store, 'domains');
// grameneGenes.selectPathwayFacets = store => selectFacetIDs(store, 'pathways');
// grameneGenes.selectTaxonomyFacets = store => selectFacetIDs(store, 'taxon_id');
//
// const grameneDomains = createAsyncResourceBundle({
//   name: 'grameneDomains',
//   actionBaseType: 'GRAMENE_DOMAINS',
//   persist: false,
//   getPromise: ({store}) =>
//     fetch(`${store.selectGrameneAPI()}/domains?rows=-1&idList=${store.selectDomainFacets().join(',')}`)
//       .then(res => res.json())
//       .then(docs => {return {domains: docs, numFound: docs.length}})
// });
//
// const gramenePathways = createAsyncResourceBundle({
//   name: 'gramenePathways',
//   actionBaseType: 'GRAMENE_PATHWAYS',
//   persist: false,
//   getPromise: ({store}) =>
//     fetch(`${store.selectGrameneAPI()}/pathways?rows=-1&idList=${store.selectPathwayFacets().join(',')}`)
//       .then(res => res.json())
//       .then(docs => {return {pathways: docs, numFound: docs.length}})
// });
//
// const grameneTaxonomy = createAsyncResourceBundle({
//   name: 'grameneTaxonomy',
//   actionBaseType: 'GRAMENE_TAXONOMY',
//   persist: false,
//   getPromise: ({store}) =>
//     fetch(`${store.selectGrameneAPI()}/taxonomy?rows=-1&idList=${store.selectTaxonomyFacets().join(',')}`)
//       .then(res => res.json())
//       .then(docs => {return {taxonomy: docs, numFound: docs.length}})
// });


export default [grameneSuggestions, grameneSearch, grameneMaps, grameneTaxonomy, grameneTaxDist, grameneOrthologs, curatedGenes];//, grameneExpressionStudies, grameneExpressionAssays];
