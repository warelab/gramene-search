import React from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab} from 'react-bootstrap';

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  let paralogs_url;
  let efp_browser;
  let gene_url = `/static/atlasWidget.html?reference=0&genes=${gene.atlas_id || gene._id}`;
  if (gene.taxon_id === 4558) {
    // efp_browser = `https://bar.utoronto.ca/api/efp_image/efp_sorghum/Stress_Atlas/Absolute/${gene._id.replace('SORBI_3','Sobic.')}`
    // efp_browser = `https://bar.utoronto.ca/api/efp_image/efp_sorghum/`
    // efp_browser = `https://bar.utoronto.ca/~asher/efp_sorghum/cgi-bin/efpWeb.cgi?dataSource=Developmental_Atlas&mode=Absolute&primaryGene=${gene._id.replace('SORBI_3','Sobic.')}`
  }
  if (props.paralogExpression && props.paralogExpression[gene._id]) {
    let paralogs = props.paralogExpression[gene._id].map(p => p.id);
    if (paralogs.length > 1) {
      paralogs_url= `/static/atlasWidget.html?reference=1&genes=${paralogs.join(' ')}`;
    }
  }
  else {
    props.doRequestParalogExpression(gene._id)
  }
  return <Tabs>
    <Tab eventKey="gene" title="All Studies">
      <iframe src={gene_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>
    {paralogs_url && <Tab eventKey="paralogs" title="Reference Study (all paralogs)">
      <iframe src={paralogs_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>}
    {efp_browser && <Tab eventKey="eFP" title="eFP browser (BAR)">
    </Tab>}
  </Tabs>
};

export default connect(
  'selectParalogExpression',
  'doRequestParalogExpression',
  Detail
);

