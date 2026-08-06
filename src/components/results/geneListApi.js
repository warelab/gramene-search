// Client for the gene-lists API ({api}/gene_lists*).
//
// Mirrors the shape of bundles/savedViews.js: Firebase Bearer token, one
// status -> message mapper so every call site reports failures the same way, and
// JSON request bodies. Deliberately a plain module rather than a redux bundle —
// the feature is self-contained in UserGeneLists and shares no state.

// Server-side limits, mirrored so we can say something useful instead of
// surfacing a bare 400.
export const MAX_GENE_IDS = 6000;
export const MAX_ID_LENGTH = 255;

// Candidate hydration passes ids through the URL. ~500 ids is a 414 (the URL
// crosses ~8.5KB), so batch well under that.
const HYDRATE_BATCH = 150;

export function apiError(action, status) {
  if (status === 401) return new Error(`${action} failed — please sign in again.`);
  if (status === 404) return new Error(`${action} failed — that list no longer exists.`);
  if (status === 405) return new Error('Gene lists are not available on this server yet.');
  if (status === 502 || status === 503) {
    return new Error(`${action} failed — the gene index is unreachable. Try again shortly.`);
  }
  return new Error(`${action} failed (${status})`);
}

// The API returns {message} on most 4xx; prefer it, since it names the offending
// field (e.g. which limit was exceeded).
async function readError(res, action) {
  try {
    const body = await res.json();
    if (body && body.message) return new Error(body.message);
  } catch (e) {
    // not JSON — fall through to the status mapper
  }
  return apiError(action, res.status);
}

/**
 * Resolve identifiers against the genes core. Read-only on the server — no hash,
 * no writes — so this is safe to call as often as the user asks.
 *
 * Returns the three buckets. Every input lands in exactly one of them.
 */
export async function validateIds(api, ids) {
  const res = await fetch(`${api}/gene_lists/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids)
  });
  if (!res.ok) throw await readError(res, 'Validation');
  const body = await res.json();
  // Be strict about the contract. A server still returning the old
  // {ids, missing, hash} shape must fail here and say so, rather than quietly
  // validating nothing — which is exactly how the previous client broke.
  if (!body || !Array.isArray(body.resolved)) {
    throw new Error('Unexpected response from the validation service (is the server up to date?).');
  }
  return {
    resolved: body.resolved || [],
    ambiguous: body.ambiguous || [],
    unknown: body.unknown || []
  };
}

/**
 * Fetch name / species / description for candidate ids, so a user choosing
 * between them has something to choose *on*. Best-effort: a failed batch leaves
 * those candidates rendered as bare ids rather than blocking the flow.
 */
export async function hydrateGenes(api, ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = {};
  for (let i = 0; i < unique.length; i += HYDRATE_BATCH) {
    const batch = unique.slice(i, i + HYDRATE_BATCH);
    // {!terms} takes its values literally, so no id needs escaping, and it sits in
    // `fq`, where Solr local params are reliable.
    const fq = encodeURIComponent(`{!terms f=id}${batch.join(',')}`);
    // `rows` is mandatory. Without it the endpoint answers with its default of 20
    // and the rest of the batch silently disappears.
    const url = `${api}/search?q=*:*&fq=${fq}&rows=${batch.length}` +
                `&fl=id,name,system_name,description`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = await res.json();
      const docs = (body && body.response && body.response.docs) || [];
      docs.forEach(d => { if (d && d.id) out[d.id] = d; });
    } catch (e) {
      // leave this batch un-hydrated
    }
  }
  return out;
}

/**
 * Save a list. The server derives both `hash` and `n_genes` from the posted ids —
 * sending either is a 400, so don't.
 */
export async function saveGeneList(api, token, { label, site, isPublic, ids }) {
  const res = await fetch(`${api}/gene_lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ label, site, isPublic: !!isPublic, ids })
  });
  if (!res.ok) throw await readError(res, 'Save');
  return res.json();
}
