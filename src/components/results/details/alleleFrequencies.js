/**
 * Allele frequencies for the primer designer's variant picker.
 *
 * A variant listing from `/primers` says which alleles exist but not how common
 * they are, and how common an allele is decides whether a variant is worth
 * genotyping at all: a marker near fixation in the panel you mean to screen
 * tells you nothing. Ensembl REST's `variation` endpoint carries the figures,
 * and its POST form answers about many ids in one request — ids beyond a couple
 * of hundred are the difference between one call and hundreds.
 *
 * Read from `config.ensemblRest`, which must be the same Ensembl release the
 * primers API reads variants from (release 115 for sorghum_v11), for the same
 * reason the gene track and the sequence must: a frequency read against another
 * release could be attached to the wrong variant entirely.
 *
 * Two things about the upstream shape are dealt with here. The tally is spelled
 * `allele_count`, which is mapped to `count` so a host with some other
 * frequency source is not made to speak Ensembl; and rows arrive repeated, the
 * same population and allele several times over, which the designer collapses.
 */

/** Ids per request. The designer sends batches; this is a guard, not the policy. */
const MAX_IDS = 500

export function makeAlleleFrequencies(ensemblRest) {
  if (!ensemblRest) return undefined
  return async ({ system_name, ids }, options) => {
    if (!system_name || !Array.isArray(ids) || !ids.length) return {}
    const signal = options && options.signal
    const wanted = ids.filter(id => typeof id === 'string' && id).slice(0, MAX_IDS)
    if (!wanted.length) return {}

    const res = await fetch(
      `${ensemblRest}/variation/${encodeURIComponent(system_name)}?pops=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: wanted }),
        signal
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body || typeof body !== 'object') return {}

    const out = {}
    for (const id of wanted) {
      const rows = body[id] && body[id].populations
      if (!Array.isArray(rows)) continue
      out[id] = rows
        .filter(r => r && typeof r.population === 'string' && typeof r.allele === 'string' && Number.isFinite(Number(r.frequency)))
        .map(r => ({
          population: r.population,
          allele: r.allele,
          frequency: Number(r.frequency),
          // Absent is not nought: a missing tally must stay unknown.
          count: r.allele_count === undefined || r.allele_count === null ? null : Number(r.allele_count)
        }))
    }
    return out
  }
}
