import React from 'react'
import _ from 'lodash';
import {connect} from "redux-bundler-react";
import TreeVis from "gramene-genetree-vis";
import treesClient from "gramene-trees-client";
import {Detail, Title, Description, Content, Explore, Links} from "./generic";
import {Spinner} from "react-bootstrap";
import '../../../../node_modules/gramene-genetree-vis/src/styles/msa.less';
import '../../../../node_modules/gramene-genetree-vis/src/styles/tree.less';

function suggestionToFilters(suggestion) {
  return {
    status: 'init',
    rows: 20,
    operation: 'AND',
    negate: false,
    leftIdx: 0,
    rightIdx: 3,
    children: [
      {
        fq_field: suggestion.fq_field,
        fq_value: suggestion.fq_value,
        name: suggestion.name,
        category: suggestion.category,
        leftIdx: 1,
        rightIdx: 2,
        negate: false,
        marked: false
      }
    ]
  }
}

class Homology extends React.Component {
  constructor(props) {
    super(props);
    if (!props.geneDocs.hasOwnProperty(props.searchResult.id)) {
      props.requestGene(props.searchResult.id)
    }
    this.taxonomy = treesClient.taxonomy.tree(Object.values(props.grameneTaxonomy))
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
                 ensemblUrl={this.props.ensemblURL}/>
      </div>
    )
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
        .value();

      if (!_.isEmpty(homologs)) {
        homologs.push(thisGeneId);
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
    return x;
  }
  links() {
    let links = [
      {
        name: 'Ensembl Gene Tree view',
        url: `${this.props.ensemblURL}/${this.gene.system_name}/Gene/Compara_Tree?g=${this.gene._id}`
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
    if (!this.props.geneDocs.hasOwnProperty(this.props.searchResult.id)) {
      return <Spinner/>
    }
    this.gene = this.props.geneDocs[this.props.searchResult.id];
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
    return (
      <Detail>
        <Title key="title">Compara Gene Tree</Title>
        <Description key="description">
          This phylogram shows the relationships between this gene and others similar to it, as determined by Ensembl Compara.
        </Description>
        {this.tree && <Content key="content">{this.renderTreeVis()}</Content>}
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
  'selectEnsemblURL',
  'selectCuration',
  'doRequestGrameneTree',
  'doAcceptGrameneSuggestion',
  'doReplaceGrameneFilters',
  Homology
);

