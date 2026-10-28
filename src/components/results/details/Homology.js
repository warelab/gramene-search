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
  createGenomeZone,
  labelsZone,
  msaZone,
  neighborhoodZone,
  treeZone,
} from "tbrowse";
import {
  applyPivot,
  buildInitialViewState,
  computePivotState,
  createDerivedPruneLayer,
  createLoader,
  defineSlot,
  ensureZones,
  extendSource,
  fetchGrameneExprAttrDocs,
  grameneGeneTreeSource,
  hostPropsFrom,
  maximalExcludedClades,
  softResetForNewTree,
} from "tbrowse-core";
import {Detail, Title, Description, Content, Explore, Links} from "./generic";
import {exprAttrsZone, buildExprData} from "./exprAttrsZone";
import {suggestionToFilters} from "../../utils";
import {Spinner} from "react-bootstrap";
import '../../../../node_modules/gramene-genetree-vis/src/styles/msa.less';
import '../../../../node_modules/gramene-genetree-vis/src/styles/tree.less';
import './tree-view.css';

// A gene's trees: the main Compara tree (homology.gene_tree) and/or trees in
// clade-specific tree sets, homology.<tree_set> — e.g. a wheat gene may carry
// gene_tree, homology.wheat = {id: 'EplWheatGT_…'} and homology.barley. Solr
// indexes each tree id under the same name (gene_tree, wheat, barley, …), so
// `field` is also the fq field. gene_tree comes first; empty when the gene
// has homologues but no tree at all.
const NOT_TREE_KEYS = ['homologous_genes', 'supertree'];
function geneTreeRefs(gene) {
  const h = gene && gene.homology;
  if (!h) return [];
  const isTree = k => !NOT_TREE_KEYS.includes(k) && h[k] && typeof h[k] === 'object' && typeof h[k].id === 'string';
  const keys = Object.keys(h).filter(isTree);
  keys.sort((a, b) => (a === 'gene_tree' ? -1 : b === 'gene_tree' ? 1 : 0));
  return keys.map(field => ({field, id: h[field].id, rootTaxonName: h[field].root_taxon_name}));
}

// The tree to show: the one picked in the switcher (`field`), else the first.
function geneTreeRef(gene, field) {
  const refs = geneTreeRefs(gene);
  return refs.find(r => r.field === field) || refs[0] || null;
}

// Switcher label: the tree set and the clade the tree is rooted at.
const treeLabel = ref => {
  const set = ref.field === 'gene_tree' ? 'Compara' : ref.field.charAt(0).toUpperCase() + ref.field.slice(1);
  return ref.rootTaxonName ? `${set} · ${ref.rootTaxonName}` : set;
};

const genomeZone = createGenomeZone({id: 'genome'});
// The genome (gene-structure) zone is gated behind the site-config flag
// `enable_tbrowse_genome_zone` (defaults to false) — see getTbrowseZones().
const TBROWSE_BASE_ZONES = [treeZone, labelsZone, msaZone, neighborhoodZone];

// The expression-attributes zone's data, as a slot on tbrowse-core's Gramene
// gene-tree source: one tree-scoped /search for the expr_*__attr_* fields
// (fetchGrameneExprAttrDocs), shaped by buildExprData and delivered through
// hostData.exprAttrs — the same lifecycle as the built-in neighborhood and
// gene-structure slots. Enabled per site via the ctx flag the component
// derives from `enable_tbrowse_expression_zone`. Scoped by root.meta, which
// carries the Solr field holding the tree id: gene_tree, or a clade tree set
// such as wheat.
const exprAttrsSlot = defineSlot({
  id: 'exprAttrs',
  enabled: (ctx) => ctx.expression === true,
  run: async ({ctx, fetch, signal, tree, root}) =>
    buildExprData(
      await fetchGrameneExprAttrDocs(ctx.base, root.meta.treeId, {treeField: root.meta.treeField, fetch, signal}),
      tree,
    ),
  toHostData: (v) => ({hostData: {exprAttrs: v}}),
});
const homologySource = extendSource(grameneGeneTreeSource, {
  id: 'gramene-homology',
  slots: [exprAttrsSlot],
});
// Host zone id → the slot(s) feeding it, so the TBrowse toolbar shows the
// per-zone loading / error affordances (TBrowseProps.zoneStatus).
const ZONE_SLOTS = {
  neighborhood: ['neighborhood'],
  genome: ['geneStructures'],
  expression: ['exprAttrs'],
};

