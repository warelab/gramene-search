import React from 'react'
import ReactGA from 'react-ga4'
import { connect } from 'redux-bundler-react'
import './genes.css'
import Expression from './details/Expression'
import Homology from './details/Homology'
import Location from './details/Location'
import Pathways from "./details/Pathways"
import VEP from "./details/VEP"
import Xrefs from "./details/Xrefs"
import Publications from "./details/Publications"
import Sequences from "./details/Sequences"
import {suggestionToFilters} from "../utils";
import {GrFormPrevious, GrFormNextLink, GrFormNext, GrHpe} from 'react-icons/gr'
import { Badge, OverlayTrigger, Tooltip } from 'react-bootstrap'

let external = <small title="This link opens a page from an external site"> <i className="fa fa-external-link"/></small>;

let inventory = {
  sequences: Sequences,
  location: Location,
  expression: Expression,
  homology: Homology,
  pathways: Pathways,
  VEP: VEP,
  xrefs: Xrefs,
  pubs: Publications
};

function renderTairSummary(searchResult) {
  const summary = searchResult.summary;
  if(summary && summary !== "NULL" && searchResult.system_name === "arabidopsis_thaliana") {
    return (
      <div className="gene-summary-tair">
        {trimSummary(summary)}
      </div>
    )
  }
}

function trimSummary(summary) {
  if(summary.length > 160) {
    const start = summary.substr(0, 150);
    const rest = summary.substr(150);
    return <p>{start}<span className="ellipsis">…</span><span className="rest">{rest}</span></p>
  }
  else {
    return <p>{summary}</p>
  }
}
const PanLink = (props) => {
  const gene = props.gene;
  const pan = props.pan;
  return <div className="gene-panlink">
    <a target="_blank" href={pan.url + gene.id}>
      <img src={pan.svg} title={`View this gene at ${pan.name}`}/>
    </a>
  </div>;
};

const ClosestOrthologCmp = (props) =>
{
  let id, taxon_id, name, desc, species, className, identity;
  const gene = props.gene;

  if (gene.closest_rep_id) {
    name = gene.closest_rep_name || gene.closest_rep_id;
    desc = gene.closest_rep_description;
    species = gene.closest_rep_species_name;
    id = gene.closest_rep_id;
    taxon_id = gene.closest_rep_taxon_id;
    className = "closest-ortholog";
    identity = gene.closest_rep_identity || 0;
  }
  else if (gene.model_rep_id) {
    name = gene.model_rep_name || gene.model_rep_id;
    desc = gene.model_rep_description;
    species = gene.model_rep_species_name;
    id = gene.model_rep_id;
    taxon_id = gene.model_rep_taxon_id;
    className = "model-ortholog";
    identity = gene.model_rep_identity || 0;
  }
  var isZm = new RegExp(/^Zm00001e/);
  if (isZm.test(desc)) {
    desc='';
  }

  return (
    <div className={className} onClick={() => {
      props.doEnsureGrameneGenome(taxon_id);
      props.doReplaceGrameneFilters(suggestionToFilters({
        category: 'Gene',
        fq_field: 'id',
        fq_value: id,
        name: name
      }))
    }}>
      <div className="gene-species">{species}</div>
      {identity > 0 && <div className="rep-identity">{Math.round(identity*100)}</div>}
      <h3 className="gene-id">{name}</h3>
      <p>{desc}</p>
    </div>
  );
};

const ClosestOrtholog = connect(
  'doReplaceGrameneFilters','doEnsureGrameneGenome',
  ClosestOrthologCmp
);

function renderClosestOrtholog(gene) {

  if (shouldShowClosestOrtholog(gene)) {

    // we used to not add the closest ortholog to the DOM if the homology detail was visible.
    // however, that could cause the height of the result to change. Instead we set visibility:hidden
    // so that the renderer takes into account the height of the ortholog even if not shown.
    return (
      <ClosestOrtholog gene={gene}/>
    );
  }
}

// show closest ortholog prominently if we have data to show:-
//   a. either there's a closest ortholog (determined by traversing the gene tree until an id or description looks
// curated) b. or there's a model ortholog (traverse tree to find an ortholog in arabidopsis)
function shouldShowClosestOrtholog(searchResult) {
  return (
    searchResult.closest_rep_id || (
      searchResult.model_rep_id &&
      searchResult.model_rep_id !== searchResult.id
    )
  );
}

