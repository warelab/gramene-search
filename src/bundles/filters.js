import {createAsyncResourceBundle, createSelector} from "redux-bundler";
import _ from 'lodash';
/*
{
  operation: AND|OR,
  children: [],
  negate: true|false,
  suggestion: {
    fq_field:
    fq_value:
    name:
    category:
  }
}

AND OR  taxonomy
AND OR   maize
AND OR   sorghum
AND OR   rice
AND OR   arabidopsis
AND AND domain
AND AND  NB-ARC
AND AND  NOT IPR123456
*/
const grameneFilters = {
  name: 'grameneFilters',
  getReducer: () => {
    const initialState = {
      status: 'init',
      operation: 'AND',
      negate: false,
      children: []
    };
    return (state = initialState, {type, payload}) => {
      if (type === 'GRAMENE_FILTER_ADDED') {
        if (state.status === 'ready') {
          let newState = Object.assign({}, state, {status: 'search'});
          newState.children.push(_.pick(payload,['fq_field','fq_value','name','category']));
          return newState;
        }
      }
      if (type === 'GRAMENE_FILTERS_REPLACED') {
        payload.status = 'search';
        return payload;
      }
      if (type === 'GRAMENE_FILTERS_STATUS_CHANGED') {
        if (!(state.status === 'ready' && payload === 'waiting2')) {
          return Object.assign({}, state, {status: payload})
        }
      }
      return state
    }
  },
  selectGrameneFilters: state => {
    return state.grameneFilters
  },
  selectGrameneFiltersStatus: state => state.grameneFilters.status,
  selectGrameneFiltersQueryString: state => {
    const hasSpaces = new RegExp(/\s/);
    function getQuery(node) {
      const negate = node.negate ? 'NOT ' : '';
      if (node.hasOwnProperty('children')) {
        // do some recursion
        return `${negate}(${node.children.map(c => getQuery(c)).join(` ${node.operation} `)})`
      }
      else {
        // this node is a suggestion
        if (hasSpaces.test(node.fq_value))
          return `${negate}${node.fq_field}:"${node.fq_value}"`;
        else
          return `${negate}${node.fq_field}:${node.fq_value}`;
      }
    }
    return `*:* AND (${getQuery(state.grameneFilters)})`;
  }
};

grameneFilters.reactGrameneFilters = createSelector(
  'selectQueryObject',
  'selectGrameneFilters',
  'selectUrlObject',
  (queryObject, filters, myUrl) => {
    if (filters.status === 'init') {
      if (queryObject.filters) {
        const newFilters = JSON.parse(queryObject.filters);
        return {type: 'GRAMENE_FILTERS_REPLACED', payload: newFilters};
      }
      if (queryObject.hasOwnProperty('suggestion')) {
        return {type: 'GRAMENE_FILTER_ADDED', payload: JSON.parse(queryObject.suggestion)};
      }
      return {type: 'GRAMENE_FILTERS_STATUS_CHANGED', payload: 'ready'}
    }
    if (filters.status === 'waiting') {
      const url = new URL(myUrl.href);
      url.search = `filters=${JSON.stringify(Object.assign({}, filters, {status: 'init'}))}`;
      return {type: 'BATCH_ACTIONS', actions: [
          {type: 'GRAMENE_FILTERS_STATUS_CHANGED', payload: 'waiting2'},
          {type: 'URL_UPDATED', payload: {url: url.href}}
        ]};
    }
  }
);

export default grameneFilters;