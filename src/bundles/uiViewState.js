// Per-gene UI state lifted out of <Gene> and <Homology> class components.
// Keyed by geneId so it survives unmount/remount (e.g. scrolling a row out
// of view and back), and so a snapshot serializer can later round-trip it
// for the shareable-views feature.
//
// What lives here:
//   - expandedDetail: which detail tab is open in the gene-list card
//   - fullscreen: whether the expanded detail is full-screened
//   - homology.viewer: 'treevis' | 'tbrowse'
//   - homology.height: drag-resize height of the homology detail pane
//   - homology.tbrowse: the tbrowse ViewState (collapsedNodeIds, prunedNodeIds,
//     swappedNodeIds, compressedNodeIds, nodeOfInterestId, zones, zoneStates,
//     search, selectedNodeId). Tbrowse is driven in controlled mode from this.
//   - sequences: the Sequences detail's internal state — tab ('dna'|'rna'|'pep'),
//     tid (selected transcript id), upstream/downstream (flanking bp). Driven in
//     controlled mode from this so a saved view restores the chosen sub-tab and
//     isoform.
//   - expression: the Expression detail's internal state — activeTab
//     ('gene' (EBI Studies)|'jgi'|'paralogs'|'eFP'), atlasExperiment (selected
//     GXA experiment id for Paralogs), jgiExperiment (selected JGI study id),
//     jgiAxes ({[jgiExperiment]: {rowFactor, columnFactor}}, the factor grid's
//     axes per JGI study), barStudy (selected eFP/BAR study). Driven in
//     controlled mode from this so a saved view restores the chosen sub-tab,
//     studies and grid axes.
//   - primers: the Primers detail's PrimerDesignerState (gramene-primers), a
//     serializable {v: 1, mode, transcriptId, flankUp, flankDown, region,
//     target, included, excluded, junctionSpanning, avoidRepeats, preset,
//     params, designed, selectedRank, checkedRanks, check: {checks, genomes,
//     params, jobId, submitted}, view}. Replaced wholesale on every change and
//     driven in controlled mode, so a saved view re-runs the design and
//     re-attaches to the check job. A pasted `sequence` is kept here so it
//     survives a detail-tab switch; viewSnapshot drops it from saved views.
//     Design responses and check results are never stored.
//
// What does NOT live here:
//   - derived/computed state like `details` (per-render config from
//     props.config.details + capabilities)
//   - async-fetched data caches in <Homology> (neighborhood, geneStructures)

const initialState = {
  byGene: {}
};

const ensureGene = (state, geneId) => {
  if (state.byGene[geneId]) return state;
  return {
    ...state,
    byGene: {
      ...state.byGene,
      [geneId]: { homology: {} }
    }
  };
};

const setGene = (state, geneId, patch) => {
  const next = ensureGene(state, geneId);
  return {
    ...next,
    byGene: {
      ...next.byGene,
      [geneId]: { ...next.byGene[geneId], ...patch }
    }
  };
};

const setHomology = (state, geneId, patch) => {
  const next = ensureGene(state, geneId);
  const prev = next.byGene[geneId];
  return {
    ...next,
    byGene: {
      ...next.byGene,
      [geneId]: {
        ...prev,
        homology: { ...(prev.homology || {}), ...patch }
      }
    }
  };
};

const setSequences = (state, geneId, patch) => {
  const next = ensureGene(state, geneId);
  const prev = next.byGene[geneId];
  return {
    ...next,
    byGene: {
      ...next.byGene,
      [geneId]: {
        ...prev,
        sequences: { ...(prev.sequences || {}), ...patch }
      }
    }
  };
};

const setExpression = (state, geneId, patch) => {
  const next = ensureGene(state, geneId);
  const prev = next.byGene[geneId];
  return {
    ...next,
    byGene: {
      ...next.byGene,
      [geneId]: {
        ...prev,
        expression: { ...(prev.expression || {}), ...patch }
      }
    }
  };
};

