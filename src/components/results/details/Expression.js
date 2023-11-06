import React, { useState, useEffect } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab} from 'react-bootstrap';
import BAR, {haveBAR} from "gramene-efp-browser";

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  let paralogs_url;
  let gene_url = `/static/atlasWidget.html?reference=0&genes=${gene.atlas_id || gene._id}`;

  if (props.paralogExpression && props.paralogExpression[gene._id]) {
    let paralogs = props.paralogExpression[gene._id].map(p => p.atlas_id || p.id);
    if (paralogs.length > 1) {
      paralogs_url= `/static/atlasWidget.html?reference=1&genes=${paralogs.join(' ')}`;
    }
  }
  else {
    props.doRequestParalogExpression(gene._id)
  }
  return <Tabs>
    {haveBAR(gene) && <Tab tabClassName="eFP" eventKey="eFP" title="eFP browser"><BAR gene={gene}/></Tab>}
    <Tab tabClassName="gxa" eventKey="gene" title="All Studies">
      <iframe src={gene_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>
    {paralogs_url && <Tab tabClassName="gxa" eventKey="paralogs" title="Reference Study (all paralogs)">
      <iframe src={paralogs_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>}
  </Tabs>
};

export default connect(
  'selectParalogExpression',
  'doRequestParalogExpression',
  Detail
);