// Per-zone settings that point into one tree's rows or alignment columns
// (row flips, per-gap / per-intron overrides, the MSA viewport and expanded
// mask runs, the genome pan), reset when a tree switch carries the rest of
// the zone settings over.
const TREE_SCOPED_ZONE_FIELDS = {
  flippedNodeIds: [],
  gapOverrideKeys: [],
  intronOverrideKeys: [],
  viewportStart: 0,
  viewportEnd: 0,
  panPx: 0,
};
function carryViewState(vs) {
  const soft = softResetForNewTree(vs);
  const zoneStates = _.mapValues(soft.zoneStates || {}, zs => {
    if (!_.isPlainObject(zs)) return zs;
    const next = {...zs};
    Object.keys(TREE_SCOPED_ZONE_FIELDS).forEach(k => { if (k in next) next[k] = TREE_SCOPED_ZONE_FIELDS[k]; });
    if (next.mask && next.mask.expandedRuns) next.mask = {...next.mask, expandedRuns: []};
    return next;
  });
  return {...soft, zoneStates};
}

class Homology extends React.Component {
  constructor(props) {
    super(props);
    // The tbrowse data — tree, MSA, domains and junctions adapted from the
    // stored genetree doc, then the neighborhood / gene-structure / expression
    // slots — is loaded by a tbrowse-core loader kept on the instance (one per
    // mount); its snapshot is mirrored into state so renders follow it. The
    // user-controlled view state (viewer toggle, resize height, tbrowse
    // ViewState) is lifted into the uiViewState bundle, keyed by geneId.
    this.loader = createLoader(homologySource, {zoneSlots: ZONE_SLOTS});
    this.state = {snap: this.loader.getSnapshot()};
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
  // The gene's selected tree (see the tree switcher in renderViewerToggle).
  selectedTreeRef(gene) { return geneTreeRef(gene, this.getHomologySlice().tree); }
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
  setTree(field) {
    if (this.treeRef && this.treeRef.field === field) return;
    this.props.doSetHomologyTree({geneId: this.getGeneId(), tree: field});
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
  // the genomesOfInterest TreeVis already honours. tbrowse-core's
  // maximalExcludedClades returns the ids of the highest nodes whose entire
  // subtree lies outside the active set (maximal excluded clades), rather
  // than individual leaves: tbrowse then sheds one stub per clade instead of
  // one per leaf, and its single-marker count is meaningful. The gene of
  // interest is always kept so the tree never collapses to nothing. Empty
  // active set means "no limit" → full tree.
  getGenomePrunedIds() {
    const active = (this.props.grameneGenomes && this.props.grameneGenomes.active) || {};
    const activeIds = Object.keys(active);
    if (activeIds.length === 0) return [];
    const snap = this.state.snap;
    if (!snap.tree) return [];
    const activeSet = new Set(activeIds.map(String));
    const keepGeneId = this.gene && this.gene._id;
    return maximalExcludedClades(snap.tree, (leaf) =>
      (leaf.taxonomyId != null && activeSet.has(String(leaf.taxonomyId))) || leaf.geneId === keepGeneId);
  }
  // The Expression zone's "expressed only" toggle (zoneStates.expression
  // .expressedOnly): while it is on and the zone is visible, prune the largest
  // branches with no leaf carrying expression attributes. The gene of interest
  // stays, as with the genome prunes, so the root is never pruned.
  getExpressionPrunedIds(vs, hostProps) {
    const zs = vs && vs.zoneStates && vs.zoneStates.expression;
    if (!zs || !zs.expressedOnly) return [];
    if (!(vs.zones || []).some(z => z.id === 'expression' && z.visible)) return [];
    const ea = hostProps && hostProps.hostData && hostProps.hostData.exprAttrs;
    if (!ea || !ea.byNode || !hostProps.tree) return [];
    const keepGeneId = this.gene && this.gene._id;
    return maximalExcludedClades(hostProps.tree, (leaf) =>
      ea.byNode.hasOwnProperty(leaf.id) || leaf.geneId === keepGeneId);
  }
  // Turning "expressed only" on also expands every branch, so the expressed
  // genes left after pruning are all in view. Done here, in the same update
  // as the toggle, rather than by a second viewer action that would race it.
  expandOnExpressedOnly(prev, next) {
    const was = !!(prev && prev.zoneStates && prev.zoneStates.expression && prev.zoneStates.expression.expressedOnly);
    const is = !!(next && next.zoneStates && next.zoneStates.expression && next.zoneStates.expression.expressedOnly);
    return !was && is ? {...next, collapsedNodeIds: []} : next;
  }
  // Seed the bundle with a pivot-computed initial tbrowse view state once the
  // loader has the tree and the user is actually looking at the tbrowse
  // viewer, from lifecycle (not render) to avoid dispatching mid-render. The
  // dispatch lands synchronously in the per-gene slice, so the slice check is
  // the dedupe. buildInitialViewState is the same routine the chassis runs in
  // uncontrolled mode (each zone's fr-share, initial visibility, default
  // per-zone state); the pivot is computed for THIS gene — the loader is
  // shared by every gene of the tree, so its own pivot may be another gene's.
  // After a tree switch the seed starts from the previous tree's state instead,
  // minus its node ids, so the zones and display settings stay as they were.
  maybeSeedTbrowseViewState() {
    if (this.getViewer() !== 'tbrowse') return;
    if (this.getHomologySlice().tbrowse) return;
    if (!this.gene) return;
    // The live snapshot, not the mirrored one: right after a tree switch the
    // loader has already restarted but state.snap still holds the old tree.
    const snap = this.loader.getSnapshot();
    const ref = this.selectedTreeRef(this.gene);
    if (!ref || snap.status !== 'ready' || !snap.tree || !snap.root || snap.root.meta.treeId !== ref.id) return;
    const zones = this.getTbrowseZones();
    const carry = this.getHomologySlice().tbrowseCarry;
    const base = carry ? ensureZones(carryViewState(carry), zones) : buildInitialViewState(zones);
    this.setTbrowseViewState(applyPivot(base, computePivotState(snap.tree, this.gene._id)));
  }
  componentDidMount() {
    this._unsubscribe = this.loader.subscribe(() => this.setState({snap: this.loader.getSnapshot()}));
    this.maybeStartLoader();
    this.maybeSeedTbrowseViewState();
  }
  componentDidUpdate() {
    this.maybeStartLoader();
    this.maybeSeedTbrowseViewState();
  }
  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
    this.loader.dispose();
  }
  // Start the loader (or restart it when the gene's tree changes) from
  // lifecycle, not render. Gated on the user actually being on the tbrowse
  // viewer + the tree doc being loaded — otherwise we'd pay network cost for
  // genes the user never looks at. The stored genetree doc is handed over as
  // `rawGenetree`, so the source makes no /genes or /genetrees request of its
  // own (docs.js's taxon-name rewrite stays upstream); the neighborhood,
  // gene-structure and expression slots are the only fetches, and the loader
  // retries their transient failures with backoff.
  maybeStartLoader() {
    if (this.getViewer() !== 'tbrowse') return;
    const id = this.getGeneId();
    if (!this.props.geneDocs.hasOwnProperty(id)) return;
    const gene = this.props.geneDocs[id];
    // The selected tree: gene_tree, or a clade tree set (homology.wheat,
    // homology.oat, …); none for genes with homologues but no tree. A switch
    // restarts the loader (new generation, the old slots are aborted).
    const ref = this.selectedTreeRef(gene);
    if (!ref) return;
    const treeId = ref.id;
    const raw = this.props.grameneTrees[treeId];
    if (!raw || !raw.taxon_id) return;
    const key = `${ref.field}:${treeId}`;
    if (this._loaderStartedFor === key) return;
    this._loaderStartedFor = key;
    void this.loader.start({
      base: this.props.grameneAPI,
      treeId,
      treeField: ref.field,
      geneId: gene._id,
      rawGenetree: raw,
      // Only pay for gene-structure data when the genome zone is enabled; the
      // request shape (50 ids per /genes call, no fl) is what this tab has
      // always sent.
      geneStructures: this.isGenomeZoneEnabled(),
      geneStructureChunkSize: 50,
      geneStructureFl: null,
      // Same for the per-gene expression attributes zone.
      expression: this.isExpressionZoneEnabled(),
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
    const snap = this.state.snap;
    const hostProps = hostPropsFrom(snap);
    // Nothing to draw until the loader has adapted the tree (one tick after
    // start(), since the stored doc needs no fetch) and the bundle slice has
    // been seeded by maybeSeedTbrowseViewState (lifecycle, not render).
    const tbrowseVS = this.getHomologySlice().tbrowse;
    // Also wait until the snapshot holds the SELECTED tree, so a switch never
    // draws the previous tree under the new selection.
    const isSelected = snap.root && this.treeRef && snap.root.meta.treeId === this.treeRef.id;
    if (!hostProps || !tbrowseVS || !isSelected) {
      // Reserve the pane's height so the card doesn't jump when the tree lands.
      return (
        <div className="gene-genetree" style={{height: this.getHeight(), width: '100%'}}>
          <Spinner/>
        </div>
      );
    }
    // Layer the genome-limit and "expressed only" prune sets on top of the
    // user's own prunes for the controlled view state, but persist only the
    // user's prunes (the layer strips the derived ones in onViewStateChange) so
    // the bundle stays free of derived state and re-applies cleanly when the
    // filter or toggle changes.
    const pruneLayer = createDerivedPruneLayer([
      ...new Set([...this.getGenomePrunedIds(), ...this.getExpressionPrunedIds(tbrowseVS, hostProps)]),
    ]);
    return (
      <>
        <div className="gene-genetree" style={{height: this.getHeight(), width: '100%'}}>
          <TBrowse
            {...hostProps}
            zones={this.getTbrowseZones()}
            nodeOfInterest={this.gene._id}
            viewState={pruneLayer.effective(tbrowseVS)}
            onViewStateChange={(next) =>
              this.setTbrowseViewState(this.expandOnExpressedOnly(tbrowseVS, pruneLayer.onChange(next)))}
            densityControls={true}
            defaultOpenSections={{ zones: true, search: true }}
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
    // A second row when the gene sits in more than one tree (e.g. a wheat
    // gene in the Compara, wheat and barley trees).
    const refs = geneTreeRefs(this.gene);
    const treeBtn = ref => (
      <button
        key={ref.field}
        type="button"
        title={ref.id}
        onClick={() => this.setTree(ref.field)}
        style={{
          padding: '4px 10px',
          marginRight: 4,
          fontSize: 12,
          border: '1px solid #ccc',
          background: this.treeRef.field === ref.field ? '#2878dc' : '#fff',
          color: this.treeRef.field === ref.field ? '#fff' : '#222',
          cursor: 'pointer',
          borderRadius: 3,
        }}>
        {treeLabel(ref)}
      </button>
    );
    return (
      <div style={{margin: '8px 0'}}>
        <div>
          {btn('tbrowse', 'TBrowse')}
          {btn('treevis', 'TreeVis')}
        </div>
        {refs.length > 1 && <div className="homology-tree-switcher" style={{marginTop: 6}}>
          <span style={{fontSize: 12, marginRight: 6}}>Gene tree:</span>
          {refs.map(treeBtn)}
        </div>}
      </div>
    );
  }
  filterAllHomologs() {
    this.props.doReplaceGrameneFilters(suggestionToFilters({
      category: 'Gene Tree',
      fq_field: this.treeRef.field,
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
    let x = this.tree ? [{
      name: 'Homologs',
      category: 'Gene Tree',
      count: this.tree.geneCount,
      handleClick: this.filterAllHomologs.bind(this)
    }] : [];
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
    this.treeRef = this.selectedTreeRef(this.gene);
    // Recomputed below only once the selected tree has loaded, so a switch to
    // a tree still in flight never draws the previous one.
    this.tree = undefined;
    if (!this.treeRef) {
      // Homologues but no tree (some pan-genome assemblies): offer the
      // ortholog/paralog searches instead of a phylogram.
      this.tree = undefined;
      this.orthologs = this.orthologList();
      this.paralogs = this.paralogList();
      const explorations = this.explorations();
      return (
        <Detail>
          <Description key="description">
            No gene tree is available for this gene.
          </Description>
          {explorations.length > 0 && <Explore key="explore" explorations={explorations}/>}
          <Links key="links" links={this.links()}/>
        </Detail>
      )
    }
    const treeId = this.treeRef.id;
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
        <Content key="content">
          {this.renderViewerToggle()}
          {!this.tree
            ? <Spinner/>
            : this.getViewer() === 'tbrowse' ? this.renderTBrowse() : this.renderTreeVis()}
        </Content>
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
  'doSetHomologyTree',
  'doAcceptGrameneSuggestion',
  'doReplaceGrameneFilters',
  Homology
);

