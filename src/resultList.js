import {connect} from 'redux-bundler-react'
import React from 'react'

const Gene = ({gene}) => {
  return <div className="row">{gene.id}</div>
};

const Genes = (results, rows, doChangeQuantity) => {
  if (results && results.numFound > 0) {
    const moreButton = (results.numFound > rows)
      ? <button onClick={e => doChangeQuantity('Genes',20)}>more</button>
      : '';
    const fewerButton = (rows > 20)
      ? <button onClick={e => doChangeQuantity('Genes',-20)}>fewer</button>
      : '';
    const docsToShow = results.response.docs.slice(0,rows);
    return (
      <div id="Genes" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Genes</h4>
        </div>
        {docsToShow.map((doc,idx) => <Gene key={idx} gene={doc}/>)}
        {fewerButton}{moreButton}
      </div>
    );
  }
};

const Pathway = ({pathway}) => {
  return <div className="row">{pathway.name}</div>
};
const Pathways = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Pathways" className="container mb40 anchor">
        <div className="fancy-title">
          <h4>Pathways</h4>
        </div>
        {results.pathways.map((doc,idx) => (<Pathway key={idx} pathway={doc}/>))}
      </div>
    );
  }
};

const Domain = ({domain}) => {
  return <div className="row">{domain.id}</div>
};
const Domains = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Domains" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Domains</h4>
        </div>
        {results.domains.map((doc,idx) => (<Domain key={idx} domain={doc}/>))}
      </div>
    );
  }
};

const Taxon = ({taxon}) => {
  return <div className="row">{taxon.id}</div>
};
const Species = results => {
  if (results && results.numFound > 0) {
    return (
      <div id="Species" className="container mb40 anchor">
        <div className="fancy-title mb40">
          <h4>Species</h4>
        </div>
        {results.taxonomy.map((doc,idx) => (<Taxon key={idx} taxon={doc}/>))}
      </div>
    );
  }
};

const ResultList = ({grameneGenes, grameneDomains, gramenePathways, grameneTaxonomy, searchUI, searchUpdated, doChangeQuantity}) => {
  if (searchUI.Gramene) {
    return (
      <div id="gramene" className="row">
        <div className="fancy-title pt50">
          <h3>Gramene search results</h3>
        </div>
        {searchUI.Genes && Genes(grameneGenes, searchUI.rows.Genes, doChangeQuantity)}
        {searchUI.Domains && Domains(grameneDomains)}
        {searchUI.Pathways && Pathways(gramenePathways)}
        {searchUI.Species && Species(grameneTaxonomy)}
      </div>
    )
  }
}

export default connect(
  'selectGrameneGenes',
  'selectGrameneDomains',
  'selectGramenePathways',
  'selectGrameneTaxonomy',
  'selectSearchUI',
  'selectSearchUpdated',
  'doChangeQuantity',
  ResultList
);
