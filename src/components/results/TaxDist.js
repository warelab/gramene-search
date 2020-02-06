import React from 'react'
import { connect } from 'redux-bundler-react'

function arrayToObject(a) {
  let res = {};
  for(let i=0;i<a.length;i+=2) {
    res[a[i]] = a[i+1];
  }
  return res;
}

const TaxDist = ({grameneSearch, grameneTaxonomy, grameneMaps}) => {
  if (grameneSearch && grameneTaxonomy && grameneMaps) {
    const binTally = arrayToObject(grameneSearch.facet_counts.facet_fields.fixed_1000__bin);
    const taxTally = arrayToObject(grameneSearch.facet_counts.facet_fields.taxon_id);
    return (
      <div>This is the TaxDist component <pre>{JSON.stringify(taxTally, null, 2)}</pre></div>
    );
  }
  return null
};

export default connect(
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectGrameneMaps',
  TaxDist);
