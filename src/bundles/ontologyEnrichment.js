import { createSelector } from 'redux-bundler';

// Ontology over-representation analysis (clusterProfiler::enrichGO-style).
//
// For each species tab we run:
//   foreground: q=<filters>&fq=taxon_id:<tid>&rows=0 + facet on six __ancestors fields
//   background: q=taxon_id:<tid>&rows=0           + same facets (cached forever per tid)
//
// For every ontology section we compute a single hypergeometric universe:
//   N = # genes annotated to any term in this ontology section (= largest bg facet count)
//   K = # input genes annotated to any term in this section    (= largest fg facet count)
// and per term:
//   M = bg facet count, count = fg facet count
//   p = P(X >= count), X ~ Hypergeometric(N, M, K)
// p-values are BH-adjusted across the tested terms in the section.
// GO is split into its three sub-ontologies (BP/MF/CC) by namespace so each
// gets its own (N, K) and BH correction, matching enrichGO. Terms with
// fewer than `minGSSize` or more than `maxGSSize` annotated genes are
// dropped before testing (enrichGO defaults: 10 / 500).

const ONTOLOGIES = [
  { key: 'GO',       field: 'GO__ancestors',       label: 'Gene Ontology',    bucket: 'GO' },
  { key: 'PO',       field: 'PO__ancestors',       label: 'Plant Ontology',   bucket: 'PO' },
  { key: 'TO',       field: 'TO__ancestors',       label: 'Trait Ontology',   bucket: 'TO' },
  { key: 'QTL_TO',   field: 'QTL_TO__ancestors',   label: 'QTL Traits (TO)',  bucket: 'TO' },
  { key: 'domains',  field: 'domains__ancestors',  label: 'InterPro Domains', bucket: 'domains' },
  { key: 'pathways', field: 'pathways__ancestors', label: 'Pathways',         bucket: null }
];

const FACET_PARAMS = ONTOLOGIES.map(o =>
  `facet.field=${encodeURIComponent(`{!facet.limit=10000 facet.mincount=1 key=${o.key}}${o.field}`)}`
).join('&');

const fgPending = {};
const bgPending = {};

function fgSig(q, taxon) { return `${q}|${taxon}`; }
function bgSig(taxon)    { return `bg|${taxon}`; }

function parseFacets(json) {
  const out = {};
  const ff = (json && json.facet_counts && json.facet_counts.facet_fields) || {};
  for (const o of ONTOLOGIES) {
    const arr = ff[o.key] || [];
    const map = {};
    for (let i = 0; i < arr.length; i += 2) {
      map[+arr[i]] = +arr[i + 1];
    }
    out[o.key] = map;
  }
  return out;
}

