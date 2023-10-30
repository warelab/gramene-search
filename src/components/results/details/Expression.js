import React, { useState, useEffect } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab} from 'react-bootstrap';

const ImageLoader = props => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const image = new Image();
    image.src = props.url;
    image.onload = () => {
      setLoading(false);
    };
  }, []);

  return (
    <div className="BAR-container">
      {loading && <img src="https://www.sorghumbase.org/static/images/dna_spinner.svg" alt="Loading..." />}
      {!loading && <img style={{'max-width':'100%'}} src={props.url} />}
    </div>
  );
}

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  let paralogs_url;
  let efp_browser = {
    show: false
  };
  let gene_url = `/static/atlasWidget.html?reference=0&genes=${gene.atlas_id || gene._id}`;
  if (gene.system_name === 'sorghum_bicolor') {
    efp_browser.show = true;
    efp_browser.options = [
      {value: 'Developmental_Atlas', label: 'Developmental Atlas'},
      {value: 'Stress_Atlas', label: 'Stress Atlas'}
      // {value: 'Atlas_w_BS_Cells', label: 'Atlas w BS Cells'},
      // {value: 'Low_Phosphorus', label: 'Low Phosphorus'},
      // {value: 'Nitrogen_Use_Efficiency', label: 'Nitrogen Use Efficiency'},
      // {value: 'Vascularization_and_Internode', label: 'Vascularization and Internode'}
    ];
    efp_browser.gene = gene._id.replace('SORBI_3','Sobic.');
    efp_browser.path = `https://bar.utoronto.ca/api/efp_image/efp_sorghum`;
    efp_browser.bar = 'https://bar.utoronto.ca/~asher/efp_sorghum/cgi-bin/efpWeb.cgi?';
    // efp_browser = `https://bar.utoronto.ca/api/efp_image/efp_sorghum/Stress_Atlas/Absolute/${gene._id.replace('SORBI_3','Sobic.')}`
    // efp_browser = `https://bar.utoronto.ca/api/efp_image/efp_sorghum/`
    // efp_browser = `https://bar.utoronto.ca/~asher/efp_sorghum/cgi-bin/efpWeb.cgi?dataSource=Developmental_Atlas&mode=Absolute&primaryGene=${gene._id.replace('SORBI_3','Sobic.')}`
  }
  if (efp_browser.show) {
    const [selectedStudy, setSelectedStudy] = useState(efp_browser.options[0].value);
    const handleSelectChange = (event) => {
      setSelectedStudy(event.target.value);
    };
    efp_browser.content = (
      <div>
        <label>Select a study:</label>
        <select value={selectedStudy} onChange={handleSelectChange}>
          {efp_browser.options.map(o => <option value={o.value}>{o.label}</option>)}
        </select><br/>
        <ImageLoader url={`${efp_browser.path}/${selectedStudy}/Absolute/${efp_browser.gene}`}/>
        <a href={`${efp_browser.bar}?dataSource=${selectedStudy}&mode=Absolute&primaryGene=${efp_browser.gene}`}>Powered by <img src="https://bar.utoronto.ca/bbc_logo_small.gif"/> BAR Webservices</a>
      </div>
    )
  }

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
    <Tab eventKey="gene" title="All Studies">
      <iframe src={gene_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>
    {paralogs_url && <Tab eventKey="paralogs" title="Reference Study (all paralogs)">
      <iframe src={paralogs_url} frameBorder="0" width="100%" height="500px"></iframe>
    </Tab>}
    {efp_browser.show && <Tab eventKey="eFP" title="eFP browser (BAR)">{efp_browser.content}</Tab>}
  </Tabs>
};

export default connect(
  'selectParalogExpression',
  'doRequestParalogExpression',
  Detail
);

