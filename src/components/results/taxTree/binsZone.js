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
//
// Pan/zoom: a single shared horizontal transform { scale, leftFrac } (fraction
// space, so it's width-independent and aligns every genome to the same relative
// window) lives in the ephemeral binsUI store. The header toggles between two
// interaction modes: 'select' (drag selects a region to count/filter genes,
// the original gesture) and 'panzoom' (drag pans, wheel zooms toward the
// cursor). All hit-testing/coordinates are in genome-fraction [0,1] so
// hovers/selections stay anchored to the genome as you pan and zoom.

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MAX_SCALE = 1000; // zoom far enough to isolate a single bin

// Locate the region/bin cursor at a target base offset, so a zoomed draw can
// start partway into the genome without iterating skipped pixels. Returns null
// past the end of the genome.
function seekCursor(regions, targetBase) {
  let acc = 0;
  for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
    const region = regions[regionIdx];
    const n = region.binCount();
    for (let binIdx = 0; binIdx < n; binIdx++) {
      const bin = region.bin(binIdx);
      const size = bin.end - bin.start + 1;
      if (acc + size > targetBase) {
        return { regionIdx, binIdx, basesInBinUsedAlready: Math.max(0, targetBase - acc) };
      }
      acc += size;
    }
  }
  return null;
}

// Draw one genome's distribution into the visible [0, widthPx) strip at
// vertical [y, y+height), under the shared { scale, leftFrac } transform. Only
// the visible pixels are drawn (the cursor is fast-forwarded to the window's
// left edge); consecutive equal-colour columns are batched into one fillRect,
// which makes zoomed-in draws (where each bin spans many px) cheap. Ported from
// drawGenome() in gramene-search-vis, generalised for pan/zoom.
function drawGenomeRow(ctx, genome, y, widthPx, height, maxScore, scale, leftFrac) {
  const regions = genome && genome._regionsArray;
  const full = genome && genome.fullGenomeSize;
  if (!regions || regions.length === 0 || !full) return;
  const virtualWidth = widthPx * scale; // full genome spans this many px when zoomed
  const basesPerPx = full / virtualWidth;
  if (!(basesPerPx > 0)) return;

  const cursor = seekCursor(regions, leftFrac * full);
  if (!cursor) return;
  let { regionIdx, binIdx, basesInBinUsedAlready } = cursor;
  let region = regions[regionIdx];
  let regionUnanchored = region.name === 'UNANCHORED';

  let runColor = null;
  let runStart = 0;
  const flush = (endExclusive) => {
    if (runColor !== null && endExclusive > runStart) {
      ctx.fillStyle = runColor;
      ctx.fillRect(runStart, y, endExclusive - runStart, height);
    }
  };

  let px = 0;
  for (; px < widthPx; px++) {
    let baseCount = 0;
    let score;
    let ended = false;

    while (baseCount < basesPerPx) {
      const basesNeededByThisPixel = basesPerPx - baseCount;
      const bin = region.bin(binIdx);
      const binSize = bin.end - bin.start + 1;
      const binScore = maxScore ? (bin.results ? bin.results.count : 0) / maxScore : 0;
      const basesAvailableInBin = binSize - basesInBinUsedAlready;

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
        if (regionIdx === regions.length) { ended = true; break; }
        region = regions[regionIdx];
        regionUnanchored = region.name === 'UNANCHORED';
      }
    }

    const idxForColor = regionIdx >= regions.length ? regions.length - 1 : regionIdx;
    const color = binColor(idxForColor, score || 0, regionUnanchored);
    if (runColor === null) {
      runColor = color;
      runStart = px;
    } else if (color !== runColor) {
      flush(px);
      runColor = color;
      runStart = px;
    }
    if (ended) { px++; break; }
  }
  flush(px);
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
// hover/drag/pan/zoom updates don't churn the whole tree. Holds the hovered
// chromosome, the in-progress select-drag, the committed drag-selections, and
// the shared horizontal pan/zoom transform.
const DEFAULT_TRANSFORM = { scale: 1, leftFrac: 0 };
const EMPTY_UI = { hovered: null, inProgress: null, selections: [], transform: DEFAULT_TRANSFORM };
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
    setTransform: (t) => { state = { ...state, transform: t }; emit(); },
    resetTransform: () => { state = { ...state, transform: DEFAULT_TRANSFORM }; emit(); },
    // Add a selection, merging it with any existing selection on the SAME
    // genome whose fraction range overlaps — so overlapping drags become one
    // region and shared bins aren't double-counted. Bins are unioned by their
    // global index.
    addSelection: (sel) => {
      let merged = sel;
      const rest = [];
      for (const s of state.selections) {
        if (s.taxonId === merged.taxonId && s.f0 <= merged.f1 && s.f1 >= merged.f0) {
          const byIdx = new Map();
          for (const b of s.bins) byIdx.set(b.idx, b.count);
          for (const b of merged.bins) byIdx.set(b.idx, b.count);
          merged = {
            taxonId: merged.taxonId,
            f0: Math.min(s.f0, merged.f0),
            f1: Math.max(s.f1, merged.f1),
            bins: [...byIdx].map(([idx, count]) => ({ idx, count })),
          };
        } else {
          rest.push(s);
        }
      }
      state = { ...state, selections: [...rest, merged] };
      emit();
    },
    // Clear hover/selections but keep the current zoom/pan transform — clearing
    // selections shouldn't yank the user back out of their zoom.
    clear: () => { state = { ...EMPTY_UI, transform: state.transform }; emit(); },
    // Full reset (new result set): drop everything including the transform.
    reset: () => { state = EMPTY_UI; emit(); },
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