const ontologyEnrichment = {
  name: 'ontologyEnrichment',

  // Background facet counts depend only on the species — they're invariant
  // across filter changes and across sessions, so we persist whenever a bg
  // fetch completes. Foreground state piggybacks on the same write but is
  // self-invalidated by the signature check in the reactor.
  persistActions: ['ONTOLOGY_ENRICHMENT_BG_SUCCEEDED'],

  getReducer: () => {
    const initialState = {
      activeTaxon: null,
      byTaxon: {},
      ui: {
        pAdjCutoff: 0.05,
        minGSSize: 10,
        maxGSSize: 500,
        mostSpecific: false,
        ontology: 'all',
        search: '',
        // Per-section table sort, keyed by ontology section id (e.g.
        // 'GO:biological_process'): { [sectionKey]: { key, dir } }.
        sort: {}
      }
    };

    function ensureTaxon(state, tid) {
      if (state.byTaxon[tid]) return state;
      return {
        ...state,
        byTaxon: {
          ...state.byTaxon,
          [tid]: {
            fg: { status: 'idle', signature: null, requestId: 0, terms: null, numFound: 0, error: null },
            bg: { status: 'idle', signature: null, requestId: 0, terms: null, numFound: 0, error: null }
          }
        }
      };
    }

    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'ONTOLOGY_ENRICHMENT_ACTIVE_TAXON_SET':
          return { ...ensureTaxon(state, payload), activeTaxon: payload };

        case 'ONTOLOGY_ENRICHMENT_UI_SET':
          return { ...state, ui: { ...state.ui, ...(payload || {}) } };

        case 'ONTOLOGY_ENRICHMENT_FG_STARTED': {
          const next = ensureTaxon(state, payload.taxon);
          const t = next.byTaxon[payload.taxon];
          return {
            ...next,
            byTaxon: {
              ...next.byTaxon,
              [payload.taxon]: {
                ...t,
                fg: { status: 'loading', signature: payload.signature, requestId: payload.requestId, terms: t.fg.terms, numFound: t.fg.numFound, error: null }
              }
            }
          };
        }
        case 'ONTOLOGY_ENRICHMENT_FG_SUCCEEDED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.fg.requestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, fg: { ...t.fg, status: 'ready', terms: payload.terms, numFound: payload.numFound } }
            }
          };
        }
        case 'ONTOLOGY_ENRICHMENT_FG_FAILED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.fg.requestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, fg: { ...t.fg, status: 'error', error: payload.error } }
            }
          };
        }

        case 'ONTOLOGY_ENRICHMENT_BG_STARTED': {
          const next = ensureTaxon(state, payload.taxon);
          const t = next.byTaxon[payload.taxon];
          return {
            ...next,
            byTaxon: {
              ...next.byTaxon,
              [payload.taxon]: {
                ...t,
                bg: { status: 'loading', signature: payload.signature, requestId: payload.requestId, terms: t.bg.terms, numFound: t.bg.numFound, error: null }
              }
            }
          };
        }
        case 'ONTOLOGY_ENRICHMENT_BG_SUCCEEDED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.bg.requestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, bg: { ...t.bg, status: 'ready', terms: payload.terms, numFound: payload.numFound } }
            }
          };
        }
        case 'ONTOLOGY_ENRICHMENT_BG_FAILED': {
          const t = state.byTaxon[payload.taxon];
          if (!t || payload.requestId !== t.bg.requestId) return state;
          return {
            ...state,
            byTaxon: {
              ...state.byTaxon,
              [payload.taxon]: { ...t, bg: { ...t.bg, status: 'error', error: payload.error } }
            }
          };
        }

        case 'GRAMENE_SEARCH_CLEARED': {
          // Filters changed — invalidate foreground but keep background
          // (it depends only on taxon).
          const newByTaxon = {};
          for (const tid of Object.keys(state.byTaxon)) {
            const t = state.byTaxon[tid];
            newByTaxon[tid] = {
              ...t,
              fg: { status: 'idle', signature: null, requestId: 0, terms: null, numFound: 0, error: null }
            };
          }
          return { ...state, byTaxon: newByTaxon };
        }

        default:
          return state;
      }
    };
  },

  doSetOntologyEnrichmentActiveTaxon: tid => ({ dispatch }) =>
    dispatch({ type: 'ONTOLOGY_ENRICHMENT_ACTIVE_TAXON_SET', payload: tid }),

  doSetOntologyEnrichmentUI: patch => ({ dispatch }) =>
    dispatch({ type: 'ONTOLOGY_ENRICHMENT_UI_SET', payload: patch }),

  // Re-apply persisted view config from a saved-view snapshot. Setting the
  // active taxon (last) lets reactOntologyEnrichmentFetch re-fetch the
  // foreground/background facets for the restored filters — no bulk data is
  // carried in the snapshot.
  doApplyOntologyEnrichmentSnapshot: snap => ({ dispatch }) => {
    if (!snap || typeof snap !== 'object') return;
    if (snap.ui) dispatch({ type: 'ONTOLOGY_ENRICHMENT_UI_SET', payload: snap.ui });
    if (snap.activeTaxon) dispatch({ type: 'ONTOLOGY_ENRICHMENT_ACTIVE_TAXON_SET', payload: snap.activeTaxon });
  },

  doFetchOntologyEnrichmentForeground: taxon => ({ dispatch, store }) => {
    const q = store.selectGrameneFiltersQueryString();
    const signature = fgSig(q, taxon);
    const state = store.selectOntologyEnrichment();
    const t = state.byTaxon[taxon];
    if (t && t.fg.signature === signature && (t.fg.status === 'loading' || t.fg.status === 'ready')) return;
    const requestId = (fgPending[taxon] = (fgPending[taxon] || 0) + 1);
    dispatch({ type: 'ONTOLOGY_ENRICHMENT_FG_STARTED', payload: { taxon, signature, requestId } });

    const api = store.selectGrameneAPI();
    const url = `${api}/search?q=${q}&fq=taxon_id:${taxon}&rows=0&facet=true&${FACET_PARAMS}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (requestId !== fgPending[taxon]) return;
        const terms = parseFacets(json);
        const numFound = (json && json.response && json.response.numFound) || 0;
        dispatch({ type: 'ONTOLOGY_ENRICHMENT_FG_SUCCEEDED', payload: { taxon, requestId, terms, numFound } });
        store.doEnsureOntologyEnrichmentTermRecords(taxon);
      })
      .catch(err => {
        if (requestId !== fgPending[taxon]) return;
        dispatch({ type: 'ONTOLOGY_ENRICHMENT_FG_FAILED', payload: { taxon, requestId, error: String(err) } });
      });
  },

  doFetchOntologyEnrichmentBackground: taxon => ({ dispatch, store }) => {
    const signature = bgSig(taxon);
    const state = store.selectOntologyEnrichment();
    const t = state.byTaxon[taxon];
    if (t && t.bg.signature === signature && (t.bg.status === 'loading' || t.bg.status === 'ready')) return;
    const requestId = (bgPending[taxon] = (bgPending[taxon] || 0) + 1);
    dispatch({ type: 'ONTOLOGY_ENRICHMENT_BG_STARTED', payload: { taxon, signature, requestId } });

    const api = store.selectGrameneAPI();
    const url = `${api}/search?q=taxon_id:${taxon}&rows=0&facet=true&${FACET_PARAMS}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (requestId !== bgPending[taxon]) return;
        const terms = parseFacets(json);
        const numFound = (json && json.response && json.response.numFound) || 0;
        dispatch({ type: 'ONTOLOGY_ENRICHMENT_BG_SUCCEEDED', payload: { taxon, requestId, terms, numFound } });
        store.doEnsureOntologyEnrichmentTermRecords(taxon);
      })
      .catch(err => {
        if (requestId !== bgPending[taxon]) return;
        dispatch({ type: 'ONTOLOGY_ENRICHMENT_BG_FAILED', payload: { taxon, requestId, error: String(err) } });
      });
  },

  doEnsureOntologyEnrichmentTermRecords: taxon => ({ store }) => {
    const state = store.selectOntologyEnrichment();
    if (!state.byTaxon[taxon]) return;
    // The ontologies and pathways bundles bulk-load + persist on first
    // request; we just need to nudge each one once.
    const buckets = new Set();
    for (const o of ONTOLOGIES) {
      if (o.bucket) buckets.add(o.bucket);
    }
    for (const k of buckets) {
      store.doEnsureOntologyRecords(k);
    }
    if (store.doRequestGramenePathways) {
      store.doRequestGramenePathways();
    }
  },

  reactOntologyEnrichmentFetch: createSelector(
    'selectOntologyEnrichment',
    'selectGrameneFiltersStatus',
    'selectGrameneFiltersQueryString',
    'selectGrameneViewsOn',
    (gs, fStatus, q, viewsOn) => {
      if (!viewsOn || !viewsOn.has('ontologyEnrichment')) return;
      if (fStatus === 'init') return;
      const tid = gs.activeTaxon;
      if (!tid) return;
      const t = gs.byTaxon[tid];
      if (!t) return;
      const sig = fgSig(q, tid);
      // A 'loading' status from a rehydrated state with no live request is
      // treated as idle — otherwise we'd deadlock waiting on a fetch that
      // ended when the previous tab closed.
      const fgInFlight = t.fg.status === 'loading' && (fgPending[tid] || 0) === t.fg.requestId && t.fg.requestId > 0;
      if (t.fg.signature !== sig && !fgInFlight) {
        return { actionCreator: 'doFetchOntologyEnrichmentForeground', args: [tid] };
      }
      const bgInFlight = t.bg.status === 'loading' && (bgPending[tid] || 0) === t.bg.requestId && t.bg.requestId > 0;
      if (t.bg.status !== 'ready' && !bgInFlight) {
        return { actionCreator: 'doFetchOntologyEnrichmentBackground', args: [tid] };
      }
    }
  ),

  selectOntologyEnrichment: state => state.ontologyEnrichment,
  selectOntologyEnrichmentUI: state => state.ontologyEnrichment.ui,
  selectOntologyEnrichmentOntologyDefs: () => ONTOLOGIES,

  selectOntologyEnrichmentResults: createSelector(
    'selectOntologyEnrichment',
    'selectOntologies',
    'selectGramenePathways',
    (gs, ontoBuckets, pathwayDocs) => {
      const tid = gs.activeTaxon;
      if (!tid) return null;
      const t = gs.byTaxon[tid];
      if (!t || !t.fg.terms || !t.bg.terms) return null;
      const ui = gs.ui;
      const out = {};
      for (const o of ONTOLOGIES) {
        const fg = t.fg.terms[o.key] || {};
        const bg = t.bg.terms[o.key] || {};
        const recs = o.key === 'pathways' ? (pathwayDocs || {}) : ((ontoBuckets && ontoBuckets[o.bucket]) || {});

        // GO is tested per sub-ontology (BP / MF / CC) so each gets its
        // own universe size and BH correction, matching enrichGO. We can
        // only split once ontology records have arrived and namespaces are
        // known; until then, fall through to a single-section test.
        if (o.key === 'GO' && Object.keys(recs).length > 0) {
          const byNs = { biological_process: { fg: {}, bg: {} },
                         molecular_function: { fg: {}, bg: {} },
                         cellular_component: { fg: {}, bg: {} } };
          for (const idStr of Object.keys(bg)) {
            const id = +idStr;
            const ns = recs[id] && recs[id].namespace;
            if (!byNs[ns]) continue;
            byNs[ns].bg[id] = bg[id];
            if (fg[id] != null) byNs[ns].fg[id] = fg[id];
          }
          for (const idStr of Object.keys(fg)) {
            const id = +idStr;
            const ns = recs[id] && recs[id].namespace;
            if (!byNs[ns]) continue;
            if (byNs[ns].fg[id] == null) byNs[ns].fg[id] = fg[id];
          }
          for (const ns of Object.keys(byNs)) {
            const sectionKey = `GO:${ns}`;
            const sectionLabel = `GO: ${titleCase(ns)}`;
            out[sectionKey] = enrichSection(
              byNs[ns].fg, byNs[ns].bg, recs, ui,
              o.key, o.field, o.label, sectionKey, sectionLabel
            );
          }
        } else {
          out[o.key] = enrichSection(
            fg, bg, recs, ui,
            o.key, o.field, o.label, o.key, o.label
          );
        }
      }
      return out;
    }
  )
};

