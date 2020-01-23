import {connect} from 'redux-bundler-react'
import React from 'react'

const Suggestions = ({grameneSuggestions, doAcceptGrameneSuggestion}) => {
  return (
    <div>
      {grameneSuggestions
        && grameneSuggestions.grouped
        && grameneSuggestions.grouped.category
        && grameneSuggestions.grouped.category.groups
        && grameneSuggestions.grouped.category.groups.map((g,idx) => {
        return <div key={idx}>
          <h4 className="mt10">{g.groupValue}</h4>
          {g.doclist.docs.map((sugg,jdx) =>
            <button className='btn btn-outline-primary mb5 btn-rounded suggestion-button'
                    id={`${idx}-${jdx}`}
                    key={jdx}
                    onClick={() => doAcceptGrameneSuggestion(sugg)}>
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
  'doAcceptGrameneSuggestion',
  Suggestions
);
