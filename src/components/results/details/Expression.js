import React, { useRef, useEffect, useState } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Row, Col} from 'react-bootstrap';
import BAR, {haveBAR} from "gramene-efp-browser";

function DynamicIframe(props) {
  // Create a ref for the iframe element
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(500); // Default height

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'heightChange') {
        setIframeHeight(event.data.height + 44);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={props.url}
      title="Dynamic Iframe"
      style={{ width: '100%', height: `${iframeHeight}px`, border: 'none' }}
    />
  );
}

const Detail = props => {
  const gene = props.geneDocs[props.searchResult.id];
  const [atlasExperiment, setAtlasExperiment] = useState(null);
  const [atlasExperimentList, setAtlasExperimentList] = useState([]);
  const [isLocal, setIsLocal] = useState(false);

  const handleLocalAPIChange = (event) => {
    setIsLocal(event.target.checked);
  };
  useEffect(() => {
    const tid = Math.floor(gene.taxon_id / 1000);
    if (props.expressionStudies[tid]) {
      let eList = props.expressionStudies[tid].filter(e => e.type === "Baseline");
      setAtlasExperimentList(eList);

      let refExp = eList.filter(e => e.isRef);
      if (refExp.length === 1) {
        setAtlasExperiment(refExp[0]._id);
      } else {
        // no reference experiment - choose first
        setAtlasExperiment(eList[0]._id);
      }
    }
  }, [props.expressionStudies]);

  let paralogs_url;
  let gene_url = `https://dev.gramene.org/static/atlasWidget.html?genes=${gene.atlas_id || gene._id}&localAPI=${isLocal}`;
  let paralogs = [];
  if (gene.homology && gene.homology.homologous_genes && gene.homology.homologous_genes.within_species_paralog) {
    paralogs = gene.homology.homologous_genes.within_species_paralog;
  }
  if (paralogs.length > 1 && atlasExperiment) {
    paralogs_url= `https://dev.gramene.org/static/atlasWidget.html?genes=${paralogs.join(' ')}&experiment=${atlasExperiment}&localAPI=${isLocal}`;
  }
  return <Tabs>
    {paralogs_url &&
      <Tab tabClassName="gxa" eventKey="paralogs" title={`Paralogs`} key="gxaparalogs">
        <Form>
          <Form.Check
            type="switch"
            id="localAPI"
            label="Local API"
            checked={isLocal}
            onChange={handleLocalAPIChange}
          />
          <Form.Group as={Row} className="mb-3" controlId="formGroupExperiment">
            <Form.Label column sm={1}>Experiment</Form.Label>
            <Col sm={5}>
              <Form.Select defaultValue={atlasExperiment} onChange={(e) => setAtlasExperiment(e.target.value)}>
                {atlasExperimentList.map((experiment, index) => (
                  <option key={index} value={experiment._id}>{experiment.description || experiment._id}</option>
                ))}
              </Form.Select>
            </Col>
          </Form.Group>
        </Form>
        <DynamicIframe url={paralogs_url}/>
      </Tab>
    }
    <Tab tabClassName="gxa" eventKey="gene" title="All Studies" key="gxa">
      <Form.Check
        type="switch"
        id="localAPI"
        label="Local API"
        checked={isLocal}
        onChange={handleLocalAPIChange}
      />
      <DynamicIframe url={gene_url}/>
    </Tab>
    {haveBAR(gene) &&
      <Tab tabClassName="eFP" eventKey="eFP" title="eFP Browser" key="bar"><BAR gene={gene}/></Tab>
    }
  </Tabs>
};

export default connect(
  // 'selectParalogExpression',
  'selectExpressionStudies',
  'doRequestParalogExpression',
  Detail
);

