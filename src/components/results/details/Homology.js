import React from 'react'
import {connect} from "redux-bundler-react";
import TreeVis from "gramene-genetree-vis";
import treesClient from "gramene-trees-client";
import {Detail, Title, Description, Content} from "./generic";

// const Detail = props => (
//   <div>
//     <TreeVis genetree={props.genetree}
//              initialGeneOfInterest={props.gene}
//              genomesOfInterest={}
//              taxonomy={props.grameneTaxonomy}
//              allowGeneSelection={true}
//              pivotTree={true}
//              enablePhyloview={true}
//              enableCuration={false}
//              numberOfNeighbors={10}
//              ensemblUrl={props.ensemblURL}
//     />
//   </div>
// );
//
//
// export default connect(
//   'selectEnsemblURL',
//   'selectGrameneTaxonomy',
//   Detail
// );
class Homology extends React.Component {
  constructor(props) {
    super(props);
    this.taxonomy = treesClient.taxonomy.tree(Object.values(props.grameneTaxonomy))
  }
  renderTreeVis() {
    return <TreeVis genetree={this.tree}
                    initialGeneOfInterest={this.gene}
                    genomesOfInterest={{}}
                    taxonomy={this.taxonomy}
                    allowGeneSelection={true}
                    pivotTree={true}
                    enableCuration={false}
                    enablePhyloview={true}
                    numberOfNeighbors={10}
                    ensemblUrl={this.props.ensemblURL}
    />;
  }
  render() {
    this.gene = this.props.geneDocs[this.props.searchResult.id];
    const treeId = this.gene.homology.gene_tree.id;
    if (! this.props.grameneTrees.hasOwnProperty(treeId)) {
      this.props.doRequestGrameneTree(treeId);
    }
    else {
      this.tree = treesClient.genetree.tree([this.props.grameneTrees[treeId]]);
    }
    return (
      <Detail>
        <Title key="title">Compara Gene Tree</Title>
        <Description key="description">
          This phylogram shows the relationships between this gene and others similar to it, as determined by Ensembl Compara.
        </Description>
        <Content key="content">{this.tree && this.renderTreeVis()}</Content>
      </Detail>
    )
  }
}

export default connect(
  'selectGrameneTaxonomy',
  'selectGrameneTrees',
  'selectEnsemblURL',
  'doRequestGrameneTree',
  Homology
);

