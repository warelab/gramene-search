import {createSelector} from "redux-bundler";
const BARs = {
  name: 'BARs',
  getReducer: () => {
    const initialState = {

    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        // case 'GRAMENE_GENOMES_TOGGLED':
        //   newState = Object.assign({},state);
        //   newState.show = !newState.show;
        //   return newState;
        // case 'GRAMENE_GENOMES_UPDATED':
        //   newState = Object.assign({}, state);
        //   newState.active = payload;
        //   return newState;
        default:
          return state;
      }
    }
  },
  selectBARs: state => state.BARs,
};

export default BARs;