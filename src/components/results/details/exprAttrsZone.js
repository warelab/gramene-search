// Host-defined tbrowse zone for the Homology gene tree, redesigned to compare
// expression across a gene family. Three parts, aligned to the tree leaves:
//   1. a gene × organ heatmap of ordinal expression levels (expr_organ_level),
//      with markers on each gene's tissue-specific / -enhanced organs;
//   2. a Max TPM column (expr_max_tpm), log-scaled magnitude;
//   3. a Stress column of ↑activated / ↓repressed condition chips
//      (expr_activated_by / expr_repressed_by).
// Data is threaded in via hostData.exprAttrs (built by buildExprData from the
// tree-scoped /search response), mirroring how the neighborhood / genome zones
// receive their async data. Color/legend conventions follow exprViz/HeatmapPlot.

import React from 'react';
import { EditableZoneName } from 'tbrowse';
import {
  abbrOrgan as abbr, organLabel,
  LEVEL_ORDER, LEVEL_COLOR, LEVEL_LABEL,
  STRESS, MARKER,
  extractExprAttrs, orderOrgans, tpmFraction, fmtTpm, fmtClass,
} from '../../exprAttrs/exprAttrCommon';

const ORGAN_CELL_W = 16;
const MAXTPM_W = 46;
const STRESS_MIN = 120;

/**
 * Shape the tree-scoped /search docs into the zone's hostData payload. Parses
 * `organ:level` tokens, keys everything by leaf nodeId (via the tree, as the
 * counts zone did), orders the organ union by ORGAN_ORDER, and records the
 * max_tpm range for log scaling.
 *
 * @param {Array<object>} docs - search docs (fl=id,expr_*__attr_*)
 * @param {{nodes:object}} tree - adapted tbrowse tree
 */
export function buildExprData(docs, tree) {
  const nodeOf = {};
  const nodeGene = {}; // leaf nodeId -> gene id, for every leaf (hover readout)
  if (tree && tree.nodes) {
    Object.values(tree.nodes).forEach((n) => {
      if (n.isLeaf && n.geneId) { nodeOf[n.geneId] = n.id; nodeGene[n.id] = n.geneId; }
    });
  }
  const organSet = new Set();
  const byNode = {};
  let tpmMin = Infinity;
  let tpmMax = -Infinity;
  (docs || []).forEach((d) => {
    if (!d || !d.id) return;
    const nodeId = nodeOf[d.id];
    if (!nodeId) return;
    const attrs = extractExprAttrs(d);
    Object.keys(attrs.organLevels).forEach((o) => organSet.add(o));
    if (attrs.maxTpm !== null) {
      if (attrs.maxTpm < tpmMin) tpmMin = attrs.maxTpm;
      if (attrs.maxTpm > tpmMax) tpmMax = attrs.maxTpm;
    }
    byNode[nodeId] = attrs;
  });
  return {
    organs: orderOrgans(organSet),
    byNode,
    nodeGene,
    maxTpm: { min: tpmMin === Infinity ? 0 : tpmMin, max: tpmMax === -Infinity ? 0 : tpmMax },
  };
}

// Shared row-highlight background, matching the other zones so hovering any zone
// lights up the same row across all of them.
function rowHighlight(isSelected, isExactHover, isInHoveredSubtree) {
  if (isSelected) return 'var(--tbrowse-row-select-bg)';
  if (isExactHover) return 'var(--tbrowse-row-hover-bg)';
  if (isInHoveredSubtree) return 'var(--tbrowse-row-subtree-bg)';
  return 'transparent';
}

const gridBorder = '1px solid var(--tbrowse-grid-line, rgba(0,0,0,0.06))';
const stressWidth = (width, organCount) =>
  Math.max(STRESS_MIN, width - organCount * ORGAN_CELL_W - MAXTPM_W);

