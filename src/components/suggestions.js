import {connect} from 'redux-bundler-react'
import React from 'react'
import { Button, Badge, Alert } from 'react-bootstrap'
import './styles.css'

function showMatches(text, x) {
  let re = new RegExp(`(${x})`, 'ig');
  let match = text.split(re);
  console.log('showMatches',text, x, match);
  return <span>
    {match.map((str, idx) => {
      if (idx % 2 === 1) {
        return <span key={idx} style={{fontWeight:'bolder'}}>{str}</span>
      }
      return <span key={idx}>{str}</span>
    })}
  </span>
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
                  onClick={() => {props.doAcceptSuggestion(sugg1); props.doAcceptGrameneSuggestion(sugg1)}}>
            {`All genes that contain the word "${props.suggestionsQuery}"`}
          </Button>
          <Button id={'word'}
                  size={'sm'}
                  variant={'outline-secondary'}
                  onClick={() => {props.doAcceptSuggestion(sugg2); props.doAcceptGrameneSuggestion(sugg2)}}>
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
                          onClick={() => {props.doAcceptSuggestion(sugg); props.doAcceptGrameneSuggestion(sugg)}}>
                    {showMatches(sugg.display_name,props.suggestionsQuery)}{' '}
                    <Badge bg="secondary">{sugg.num_genes}</Badge>
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
  'doAcceptSuggestion',
  'doAcceptGrameneSuggestion',
  Suggestions
);
