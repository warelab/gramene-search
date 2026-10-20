// Host-defined tbrowse zone: a narrow, right-justified text column showing the
// number of matching genes per leaf (genome) — or, for a collapsed clade, the
// summed count over its subtree. Counts come from the taxon_id facet; the
// per-node sums are computed by tbrowse-core's `countsFromFacet` in the
// container and handed in via hostData.geneCounts = { [nodeId]: number }.

import React from 'react';
import { EditableZoneName, rowsWithFlags } from 'tbrowse';
import { rowsTotalHeight } from 'tbrowse-core';

const CountsHeader = ({ zoneState, setZoneState }) => (
  <div style={{ padding: '0 10px', height: '100%', display: 'flex', alignItems: 'center', fontSize: 13 }}>
    <EditableZoneName
      defaultName="Genes"
      customName={zoneState?.name}
      onChange={(next) => setZoneState((s) => ({ ...(s ?? {}), name: next }))}
    />
  </div>
);

const CountsBody = ({
  visibleRows, rowRange, width, data,
  hoveredNodeId, hoveredSubtreeIds, selectedNodeId, onHoverNode, onSelectNode,
}) => {
  const totalHeight = rowsTotalHeight(visibleRows);
  const counts = (data.hostData && data.hostData.geneCounts) || {};
  // Rows in the virtualised range with the shared hover/select background, so
  // hovering any zone lights up the same row across all of them.
  const rows = rowsWithFlags(visibleRows, rowRange, { hoveredNodeId, hoveredSubtreeIds, selectedNodeId });

  return (
    <div style={{ position: 'relative', width, height: totalHeight }}>
      {rows.map(({ row: r, background }) => {
        const n = counts[r.nodeId];
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
