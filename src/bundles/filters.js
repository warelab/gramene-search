import {createSelector} from "redux-bundler";
import _ from 'lodash';

function findNodeWithLeftIdx(node, idx) {
  if (node.leftIdx === idx) {
    return node;
  }
  let result=null;
  if (node.leftIdx < idx && node.hasOwnProperty('children')) {
    node.children.forEach(child => {
      if (child.rightIdx > idx) {
        child.parentIdx = node.leftIdx;
        const res = findNodeWithLeftIdx(child, idx);
        if (res) result = res;
      }
    })
  }
  return result;
}

function markSubtree(node, source, invert) {
  node.marked = (node.leftIdx >= source.leftIdx && node.rightIdx <= source.rightIdx);
  if (invert) node.marked = !node.marked;
  if (node.hasOwnProperty('children')) {
    node.children.forEach(child => {
      markSubtree(child, source, invert);
    })
  }
}

function reindexTree(node, idx) {
  node.leftIdx = idx;
  idx++;
  if (node.hasOwnProperty('children')) {
    node.children.forEach(child => {
      idx = reindexTree(child, idx);
    });
  }
  node.rightIdx = idx;
  idx++;
  return idx;
}

const grameneFilters = {
  name: 'grameneFilters',
  getReducer: () => {
    const initialState = {
      status: 'init', // others include 'search', 'waiting' and 'ready'
      operation: 'AND',
      negate: false,
      marked: false,
      leftIdx: 0,
      rightIdx: 1,
      children: [],
      showMarked: false,
      showMenu: false,
      moveCopyMode: ''
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_FILTER_ADDED': {
          const idx = state.rightIdx;
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            rightIdx: idx + 2
          });
          let child = _.pick(payload, ['fq_field', 'fq_value', 'name', 'category']);
          child.leftIdx = idx;
          child.rightIdx = idx + 1;
          child.negate = false;
          child.showMenu = false;
          newState.children.push(child);
          markSubtree(newState, child, false);
          return newState;
        }
        case 'GRAMENE_FILTER_NEGATED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true
          });
          let node = findNodeWithLeftIdx(newState, payload.leftIdx);
          if (node) {
            node.negate = !node.negate;
            markSubtree(newState, node, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_DELETED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true
          });
          let node = findNodeWithLeftIdx(newState, payload.leftIdx);
          if (node) {
            let parent = findNodeWithLeftIdx(newState, node.parentIdx);
            parent.children = parent.children.filter(child => child.leftIdx !== node.leftIdx);
            reindexTree(newState, 0);
            markSubtree(newState, parent, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_OPERATION_CHANGED': {
          if (payload.hasOwnProperty('operation')) {
            newState = Object.assign({}, state, {
              status: 'search',
              showMarked: true
            });
            let node = findNodeWithLeftIdx(newState, payload.leftIdx);
            node.operation = node.operation === 'AND' ? 'OR' : 'AND';
            markSubtree(newState, node, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_MOVED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            moveCopyMode: ''
          });
          let source = findNodeWithLeftIdx(newState, payload.source.leftIdx);
          let target = findNodeWithLeftIdx(newState, payload.target.leftIdx);
          if (source && target) {
            source.showMenu = false;
            let parent = findNodeWithLeftIdx(newState, source.parentIdx);
            parent.children = parent.children.filter(child => child.leftIdx !== source.leftIdx);
            target.showMenu = false;
            if (!target.hasOwnProperty('children')) {
              let targetCopy = Object.assign({}, target);
              target.children = [targetCopy];
              target.operation = 'OR';
              target.negate = false;
              delete target.fq_field;
              delete target.fq_value;
              delete target.name;
              delete target.category;
            }
            target.children.push(source);
            reindexTree(newState, 0);
            markSubtree(newState, target, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_COPIED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            moveCopyMode: ''
          });
          let source = findNodeWithLeftIdx(newState, payload.source.leftIdx);
          let target = findNodeWithLeftIdx(newState, payload.target.leftIdx);
          if (source && target) {
            source.showMenu = false;
            if (!target.hasOwnProperty('children')) {
              let targetCopy = Object.assign({}, target);
              target.children = [targetCopy];
              target.operation = 'OR';
              target.negate = false;
              delete target.fq_field;
              delete target.fq_value;
              delete target.name;
              delete target.category;
            }
            let sourceCopy = Object.assign({}, source);
            target.children.push(sourceCopy);
            reindexTree(newState, 0);
            markSubtree(newState, target, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_TARGETS_MARKED':
          newState = Object.assign({}, state, {
            showMarked: true,
            moveCopyMode: payload.mode,
            moveCopySource: payload.source
          });
          markSubtree(newState, payload.source, true);
          return newState;
        case 'GRAMENE_FILTER_TARGETS_UNMARKED':
          newState = Object.assign({}, state, {
            showMarked: false
          });
          return newState;
        case 'GRAMENE_FILTERS_REPLACED':
          payload.status = 'search';
          return payload;
        case 'GRAMENE_FILTERS_STATUS_CHANGED':
          if (!(state.status === 'ready' && payload === 'waiting')) {
            return Object.assign({}, state, {status: payload})
          }
          break;
        case 'GRAMENE_FILTERS_SET_SHOW_MARKED':
          return Object.assign({}, state, {showMarked: payload});
        case 'GRAMENE_FILTER_MENU_TOGGLED':
          payload.showMenu = !payload.showMenu;
          return Object.assign({}, state);
        case 'GRAMENE_SEARCH_FETCH_STARTED':
          return Object.assign({}, state, {status: 'loading'});
        case 'GRAMENE_SEARCH_FETCH_FINISHED':
          return Object.assign({}, state, {status: 'finished'});
        case 'URL_UPDATED':
          if (state.status === 'ready') {
            return Object.assign({}, initialState, {children:[]})
          }
          break;
        case 'APP_IDLE':
          if (state.showMarked) {
            return Object.assign({}, state, {showMarked: false})
          }
      }
      return state;
    }
  },
  doNegateGrameneFilter: filter => ({dispatch, getState}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_NEGATED', payload: filter}
      ]
    })
  },
  doDeleteGrameneFilter: filter => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_DELETED', payload: filter}
      ]
    })
  },
  doChangeGrameneFilterOperation: filter => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_OPERATION_CHANGED', payload: filter}
      ]
    })
  },
  doMoveOrCopyGrameneFilter: (target) => ({dispatch, getState}) => {
    const state = getState();
    if (state.grameneFilters.moveCopyMode) {
      const source = state.grameneFilters.moveCopySource;
      dispatch({
        type: 'BATCH_ACTIONS', actions: [
          {type: 'GRAMENE_SEARCH_CLEARED'},
          {type: `GRAMENE_FILTER_${state.grameneFilters.moveCopyMode.toUpperCase()}D`, payload: {source, target}}
        ]
      })
    }
  },
  doCopyGrameneFilter: (source, target) => ({dispatch, getState}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_COPIED', payload: {source, target}}
      ]
    })
  },
  doMarkGrameneFilterTargets: (source, mode) => ({dispatch}) => {
    dispatch({type: 'GRAMENE_FILTER_TARGETS_MARKED', payload: {source:source, mode:mode}})
  },
  doUnmarkGrameneFilterTargets: () => ({dispatch}) => {
    dispatch({type: 'GRAMENE_FILTER_TARGETS_UNMARKED'})
  },
  doAcceptGrameneSuggestion: suggestion => ({dispatch, getState}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_ADDED', payload: suggestion}
      ]
    })
  },
  doToggleGrameneFilterMenu: node => ({dispatch}) => {
    dispatch({type: 'GRAMENE_FILTER_MENU_TOGGLED', payload: node})
  },
  selectGrameneFilters: state => state.grameneFilters,
  selectGrameneFiltersStatus: state => state.grameneFilters.status,
  selectGrameneFiltersQueryString: state => {
    const hasSpaces = new RegExp(/\s/);
    function getQuery(node) {
      const negate = node.negate ? 'NOT ' : '';
      if (node.hasOwnProperty('children')) {
        // do some recursion
        return `${negate}(${node.children.map(c => getQuery(c)).sort().join(` ${node.operation} `)})`
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
        return {
          type: 'BATCH_ACTIONS', actions: [
            {type: 'GRAMENE_SEARCH_CLEARED'},
            {type: 'GRAMENE_FILTERS_REPLACED', payload: newFilters}
          ]
        };
      }
      if (queryObject.hasOwnProperty('suggestion')) {
        return {
          type: 'BATCH_ACTIONS', actions: [
            {type: 'GRAMENE_SEARCH_CLEARED'},
            {type: 'GRAMENE_FILTER_ADDED', payload: JSON.parse(queryObject.suggestion)}
          ]
        };
      }
      return {
        type: 'BATCH_ACTIONS', actions: [
          {type: 'GRAMENE_SEARCH_CLEARED'},
          {type: 'GRAMENE_FILTERS_STATUS_CHANGED', payload: 'ready'}
        ]
      }
    }
    if (filters.status === 'finished') {
      const url = new URL(myUrl.href);
      url.search = `filters=${JSON.stringify(Object.assign({}, filters, {status: 'init'}))}`;
      return {
        type: 'BATCH_ACTIONS', actions: [
          {type: 'URL_UPDATED', payload: {url: url.href, replace:false}},
          {type: 'GRAMENE_FILTERS_STATUS_CHANGED', payload: 'ready'}
        ]
      }
    }
  }
);

export default grameneFilters;