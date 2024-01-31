import React, { useState, useEffect } from 'react'
import {connect} from "redux-bundler-react";

const StudyCmp = props => {
  const study = props.atlasStudies.byID[props.sid];
  if (!study.samples) {
    props.doRequestStudyMetadata(props.sid);
    return <p>loading</p>
  }
  else {
    return <div>got eem!</div>
  }
};
const Study = connect(
  'selectGrameneSearch',
  'selectAtlasStudies',
  'doRequestStudyMetadata',
  StudyCmp
);
const Expression = props => {
  const [taxon, setTaxon] = useState(0);
  const [study, setStudy] = useState(0);
  let searchTaxa = {};
  let availableTaxa = [];
  if (props.grameneSearch) {
    const taxon_id_facet = props.grameneSearch.facet_counts.facet_fields.taxon_id;
    taxon_id_facet.filter((tid, idx) => idx % 2 === 0).forEach(tid => searchTaxa[tid] = true);
  }
  if (!props.atlasStudies.byTaxon) {
    props.doRequestExpressionStudies()
  } else {
    availableTaxa = Object.keys(props.atlasStudies.byTaxon).filter(tid => searchTaxa[tid] || searchTaxa[tid + '001']);
  }
  return availableTaxa && props.grameneTaxonomy &&
    <div>
      <label htmlFor="taxonomySelect">Select Genome:</label>
      <select
        id="taxonomySelect"
        value={taxon}
        onChange={(e) => {
          setTaxon(e.target.value);
          setStudy(0)
        }}>
        <option value="">Select...</option>
        {availableTaxa.map((tid, idx) => <option key={idx} value={tid}>{props.grameneTaxonomy[tid].name}</option>)}
      </select>
      {taxon > 0 && <div>
        <label htmlFor="studySelect">Select Study:</label>
        <select
          id="studySelect"
          value={study}
          onChange={(e) => setStudy(e.target.value)}>
          <option value="">Select...</option>
          {props.atlasStudies.byTaxon[taxon].map((sid, idx) => <option key={idx}
                                                                       value={sid}>{props.atlasStudies.byID[sid].description}</option>)}
        </select>
      </div>
      }
      {study !== 0 && <Study sid={study}/>}
    </div>
};

export default connect(
  'selectConfiguration',
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectAtlasStudies',
  'doRequestExpressionStudies',
  'doRequestStudyMetadata',
  Expression
);
