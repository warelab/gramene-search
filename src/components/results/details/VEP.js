import React, {useState, useEffect, useMemo} from 'react';
import {connect} from "redux-bundler-react";
import {Button} from 'react-bootstrap';
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./VEP.css";
import {suggestionToFilters} from "../../utils";

const ggURL = {
  IRRI: 'https://gringlobal.irri.org/gringlobal/accessiondetail?id=',
  ARS: 'https://npgsweb.ars-grin.gov/gringlobal/accessiondetail.aspx?id=',
  sorbmutdb: 'https://www.depts.ttu.edu/igcast/sorbmutdb.php'
};
const metaRenderer = params => {
  if (params.value.field === "germplasm") { // link to GrinGlobal or SorgMutDB
    const url = ggURL[params.value.stock_center];
    if (params.value.germplasm_dbid) {
      return <a target="_blank" href={`${url}${params.value.germplasm_dbid}`}>{params.value.pub_id}</a>;
    }
    return (
      <form id={params.value.pub_id} action={url} method="post" target="_blank">
        <input type="hidden" name="search" value={params.value.gene_id.replace('SORBI_3','Sobic.')} />
        <input type="hidden" name="submit" value="Search" />
        <button type="submit" className="button-like-link">SorbMutDB</button>
      </form>
    );
  }
  if (params.value.field === "search") { // search filter
    const currentURL = new URL(window.location.href);
    currentURL.search = '';
    currentURL.searchParams.set('category', 'Germplasm');
    currentURL.searchParams.set('fq_field',`VEP__merged__${study_info[params.value.pop_id].type}__attr_ss`);
    currentURL.searchParams.set('fq_value',params.value.ens_id);
    currentURL.searchParams.set('name', params.value.ens_id);

    return <Button size='sm' href={currentURL.toString()}>Search</Button>
  }
  return params.value.label
}
const sortByLabel = (valueA, valueB, nodeA, nodeB, isDescending) => {
  if (valueA.label === valueB.label) return 0;
  return (valueA.label > valueB.label) ? 1 : -1;
}

const rice_studies = {'1': {label: '3K-RG', type: 'NAT'}};
const study_info = {
  'sorghum_bicolor': {
    '1': {label: 'Purdue EMS', type: 'EMS'},
    '2': {label: 'USDA Lubbock EMS', type: 'EMS'},
    '3': {label: 'Lozano', type: 'NAT'},
    '4': {label: 'USDA Lubbock EMS', type: 'EMS'},
    '5': {label: 'Boatwright SAP', type: 'NAT'}
  },
  'oryza_sativa': {
    '7': {label: '3K-RG', type: 'NAT'},
  },
  'oryza_aus': rice_studies,
  'oryza_sativa117425': rice_studies,
  'oryza_sativa125827': rice_studies,
  'oryza_sativaazucena': rice_studies,
  'oryza_sativair64': rice_studies,
  'oryza_sativamh63': rice_studies,
  'oryza_sativazs97': rice_studies
};
const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  if (props.grameneConsequences && props.grameneConsequences[gene._id] && props.grameneGermplasm) {
    const germplasmLUT = props.grameneGermplasm;
    const vep_obj = props.grameneConsequences[gene._id];
    let accessionTable = [];
    let tableFields = [
      { field: 'Order Germplasm', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Synonyms', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Study/Population', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'VEP consequence', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'Allele Status', cellRenderer: metaRenderer, comparator: sortByLabel},
      { field: 'All LOF Genes', cellRenderer: metaRenderer, comparator: sortByLabel}
    ];
    Object.entries(vep_obj).forEach(([key,accessions]) => {
      const parts = key.split("__");
      if (parts[0] === "VEP") {
        if (parts[1] !== "merged") {
          accessions.forEach(ens_id => {
            const germplasm = germplasmLUT[ens_id][0];
            const accInfo = {
              'Study/Population': {label: study_info[parts[3]][parts[4]].label},
              'VEP consequence': {label: parts[1].replaceAll("_"," ")},
              'Allele Status': {label: parts[2] === "het" ? "heterozygous" : "homozygous"},
              'Order Germplasm': {field: 'germplasm', gene_id: props.searchResult.id, label: germplasm.pub_id, ...germplasm},
              'All LOF Genes': {field: 'search', label: germplasm.ens_id, ...germplasm},
              'Synonyms': {label: germplasm.ens_id}
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
    return <div>
      <h5>Predicted loss-of-function alleles were detected in these germplasm.</h5>
      <div >Explore other variants within this gene in the <a target="_blank"
         href={`${props.configuration.ensemblURL}/${gene.system_name}/Gene/Variation_Gene/Image?db=core;g=${props.searchResult.id}`}>
        Variant image</a> page in the Ensembl genome browser.</div>
      <div className="ag-theme-quartz" style={{height: `${44 * (accessionTable.length + 2)}px`}}>
        <AgGridReact rowData={accessionTable} columnDefs={tableFields} defaultColDef={defaultColDef}/>
      </div>
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