// Per-genome layout in genome-fraction space [0,1]: region spans (for
// chromosome hit-testing) and bin spans with gene counts (for summing a
// drag-selected range). Width/zoom-independent — the transform maps fractions
// to screen pixels at render time.
function buildGenomeLayout(genome) {
  const out = { regions: [] };
  const regions = genome && genome._regionsArray;
  const full = genome && genome.fullGenomeSize;
  if (!regions || !full) return out;
  let base = 0;
  for (const region of regions) {
    const f0 = base / full;
    const binsArr = [];
    const n = region.binCount();
    for (let i = 0; i < n; i++) {
      const bin = region.bin(i);
      const size = bin.end - bin.start + 1;
      const bf0 = base / full;
      base += size;
      binsArr.push({ f0: bf0, f1: base / full, count: (bin.results && bin.results.count) || 0, idx: bin.idx });
    }
    out.regions.push({ name: region.name, f0, f1: base / full, bins: binsArr });
  }
  return out;
}

function regionAtFrac(layout, f) {
  for (const r of layout.regions) if (f >= r.f0 && f < r.f1) return r;
  return null;
}

// Non-empty bins overlapping a fraction range, as {idx, count}. Empty bins are
// excluded by design (the selection / filter only covers bins with genes).
function selectedBinsInFracRange(layout, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const bins = [];
  for (const r of layout.regions) {
    if (r.f1 < lo || r.f0 > hi) continue;
    for (const bin of r.bins) {
      if (bin.f1 > lo && bin.f0 < hi && bin.count > 0) bins.push({ idx: bin.idx, count: bin.count });
    }
  }
  return bins;
}

// ── zone components ─────────────────────────────────────────────────────────
const HEADER_BTN = { fontSize: 11, lineHeight: 1, padding: '1px 6px', cursor: 'pointer' };

function ModeToggle({ mode, setMode }) {
  const seg = (id, label) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      title={id === 'select' ? 'Drag to select a region' : 'Drag to pan, scroll to zoom'}
      style={{
        fontSize: 11,
        lineHeight: 1,
        padding: '2px 7px',
        cursor: 'pointer',
        border: 'none',
        background: mode === id ? 'var(--tbrowse-accent, #2878dc)' : 'transparent',
        color: mode === id ? '#fff' : 'var(--tbrowse-text-muted)',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--tbrowse-border-soft)',
      borderRadius: 4,
      overflow: 'hidden',
    }}
    >
      {seg('select', 'Select')}
      {seg('panzoom', 'Pan/Zoom')}
    </div>
  );
}

