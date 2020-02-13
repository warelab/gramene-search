import {createSelector} from "redux-bundler";
import _ from 'lodash';

const grameneViews = {
  name: 'grameneViews',
  getReducer: () => {
    const initialState = {
      options: [
        {
          id: 'help',
          name: 'Help / Demo',
          show: 'off'
        },
        {
          id: 'taxonomy',
          name: 'Taxonomic distribution',
          show: 'off'
        },
        {
          id: 'list',
          name: 'Gene list',
          show: 'on'
        },
        {
          id: 'pathways',
          name: 'Pathways',
          show: 'disabled'
        },
        {
          id: 'domains',
          name: 'Domains',
          show: 'disabled'
        },
        {
          id: 'go',
          name: 'GO terms',
          show: 'disabled'
        }
      ]
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_VIEW_TOGGLED':
          newState = Object.assign({},state);
          newState.options[payload].show = newState.options[payload].show === 'on' ? 'off' : 'on';
          return newState;
        default:
          return state;
      }
    }
  },
  doToggleGrameneView: idx => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_VIEW_TOGGLED', payload: idx})
  },
  selectGrameneViews: state => state.grameneViews,
};

export default grameneViews;