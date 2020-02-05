import {connect} from 'redux-bundler-react'
import React from 'react'

const Suggestions = props => {
  let suggestions = props.grameneSuggestions;
  return (
    <div>
      {suggestions
        && suggestions.grouped
        && suggestions.grouped.category
        && suggestions.grouped.category.groups
        && suggestions.grouped.category.groups.map((g,idx) => {
        return <div key={idx}>
          <h4 className="mt10">{g.groupValue}</h4>
          {g.doclist.docs.map((sugg,jdx) =>
            <button className='btn btn-outline-danger mb5 btn-rounded suggestion-button'
                    id={`${idx}-${jdx}`}
                    key={jdx}
                    onClick={() => {props.doAcceptSuggestion(sugg); props.doAcceptGrameneSuggestion(sugg)}}>
              {sugg.display_name}
              <span className="badge">{sugg.num_genes}</span>
            </button>
          )}
        </div>
      })}
    </div>
  );
};

export default connect(
  'selectGrameneSuggestions',
  'doAcceptSuggestion',
  'doAcceptGrameneSuggestion',
  Suggestions
);
