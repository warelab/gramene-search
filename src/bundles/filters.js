import {createSelector} from "redux-bundler";
import _ from 'lodash';
import ReactGA from 'react-ga4'
const MAX_IDLIST_LENGTH = 20;

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

// Marks the OR group that collects genomic intervals, so a second interval joins
// the existing group instead of starting a new one. `category` is used because it
// is one of the node keys viewSnapshot preserves, so the grouping survives a saved
// view; losing it would only mean a new group, never a corrupt tree.
export const INTERVAL_GROUP = 'Genomic intervals';

// A genomic interval rides in ONE leaf: getQuery has a raw-passthrough branch for a
// `location` value beginning "(map:", and every other branch would escape the colons.
// Building and reading that value lives here so the reducer and the edit form can
// never drift apart.
export function formatIntervalValue({map, region, start, end}) {
  return `(map:${map} AND region:${region}`
    + ` AND start:[* TO ${end}] AND end:[${start} TO *])`;
}

export function intervalName({mapLabel, map, region, start, end}) {
  return `${mapLabel || map} ${region}:${Number(start).toLocaleString()}-${Number(end).toLocaleString()}`;
}

// Note the field order is inverted relative to the interval: `start` carries the
// interval's END and `end` carries its START, because the pair is an overlap test.
const INTERVAL_RE =
  /^\(map:(\S+) AND region:(\S+) AND start:\[\* TO (\d+)\] AND end:\[(\d+) TO \*\]\)$/;

export function parseIntervalValue(fqValue) {
  const m = INTERVAL_RE.exec(String(fqValue || ''));
  if (!m) return null;
  return { map: m[1], region: m[2], end: Number(m[3]), start: Number(m[4]) };
}

/** `[lo TO hi]`, as produced by the expression brush and the Location tab. */
const RANGE_RE = /^\[\s*(\S+)\s+TO\s+(\S+)\s*\]$/;

export function parseRangeValue(fqValue) {
  const m = RANGE_RE.exec(String(fqValue || ''));
  return m ? { lo: m[1], hi: m[2] } : null;
}

export function formatRangeValue(lo, hi) {
  return `[${lo} TO ${hi}]`;
}

/** Which editor a leaf needs. Groups have no parameters, so they get none. */
export function editorKindFor(node) {
  if (!node || node.hasOwnProperty('children')) return null;
  if (parseIntervalValue(node.fq_value)) return 'interval';
  if (parseRangeValue(node.fq_value)) return 'range';
  return 'value';
}

// "Expansions" grow the result set along a biological relationship instead of
// combining filters: the node's own result is the seed, and it resolves to that seed
// plus everything reachable from it (returnRoot=true).
//
// `expand` is added to the allowlists in bundles/viewSnapshot.js so it survives a
// saved view. That does not disturb existing share hashes — cleanFilterNode copies
// only keys that are present, and canonicalize skips undefined, so a node without an
// expansion serialises exactly as it did before.
export const EXPANSIONS = {
  orthologs: {
    label: 'orthologs',
    // Edge fields: a seed gene's homology__all_orthologs values are the ids of its
    // orthologs. Same field already queried directly in bundles/api.js.
    from: 'homology__all_orthologs',
    to: 'id'
  },
  paralogs: {
    label: 'paralogs',
    // Within-species, so this stays inside the seed's own genome — a much smaller
    // expansion than orthologs (11 vs 70 for msd2).
    from: 'homology__within_species_paralog',
    to: 'id'
  },
  neighborhood: {
    label: 'neighborhood (±10)',
    // Same edge pair TBrowse walks for its neighborhood zone (see
    // components/results/details/Homology.js). Unlike the homology fields these are
    // numeric: a gene's compara_neighbors_10 lists the compara_idx values of the 10
    // genes either side, matched against compara_idx_multi on the target. TBrowse
    // omits returnRoot, which Solr defaults to true — the same as every expansion
    // here — so a seed gene expands to 21: itself plus 20 neighbours.
    from: 'compara_neighbors_10',
    to: 'compara_idx_multi'
  }
};

// An expansion is a *property* of a node — `node.expand = 'orthologs'` — in exactly
// the way `node.negate` is, not a node of its own. The node combines its children
// with its own AND/OR as usual and the expansion then applies to that result, so the
// tree shape never changes. That keeps the insert actions, move/copy and delete
// working untouched, makes "remove the expansion" a field delete, and means where
// you attach it is what determines its scope.
export function expansionType(node) {
  const type = node && node.expand;
  return (typeof type === 'string' && type) ? type : null;
}

