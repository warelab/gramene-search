import React from 'react'
import ReactGA from 'react-ga'
import { connect } from 'redux-bundler-react'
import './genes.css'
import Expression from './details/Expression'
import Homology from './details/Homology'
import Location from './details/Location'
import Pathways from "./details/Pathways"
import Xrefs from "./details/Xrefs"

let external = <small title="This link opens a page from an external site"> <i className="fa fa-external-link"/></small>;

let inventory = {
  location: Location,
  expression: Expression,
  homology: Homology,
  pathways: Pathways,
  xrefs: Xrefs
};

class Gene extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      details: [
        {
          id: 'location',
          label: 'Location',
          available: false
        },
        {
          id: 'expression',
          label: 'Expression',
          available: false
        },
        {
          id: 'homology',
          label: 'Homology',
          available: false
        },
        {
          id: 'pathways',
          label: 'Pathways',
          available: false
        },
        {
          id: 'xrefs',
          label: 'Xrefs',
          available: false
        },
        {
          id: 'pubs',
          label: 'Publications',
          available: false
        }
      ],
      expandedDetail: null
    };
    let hasData = {};
    props.searchResult.capabilities.forEach(c => hasData[c]=true);
    this.state.details.forEach(d => d.available = hasData.hasOwnProperty(d.id));
  }
  getDetailStatus(d) {
    if (this.state.expandedDetail === d.id) return 'expanded';
    return d.available ? 'closed' : 'disabled';
  }
  setExpanded(d) {
    if (d.available) {
      if (this.state.expandedDetail === d.id) {
        this.setState({expandedDetail: null})
      }
      else {
        this.setState({expandedDetail: d.id})
      }
    }
  }
  ensureGene(id) {
    if (!(this.props.geneDocs && this.props.geneDocs.hasOwnProperty(id))) {
      this.props.requestGene(id);
    }
  }
  render() {
    const ensemblURL = this.props.ensemblURL;
    const searchResult = this.props.searchResult;
    const taxName = this.props.taxName;
    return (
      <div className="result-gene" onMouseOver={()=>this.ensureGene(searchResult.id)}>
        <div className="result-gene-summary">
          <h3 className="gene-title">
            <span className="gene-name">{searchResult.name} </span>
            <wbr/>
            <small className="gene-id">{searchResult.id === searchResult.name ? '' : searchResult.id} </small>
            <small className="gene-synonyms">{searchResult.synonyms && searchResult.synonyms.join(', ') || ''}</small>
            <small className="gene-species">
              <ReactGA.OutboundLink
                eventLabel={searchResult.system_name}
                to={`//${ensemblURL}/${searchResult.system_name}/Info/Index`}
                className="external-link"
              >
                {taxName}{external}
              </ReactGA.OutboundLink>
            </small>
          </h3>
          <p className="gene-description">{searchResult.description}</p>
        </div>
        <div className="gene-detail-tabs">
          {this.state.details.map((d,idx) => (
            <div key={idx}
                 className={`col-md-1 text-center gene-detail-tab-${this.getDetailStatus(d)}`}
                 onClick={()=>this.setExpanded(d)}
            >{d.label}</div>
          ))}
        </div>
        {this.state.expandedDetail && <div className="visible-detail">{React.createElement(inventory[this.state.expandedDetail], this.props)}</div>}
      </div>
    )
  }
}

const GeneList = props => {
  if (props.grameneSearch && props.grameneSearch.response && props.grameneTaxonomy) {
    let prev,page,next;
    if (props.grameneSearch.response.numFound > props.grameneSearchRows) {
      const pageNum = props.grameneSearchOffset/props.grameneSearchRows;
      page = <b>{pageNum + 1}</b>;
      if (pageNum > 0) {
        prev = <button onClick={()=>props.doRequestResultsPage(pageNum - 1)}>prev</button>
      }
      if (props.grameneSearch.response.numFound > props.grameneSearchOffset + props.grameneSearchRows) {
        next = <button onClick={()=>props.doRequestResultsPage(pageNum + 1)}>next</button>
      }
    }
    return <div>
      {prev}{page}{next}
      {props.grameneSearch.response.docs.map((g,idx) => (
        <Gene key={idx}
              searchResult={g}
              ensemblURL={props.ensemblURL}
              taxName={props.grameneTaxonomy[g.taxon_id].name}
              geneDocs={props.grameneGenes}
              requestGene={props.doRequestGrameneGene}
        />
      ))}
      {prev}{page}{next}
    </div>
  }
  return null;
};

export default connect(
  'selectEnsemblURL',
  'selectGrameneSearch',
  'selectGrameneTaxonomy',
  'selectGrameneGenes',
  'selectGrameneSearchOffset',
  'selectGrameneSearchRows',
  'doRequestGrameneGene',
  'doRequestResultsPage',
  GeneList);
