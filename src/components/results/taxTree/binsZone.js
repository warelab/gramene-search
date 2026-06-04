// Host-defined tbrowse zone: per-genome genome-wide distribution of search
// hits, binned into `fixed_1000__bin` bins. One horizontal strip per leaf
// (genome) row, drawn on a canvas (1000 bins × N genomes is far too many DOM
// rects for SVG). Region segmentation + per-pixel weighted scoring +
// categorical region colours are ported from gramene-search-vis
// (taxogenomic/canvas/Genome.js + util/colors.js) so the look matches the
// legacy Taxonomic-distribution view.
//
// Data arrives via tbrowse's opaque `hostData` channel as
//   data.hostData.bins = { genomesByTaxon: { [taxonId]: genome }, maxScore }
// where `genome` is a gramene-bins-client genome (fullGenomeSize,
// _regionsArray, region.bin(i)/binCount()/size/name, bin.results.count).

import React, { useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { EditableZoneName } from 'tbrowse';

// ── colour model (ported from gramene-search-vis util/colors.js) ──────────
// schemeCategory10, kept as RGB triples so we need no d3 dependency here.
const REGION_RGB = [
  [31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40],
  [148, 103, 189], [140, 86, 75], [227, 119, 194], [127, 127, 127],
  [188, 189, 34], [23, 190, 207],
];
const UNANCHORED = 'rgb(211,211,211)';
const WHITE = [255, 255, 255];

const lerp = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// Light tint → base colour, with a pow(0.4) ramp on the score so low counts
// stay visible — matches binColorScales in the legacy colors.js.
function binColor(regionIdx, score, unanchored) {
  if (unanchored) return UNANCHORED;
  const base = REGION_RGB[regionIdx % REGION_RGB.length];
  const tint = lerp(WHITE, base, 0.15);
  const t = Math.pow(Math.max(0, Math.min(1, score)), 0.4);
  const [r, g, b] = lerp(tint, base, t);
  return `rgb(${r},${g},${b})`;
}

function updateScore(currentScore, baseCount, binScore, binBasesUsed) {
  if (typeof currentScore === 'number') {
    return ((currentScore * baseCount) + (binScore * binBasesUsed)) / (binBasesUsed + baseCount);
  }
  return binScore;
}

// Draw one genome's distribution into [x, x+width) at vertical [y, y+height).
// Ported from drawGenome() in gramene-search-vis, collapsed to a single row.
function drawGenomeRow(ctx, genome, x, y, width, height, maxScore) {
  const regions = genome && genome._regionsArray;
  if (!regions || regions.length === 0 || !genome.fullGenomeSize) return;
  const basesPerPx = genome.fullGenomeSize / width;
  if (!(basesPerPx > 0)) return;

  let binIdx = 0;
  let basesInBinUsedAlready = 0;
  let regionIdx = 0;
  let region = regions[regionIdx];
  let regionUnanchored = region.name === 'UNANCHORED';

  for (let px = 0; px < width; px++) {
    let baseCount = 0;
    let score;
    let basesAvailableInBin = 0;

    while (baseCount < basesPerPx) {
      const basesNeededByThisPixel = basesPerPx - baseCount;
      const bin = region.bin(binIdx);
      const binSize = bin.end - bin.start + 1;
      const binScore = maxScore ? (bin.results ? bin.results.count : 0) / maxScore : 0;
      basesAvailableInBin = binSize - basesInBinUsedAlready;

      let binBasesUsed;
      if (basesAvailableInBin <= basesNeededByThisPixel) {
        binIdx++;
        basesInBinUsedAlready = 0;
        binBasesUsed = basesAvailableInBin;
      } else {
        basesInBinUsedAlready += basesNeededByThisPixel;
        binBasesUsed = basesNeededByThisPixel;
      }

      score = updateScore(score, baseCount, binScore, binBasesUsed);
      baseCount += binBasesUsed;

      if (binIdx === region.binCount()) {
        binIdx = 0;
        regionIdx++;
        if (regionIdx === regions.length) break;
        region = regions[regionIdx];
        regionUnanchored = region.name === 'UNANCHORED';
      }
    }

    ctx.fillStyle = binColor(regionIdx, score || 0, regionUnanchored);
    ctx.fillRect(x + px, y, 1, height);
  }
}

// ── data extraction ───────────────────────────────────────────────────────
// Pull the per-genome objects + global max bin score off the taxDist tree, to
// be handed to TBrowse via hostData.bins.
export function extractGenomeData(taxDist) {
  if (!taxDist || typeof taxDist.leafNodes !== 'function') return null;
  const genomesByTaxon = {};
  taxDist.leafNodes().forEach((node) => {
    if (node && node.model && node.model.genome) {
      genomesByTaxon[String(node.model.id)] = node.model.genome;
    }
  });
  let maxScore = 0;
  try {
    const stats = taxDist.globalResultSetStats();
    maxScore = (stats && stats.bins && stats.bins.max) || 0;
  } catch (_) { /* no results yet */ }
  return { genomesByTaxon, maxScore };
}

// ── interaction store (shared between Header and Body via hostData) ──────────
// A tiny pub/sub kept OUT of the controlled tbrowse viewState so per-mousemove
// hover/drag updates don't churn the whole tree. Holds the hovered chromosome,
// the in-progress drag, and the committed drag-selections.
const EMPTY_UI = { hovered: null, inProgress: null, selections: [] };
const NOOP_SUB = () => () => {};
const NOOP_GET = () => EMPTY_UI;

export function createBinsUiStore() {
  let state = EMPTY_UI;
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => l());
  return {
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    setHovered: (h) => { state = { ...state, hovered: h }; emit(); },
    setInProgress: (p) => { state = { ...state, inProgress: p }; emit(); },
    // Add a selection, merging it with any existing selection on the SAME
    // genome whose pixel range overlaps — so overlapping drags become one
    // region and shared bins aren't double-counted. Bins are unioned by their
    // global index.
    addSelection: (sel) => {
      let merged = sel;
      const rest = [];
      for (const s of state.selections) {
        if (s.taxonId === merged.taxonId && s.x0 <= merged.x1 && s.x1 >= merged.x0) {
          const byIdx = new Map();
          for (const b of s.bins) byIdx.set(b.idx, b.count);
          for (const b of merged.bins) byIdx.set(b.idx, b.count);
          merged = {
            taxonId: merged.taxonId,
            x0: Math.min(s.x0, merged.x0),
            x1: Math.max(s.x1, merged.x1),
            bins: [...byIdx].map(([idx, count]) => ({ idx, count })),
          };
        } else {
          rest.push(s);
        }
      }
      state = { ...state, selections: [...rest, merged] };
      emit();
    },
    clear: () => { state = EMPTY_UI; emit(); },
  };
}

