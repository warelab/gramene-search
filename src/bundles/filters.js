const grameneFilters = {
  name: 'grameneFilters',
  getReducer: () => {
    const initialState = {};
    return (state = initialState, {type, payload}) => {
      if (type === 'GRAMENE_FILTER_ADDED') {
        console.log(type,payload);
      }
      return state
    }
  },
  selectGrameneFilters: state => state.grameneFilters,
  selectGrameneFiltersQueryString: state => {
    return 'q=*:*';
  },
  doAddGrameneFilter: suggestion => ({dispatch, getState}) => {
    dispatch({
      type: 'GRAMENE_FILTER_ADDED', payload: {suggestion}
    })
  }
};

export default grameneFilters;