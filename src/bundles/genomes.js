const grameneGenomes = {
  name: 'grameneGenomes',
  getReducer: () => {
    const initialState = {
      show: false
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_GENOMES_TOGGLED':
          newState = Object.assign({},state);
          newState.show = !newState.show;
          return newState;
        default:
          return state;
      }
    }
  },
  doToggleGrameneGenomes: idx => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_GENOMES_TOGGLED', payload: idx})
  },
  selectGrameneGenomes: state => state.grameneGenomes,
};

export default grameneGenomes;