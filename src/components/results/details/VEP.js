import React, {useState, useEffect, useRef, useCallback} from 'react';
import {connect} from "redux-bundler-react";
import {Button, Accordion, AccordionHeader} from 'react-bootstrap';
import { AgGridReact } from "ag-grid-react";
import _ from 'lodash';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./VEP.css";
import {suggestionToFilters} from "../../utils";

const ggURL = {
  IRRI: 'https://gringlobal.irri.org/gringlobal/accessiondetail?id=',
  ARS: 'https://npgsweb.ars-grin.gov/gringlobal/accessiondetail.aspx?id=',
  ICRISAT: 'https://genebank.icrisat.org/IND/PassportSummary?ID=',
  sorbmutdb: 'https://www.depts.ttu.edu/igcast/sorbmutdb.php'
};
const metaRenderer = params => {
  if (params.value.field === "accessions") {
    const accs = params.value.accessions;
    return <Accordion>
      <Accordion.Item>
        <Accordion.Header>{accs.length}</Accordion.Header>
        <Accordion.Body>
          <p>This is where the "table" goes</p>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  }
  if (params.value.field === "germplasm") { // link to stock center
    const genebank = params.value.stock_center;
    const url = ggURL[genebank];
    if (params.value.germplasm_dbid && url && params.value.germplasm_dbid !== "0") {
      return <a target="_blank" href={`${url}${params.value.germplasm_dbid}`}>
        {params.value.pub_id} ({genebank})</a>;
    }
    if (genebank === "sorbmutdb") {
      return (
        <form id={params.value.pub_id} action={url} method="post" target="_blank">
          <input type="hidden" name="search" value={params.value.gene_id.replace('SORBI_3','Sobic.')} />
          <input type="hidden" name="submit" value="Search" />
          <button type="submit" className="button-like-link">SorbMutDB</button>
        </form>
      );
    }
  }
  if (params.value.field === "search") { // search filter
    const currentURL = new URL(window.location.href);
    currentURL.search = '';
    currentURL.searchParams.set('category', 'Germplasm');
    currentURL.searchParams.set('fq_field',`VEP__merged__${params.value.pop_type}__attr_ss`);
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

const rice_studies = {'1': {label: 'Rice 3K', type: 'NAT'}};
const study_info = {
  'sorghum_bicolor': {
    '1': {label: 'Purdue EMS', type: 'EMS'},
    '2': {label: 'USDA Lubbock EMS', type: 'EMS'},
    '3': {label: 'Lozano', type: 'NAT'},
    '4': {label: 'USDA Lubbock EMS', type: 'EMS'},
    '5': {label: 'Boatwright SAP', type: 'NAT'},
    '7': {label: 'Kumar BAP', type: 'NAT'},
    '8': {label: 'Lasky landraces', type: 'NAT'}
  },
  'oryza_sativa': {
    '7': {label: 'Rice 3K', type: 'NAT'},
    '29': {label: 'Rice USDA mini core', type: 'NAT'},
    '38': {label: 'RAPDB 2024', type: 'NAT'},
  },
  'oryza_aus': rice_studies,
  'oryza_sativa117425': rice_studies,
  'oryza_sativa125827': rice_studies,
  'oryza_sativaazucena': rice_studies,
  'oryza_sativair64': rice_studies,
  'oryza_sativamh63': rice_studies,
  'oryza_sativazs97': rice_studies
};
const AccessionLink = ({germplasm, gene_id}) => {
  if (germplasm.germplasm_dbid) { // link to stock center
    const germ_id = germplasm.germplasm_dbid;
    const genebank = germplasm.stock_center;
    const url = ggURL[genebank];
    if (germ_id && url && germ_id !== "0") {
      return <a target="_blank" href={`${url}${germ_id}`}>
        {germplasm.pub_id} ({genebank})</a>;
    }
    if (genebank === "sorbmutdb") {
      return (
        <form id={germplasm.pub_id} action={url} method="post" target="_blank">
          <input type="hidden" name="search" value={gene_id.replace('SORBI_3','Sobic.')} />
          <input type="hidden" name="submit" value="Search" />
          <button type="submit" className="button-like-link">SorbMutDB</button>
        </form>
      );
    }
  }
  return <span>{germplasm.pub_id}</span>
}
function group_germplasm(gene, germplasmLUT, vep_obj) {
  let accessionTable = [];
  Object.entries(vep_obj).forEach(([key,accessions]) => {
    const parts = key.split("__");
    if (parts[0] === "VEP") {
      if (parts[1] !== "merged") {
        accessions.forEach(ens_id => {
          const germplasm = germplasmLUT[ens_id][0];
          const pop = study_info[parts[3]][parts[4]];
          const conseq = parts[1].replaceAll("_"," ");
          const status = parts[2] === "het" ? "heterozygous" : "homozygous";
          const accInfo = {
            key: [pop.label,conseq,status].join('%%%'),
            germplasm: germplasm,
            pop: pop
          };
          accessionTable.push(accInfo);
        });
      }
    }
  });
  // group accessionTable by key field
  const groups = _.groupBy(accessionTable, 'key');
  let grouped = [];
  let id=0;
  Object.keys(groups).sort().forEach((group) => {
    const [pop,conseq,status] = group.split('%%%');
    id++;
    const tally = groups[group].length;
    grouped.push({
      id: id,
      group: group,
      summary: true,
      pop: pop,
      conseq: conseq,
      status: status,
      tally: tally
    });
    groups[group].forEach(acc => {
      id++;
      grouped.push({
        id: id,
        group: group,
        summary: false,
        pop:pop,
        conseq: conseq,
        status: status,
        accession: acc,
        tally: tally
      })
    })
  })
  return grouped;
}
const THRESHOLD = 5;
const GridWithGroups = ({groups,gene_id}) => {
  const [rowData, setRowData] = useState(groups);

  const initialExpanded = {};
  rowData.forEach((row) => {
    if (row.summary) {
      initialExpanded[row.group] = (row.tally < THRESHOLD);
    }
  });
  const [expandedGroups, setExpandedGroups] = useState(initialExpanded);

  // const gridRef = useRef();

  // Toggle group visibility
  const toggleGroup = (group) => {
    setExpandedGroups((prevExpandedGroups) => ({
      ...prevExpandedGroups,
      [group]: !prevExpandedGroups[group], // Toggle the group's state
    }));
  };

  // Filter the data to show/hide rows based on the expanded group state
  const getVisibleRowData = () => {
    const visibleRows = [];
    rowData.forEach((row) => {
      if (row.summary) {
        if (row.tally > 1) {
          visibleRows.push(row);
        }
      } else if (expandedGroups[row.group]) {
        visibleRows.push(row); // Show non-summary rows if the group is expanded
      }
    });
    return visibleRows;
  };

  // Define columns with a custom renderer for the summary rows
  const columnDefs = [
    { field: 'pop', headerName: 'Study',
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'conseq', headerName: 'VEP consequence',
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'status', headerName: 'Allele status',
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'accession', headerName: 'Order Germplasm',
      cellRenderer: (params) => {
        if (params.value) {
          return <AccessionLink germplasm={params.value.germplasm} gene_id={gene_id} />;
        }
        if (params.data.summary) {
          return (
            <span
              onClick={() => toggleGroup(params.data.group)}
            >
              {params.data.tally} Accessions {expandedGroups[params.data.group] ? '▼' : '▶'}
            </span>
          );
        }
        return null;
      }
    },
    { field: 'search', headerName: 'All LOF Genes',
      cellRenderer: (params) => {
        if (params.data.accession) {
          const currentURL = new URL(window.location.href);
          const accession = params.data.accession;
          currentURL.search = '';
          currentURL.searchParams.set('category', 'Germplasm');
          currentURL.searchParams.set('fq_field', `VEP__merged__${accession.pop.type}__attr_ss`);
          currentURL.searchParams.set('fq_value', accession.germplasm.ens_id);
          currentURL.searchParams.set('name', accession.germplasm.ens_id);

          return <Button size='sm' href={currentURL.toString()}>Search</Button>

        }
        return null;
      }
    }
  ];

  const defaultColDef = {
    sortable: false,
    cellStyle: (params) => {
      // if (!params.data.summary) {
      //   return {paddingLeft: '30px'};
      // }
      if (params.data.summary) {
        return {cursor: 'pointer'};
      }
      return null;
    }
  };

  const nVisible = getVisibleRowData().length;
  const tableHeight = 50 + Math.min(nVisible, 10) * 42;
  return (
    <div
      className="ag-theme-quartz"
      style={{ height: tableHeight, width: "100%" }}
    >
      <AgGridReact
        rowData={getVisibleRowData()}
        columnDefs={columnDefs}
        getRowNodeId={(data) => data.id}
        animateRows={true}
        defaultColDef={defaultColDef}
      />
    </div>
  );
};

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  if (props.grameneConsequences && props.grameneConsequences[gene._id] && props.grameneGermplasm) {
    const groups = group_germplasm(gene, props.grameneGermplasm, props.grameneConsequences[gene._id]);

    return <div>
      <h5>Predicted loss-of-function alleles were detected in these germplasm.</h5>
      <div >Explore other variants within this gene in the <a target="_blank"
         href={`${props.configuration.ensemblURL}/${gene.system_name}/Gene/Variation_Gene/Image?db=core;g=${props.searchResult.id}`}>
        Variant image</a> page in the Ensembl genome browser.</div>
      <GridWithGroups groups={...groups} gene_id={gene._id}/>
      {/*<div className="ag-theme-quartz" style={{height: `${rowHeight * (rows2show + 1)}px`}}>*/}
      {/*  /!*<AgGridReact rowHeight={rowHeight} rowData={rowData} columnDefs={tableFields} defaultColDef={defaultColDef}/>*!/*/}
      {/*</div>*/}
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

