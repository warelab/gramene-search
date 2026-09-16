import React, { useCallback, useMemo } from 'react'
import { connect } from 'redux-bundler-react'
import { PrimerDesigner } from 'gramene-primers'
import { makeGenesInRegion } from './genesInRegion'

// Primers detail: PCR/qPCR primer design, genome specificity and pan-genome
// coverage checks (gramene-primers <PrimerDesigner>, backed by the
// gramene-swagger /primers endpoints).
//
// Enabled per site by config.details.primers:
//   true                    use the site's grameneData API
//   { apiBase, pangenome }  apiBase: a swagger that serves /primers;
//                           pangenome: false hides the pan-genome check
//
// The designer's serializable state ({v: 1, ...}) lives in the uiViewState
// bundle keyed by geneId (controlled mode), so a saved view restores the
// inputs, re-runs the design and re-attaches to a submitted check (an expired
// job shows "Re-run check"). The store keeps a pasted sequence, so switching
// detail tabs (which unmounts this component) does not lose it; viewSnapshot
// leaves it out of saved views. Styles are injected at runtime by the
// component; no CSS import is needed.

const MODES = ['gene', 'transcript', 'region', 'sequence', 'genotyping']

const geneHref = id => `?idList=${encodeURIComponent(id)}`
// Plain left clicks on gene links in check results open a new tab, so the
// design and a running check's job id survive; modified clicks use geneHref.
const openGene = id => window.open(geneHref(id), '_blank', 'noopener')

const Primers = props => {
  const geneId = props.searchResult.id
  const gene = props.geneDocs[geneId] // Gene.ensureGene() guarantees it is loaded
  const conf = props.config.details.primers // true | { apiBase?, pangenome?, genotyping? }
  const apiBase =
    (conf && typeof conf === 'object' && conf.apiBase) || props.grameneAPI
  // Gene models for the variant browser come from Ensembl REST, which must be
  // the same release the primers API reads variants from.
  const ensemblRest = props.config && props.config.ensemblRest
  const genesInRegion = useMemo(() => makeGenesInRegion(ensemblRest), [ensemblRest])
  const byGene =
    props.uiViewState &&
    props.uiViewState.byGene &&
    props.uiViewState.byGene[geneId]
  const saved = byGene && byGene.primers
  const { doSetPrimersState } = props
  const onStateChange = useCallback(
    state => doSetPrimersState({ geneId, state }),
    [geneId, doSetPrimersState]
  )
  if (!conf) {
    // e.g. a saved view opened on a site that does not enable the tab
    return <p>Primer design is not enabled on this site.</p>
  }
  if (!gene) return null
  return (
    <PrimerDesigner
      key={geneId}
      apiBase={apiBase}
      gene={gene}
      systemName={gene.system_name}
      modes={MODES}
      genesInRegion={genesInRegion}
      defaultMode="gene"
      // an empty slice (never visited, or a snapshot without primers) leaves
      // the designer uncontrolled until its first change is stored
      state={saved && Object.keys(saved).length ? saved : undefined}
      onStateChange={onStateChange}
      features={{
        pangenome: !(conf && conf.pangenome === false),
        genotyping: !(conf && conf.genotyping === false)
      }}
      geneHref={geneHref}
      onGeneClick={openGene}
      geneLabel={gene.name || gene._id}
      theme="light"
    />
  )
}

export default connect(
  'selectGrameneAPI',
  'selectUiViewState',
  'doSetPrimersState',
  Primers
)