// Total selected genes, deduped across all selections by global bin index so
// overlapping selections (or the same bin in two regions) count once.
export function totalSelectedGenes(selections) {
  const byIdx = new Map();
  for (const s of selections) for (const b of (s.bins || [])) byIdx.set(b.idx, b.count);
  let total = 0;
  for (const c of byIdx.values()) total += c;
  return total;
}

// Unique global bin indices across all selections (for the filter).
export function selectedBinIdxs(selections) {
  const set = new Set();
  for (const s of selections) for (const b of (s.bins || [])) set.add(b.idx);
  return [...set];
}

// Per-genome pixel layout across the [0,width) strip: region spans (for
// chromosome hit-testing) and bin spans with gene counts (for summing a
// drag-selected range). Mirrors drawGenomeRow's region/bin walk.
function buildGenomeLayout(genome, width) {
  const out = { regions: [] };
  const regions = genome && genome._regionsArray;
  if (!regions || !genome.fullGenomeSize || !(width > 0)) return out;
  const basesPerPx = genome.fullGenomeSize / width;
  if (!(basesPerPx > 0)) return out;
  let px = 0;
  for (const region of regions) {
    const x0 = px;
    const binsArr = [];
    const n = region.binCount();
    for (let i = 0; i < n; i++) {
      const bin = region.bin(i);
      const bw = (bin.end - bin.start + 1) / basesPerPx;
      binsArr.push({ x0: px, x1: px + bw, count: (bin.results && bin.results.count) || 0, idx: bin.idx });
      px += bw;
    }
    out.regions.push({ name: region.name, x0, x1: px, bins: binsArr });
  }
  return out;
}

function regionAtPx(layout, mx) {
  for (const r of layout.regions) if (mx >= r.x0 && mx < r.x1) return r;
  return null;
}

// Non-empty bins overlapping a pixel range, as {idx, count}. Empty bins are
// excluded by design (the selection / filter only covers bins with genes).
function selectedBinsInPxRange(layout, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const bins = [];
  for (const r of layout.regions) {
    if (r.x1 < lo || r.x0 > hi) continue;
    for (const bin of r.bins) {
      if (bin.x1 > lo && bin.x0 < hi && bin.count > 0) bins.push({ idx: bin.idx, count: bin.count });
    }
  }
  return bins;
}

// ── zone components ─────────────────────────────────────────────────────────
const HEADER_BTN = { fontSize: 11, lineHeight: 1, padding: '1px 6px', cursor: 'pointer' };