const uiViewState = {
  name: 'uiViewState',
  getReducer: () => (state = initialState, { type, payload }) => {
    switch (type) {
      case 'UI_GENE_DETAIL_EXPANDED':
        // payload: { geneId, detail }  (detail = null to collapse)
        return setGene(state, payload.geneId, {
          expandedDetail: payload.detail,
          // collapsing also exits fullscreen
          fullscreen: payload.detail === null ? false : state.byGene[payload.geneId]?.fullscreen || false
        });

      case 'UI_GENE_FULLSCREEN_SET':
        // payload: { geneId, fullscreen }
        return setGene(state, payload.geneId, { fullscreen: !!payload.fullscreen });

      case 'UI_HOMOLOGY_VIEWER_SET':
        // payload: { geneId, viewer }
        return setHomology(state, payload.geneId, { viewer: payload.viewer });

      case 'UI_HOMOLOGY_HEIGHT_SET':
        // payload: { geneId, height }
        return setHomology(state, payload.geneId, { height: payload.height });

      case 'UI_HOMOLOGY_TBROWSE_SET':
        // payload: { geneId, tbrowse }  -- a full ViewState object
        return setHomology(state, payload.geneId, { tbrowse: payload.tbrowse });

      case 'UI_SEQUENCES_SET':
        // payload: { geneId, patch }  -- merges into the sequences slice
        // (e.g. { tab }, { tid }, { upstream }, { downstream })
        return setSequences(state, payload.geneId, payload.patch);

      case 'UI_EXPRESSION_SET':
        // payload: { geneId, patch }  -- merges into the expression slice
        // (e.g. { activeTab }, { atlasExperiment }, { jgiExperiment },
        // { jgiAxes } (the whole per-study map), { barStudy })
        return setExpression(state, payload.geneId, payload.patch);

      case 'UI_PRIMERS_SET':
        // payload: { geneId, state }  -- replaces the primers slice with the
        // full PrimerDesignerState emitted by <PrimerDesigner> (not merged)
        return setGene(state, payload.geneId, { primers: payload.state });

      case 'UI_VIEW_STATE_REPLACED':
        // payload: { byGene }  -- used by the snapshot loader in a later phase
        return { byGene: payload.byGene || {} };

      default:
        return state;
    }
  },

  selectUiViewState: state => state.uiViewState,

  doExpandGeneDetail: ({ geneId, detail }) => ({ dispatch }) => {
    dispatch({ type: 'UI_GENE_DETAIL_EXPANDED', payload: { geneId, detail } });
  },
  doSetGeneFullscreen: ({ geneId, fullscreen }) => ({ dispatch }) => {
    dispatch({ type: 'UI_GENE_FULLSCREEN_SET', payload: { geneId, fullscreen } });
  },
  doSetHomologyViewer: ({ geneId, viewer }) => ({ dispatch }) => {
    dispatch({ type: 'UI_HOMOLOGY_VIEWER_SET', payload: { geneId, viewer } });
  },
  doSetHomologyHeight: ({ geneId, height }) => ({ dispatch }) => {
    dispatch({ type: 'UI_HOMOLOGY_HEIGHT_SET', payload: { geneId, height } });
  },
  doSetHomologyTbrowseViewState: ({ geneId, tbrowse }) => ({ dispatch }) => {
    dispatch({ type: 'UI_HOMOLOGY_TBROWSE_SET', payload: { geneId, tbrowse } });
  },
  doSetSequencesState: ({ geneId, patch }) => ({ dispatch }) => {
    dispatch({ type: 'UI_SEQUENCES_SET', payload: { geneId, patch } });
  },
  doSetExpressionState: ({ geneId, patch }) => ({ dispatch }) => {
    dispatch({ type: 'UI_EXPRESSION_SET', payload: { geneId, patch } });
  },
  doSetPrimersState: ({ geneId, state }) => ({ dispatch }) => {
    dispatch({ type: 'UI_PRIMERS_SET', payload: { geneId, state } });
  },
  doReplaceUiViewState: byGene => ({ dispatch }) => {
    dispatch({ type: 'UI_VIEW_STATE_REPLACED', payload: { byGene } });
  }
};

export default uiViewState;
