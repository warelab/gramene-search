/**
 * Reference sequence for the primer designer's CAPS annotation.
 *
 * A variant listing from `/primers` carries coordinates and alleles but no
 * bases, and restriction sites cannot be found without them, so the designer
 * takes sequence from its host. Ensembl REST's `sequence/region` returns the
 * plus strand of a window as `{molecule, seq, id, query}`.
 *
 * Read from `config.ensemblRest`, which must be the same Ensembl release the
 * primers API reads variants from (release 115 for sorghum_v11). This matters
 * more here than it does for the gene track: a gene model from the wrong
 * release is visibly out of place, whereas sequence from the wrong release
 * produces a confident and wrong enzyme call. The designer checks every window
 * against the reference alleles the API reports and shows nothing if they
 * disagree, but the right release is still the actual fix.
 */

/**
 * Beyond this the annotation is not worth the transfer; the variant listing is
 * already capped well below it, so this only guards against a stray query.
 */
const MAX_SPAN = 200_000

export function makeSequenceForRegion(ensemblRest) {
  if (!ensemblRest) return undefined
  return async ({ system_name, region, start, end }, options) => {
    if (!system_name || !region || start < 1 || end < start || end - start + 1 > MAX_SPAN) return null
    const signal = options && options.signal
    const url =
      `${ensemblRest}/sequence/region/${encodeURIComponent(system_name)}/${encodeURIComponent(region)}:${start}-${end}` +
      `?content-type=application/json`

    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    // A short or absent read would be indexed with genomic offsets and give
    // wrong answers quietly; the designer discards it, and so does this.
    return body && typeof body.seq === 'string' ? body.seq.toUpperCase() : null
  }
}
