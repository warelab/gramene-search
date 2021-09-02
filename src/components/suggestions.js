import {connect} from 'redux-bundler-react'
import React from 'react'
import { Button, Badge } from 'react-bootstrap'
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
  return (
    <div>
      {suggestions
        && suggestions.grouped
        && suggestions.grouped.category
        && suggestions.grouped.category.groups
        && suggestions.grouped.category.groups.map((g,idx) => {
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
              <Badge variant="secondary">{sugg.num_genes}</Badge>
            </Button>
          )}
        </div>
      })}
    </div>
  );
};

export default connect(
  'selectGrameneSuggestions',
  'selectSuggestionsQuery',
  'doAcceptSuggestion',
  'doAcceptGrameneSuggestion',
  Suggestions
);
