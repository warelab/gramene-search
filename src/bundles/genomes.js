import {createSelector} from "redux-bundler";
const grameneGenomes = {
  name: 'grameneGenomes',
  getReducer: () => {
    const initialState = {
      show: false,
      active: {}
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_GENOMES_TOGGLED':
          newState = Object.assign({},state);
          newState.show = !newState.show;
          return newState;
        case 'GRAMENE_GENOMES_UPDATED':
          newState = Object.assign({}, state);
          newState.active = payload;
          return newState;
        default:
          return state;
      }
    }
  },
  doShowGrameneGenomes: () => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_GENOMES_TOGGLED'})
  },
  doUpdateGrameneGenomes: genomes => ({dispatch, getState}) => {
    dispatch({type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_GENOMES_TOGGLED'},
        {type: 'GRAMENE_GENOMES_UPDATED', payload: genomes}]})
  },
  selectGrameneGenomes: state => state.grameneGenomes,
  selectActiveGenomes: state => {
    return Object.keys(state.grameneGenomes.active)
  },
  selectActiveGenomeCount: createSelector(
    'selectGrameneMaps',
    'selectGrameneGenomes',
    (maps,genomes) => {
      if (maps && genomes) {
        return Object.keys(genomes.active).length || Object.keys(maps).length;
      }
      return 0;
    }
  )
};

export default grameneGenomes;