import React, {useState, useEffect, useRef, useCallback} from 'react';
import {connect} from "redux-bundler-react";
import {Button} from 'react-bootstrap';
import { AgGridReact } from "ag-grid-react";
import _ from 'lodash';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import '@fortawesome/fontawesome-free/css/all.min.css';
import "./VEP.css";
import { study_info } from '../../../vepStudyInfo';

const ggURL = {
  xIRRI: 'https://gringlobal.irri.org/gringlobal/accessiondetail?id=',
  IRRI: 'https://www.irri.org/genesys-rice#/a/',
  ARS: 'https://npgsweb.ars-grin.gov/gringlobal/accessiondetail.aspx?id=',
  ICRISAT: 'https://genebank.icrisat.org/IND/PassportSummary?ID=',
  sorbmutdb: 'https://www.depts.ttu.edu/igcast/sorbmutdb.php',
  maizeGDB: 'https://wgs.maizegdb.org/',
  NCBI: 'https://www.ncbi.nlm.nih.gov/biosample/?term='
};

const rice_studies = {'1': {label: 'Rice 3K', type: 'NAT'}};
const AccessionLink = ({germplasm, gene_id}) => {
  const genebank = germplasm.stock_center;
  const url = ggURL[genebank];
  if (germplasm.germplasm_dbid) { // link to stock center
    const germ_id = germplasm.germplasm_dbid;
    if (germ_id && url && germ_id !== "0") {
      return <a target="_blank" href={`${url}${germ_id}`}>
        {germplasm.pub_id} ({genebank})</a>;
    }
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
  if (germplasm.pop_id === '15' && germplasm.stock_center === 'NOT FOUND') {
    return <a target="_blank" href={ggURL['maizeGDB']}>{germplasm.pub_id} (SNPVersity)</a>
  }
  return <span>{germplasm.pub_id}</span>
}
function compareGermplasm(a, b) {
  const aSub = a?.germplasm?.subpop ?? '';
  const bSub = b?.germplasm?.subpop ?? '';
  const subCmp = aSub.localeCompare(bSub, 'en', { sensitivity: 'accent' });
  if (subCmp !== 0) return subCmp;

  const aPub = a?.germplasm?.pub_id ?? '';
  const bPub = b?.germplasm?.pub_id ?? '';
  return aPub.localeCompare(bPub, 'en', { sensitivity: 'accent' });
}
function group_germplasm(gene, germplasmLUT, vep_obj) {
  let accessionTable = [];
  let missingMetadata = 0;
  Object.entries(vep_obj).forEach(([key,accessions]) => {
    const parts = key.split("__");
    if (parts[0] === "VEP") {
      if (parts[1] !== "merged") {
        const studyForSystem = study_info[parts[3]];
        const pop = (studyForSystem && studyForSystem[parts[4]]) || {
          label: `${parts[3]}/${parts[4]}`,
          type: parts[4]
        };
        const conseq = parts[1].replaceAll("_"," ");
        const status = parts[2] === "het" ? "heterozygous" : "homozygous";
        accessions.forEach(ens_id => {
          let germplasm;
          if (germplasmLUT && germplasmLUT.hasOwnProperty(ens_id)) {
            germplasm = germplasmLUT[ens_id][0];
          } else {
            // Fall back to a minimal record so the row is still rendered with
            // whatever info we have from the VEP fields alone.
            missingMetadata++;
            germplasm = {
              ens_id: ens_id,
              pub_id: ens_id,
              subpop: '?',
              stock_center: null,
              germplasm_dbid: null,
              pop_id: null
            };
          }
          accessionTable.push({
            key: [pop.label,conseq,status].join('%%%'),
            germplasm: germplasm,
            pop: pop
          });
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
    groups[group].sort(compareGermplasm).forEach(acc => {
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
  grouped.missingMetadata = missingMetadata;
  grouped.totalAccessions = accessionTable.length;
  return grouped;
}
const THRESHOLD = 5;
const GridWithGroups = ({groups,gene_id,doGrin}) => {
  const [rowData, setRowData] = useState(groups);

  const initialExpanded = {};
  rowData.forEach((row) => {
    if (row.summary) {
      initialExpanded[row.group] = (row.tally < THRESHOLD);
    }
  });
  const [expandedGroups, setExpandedGroups] = useState(initialExpanded);


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
    { field: 'pop', headerName: 'Study/Population', flex: 1, minWidth: 120,
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'conseq', headerName: 'VEP consequence', flex: 1, minWidth: 130,
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'status', headerName: 'Allele status', flex: 1, minWidth: 100,
      cellRenderer: (params) => {
        if (params.data.summary || params.data.tally === 1) {
          return params.value;
        }
        return null;
      }
    },
    { field: 'accession', headerName: doGrin ? 'Order Germplasm' : 'Accession', flex: 1, minWidth: 140,
      headerComponent: (props) => {
        return (
          <div style={{display: 'flex', alignItems: 'center'}}>
            {doGrin && <i className="fas fa-shopping-cart">&nbsp;</i>}
            <span>{props.displayName}</span>
          </div>
        );
      }, // Use the custom header with the shopping cart icon
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
    { field: 'synonym', headerName: 'Synonym', filter:false, sortable:false, flex: 1, minWidth: 110, cellRenderer: (params) => {
      if (params.data.accession) {
        return params.data.accession.germplasm.ens_id
      }
      return null;
    }},
    { field: 'subpop', headerName: 'Subpopulation', filter:false, sortable: false, flex: 1, minWidth: 110, cellRenderer: (params) => {
      if (params.data.accession && params.data.accession.germplasm.subpop && params.data.accession.germplasm.subpop !== "?") {
        return params.data.accession.germplasm.subpop
      }
      return null;
      }},
    { field: 'search', headerName: 'All LOF Genes', sortable:false, filter:false, flex: 1, minWidth: 100,
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
    sortable: true,
    filter: "agTextColumnFilter",
    cellStyle: (params) => {
      if (params.data.summary) {
        return {cursor: 'pointer'};
      }
      return null;
    }
  };

  const nVisible = getVisibleRowData().length;
  const tableHeight = 50 + Math.min(nVisible, 10) * 42;
  return (
    <div style={{ overflowX: "auto", width: "100%", maxWidth: "1200px" }}>
      <div
        className="ag-theme-quartz"
        style={{ height: tableHeight, minWidth: "810px", width: "100%" }}
      >
        <AgGridReact
          rowData={getVisibleRowData()}
          columnDefs={columnDefs}
          getRowNodeId={(data) => data.id}
          animateRows={true}
          defaultColDef={defaultColDef}
        />
      </div>
    </div>
  );
};

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  const haveConsequences = props.grameneConsequences && props.grameneConsequences[gene._id];
  useEffect(() => {
    if (!haveConsequences) {
      props.doRequestVEP(gene._id);
    }
  }, [gene._id, haveConsequences]);

  if (!haveConsequences) {
    return <pre>loading</pre>;
  }

  // Render even if grameneGermplasm hasn't loaded — we'll fall back to
  // VEP-only rows so the user sees something instead of a silent empty table.
  const germplasmLUT = props.grameneGermplasm || {};
  const groups = group_germplasm(gene, germplasmLUT, props.grameneConsequences[gene._id]);
  const { missingMetadata, totalAccessions } = groups;

  let notice = null;
  if (totalAccessions === 0) {
    notice = <div className="alert alert-warning" style={{padding: '8px', marginTop: '8px'}}>
      VEP results were found for this gene but could not be grouped into accession-level rows.
    </div>;
  } else if (missingMetadata > 0) {
    notice = <div className="alert alert-info" style={{padding: '8px', marginTop: '8px'}}>
      Germplasm metadata could not be found for {missingMetadata} of {totalAccessions} accession{totalAccessions === 1 ? '' : 's'}.
      Affected rows show the raw accession id without stock-center links or subpopulation info.
    </div>;
  }

  return <div>
    <h5>Predicted loss-of-function alleles were detected in these germplasm.</h5>
    <div>Explore other variants within this gene in the <a target="_blank"
       href={`${props.configuration.ensemblURL}/${gene.system_name}/Gene/Variation_Gene/Image?db=core;g=${props.searchResult.id}`}>
      Variant image</a> page in the Ensembl genome browser.</div>
    {notice}
    {totalAccessions > 0 && (
      <GridWithGroups groups={groups} gene_id={gene._id} doGrin={!props.configuration.hasOwnProperty('noGRIN')}/>
    )}
  </div>
};

export default connect(
  'selectConfiguration',
  'selectGrameneConsequences',
  'selectGrameneGermplasm',
  'doRequestVEP',
  Detail
);

