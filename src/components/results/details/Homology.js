import React from 'react'
import _ from 'lodash';
import {connect} from "redux-bundler-react";
import TreeVis from "gramene-genetree-vis";
// Subpath imports avoid gramene-trees-client/index.js, whose require chain
// fires a /swagger fetch at module load (see comment in bundles/api.js).
import taxonomy from "gramene-trees-client/src/taxonomy";
import genetree from "gramene-trees-client/src/genetree";
import {
  TBrowse,
  computePivotState,
  createGenomeZone,
  fromGrameneGenetree,
  fromGrameneGeneStructures,
  fromGrameneNeighborhood,
  labelsZone,
  msaZone,
  neighborhoodZone,
  treeZone,
} from "tbrowse";
import {Detail, Title, Description, Content, Explore, Links} from "./generic";
import {exprAttrsZone, buildExprData} from "./exprAttrsZone";
import {suggestionToFilters} from "../../utils";
import {Spinner} from "react-bootstrap";
import '../../../../node_modules/gramene-genetree-vis/src/styles/msa.less';
import '../../../../node_modules/gramene-genetree-vis/src/styles/tree.less';
import './tree-view.css';

const genomeZone = createGenomeZone({id: 'genome'});
// The genome (gene-structure) zone is gated behind the site-config flag
// `enable_tbrowse_genome_zone` (defaults to false) — see getTbrowseZones().
const TBROWSE_BASE_ZONES = [treeZone, labelsZone, msaZone, neighborhoodZone];