function titleCase(s) {
  return String(s).split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

// One ORA section: hypergeometric over a single (N, K) universe, BH-adjusted
// across tested terms. Universe sizes come from the largest facet count in
// the section — for an ontology with a synthetic root that's the root's
// gene count (exact), and for forests it's the most populated top-level
// term (a conservative approximation).
function enrichSection(fg, bg, recs, ui, ontKey, ontField, ontLabel, sectionKey, sectionLabel) {
  let N = 0, K = 0;
  for (const idStr of Object.keys(bg)) {
    const v = bg[idStr]; if (v > N) N = v;
  }
  for (const idStr of Object.keys(fg)) {
    const v = fg[idStr]; if (v > K) K = v;
  }
  const empty = {
    ontology: sectionKey, label: sectionLabel, field: ontField,
    tested: 0, passing: 0, rows: [],
    universeSize: N, deSize: K
  };
  if (N <= 0 || K <= 0) return empty;

  const minGS = Math.max(1, +ui.minGSSize || 1);
  const maxGS = Math.max(minGS, +ui.maxGSSize || N);

  const rows = [];
  for (const idStr of Object.keys(fg)) {
    const id = +idStr;
    const count = fg[id];
    const M = bg[id] || 0;
    if (M < count) continue;
    if (M < minGS || M > maxGS) continue;
    const termRec = recs && recs[id];
    if (termRec && (termRec.is_obsolete || termRec.obsolete)) continue;
    if (count > K || M > N) continue;

    const p = fisherUpperTail(count, K, M, N);
    const richFactor = M > 0 ? count / M : 0;
    const foldEnrichment = (M > 0 && K > 0) ? (count / K) / (M / N) : 0;
    const mu = M * K / N;
    const sigma2 = N > 1 ? mu * (N - K) * (N - M) / N / (N - 1) : 0;
    const zScore = sigma2 > 0 ? (count - mu) / Math.sqrt(sigma2) : 0;

    rows.push({
      ontology: ontKey,
      ontology_label: ontLabel,
      term_id: id,
      field: ontField,
      Count: count,
      DESize: K,
      SetSize: M,
      UniverseSize: N,
      GeneRatio: `${count}/${K}`,
      BgRatio: `${M}/${N}`,
      RichFactor: richFactor,
      FoldEnrichment: foldEnrichment,
      zScore,
      pvalue: p,
      pAdjust: 1
    });
  }

  // BH adjustment across all tested terms in this section.
  rows.sort((a, b) => a.pvalue - b.pvalue);
  const m = rows.length;
  let prev = 1;
  for (let i = m - 1; i >= 0; i--) {
    const adj = Math.min(prev, rows[i].pvalue * m / (i + 1));
    rows[i].pAdjust = adj;
    prev = adj;
  }

  const passing = rows.filter(r => r.pAdjust <= ui.pAdjCutoff && r.pvalue <= ui.pAdjCutoff);
  let display = passing;
  if (ui.mostSpecific) {
    display = collapseToMostSpecific(ontKey, passing, recs);
  }
  for (const r of display) {
    const rec = recs && recs[r.term_id];
    if (rec) {
      r.term_name = rec.name || rec.display_name || '';
      r.term_namespace = rec.namespace || rec.type || '';
      r.term_display_id = rec.id != null ? String(rec.id) : String(r.term_id);
    } else {
      r.term_name = '';
      r.term_namespace = '';
      r.term_display_id = String(r.term_id);
    }
    r.Description = r.term_name || r.term_display_id;
  }
  display.sort((a, b) => a.pAdjust - b.pAdjust || b.FoldEnrichment - a.FoldEnrichment);

  return {
    ontology: sectionKey,
    label: sectionLabel,
    field: ontField,
    tested: rows.length,
    passing: passing.length,
    rows: display,
    universeSize: N,
    deSize: K
  };
}

// ---------- math helpers ----------

const LF_CACHE = [0, 0];
function logFactorial(n) {
  if (n < LF_CACHE.length) return LF_CACHE[n];
  let lf = LF_CACHE[LF_CACHE.length - 1];
  for (let i = LF_CACHE.length; i <= n; i++) {
    lf += Math.log(i);
    LF_CACHE.push(lf);
  }
  return LF_CACHE[n];
}
function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}
function logHypergeom(x, n, K, N) {
  return logChoose(K, x) + logChoose(N - K, n - x) - logChoose(N, n);
}
function logSumExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}
function fisherUpperTail(k, n, K, N) {
  const upper = Math.min(n, K);
  let logP = -Infinity;
  for (let x = k; x <= upper; x++) {
    logP = logSumExp(logP, logHypergeom(x, n, K, N));
  }
  const p = Math.exp(logP);
  if (!isFinite(p)) return 1;
  return Math.min(1, Math.max(0, p));
}

