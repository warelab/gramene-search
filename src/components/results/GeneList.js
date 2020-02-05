import React from 'react'
import ReactGA from 'react-ga'
import { connect } from 'redux-bundler-react'
import './genes.css'

let external = <small title="This link opens a page from an external site"> <i className="fa fa-external-link"/></small>;

const Gene = ({ensemblURL,searchResult}) => (
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
          {searchResult.system_name}{external}
        </ReactGA.OutboundLink>
      </small>
    </h3>
    <p className="gene-description">{searchResult.description}</p>
  </div>
);

const GeneList = ({ensemblURL, grameneSearch}) => {
  if (grameneSearch && grameneSearch.response) {
    return <div>
      {grameneSearch.response.docs.map((g,idx) => (
        <Gene key={idx} searchResult={g} ensemblURL={ensemblURL}/>
      ))}
    </div>
  }
  return null;
};

export default connect(
  'selectEnsemblURL',
  'selectGrameneSearch',
  GeneList);
