import React, {useState, useEffect, useMemo} from 'react';
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Container, Row, Col, ToggleButton, ButtonGroup } from 'react-bootstrap';
import * as console from "console";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./VEP.css";

const metaRenderer = params => {
  if (params.value.field === "germplasm") { // link to grin or SorgMutDB
    if (params.value.germplasm_dbid) {
      return <a target="_blank" href={`https://npgsweb.ars-grin.gov/gringlobal/accessiondetail.aspx?id=${params.value.germplasm_dbid}`}>{params.value.pub_id}</a>;
    }
    return (
      <form id={params.value.pub_id} action="https://www.depts.ttu.edu/igcast/sorbmutdb.php" method="post" target="_blank">
        <input type="hidden" name="search" value={params.value.gene_id.replace('SORBI_3','Sobic.')} />
        <input type="hidden" name="submit" value="Search" />
        <button type="submit" className="button-like-link">SorbMutDB</button>
      </form>
    );

    return (
      <form id={params.value.pub_id} action="https://www.depts.ttu.edu/igcast/sorbmutdb.php" method="post" target="_blank">
        <input type="hidden" name="search" value={params.value.gene_id.replace('SORBI_3','Sobic.')} />
        <input type="hidden" name="submit" value="Search" />
        <button className="button-like-link" onClick={() => document.getElementById(params.value.pub_id).submit()}>SorbMutDB</button>
      </form>
    );

    return `link to SorbMutDB ${params.value.pub_id}`
  }
  if (params.value.field === "search") { // search filter
    return `VEP__merged__${study_info[params.value.pop_id].type}__attr_ss:${params.value.ens_id}`
  }
  return params.value.label
}
const sortByLabel = (valueA, valueB, nodeA, nodeB, isDescending) => {
  if (valueA.label === valueB.label) return 0;
  return (valueA.label > valueB.label) ? 1 : -1;
}

const study_info = {
  '1' : {label: 'Purdue EMS', type: 'EMS'},
  '2' : {label: 'USDA Lubbock EMS', type: 'EMS'},
  '3' : {label: 'Lozano', type: 'NAT'},
  '4' : {label: 'USDA Lubbock EMS', type: 'EMS'},
  '5' : {label: 'Boatwright SAP', type: 'NAT'}
};
const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  if (props.grameneConsequences && props.grameneConsequences[gene._id] && props.grameneGermplasm) {
    const germplasmLUT = props.grameneGermplasm;
    const vep_obj = props.grameneConsequences[gene._id];
    let accessionTable = [];
    let tableFields = [
      { field: 'Study/Population', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'VEP consequence', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Allele Status', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Germplasm', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Other Genes', cellRenderer: metaRenderer, comparator: sortByLabel}
    ];
    Object.entries(vep_obj).forEach(([key,accessions]) => {
      const parts = key.split("__");
      if (parts[0] === "VEP") {
        if (parts[1] !== "merged") {
          accessions.forEach(ens_id => {
            const germplasm = germplasmLUT[ens_id][0];
            const accInfo = {
              'Study/Population': {label: study_info[parts[3]].label},
              'VEP consequence': {label: parts[1].replaceAll("_"," ")},
              'Allele Status': {label: parts[2] === "het" ? "heterozygous" : "homozygous"},
              'Germplasm': {field: 'germplasm', gene_id: props.searchResult.id, label: germplasm.pub_id, ...germplasm},
              'Other Genes': {field: 'search', label: germplasm.ens_id, ...germplasm}
            };
            accessionTable.push(accInfo);
          });
        }
      }
    });
    // const [rowData, setRowData] = useState(accessionTable);
    // const [colDefs, setColDefs] = useState(tableFields);
    const defaultColDef = useMemo(() => {
      return {
        filter: true
      }
    }, []);
    return <div className="ag-theme-quartz" style={{height: `${44 * (accessionTable.length + 2)}px`}}>
      <AgGridReact rowData={accessionTable} columnDefs={tableFields} defaultColDef={defaultColDef}/>
    </div>
  } else {
      props.doRequestVEP(gene._id);
      return <pre>loading</pre>;
  }
};

export default connect(
  'selectConfiguration',
  'selectGrameneConsequences',
  'selectGrameneGermplasm',
  'doRequestVEP',
  Detail
);

