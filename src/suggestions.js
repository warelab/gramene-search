import {connect} from 'redux-bundler-react'
import React from 'react'

const Suggestions = ({grameneSuggestions, searchUI, doToggleCategory}) => {
  const matches = grameneSuggestions
    ? grameneSuggestions.grouped.category.matches
    : <img src="/static/images/dna_spinner.svg"/>;
  const status = searchUI.Gramene ? 9 : 3;
  return (
    <div>
      {grameneSuggestions && grameneSuggestions.grouped.category.groups.map((g,idx) => {
        return <div key={idx}>
          <p>{g.groupValue}</p>
          {g.doclist.docs.map((sugg,jdx) =>
            <span key={jdx}>{sugg.display_name}</span>
          )}
        </div>
      })}
    </div>
  );
};

export default connect(
  'selectGrameneSuggestions',
  'selectSearchUI',
  'selectSearchUpdated',
  'doToggleCategory',
  Suggestions
);
