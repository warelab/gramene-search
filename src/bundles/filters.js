const grameneFilters = {
  name: 'grameneFilters',
  getReducer: () => {
    const initialState = {};
    return (state = initialState, {type, payload}) => {
      return state
    }
  },
  selectGrameneFilters: state => state.grameneFilters
};

export default grameneFilters;