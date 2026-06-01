import React, { useRef, useEffect, useState } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form, Row, Col} from 'react-bootstrap';
import BAR, {haveBAR} from "./BAR";

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
  const geneId = props.searchResult.id;
  const gene = props.geneDocs[geneId];
  // User-selected view state (active sub-tab, chosen GXA experiment, chosen eFP
  // study) lives in the uiViewState bundle keyed by geneId, so the shareable-
  // views snapshot can round-trip it. Fetched data + the dev-only Local API
  // toggle stay in local state. Defaults match the old local-state initials.
  const expr = (props.uiViewState && props.uiViewState.byGene[geneId]
    && props.uiViewState.byGene[geneId].expression) || {};
  const activeTab = expr.activeTab || 'gene';
  const atlasExperiment = expr.atlasExperiment || null;
  const setActiveTab = (k) => props.doSetExpressionState({geneId, patch: {activeTab: k}});
  const setAtlasExperiment = (v) => props.doSetExpressionState({geneId, patch: {atlasExperiment: v}});
  const [atlasExperimentList, setAtlasExperimentList] = useState([]);
  const [atlasFacets, setAtlasFacets] = useState(null);
  const [isLocal, setIsLocal] = useState(false);

  const handleLocalAPIChange = (event) => {
    setIsLocal(event.target.checked);
  };
  // The expressionStudies resource is otherwise fetched only when a top-level
  // expression view (exprViz/expression/export) is on — but this per-gene
  // Expression detail also needs it (the Paralogs sub-tab's experiment list and
  // the atlasExperiment selection both derive from it). Self-fetch on mount so
  // opening the detail populates the studies even when no such view is enabled.
  useEffect(() => {
    if (!props.expressionStudies && props.doFetchExpressionStudies) {
      props.doFetchExpressionStudies();
    }
  }, [props.expressionStudies]);
  useEffect(() => {
    if (!props.expressionStudies) return;
    const tid = Math.floor(gene.taxon_id / 1000);
    if (props.expressionStudies[tid]) {
      let facets={Differential: {}, Baseline: {}};
      let eList = props.expressionStudies[tid].sort((a,b) => {
        const a_name = `${a.type}:${a.description || a._id}`;
        const b_name = `${b.type}:${b.description || b._id}`;
        return a_name < b_name ? -1 : 1;
      });
      if (props.searchResult.hasOwnProperty('expressed_in_gxa_attr_ss')) {
        const in_gxa = new Set(props.searchResult.expressed_in_gxa_attr_ss);
        eList = eList.filter(e => in_gxa.has(e._id))
      }
      eList.forEach(e => {e.factors.forEach(factor => facets[e.type][factor] = 1);});
      setAtlasExperimentList(eList);
      setAtlasFacets(facets);
      // Only pick a default experiment when the user (or a restored snapshot)
      // hasn't already chosen one — otherwise we'd clobber a saved selection
      // the moment the studies list loads.
      if (!atlasExperiment) {
        let refExp = eList.filter(e => e.isRef);
        if (refExp.length === 1) {
          setAtlasExperiment(refExp[0]._id);
        } else {
          // no reference experiment - choose first
          setAtlasExperiment(eList[0]._id);
        }
      }
    }
  }, [props.expressionStudies]);

  let paralogs_url;
  let gene_url = `https://dev.gramene.org/static/atlasWidget.html?genes=${gene.atlas_id || gene._id}&localAPI=${isLocal}`;
  let paralogs = [];
  const haveParalogs = props.grameneParalogs && props.grameneParalogs[gene._id];
  if (haveParalogs) {
    paralogs = props.grameneParalogs[gene._id];
  }
  useEffect(() => {
    if (!haveParalogs && gene.homology) {
      props.doRequestParalogs(gene._id, gene.homology.supertree, gene.taxon_id);
    }
  }, [gene._id, haveParalogs]);
  // if (gene.homology && gene.homology.homologous_genes && gene.homology.homologous_genes.within_species_paralog) {
  //   paralogs = gene.homology.homologous_genes.within_species_paralog;
  // }
  if (paralogs.length > 0 && atlasExperiment) {
    paralogs_url= `https://dev.gramene.org/static/atlasWidget.html?genes=${paralogs.join(' ')}&experiment=${atlasExperiment}&localAPI=${isLocal}`;
  }
  return <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
    {paralogs_url &&
      <Tab tabClassName="gxa" eventKey="paralogs" title={`Paralogs`} key="gxaparalogs">
        <Form.Select aria-label='experiment selector'
                     placeholder='Select experiment'
                     value={atlasExperiment || ''}
                     onChange={(e) => setAtlasExperiment(e.target.value)}>
          { atlasExperimentList.map((e,idx) =>
            <option key={idx} value={e._id}>{e.type}: {e.description || e._id}</option>
          )}
        </Form.Select>
        {activeTab === "paralogs" && <DynamicIframe url={paralogs_url}/> }
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
      {activeTab === "gene" && <DynamicIframe url={gene_url}/> }
    </Tab>
    {haveBAR(gene) &&
      <Tab tabClassName="eFP" eventKey="eFP" title="eFP Browser" key="bar">
        <BAR gene={gene}
             study={expr.barStudy}
             onStudyChange={v => props.doSetExpressionState({geneId, patch: {barStudy: v}})}/>
      </Tab>
    }
  </Tabs>
};

export default connect(
  'selectGrameneParalogs',
  'selectExpressionStudies',
  'selectUiViewState',
  'doRequestParalogs',
  'doFetchExpressionStudies',
  'doSetExpressionState',
  //'doRequestParalogExpression',
  Detail
);

