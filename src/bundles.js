import { createAsyncResourceBundle, createSelector } from 'redux-bundler'
import _ from 'lodash'
const facets = [
  "{!facet.limit='200' facet.mincount='1' key='taxon_id'}taxon_id",
  "{!facet.limit='100' facet.mincount='1' key='genetree'}gene_tree",
  "{!facet.limit='100' facet.mincount='1' key='pathways'}pathways__ancestors",
  "{!facet.limit='100' facet.mincount='1' key='domains'}domain_roots"
];

const grameneGenes = createAsyncResourceBundle({
  name: 'grameneGenes',
  actionBaseType: 'GRAMENE_GENES',
  getPromise: ({store}) =>
    fetch(`http://data.gramene.org/search?${store.selectQueryString()}&facet.field=${facets}`)
      .then(res => res.json())
      .then(solr => {console.log(solr); solr.numFound = solr.response.numFound; return solr})
});

grameneGenes.reactGrameneGenes = createSelector(
  'selectGrameneGenesShouldUpdate',
  'selectQueryString',
  (shouldUpdate, queryString) => {
    if (shouldUpdate && queryString) {
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
  getPromise: ({store}) =>
    fetch(`http://data.gramene.org/domains?rows=-1&idList=${store.selectDomainFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {domains: docs, numFound: docs.length}})
});

const gramenePathways = createAsyncResourceBundle({
  name: 'gramenePathways',
  actionBaseType: 'GRAMENE_PATHWAYS',
  getPromise: ({store}) =>
    fetch(`http://data.gramene.org/pathways?rows=-1&idList=${store.selectPathwayFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {pathways: docs, numFound: docs.length}})
});

const grameneTaxonomy = createAsyncResourceBundle({
  name: 'grameneTaxonomy',
  actionBaseType: 'GRAMENE_TAXONOMY',
  getPromise: ({store}) =>
    fetch(`http://data.gramene.org/taxonomy?rows=-1&idList=${store.selectTaxonomyFacets().join(',')}`)
      .then(res => res.json())
      .then(docs => {return {taxonomy: docs, numFound: docs.length}})
});

const bundles = [grameneGenes, grameneDomains, gramenePathways, grameneTaxonomy];

export { bundles };
