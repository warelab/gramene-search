import {connect} from 'redux-bundler-preact'
import {h} from 'preact'

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
    return (
      <div id="Genes" className="container pt90">
        <div className="fancy-title">
          <h4>Genes</h4>
        </div>
        {results.response.docs.map(doc => <Gene gene={doc}/>)}
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
      <div id="Pathways" className="container pt90">
      <div className="fancy-title">
      <h4>Pathways</h4>
      </div>
    {results.pathways.map(doc => (
      <Pathway pathway={doc}/>
    ))}
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
      <div id="Domains" className="container pt90">
      <div className="fancy-title">
      <h4>Domains</h4>
      </div>
    {results.domains.map(doc => (
      <Domain domain={doc}/>
    ))}
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
      <div id="Species" className="container pt90">
      <div className="fancy-title">
      <h4>Species</h4>
      </div>
    {results.taxonomy.map(doc => (
      <Taxon taxon={doc}/>
    ))}
  </div>
  );
  }
};

const ResultList = ({grameneGenes, grameneDomains, gramenePathways, grameneTaxonomy, searchUI, searchUpdated, doChangeQuantity}) => {
  if (searchUI.Gramene) {
    return (
      <div id="gramene" class="row">
        <div class="col">
          <div>
            {searchUI.Genes && Genes(grameneGenes, searchUI.rows.Genes, doChangeQuantity)}
            {searchUI.Domains && Domains(grameneDomains)}
            {searchUI.Pathways && Pathways(gramenePathways)}
            {searchUI.Species && Species(grameneTaxonomy)}
          </div>
        </div>
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
