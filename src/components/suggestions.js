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
function getLowestCommonAncestorName(tids, taxonomy) {
  let lca;
  tids.forEach(tid => {
    if (!lca) {
      lca = [...taxonomy[tid].ancestors];
    } else {
      let ancestors = new Set(taxonomy[tid].ancestors);
      while (!ancestors.has(lca[0])) {
        lca.shift();
      }
    }
  });
  return taxonomy[lca[0]].short_name;
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
  'doAcceptSuggestion',
  'doAcceptGrameneSuggestion',
  Suggestions
);
