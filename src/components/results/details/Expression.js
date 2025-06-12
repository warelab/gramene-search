import React, { useRef, useEffect, useState } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Row, Col} from 'react-bootstrap';
import { Typeahead } from 'react-bootstrap-typeahead'; // ES2015
// Import as a module in your JS
import 'react-bootstrap-typeahead/css/Typeahead.css';
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
      let eList = props.expressionStudies[tid];
      if (props.searchResult.hasOwnProperty('expressed_in_gxa_attr_ss')) {
        const in_gxa = new Set(props.searchResult.expressed_in_gxa_attr_ss);
        eList = props.expressionStudies[tid].filter(e => in_gxa.has(e._id));
      }
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
  let gene_url = `https://dev.gramene.org/static/atlasWidget.html?genes=${gene.atlas_id || gene._id}&experiment=${atlasExperiment}&localAPI=${isLocal}`;
  let paralogs = [];
  if (gene.homology && gene.homology.homologous_genes && gene.homology.homologous_genes.within_species_paralog) {
    paralogs = gene.homology.homologous_genes.within_species_paralog;
  }
  if (paralogs.length > 1 && atlasExperiment) {
    paralogs_url= `https://dev.gramene.org/static/atlasWidget.html?genes=${paralogs.join(' ')}&experiment=${atlasExperiment}&localAPI=${isLocal}`;
  }
  const ref = useRef(null);
  const ref2 = useRef(null);
  return <Tabs>
    {paralogs_url &&
      <Tab tabClassName="gxa" eventKey="paralogs" title={`Paralogs`} key="gxaparalogs">
        <Typeahead clearButton size='sm'
          id="experiment-selector"
          ref={ref}
          labelKey="experiment"
          onChange={(exps) => {if (exps.length > 0) {setAtlasExperiment(exps[0]._id);setTimeout(() => ref.current?.clear(), 2000)}}}
          placeholder="Choose an experiment..."
          options={atlasExperimentList}
          labelKey={(experiment) => `${experiment.type}: ${experiment.description || experiment._id}`}
        />
        <DynamicIframe url={paralogs_url}/>
      </Tab>
    }
    <Tab tabClassName="gxa" eventKey="gene" title="All Studies" key="gxa">
      {/*<Form.Check*/}
      {/*  type="switch"*/}
      {/*  id="localAPI"*/}
      {/*  label="Local API"*/}
      {/*  checked={isLocal}*/}
      {/*  onChange={handleLocalAPIChange}*/}
      {/*/>*/}
      <Typeahead clearButton size='sm'
                 id="experiment-selector2"
                 ref={ref}
                 labelKey="experiment"
                 onChange={(exps) => {if (exps.length > 0) {setAtlasExperiment(exps[0]._id);setTimeout(() => ref.current?.clear(), 2000)}}}
                 placeholder="Choose an experiment..."
                 options={atlasExperimentList}
                 labelKey={(experiment) => `${experiment.type}: ${experiment.description || experiment._id}`}
      />
      <DynamicIframe url={gene_url}/>
    </Tab>
    {haveBAR(gene) &&
      <Tab tabClassName="eFP" eventKey="eFP" title="eFP Browser" key="bar"><BAR gene={gene}/></Tab>
    }
  </Tabs>
};

export default connect(
  //'selectParalogExpression',
  'selectExpressionStudies',
  //'doRequestParalogExpression',
  Detail
);

