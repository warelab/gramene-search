import {connect} from 'redux-bundler-react'
import React from 'react'
import ReactGA from 'react-ga4'
import { Button, Badge, Alert } from 'react-bootstrap'
import './styles.css'

function showMatches(text, x) {
  let re = new RegExp(`(${x})`, 'ig');
  let match = text.split(re);
  return <span>
    {match.map((str, idx) => {
      if (idx % 2 === 1) {
        return <span key={idx} style={{fontWeight:'bolder'}}>{str}</span>
      }
      return <span key={idx}>{str}</span>
    })}
  </span>
}

function logAction(sugg) {
  ReactGA.event({
    category: 'Search',
    action: 'SetFilter',
    label: sugg.name
  })
}
// The species label under a suggestion. Returns '' rather than throwing when the
// taxonomy can't explain a taxon: this runs during render, so anything thrown here
// takes down the whole suggestions panel and the search box looks broken.
//
// That is not hypothetical. `grameneTaxonomy` is persisted with a 24h staleAfter, so
// after a data release adds genomes — v11 added 4558118/4558119/4558120 — every
// browser still holding the previous release's taxonomy has suggestions referencing
// taxa it has never heard of. Broad queries ("kinase", "sb") hit all three.
function getLowestCommonAncestorName(tids, taxonomy) {
  if (!Array.isArray(tids) || !taxonomy) return '';
  let lca;
  tids.forEach(tid => {
    const node = taxonomy[tid];
    if (!node || !Array.isArray(node.ancestors)) return; // unknown taxon: ignore it
    if (!lca) {
      lca = [...node.ancestors];
    } else {
      let ancestors = new Set(node.ancestors);
      // `lca.length &&` matters: with no ancestor in common this shifted an empty
      // array forever, since ancestors.has(undefined) is never true.
      while (lca.length && !ancestors.has(lca[0])) {
        lca.shift();
      }
    }
  });
  if (!lca || !lca.length) return '';
  const root = taxonomy[lca[0]];
  return root ? root.short_name : '';
}

const TryPan = (props) => {
  const query = props.query;
  const pan = props.pan;
  return <div className="suggestion-panlink">
    <a target="_blank" href={pan.url + "?suggestion=" + query}>
      <img src={pan.svg} title={`Search at ${pan.name}`}/>
    </a>
  </div>;
};

const TryAnotherSite = props => {
  const query = props.query;
  const config = props.config;
  let sites = Object.keys(config.panSite);
  return <div>
    <Alert variant={'info'}>Don't see what you're looking for? Search for <b>{query}</b> on one of our sister sites</Alert>
    {sites.map((p, idx) => <TryPan key={idx} query={query} pan={config.panSite[p]}/>)}
  </div>
}

const Suggestions = props => {
  let suggestions = props.grameneSuggestions;
  if (suggestions && suggestions.grouped) {
    if (suggestions.grouped.category.matches === 0) {
      let sugg1 = {
        fq_field: 'text',
        fq_value: props.suggestionsQuery,
        name: `Genes containing "${props.suggestionsQuery}"`,
        category: 'Gene',
      };
      let sugg2 = {
        fq_field: 'text',
        fq_value: `${props.suggestionsQuery}*`,
        name: `Genes matching "${props.suggestionsQuery}*"`,
        category: 'Gene',
      };
      return (
        <div style={{margin: '10px', maxWidth: '820px'}}>
          <Alert variant={'info'}><em>No suggestions found.</em> You may still attempt a full text search, though it is unlikely to find any genes for you.</Alert>
          <Button id={'word'}
                  size={'sm'}
                  variant={'outline-secondary'}
                  onClick={() => {logAction(sugg1); props.doAcceptSuggestion(sugg1); props.doAcceptGrameneSuggestion(sugg1)}}>
            {`All genes that contain the word "${props.suggestionsQuery}"`}
          </Button>
          <Button id={'word'}
                  size={'sm'}
                  variant={'outline-secondary'}
                  onClick={() => {logAction(sugg2); props.doAcceptSuggestion(sugg2); props.doAcceptGrameneSuggestion(sugg2)}}>
            {`All genes that contain a word that starts with "${props.suggestionsQuery}"`}
          </Button>
          <TryAnotherSite query={props.suggestionsQuery} config={props.configuration}/>
        </div>
      );
    }
    else {
      return (
        <div style={{margin: '10px'}}>
          {suggestions.grouped.category.groups.map((g,idx) => {
              return <div key={idx} id='gramene-suggestion'>
                <h4 className="mt10">{g.groupValue}</h4>
                {g.doclist.docs.map((sugg,jdx) =>
                  <Button id={`${idx}-${jdx}`}
                          key={jdx}
                          disabled={sugg.num_genes === 0}
                          size='sm'
                          variant="outline-secondary"
                          onClick={() => {logAction(sugg); props.doAcceptSuggestion(sugg); props.doAcceptGrameneSuggestion(sugg)}}>
                    {showMatches(sugg.display_name,props.suggestionsQuery)}{' '}
                    <Badge bg="secondary">{sugg.num_genes}</Badge>
                    <i>&nbsp;{getLowestCommonAncestorName(sugg.taxon_id, props.grameneTaxonomy)}</i>
                  </Button>
                )}
              </div>
            })}
          <TryAnotherSite query={props.suggestionsQuery} config={props.configuration}/>
        </div>
      );
    }
  }
  else {
    return <div></div>
  }
}

export default connect(
  'selectGrameneSuggestions',
  'selectSuggestionsQuery',
  'selectGrameneTaxonomy',
  'selectConfiguration',
  'doAcceptSuggestion',
  'doAcceptGrameneSuggestion',
  Suggestions
);