const BinsHeader = ({ data, zoneState, setZoneState }) => {
  const store = data.hostData && data.hostData.binsUI;
  const snap = useSyncExternalStore(
    store ? store.subscribe : NOOP_SUB,
    store ? store.getState : NOOP_GET,
  );
  const total = totalSelectedGenes(snap.selections);
  const hovered = snap.hovered;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: '0 10px',
        fontSize: 13,
        color: 'var(--tbrowse-text)',
      }}
    >
      {/* Row 1: editable zone name + selection summary + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 0 }}>
        <EditableZoneName
          defaultName="Genome distribution"
          customName={zoneState?.name}
          onChange={(next) => setZoneState((s) => ({ ...(s ?? {}), name: next }))}
        />
        {snap.selections.length > 0 && (
          <>
            <span style={{ color: 'var(--tbrowse-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {total.toLocaleString()} gene{total === 1 ? '' : 's'} selected
            </span>
            <button type="button" style={HEADER_BTN} title="Clear selections" onClick={() => store && store.clear()}>
              clear selections
            </button>
            <button
              type="button"
              style={HEADER_BTN}
              title="Add the selected bins (those with genes) as a search filter"
              onClick={() => {
                const apply = data.hostData && data.hostData.onApplyBinsFilter;
                if (apply) apply(snap.selections);
              }}
            >
              apply as filter
            </button>
          </>
        )}
      </div>
      {/* Row 2: hovered chromosome info */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--tbrowse-text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {hovered ? (
          `${hovered.genomeName} : ${hovered.regionName} : ${(hovered.geneCount || 0).toLocaleString()} gene${hovered.geneCount === 1 ? '' : 's'}`
        ) : (
          <span style={{ color: 'var(--tbrowse-text-subtle)' }}>hover a chromosome…</span>
        )}
      </div>
    </div>
  );
};

// Vertical inset for the drawn bins. Leaving a few px of the row un-painted
// lets the row-highlight background (rendered in the layer beneath the canvas)
// show as bands above/below the strip on hover/select.
const ROW_PAD_Y = 2;

function rowHighlight(isSelected, isExactHover, isInHoveredSubtree) {
  if (isSelected) return 'var(--tbrowse-row-select-bg)';
  if (isExactHover) return 'var(--tbrowse-row-hover-bg)';
  if (isInHoveredSubtree) return 'var(--tbrowse-row-subtree-bg)';
  return 'transparent';
}

