// Adapter: gramene taxonomy-with-genomes tree  →  tbrowse `Tree` + `Taxonomy`.
//
// `grameneTaxDist` (from the grameneTaxDist bundle's selectGrameneTaxDist) is
// the root node of a gramene-taxonomy-with-genomes tree. Each node exposes
// `node.model` ({ id, name, genome?, rank?, results? }) and `node.children`.
// Genome leaves carry `model.genome`; internal clade nodes have children.
//
// tbrowse wants a flat `Tree { rootId, nodes: { [id]: TreeNode } }` plus a
// `Taxonomy { [taxonomyId]: { scientificName, commonName, rank } }` that its
// labels zone reads to render each leaf's species name. We key tbrowse
// NodeIds off the (unique) NCBI taxon id and set `taxonomyId` to the same id.
//
// Branch lengths are uniform (taxonomy carries none); the tree zone is driven
// in 'cladogram' mode for this view, which ignores `distance` and aligns the
// genome rows at the right edge regardless.

/**
 * @param {object} taxDist - root node of the gramene taxDist tree
 *   (the object returned by selectGrameneTaxDist).
 * @returns {{ tree: {rootId: string, nodes: object}, taxonomy: object,
 *             leafTaxonIds: string[] } | null}
 */
export function toTbrowseTree(taxDist) {
  if (!taxDist || !taxDist.model) return null;

  const nodes = {};
  const taxonomy = {};
  const leafTaxonIds = [];
  const rootId = String(taxDist.model.id);

  const walk = (node, parentId) => {
    if (!node || !node.model) return;
    const id = String(node.model.id);
    // Guard against the (shouldn't-happen) cyclic / duplicate id case so a
    // malformed taxonomy can't spin the recursion.
    if (nodes[id]) return;
    const kids = node.children || [];
    const isLeaf = kids.length === 0;

    nodes[id] = {
      id,
      parentId,
      distance: parentId === null ? 0 : 1,
      isLeaf,
      taxonomyId: id,
    };

    // `model.name` is the NCBI scientific name for clades and is overwritten
    // with the genome's display_name for genome leaves upstream in
    // selectGrameneTaxDist. Expose it as both names so the labels zone shows
    // something whichever field the user has active.
    const name = node.model.name;
    taxonomy[id] = {
      scientificName: name,
      commonName: name,
      rank: node.model.rank,
    };

    if (isLeaf) leafTaxonIds.push(id);
    for (const k of kids) walk(k, id);
  };

  walk(taxDist, null);

  return { tree: { rootId, nodes }, taxonomy, leafTaxonIds };
}