// ---------- ontology graph helpers ----------

function ancestorsOf(ontKey, id, recs) {
  const out = new Set();
  const rec = recs && recs[id];
  if (!rec) return out;
  if (ontKey === 'pathways') {
    for (const k of Object.keys(rec)) {
      if (k.startsWith('ancestors_') && Array.isArray(rec[k])) {
        for (const a of rec[k]) if (+a !== +id) out.add(+a);
      }
    }
    return out;
  }
  if (Array.isArray(rec.ancestors)) {
    for (const a of rec.ancestors) if (+a !== +id) out.add(+a);
    return out;
  }
  if (Array.isArray(rec.is_a)) {
    const stack = rec.is_a.slice();
    while (stack.length) {
      const cur = +stack.pop();
      if (out.has(cur)) continue;
      out.add(cur);
      const r = recs[cur];
      if (r && Array.isArray(r.is_a)) for (const p of r.is_a) stack.push(p);
    }
  }
  return out;
}

// Drop any term that is an ancestor of another term in the same passing set.
// Applied AFTER BH so a parent term can survive when none of its children
// pass the p_adj cutoff.
function collapseToMostSpecific(ontKey, rows, recs) {
  if (!rows || rows.length <= 1) return rows;
  const inSet = new Set(rows.map(r => +r.term_id));
  const covered = new Set();
  for (const r of rows) {
    const ancs = ancestorsOf(ontKey, +r.term_id, recs);
    for (const a of ancs) if (inSet.has(a)) covered.add(a);
  }
  return rows.filter(r => !covered.has(+r.term_id));
}

export default ontologyEnrichment;
