// Host-defined tbrowse zone: a narrow, right-justified text column showing the
// number of matching genes per leaf (genome) — or, for a collapsed clade, the
// summed count over its subtree. Counts come from the taxon_id facet; the
// per-node sums are precomputed by computeGeneCounts and handed in via
// hostData.geneCounts = { [nodeId]: number }.

import React from 'react';
import { EditableZoneName } from 'tbrowse';

/**
 * Sum the taxon_id facet counts up the tree so every node (not just leaves)
 * has a total. Leaf counts come straight from the facet; internal nodes get
 * the sum over their descendant leaves — which is what a collapsed-summary row
 * should display.
 *
 * @param {{rootId:string, nodes:object}} tree  - adapter tree
 * @param {Array} taxonIdFacet - Solr facet array [id, count, id, count, ...]
 * @returns {Object} countByNode keyed by nodeId
 */
export function computeGeneCounts(tree, taxonIdFacet) {
  if (!tree || !tree.nodes) return {};
  const leafCount = {};
  if (Array.isArray(taxonIdFacet)) {
    for (let i = 0; i < taxonIdFacet.length; i += 2) {
      leafCount[String(taxonIdFacet[i])] = +taxonIdFacet[i + 1];
    }
  }
  const childrenOf = {};
  for (const id of Object.keys(tree.nodes)) {
    const p = tree.nodes[id].parentId;
    if (p !== null && p !== undefined) (childrenOf[p] = childrenOf[p] || []).push(id);
  }
  const out = {};
  const visit = (id) => {
    const node = tree.nodes[id];
    if (!node) return 0;
    if (node.isLeaf) {
      const c = leafCount[id] || 0;
      out[id] = c;
      return c;
    }
    let sum = 0;
    for (const k of (childrenOf[id] || [])) sum += visit(k);
    out[id] = sum;
    return sum;
  };
  visit(tree.rootId);
  return out;
}

const CountsHeader = ({ zoneState, setZoneState }) => (
  <div style={{ padding: '0 10px', height: '100%', display: 'flex', alignItems: 'center', fontSize: 13 }}>
    <EditableZoneName
      defaultName="Genes"
      customName={zoneState?.name}
      onChange={(next) => setZoneState((s) => ({ ...(s ?? {}), name: next }))}
    />
  </div>
);

// Shared row-highlight background, matching the labels zone so hovering any
// zone lights up the same row across all of them (state flows through the
// tbrowse store's hoveredNodeId).
function rowHighlight(isSelected, isExactHover, isInHoveredSubtree) {
  if (isSelected) return 'var(--tbrowse-row-select-bg)';
  if (isExactHover) return 'var(--tbrowse-row-hover-bg)';
  if (isInHoveredSubtree) return 'var(--tbrowse-row-subtree-bg)';
  return 'transparent';
}

const CountsBody = ({
  visibleRows, rowRange, width, data,
  hoveredNodeId, hoveredSubtreeIds, selectedNodeId, onHoverNode, onSelectNode,
}) => {
  const totalHeight = visibleRows.length
    ? visibleRows[visibleRows.length - 1].y + visibleRows[visibleRows.length - 1].height
    : 0;
  const counts = (data.hostData && data.hostData.geneCounts) || {};
  const rows = visibleRows.slice(rowRange.startIndex, rowRange.endIndex);

  return (
    <div style={{ position: 'relative', width, height: totalHeight }}>
      {rows.map((r) => {
        const n = counts[r.nodeId];
        const background = rowHighlight(
          selectedNodeId === r.nodeId,
          hoveredNodeId === r.nodeId,
          !!(hoveredSubtreeIds && hoveredSubtreeIds.has(r.nodeId)),
        );
        return (
          <div
            key={r.nodeId}
            onMouseEnter={() => onHoverNode(r.nodeId)}
            onMouseLeave={() => onHoverNode(null)}
            onClick={() => onSelectNode(r.nodeId)}
            style={{
              position: 'absolute',
              top: r.y,
              height: r.height,
              left: 0,
              right: 0,
              paddingRight: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              boxSizing: 'border-box',
              fontSize: 'var(--tbrowse-font-size, 12px)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--tbrowse-text)',
              background,
              cursor: 'pointer',
              opacity: r.opacity ?? 1,
            }}
          >
            {typeof n === 'number' ? n.toLocaleString() : ''}
          </div>
        );
      })}
    </div>
  );
};

export const countsZone = {
  id: 'counts',
  displayName: 'Genes',
  Header: CountsHeader,
  Body: CountsBody,
  defaultWidth: 12,
  minWidth: 64,
  defaultZoneState: {},
  isAvailable: (data) => Boolean(data.hostData && data.hostData.geneCounts),
  defaultVisible: true,
};
