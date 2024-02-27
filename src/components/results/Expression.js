import React, { useState, Suspense } from 'react'
import {connect} from "redux-bundler-react";
import { Accordion } from 'react-bootstrap';
import "./expression.css";
const LazyStudy = React.lazy(() => import('./Study'));

const StudyList = props => {
  return <Accordion alwaysOpen defaultActiveKey={props.studies.length === 1 ? "study_0" : undefined}>
    {props.studies.map((study, idx) => {
      return (
        <Accordion.Item key={idx} eventKey={'study_'+idx}>
          <Accordion.Header>{study.description}</Accordion.Header>
          <Accordion.Body>
            <Suspense fallback={<div>Loading...</div>}>
              <LazyStudy id={study._id}/>
            </Suspense>
            {/*<Study id={study._id} />*/}
          </Accordion.Body>
        </Accordion.Item>
      )
    })}
  </Accordion>
};

const Expression = props => {
  let searchTaxa = {};
  if (props.grameneSearch) {
    const taxon_id_facet = props.grameneSearch.facet_counts.facet_fields.taxon_id;
    taxon_id_facet.filter((tid, idx) => idx % 2 === 0).forEach(tid => searchTaxa[tid] = true);
  }
  const availableTaxa = Object.keys(props.expressionStudies)
    .filter(tid => searchTaxa[tid] || searchTaxa[tid + '001'])
    .sort((a,b) => props.grameneMaps[a + '001'].left_index - props.grameneMaps[b + '001'].left_index);
  return availableTaxa && props.grameneTaxonomy &&
    <Accordion alwaysOpen defaultActiveKey={availableTaxa.length === 1 ? "tax_0" : undefined}>
      {availableTaxa.map((tid, idx) => {
        const n = props.expressionStudies[tid].length;
        return <Accordion.Item key={idx} eventKey={'tax_'+idx}>
          <Accordion.Header>{props.grameneTaxonomy[tid].name} - {n} {n === 1 ? 'study' : 'studies'}</Accordion.Header>
          <Accordion.Body><StudyList studies={props.expressionStudies[tid]}/></Accordion.Body>
        </Accordion.Item>
      })}
    </Accordion>
};

export default connect(
  'selectConfiguration',
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectGrameneMaps',
  'selectExpressionStudies',
  Expression
);
