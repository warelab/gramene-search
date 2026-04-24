import { buildTableData, toJSONRows } from './formatters';
import { ANCESTOR_FIELD_MAP, collectAncestorIds } from './ancestorsResolver';

const PAGE_SIZE = 1000;

function buildSearchURL(api, q, fl, rows, start, fq) {
  const params = [
    `q=${q}`,
    `rows=${rows}`,
    `start=${start}`,
    'facet=false'
  ];
  if (fl) params.push(`fl=${encodeURIComponent(fl)}`);
  return `${api}/search?${params.join('&')}${fq}`;
}

function triggerBrowserSave(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function runExporterDownload({ dispatch, store, requestId, signal, isSuperseded }) {
  const api = store.selectGrameneAPI();
  const q = store.selectGrameneFiltersQueryString();
  const g = store.selectGrameneGenomes();
  const m = store.selectGrameneMaps() || {};
  const taxa = Object.keys(g.active || {}).filter(tid => m[tid] && !m[tid].hidden);
  const fq = taxa.length ? `&fq=taxon_id:(${taxa.join(' OR ')})` : '';
  const fields = store.selectExporterSelectedFields();
  const fl = fields.join(',');
  const format = store.selectExporterFormat();
  const catalog = store.selectFieldCatalog();
  const expressionStudies = store.selectExpressionStudies();
  const expressionSamples = store.selectExpressionSamples();
  const ancestorFields = fields.filter(n => ANCESTOR_FIELD_MAP[n]);

  const cutoffs = store.selectExporterCutoffs && store.selectExporterCutoffs();
  const buildResolverCtx = () => ({
    expressionStudies,
    expressionSamples,
    taxonomy: store.selectGrameneTaxonomy(),
    pathways: store.selectGramenePathways(),
    ontologies: store.selectOntologies(),
    cutoffs
  });

  const ensureAncestorRecords = async (docs) => {
    if (ancestorFields.length === 0 || docs.length === 0) return;
    const idsByOnt = collectAncestorIds(docs, ancestorFields);
    const waits = [];
    for (const [ontKey, ids] of Object.entries(idsByOnt)) {
      if (!ids.length) continue;
      if (ontKey === 'taxonomy') continue;
      if (ontKey === 'pathways') {
        const pathwaysCache = store.selectGramenePathways() || {};
        const missing = ids.filter(id => !pathwaysCache.hasOwnProperty(id));
        if (missing.length) store.doRequestGramenePathways(missing);
        continue;
      }
      const p = store.doEnsureOntologyRecords(ontKey, ids);
      if (p && typeof p.then === 'function') waits.push(p);
    }
    if (waits.length) await Promise.all(waits);
  };

  const fetchJSON = (url) => fetch(url, { signal }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

  const countUrl = buildSearchURL(api, q, 'id', 0, 0, fq);
  const countResp = await fetchJSON(countUrl);
  const total = (countResp && countResp.response && countResp.response.numFound) || 0;

  dispatch({ type: 'EXPORTER_DOWNLOAD_STARTED', payload: { requestId, total } });

  if (total === 0) {
    dispatch({ type: 'EXPORTER_DOWNLOAD_COMPLETED', payload: { requestId, written: 0 } });
    return;
  }

  const tsvPieces = [];
  const jsonRows = [];
  let progress = 0;

  if (format === 'tsv') {
    const { header } = buildTableData([], fields, catalog, buildResolverCtx());
    tsvPieces.push(header.join('\t') + '\n');
  }

  let start = 0;
  while (start < total) {
    if (isSuperseded()) {
      dispatch({ type: 'EXPORTER_DOWNLOAD_CANCELLED', payload: { requestId } });
      return;
    }
    const url = buildSearchURL(api, q, fl, PAGE_SIZE, start, fq);
    const resp = await fetchJSON(url);
    const docs = (resp && resp.response && resp.response.docs) || [];
    if (docs.length === 0) break;

    await ensureAncestorRecords(docs);
    const resolverCtx = buildResolverCtx();

    if (format === 'tsv') {
      const { rows } = buildTableData(docs, fields, catalog, resolverCtx);
      for (const row of rows) tsvPieces.push(row.join('\t') + '\n');
    } else {
      const rows = toJSONRows(docs, fields, resolverCtx);
      for (const r of rows) jsonRows.push(r);
    }

    start += docs.length;
    progress = start;
    dispatch({ type: 'EXPORTER_DOWNLOAD_PROGRESS', payload: { requestId, progress } });
  }

  if (isSuperseded()) {
    dispatch({ type: 'EXPORTER_DOWNLOAD_CANCELLED', payload: { requestId } });
    return;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  let blob;
  let filename;
  if (format === 'tsv') {
    blob = new Blob(tsvPieces, { type: 'text/tab-separated-values' });
    filename = `gramene-export-${stamp}.tsv`;
  } else {
    blob = new Blob([JSON.stringify(jsonRows, null, 2)], { type: 'application/json' });
    filename = `gramene-export-${stamp}.json`;
  }

  triggerBrowserSave(blob, filename);
  dispatch({ type: 'EXPORTER_DOWNLOAD_COMPLETED', payload: { requestId, written: progress } });
}
