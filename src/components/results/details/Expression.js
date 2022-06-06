import React from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab} from 'react-bootstrap';

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  let paralogs_url;
  let gene_url = `/static/atlasWidget.html?reference=0&genes=${gene._id}`;
  if (props.paralogExpression && props.paralogExpression[gene._id]) {
    let paralogs = props.paralogExpression[gene._id].map(p => p.id);
    paralogs_url= `/static/atlasWidget.html?reference=1&genes=${paralogs.join(' ')}`;
  }
  else {
    props.doRequestParalogExpression(gene._id)
  }
  return <Tabs>
    <Tab eventKey="gene" title="All Studies">
      <iframe src={gene_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>
    <Tab eventKey="paralogs" title="Reference Study (all paralogs)">
      {paralogs_url && <iframe src={paralogs_url} frameBorder="0" width="100%" height="500px"></iframe>}
    </Tab>
  </Tabs>
};

export default connect(
  'selectParalogExpression',
  'doRequestParalogExpression',
  Detail
);