const BinsHeader = ({ data, zoneState, setZoneState }) => {
  const store = data.hostData && data.hostData.binsUI;
  const snap = useSyncExternalStore(
    store ? store.subscribe : NOOP_SUB,
    store ? store.getState : NOOP_GET,
  );
  const total = totalSelectedGenes(snap.selections);
  const hovered = snap.hovered;
  const scale = snap.transform ? snap.transform.scale : 1;
  const mode = (zoneState && zoneState.mode) || 'select';
  const setMode = (m) => setZoneState((s) => ({ ...(s ?? {}), mode: m }));

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
      {/* Row 1: name + mode toggle + zoom readout/reset + selection summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 0, flexWrap: 'wrap' }}>
        <EditableZoneName
          defaultName="Genome distribution"
          customName={zoneState?.name}
          onChange={(next) => setZoneState((s) => ({ ...(s ?? {}), name: next }))}
        />
        <ModeToggle mode={mode} setMode={setMode} />
        {scale > 1.0001 && (
          <>
            <span style={{ color: 'var(--tbrowse-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
              {scale.toFixed(scale < 10 ? 1 : 0)}×
            </span>
            <button type="button" style={HEADER_BTN} title="Reset zoom" onClick={() => store && store.resetTransform()}>
              reset zoom
            </button>
          </>
        )}
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
    visibleRows, rowRange, width, data, zoneState,
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
  const transform = snap.transform || DEFAULT_TRANSFORM;
  const mode = (zoneState && zoneState.mode) || 'select';

  const totalHeight = visibleRows.length
    ? visibleRows[visibleRows.length - 1].y + visibleRows[visibleRows.length - 1].height
    : 0;
  const bins = data.hostData && data.hostData.bins;
  const rows = visibleRows.slice(rowRange.startIndex, rowRange.endIndex);
  const w = Math.max(1, Math.floor(width));

  // Fraction-space layout per visible genome row (regions + bins), for
  // hit-testing. Independent of width/zoom, so it only rebuilds when the row
  // set changes.
  const layouts = useMemo(() => {
    const m = {};
    if (bins) {
      for (const r of rows) {
        if (r.kind !== 'leaf') continue;
        const g = bins.genomesByTaxon[r.nodeId];
        if (g) m[r.nodeId] = buildGenomeLayout(g);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins, rowRange.startIndex, rowRange.endIndex, visibleRows]);

  // Fraction <-> screen-pixel helpers under the current transform.
  const fracToScreen = (f) => (f - transform.leftFrac) * transform.scale * w;
  const screenToFrac = (px) => transform.leftFrac + (px / w) / transform.scale;

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
      drawGenomeRow(
        ctx, genome, r.y + ROW_PAD_Y, w, innerH, bins.maxScore,
        transform.scale, transform.leftFrac,
      );
    }
  }, [visibleRows, rowRange.startIndex, rowRange.endIndex, w, totalHeight, bins,
    transform.scale, transform.leftFrac]);

  const pxFromEvent = (e) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clamp(e.clientX - rect.left, 0, w);
  };

  // Wheel-to-zoom (panzoom mode only), centred on the cursor. Native non-passive
  // listener so we can preventDefault the page scroll; re-attached when mode/
  // width change. Transform is read live from the store to avoid stale closures.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !store) return undefined;
    const onWheel = (e) => {
      if (mode !== 'panzoom') return; // let the page scroll normally
      e.preventDefault();
      const t = store.getState().transform || DEFAULT_TRANSFORM;
      const rect = el.getBoundingClientRect();
      const cursorPx = clamp(e.clientX - rect.left, 0, w);
      const fracAtCursor = t.leftFrac + (cursorPx / w) / t.scale;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = clamp(t.scale * factor, 1, MAX_SCALE);
      const newLeft = clamp(
        fracAtCursor - (cursorPx / w) / newScale,
        0,
        1 - 1 / newScale,
      );
      store.setTransform({ scale: newScale, leftFrac: newLeft });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store, w, mode]);

  const genomeName = (taxonId) => {
    const tax = data.taxonomy && data.taxonomy[taxonId];
    return (tax && (tax.commonName || tax.scientificName)) || String(taxonId);
  };

  const onRowMouseMove = (e, r) => {
    if (!store || dragRef.current || !layouts[r.nodeId]) return;
    const reg = regionAtFrac(layouts[r.nodeId], screenToFrac(pxFromEvent(e)));
    if (!reg) { store.setHovered(null); return; }
    const geneCount = reg.bins.reduce((a, b) => a + b.count, 0);
    store.setHovered({
      taxonId: r.nodeId,
      genomeName: genomeName(r.nodeId),
      regionName: reg.name,
      geneCount,
      f0: reg.f0,
      f1: reg.f1,
    });
  };

  // Pan drag (panzoom mode): translate leftFrac by the cursor delta, scaled by
  // the current zoom. Shared transform → every genome row pans together.
  const startPan = (e) => {
    e.preventDefault();
    const startPx = pxFromEvent(e);
    const t0 = store.getState().transform || DEFAULT_TRANSFORM;
    let moved = false;
    const onMove = (ev) => {
      const dx = pxFromEvent(ev) - startPx;
      if (Math.abs(dx) > 2) moved = true;
      const t = store.getState().transform || DEFAULT_TRANSFORM;
      const newLeft = clamp(t0.leftFrac - (dx / w) / t.scale, 0, 1 - 1 / t.scale);
      store.setTransform({ scale: t.scale, leftFrac: newLeft });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (moved) suppressClickRef.current = true;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // Select drag (select mode): brush a fraction range and add the non-empty
  // bins under it as a committed selection.
  const startSelect = (e, r) => {
    if (!layouts[r.nodeId]) return;
    e.preventDefault();
    const startFrac = screenToFrac(pxFromEvent(e));
    dragRef.current = { taxonId: r.nodeId, startFrac, moved: false };
    store.setInProgress({ taxonId: r.nodeId, f0: startFrac, f1: startFrac });
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const cur = screenToFrac(pxFromEvent(ev));
      if (Math.abs(cur - d.startFrac) * w * transform.scale > 2) d.moved = true;
      store.setInProgress({ taxonId: d.taxonId, f0: Math.min(d.startFrac, cur), f1: Math.max(d.startFrac, cur) });
    };
    const onUp = (ev) => {
      const d = dragRef.current;
      dragRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      store.setInProgress(null);
      if (d && d.moved) {
        suppressClickRef.current = true; // swallow the click that follows a drag
        const cur = screenToFrac(pxFromEvent(ev));
        const f0 = Math.min(d.startFrac, cur);
        const f1 = Math.max(d.startFrac, cur);
        const lay = layouts[d.taxonId];
        if (lay) {
          const selBins = selectedBinsInFracRange(lay, f0, f1);
          if (selBins.length) store.addSelection({ taxonId: d.taxonId, f0, f1, bins: selBins });
        }
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const onRowPointerDown = (e, r) => {
    if (!store) return;
    if (mode === 'panzoom') { startPan(e); return; }
    startSelect(e, r);
  };

  const rowByTaxon = new Map(rows.map((r) => [r.nodeId, r]));
  // Outline rectangles (drawn above the canvas; pointer-events:none). Stored in
  // fraction space and projected to screen px under the transform, clipped to
  // the visible strip. The y comes from the current row so they track scroll.
  const outline = (key, taxonId, f0, f1, color, dashed) => {
    const r = rowByTaxon.get(taxonId);
    if (!r) return null;
    let x0 = fracToScreen(f0);
    let x1 = fracToScreen(f1);
    if (x1 <= 0 || x0 >= w) return null; // fully outside the visible window
    x0 = Math.max(0, x0);
    x1 = Math.min(w, x1);
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

  const rowCursor = mode === 'panzoom' ? 'grab' : 'crosshair';

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
            cursor: rowCursor,
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
        && outline('hover', snap.hovered.taxonId, snap.hovered.f0, snap.hovered.f1, 'var(--tbrowse-accent, #2878dc)', false)}
      {snap.selections.map((s, i) =>
        outline(`sel-${i}`, s.taxonId, s.f0, s.f1, '#d62728', false))}
      {snap.inProgress
        && outline('drag', snap.inProgress.taxonId, snap.inProgress.f0, snap.inProgress.f1, '#d62728', true)}
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
  defaultZoneState: { mode: 'select' },
  isAvailable: (data) =>
    Boolean(
      data.hostData &&
      data.hostData.bins &&
      data.hostData.bins.genomesByTaxon &&
      Object.keys(data.hostData.bins.genomesByTaxon).length > 0,
    ),
  defaultVisible: true,
};
