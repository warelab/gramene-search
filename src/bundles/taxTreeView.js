// Redux state for the tbrowse-based Taxonomic-distribution view (taxTree).
// Holds the controlled tbrowse ViewState plus the two host controls
// (collapse-empties / compara-only), so a saved view can round-trip the user's
// tree layout, zone arrangement/sizes/names, collapses, and control choices.
//
// `viewState` is null until the view has been interacted with (or restored);
// the container falls back to its built-in default and computes initial pixel
// widths in that case.

const taxTreeView = {
  name: 'taxTreeView',

  getReducer: () => {
    const initialState = {
      viewState: null,
      collapseEmpties: true,
      comparaOnly: true,
    };
    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'TAXTREE_VIEW_SET':
          return { ...state, ...payload };
        default:
          return state;
      }
    };
  },

  doSetTaxTreeView: (patch) => ({ dispatch }) =>
    dispatch({ type: 'TAXTREE_VIEW_SET', payload: patch }),

  // Re-apply persisted state from a saved-view snapshot.
  doApplyTaxTreeSnapshot: (snap) => ({ dispatch }) => {
    if (!snap || typeof snap !== 'object') return;
    dispatch({ type: 'TAXTREE_VIEW_SET', payload: snap });
  },

  selectTaxTreeView: (state) => state.taxTreeView,
};

export default taxTreeView;
