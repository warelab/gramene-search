import React, { useRef, useEffect, useState } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Row, Col} from 'react-bootstrap';
import BAR, {haveBAR} from "gramene-efp-browser";

function DynamicIframe(props) {
  // Create a ref for the iframe element
  const iframeRef = useRef(null);

  // Function to resize iframe height
  const resizeIframe = () => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframe.style.height = 44 + innerDoc.body.scrollHeight + 'px';
    }
  };

  // Resize iframe when content loads
  useEffect(() => {
    resizeIframe();
  }, []); // Empty dependency array ensures it only runs once after initial render

  // Optional: Resize iframe when window is resized
  useEffect(() => {
    window.addEventListener('resize', resizeIframe);
    return () => {
      window.removeEventListener('resize', resizeIframe);
    };
  }, []); // Empty dependency array ensures it only runs once after initial render

  // Resize iframe when content changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const observer = new MutationObserver(resizeIframe);
    const checkElement = () => {
      const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
      const targetElement = innerDoc.querySelector('#heatmapContainer');
      if (targetElement) {
        observer.observe(targetElement, { attributes: true, childList: true, subtree: true });
      } else {
        setTimeout(checkElement, 200); // Check again after 100 milliseconds
      }
    };
    checkElement();

    return () => observer.disconnect();
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={props.url}
      title="Dynamic Iframe"
      style={{ width: '100%', border: 'none' }}
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
  let gene_url = `/static/atlasWidget.html?genes=${gene.atlas_id || gene._id}&localAPI=${isLocal}`;
  let paralogs = [];
  if (gene.homology && gene.homology.homologous_genes && gene.homology.homologous_genes.within_species_paralog) {
    paralogs = gene.homology.homologous_genes.within_species_paralog;
  }
  if (paralogs.length > 1 && atlasExperiment) {
    paralogs_url= `/static/atlasWidget.html?genes=${paralogs.join(' ')}&experiment=${atlasExperiment}&localAPI=${isLocal}`;
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
                  <option key={index} value={experiment._id}>{experiment.name}</option>
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

