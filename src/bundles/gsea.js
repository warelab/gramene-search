import { createSelector } from 'redux-bundler';

// Gene Set Enrichment Analysis bundle.
//
// For each species tab we run:
//   foreground: q=<filters>&fq=taxon_id:<tid>&rows=0 + facet on six __ancestors fields
//   background: q=taxon_id:<tid>&rows=0           + same facets (cached forever per tid)
//
// Per-ontology denominators (n_ont, N_ont) come from the root term's facet
// count, since every annotated gene carries the root in __ancestors. Roots
// are identified once ontology records are loaded by picking the ancestor
// (or self) with the highest background facet count — this works for
// multi-rooted GO (BP/MF/CC) and for the rice-rooted pathway tree.
//
// Enrichment uses the upper-tail Fisher exact (hypergeometric); p-values
// are corrected per ontology with Benjamini–Hochberg. The "most-specific"
// collapse is applied AFTER BH so a parent term that's significant on its
// own is preserved even when none of its children clear the cutoff.

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

const gsea = {
  name: 'gsea',

  // Background facet counts depend only on the species — they're invariant
  // across filter changes and across sessions, so we persist whenever a bg
  // fetch completes. Foreground state piggybacks on the same write but is
  // self-invalidated by the signature check in the reactor.
  persistActions: ['GSEA_BG_SUCCEEDED'],

  getReducer: () => {
    const initialState = {
      activeTaxon: null,
      byTaxon: {},
      ui: {
        pAdjCutoff: 0.05,
        minK: 2,
        mostSpecific: true,
        ontology: 'all',
        search: ''
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
        case 'GSEA_ACTIVE_TAXON_SET':
          return { ...ensureTaxon(state, payload), activeTaxon: payload };

        case 'GSEA_UI_SET':
          return { ...state, ui: { ...state.ui, ...(payload || {}) } };

        case 'GSEA_FG_STARTED': {
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
        case 'GSEA_FG_SUCCEEDED': {
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
        case 'GSEA_FG_FAILED': {
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

        case 'GSEA_BG_STARTED': {
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
        case 'GSEA_BG_SUCCEEDED': {
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
        case 'GSEA_BG_FAILED': {
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

  doSetGseaActiveTaxon: tid => ({ dispatch }) =>
    dispatch({ type: 'GSEA_ACTIVE_TAXON_SET', payload: tid }),

  doSetGseaUI: patch => ({ dispatch }) =>
    dispatch({ type: 'GSEA_UI_SET', payload: patch }),

  doFetchGseaForeground: taxon => ({ dispatch, store }) => {
    const q = store.selectGrameneFiltersQueryString();
    const signature = fgSig(q, taxon);
    const state = store.selectGsea();
    const t = state.byTaxon[taxon];
    if (t && t.fg.signature === signature && (t.fg.status === 'loading' || t.fg.status === 'ready')) return;
    const requestId = (fgPending[taxon] = (fgPending[taxon] || 0) + 1);
    dispatch({ type: 'GSEA_FG_STARTED', payload: { taxon, signature, requestId } });

    const api = store.selectGrameneAPI();
    const url = `${api}/search?q=${q}&fq=taxon_id:${taxon}&rows=0&facet=true&${FACET_PARAMS}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (requestId !== fgPending[taxon]) return;
        const terms = parseFacets(json);
        const numFound = (json && json.response && json.response.numFound) || 0;
        dispatch({ type: 'GSEA_FG_SUCCEEDED', payload: { taxon, requestId, terms, numFound } });
        store.doEnsureGseaTermRecords(taxon);
      })
      .catch(err => {
        if (requestId !== fgPending[taxon]) return;
        dispatch({ type: 'GSEA_FG_FAILED', payload: { taxon, requestId, error: String(err) } });
      });
  },

  doFetchGseaBackground: taxon => ({ dispatch, store }) => {
    const signature = bgSig(taxon);
    const state = store.selectGsea();
    const t = state.byTaxon[taxon];
    if (t && t.bg.signature === signature && (t.bg.status === 'loading' || t.bg.status === 'ready')) return;
    const requestId = (bgPending[taxon] = (bgPending[taxon] || 0) + 1);
    dispatch({ type: 'GSEA_BG_STARTED', payload: { taxon, signature, requestId } });

    const api = store.selectGrameneAPI();
    const url = `${api}/search?q=taxon_id:${taxon}&rows=0&facet=true&${FACET_PARAMS}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (requestId !== bgPending[taxon]) return;
        const terms = parseFacets(json);
        const numFound = (json && json.response && json.response.numFound) || 0;
        dispatch({ type: 'GSEA_BG_SUCCEEDED', payload: { taxon, requestId, terms, numFound } });
        store.doEnsureGseaTermRecords(taxon);
      })
      .catch(err => {
        if (requestId !== bgPending[taxon]) return;
        dispatch({ type: 'GSEA_BG_FAILED', payload: { taxon, requestId, error: String(err) } });
      });
  },

  doEnsureGseaTermRecords: taxon => ({ store }) => {
    const state = store.selectGsea();
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

  reactGseaFetch: createSelector(
    'selectGsea',
    'selectGrameneFiltersStatus',
    'selectGrameneFiltersQueryString',
    'selectGrameneViewsOn',
    (gs, fStatus, q, viewsOn) => {
      if (!viewsOn || !viewsOn.has('gsea')) return;
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
        return { actionCreator: 'doFetchGseaForeground', args: [tid] };
      }
      const bgInFlight = t.bg.status === 'loading' && (bgPending[tid] || 0) === t.bg.requestId && t.bg.requestId > 0;
      if (t.bg.status !== 'ready' && !bgInFlight) {
        return { actionCreator: 'doFetchGseaBackground', args: [tid] };
      }
    }
  ),

  selectGsea: state => state.gsea,
  selectGseaUI: state => state.gsea.ui,
  selectGseaOntologyDefs: () => ONTOLOGIES,

  selectGseaResults: createSelector(
    'selectGsea',
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

        // Forest-fallback denominators: when a term is itself a forest root
        // (no parents in `recs` — common for InterPro), root finding returns
        // the term and we'd get fold=1 by construction. Use the maximum
        // counts across the ontology as a proxy for "annotated in this
        // ontology" instead. For ontologies with a true synthetic root,
        // these maxima equal the root counts and the answer is unchanged.
        let maxFg = 0, maxBg = 0;
        for (const idStr of Object.keys(bg)) {
          const v = bg[idStr];
          if (v > maxBg) maxBg = v;
        }
        for (const idStr of Object.keys(fg)) {
          const v = fg[idStr];
          if (v > maxFg) maxFg = v;
        }

        const rootCache = {};
        const rootOf = (id) => {
          if (rootCache.hasOwnProperty(id)) return rootCache[id];
          const r = findRoot(o.key, id, recs, bg);
          rootCache[id] = r;
          return r;
        };

        const rows = [];
        for (const idStr of Object.keys(fg)) {
          const id = +idStr;
          const k = fg[id];
          const K = bg[id] || 0;
          if (K < k) continue; // bg should always be >= fg
          if (k < ui.minK) continue;
          const termRec = recs && recs[id];
          if (termRec && (termRec.is_obsolete || termRec.obsolete)) continue;
          const root = rootOf(id);
          // If the "root" is the term itself, the term is a forest root in
          // this ontology — fall back to ontology-wide maxima.
          const fellBack = (+root === id);
          const n = fellBack ? maxFg : ((root != null && fg[root]) ? fg[root] : k);
          const N = fellBack ? maxBg : ((root != null && bg[root]) ? bg[root] : K);
          if (n <= 0 || N <= 0) continue;
          if (k > n || K > N) continue;
          const fold = (k / n) / (K / N);
          const p = fisherUpperTail(k, n, K, N);
          rows.push({
            ontology: o.key,
            ontology_label: o.label,
            term_id: id,
            field: o.field,
            k, n, K, N, fold, p, pAdj: 1,
            root,
            denomFallback: fellBack
          });
        }

        // GO is split into its three top-level namespaces (BP / MF / CC)
        // and each is tested as its own ontology — both BH correction and
        // most-specific collapse run within a namespace. We only split once
        // ontology records have arrived and root finding has produced
        // canonical roots; otherwise we'd see a swarm of singleton groups
        // during the brief loading window between bg landing and records
        // being fetched.
        if (o.key === 'GO' && Object.keys(recs).length > 0) {
          const byRoot = {};
          for (const r of rows) {
            const k = String(r.root);
            if (!byRoot[k]) byRoot[k] = [];
            byRoot[k].push(r);
          }
          const rootKeys = Object.keys(byRoot).sort((a, b) => {
            const na = goRootName(recs[+a]) || a;
            const nb = goRootName(recs[+b]) || b;
            return na.localeCompare(nb);
          });
          for (const rootKey of rootKeys) {
            const rootRec = recs[+rootKey];
            const rootName = goRootName(rootRec);
            const sectionKey = `GO:${rootKey}`;
            const sectionLabel = rootName ? `GO: ${titleCase(rootName)}` : `GO: ${rootKey}`;
            out[sectionKey] = finalizeBlock(
              byRoot[rootKey], o.key, o.field, recs, ui, sectionKey, sectionLabel
            );
          }
        } else {
          out[o.key] = finalizeBlock(rows, o.key, o.field, recs, ui, o.key, o.label);
        }
      }
      return out;
    }
  )
};

function goRootName(rec) {
  if (!rec) return '';
  return rec.name || rec.display_name || rec.namespace || '';
}

function titleCase(s) {
  return String(s).split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

// BH correction + most-specific collapse + metadata + final sort, returning
// the block descriptor consumed by the view layer.
function finalizeBlock(rows, ontKey, ontField, recs, ui, sectionKey, sectionLabel) {
  rows.sort((a, b) => a.p - b.p);
  const m = rows.length;
  let prev = 1;
  for (let i = m - 1; i >= 0; i--) {
    const adj = Math.min(prev, rows[i].p * m / (i + 1));
    rows[i].pAdj = adj;
    prev = adj;
  }
  const passing = rows.filter(r => r.pAdj <= ui.pAdjCutoff);
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
  }
  display.sort((a, b) => a.pAdj - b.pAdj || b.fold - a.fold);
  return {
    ontology: sectionKey,
    label: sectionLabel,
    field: ontField,
    tested: rows.length,
    passing: passing.length,
    rows: display
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

// Pick the "root" for a term as the ancestor (or self) with the highest
// background facet count. The true root has every annotated gene under it,
// so this selects BP/MF/CC for GO terms automatically and the rice root
// for pathways without needing per-ontology hardcoded ids.
function findRoot(ontKey, id, recs, bgCounts) {
  const rec = recs && recs[id];
  const candidates = new Set([+id]);
  if (rec) {
    if (ontKey === 'pathways') {
      for (const k of Object.keys(rec)) {
        if (k.startsWith('ancestors_') && Array.isArray(rec[k])) {
          for (const a of rec[k]) candidates.add(+a);
        }
      }
    } else if (Array.isArray(rec.ancestors)) {
      for (const a of rec.ancestors) candidates.add(+a);
    } else if (Array.isArray(rec.is_a)) {
      const stack = rec.is_a.slice();
      while (stack.length) {
        const cur = +stack.pop();
        if (candidates.has(cur)) continue;
        candidates.add(cur);
        const r = recs[cur];
        if (r && Array.isArray(r.is_a)) for (const p of r.is_a) stack.push(p);
      }
    }
  }
  let best = +id;
  let bestCount = bgCounts[+id] || 0;
  for (const c of candidates) {
    const cnt = bgCounts[c] || 0;
    if (cnt > bestCount) { bestCount = cnt; best = c; }
  }
  return best;
}

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

export default gsea;
