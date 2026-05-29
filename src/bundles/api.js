import { createAsyncResourceBundle, createSelector } from 'redux-bundler'
import _ from 'lodash'
// Import the leaf modules directly (not the package index) so we don't
// trigger gramene-bins-client/index.js and gramene-trees-client/index.js,
// each of which eagerly require()s ./src/promise -> gramene-search-client
// -> grameneSwaggerClient.js, whose top-level IIFE fires a GET to /swagger
// at module load. We never use the promise path, so the fetch was pure
// waste — two requests per page load before this change.
import bins from "gramene-bins-client/src/bins";
import taxonomy from "gramene-trees-client/src/taxonomy";
import {build} from "gramene-taxonomy-with-genomes";

const facets = [
  "{!facet.limit='300' facet.mincount='1' key='taxon_id'}taxon_id",
  // "{!facet.limit='100' facet.mincount='1' key='genetree'}gene_tree",
  // "{!facet.limit='100' facet.mincount='1' key='pathways'}pathways__ancestors",
  // "{!facet.limit='100' facet.mincount='1' key='domains'}domain_roots",
  "{!facet.limit='-1' facet.mincount='1' key='fixed_1000__bin'}fixed_1000__bin"
];
// In the no-filter state the TaxDist histogram is the global "all genes"
// distribution — it never changes for a given data release, so there's no
// point recomputing the bin facet on every page load.
const noFilterFacets = [facets[0]];
const genomesOfInterest = '(taxon_id:2769) OR (taxon_id:3055) OR (taxon_id:3218) OR (taxon_id:3702) OR (taxon_id:3847) OR (taxon_id:4555) OR (taxon_id:4558) OR (taxon_id:4577) OR (taxon_id:13333) OR (taxon_id:15368) OR (taxon_id:29760) OR (taxon_id:39947) OR (taxon_id:55577) OR (taxon_id:88036) OR (taxon_id:214687)';
const sites = ['main','oryza','maize','sorghum','grapevine'];
const grameneSuggestions = createAsyncResourceBundle( {
  name: 'grameneSuggestions',
  actionBaseType: 'GRAMENE_SUGGESTIONS',
  persist: false,
  getPromise: ({store}) => {
    const t = store.selectSuggestionsQuery().replaceAll(':',' ').trim();
    const g = store.selectGrameneGenomes();
    const q = `/suggest?q={!boost b=relevance}name:${t}^5 ids:${t}^5 ids:${t}*^3 synonym:${t}^3 synonym:${t}*^2 text:${t}*^1`;
    // const promises = sites.map(site => fetch(`https://data.gramene.org/${site}${q}`));
    // return Promise.all(promises)
    return fetch(store.selectGrameneAPI() + q)
      .then(res => {
        return res.json()
      })
      .then(suggestions => {
        if (Object.keys(g.active).length > 0) {
          suggestions.grouped.category.groups.forEach(group => {
            group.doclist.docs.forEach(sugg => {
              sugg.num_genes = 0;
              sugg.taxon_id.forEach((id,idx) => {
                if (g.active[id] && !g.active[id].hidden) {
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
    if (suggestionsRaw.data) return suggestionsRaw.data.grouped.category.matches + ' terms';
    console.error(suggestionsRaw)
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

function compressLongTaxonName(node) {
  const fullName = node.name;
  const removedExtraineousWords = fullName.replace(/( Group$| subsp\.| ssp\.| var\.| strain)/, '');
  let finalVersion;
  if (removedExtraineousWords.length > 20) {
    let words = removedExtraineousWords.split(' ');
    if (words.length === 2) {
      // abrreviate first word.
      finalVersion = removedExtraineousWords.replace(/^([A-Z])[a-z]+/, '$1.')
    }
    if (words.length > 2) {
      finalVersion = removedExtraineousWords.replace(/^([A-Z])[a-z]+\s([a-z])[a-z]+/, '$1$2.')
    }
  }
  else {
    finalVersion = removedExtraineousWords;
  }
  node.short_name = finalVersion;
}

const grameneTaxonomy = createAsyncResourceBundle({
  name: 'grameneTaxonomy',
  actionBaseType: 'GRAMENE_TAXONOMY',
  persist: true,
  staleAfter: 24 * 60 * 60 * 1000,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/taxonomy?subset=gramene&rows=-1`)
      .then(res => res.json())
      .then(taxNodes => {
        let taxonomy = _.keyBy(taxNodes, '_id');
        taxNodes.forEach(t => {
          t._id = +t._id; // ensure taxonomy id is a number
          compressLongTaxonName(t);
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
  staleAfter: 24 * 60 * 60 * 1000,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/maps?rows=-1`)
      .then(res => res.json())
      .then(maps => {
        maps.forEach(m => {
          m.regionLength = {};
          m.regions.names.forEach((rname,idx) => {
            m.regionLength[rname] = m.regions.lengths[idx]
          })
        })
        return _.keyBy(maps, 'taxon_id');
      })
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

const expressionStudies = createAsyncResourceBundle( {
  name: 'expressionStudies',
  actionBaseType: 'EXPRESSION_STUDIES',
  persist: true,
  staleAfter: 24 * 60 * 60 * 1000,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/experiments?rows=-1`)
      .then(res => res.json())
      .then(res => _.groupBy(res, 'taxon_id'))
  }
});
// Only fetch when a view that consumes expression studies is enabled.
const EXPRESSION_VIEWS = ['exprViz', 'expression', 'export'];
expressionStudies.reactExpressionStudies = createSelector(
  'selectExpressionStudiesShouldUpdate',
  'selectGrameneViewsOn',
  (shouldUpdate, viewsOn) => {
    if (!shouldUpdate) return;
    if (!viewsOn || !EXPRESSION_VIEWS.some(id => viewsOn.has(id))) return;
    return { actionCreator: 'doFetchExpressionStudies' }
  }
);

const expressionSamples = createAsyncResourceBundle( {
  name: 'expressionSamples',
  actionBaseType: 'EXPRESSION_SAMPLES',
  persist: true,
  staleAfter: 24 * 60 * 60 * 1000,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/assays?rows=-1`)
      .then(res => res.json())
      .then(samples => _.groupBy(samples, 'experiment'))
      .then(studies => {
        Object.keys(studies).forEach(study => {
          studies[study].forEach(sample => {
            sample.order = +sample.group.replace('g','')
          });
          studies[study].sort((a,b) => a.order - b.order);
        })
        return studies
      })
  }
});
expressionSamples.reactExpressionSamples = createSelector(
  'selectExpressionSamplesShouldUpdate',
  'selectGrameneViewsOn',
  (shouldUpdate, viewsOn) => {
    if (!shouldUpdate) return;
    if (!viewsOn || !EXPRESSION_VIEWS.some(id => viewsOn.has(id))) return;
    return { actionCreator: 'doFetchExpressionSamples' }
  }
);

const grameneGermplasm = createAsyncResourceBundle( {
  name: 'grameneGermplasm',
  actionBaseType: 'GRAMENE_GERMPLASM',
  persist: true,
  staleAfter: 24 * 60 * 60 * 1000,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/germplasm?rows=-1`)
      .then(res => res.json())
      .then(res => {
        res.forEach(g => {
          if (!g.subpop) {
            g.subpop = "?"
          }
        });
        return _.groupBy(res, 'ens_id')
      })
  }
});
// Germplasm metadata is consumed by the VEP detail panel inside the gene list.
grameneGermplasm.reactGrameneGermplasm = createSelector(
  'selectGrameneGermplasmShouldUpdate',
  'selectGrameneViewsOn',
  (shouldUpdate, viewsOn) => {
    if (!shouldUpdate) return;
    if (!viewsOn || !viewsOn.has('list')) return;
    return { actionCreator: 'doFetchGrameneGermplasm' }
  }
);
//
// const grameneExpressionAssays = createAsyncResourceBundle( {
//   name: 'grameneExpressionAssays',
//   actionBaseType: 'GRAMENE_EXPRESSION_ASSAYS',
//   persist: true,
//   getPromise: ({store}) => {
//     return fetch(`${store.selectGrameneAPI()}/assays?rows=-1`)
//       .then(res => res.json())
//       .then(res => {
//         let expr={};
//         res.forEach(assay => {
//           if (!expr.hasOwnProperty(assay.taxon_id)) {
//             expr[assay.taxon_id] = {};
//           }
//           if (!expr[assay.taxon_id].hasOwnProperty(assay.experiment)) {
//             expr[assay.taxon_id][assay.experiment] = [];
//           }
//           assay.order = +assay.group.replace('g','');
//           expr[assay.taxon_id][assay.experiment].push(assay);
//         });
//         // sort each experiment
//         for (const tid in expr) {
//           for (const exp in expr[tid]) {
//             expr[tid][exp].sort((a,b) => a.order - b.order);
//           }
//         }
//         return expr;
//       })
//   }
// });
// grameneExpressionAssays.reactGrameneExpressionAssays = createSelector(
//   'selectGrameneExpressionAssaysShouldUpdate',
//   (shouldUpdate) => {
//     if (shouldUpdate) {
//       return { actionCreator: 'doFetchGrameneExpressionAssays' }
//     }
//   }
// );

const MAKERAttribs = [
  'MAKER__AED__attr_f',
  'MAKER__QI1__attr_i',
  'MAKER__QI2__attr_f',
  'MAKER__QI3__attr_f',
  'MAKER__QI4__attr_f',
  'MAKER__QI5__attr_f',
  'MAKER__QI6__attr_f',
  'MAKER__QI7__attr_i',
  'MAKER__QI8__attr_i',
  'MAKER__QI9__attr_i'
];
const geneAttribs = {
  "MAKER transcript metrics" : [
    { name: "AED", description: "Annotation Edit Distance", dtype: "f", fieldName: "MAKER__AED__attr_f" },
    { name: "QI1", description: "Length of the 5' UTR", dtype: "i", fieldName: "MAKER__QI1__attr_i" },
    { name: "QI2", description: "Fraction of splice sites confirmed by an EST alignment", dtype: "f", fieldName: "MAKER__QI2__attr_f" },
    { name: "QI3", description: "Fraction of exons that overlap an EST alignment", dtype: "f", fieldName: "MAKER__QI3__attr_f" },
    { name: "QI4", description: "Fraction of exons that overlap EST or Protein alignments", dtype: "f", fieldName: "MAKER__QI4__attr_f" },
    // { name: "QI5", description: "Fraction of splice sites confirmed by a SNAP prediction", dtype: "f", fieldName: "MAKER__QI5__attr_f" },
    // { name: "QI6", description: "Fraction of exons that overlap a SNAP prediction", dtype: "f", fieldName: "MAKER__QI6__attr_f" },
    { name: "QI7", description: "Number of exons in the mRNA", dtype: "i", fieldName: "MAKER__QI7__attr_i" },
    { name: "QI8", description: "Length of the 3' UTR", dtype: "i", fieldName: "MAKER__QI8__attr_i" },
    { name: "QI9", description: "Length of the protein sequence produced by the mRNA", dtype: "i", fieldName: "MAKER__QI9__attr_i" }
  ]
}
const statsFields = geneAttribs['MAKER transcript metrics'].map(
  // (f) => `stats.field={!min=true max=true count=true mean=true stddev=true percentiles='20,40,60,80,90,95,99'}${f}`
  (f) => `stats.field={!min=true max=true count=true mean=true stddev=true percentiles='10,20,30,40,50,60,70,80,90,99.99'}${f.fieldName}`
);

const grameneGeneAttribs = createAsyncResourceBundle( {
  name: 'grameneGeneAttribs',
  actionBaseType: 'GRAMENE_GENE_ATTRIBS',
  persist: false,
  getPromise: ({store}) => {
    return fetch(`${store.selectGrameneAPI()}/geneAttributes`).then(res => geneAttribs)
  }
});
grameneGeneAttribs.reactGrameneGeneAttribs = createSelector(
  'selectGrameneGeneAttribsShouldUpdate',
  'selectGrameneFiltersStatus',
  'selectGrameneViewsOn',
  (shouldUpdate, status, viewsOn) => {
    if (!shouldUpdate) return;
    if (status !== 'finished' && status !== 'ready') return;
    if (!viewsOn || !viewsOn.has('attribs')) return;
    return { actionCreator: 'doFetchGrameneGeneAttribs' }
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
    const m = store.selectGrameneMaps() || {};
    // Visible (non-hidden) genomes — the universe the user can browse.
    const visibleTaxa = Object.keys(m).filter(tid => !m[tid].hidden);
    // What's actually toggled on. `active` is seeded with every map key
    // when maps load, so by default activeVisible === visibleTaxa.
    const activeVisible = Object.keys((g && g.active) || {}).filter(tid => m[tid] && !m[tid].hidden);
    // Only send fq=taxon_id:(...) when the user has actually subset the
    // genomes. Sending the full visible list would just bloat the URL and
    // fragment the upstream cache per site. Hidden-genome contributions
    // are stripped from the response below instead.
    const userSubsetGenomes = activeVisible.length > 0 && activeVisible.length < visibleTaxa.length;
    const fq = userSubsetGenomes ? `&fq=taxon_id:(${activeVisible.join(' OR ')})` : '';

    const q = store.selectGrameneFiltersQueryString();
    const noFilters = q === '*:*' && !userSubsetGenomes;
    const effectiveRows = noFilters ? 0 : rows;
    const facetField = noFilters ? noFilterFacets : facets;

    // Set of taxon_ids the UI knows about — keep only these in the response.
    // Anything else (hidden taxa, or taxa that exist in Solr but not in this
    // site's maps collection) is stripped so downstream consumers — notably
    // the TaxDist Vis which throws on unknown tids — see a clean visible-only
    // view. Mirrors the old server-side `fq=taxon_id:(visible)` behavior.
    const visibleTaxaSet = new Set(visibleTaxa);

    // return fetch(`${store.selectGrameneAPI()}/search?q=${q}&facet.field=${facetField}&rows=${effectiveRows}&start=${offset}${fq}&stats=true&${statsFields.join('&')}`)
    return fetch(`${store.selectGrameneAPI()}/search?q=${q}&facet.field=${facetField}&rows=${effectiveRows}&start=${offset}${fq}`)
      .then(res => res.json())
      .then(res => {
        if (visibleTaxaSet.size && res.facet_counts && res.facet_counts.facet_fields) {
          const tf = res.facet_counts.facet_fields.taxon_id;
          if (Array.isArray(tf)) {
            let droppedGeneCount = 0;
            const kept = [];
            for (let i = 0; i < tf.length; i += 2) {
              if (visibleTaxaSet.has(String(tf[i]))) {
                kept.push(tf[i], tf[i + 1]);
              } else {
                droppedGeneCount += tf[i + 1];
              }
            }
            res.facet_counts.facet_fields.taxon_id = kept;
            if (res.response) {
              res.response.numFound = Math.max(0, res.response.numFound - droppedGeneCount);
              if (Array.isArray(res.response.docs)) {
                res.response.docs = res.response.docs.filter(d => visibleTaxaSet.has(String(d.taxon_id)));
              }
            }
          }
        }
        if (res.response && Array.isArray(res.response.docs)) {
          res.response.docs.forEach(d => {
            d.can_show = {};
            d.capabilities.forEach(c => {
              d.can_show[c] = true;
            });
          });
        }
        return res;
      })
  }
});
grameneSearch.reactGrameneSearch = createSelector(
  'selectGrameneSearchShouldUpdate',
  'selectGrameneFiltersStatus',
  'selectGrameneGenomes',
  (shouldUpdate, status, genomes) => {
    if (shouldUpdate && status === 'search' && genomes) {
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
        let speciesTree = taxonomy.tree(Object.values(grameneTaxonomy));
        let binMapper = bins(grameneMaps);
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

const grameneParalogs = {
  name: 'grameneParalogs',
  getReducer: () => {
    const initialState = {};
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_PARALOGS_REQUESTED':
          if (!state.hasOwnProperty(payload)) {
            newState = Object.assign({}, state);
            newState[payload] = [];
            return newState;
          }
          break;
        case 'GRAMENE_PARALOGS_RECEIVED':
          return Object.assign({}, state, payload);
      }
      return state;
    }
  },
  doRequestParalogs: (geneId,supertree,taxon_id) => ({dispatch, store}) => {
    const paralogs = store.selectGrameneParalogs();
    if (!paralogs.hasOwnProperty(geneId)) {
      dispatch({type: 'GRAMENE_PARALOGS_REQUESTED', payload: geneId});
      const API = store.selectGrameneAPI();
      const q= supertree ? `supertree_attr_s:${supertree}` : `homology__within_species_paralog:${geneId}`;
      fetch(`${API}/search?q=${q}&rows=1000&fq=taxon_id:${taxon_id}`)
        .then(res => res.json())
        .then(res => {
          let newParalogs = {};
          newParalogs[geneId] = res.response.numFound > 0 ? res.response.docs.map(d => d.id) : [geneId];
          dispatch({type: 'GRAMENE_PARALOGS_RECEIVED', payload: newParalogs})
        })
    }
  },
  selectGrameneParalogs: state => state.grameneParalogs
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


export default [grameneSuggestions, grameneSearch, grameneGeneAttribs, grameneMaps, grameneTaxonomy, grameneTaxDist, grameneOrthologs, grameneParalogs, grameneGermplasm, expressionSamples, expressionStudies];
