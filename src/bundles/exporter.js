import { createSelector } from 'redux-bundler';
import { runExporterDownload } from '../components/exporter/downloadRunner';

const DEFAULT_FIELDS = ['id', 'name', 'system_name', 'biotype'];
const PREVIEW_ROWS = 20;
const PREVIEW_DEBOUNCE_MS = 250;

function computePreviewSignature(store) {
  const q = store.selectGrameneFiltersQueryString();
  const g = store.selectGrameneGenomes();
  const m = store.selectGrameneMaps() || {};
  const taxa = Object.keys(g.active || {}).filter(tid => m[tid] && !m[tid].hidden);
  return `${q}|${taxa.sort().join(',')}`;
}

let debounceTimer = null;
let pendingRequestId = 0;
let pendingDownloadId = 0;
let currentDownloadController = null;

const markStale = (preview) => ({ ...preview, status: 'stale' });

const exporter = {
  name: 'exporter',

  getReducer: () => {
    const initialState = {
      selectedFields: DEFAULT_FIELDS,
      format: 'tsv',
      cutoffs: { exprMinTPM: 0.5, diffMaxPval: 0.05 },
      preview: { status: 'stale', data: null, error: null, requestId: 0, signature: null },
      download: { status: 'idle', progress: 0, total: 0, error: null, requestId: 0 }
    };
    return (state = initialState, { type, payload }) => {
      switch (type) {
        case 'EXPORTER_FIELD_TOGGLED': {
          const idx = state.selectedFields.indexOf(payload);
          const selectedFields = idx === -1
            ? [...state.selectedFields, payload]
            : state.selectedFields.filter(f => f !== payload);
          return { ...state, selectedFields };
        }
        case 'EXPORTER_FIELDS_REORDERED':
          return { ...state, selectedFields: payload };
        case 'EXPORTER_FIELDS_BULK_SET': {
          const { names, selected } = payload;
          if (!Array.isArray(names) || names.length === 0) return state;
          if (selected) {
            const existing = new Set(state.selectedFields);
            const additions = names.filter(n => !existing.has(n));
            if (additions.length === 0) return state;
            return { ...state, selectedFields: [...state.selectedFields, ...additions] };
          }
          const remove = new Set(names);
          const next = state.selectedFields.filter(n => !remove.has(n));
          if (next.length === state.selectedFields.length) return state;
          return { ...state, selectedFields: next };
        }
        case 'EXPORTER_FORMAT_SET':
          return { ...state, format: payload };
        case 'EXPORTER_CUTOFFS_SET':
          return { ...state, cutoffs: { ...state.cutoffs, ...(payload || {}) } };
        case 'EXPORTER_FIELDS_CLEARED':
          return { ...state, selectedFields: [] };
        case 'EXPORTER_PREVIEW_INVALIDATED':
          return { ...state, preview: markStale(state.preview) };

        case 'EXPORTER_PREVIEW_STARTED':
          return {
            ...state,
            preview: { ...state.preview, status: 'loading', requestId: payload.requestId, error: null, signature: payload.signature }
          };
        case 'EXPORTER_PREVIEW_SUCCEEDED':
          if (payload.requestId !== state.preview.requestId) return state;
          return {
            ...state,
            preview: { status: 'ready', data: payload.data, error: null, requestId: payload.requestId, signature: state.preview.signature }
          };
        case 'EXPORTER_PREVIEW_FAILED':
          if (payload.requestId !== state.preview.requestId) return state;
          return {
            ...state,
            preview: { ...state.preview, status: 'error', error: payload.error }
          };

        case 'EXPORTER_DOWNLOAD_REQUESTED':
          return {
            ...state,
            download: { status: 'preparing', progress: 0, total: 0, error: null, requestId: payload.requestId }
          };
        case 'EXPORTER_DOWNLOAD_STARTED':
          if (payload.requestId !== state.download.requestId) return state;
          return {
            ...state,
            download: { ...state.download, status: 'downloading', total: payload.total }
          };
        case 'EXPORTER_DOWNLOAD_PROGRESS':
          if (payload.requestId !== state.download.requestId) return state;
          return {
            ...state,
            download: { ...state.download, progress: payload.progress }
          };
        case 'EXPORTER_DOWNLOAD_COMPLETED':
          if (payload.requestId !== state.download.requestId) return state;
          return {
            ...state,
            download: { ...state.download, status: 'done', progress: payload.written || state.download.progress }
          };
        case 'EXPORTER_DOWNLOAD_CANCELLED':
          if (payload.requestId !== state.download.requestId) return state;
          return {
            ...state,
            download: { ...state.download, status: 'cancelled' }
          };
        case 'EXPORTER_DOWNLOAD_FAILED':
          if (payload.requestId !== state.download.requestId) return state;
          return {
            ...state,
            download: { ...state.download, status: 'error', error: payload.error }
          };
        case 'EXPORTER_DOWNLOAD_RESET':
          return {
            ...state,
            download: { status: 'idle', progress: 0, total: 0, error: null, requestId: state.download.requestId }
          };
        default:
          return state;
      }
    };
  },

  doToggleExporterField: fieldName => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_FIELD_TOGGLED', payload: fieldName }),

  doReorderExporterFields: fieldList => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_FIELDS_REORDERED', payload: fieldList }),

  doBulkSetExporterFields: (names, selected) => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_FIELDS_BULK_SET', payload: { names, selected } }),

  doSetExporterFormat: fmt => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_FORMAT_SET', payload: fmt }),

  doSetExporterCutoffs: cutoffs => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_CUTOFFS_SET', payload: cutoffs }),

  doClearExporterFields: () => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_FIELDS_CLEARED' }),

  doFetchExporterPreview: () => ({ dispatch, store }) => {
    clearTimeout(debounceTimer);
    const requestId = ++pendingRequestId;
    const signature = computePreviewSignature(store);
    dispatch({ type: 'EXPORTER_PREVIEW_STARTED', payload: { requestId, signature } });
    debounceTimer = setTimeout(() => {
      if (requestId !== pendingRequestId) return;

      const api = store.selectGrameneAPI();
      const q = store.selectGrameneFiltersQueryString();
      const g = store.selectGrameneGenomes();
      const m = store.selectGrameneMaps() || {};
      const taxa = Object.keys(g.active || {}).filter(tid => m[tid] && !m[tid].hidden);
      const fq = taxa.length ? `&fq=taxon_id:(${taxa.join(' OR ')})` : '';
      const url = `${api}/search?q=${q}&fl=*&rows=${PREVIEW_ROWS}${fq}`;

      fetch(url)
        .then(r => r.json())
        .then(json => {
          const docs = (json && json.response && json.response.docs) || [];
          dispatch({ type: 'EXPORTER_PREVIEW_SUCCEEDED', payload: { requestId, data: docs } });
        })
        .catch(err => {
          dispatch({ type: 'EXPORTER_PREVIEW_FAILED', payload: { requestId, error: String(err) } });
        });
    }, PREVIEW_DEBOUNCE_MS);
  },

  reactExporterPreview: createSelector(
    'selectExporter',
    'selectGrameneFiltersStatus',
    'selectGrameneFiltersQueryString',
    'selectGrameneGenomes',
    'selectGrameneMaps',
    (exp, filtersStatus, q, g, m) => {
      if (!exp || !exp.preview) return;
      if (filtersStatus === 'init') return;
      if (exp.preview.status === 'loading') return;
      const maps = m || {};
      const taxa = Object.keys((g && g.active) || {}).filter(tid => maps[tid] && !maps[tid].hidden);
      const sig = `${q}|${taxa.sort().join(',')}`;
      if (exp.preview.signature === sig && exp.preview.status !== 'stale') return;
      return { actionCreator: 'doFetchExporterPreview' };
    }
  ),

  doStartExporterDownload: () => ({ dispatch, store }) => {
    if (currentDownloadController) {
      currentDownloadController.abort();
    }
    const requestId = ++pendingDownloadId;
    const controller = new AbortController();
    currentDownloadController = controller;
    dispatch({ type: 'EXPORTER_DOWNLOAD_REQUESTED', payload: { requestId } });

    const isSuperseded = () => requestId !== pendingDownloadId;

    runExporterDownload({
      dispatch,
      store,
      requestId,
      signal: controller.signal,
      isSuperseded
    }).catch(err => {
      if (err && err.name === 'AbortError') {
        dispatch({ type: 'EXPORTER_DOWNLOAD_CANCELLED', payload: { requestId } });
      } else {
        dispatch({ type: 'EXPORTER_DOWNLOAD_FAILED', payload: { requestId, error: String(err) } });
      }
    });
  },

  doCancelExporterDownload: () => ({ dispatch }) => {
    if (currentDownloadController) {
      currentDownloadController.abort();
      currentDownloadController = null;
    }
    pendingDownloadId++;
  },

  doResetExporterDownload: () => ({ dispatch }) =>
    dispatch({ type: 'EXPORTER_DOWNLOAD_RESET' }),

  selectExporter: state => state.exporter,
  selectExporterSelectedFields: state => state.exporter.selectedFields,
  selectExporterFormat: state => state.exporter.format,
  selectExporterCutoffs: state => state.exporter.cutoffs,
  selectExporterPreview: state => state.exporter.preview,
  selectExporterDownload: state => state.exporter.download
};

export default exporter;
