import { createAsyncResourceBundle, createSelector } from 'redux-bundler'
import _ from 'lodash'
const facets = [
  "{!facet.limit='200' facet.mincount='1' key='taxon_id'}taxon_id",
  "{!facet.limit='100' facet.mincount='1' key='genetree'}gene_tree",
  "{!facet.limit='100' facet.mincount='1' key='pathways'}pathways__ancestors",
  "{!facet.limit='100' facet.mincount='1' key='domains'}domain_roots"
];
const genomesOfInterest = '(taxon_id:2769) OR (taxon_id:3055) OR (taxon_id:3218) OR (taxon_id:3702) OR (taxon_id:3847) OR (taxon_id:4555) OR (taxon_id:4558) OR (taxon_id:4577) OR (taxon_id:13333) OR (taxon_id:15368) OR (taxon_id:29760) OR (taxon_id:39947) OR (taxon_id:55577) OR (taxon_id:88036) OR (taxon_id:214687)';
const grameneURL = 'https://data.gramene.org'

const grameneSuggestions = createAsyncResourceBundle( {
  name: 'grameneSuggestions',
  actionBaseType: 'GRAMENE_SUGGESTIONS',
  persist: false,
  getPromise: ({store}) => {
    const t = store.selectSuggestionsQuery();
    return fetch(`${grameneURL}/suggest?q={!boost b=relevance}name:${t}^3 id:${t}^5 synonym:${t}^2 text:${t}*^1`)
      .then(res => res.json())
      .then(suggestions => {return suggestions})
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

const grameneSearch = createAsyncResourceBundle({
  name: 'grameneSearch',
  actionBaseType: 'GRAMENE_SEARCH',
  persist: false,
  getPromise: ({store}) => {
    store.dispatch({
      type: 'GRAMENE_FILTERS_STATUS_CHANGED',
      payload: 'waiting'
    });
    return fetch(`${grameneURL}/search?q=${store.selectGrameneFiltersQueryString()}`)
      .then(res => {
        store.dispatch({
          type: 'GRAMENE_FILTERS_STATUS_CHANGED',
          payload: 'ready'
        });
        return res.json()
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


const grameneGenes = createAsyncResourceBundle({
  name: 'grameneGenes',
  actionBaseType: 'GRAMENE_GENES',
  persist: false,
  getPromise: ({store}) =>
    fetch(`${grameneURL}/search?${store.selectGrameneFiltersQueryString()}&facet.field=${facets}&fq=${genomesOfInterest}&rows=${store.selectRows()['Genes'] * 3}`)
      .then(res => res.json())
      .then(solr => {solr.numFound = solr.response.numFound; return solr})
});

grameneGenes.reactGrameneGenes = createSelector(
  'selectGrameneGenesShouldUpdate',
  'selectGrameneFiltersQueryString',
  (shouldUpdate, queryString) => {
    if (shouldUpdate && queryString && false) {
      return { actionCreator: 'doFetchGrameneGenes' }
    }
  }
);

grameneGenes.reactDomainFacets = createSelector(
  'selectGrameneDomainsShouldUpdate',
  'selectGrameneGenes',
  (shouldUpdate, grameneGenes) => {
    if (shouldUpdate && grameneGenes) {
      return { actionCreator: 'doFetchGrameneDomains' }
    }
  }
);

grameneGenes.reactPathwayFacets = createSelector(
  'selectGramenePathwaysShouldUpdate',
  'selectGrameneGenes',
  (shouldUpdate, grameneGenes) => {
    if (shouldUpdate && grameneGenes) {
      return { actionCreator: 'doFetchGramenePathways' }
    }
  }
);

grameneGenes.reactTaxonomyFacets = createSelector(
  'selectGrameneTaxonomyShouldUpdate',
  'selectGrameneGenes',
  (shouldUpdate, grameneGenes) => {
    if (shouldUpdate && grameneGenes) {
      return { actionCreator: 'doFetchGrameneTaxonomy' }
    }
  }
);

function selectFacetIDs(store, field) {
  const path = `grameneGenes.data.facet_counts.facet_fields.${field}`;
  if (_.has(store,path)) {
    const flat_facets = _.get(store,path);
    let idList = [];
    if (isNaN(+flat_facets[0])) {
      for (let i = 0; i < flat_facets.length; i += 2) {
        idList.push(flat_facets[i])
      }
    }
    else {
      for (let i = 0; i < flat_facets.length; i += 2) {
        idList.push(+flat_facets[i])
      }
      if (idList.length === 1) idList.push(0);
    }
    return idList;
  }
}

grameneGenes.selectDomainFacets = store => selectFacetIDs(store, 'domains');
grameneGenes.selectPathwayFacets = store => selectFacetIDs(store, 'pathways');
grameneGenes.selectTaxonomyFacets = store => selectFacetIDs(store, 'taxon_id');

const grameneDomains = createAsyncResourceBundle({
  name: 'grameneDomains',
  actionBaseType: 'GRAMENE_DOMAINS',
  persist: false,
  getPromise: ({store}) =>
    fetch(`${grameneURL}/domains?rows=-1&idList=${store.selectDomainFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {domains: docs, numFound: docs.length}})
});

const gramenePathways = createAsyncResourceBundle({
  name: 'gramenePathways',
  actionBaseType: 'GRAMENE_PATHWAYS',
  persist: false,
  getPromise: ({store}) =>
    fetch(`${grameneURL}/pathways?rows=-1&idList=${store.selectPathwayFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {pathways: docs, numFound: docs.length}})
});

const grameneTaxonomy = createAsyncResourceBundle({
  name: 'grameneTaxonomy',
  actionBaseType: 'GRAMENE_TAXONOMY',
  persist: false,
  getPromise: ({store}) =>
    fetch(`${grameneURL}/taxonomy?rows=-1&idList=${store.selectTaxonomyFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {taxonomy: docs, numFound: docs.length}})
});


export default [grameneSuggestions, grameneSearch, grameneGenes, grameneDomains, gramenePathways, grameneTaxonomy];