const ExprHeader = ({ zoneState, setZoneState, width, data, hoveredNodeId }) => {
  const ea = (data.hostData && data.hostData.exprAttrs) || {};
  const organs = ea.organs || [];
  const gid = hoveredNodeId && ea.nodeGene && ea.nodeGene[hoveredNodeId];
  const gene = hoveredNodeId && ea.byNode && ea.byNode[hoveredNodeId];
  const clsText = gene && fmtClass(gene.cls);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontSize: 12 }}>
        <EditableZoneName
          defaultName="Expression"
          customName={zoneState?.name}
          onChange={(next) => setZoneState((s) => ({ ...(s ?? {}), name: next }))}
        />
        {/* ordinal level legend: pale → dark = low → high */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 9, opacity: 0.85 }} title="expression level">
          {LEVEL_ORDER.map((lv) => (
            <span key={lv} title={LEVEL_LABEL[lv]} style={{ width: 10, height: 10, background: LEVEL_COLOR[lv], border: gridBorder, display: 'inline-block' }} />
          ))}
        </span>
      </div>
      {/* Hover readout, left-justified on its own line like the built-in zones'
          header status line: the hovered leaf's gene id + expression class. */}
      <div
        title={gid ? (clsText ? `${gid} · ${clsText}` : gid) : 'hover a node to see its gene and expression class'}
        style={{ padding: '0 4px 2px', fontSize: 11, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
      >
        {gid
          ? (<><b>{gid}</b>{clsText ? <span style={{ opacity: 0.7 }}>{` · ${clsText}`}</span> : null}</>)
          : (<span style={{ opacity: 0.5 }}>hover a node…</span>)}
      </div>
      <div style={{ display: 'flex', width }}>
        {organs.map((o) => (
          <div key={o} title={organLabel(o)} style={{ width: ORGAN_CELL_W, fontSize: 8, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', borderRight: gridBorder, opacity: 0.8 }}>
            {abbr(o)}
          </div>
        ))}
        <div style={{ width: MAXTPM_W, fontSize: 9, fontWeight: 600, textAlign: 'right', paddingRight: 4, opacity: 0.8 }}>TPM</div>
        <div style={{ width: stressWidth(width, organs.length), fontSize: 9, fontWeight: 600, paddingLeft: 4, opacity: 0.8 }}>Stress</div>
      </div>
    </div>
  );
};

const OrganCell = ({ organ, gene }) => {
  const level = gene && gene.organLevels[organ];
  const specific = !!(gene && gene.specificTo.has(organ));
  const enhanced = !!(gene && gene.enhancedIn.has(organ));
  const title = level
    ? `${organLabel(organ)}: ${LEVEL_LABEL[level] || level}${specific ? ' · specific' : enhanced ? ' · enhanced' : ''}`
    : `${organLabel(organ)}: not assayed`;
  const style = {
    position: 'relative',
    width: ORGAN_CELL_W,
    height: '100%',
    boxSizing: 'border-box',
    background: level ? (LEVEL_COLOR[level] || 'transparent') : 'transparent',
    borderRight: gridBorder,
  };
  // enhanced-in: thin outline; specific-to (stronger): corner dot.
  if (enhanced && !specific) style.boxShadow = `inset 0 0 0 1px ${MARKER}`;
  return (
    <div title={title} style={style}>
      {specific && (
        <span style={{ position: 'absolute', top: 1, right: 1, width: 4, height: 4, borderRadius: '50%', background: MARKER }} />
      )}
    </div>
  );
};

const StressCell = ({ gene, width }) => {
  const up = (gene && gene.activatedBy) || [];
  const down = (gene && gene.repressedBy) || [];
  const title = [up.length ? `↑ ${up.join(', ')}` : '', down.length ? `↓ ${down.join(', ')}` : '']
    .filter(Boolean).join('   ');
  const chip = (c, dir, key) => (
    <span key={key} style={{ fontSize: 9, lineHeight: '14px', padding: '0 3px', borderRadius: 2, whiteSpace: 'nowrap', background: STRESS[dir].bg, color: STRESS[dir].fg }}>
      {(dir === 'up' ? '↑' : '↓') + c}
    </span>
  );
  return (
    <div title={title} style={{ width, display: 'flex', flexWrap: 'nowrap', gap: 2, overflow: 'hidden', alignItems: 'center', paddingLeft: 4, boxSizing: 'border-box' }}>
      {up.map((c, i) => chip(c, 'up', `u${i}`))}
      {down.map((c, i) => chip(c, 'down', `d${i}`))}
    </div>
  );
};

const ExprBody = ({
  visibleRows, rowRange, width, data,
  hoveredNodeId, hoveredSubtreeIds, selectedNodeId, onHoverNode, onSelectNode,
}) => {
  const ea = (data.hostData && data.hostData.exprAttrs) || {};
  const organs = ea.organs || [];
  const byNode = ea.byNode || {};
  const tpmRange = ea.maxTpm || { min: 0, max: 0 };
  const sW = stressWidth(width, organs.length);
  const totalHeight = visibleRows.length
    ? visibleRows[visibleRows.length - 1].y + visibleRows[visibleRows.length - 1].height
    : 0;
  const rows = visibleRows.slice(rowRange.startIndex, rowRange.endIndex);

  return (
    <div style={{ position: 'relative', width, height: totalHeight, overflow: 'hidden' }}>
      {rows.map((r) => {
        const gene = byNode[r.nodeId];
        const background = rowHighlight(
          selectedNodeId === r.nodeId,
          hoveredNodeId === r.nodeId,
          !!(hoveredSubtreeIds && hoveredSubtreeIds.has(r.nodeId)),
        );
        const tpmFrac = gene ? tpmFraction(gene.maxTpm, tpmRange) : null;
        return (
          <div
            key={r.nodeId}
            onMouseEnter={() => onHoverNode(r.nodeId)}
            onMouseLeave={() => onHoverNode(null)}
            onClick={() => onSelectNode(r.nodeId)}
            style={{
              position: 'absolute', top: r.y, height: r.height, left: 0, width,
              display: 'flex', boxSizing: 'border-box', background, cursor: 'pointer',
              opacity: r.opacity ?? 1,
            }}
          >
            {organs.map((o) => <OrganCell key={o} organ={o} gene={gene} />)}
            <div
              title={gene && Number.isFinite(gene.maxTpm) ? `max TPM: ${gene.maxTpm}` : ''}
              style={{
                width: MAXTPM_W, height: '100%', boxSizing: 'border-box', borderRight: gridBorder,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4,
                fontSize: 9, fontVariantNumeric: 'tabular-nums', color: 'var(--tbrowse-text)',
                background: tpmFrac === null ? 'transparent' : `rgba(33, 102, 172, ${(0.1 + 0.65 * tpmFrac).toFixed(3)})`,
              }}
            >
              {gene ? fmtTpm(gene.maxTpm) : ''}
            </div>
            <StressCell gene={gene} width={sW} />
          </div>
        );
      })}
    </div>
  );
};

export const exprAttrsZone = {
  id: 'expression',
  displayName: 'Expression',
  Header: ExprHeader,
  Body: ExprBody,
  defaultWidth: 70,
  minWidth: 280,
  defaultZoneState: {},
  // Stay hidden until its async data lands; tbrowse's auto-enable effect flips
  // it on once isAvailable() turns true (same lifecycle as neighborhood/genome).
  isAvailable: (data) => Boolean(
    data.hostData && data.hostData.exprAttrs && data.hostData.exprAttrs.organs
    && data.hostData.exprAttrs.organs.length,
  ),
  defaultVisible: false,
};
