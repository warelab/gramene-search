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
      status: 'empty'
    };
    return (state = initialState, {type, payload}) => {
      if (type === 'GRAMENE_FILTER_ADDED') {
        if (state.status === 'empty') {
          return {
            status: 'new',
            suggestion: payload
          }
        }
        else {
          return {
            operation: 'AND',
            status: 'new',
            children:[
              {suggestion: payload},
              _.pick(state, ['operation','children','negate','suggestion'])
            ]
          }
        }
      }
      if (type === 'GRAMENE_FILTERS_REPLACED') {
        payload.status = 'new';
        return payload;
      }
      return state
    }
  },
  selectGrameneFilters: state => {
    return state.grameneFilters
  },
  selectGrameneFiltersQueryString: state => {
    return 'q=*:*';
  }
};
grameneFilters.doInitializeFilters = filters => ({dispatch, getState}) => {
  dispatch({
    type: 'GRAMENE_FILTERS_REPLACED', payload: filters
  })
};
grameneFilters.reactGrameneFilters = createSelector(
  'selectQueryObject',
  'selectGrameneFilters',
  (queryObject, filters) => {
    if (queryObject.filters) {
      if (filters.status === 'empty') {
        const newFilters = JSON.parse(queryObject.filters);
        return {actionCreator: 'doInitializeFilters', args: newFilters};
      }
    }
  }
);

export default grameneFilters;