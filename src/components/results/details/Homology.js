import React from 'react'
import {connect} from "redux-bundler-react";
import TreeVis from "gramene-genetree-vis";
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
const Homology = (props) => (
  <Detail>
    <Title key="title">Compara Gene Tree</Title>
    <Description key="description">
      <p>This phylogram shows the relationships between this gene and others similar to it, as determined by Ensembl Compara.</p>
    </Description>
    <Content key="content">{JSON.stringify(props,null,2)}</Content>
  </Detail>
);

export default connect(
  'selectGrameneTaxonomy',Homology
);

