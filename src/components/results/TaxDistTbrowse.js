import React, { useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { connect } from 'redux-bundler-react';
import { TBrowse, treeZone, labelsZone } from 'tbrowse';
import { toTbrowseTree } from './taxTree/toTbrowseTree';
import {
  binsZone, extractGenomeData, createBinsUiStore, selectedBinIdxs, totalSelectedGenes,
} from './taxTree/binsZone';
import { countsZone, computeGeneCounts } from './taxTree/countsZone';

// tbrowse-based reimplementation of the Taxonomic-distribution view: the
// species tree becomes a tbrowse tree (cladogram, tips aligned) and the
// per-genome bin distribution becomes a tbrowse zone. Shipped behind the
// `taxTree` view id alongside the legacy `taxonomy` view.

const ZONES = [treeZone, labelsZone, countsZone, binsZone];

// Compress a set of global bin indices into a Solr disjunction, collapsing runs
// of consecutive indices into `[a TO b]` ranges: e.g. {5,6,7,12} →
// "[5 TO 7] OR 12". The explicit `OR` matters: a bare space-separated list
// `(5 6 12)` is evaluated under the index's default operator (AND here), which
// can never match a single-valued field, so it must be an explicit disjunction.
function binIdxsToSolr(idxs) {
  const sorted = [...new Set(idxs)].sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(sorted[i] === sorted[j] ? `${sorted[i]}` : `[${sorted[i]} TO ${sorted[j]}]`);
    i = j + 1;
  }
  return parts.join(' OR ');
}

function baseViewState() {
  return {
    selectedNodeId: null,
    collapsedNodeIds: [],
    prunedNodeIds: [],
    swappedNodeIds: [],
    compressedNodeIds: [],
    nodeOfInterestId: null,
    zones: [
      { id: 'tree', width: 30, visible: true },
      { id: 'labels', width: 22, visible: true },
      { id: 'counts', width: 10, visible: true },
      { id: 'bins', width: 60, visible: true },
    ],
    // Controlled mode supplies zoneStates wholesale, so each must carry the
    // fields its zone reads. The tree zone tolerates a partial state (reads
    // with `?? default`); the labels zone reads `visibleFields` directly, so
    // it must be present. Drive the tree as a cladogram (taxonomy has no
    // branch lengths) and show the genome/species name in the labels column.
    zoneStates: {
      tree: { layoutMode: 'cladogram', showLeafExtensions: false },
      labels: { visibleFields: ['taxonomy.commonName'] },
      counts: {},
      bins: {},
    },
    search: null,
  };
}

// The set of taxa to SHOW, mirroring the legacy TaxDist.js logic.
function computeSelectedTaxa(
  { grameneSearch, grameneGenomes, grameneMaps },
  treeNodes,
  collapseEmpties,
  comparaOnly,
  showCompara,
) {
  const selected = {};
  if (!grameneSearch) return selected;

  if (collapseEmpties) {
    const tids = grameneSearch.facet_counts.facet_fields.taxon_id;
    for (let i = 0; i < tids.length; i += 2) selected[tids[i]] = true;
  } else {
    const active = (grameneGenomes && grameneGenomes.active) || {};
    if (Object.keys(active).length === 0 && grameneMaps) {
      Object.keys(grameneMaps).forEach((tid) => { selected[tid] = true; });
    } else {
      Object.keys(active).forEach((tid) => { selected[tid] = true; });
    }
  }

  if (showCompara && comparaOnly && grameneMaps) {
    Object.keys(selected).forEach((tid) => {
      if (!grameneMaps[tid] || !grameneMaps[tid].in_compara) delete selected[tid];
    });
  }

  // Drop ids the tree doesn't know about.
  Object.keys(selected).forEach((tid) => {
    if (!treeNodes[tid]) delete selected[tid];
  });
  return selected;
}

