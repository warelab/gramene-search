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
  <h1>results go here</h1>
);

const Results = connect(
  ResultsCmp
);

const ViewsCmp = props => (
  <h1>view options</h1>
);

const Views = connect(
  ViewsCmp
);

export {Filters, Results, Views};