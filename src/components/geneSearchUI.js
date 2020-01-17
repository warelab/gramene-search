import React from 'react'
import { connect } from 'redux-bundler-react'

const StatusCmp = props => (
  <h1>status</h1>
);

const Status = connect(
  'selectGrameneFilters',
  StatusCmp
);

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

export {Status, Filters, Results, Views};