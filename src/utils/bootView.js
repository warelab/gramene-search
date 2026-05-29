// Boot-time hydration of a shared view link.
//
// Entry points call `bootViewFromUrl(store)` once the store is created.
// Public views resolve anonymously. For private views, the initial call
// will 401; the Auth panel then re-invokes with `{user}` once Firebase has
// emitted its first signed-in state, and the fetch retries with a Bearer
// token. On success we apply the snapshot and strip `?view=` from the URL
// so subsequent user actions don't sit under a stale shared-state URL.
//
// All errors are non-fatal — they surface in state.savedViews.fetchError
// for any UI that wants to show them.

const PARAM = 'view';

export default function bootViewFromUrl(store, opts = {}) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const url = new URL(window.location.href);
  const hash = url.searchParams.get(PARAM);
  if (!hash) return Promise.resolve(null);

  const { user = null } = opts;

  return store.doFetchView({ hash, user })
    .then(({ snapshot }) => {
      store.doApplyViewSnapshot(snapshot);
      url.searchParams.delete(PARAM);
      window.history.replaceState({}, '', url.toString());
      return { hash, applied: true };
    })
    .catch((err) => {
      // 401 here on the anonymous pass is expected for private views — the
      // Auth panel will retry once it has a user. Other errors (404, 5xx,
      // network) are reported and leave the param so a manual refresh can
      // retry too.
      console.warn('bootViewFromUrl:', err.message || err);
      return { hash, applied: false, error: err.message || String(err) };
    });
}