class Gene extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      details: [
        {
          id: 'sequences',
          label: 'Sequences',
          popup: 'Gene/cDNA/protein fasta',
          available: true
        },
        {
          id: 'location',
          label: 'Location',
          popup: 'Genome Browser',
          available: false
        },
        {
          id: 'expression',
          label: 'Expression',
          popup: 'Gene Expression Atlas',
          available: false
        },
        {
          id: 'homology',
          label: 'Homology',
          popup: 'Gene Family Tree',
          available: false
        },
        {
          id: 'pathways',
          label: 'Pathways',
          popup: 'Plant Reactome Pathways',
          available: false
        },
        {
          id: 'pubs',
          label: 'Papers',
          popup: 'Curated Publications',
          available: false
        },
        {
          id: 'VEP',
          label: 'Germplasm',
          popup: 'Germplasm with protein truncating variants (PTVs)',
          available: false
        },
        {
          id: 'xrefs',
          label: 'Xrefs',
          popup: 'Database Cross-references',
          available: false
        }
      ],
      expandedDetail: props.expandedDetail
    };
    let hasData = {};
    props.searchResult.capabilities.forEach(c => hasData[c]=true);
    this.state.details.forEach(d => d.available |= hasData.hasOwnProperty(d.id));
  }
  getDetailStatus(d) {
    if (this.state.expandedDetail === d.id) return 'expanded';
    if (d.available) return 'closed'
    return d.id === "pubs" ? 'empty' : 'disabled';
  }
  setExpanded(d) {
    if (d.available || d.id === "pubs") {
      if (this.state.expandedDetail === d.id) {
        this.setState({expandedDetail: null})
      }
      else {
        const geneId = this.props.searchResult.id;
        if (!(this.props.geneDocs && this.props.geneDocs.hasOwnProperty(geneId))) {
          this.props.requestGene(geneId)
        }
        ReactGA.event({
          category: 'Search',
          action: 'Details',
          label: d.label
        });
        this.setState({expandedDetail: d.id})
      }
    }
  }
  ensureGene(id) {
    if (!(this.props.geneDocs && this.props.geneDocs.hasOwnProperty(id))) {
      this.props.requestGene(id);
      return false;
    }
    return this.props.geneDocs[id].hasOwnProperty('taxon_id')
  }
  renderMetadata() {
    let gene = this.props.searchResult;
    if (gene.model_rep_taxon_id) {
      gene.model_rep_species_name = this.props.taxLut[gene.model_rep_taxon_id].short_name;
    }
    if (gene.closest_rep_taxon_id) {
      gene.closest_rep_species_name = this.props.taxLut[gene.closest_rep_taxon_id].short_name;
    }
    return renderTairSummary(gene) || renderClosestOrtholog(gene);
  }
  render() {
    const panSite = this.props.panSite;
    const searchResult = this.props.searchResult;
    const taxName = this.props.taxName;
    // let orthologs='';
    // if (this.props.orthologs && this.props.orthologs.hasOwnProperty(searchResult.id)) {
    //   orthologs = this.props.orthologs[searchResult.id].join(', ');
    // }
    const numWordsInDescription = searchResult.description.split(' ').length;
    return (
      <div className="result-gene">
        <div className="result-gene-summary">
          <div className="result-gene-title-body">
            {panSite.hasOwnProperty(searchResult.system_name) && <PanLink pan={panSite[searchResult.system_name]} gene={searchResult}/>}
            <div className="gene-title">
              <div className="gene-species">{taxName}</div>
              <h3 className="gene-name">{searchResult.name}
                {searchResult.id !== searchResult.name && <small className="gene-id">&nbsp;{searchResult.id}</small>}
              </h3>
            </div>
            {searchResult.synonyms && <small className="gene-synonyms">{searchResult.synonyms.join(', ')}</small>}
            {numWordsInDescription > 1 && <p className="gene-description">{searchResult.description}</p>}
          </div>
          {this.renderMetadata()}
        </div>
        <div className="gene-detail-tabs">
          {this.state.details.map((d,idx) => (
            <OverlayTrigger
              key={idx}
              placement={'bottom'}
              overlay={
                <Tooltip id={`tooltip`}>{d.popup}</Tooltip>
              }
            >
              <div key={idx}
                 className={`col-md-1 text-center gene-detail-tab-${this.getDetailStatus(d)}`}
                 onClick={()=>this.setExpanded(d)}
              >{d.label}</div>
            </OverlayTrigger>
          ))}
        </div>
        {this.state.expandedDetail && this.ensureGene(searchResult.id) && <div className="visible-detail">{React.createElement(inventory[this.state.expandedDetail], this.props)}</div>}
      </div>
    )
  }
}

const GeneList = props => {
  if (props.grameneSearch && props.grameneSearch.response && props.grameneTaxonomy) {
    let prev,page,next;
    const numFound = props.grameneSearch.response.numFound;
    if (numFound > props.grameneSearchRows) {
      const pageNum = props.grameneSearchOffset/props.grameneSearchRows;
      page = <span style={{padding:'10px'}}>page <b>{pageNum + 1}</b> of <b>{Math.ceil(numFound/props.grameneSearchRows)}</b></span>;
      prev = <GrHpe/>;
      if (pageNum > 0) {
        prev = <Badge onClick={()=>props.doRequestResultsPage(pageNum - 1)}><GrFormPrevious/></Badge>
      }
      next = <GrHpe/>;
      if (numFound > props.grameneSearchOffset + props.grameneSearchRows) {
        next = <Badge onClick={()=>props.doRequestResultsPage(pageNum + 1)}><GrFormNext/></Badge>
      }
    }
    return <div>
      <div>{prev}{page}{next}</div>
      {props.grameneSearch.response.docs.map((g,idx) => (
        <Gene key={idx}
              searchResult={g}
              ensemblURL={props.configuration.ensemblURL}
              ensemblRest={props.configuration.ensemblRest}
              panSite={props.configuration.panSite}
              taxName={props.grameneTaxonomy[g.taxon_id].name}
              geneDocs={props.grameneGenes}
              requestGene={props.doRequestGrameneGene}
              requestOrthologs={props.doRequestOrthologs}
              orthologs={props.grameneOrthologs}
              taxLut={props.grameneTaxonomy}
              expandedDetail={props.grameneSearch.response.numFound === 1 && g.can_show.homology ? 'homology' : null}
        />
      ))}
      {prev}{page}{next}
    </div>
  }
  return null;
};

export default connect(
  'selectConfiguration',
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectGrameneGenes',
  'selectGrameneOrthologs',
  'selectGrameneSearchOffset',
  'selectGrameneSearchRows',
  'doRequestGrameneGene',
  'doRequestOrthologs',
  'doRequestResultsPage',
  GeneList);
