import React from 'react'
import { connect } from 'redux-bundler-react'
import _ from 'lodash'

function convertFacetCountsToMap(a) {
  let res = new Map();
  for(let i=0;i<a.length;i+=2) {
    res.set(a[i], a[i+1]);
  }
  return res;
}

const TaxDist = ({grameneSearch, grameneTaxonomy, grameneMaps}) => {
  if (grameneSearch && grameneTaxonomy && grameneMaps) {
    const binTally = convertFacetCountsToMap(grameneSearch.facet_counts.facet_fields.fixed_1000__bin);
    const taxTally = convertFacetCountsToMap(grameneSearch.facet_counts.facet_fields.taxon_id);

    // calculate a num_results field in each taxonomy node based on taxTally
    let speciesTree = _.cloneDeep(grameneTaxonomy);
    taxTally.forEach((count, tax) => {
      let node = speciesTree[tax];
      node.num_results = count;
      node.ancestors.forEach(a => {
        let ancestor = speciesTree[a];
        if (!ancestor.hasOwnProperty('num_results')) ancestor.num_results = 0;
        ancestor.num_results += count;
      })
    });

    // we have
    // 1000 bins per genome
    // ~100 genomes (leaves in species tree)
    // non-zero count per taxonomy node and per bin
    //
    // display should have the species tree, node labels, number of hits, and genome visualization
    // tree should collapse non-leaf branches with 0 results
    // select regions in genomic distribution to modify search
    // adds an OR node of the selected regions to the top level
    //
    // how do we reuse TBrowse here?

    return (
      <div>This is the TaxDist component <pre>{JSON.stringify(speciesTree, null, 2)}</pre></div>
    );
  }
  return null
};

export default connect(
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectGrameneMaps',
  TaxDist);