// Node tokens are rendered into CSS class names, and a hand-edited ?filters= payload
// can put anything there.
export function safeClassName(token) {
  return String(token).replace(/[^A-Za-z0-9_-]/g, '-');
}

// Escape an already-emitted subquery for embedding in a quoted `_query_` value.
// Backslash FIRST, then quote — the order matters, or the backslashes added for the
// quotes get doubled again.
//
// Apply exactly ONCE per level of nesting. Because getQuery is recursive and each
// expansion node escapes its child's already-emitted string, nesting composes on its
// own: a phrase quote is \" one level down and \\\" two levels down. Do not try to
// pre-escape leaves or track depth explicitly — that breaks the composition.
//
// Escaping the backslash is not cosmetic. getQuery emits `\:` for colon-bearing
// values (see the idWithColon/isQuery branches below); leaving those single-escaped
// inside the quoted value lets Solr's inner parser un-escape the colon, and the query
// silently degenerates to the entire index (verified: 5,407,132 rows instead of
// 789,630, HTTP 200, no error).
export function escapeForQuery(subquery) {
  return String(subquery).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function expansionLabel(node) {
  const type = expansionType(node);
  if (!type) return null;
  const spec = EXPANSIONS[type];
  return `EXPAND: ${spec ? spec.label : type}`;
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
      moveCopyMode: '',
      searchOffset: 0,
      rows: 20
    };
    return (state = initialState, {type, payload}) => {
      let newState;
      switch (type) {
        case 'GRAMENE_FILTERS_CLEARED': {
          newState = Object.assign({}, initialState, {
            status: 'search',
            children: []
          });
          return newState;
        }
        case 'GRAMENE_FILTER_ADDED': {
          const idx = state.rightIdx;
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            rightIdx: idx + 2,
            searchOffset: 0
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
        case 'GRAMENE_FILTER_TREE_ADDED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            rightIdx: payload.rightIdx + 1,
            searchOffset: 0
          });
          newState.children.push(payload);
          markSubtree(newState, payload, false);
          return newState;
        }
        case 'GRAMENE_FILTER_SET_ADDED': {
          // create a filter with the payload.operation and children payload.filters
          let filter = {
            leftIdx: state.rightIdx,
            rightIdx: state.rightIdx + (payload.filters.length) * 2 + 1,
            operation: payload.operation,
            negate: false,
            showMenu: false,
            children: payload.filters
          };
          if (payload.warning) {
            filter.warning = payload.warning
          }
          let nextIdx = filter.leftIdx+1;
          payload.filters.forEach(f => {
            f.leftIdx = nextIdx++;
            f.rightIdx = nextIdx++;
            f.negate = false;
            f.showMenu = false;
          });
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            searchOffset: 0,
            rightIdx: filter.rightIdx + 1
          });
          newState.children.push(filter);
          markSubtree(newState, filter, false);
          return newState;
        }
        case 'GRAMENE_FILTER_NEGATED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            searchOffset: 0
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
            showMarked: true,
            searchOffset: 0
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
              showMarked: true,
              searchOffset: 0
            });
            let node = findNodeWithLeftIdx(newState, payload.leftIdx);
            // Set an explicit operation when one is supplied; otherwise keep the
            // historical AND<->OR flip for callers that just pass the node.
            node.operation = payload.newOperation
              ? payload.newOperation
              : (node.operation === 'AND' ? 'OR' : 'AND');
            markSubtree(newState, node, false);
            return newState;
          }
          break;
        }
        case 'GRAMENE_FILTER_INTERVAL_ADDED': {
          // Intervals accumulate into a single OR group, because ANDing two
          // disjoint intervals matches nothing — no gene sits in both. The group
          // is tagged with `category`, one of the keys viewSnapshot keeps, so a
          // restored view merges into it instead of starting a second group; were
          // that tag ever lost the worst case is an extra group, never a corrupt
          // tree.
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            searchOffset: 0
          });
          const {map, mapLabel, region, start, end} = payload;
          // One leaf per interval, not four. getQuery has a raw-passthrough branch
          // for a `location` leaf whose value starts with "(map:" — every other
          // branch would escape the colons — so the whole clause rides in one node
          // and the Filters panel shows one readable row per interval.
          //
          // Overlap, not containment: start <= interval end AND end >= interval
          // start, so a gene that merely crosses the boundary still matches.
          const intervalNode = {
            fq_field: 'location',
            fq_value: formatIntervalValue({map, region, start, end}),
            name: intervalName({mapLabel, map, region, start, end}),
            category: 'Genomic interval',
            negate: false,
            showMenu: false
          };
          let group = (newState.children || []).find(
            c => c && c.category === INTERVAL_GROUP && Array.isArray(c.children)
          );
          if (group) {
            group.children.push(intervalNode);
          } else {
            newState.children.push({
              operation: 'OR',
              category: INTERVAL_GROUP,
              negate: false,
              showMenu: false,
              children: [intervalNode]
            });
          }
          // Inserting a nested subtree invalidates the hand-computed indices the
          // append actions rely on, so renumber the whole tree.
          reindexTree(newState, 0);
          markSubtree(newState, newState, false);
          return newState;
        }
        case 'GRAMENE_FILTER_EDITED': {
          // Edits only rewrite a leaf's value and label. The node keeps its place,
          // its negate flag and any expansion, and the tree shape is untouched — so
          // unlike an insert there is nothing to reindex.
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            searchOffset: 0
          });
          const node = findNodeWithLeftIdx(newState, payload.leftIdx);
          if (!node || node.hasOwnProperty('children')) break;
          node.fq_value = payload.fq_value;
          if (payload.name !== undefined) node.name = payload.name;
          node.showMenu = false;
          markSubtree(newState, node, false);
          return newState;
        }
        case 'GRAMENE_FILTER_EXPANSION_SET': {
          // Setting or clearing an expansion is just a field on the node — the tree
          // shape is untouched, so there is nothing to reindex and no special case
          // for the root. `payload.expand` of null/undefined removes it.
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            searchOffset: 0
          });
          let node = findNodeWithLeftIdx(newState, payload.leftIdx);
          if (!node) break;
          // Leave showMenu alone, as GRAMENE_FILTER_NEGATED does. The radios are a
          // setting rather than a command, so the menu stays open and the selection
          // updates in place — you can switch type or clear without reopening it.
          if (payload.expand) node.expand = payload.expand;
          else delete node.expand;
          markSubtree(newState, node, false);
          return newState;
        }
        case 'GRAMENE_FILTER_MOVED': {
          newState = Object.assign({}, state, {
            status: 'search',
            showMarked: true,
            moveCopyMode: '',
            searchOffset: 0
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
            moveCopyMode: '',
            searchOffset: 0
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
          payload.searchOffset = 0;
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
        case 'GRAMENE_SEARCH_PAGE_REQUESTED':
          return Object.assign({}, state, {status: 'search', searchOffset: payload * state.rows});
        case 'GRAMENE_SEARCH_FETCH_STARTED':
          return Object.assign({}, state, {status: 'loading'});
        case 'GRAMENE_SEARCH_FETCH_FINISHED':
          return Object.assign({}, state, {status: 'finished'});
        case 'GRAMENE_GENOMES_UPDATED':
          if (state.status === 'ready') {
            return Object.assign({}, state, {status: 'search'});
          }
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
        {type: 'GRAMENE_TAXONOMY_CLEARED'},
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
  // Expand a node (leaf or group) along a relationship, e.g. "orthologs of this".
  doExpandGrameneFilter: (filter, type) => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_TAXONOMY_CLEARED'},
        {type: 'GRAMENE_FILTER_EXPANSION_SET', payload: {leftIdx: filter.leftIdx, expand: type}}
      ]
    })
  },
  // Clear a node's expansion, leaving the node and its filters in place.
  doRemoveGrameneExpansion: filter => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_TAXONOMY_CLEARED'},
        {type: 'GRAMENE_FILTER_EXPANSION_SET', payload: {leftIdx: filter.leftIdx, expand: null}}
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
    if (!suggestion.name) {
      suggestion.name = suggestion.display_name;
    }
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_ADDED', payload: suggestion}
      ]
    })
  },
  doAddGrameneRangeQuery: terms => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTER_SET_ADDED', payload: {operation: 'AND', filters: terms}}
      ]
    })
  },
  // Add one genomic interval. Accumulates into a single OR group; see the
  // GRAMENE_FILTER_INTERVAL_ADDED reducer for why they cannot be ANDed.
  doAddGrameneInterval: interval => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_TAXONOMY_CLEARED'},
        {type: 'GRAMENE_FILTER_INTERVAL_ADDED', payload: interval}
      ]
    })
  },
  // Replace one leaf's value in place, keeping its position in the tree.
  doEditGrameneFilter: (filter, fq_value, name) => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_TAXONOMY_CLEARED'},
        {type: 'GRAMENE_FILTER_EDITED', payload: {leftIdx: filter.leftIdx, fq_value, name}}
      ]
    })
  },
  doToggleGrameneFilterMenu: node => ({dispatch}) => {
    dispatch({type: 'GRAMENE_FILTER_MENU_TOGGLED', payload: node})
  },
  doRequestResultsPage: page => ({dispatch}) => {
    dispatch(
      {type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_SEARCH_PAGE_REQUESTED', payload: page}
      ]
    })
  },
  doReplaceGrameneFilters: filters => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTERS_REPLACED', payload: filters}
      ]
    })
  },
  doClearGrameneFilters: () => ({dispatch}) => {
    dispatch({
      type: 'BATCH_ACTIONS', actions: [
        {type: 'GRAMENE_SEARCH_CLEARED'},
        {type: 'GRAMENE_FILTERS_CLEARED'}
      ]
    })
  },
  selectGrameneFilters: state => state.grameneFilters,
  selectGrameneFiltersStatus: state => state.grameneFilters.status,
  selectGrameneFiltersQueryString: state => {
    const hasSpaces = new RegExp(/^[^\[\(].*\s/);
    const isQuery = new RegExp(/\([a-zA-Z0-9_]+:[a-zA-Z0-9_]+\s/);
    const isRegionQuery = new RegExp(/^\(map:/);
    const idWithColon = new RegExp(/^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$/);
    // The node's own clause, before negation and before any expansion.
    function ownQuery(node) {
      if (node.hasOwnProperty('children')) {
        // Only AND and OR are valid infix operators. Anything else — a token from a
        // newer client arriving via ?filters= or a saved view — would otherwise be
        // interpolated raw and produce a Solr 400, which surfaces as blank results
        // across every view rather than as an error.
        const op = (node.operation === 'AND' || node.operation === 'OR') ? node.operation : 'OR';
        const kids = Array.isArray(node.children) ? node.children : [];
        return `(${kids.map(c => getQuery(c)).sort().join(` ${op} `)})`;
      }
      // this node is a suggestion
      if (node.fq_field === 'location' && isRegionQuery.test(node.fq_value))
        return `${node.fq_value}`
      if (isQuery.test(node.fq_value))
        return `${node.fq_value.replace(/:/g,'\\:')}`;
      if (hasSpaces.test(node.fq_value))
        return `${node.fq_field}:"${node.fq_value}"`;
      else if (idWithColon.test(node.fq_value))
        return `${node.fq_field}:${node.fq_value.replace(/:/g,'\\:')}`;
      else
        return `${node.fq_field}:${node.fq_value}`
    }
    function getQuery(node) {
      const negate = node.negate ? 'NOT ' : '';
      const clause = ownQuery(node);
      const expType = expansionType(node);
      // No expansion on this node: unchanged from before.
      if (!expType) return `${negate}${clause}`;
      const spec = EXPANSIONS[expType];
      // Unknown expansion type — e.g. a link shared from a newer client. Degrade to
      // the un-expanded clause rather than emitting something broken.
      if (!spec) return `${negate}${clause}`;
      // An expansion of nothing must match nothing; '*:*' here would turn an empty
      // group into "every gene in the index".
      if (!clause || clause === '()') return `${negate}(*:* AND NOT *:*)`;
      // The braces MUST stay inside a quoted `_query_` value. A bare `{!graph ...}`
      // in `q` is unreliable and fails *silently* — observed returning 0 rows in
      // some shapes and millions in others, always HTTP 200, depending on the seed
      // and the endpoint in front of Solr. Don't factor `graph` out to module scope
      // where it could be used somewhere that isn't wrapped this way.
      const graph = `{!graph from=${spec.from} to=${spec.to} maxDepth=1 returnRoot=true}`;
      // Negation applies to the expanded set: "NOT an ortholog of msd2".
      return `${negate}(_query_:"${graph}${escapeForQuery(clause)}")`;
    }
    if (state.grameneFilters.rightIdx === 1) {
      return '*:*';
    }
    return `*:* AND (${getQuery(state.grameneFilters)})`;
  },
  selectGrameneSearchOffset: state => state.grameneFilters.searchOffset,
  selectGrameneSearchRows: state => state.grameneFilters.rows
};

const handleIdList = (queryObject) => {
  let actions = [{type: 'GRAMENE_SEARCH_CLEARED'}];
  let ids = _.uniq(queryObject.idList.split(','));
  let warning = null;
  if (ids.length > MAX_IDLIST_LENGTH) {
    ids = _.slice(ids, 0, MAX_IDLIST_LENGTH);
    warning = `The idList query parameter is limited to ${MAX_IDLIST_LENGTH} genes`
  }
  let filters = ids.map((id,idx) => {
    return {
      category: 'Gene',
      name: id,
      fq_field: 'id',
      fq_value: id
    }
  });
  if (filters.length === 1) {
    actions.push({type: 'GRAMENE_FILTER_ADDED', payload: filters[0]})
  }
  else {
    let action = {type: 'GRAMENE_FILTER_SET_ADDED', payload: {operation: 'OR', filters:filters}};
    if (warning) {
      action.payload.warning = warning
    }
    actions.push(action)
  }
  return { type: 'BATCH_ACTIONS', actions: actions };
};

grameneFilters.reactGrameneFilters = createSelector(
  'selectQueryObject',
  'selectGrameneFilters',
  'selectActiveGenomes',
  'selectUrlObject',
  (queryObject, filters, genomes, myUrl) => {
    if (filters.status === 'init') {
      // A shared-view link (?view=<hash>) is restored asynchronously by
      // bootViewFromUrl once the snapshot (and, for private views, the auth
      // token) has loaded. Do nothing here: clearing filters + running an
      // unfiltered search would race the restore and leave the restored filter
      // in the tree but never applied to the search (the stale unfiltered
      // result stays put). Staying 'init' means the first — and only — search
      // is the one the snapshot triggers, with the filter in place.
      if (queryObject.hasOwnProperty('view')) {
        return;
      }
      if (queryObject.filters) {
        const newFilters = JSON.parse(queryObject.filters);
        let actions = [
          {type: 'GRAMENE_SEARCH_CLEARED'},
          {type: 'GRAMENE_FILTERS_REPLACED', payload: newFilters}
        ];
        if (queryObject.genomes) {
          let active={};
          queryObject.genomes.split(',').forEach(t => {
            active[t]=true
          });
          actions.push({type: 'GRAMENE_GENOMES_UPDATED', payload: active});
        }
        return { type: 'BATCH_ACTIONS', actions: actions };
      }
      if (queryObject.hasOwnProperty('sugg')) {
        return {
          type: 'BATCH_ACTIONS', actions: [
            {type: 'GRAMENE_SEARCH_CLEARED'},
            {type: 'GRAMENE_FILTER_ADDED', payload: JSON.parse(queryObject.sugg)}
          ]
        };
      }
      if (queryObject.hasOwnProperty('suggestion')) {
        const url = new URL(myUrl.href);
        url.search = '';
        return {
          type: 'BATCH_ACTIONS', actions: [
            {type: 'URL_UPDATED', payload: {url: url.href, replace:false}},
            {type: 'GRAMENE_SEARCH_CLEARED'},
            {type: 'SUGGESTIONS_QUERY_CHANGED', payload: {query: queryObject.suggestion}}
          ]
        };
      }
      if (queryObject.hasOwnProperty('idList')) {
        return handleIdList(queryObject);
      }
      if (queryObject.hasOwnProperty('fq_field') && queryObject.hasOwnProperty('fq_value')
        && queryObject.hasOwnProperty('category') && queryObject.hasOwnProperty('name')) {
        return {
          type: 'BATCH_ACTIONS', actions: [
            {type: 'GRAMENE_SEARCH_CLEARED'},
            {type: 'GRAMENE_FILTER_ADDED', payload: queryObject}
          ]
        };
      }
      const url = new URL(myUrl.href);
      if (url.pathname === '/genes') {
        return {type: 'GRAMENE_FILTERS_CLEARED'}
      }
    }
    if (filters.status === 'finished') {
      const url = new URL(myUrl.href);
      url.search = `filters=${JSON.stringify(Object.assign({}, filters, {status: 'init'}))}&genomes=${genomes.join(',')}`;
      ReactGA.event({
        category: "Gene Search",
        action: "filter finished",
        label: url.search
      });
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
