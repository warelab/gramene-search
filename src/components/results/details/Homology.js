import React from 'react'
import {connect} from "redux-bundler-react";
import TBrowse from 'tbrowse'

const exampleProps = {
  setId: "sorghum1",
  treeId: "SORGHUM1GT_125555",
  genesOfInterest: ['AT1G32900'],
  zones: [{
    type: 'tree',
    width: 300
  },{
    type: 'taxonomy'
  },{
    type: 'neighborhood',
    width: 800
  },{
    type: 'label',
    taxName: false,
    geneName: true,
    width: 170
  }]
};
const Detail = props => (
  <div>
    <h1>Homology</h1>
    <TBrowse {...exampleProps}/>
  </div>
);

export default connect(Detail);

