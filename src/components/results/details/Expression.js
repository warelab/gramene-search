import React, { useEffect, useMemo } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form} from 'react-bootstrap';
import {ExpressionAtlasHeatmap} from 'gramene-atlas-heatmap';
import BAR, {haveBAR} from "./BAR";

// "All Studies" and "Paralogs" draw Expression Atlas heatmaps in the page with
// gramene-atlas-heatmap (warelab's React 18 fork of EBI's atlas-heatmap; the
// anatomogram comes from gramene-anatomogram). configuration.atlasUrl names the
// gramene-swagger /gxa/ instance to query; sites that leave it unset get the
// instance the old dev.gramene.org iframe widget fell back to.
const DEFAULT_ATLAS_URL = 'https://data.sorghumbase.org/auth_testing/gxa/';
const EBI_GXA = 'https://www.ebi.ac.uk/gxa/';

const genesOf = query => (query && query.gene ? query.gene.split(' ') : []);
const editSearch = (url, edit) => {
  try {
    const u = new URL(url);
    edit(u.searchParams);
    return u.href;
  } catch (e) {
    return undefined;
  }
};
// gramene-swagger echoes geneQuery back as [null,...], returns relative row uris
// (genes/<id>) that only some instances redirect to EBI, and atlasUrl itself is
// not a browsable page, so point the heatmap's links at EBI's Expression Atlas.
// undefined keeps the heatmap's own URL.
const resolveUrl = (kind, url, context) => {
  const genes = genesOf(context.query);
  const withGenes = params => params.set('geneQuery', JSON.stringify(genes.map(value => ({value}))));
  switch (kind) {
    case 'row': {
      const uri = context.row && context.row.uri;
      return uri && !/^https?:/i.test(uri) ? new URL(uri, EBI_GXA).href : undefined;
    }
    case 'atlas':
      return EBI_GXA;
    case 'experiment':
      return editSearch(url, withGenes);
    case 'moreInformation':
      return context.experiment
        ? editSearch(url, withGenes)
        : `${EBI_GXA}genes/${encodeURIComponent(genes[0])}`;
    case 'download':
      return editSearch(url, params => params.delete('geneQuery'));
    default:
      return undefined;
  }
};

const HEATMAP_OPTIONS = {
  showAnatomogram: true,
  isWidget: true,
  showControlMenu: true,
  linkTarget: '_blank',
  resolveUrl
};

const studyLabel = e => `${e.type}:${e.description || e._id}`;

