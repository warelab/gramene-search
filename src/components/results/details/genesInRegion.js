/**
 * Gene models for the primer designer's variant browser.
 *
 * `/primers` has no genes-in-region endpoint — it can only fetch a gene by id —
 * so the designer takes this from its host. Ensembl REST's `overlap/region`
 * returns genes, transcripts, exons and CDS for a window in one request, all in
 * genomic coordinates, which is exactly what the browser draws.
 *
 * Read from `config.ensemblRest`, which must be the same Ensembl release the
 * primers API reads variants from (release 115 for sorghum_v11). A different
 * release would draw gene models that do not line up with the variants beside
 * them.
 */

/**
 * Beyond this the response runs to thousands of features and the models would
 * be too small to read, so the track is simply left empty.
 */
const MAX_SPAN = 1_000_000

export function makeGenesInRegion(ensemblRest) {
  if (!ensemblRest) return undefined
  return async ({ system_name, region, start, end }, options) => {
    if (!system_name || !region || end - start + 1 > MAX_SPAN) return []
    const signal = options && options.signal
    const url =
      `${ensemblRest}/overlap/region/${encodeURIComponent(system_name)}/${encodeURIComponent(region)}:${start}-${end}` +
      `?feature=gene;feature=transcript;feature=exon;feature=cds;content-type=application/json`

    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const features = await res.json()
    if (!Array.isArray(features)) return []

    const of = type => features.filter(f => f && f.feature_type === type)
    const transcripts = of('transcript')
    const exons = of('exon')
    const cds = of('cds')

    return of('gene').map(gene => {
      // One transcript per gene: the canonical one when Ensembl marks it.
      const mine = transcripts.filter(t => t.Parent === gene.id)
      const transcript = mine.find(t => t.is_canonical) || mine[0]
      const myExons = transcript ? exons.filter(e => e.Parent === transcript.id) : []
      const myCds = transcript ? cds.filter(c => c.Parent === transcript.id) : []
      return {
        id: gene.id,
        label: gene.external_name || gene.id,
        start: gene.start,
        end: gene.end,
        strand: gene.strand === -1 ? -1 : 1,
        // Ensembl returns only the exons overlapping the window, which is all
        // the browser can show anyway.
        exons: myExons.map(e => ({ start: e.start, end: e.end })),
        cds: myCds.length
          ? { start: Math.min(...myCds.map(c => c.start)), end: Math.max(...myCds.map(c => c.end)) }
          : null,
        biotype: gene.biotype
      }
    })
  }
}
