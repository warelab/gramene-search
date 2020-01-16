import React from 'react'
import { Provider, connect } from 'redux-bundler-react'

const FiltersCmp = props => (
  <h1>filters</h1>
);

const Filters = connect(
  'selectGrameneFilters',
  FiltersCmp
);

const ResultsCmp = props => (
  <h1>results</h1>
);

const Results = connect(
  ResultsCmp
);

export default (store) => (
  <Provider store={store}>
    <div className="row">
      <div className="col-md-2">
        <Filters/>
      </div>
      <div className="col-md-8">
        <Results/>
      </div>
      <div className="col-md-2">
        <h1>views</h1>
      </div>
    </div>
  </Provider>
)
