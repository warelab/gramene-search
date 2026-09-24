import React, { useEffect, useMemo } from 'react'
import {connect} from "redux-bundler-react";
import {Tabs, Tab, Form} from 'react-bootstrap';
import {ExpressionAtlasHeatmap, ExpressionFactorGrid} from 'gramene-atlas-heatmap';
import BAR, {haveBAR} from "./BAR";

// "EBI Studies" and "Paralogs" draw Expression Atlas heatmaps in the page with
// gramene-atlas-heatmap (warelab's React 18 fork of EBI's atlas-heatmap; the
// anatomogram comes from gramene-anatomogram), and "JGI Studies" draws one JGI
// study at a time as a grid of its factors (ExpressionFactorGrid from the same
// package). configuration.atlasUrl names the gramene-swagger /gxa/ instance to
// query; sites that leave it unset get the instance the old dev.gramene.org
// iframe widget fell back to.
const DEFAULT_ATLAS_URL = 'https://data.sorghumbase.org/auth_testing/gxa/';
const EBI_GXA = 'https://www.ebi.ac.uk/gxa/';

// A link's context names the genes in its query ({gene: 'A B'} or 'A B'), or
// in gene (ExpressionFactorGrid shows one gene).
const genesOf = context => {
  const query = context.query;
  const genes = (typeof query === 'string' ? query : query && query.gene) || context.gene;
  return genes ? genes.split(' ') : [];
};
const isEbiUrl = url => /^https?:\/\/www\.ebi\.ac\.uk\//i.test(url);
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
// JGI studies link to Phytozome, which takes no geneQuery. undefined keeps the
// heatmap's own URL.
const resolveUrl = (kind, url, context) => {
  const genes = genesOf(context);
  const withGenes = params => {
    if (genes.length) params.set('geneQuery', JSON.stringify(genes.map(value => ({value}))));
  };
  switch (kind) {
    case 'row': {
      const uri = context.row && context.row.uri;
      return uri && !/^https?:/i.test(uri) ? new URL(uri, EBI_GXA).href : undefined;
    }
    case 'atlas':
      return EBI_GXA;
    case 'experiment':
      return isEbiUrl(url) ? editSearch(url, withGenes) : undefined;
    case 'moreInformation':
      if (context.experiment) return isEbiUrl(url) ? editSearch(url, withGenes) : undefined;
      return genes.length ? `${EBI_GXA}genes/${encodeURIComponent(genes[0])}` : undefined;
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
const jgiStudyLabel = e => (e.description ? `${e.name || e._id}: ${e.description}` : e.name || e._id);

// The JGI studies (source 'JGI', e.g. the Mullet lab's JGI-SB-1..4 in sorghum)
// have their own sub-tab, so the EBI Studies heatmap drops their rows. The GXA
// API names a JGI row by the study's accession, by its name, or — for a study
// split by a second factor — '<study name> - <value>'.
const isJgiStudy = e => e.source === 'JGI';
const makeIsJgiRow = jgiStudies => {
  const accessions = new Set(jgiStudies.map(e => e._id));
  const names = jgiStudies.map(e => e.name).filter(Boolean);
  const isJgiName = s => typeof s === 'string' && names.some(n => s === n || s.startsWith(`${n} - `));
  return row => accessions.has(row.id) || isJgiName(row.id) || isJgiName(row.name);
};

const Detail = props => {
  const geneId = props.searchResult.id;
  const gene = props.geneDocs[geneId];
  // User-selected view state (active sub-tab, chosen GXA experiment, chosen JGI
  // study and its grid axes, chosen eFP study) lives in the uiViewState bundle
  // keyed by geneId, so the shareable-views snapshot can round-trip it.
  const expr = (props.uiViewState && props.uiViewState.byGene[geneId]
    && props.uiViewState.byGene[geneId].expression) || {};
  const atlasExperiment = expr.atlasExperiment || null;
  const setExpression = patch => props.doSetExpressionState({geneId, patch});

  // The expressionStudies resource is otherwise fetched only when a top-level
  // expression view (exprViz/expression/export) is on — but this per-gene
  // Expression detail also needs it (the Paralogs sub-tab's experiment list, the
  // atlasExperiment selection, the JGI Studies tab and the EBI Studies row
  // filter all derive from it). Fetch it here when it is missing or stale: it is
  // persisted, and a browser that cached the list before studies were added to
  // the release would otherwise keep offering the old list.
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

  // The Paralogs selector keeps offering every study; the JGI Studies tab lists
  // the gene's JGI studies. The EBI Studies rows are filtered on every JGI study
  // of the taxon, in case the gene's expressed_in_gxa_attr_ss is incomplete. The
  // filter is keyed on the studies' ids and names so that its identity (and the
  // heatmap's filtering) only changes when they do.
  const jgiStudies = useMemo(() => experiments.filter(isJgiStudy)
    .sort((a, b) => (jgiStudyLabel(a) < jgiStudyLabel(b) ? -1 : 1)), [experiments]);
  const allJgiStudies = studies ? studies.filter(isJgiStudy) : [];
  const allJgiKey = JSON.stringify(allJgiStudies.map(e => [e._id, e.name]));
  const filterRows = useMemo(() => {
    if (allJgiStudies.length === 0) return undefined;
    const isJgiRow = makeIsJgiRow(allJgiStudies);
    return row => !isJgiRow(row);
  }, [allJgiKey]);
  // The EBI Studies heatmap waits for the studies list, which names the JGI
  // studies its filter drops: drawn before the list is in (a first visit; the
  // list is persisted), it would show the JGI rows and then redraw without
  // them. If the list cannot be fetched, the heatmap is drawn unfiltered.
  const studiesSettled = !!props.expressionStudies || !!props.expressionStudiesLastError;

  // A saved JGI Studies tab falls back to EBI Studies once the studies are in
  // and the gene has none.
  const activeTab = expr.activeTab === 'jgi' && props.expressionStudies && jgiStudies.length === 0
    ? 'gene'
    : expr.activeTab || 'gene';
  const jgiExperiment = expr.jgiExperiment || (jgiStudies.length > 0 ? jgiStudies[0]._id : null);
  const knownJgiExperiment = jgiStudies.some(e => e._id === jgiExperiment);
  const jgiAxes = expr.jgiAxes || {};
  const jgiAxesOfStudy = (jgiExperiment && jgiAxes[jgiExperiment]) || {};
  const setJgiAxes = ({rowFactor, columnFactor}) =>
    setExpression({jgiAxes: {...jgiAxes, [jgiExperiment]: {rowFactor, columnFactor}}});

  // Only the active sub-tab's heatmap (or factor grid) is mounted; the keys give
  // each query its own fetch, zoom and filters.
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
    <Tab tabClassName="gxa" eventKey="gene" title="EBI Studies" key="gxa">
      {activeTab === "gene" && !studiesSettled &&
        <div className="text-muted small" role="status">Loading expression studies…</div>
      }
      {activeTab === "gene" && studiesSettled &&
        <ExpressionAtlasHeatmap key={`${atlasUrl} all ${geneQuery}`}
                                {...HEATMAP_OPTIONS}
                                atlasUrl={atlasUrl}
                                query={allStudiesQuery}
                                experiment={false}
                                filterRows={filterRows}/>
      }
    </Tab>
    {jgiStudies.length > 0 &&
      <Tab tabClassName="jgi" eventKey="jgi" title="JGI Studies" key="jgi">
        <Form.Select className="mb-2"
                     aria-label="JGI study selector"
                     value={jgiExperiment}
                     onChange={(e) => setExpression({jgiExperiment: e.target.value})}>
          {!knownJgiExperiment && <option value={jgiExperiment}>{jgiExperiment}</option>}
          {jgiStudies.map(e =>
            <option key={e._id} value={e._id}>{jgiStudyLabel(e)}</option>
          )}
        </Form.Select>
        {activeTab === "jgi" &&
          <ExpressionFactorGrid key={`${atlasUrl} ${jgiExperiment} ${geneQuery}`}
                                atlasUrl={atlasUrl}
                                experiment={jgiExperiment}
                                gene={geneQuery}
                                rowFactor={jgiAxesOfStudy.rowFactor}
                                columnFactor={jgiAxesOfStudy.columnFactor}
                                onChangeFactors={setJgiAxes}
                                linkTarget="_blank"
                                resolveUrl={resolveUrl}/>
        }
      </Tab>
    }
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
  'selectExpressionStudiesLastError',
  'selectUiViewState',
  'doRequestParalogs',
  'doFetchExpressionStudies',
  'doSetExpressionState',
  Detail
);