const TaxDistTbrowse = (props) => {
  const { grameneTaxDist, configuration } = props;

  const adapter = useMemo(() => toTbrowseTree(grameneTaxDist), [grameneTaxDist]);

  // Bins-zone interaction store (hover chromosome / drag-select gene counts),
  // shared between the bins Header and Body via hostData. Kept in a ref so it's
  // stable across renders; cleared when the result set changes (counts stale).
  const binsUiRef = useRef(null);
  if (!binsUiRef.current) binsUiRef.current = createBinsUiStore();
  useEffect(() => { binsUiRef.current.reset(); }, [grameneTaxDist]);

  // "Apply as filter": turn the drag-selections' non-empty bins into a
  // fixed_1000__bin range filter on the search.
  const doAcceptGrameneSuggestion = props.doAcceptGrameneSuggestion;
  const onApplyBinsFilter = useCallback((selections) => {
    if (!selections || !selections.length || !doAcceptGrameneSuggestion) return;
    const idxs = selectedBinIdxs(selections);
    if (!idxs.length) return;
    const total = totalSelectedGenes(selections);
    doAcceptGrameneSuggestion({
      category: 'Selections',
      fq_field: 'fixed_1000__bin',
      fq_value: `(${binIdxsToSolr(idxs)})`,
      name: `${selections.length} region${selections.length === 1 ? '' : 's'} (${total.toLocaleString()} genes)`,
    });
    binsUiRef.current.clear();
  }, [doAcceptGrameneSuggestion]);

  const hostData = useMemo(() => {
    const facet = props.grameneSearch
      && props.grameneSearch.facet_counts
      && props.grameneSearch.facet_counts.facet_fields.taxon_id;
    return {
      bins: extractGenomeData(grameneTaxDist),
      geneCounts: adapter ? computeGeneCounts(adapter.tree, facet) : null,
      binsUI: binsUiRef.current,
      onApplyBinsFilter,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grameneTaxDist, adapter, props.grameneSearch, onApplyBinsFilter]);

  const showCompara = !!(configuration && configuration.hasOwnProperty('partialCompara'));
  // View state (tbrowse ViewState + the two controls) lives in the taxTreeView
  // bundle so a saved view round-trips it. Falls back to the built-in default
  // until the view is interacted with or restored.
  const { viewState: storedViewState, collapseEmpties = true, comparaOnly = true } = props.taxTreeView || {};
  const setTaxTreeView = props.doSetTaxTreeView || (() => {});
  const viewState = useMemo(() => storedViewState || baseViewState(), [storedViewState]);

  // Control-derived prune set: hide every leaf (genome) that isn't selected.
  // Pruning just the leaves is enough — internal nodes with no visible
  // descendants contribute no rows.
  const prunedNodeIds = useMemo(() => {
    if (!adapter) return [];
    const selected = computeSelectedTaxa(
      props,
      adapter.tree.nodes,
      collapseEmpties,
      comparaOnly,
      showCompara,
    );
    return adapter.leafTaxonIds.filter((id) => !selected[id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, collapseEmpties, comparaOnly, showCompara,
    props.grameneSearch, props.grameneGenomes, props.grameneMaps]);

  // Effective (controlled) view state = user interactions + control-driven
  // pruning. Memoised so the reference is stable across unrelated renders.
  const effectiveViewState = useMemo(
    () => ({ ...viewState, prunedNodeIds }),
    [viewState, prunedNodeIds],
  );

  // Initial pixel widths for the text columns (wide screens only). tbrowse
  // zone widths are fr-shares: rendered px = width / Σwidths × viewport. If we
  // make Σwidths equal the available width, 1fr ≈ 1px, so these fr values land
  // at the requested pixels while the bins zone flexes for the remainder. Set
  // once at mount; the zones stay resizable afterward.
  const wrapperRef = useRef(null);
  const sizedRef = useRef(false);
  useLayoutEffect(() => {
    // Skip when a stored/restored viewState already exists — its widths win.
    if (sizedRef.current || !adapter || storedViewState) return;
    const el = wrapperRef.current;
    if (!el || el.clientWidth <= 0 || window.innerWidth < 800) return;
    sizedRef.current = true;
    const TARGET = { tree: 270, labels: 200, counts: 64 };
    const used = TARGET.tree + TARGET.labels + TARGET.counts;
    const binsW = Math.max(160, el.clientWidth - used);
    const base = baseViewState();
    setTaxTreeView({
      viewState: {
        ...base,
        zones: base.zones.map((z) => ({
          ...z,
          width: z.id === 'bins' ? binsW : (TARGET[z.id] ?? z.width),
        })),
      },
    });
  }, [adapter, storedViewState, setTaxTreeView]);

  if (!adapter) {
    return <div className="results-vis"><em>Loading taxonomy…</em></div>;
  }

  // Compact, single-line buttons so they sit cleanly in the 32px tbrowse
  // toolbar row instead of wrapping and overflowing onto the zone headers.
  const actionBtnStyle = { whiteSpace: 'nowrap', lineHeight: 1.1, padding: '1px 8px', fontSize: 12 };
  const headerActions = (
    <>
      <button
        type="button"
        className="btn btn-outline-primary btn-sm"
        style={actionBtnStyle}
        onClick={() => setTaxTreeView({ collapseEmpties: !collapseEmpties })}
      >
        {collapseEmpties ? 'Expand' : 'Collapse'} empty branches
      </button>
      {showCompara && (
        <button
          type="button"
          className="btn btn-outline-success btn-sm"
          style={actionBtnStyle}
          onClick={() => setTaxTreeView({ comparaOnly: !comparaOnly })}
        >
          Show {comparaOnly ? 'all genomes' : 'only genomes in gene trees'}
        </button>
      )}
    </>
  );

  return (
    <div className="results-vis big-vis">
      {/* No fixed height: autoHeight sizes the chassis to its content so the
          tree/zones grow to fit every genome with no scrollbar or white space
          below the last row. */}
      <div ref={wrapperRef}>
        <TBrowse
          tree={adapter.tree}
          taxonomy={adapter.taxonomy}
          hostData={hostData}
          zones={ZONES}
          showHeader={true}
          rowHeight={14}
          fontSize={10}
          autoHeight={true}
          defaultOpenSections={{ search: true, zones: true }}
          headerActions={headerActions}
          viewState={effectiveViewState}
          onViewStateChange={(next) => setTaxTreeView({ viewState: next })}
        />
      </div>
    </div>
  );
};

export default connect(
  'selectConfiguration',
  'selectGrameneTaxDist',
  'selectGrameneGenomes',
  'selectGrameneSearch',
  'selectGrameneMaps',
  'selectTaxTreeView',
  'doAcceptGrameneSuggestion',
  'doSetTaxTreeView',
  TaxDistTbrowse,
);
