import bootViewFromUrl from '../utils/bootView';

// Client for the saved-views API ({api}/saved_views — see gramene-swagger
// phase 3b). Mirrors the gene_lists pattern: Firebase Bearer ID token,
// hash-based addressing, public vs private scope.
//
// Action creators all return Promises so calling UI (modal, boot path,
// list view) can await them and surface success/error inline.
//
// Dev-mode mock: set `window.__SAVED_VIEWS_MOCK__ = true` in the console
// and saves/fetches go through localStorage instead of the network. Lets us
// drive Phase 4 (UI) without waiting on Phase 3b (server). Production
// builds never touch the mock unless the flag is set at runtime, so this
// is safe to ship.

const STORAGE_PREFIX = 'gramene_saved_view_mock_v1::';

const initialState = {
  saving: false,
  saveError: null,
  lastSavedHash: null,

  fetching: false,
  fetchError: null,
  lastFetched: null,        // { hash, snapshot, meta }

  privateList: null,        // null = not yet fetched
  publicList: null,
  listError: null
};

const savedViews = {
  name: 'savedViews',

  getReducer: () => (state = initialState, {type, payload}) => {
    switch (type) {
      case 'SAVED_VIEW_SAVE_STARTED':
        return {...state, saving: true, saveError: null};
      case 'SAVED_VIEW_SAVE_SUCCEEDED':
        return {...state, saving: false, lastSavedHash: payload.hash};
      case 'SAVED_VIEW_SAVE_FAILED':
        return {...state, saving: false, saveError: payload.error};

      case 'SAVED_VIEW_FETCH_STARTED':
        return {...state, fetching: true, fetchError: null};
      case 'SAVED_VIEW_FETCH_SUCCEEDED':
        return {...state, fetching: false, lastFetched: payload};
      case 'SAVED_VIEW_FETCH_FAILED':
        return {...state, fetching: false, fetchError: payload.error};

      case 'SAVED_VIEW_LIST_RECEIVED':
        return {
          ...state,
          [payload.kind === 'public' ? 'publicList' : 'privateList']: payload.rows,
          listError: null
        };
      case 'SAVED_VIEW_LIST_FAILED':
        return {...state, listError: payload.error};

      case 'SAVED_VIEW_RESET':
        return {...initialState};

      default:
        return state;
    }
  },

  selectSavedViews: state => state.savedViews,

  // POST a snapshot. Returns Promise<{hash, shareUrl}> on success.
  // `user` is a Firebase user object (must respond to .getIdToken()).
  doSaveView: ({user, label, description, isPublic}) => async ({dispatch, store}) => {
    dispatch({type: 'SAVED_VIEW_SAVE_STARTED'});
    try {
      const snapshot = store.selectViewSnapshot();
      const hash = await computeContentHash(snapshot);
      const site = (store.selectConfiguration && store.selectConfiguration().id) || '';
      const token = (user && user.getIdToken) ? await user.getIdToken() : null;
      if (!token) throw new Error('Not signed in');

      const meta = {
        hash, label, site, isPublic: !!isPublic,
        description: description || ''
      };

      if (useMock()) {
        mockSave({...meta, state: snapshot, uid: user.uid || 'mock', createdAt: new Date().toISOString()});
      } else {
        const api = store.selectGrameneAPI();
        const res = await fetch(`${api}/saved_views`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({...meta, state: snapshot})
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
      }

      const shareUrl = buildShareUrl(hash);
      dispatch({type: 'SAVED_VIEW_SAVE_SUCCEEDED', payload: {hash}});
      return {hash, shareUrl};
    } catch (err) {
      dispatch({type: 'SAVED_VIEW_SAVE_FAILED', payload: {error: err.message || String(err)}});
      throw err;
    }
  },

  // GET a snapshot by share hash. Anonymous-OK for public views; token is
  // optional and only sent if the caller provides a user.
  // Returns Promise<{snapshot, meta}>.
  doFetchView: ({hash, user}) => async ({dispatch, store}) => {
    dispatch({type: 'SAVED_VIEW_FETCH_STARTED'});
    try {
      let row;
      if (useMock()) {
        row = mockFetch(hash);
        if (!row) throw new Error(`No saved view with hash ${hash}`);
      } else {
        const api = store.selectGrameneAPI();
        const headers = {Accept: 'application/json'};
        if (user && user.getIdToken) {
          try { headers.Authorization = `Bearer ${await user.getIdToken()}`; }
          catch (_) { /* anonymous fallback */ }
        }
        const res = await fetch(`${api}/saved_views?hash=${encodeURIComponent(hash)}`, {headers});
        if (res.status === 401) throw new Error('Sign in to load this private view.');
        if (res.status === 404) throw new Error('Saved view not found (it may have been deleted).');
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        row = await res.json();
      }
      const out = {
        hash,
        snapshot: row.state,
        meta: {
          label: row.label,
          description: row.description || '',
          site: row.site,
          isPublic: !!row.isPublic,
          owner: row.owner || null,
          createdAt: row.createdAt || null
        }
      };
      dispatch({type: 'SAVED_VIEW_FETCH_SUCCEEDED', payload: out});
      return out;
    } catch (err) {
      dispatch({type: 'SAVED_VIEW_FETCH_FAILED', payload: {error: err.message || String(err)}});
      throw err;
    }
  },

  // List views for the current site. `scope` is 'public' (anonymous-OK)
  // or 'private' (requires `user`).
  doListSavedViews: ({scope, user}) => async ({dispatch, store}) => {
    try {
      const site = (store.selectConfiguration && store.selectConfiguration().id) || '';
      let rows;
      if (useMock()) {
        rows = mockList({site, scope, uid: user && user.uid});
      } else {
        const api = store.selectGrameneAPI();
        const headers = {Accept: 'application/json'};
        if (scope === 'private') {
          if (!user || !user.getIdToken) throw new Error('Not signed in');
          headers.Authorization = `Bearer ${await user.getIdToken()}`;
        }
        const url = `${api}/saved_views?site=${encodeURIComponent(site)}&isPublic=${scope === 'public'}`;
        const res = await fetch(url, {headers});
        if (!res.ok) throw new Error(`List failed (${res.status})`);
        rows = await res.json();
      }
      dispatch({type: 'SAVED_VIEW_LIST_RECEIVED', payload: {kind: scope, rows}});
      return rows;
    } catch (err) {
      dispatch({type: 'SAVED_VIEW_LIST_FAILED', payload: {error: err.message || String(err)}});
      throw err;
    }
  },

  // PATCH label / isPublic on a view I own. Mirrors updateList.
  doUpdateSavedView: ({viewId, user, label, isPublic}) => async ({store}) => {
    const updates = {};
    if (typeof label === 'string') updates.label = label;
    if (typeof isPublic === 'boolean') updates.isPublic = isPublic;
    if (!Object.keys(updates).length) return;

    if (useMock()) {
      mockUpdate(viewId, updates);
      return {viewId, updates};
    }
    const token = await user.getIdToken();
    const api = store.selectGrameneAPI();
    const res = await fetch(`${api}/saved_views?viewId=${encodeURIComponent(viewId)}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(`Update failed (${res.status})`);
    return res.json();
  },

  // DELETE one of my saved views. Mirrors deleteList.
  doDeleteSavedView: ({viewId, user}) => async ({store}) => {
    if (useMock()) {
      mockDelete(viewId);
      return {viewId};
    }
    const token = await user.getIdToken();
    const api = store.selectGrameneAPI();
    const res = await fetch(`${api}/saved_views?viewId=${encodeURIComponent(viewId)}`, {
      method: 'DELETE',
      headers: {Authorization: `Bearer ${token}`}
    });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    return res.json();
  },

  doResetSavedViewState: () => ({dispatch}) => dispatch({type: 'SAVED_VIEW_RESET'}),

  // Connect-friendly wrapper around bootViewFromUrl. Auth.js calls this on
  // each auth-state emission, passing the current Firebase user (or null);
  // bootView.js no-ops when ?view= isn't in the URL, so this is cheap to
  // call repeatedly.
  doBootSharedView: ({user} = {}) => ({store}) => {
    return bootViewFromUrl(store, {user});
  }
};

// ── helpers ─────────────────────────────────────────────────────────────

// Test/dev: either set the runtime-only flag (`window.__SAVED_VIEWS_MOCK__ = true`,
// cleared on reload), or persist via localStorage (`localStorage.setItem(
// '__SAVED_VIEWS_MOCK__', 'true')`, survives reloads — needed for the
// share-link round-trip which navigates).
function useMock() {
  if (typeof window === 'undefined') return false;
  if (window.__SAVED_VIEWS_MOCK__) return true;
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('__SAVED_VIEWS_MOCK__') === 'true'; }
  catch (_) { return false; }
}

function buildShareUrl(hash) {
  if (typeof window === 'undefined') return `?view=${hash}`;
  const u = new URL(window.location.href);
  u.search = '';
  u.searchParams.set('view', hash);
  return u.toString();
}

// Content-addressable, ~72-bit short hash. The snapshot's `capturedAt` is
// excluded from the hash input so two saves of the same view by the same
// user produce the same hash (and the server's $setOnInsert preserves the
// original createdAt).
async function computeContentHash(snapshot) {
  const forHash = {...snapshot, capturedAt: undefined};
  const text = canonicalize(forHash);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let b64 = '';
    for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
    return btoa(b64)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
      .slice(0, 12);
  }
  // Last-resort fallback for environments without WebCrypto.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return ('h' + (h >>> 0).toString(36)).slice(0, 12);
}

// Stable stringify: sort object keys recursively so semantically-equivalent
// snapshots hash identically.
function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}

// ── mock backend (localStorage) ─────────────────────────────────────────

function mockSave(row) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + row.hash, JSON.stringify({...row, _id: row.hash + ' ' + row.uid}));
}
function mockFetch(hash) {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_PREFIX + hash);
  return raw ? JSON.parse(raw) : null;
}
function mockList({site, scope, uid}) {
  if (typeof localStorage === 'undefined') return [];
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    const row = JSON.parse(localStorage.getItem(k));
    if (row.site !== site) continue;
    if (scope === 'public' && !row.isPublic) continue;
    if (scope === 'private' && (row.isPublic || row.uid !== uid)) continue;
    out.push(row);
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
function mockUpdate(viewId, updates) {
  if (typeof localStorage === 'undefined') return;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    const row = JSON.parse(localStorage.getItem(k));
    if (row._id === viewId) {
      localStorage.setItem(k, JSON.stringify({...row, ...updates}));
      return;
    }
  }
}
function mockDelete(viewId) {
  if (typeof localStorage === 'undefined') return;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    const row = JSON.parse(localStorage.getItem(k));
    if (row._id === viewId) {
      localStorage.removeItem(k);
      return;
    }
  }
}

export default savedViews;
