// Adapter: gramene taxonomy-with-genomes tree  →  tbrowse `Tree` + `Taxonomy`.
//
// `grameneTaxDist` (from the grameneTaxDist bundle's selectGrameneTaxDist) is
// the root node of a gramene-taxonomy-with-genomes (tree-model) tree. The
// conversion itself — node ids = String(NCBI taxon id), uniform branch lengths
// (the tree zone runs in 'cladogram' mode for this view), `model.name` exposed
// as both scientific and common name, duplicate-id guard — is
// tbrowse-core's `fromTreeModel`, which was lifted from this file.

import { fromTreeModel } from 'tbrowse-core';

/**
 * @param {object} taxDist - root node of the gramene taxDist tree
 *   (the object returned by selectGrameneTaxDist).
 * @returns {{ tree: {rootId: string, nodes: object}, taxonomy: object,
 *             leafTaxonIds: string[], warnings: string[] } | null}
 */
export function toTbrowseTree(taxDist) {
  if (!taxDist || !taxDist.model) return null;
  return fromTreeModel(taxDist, { taxonomyIdAs: 'string' });
}
