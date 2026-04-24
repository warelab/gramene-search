import { createSelector } from 'redux-bundler';

const grameneViews = {
  name: 'grameneViews',
  getReducer: () => {
    const initialState = {
      options: [
        {
          id: 'help',
          name: 'Help / Demo',
          show: 'off',
          shouldScroll: false
        },
        {
          id: 'userLists',
          name: 'User Gene Lists',
          show: 'off',
          shouldScroll: false
        },
        {
          id: 'taxonomy',
          name: 'Taxonomic distribution',
          show: 'on',
          shouldScroll: false
        },
        {
          id: 'list',
          name: 'Gene list',
          show: 'on',
          shouldScroll: false
        },
        {
          id: 'expression',
          name: 'Gene expression',
          show: 'off',
          shouldScroll: false,
          desiredSamples: {}
        },
        {
          id: 'attribs',
          name: 'Gene attributes',
          show: 'off',
          shouldScroll: false
        },
        {
          id: 'export',
          name: 'Data exporter',
          show: 'off',
          shouldScroll: false
        }
        // {
        //   id: 'domains',
        //   name: 'Domains',
        //   show: 'disabled'
        // },
        // {
        //   id: 'go',
        //   name: 'GO terms',
        //   show: 'disabled'
        // }
      ],
      touched: {}
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_VIEW_TOGGLED':
          newState = Object.assign({},state);
          newState.touched = { ...(state.touched || {}), [payload]: true };
          newState.options.forEach(view => {
            view.shouldScroll = false;
            if (view.id === payload) {
              view.show = view.show === 'on' ? 'off' : 'on'
              view.shouldScroll = view.show === 'on';
            }
          });
          return newState;
        case 'GRAMENE_VIEW_CLICKED':
          newState = Object.assign({}, state);
          newState.touched = { ...(state.touched || {}), [payload]: true };
          newState.options.forEach(view => {
            view.shouldScroll = false;
            if (view.id === payload) {
              view.show = view.show === 'on' ? 'on' : 'on';
              view.shouldScroll = view.show === 'on';
            }
          });
          return newState;
        case 'GRAMENE_VIEW_SCROLLED':
          newState = Object.assign({}, state);
          newState.options.forEach(v => v.shouldScroll = false)
          return newState;
        default:
          return state;
      }
    }
  },
  doToggleGrameneView: idx => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_VIEW_TOGGLED', payload: idx})
  },
  dontToggleGrameneView: idx => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_VIEW_CLICKED', payload: idx})
  },
  doCancelShouldScroll: () => ({dispatch, getState}) => {
    dispatch({type: 'GRAMENE_VIEW_SCROLLED', payload: null})
  },
  selectRawGrameneViews: state => state.grameneViews,
  selectGrameneViews: createSelector(
    'selectRawGrameneViews',
    'selectConfiguration',
    'selectGrameneSearch',
    'selectGrameneFilters',
    (raw, config, search, filters) => {
      const overrides = (config && config.views) || null;
      const touched = raw.touched || {};
      const numFound = (search && search.response && search.response.numFound) || 0;
      const hasFilters = !!(filters && filters.rightIdx > 1);
      const resultDependentIds = new Set(['taxonomy', 'list']);
      const autoDisable = (numFound === 0) || !hasFilters;

      let options = raw.options;
      if (overrides) {
        options = options.filter(v => overrides[v.id] !== 'hidden');
      }
      options = options.map(v => {
        if (autoDisable && resultDependentIds.has(v.id)) {
          return { ...v, show: 'disabled' };
        }
        if (!overrides) return v;
        const o = overrides[v.id];
        if (!o) return v;
        if (o === 'disabled') return { ...v, show: 'disabled' };
        if (touched[v.id]) return v;
        return { ...v, show: o };
      });
      return { ...raw, options };
    }
  )
};

export default grameneViews;