const BinsBody = (props) => {
  const {
    visibleRows, rowRange, width, data,
    hoveredNodeId, hoveredSubtreeIds, selectedNodeId, onHoverNode, onSelectNode,
  } = props;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  // A drag ends with a synthetic `click` after `pointerup` (dragRef is already
  // cleared by then), which would otherwise select the row's node and pop the
  // tree tooltip. Set on a moved drag and consumed by the row's onClick.
  const suppressClickRef = useRef(false);
  const store = data.hostData && data.hostData.binsUI;
  const snap = useSyncExternalStore(
    store ? store.subscribe : NOOP_SUB,
    store ? store.getState : NOOP_GET,
  );

  const totalHeight = visibleRows.length
    ? visibleRows[visibleRows.length - 1].y + visibleRows[visibleRows.length - 1].height
    : 0;
  const bins = data.hostData && data.hostData.bins;
  const rows = visibleRows.slice(rowRange.startIndex, rowRange.endIndex);
  const w = Math.max(1, Math.floor(width));

  // Pixel layout per visible genome row (regions + bins), for hit-testing.
  const layouts = useMemo(() => {
    const m = {};
    if (bins) {
      for (const r of rows) {
        if (r.kind !== 'leaf') continue;
        const g = bins.genomesByTaxon[r.nodeId];
        if (g) m[r.nodeId] = buildGenomeLayout(g, w);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins, w, rowRange.startIndex, rowRange.endIndex, visibleRows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bins) return;
    const dpr = window.devicePixelRatio || 1;
    const h = Math.max(1, Math.floor(totalHeight));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    for (const r of rows) {
      if (r.kind !== 'leaf') continue; // collapsed summaries: no single genome
      const genome = bins.genomesByTaxon[r.nodeId];
      if (!genome) continue;
      const innerH = Math.max(1, r.height - 2 * ROW_PAD_Y);
      drawGenomeRow(ctx, genome, 0, r.y + ROW_PAD_Y, w, innerH, bins.maxScore);
    }
  }, [visibleRows, rowRange.startIndex, rowRange.endIndex, w, totalHeight, bins]);

  const pxFromEvent = (e) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(w, e.clientX - rect.left));
  };

  const genomeName = (taxonId) => {
    const tax = data.taxonomy && data.taxonomy[taxonId];
    return (tax && (tax.commonName || tax.scientificName)) || String(taxonId);
  };

  const onRowMouseMove = (e, r) => {
    if (!store || dragRef.current || !layouts[r.nodeId]) return;
    const reg = regionAtPx(layouts[r.nodeId], pxFromEvent(e));
    if (!reg) { store.setHovered(null); return; }
    const geneCount = reg.bins.reduce((a, b) => a + b.count, 0);
    store.setHovered({
      taxonId: r.nodeId,
      genomeName: genomeName(r.nodeId),
      regionName: reg.name,
      geneCount,
      x0: reg.x0,
      x1: reg.x1,
    });
  };

  const onRowPointerDown = (e, r) => {
    if (!store || !layouts[r.nodeId]) return;
    e.preventDefault();
    const startPx = pxFromEvent(e);
    dragRef.current = { taxonId: r.nodeId, startPx, moved: false };
    store.setInProgress({ taxonId: r.nodeId, x0: startPx, x1: startPx });
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const cur = pxFromEvent(ev);
      if (Math.abs(cur - d.startPx) > 2) d.moved = true;
      store.setInProgress({ taxonId: d.taxonId, x0: Math.min(d.startPx, cur), x1: Math.max(d.startPx, cur) });
    };
    const onUp = (ev) => {
      const d = dragRef.current;
      dragRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      store.setInProgress(null);
      if (d && d.moved) {
        suppressClickRef.current = true; // swallow the click that follows a drag
        const cur = pxFromEvent(ev);
        const x0 = Math.min(d.startPx, cur);
        const x1 = Math.max(d.startPx, cur);
        const lay = layouts[d.taxonId];
        if (lay) {
          const bins = selectedBinsInPxRange(lay, x0, x1);
          if (bins.length) store.addSelection({ taxonId: d.taxonId, x0, x1, bins });
        }
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const rowByTaxon = new Map(rows.map((r) => [r.nodeId, r]));
  // Outline rectangles (drawn above the canvas; pointer-events:none). The y
  // comes from the current row so they track vertical scroll.
  const outline = (key, taxonId, x0, x1, color, dashed) => {
    const r = rowByTaxon.get(taxonId);
    if (!r) return null;
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          top: r.y + 1,
          left: x0,
          width: Math.max(1, x1 - x0),
          height: Math.max(1, r.height - 2),
          border: `1px ${dashed ? 'dashed' : 'solid'} ${color}`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />
    );
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width, height: totalHeight }}>
      {/* Hover/select row-highlight + interaction layer (beneath the canvas).
          Canvas is pointer-events:none so events reach these rows. */}
      {rows.map((r) => (
        <div
          key={r.nodeId}
          onMouseEnter={() => onHoverNode(r.nodeId)}
          onMouseLeave={() => { onHoverNode(null); if (store && !dragRef.current) store.setHovered(null); }}
          onMouseMove={(e) => onRowMouseMove(e, r)}
          onPointerDown={(e) => onRowPointerDown(e, r)}
          onClick={() => {
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            onSelectNode(r.nodeId);
          }}
          style={{
            position: 'absolute',
            top: r.y,
            left: 0,
            right: 0,
            height: r.height,
            background: rowHighlight(
              selectedNodeId === r.nodeId,
              hoveredNodeId === r.nodeId,
              !!(hoveredSubtreeIds && hoveredSubtreeIds.has(r.nodeId)),
            ),
            cursor: 'crosshair',
            opacity: r.opacity ?? 1,
          }}
        />
      ))}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width, height: totalHeight, pointerEvents: 'none' }}
      />
      {/* Outlines above the bins. */}
      {snap.hovered && !snap.inProgress
        && outline('hover', snap.hovered.taxonId, snap.hovered.x0, snap.hovered.x1, 'var(--tbrowse-accent, #2878dc)', false)}
      {snap.selections.map((s, i) =>
        outline(`sel-${i}`, s.taxonId, s.x0, s.x1, '#d62728', false))}
      {snap.inProgress
        && outline('drag', snap.inProgress.taxonId, snap.inProgress.x0, snap.inProgress.x1, '#d62728', true)}
    </div>
  );
};

export const binsZone = {
  id: 'bins',
  displayName: 'Genome distribution',
  Header: BinsHeader,
  Body: BinsBody,
  defaultWidth: 60,
  minWidth: 200,
  defaultZoneState: {},
  isAvailable: (data) =>
    Boolean(
      data.hostData &&
      data.hostData.bins &&
      data.hostData.bins.genomesByTaxon &&
      Object.keys(data.hostData.bins.genomesByTaxon).length > 0,
    ),
  defaultVisible: true,
};