class Homology extends React.Component {
  constructor(props) {
    super(props);
    // Async data caches stay in local state (per mount, per tree). The
    // user-controlled view state (viewer toggle, resize height, tbrowse
    // ViewState) is lifted into the uiViewState bundle, keyed by geneId.
    //
    // `*Status` fields track per-zone load lifecycle so the TBrowse
    // toolbar can render loading/error affordances via its zoneStatus
    // prop. They start `undefined` (no signal); flipped to 'loading'
    // when the fetch kicks off and 'ready' / 'error' on settle.
    this.state = {
      neighborhood: null,
      neighborhoodTreeId: null,
      neighborhoodStatus: undefined,
      geneStructures: null,
      geneStructuresTreeId: null,
      geneStructuresStatus: undefined,
      exprAttrs: null,
      exprAttrsTreeId: null,
      exprAttrsStatus: undefined,
    };
    if (!props.geneDocs.hasOwnProperty(props.searchResult.id)) {
      props.requestGene(props.searchResult.id)
    }
    this.taxonomy = taxonomy.tree(Object.values(props.grameneTaxonomy))
  }
  // ----- uiViewState accessors (with sensible defaults) -----
  getGeneId() { return this.props.searchResult.id; }
  getHomologySlice() {
    const slice = this.props.uiViewState && this.props.uiViewState.byGene[this.getGeneId()];
    return (slice && slice.homology) || {};
  }
  getViewer() { return this.getHomologySlice().viewer || 'tbrowse'; }
  // The genome (gene-structure) zone is opt-in per site via
  // `enable_tbrowse_genome_zone` (defaults to false).
  isGenomeZoneEnabled() {
    return !!(this.props.configuration && this.props.configuration.enable_tbrowse_genome_zone);
  }
  // The expression-attributes zone is opt-in per site via
  // `enable_tbrowse_expression_zone` (defaults to false) — the expr_*__attr_*
  // fields are sorghum-specific.
  isExpressionZoneEnabled() {
    return !!(this.props.configuration && this.props.configuration.enable_tbrowse_expression_zone);
  }
  getTbrowseZones() {
    const zones = [...TBROWSE_BASE_ZONES];
    if (this.isGenomeZoneEnabled()) zones.push(genomeZone);
    if (this.isExpressionZoneEnabled()) zones.push(exprAttrsZone);
    return zones;
  }
  getHeight() {
    const h = this.getHomologySlice().height;
    return typeof h === 'number' ? h : 600;
  }
  setViewer(viewer) {
    this.props.doSetHomologyViewer({geneId: this.getGeneId(), viewer});
  }
  setHeight(height) {
    this.props.doSetHomologyHeight({geneId: this.getGeneId(), height});
  }
  setTbrowseViewState(viewState) {
    this.props.doSetHomologyTbrowseViewState({geneId: this.getGeneId(), tbrowse: viewState});
  }
  // When the user has limited the search to a subset of genomes
  // (grameneGenomes.active), prune the gene tree to genes from those genomes
  // — mirroring the taxon_id filter api.js applies to the search itself, and
  // the genomesOfInterest TreeVis already honours. Returns the ids of the
  // highest nodes whose entire subtree lies outside the active set (maximal
  // excluded clades), rather than individual leaves: tbrowse then sheds one
  // stub per clade instead of one per leaf, and its single-marker count is
  // meaningful. The gene of interest is always kept so the tree never
  // collapses to nothing. Empty active set means "no limit" → full tree.
  getGenomePrunedIds() {
    const active = (this.props.grameneGenomes && this.props.grameneGenomes.active) || {};
    const activeIds = Object.keys(active);
    if (activeIds.length === 0) return [];
    if (!this._tbrowseData) return [];
    const activeSet = new Set(activeIds.map(String));
    const keepGeneId = this.gene && this.gene._id;
    const nodes = this._tbrowseData.tree.nodes;
    const children = {};
    Object.values(nodes).forEach(n => {
      if (n.parentId != null) (children[n.parentId] = children[n.parentId] || []).push(n.id);
    });
    // hasKept(node): does the subtree contain a leaf we must keep (its taxon
    // is active, or it's the gene of interest)? Memoised post-order walk.
    const memo = {};
    const hasKept = (id) => {
      if (id in memo) return memo[id];
      const n = nodes[id];
      const v = n.isLeaf
        ? ((n.taxonomyId != null && activeSet.has(String(n.taxonomyId))) || n.geneId === keepGeneId)
        : (children[id] || []).some(hasKept);
      memo[id] = v;
      return v;
    };
    // A node is a maximal excluded clade when it keeps nothing but its parent
    // does (or it's the root) — i.e. the highest fully-excluded node on its
    // path. The root always keeps the gene of interest, so it is never pruned.
    return Object.values(nodes)
      .filter(n => !hasKept(n.id) && (n.parentId == null || hasKept(n.parentId)))
      .map(n => n.id);
  }
  // Seed the bundle with a pivot-computed initial tbrowse view state once the
  // tree data is available and the user is actually looking at the tbrowse
  // viewer. Called from lifecycle (not render) to avoid dispatching mid-render.
  maybeSeedTbrowseViewState() {
    if (this.getViewer() !== 'tbrowse') return;
    if (this.getHomologySlice().tbrowse) return;
    const id = this.getGeneId();
    if (!this.props.geneDocs.hasOwnProperty(id)) return;
    const gene = this.props.geneDocs[id];
    if (!gene.homology) return;
    const treeId = gene.homology.gene_tree.id;
    const raw = this.props.grameneTrees[treeId];
    if (!raw || !raw.taxon_id) return;
    const adapted = fromGrameneGenetree([raw]);
    const pivot = computePivotState(adapted.tree, gene._id);
    this.setTbrowseViewState({
      selectedNodeId: null,
      collapsedNodeIds: pivot ? pivot.collapsedNodeIds : [],
      prunedNodeIds: [],
      swappedNodeIds: pivot ? pivot.swappedNodeIds : [],
      compressedNodeIds: [],
      nodeOfInterestId: pivot ? pivot.targetId : null,
      // Use each zone's intended fr-share + initial visibility from its
      // definition (tree:30 / labels:20 / msa:50 / neighborhood:30 /
      // genome:32) instead of uniform 25 across the board. Gives the MSA
      // a wider initial pane and the tree a narrower one.
      //
      // `defaultVisible ?? true` matches tbrowse's own buildInitialViewState
      // logic — zones default to visible unless their definition opts out
      // (e.g. neighborhood and genome opt out so they only appear once
      // their async data lands; tbrowse's Layout auto-flips them on then).
      zones: this.getTbrowseZones().map(z => ({
        id: z.id,
        width: z.defaultWidth,
        visible: z.defaultVisible ?? true
      })),
      zoneStates: {},
      search: null,
    });
  }
  componentDidMount() {
    this.maybeSeedTbrowseViewState();
    this.maybeFetchTbrowseData();
  }
  componentDidUpdate() {
    this.maybeSeedTbrowseViewState();
    this.maybeFetchTbrowseData();
  }
  // Kick off the neighborhood + gene-structure fetches from lifecycle,
  // not render. Each fetch internally dedupes on `_*FetchedFor === treeId`
  // so calling on every commit is cheap. Gated on the user actually being
  // on the tbrowse viewer + the tree data being loaded — otherwise we'd
  // pay network cost for genes the user never looks at.
  maybeFetchTbrowseData() {
    if (this.getViewer() !== 'tbrowse') return;
    const id = this.getGeneId();
    if (!this.props.geneDocs.hasOwnProperty(id)) return;
    const gene = this.props.geneDocs[id];
    if (!gene.homology) return;
    const treeId = gene.homology.gene_tree.id;
    const raw = this.props.grameneTrees[treeId];
    if (!raw || !raw.taxon_id) return;
    // Lazily compute the adapted tbrowse data the same way renderTBrowse
    // does, so fetchGeneStructures has the leaf ids without rerunning
    // fromGrameneGenetree on every commit.
    if (this._tbrowseTreeId !== treeId) {
      this._tbrowseTreeId = treeId;
      this._tbrowseData = fromGrameneGenetree([raw]);
    }
    this.fetchNeighborhood(treeId);
    // Only pay for gene-structure data when the genome zone is actually enabled.
    if (this.isGenomeZoneEnabled()) {
      this.fetchGeneStructures(treeId, this._tbrowseData.tree);
    }
    // Same for the per-gene expression attributes zone.
    if (this.isExpressionZoneEnabled()) {
      this.fetchExprAttrs(treeId, this._tbrowseData.tree);
    }
  }
  fetchNeighborhood(treeId) {
    if (this._neighborhoodFetchedFor === treeId) return;
    this._neighborhoodFetchedFor = treeId;
    this.setState({neighborhoodStatus: 'loading'});
    const api = this.props.grameneAPI;
    const url = new URL(`${api}/search`);
    url.searchParams.set('fl', 'id,name,gene_tree,gene_idx,region,start,end,strand,biotype,system_name,description');
    url.searchParams.set('fq', `{!graph from=compara_neighbors_10 to=compara_idx_multi maxDepth=1}gene_tree:${treeId}`);
    url.searchParams.set('rows', '100000');
    url.searchParams.set('start', '0');
    fetch(url.toString(), {headers: {Accept: 'application/json'}})
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (this._neighborhoodFetchedFor !== treeId) return;
        this.setState({
          neighborhood: fromGrameneNeighborhood(json),
          neighborhoodTreeId: treeId,
          neighborhoodStatus: 'ready',
        });
      })
      .catch(err => {
        console.warn('tbrowse neighborhood fetch failed:', err);
        // Surface the failure via the zoneStatus prop. Reset the
        // dedupe key so a re-mount or tree-change can retry.
        if (this._neighborhoodFetchedFor === treeId) {
          this.setState({neighborhoodStatus: 'error'});
        }
        this._neighborhoodFetchedFor = null;
      });
  }
  fetchGeneStructures(treeId, tree) {
    if (this._geneStructuresFetchedFor === treeId) return;
    this._geneStructuresFetchedFor = treeId;
    const ids = Object.values(tree.nodes)
      .filter(n => n.isLeaf && n.geneId)
      .map(n => n.geneId);
    if (ids.length === 0) return;
    this.setState({geneStructuresStatus: 'loading'});
    const api = this.props.grameneAPI;
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }
    const fetchBatch = (batch) => {
      const url = new URL(`${api}/genes`);
      url.searchParams.set('idList', batch.join(','));
      url.searchParams.set('rows', '-1');
      return fetch(url.toString(), {headers: {Accept: 'application/json'}})
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
    };
    Promise.all(batches.map(fetchBatch))
      .then(results => {
        if (this._geneStructuresFetchedFor !== treeId) return;
        const combined = [].concat(...results.map(r => Array.isArray(r) ? r : []));
        this.setState({
          geneStructures: fromGrameneGeneStructures(combined),
          geneStructuresTreeId: treeId,
          geneStructuresStatus: 'ready',
        });
      })
      .catch(err => {
        console.warn('tbrowse gene-structures fetch failed:', err);
        if (this._geneStructuresFetchedFor === treeId) {
          this.setState({geneStructuresStatus: 'error'});
        }
        this._geneStructuresFetchedFor = null;
      });
  }
  // Fetch the expression attributes (expr_*__attr_*) for this tree's genes in a
  // single query: scope by gene_tree and the `expression_attributes` capability
  // so only genes that actually have the data come back (rows high enough to
  // cover the whole tree). Uses /search (not /genes, whose trimmed docs omit the
  // attr fields) with an fl glob so the columns are discovered from the data
  // rather than hard-coded. `tree` is still needed to map gene ids to leaf node
  // ids (see buildExprByNode).
  fetchExprAttrs(treeId, tree) {
    if (this._exprAttrsFetchedFor === treeId) return;
    this._exprAttrsFetchedFor = treeId;
    this.setState({exprAttrsStatus: 'loading'});
    const api = this.props.grameneAPI;
    const url = new URL(`${api}/search`);
    url.searchParams.set('q', '*:*');
    url.searchParams.append('fq', `gene_tree:${treeId}`);
    url.searchParams.append('fq', 'capabilities:expression_attributes');
    url.searchParams.set('fl', 'id,expr_*__attr_*');
    url.searchParams.set('rows', '10000');
    fetch(url.toString(), {headers: {Accept: 'application/json'}})
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (this._exprAttrsFetchedFor !== treeId) return;
        const docs = (json && json.response && Array.isArray(json.response.docs)) ? json.response.docs : [];
        this.setState({
          exprAttrs: buildExprData(docs, tree),
          exprAttrsTreeId: treeId,
          exprAttrsStatus: 'ready',
        });
      })
      .catch(err => {
        console.warn('tbrowse expression-attrs fetch failed:', err);
        if (this._exprAttrsFetchedFor === treeId) {
          this.setState({exprAttrsStatus: 'error'});
        }
        this._exprAttrsFetchedFor = null;
      });
  }
  startResize(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = this.getHeight();

    const onMouseMove = (moveEvent) => {
      const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
      this.setHeight(newHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
  renderResizeHandle() {
    return (
      <div
        className="details-resize-handle"
        onMouseDown={(e) => this.startResize(e)}
        title="Drag to resize"
      />
    );
  }
  renderTreeVis() {
    return (
      <>
        <div className="gene-genetree" style={{height: this.getHeight(), width: '100%'}}>
          <TreeVis genetree={this.tree}
                   initialGeneOfInterest={this.gene}
                   genomesOfInterest={this.props.grameneGenomes.active}
                   taxonomy={this.taxonomy}
                   allowGeneSelection={true}
                   pivotTree={true}
                   enableCuration={false}
                   enablePhyloview={true}
                   numberOfNeighbors={10}
                   ensemblUrl={this.props.configuration.ensemblURL}/>
        </div>
        {this.renderResizeHandle()}
      </>
    )
  }
  renderTBrowse() {
    const treeId = this.gene.homology.gene_tree.id;
    // Adapted tbrowse data is computed lazily in maybeFetchTbrowseData
    // (called from lifecycle). If the user just flipped to tbrowse and
    // the lifecycle hasn't fired yet, compute it once here without
    // calling any fetches — those will fire from componentDidUpdate.
    if (this._tbrowseTreeId !== treeId) {
      this._tbrowseTreeId = treeId;
      this._tbrowseData = fromGrameneGenetree([this.props.grameneTrees[treeId]]);
    }
    const neighborhood = this.state.neighborhoodTreeId === treeId ? this.state.neighborhood : undefined;
    const geneStructures = this.state.geneStructuresTreeId === treeId ? this.state.geneStructures : undefined;
    const exprAttrs = this.state.exprAttrsTreeId === treeId ? this.state.exprAttrs : undefined;
    // Per-zone status for the TBrowse toolbar — pulses while a fetch
    // is in flight, turns red on failure. Tracked per-tree so a
    // tree-change resets any stale 'ready'/'error' from the prior gene.
    const zoneStatus = {
      neighborhood: this.state.neighborhoodTreeId === treeId
        ? this.state.neighborhoodStatus
        : (this.state.neighborhoodStatus === 'loading' ? 'loading' : undefined),
      genome: this.state.geneStructuresTreeId === treeId
        ? this.state.geneStructuresStatus
        : (this.state.geneStructuresStatus === 'loading' ? 'loading' : undefined),
      expression: this.state.exprAttrsTreeId === treeId
        ? this.state.exprAttrsStatus
        : (this.state.exprAttrsStatus === 'loading' ? 'loading' : undefined),
    };
    // Bundle-driven (controlled) view state. If we're rendering tbrowse before
    // componentDidMount/Update has seeded the bundle slice, skip this turn and
    // let the re-render with the seeded state do the work.
    const tbrowseVS = this.getHomologySlice().tbrowse;
    if (!tbrowseVS) return null;
    // Layer the genome-limit prune set on top of the user's own prunes for the
    // controlled view state, but persist only the user's prunes (strip the
    // genome-derived ones in onViewStateChange) so the bundle stays free of
    // filter-derived state and re-applies cleanly when the filter changes.
    const genomePrunedIds = this.getGenomePrunedIds();
    const effectiveVS = genomePrunedIds.length
      ? {...tbrowseVS, prunedNodeIds: _.union(tbrowseVS.prunedNodeIds || [], genomePrunedIds)}
      : tbrowseVS;
    const onViewStateChange = genomePrunedIds.length
      ? (next => {
          const genomeSet = new Set(genomePrunedIds);
          this.setTbrowseViewState({
            ...next,
            prunedNodeIds: (next.prunedNodeIds || []).filter(id => !genomeSet.has(id)),
          });
        })
      : (next => this.setTbrowseViewState(next));
    return (
      <>
        <div className="gene-genetree" style={{height: this.getHeight(), width: '100%'}}>
          <TBrowse
            tree={this._tbrowseData.tree}
            taxonomy={this._tbrowseData.taxonomy}
            msa={this._tbrowseData.msa}
            geneMetadata={this._tbrowseData.geneMetadata}
            proteinDomains={this._tbrowseData.proteinDomains}
            exonJunctions={this._tbrowseData.exonJunctions}
            neighborhood={neighborhood}
            geneStructures={geneStructures}
            hostData={exprAttrs ? {exprAttrs} : undefined}
            zones={this.getTbrowseZones()}
            nodeOfInterest={this.gene._id}
            viewState={effectiveVS}
            onViewStateChange={onViewStateChange}
            defaultOpenSections={{ zones: true, search: true }}
            zoneStatus={zoneStatus}
          />
        </div>
        {this.renderResizeHandle()}
      </>
    )
  }
  renderViewerToggle() {
    const viewer = this.getViewer();
    const btn = (id, label) => (
      <button
        key={id}
        type="button"
        onClick={() => this.setViewer(id)}
        style={{
          padding: '4px 10px',
          marginRight: 4,
          fontSize: 12,
          border: '1px solid #ccc',
          background: viewer === id ? '#2878dc' : '#fff',
          color: viewer === id ? '#fff' : '#222',
          cursor: 'pointer',
          borderRadius: 3,
        }}>
        {label}
      </button>
    );
    return (
      <div style={{margin: '8px 0'}}>
        {btn('tbrowse', 'TBrowse')}
        {btn('treevis', 'TreeVis')}
      </div>
    );
  }
  filterAllHomologs() {
    this.props.doReplaceGrameneFilters(suggestionToFilters({
      category: 'Gene Tree',
      fq_field: 'gene_tree',
      fq_value: this.tree._id,
      name: `Homologs of ${this.gene.name}`
    }))
  }
  filterOrthologs() {
    this.props.doReplaceGrameneFilters(suggestionToFilters({
      category: 'Gene Tree',
      fq_field: 'homology__all_orthologs',
      fq_value: this.gene._id,
      name: `Orthologs of ${this.gene.name}`
    }))
  }
  filterParalogs() {
    this.props.doReplaceGrameneFilters(suggestionToFilters({
      category: 'Gene Tree',
      fq_field: 'homology__within_species_paralog',
      fq_value: this.gene._id,
      name: `Paralogs of ${this.gene.name}`
    }))
  }
  searchSupertree() {
    this.props.doReplaceGrameneFilters(suggestionToFilters({
      category: 'Gene Tree',
      fq_field: 'supertree_attr_s',
      fq_value: this.gene.homology.supertree,
      name: this.gene.homology.supertree
    }))
  }
  orthologList() {
    return this.orthoParaList('ortholog');
  }

  paralogList() {
    return this.orthoParaList('within_species_paralog');
  }

  orthoParaList(type) {
    var homology, thisGeneId;
    homology = _.get(this.gene, 'homology.homologous_genes');
    thisGeneId = this.gene._id;

    if (homology) {
      var homologs = _(homology)
        .pickBy(function filterCategories(thing, name) {
          return name.indexOf(type) === 0;
        })
        .values()
        .flatten()
        .uniq()
        .value();

      if (!_.isEmpty(homologs)) {
        if (!homologs.includes(thisGeneId)) {
          console.log("add to homologs list",thisGeneId);
          homologs.push(thisGeneId);
        }
        return homologs; // only return something if we have something. We're testing for truthiness later.
      }
    }
  }
  explorations() {
    let x = [{
      name: 'Homologs',
      category: 'Gene Tree',
      count: this.tree.geneCount,
      handleClick: this.filterAllHomologs.bind(this)
    }];
    if (this.orthologs) {
      x.push({
        name: 'Orthologs',
        category: 'Gene Tree',
        count: this.orthologs.length,
        handleClick: this.filterOrthologs.bind(this)
      });
    }
    if (this.paralogs) {
      x.push({
        name: 'Paralogs',
        category: 'Gene Tree',
        count: this.paralogs.length,
        handleClick: this.filterParalogs.bind(this)
      });
    }
    if (this.gene.homology.supertree) {
      x.push({
        name: `Supertree`,
        category: `Gene Tree`,
        count: this.gene.homology.supertree,
        handleClick: this.searchSupertree.bind(this)
      })
    }
    return x;
  }
  links() {
    let links = [
      {
        name: 'Ensembl Gene Tree view',
        url: `${this.props.configuration.ensemblURL}/${this.gene.system_name}/Gene/Compara_Tree?g=${this.gene._id}`
      }
    ];
    if (this.props.curation && this.props.curation.taxa.hasOwnProperty(this.gene.taxon_id)) {
      links.push({
        name: 'Curate',
        url: this.props.curation.url + this.gene._id
      })
    }
    return links;
  }
  render() {
    const id = this.props.searchResult.id;
    if (!this.props.geneDocs.hasOwnProperty(id)) {
      return <Spinner/>
    }
    this.gene = this.props.geneDocs[id];
    const treeId = this.gene.homology.gene_tree.id;
    if (! this.props.grameneTrees.hasOwnProperty(treeId)) {
      this.props.doRequestGrameneTree(treeId);
    }
    else {
      const tree = this.props.grameneTrees[treeId];
      if (tree.hasOwnProperty('taxon_id')) {
        this.tree = genetree.tree([this.props.grameneTrees[treeId]]);
        this.orthologs = this.orthologList();
        this.paralogs = this.paralogList();
      }
    }
    return (
      <Detail>
        {/*<Title key="title">Compara Gene Tree</Title>*/}
        <Description key="description">
          This phylogram shows the relationships between this gene and others similar to it, as determined by Ensembl Compara.
        </Description>
        {this.tree && <Content key="content">
          {this.renderViewerToggle()}
          {this.getViewer() === 'tbrowse' ? this.renderTBrowse() : this.renderTreeVis()}
        </Content>}
        {this.tree && <Explore key="explore" explorations={this.explorations()}/>}
        <Links key="links" links={this.links()}/>
      </Detail>
    )
  }
}

export default connect(
  'selectGrameneTaxonomy',
  'selectGrameneTrees',
  'selectGrameneGenomes',
  'selectGrameneAPI',
  'selectConfiguration',
  'selectCuration',
  'selectUiViewState',
  'doRequestGrameneTree',
  'doSetHomologyViewer',
  'doSetHomologyHeight',
  'doSetHomologyTbrowseViewState',
  'doAcceptGrameneSuggestion',
  'doReplaceGrameneFilters',
  Homology
);