const Detail = props => {
  const geneId = props.searchResult.id;
  const gene = props.geneDocs[geneId];
  // User-selected view state (active sub-tab, chosen GXA experiment, chosen eFP
  // study) lives in the uiViewState bundle keyed by geneId, so the shareable-
  // views snapshot can round-trip it.
  const expr = (props.uiViewState && props.uiViewState.byGene[geneId]
    && props.uiViewState.byGene[geneId].expression) || {};
  const activeTab = expr.activeTab || 'gene';
  const atlasExperiment = expr.atlasExperiment || null;
  const setExpression = patch => props.doSetExpressionState({geneId, patch});

  // The expressionStudies resource is otherwise fetched only when a top-level
  // expression view (exprViz/expression/export) is on — but this per-gene
  // Expression detail also needs it (the Paralogs sub-tab's experiment list and
  // the atlasExperiment selection both derive from it). Fetch it here when it is
  // missing or stale: it is persisted, and a browser that cached the list before
  // studies were added to the release would otherwise keep offering the old list.
  useEffect(() => {
    if (props.expressionStudiesShouldUpdate && props.doFetchExpressionStudies) {
      props.doFetchExpressionStudies();
    }
  }, [props.expressionStudiesShouldUpdate]);

  const studies = props.expressionStudies && props.expressionStudies[Math.floor(gene.taxon_id / 1000)];
  const inGxa = props.searchResult.expressed_in_gxa_attr_ss;
  const experiments = useMemo(() => {
    if (!studies) return [];
    const inGxaSet = inGxa && new Set(inGxa);
    // copy before sorting: the studies array belongs to the expressionStudies bundle
    const list = inGxaSet ? studies.filter(e => inGxaSet.has(e._id)) : studies.slice();
    return list.sort((a, b) => (studyLabel(a) < studyLabel(b) ? -1 : 1));
  }, [studies, inGxa]);

  // Only pick a default experiment when the user (or a restored snapshot)
  // hasn't already chosen one — otherwise we'd clobber a saved selection
  // the moment the studies list loads.
  useEffect(() => {
    if (atlasExperiment || experiments.length === 0) return;
    const refExp = experiments.filter(e => e.isRef);
    setExpression({atlasExperiment: (refExp.length === 1 ? refExp[0] : experiments[0])._id});
  }, [experiments, atlasExperiment]);

  const paralogs = props.grameneParalogs && props.grameneParalogs[gene._id];
  useEffect(() => {
    if (!paralogs && gene.homology) {
      props.doRequestParalogs(gene._id, gene.homology.supertree, gene.taxon_id);
    }
  }, [gene._id, !!paralogs]);

  const atlasUrl = (props.configuration && props.configuration.atlasUrl) || DEFAULT_ATLAS_URL;
  const geneQuery = gene.atlas_id || gene._id;
  const paralogQuery = paralogs && paralogs.length > 0 ? paralogs.join(' ') : null;
  const allStudiesQuery = useMemo(() => ({gene: geneQuery}), [geneQuery]);
  const paralogsQuery = useMemo(() => ({gene: paralogQuery}), [paralogQuery]);
  const knownExperiment = experiments.some(e => e._id === atlasExperiment);

  // Only the active sub-tab's heatmap is mounted; the keys give each query its
  // own fetch, zoom and filters.
  return <Tabs activeKey={activeTab} onSelect={(k) => setExpression({activeTab: k})}>
    {paralogQuery && atlasExperiment &&
      <Tab tabClassName="gxa" eventKey="paralogs" title="Paralogs" key="gxaparalogs">
        <Form.Select className="mb-2"
                     aria-label="experiment selector"
                     value={atlasExperiment}
                     onChange={(e) => setExpression({atlasExperiment: e.target.value})}>
          {!knownExperiment && <option value={atlasExperiment}>{atlasExperiment}</option>}
          {experiments.map(e =>
            <option key={e._id} value={e._id}>{e.type}: {e.description || e._id}</option>
          )}
        </Form.Select>
        {activeTab === "paralogs" &&
          <ExpressionAtlasHeatmap key={`${atlasUrl} ${atlasExperiment} ${paralogQuery}`}
                                  {...HEATMAP_OPTIONS}
                                  atlasUrl={atlasUrl}
                                  query={paralogsQuery}
                                  experiment={atlasExperiment}/>
        }
      </Tab>
    }
    <Tab tabClassName="gxa" eventKey="gene" title="All Studies" key="gxa">
      {activeTab === "gene" &&
        <ExpressionAtlasHeatmap key={`${atlasUrl} all ${geneQuery}`}
                                {...HEATMAP_OPTIONS}
                                atlasUrl={atlasUrl}
                                query={allStudiesQuery}
                                experiment={false}/>
      }
    </Tab>
    {haveBAR(gene) &&
      <Tab tabClassName="eFP" eventKey="eFP" title="eFP Browser" key="bar">
        <BAR gene={gene}
             study={expr.barStudy}
             onStudyChange={v => setExpression({barStudy: v})}/>
      </Tab>
    }
  </Tabs>
};

export default connect(
  'selectConfiguration',
  'selectGrameneParalogs',
  'selectExpressionStudies',
  'selectExpressionStudiesShouldUpdate',
  'selectUiViewState',
  'doRequestParalogs',
  'doFetchExpressionStudies',
  'doSetExpressionState',
  Detail
);
