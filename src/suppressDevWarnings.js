// Suppress known-benign console warnings from old deps that React 18 and
// Redux yell about. These are non-fatal but parcel's dev overlay
// (@parcel/error-overlay) treats every console.error as a runtime error
// and paints them as a fullscreen overlay, burying the app.
//
// Imported first in src/demo.js so the patch is in place before redux
// or React renders the tree.
if (typeof console !== 'undefined' && typeof console.error === 'function') {
  const origError = console.error;
  const patterns = [
    'currently using minified code outside of NODE_ENV',
    'uses the legacy childContextTypes API',
    'uses the legacy contextTypes API',
    'findDOMNode is deprecated',
    // Third-party libs (gramene-search-vis, gramene-mdview, Pathways, etc.)
    // still use the pre-16.3 lifecycle methods. We can't fix them from here.
    'componentWillReceiveProps has been renamed',
    'componentWillMount has been renamed',
    'componentWillUpdate has been renamed',
    // Kept as a guard — react warns on any kebab-case inline-style property
    // and Parcel's overlay turns that into a fatal runtime error. The known
    // offender (BAR's max-width) was fixed when the component was absorbed
    // from gramene-efp-browser, but the suppressor protects against any
    // future regression in third-party libs.
    'Unsupported style property',
    // Stale-state setState after unmount in legacy class components.
    "Can't perform a React state update on an unmounted component",
  ];
  console.error = function (...args) {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    for (let i = 0; i < patterns.length; i++) {
      if (msg.indexOf(patterns[i]) !== -1) return;
    }
    return origError.apply(this, args);
  };
}
