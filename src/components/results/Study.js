import React, { useState, useMemo } from 'react'
import {connect} from "redux-bundler-react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

const metaRenderer = params => {
  if (params.value.ontology) {
    return <a href={`http://purl.obolibrary.org/obo/${params.value.id.replace(":","_")}`} target='_blank'>{params.value.label}</a>
  }
  return params.value.label
}
const sampleRenderer = params => {
  const sampleMeta = params.value;
  return JSON.stringify(sampleMeta,null,2);
}
const Study = props => {
  let samples = props.expressionSamples[props.id];
  let sampleMetadata = [];
  let metadataFields = [{ field: "sampleId", cellRenderer: sampleRenderer }];
  let isFactor={};
  samples.forEach((sample, idx) => {
    if (idx === 0) {
      let factors = {
        headerName: 'Experimental Variables',
        children: []
      }
      sample.factor.forEach(factor => {
        factors.children.push({field: factor.type, cellRenderer: metaRenderer})
        isFactor[factor.type] = true;
      });
      metadataFields.push(factors);
      let characteristics = {
        headerName: 'Sample Characteristics',
        children: []
      }
      sample.characteristic.forEach(ch => {
        if (!isFactor[ch.type]) {
          characteristics.children.push({field: ch.type, cellRenderer: metaRenderer})
        }
      });
      metadataFields.push(characteristics)
    }
    let s_info = {sampleId: sample}
    sample.factor.forEach(factor => {
      s_info[factor.type] = {label: factor.label};
      if (factor.ontology) {
        s_info[factor.type]['ontology'] = factor.ontology
        s_info[factor.type]['id'] = factor.id;
      }
    })
    sample.characteristic.forEach(ch => {
      s_info[ch.type] = {label: ch.label};
      if (ch.ontology) {
        s_info[ch.type]['ontology'] = ch.ontology
        s_info[ch.type]['id'] = ch.id;
      }
    })
    sampleMetadata.push(s_info)
  })
  const [rowData, setRowData] = useState(sampleMetadata);
  const [colDefs, setColDefs] = useState(metadataFields);
  const defaultColDef = useMemo(() => {
    return {
      filter: true
    }
  }, []);
  return (
    <div>
      <div className="ag-theme-quartz" style={{height: `${44 * (samples.length + 2)}px`}}>
        <AgGridReact rowData={rowData} columnDefs={colDefs} defaultColDef={defaultColDef}/>
      </div>
      <a href={`https://www.ebi.ac.uk/gxa/experiments/${props.id}`}>EBI Atlas Experiment: {props.id}</a>
    </div>
  );
};
export default connect(
  'selectExpressionSamples',
  'doToggleExpressionSample',
  Study);
