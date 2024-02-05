import React, { useState, useEffect } from 'react'
import {connect} from "redux-bundler-react";
import { Accordion } from 'react-bootstrap';
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
const StudyCmp = props => {
  let samples = props.expressionSamples[props.id];
  let sampleMetadata = [];
  let metadataFields = [{ field: "sampleId" }];
  let isFactor={};
  samples.forEach((sample, idx) => {
    if (idx === 0) {
      sample.factor.forEach(factor => {
        metadataFields.push({field: factor.type})
        isFactor[factor.type] = true;
      });
      sample.characteristic.forEach(ch => {
        if (!isFactor[ch.type]) {
          metadataFields.push({field: ch.type})
          }
      })
    }
    let s_info = {sampleId: sample._id}
    sample.factor.forEach(factor => {
      s_info[factor.type] = factor.label;
    })
    sample.characteristic.forEach(ch => {
      s_info[ch.type] = ch.label;
    })
    sampleMetadata.push(s_info)
  })
  const [rowData, setRowData] = useState(sampleMetadata);
  const [colDefs, setColDefs] = useState(metadataFields);
  return (
    <div className="ag-theme-quartz" style={{height:250}}>
      <AgGridReact rowData={rowData} columnDefs={colDefs} />
    </div>
  );
};
const Study = connect(
  'selectExpressionSamples',
  StudyCmp
);
const StudyList = props => {
  return <Accordion flush alwaysOpen defaultActiveKey={props.studies.length === 1 ? "study_0" : undefined}>
    {props.studies.map((study, idx) => {
      return (
        <Accordion.Item key={idx} eventKey={'study_'+idx}>
          <Accordion.Header>{study.description}</Accordion.Header>
          <Accordion.Body>
            <Study id={study._id} />
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
