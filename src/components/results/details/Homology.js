import React from 'react'
import _ from 'lodash';
import {connect} from "redux-bundler-react";
import TreeVis from "gramene-genetree-vis";
import treesClient from "gramene-trees-client";
import {
  TBrowse,
  computePivotState,
  fromGrameneGenetree,
  fromGrameneNeighborhood,
  labelsZone,
  msaZone,
  neighborhoodZone,
  treeZone,
} from "tbrowse";
import {Detail, Title, Description, Content, Explore, Links} from "./generic";
import {suggestionToFilters} from "../../utils";
import {Spinner, Alert} from "react-bootstrap";
import '../../../../node_modules/gramene-genetree-vis/src/styles/msa.less';
import '../../../../node_modules/gramene-genetree-vis/src/styles/tree.less';

const TBROWSE_ZONES = [treeZone, labelsZone, msaZone, neighborhoodZone];

class Homology extends React.Component {
  constructor(props) {
    super(props);
    this.state = {viewer: 'treevis', neighborhood: null, neighborhoodTreeId: null};
    if (!props.geneDocs.hasOwnProperty(props.searchResult.id)) {
      props.requestGene(props.searchResult.id)
    }
    this.taxonomy = treesClient.taxonomy.tree(Object.values(props.grameneTaxonomy))
  }
  fetchNeighborhood(treeId) {
    if (this._neighborhoodFetchedFor === treeId) return;
    this._neighborhoodFetchedFor = treeId;
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
        this.setState({neighborhood: fromGrameneNeighborhood(json), neighborhoodTreeId: treeId});
      })
      .catch(err => {
        console.warn('tbrowse neighborhood fetch failed:', err);
        this._neighborhoodFetchedFor = null;
      });
  }
  renderTreeVis() {
    return (
      <div className="gene-genetree">
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
    )
  }
  renderTBrowse() {
    const treeId = this.gene.homology.gene_tree.id;
    if (this._tbrowseTreeId !== treeId) {
      const raw = this.props.grameneTrees[treeId];
      const adapted = fromGrameneGenetree([raw]);
      this._tbrowseTreeId = treeId;
      this._tbrowseData = adapted;
      const pivot = computePivotState(adapted.tree, this.gene._id);
      const zoneIds = TBROWSE_ZONES.map(z => z.id);
      this._tbrowseInitialViewState = {
        selectedNodeId: null,
        collapsedNodeIds: pivot ? pivot.collapsedNodeIds : [],
        prunedNodeIds: [],
        swappedNodeIds: pivot ? pivot.swappedNodeIds : [],
        compressedNodeIds: [],
        nodeOfInterestId: pivot ? pivot.targetId : null,
        zones: zoneIds.map(id => ({id, width: 25, visible: true})),
        zoneStates: {},
        search: null,
      };
    }
    this.fetchNeighborhood(treeId);
    const neighborhood = this.state.neighborhoodTreeId === treeId ? this.state.neighborhood : undefined;
    return (
      <div className="gene-genetree" style={{height: 600, width: '100%'}}>
        <TBrowse
          tree={this._tbrowseData.tree}
          taxonomy={this._tbrowseData.taxonomy}
          msa={this._tbrowseData.msa}
          geneMetadata={this._tbrowseData.geneMetadata}
          proteinDomains={this._tbrowseData.proteinDomains}
          exonJunctions={this._tbrowseData.exonJunctions}
          neighborhood={neighborhood}
          zones={TBROWSE_ZONES}
          nodeOfInterest={this.gene._id}
          initialViewState={this._tbrowseInitialViewState}
        />
      </div>
    )
  }
  renderViewerToggle() {
    const {viewer} = this.state;
    const btn = (id, label) => (
      <button
        key={id}
        type="button"
        onClick={() => this.setState({viewer: id})}
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
        {btn('treevis', 'TreeVis')}
        {btn('tbrowse', 'TBrowse (beta)')}
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
        this.tree = treesClient.genetree.tree([this.props.grameneTrees[treeId]]);
        this.orthologs = this.orthologList();
        this.paralogs = this.paralogList();
      }
    }
    let flagged=0;
    // if (this.props.curation && this.props.curation.taxa.hasOwnProperty(this.gene.taxon_id)) {
    //   flagged = this.props.curatedGenes && this.props.curatedGenes[id] ? this.props.curatedGenes[id].flagged : 0;
    // }
    return (
      <Detail>
        <Title key="title">Compara Gene Tree</Title>
        <Description key="description">
          This phylogram shows the relationships between this gene and others similar to it, as determined by Ensembl Compara.
          {flagged > 1 && <Alert variant={'warning'}>This gene was flagged for potential gene structural annotation issues by {flagged} curators</Alert>}
        </Description>
        {this.tree && <Content key="content">
          {this.renderViewerToggle()}
          {this.state.viewer === 'tbrowse' ? this.renderTBrowse() : this.renderTreeVis()}
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
  'selectCuratedGenes',
  'doRequestGrameneTree',
  'doAcceptGrameneSuggestion',
  'doReplaceGrameneFilters',
  Homology
);

