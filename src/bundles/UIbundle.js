import qs from 'querystringify'

const isString = obj =>
  Object.prototype.toString.call(obj) === '[object String]'
const ensureString = input =>
  isString(input) ? input : qs.stringify(input);
const clearSuggestions = [
  {type: 'GRAMENE_SUGGESTIONS_CLEARED'},
  {type: 'SUGGESTIONS_CLEARED'}
];
const UIbundle = {
  name: 'searchUI',
  getReducer: () => {
    const initialState = {
      suggestions_query: '',
    };
    return (state = initialState, {type, payload}) => {
      if (type === 'SUGGESTIONS_QUERY_CHANGED') {
        return Object.assign({}, state, {
          suggestions_query: payload.query
        });
      }
      if (type === 'SUGGESTIONS_CLEARED') {
        return Object.assign({}, state, {
          suggestions_query: ''
        });
      }
      return state
    }
  },
  persistActions: ['SUGGESTIONS_CLEARED'],
  doChangeSuggestionsQuery: query => ({dispatch, getState}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        ...clearSuggestions,
        {type: 'SUGGESTIONS_QUERY_CHANGED', payload: {query: query.trim()}}
      ]
    });
  },
  doClearSuggestions: () => ({dispatch, getState}) => {
    document.getElementById('searchbar-parent').classList.remove('search-visible');
    dispatch({
      type: 'BATCH_ACTIONS', actions: clearSuggestions
    });
  },
  doAcceptSuggestion: suggestion => ({dispatch, getState}) => {
    document.getElementById('searchbar-parent').classList.remove('search-visible');
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        ...clearSuggestions
      ]
    });
  },
  selectSearchUI: state => state.searchUI,
  selectSuggestionsQuery: state => state.searchUI.suggestions_query,
};

export default UIbundle;