import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

// Heatmap of (gene × sample) expression values. A compact, color-mapped
// stand-in for the data table; columns line up with the table's column order
// so switching modes preserves the user's mental model.
//
// Scale: discrete threshold-based color bins (5 levels, configurable below)
// going from pale blue (low) to dark blue (high). The bin cutoffs are
// global — they don't adapt to the data — so colors are comparable across
// different gene sets and tabs. Edit BIN_CUTOFFS / BIN_COLORS to retune.

// 4 cutoffs → 5 bins → 5 colors. A value v gets BIN_COLORS[i] where i is
// the largest index such that v >= BIN_CUTOFFS[i-1] (with i=0 below all).
// Defaults assume TPM-like expression magnitudes; adjust for FPKM / counts.
const BIN_CUTOFFS = [1, 10, 100, 1000];
const BIN_COLORS = [
  '#e8f1f8', // pale blue — below first cutoff
  '#b8d3e6',
  '#6da6cf',
  '#2e6fae',
  '#0a3d72'  // dark blue — above last cutoff
];

const MIN_CELL_H = 20;
const MIN_CELL_W = 20;
const CELL_GAP = 1;
const HEADER_LABEL_ROTATION = -40;
const LABEL_FONT_SIZE = 11;
// Reasonable bounds for label-fit margins so a single huge label can't
// monopolize the visualization space.
const LEFT_MARGIN_MIN = 36;
const LEFT_MARGIN_MAX = 220;
const HEADER_HEIGHT_MIN = 60;
const HEADER_HEIGHT_MAX = 200;
const RIGHT_MARGIN = 16;
const BODY_BOTTOM = 12;

function isNumeric(v) {
  if (v == null || Array.isArray(v)) return false;
  return Number.isFinite(+v);
}

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a < 0.001 || a >= 1e6)) return n.toExponential(3);
  return Number(n.toFixed(4)).toString();
}

function studyIdOfField(field) {
  const m = field && field.match(/^(.+?)_g\d+__expr$/);
  return m ? m[1] : field;
}

// One shared canvas context for label measurement — avoids re-creating it
// per render and keeps the math accurate (font metrics depend on the
// browser's actual font rendering).
let _measureCtx = null;
function measureText(s, fontSize = LABEL_FONT_SIZE) {
  if (!s) return 0;
  if (!_measureCtx) {
    if (typeof document === 'undefined') return s.length * 6.5;
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  _measureCtx.font = `${fontSize}px sans-serif`;
  return _measureCtx.measureText(String(s)).width;
}

const HeatmapPlot = ({
  rows,
  fields,
  axisLabels = null,
  fieldInfo = null,
  onHoverRow = null
}) => {
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const headerSvgRef = useRef(null);
  const bodySvgRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize(prev => {
          if (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) return prev;
          return { w: width, h: height };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colorOfValue = useMemo(() => {
    const scale = d3.scaleThreshold().domain(BIN_CUTOFFS).range(BIN_COLORS);
    return v => (isNumeric(v) ? scale(+v) : '#f2f2f2');
  }, []);

  // Pre-compute label-fit dimensions so the d3 effect can lay things out
  // and the React legend can use the same numbers.
  const layout = useMemo(() => {
    const containerW = (size.w || 600);
    const containerH = (size.h || 300);

    // Left margin: enough to fit the longest gene name / id, capped.
    let maxRowLabel = 0;
    for (const r of (rows || [])) {
      const w = measureText(r.name || r.id || '');
      if (w > maxRowLabel) maxRowLabel = w;
    }
    const leftMargin = Math.max(
      LEFT_MARGIN_MIN,
      Math.min(LEFT_MARGIN_MAX, Math.ceil(maxRowLabel) + 12)
    );

    // Header height: the rotated column label takes up labelWidth*sin(40°)
    // vertical pixels. Cap to keep things sane on pathologically long names.
    let maxColLabel = 0;
    for (const f of (fields || [])) {
      const lab = (axisLabels && axisLabels[f] && axisLabels[f].short) || f;
      const w = measureText(lab);
      if (w > maxColLabel) maxColLabel = w;
    }
    const sinR = Math.sin(Math.abs(HEADER_LABEL_ROTATION) * Math.PI / 180);
    const headerH = Math.max(
      HEADER_HEIGHT_MIN,
      Math.min(HEADER_HEIGHT_MAX, Math.ceil(maxColLabel * sinR) + 18)
    );

    const availPlotW = Math.max(0, containerW - leftMargin - RIGHT_MARGIN);
    const availPlotH = Math.max(0, containerH - headerH - BODY_BOTTOM);

    const nFields = (fields && fields.length) || 0;
    const nRows = (rows && rows.length) || 0;
    const fitCellW = nFields > 0 ? availPlotW / nFields : MIN_CELL_W;
    const fitCellH = nRows > 0 ? availPlotH / nRows : MIN_CELL_H;
    const cellW = Math.max(MIN_CELL_W, fitCellW);
    const cellH = Math.max(MIN_CELL_H, fitCellH);

    const innerW = cellW * nFields;
    const innerH = cellH * nRows;
    // Total width of the inner block (header + body share this width so the
    // outer container's horizontal scroll moves them together).
    const totalW = leftMargin + innerW + RIGHT_MARGIN;

    return { leftMargin, headerH, cellW, cellH, innerW, innerH, totalW, containerW, containerH };
  }, [rows, fields, axisLabels, size.w, size.h]);

  useEffect(() => {
    const headerSvg = d3.select(headerSvgRef.current);
    const bodySvg = d3.select(bodySvgRef.current);
    headerSvg.selectAll('*').remove();
    bodySvg.selectAll('*').remove();
    if (!fields || fields.length === 0 || !rows || rows.length === 0) return;

    const { leftMargin, headerH, cellW, cellH, innerW, innerH, totalW } = layout;

    // ---- header SVG: rotated column labels, study separator ticks ----
    headerSvg.attr('width', totalW).attr('height', headerH);
    const hg = headerSvg.append('g')
      .attr('transform', `translate(${leftMargin},${headerH})`);
    const labelGroup = hg.append('g').attr('class', 'exprviz-hm-collabels');
    let prevStudy = null;
    fields.forEach((f, i) => {
      const cx = i * cellW + cellW / 2;
      const label = (axisLabels && axisLabels[f] && axisLabels[f].short) || f;
      const t = labelGroup.append('text')
        .attr('class', 'exprviz-hm-collabel')
        .attr('transform', `translate(${cx},-6) rotate(${HEADER_LABEL_ROTATION})`)
        .attr('text-anchor', 'start')
        .attr('font-size', LABEL_FONT_SIZE)
        .text(label);
      const struct = axisLabels && axisLabels[f] && axisLabels[f].structured;
      if (struct) {
        const titleParts = [struct.studyTitle];
        if (struct.group) titleParts.push(`Group: ${struct.group}`);
        struct.factors && struct.factors.forEach(p => titleParts.push(`${p.name}: ${p.value}`));
        struct.characteristics && struct.characteristics.forEach(p => titleParts.push(`${p.name}: ${p.value}`));
        t.append('title').text(titleParts.join('\n'));
      }
      // Tick marks at study boundaries inside the header so groupings stay
      // visible even after a horizontal scroll.
      const sid = studyIdOfField(f);
      if (i > 0 && sid !== prevStudy) {
        hg.append('line')
          .attr('x1', i * cellW).attr('x2', i * cellW)
          .attr('y1', -4).attr('y2', 0)
          .attr('stroke', '#666').attr('stroke-width', 1);
      }
      prevStudy = sid;
    });

    // ---- body SVG ----
    const bodyH = innerH + BODY_BOTTOM;
    bodySvg.attr('width', totalW).attr('height', bodyH);
    const g = bodySvg.append('g').attr('transform', `translate(${leftMargin},0)`);

    // Vertical separators between studies — full height.
    prevStudy = null;
    fields.forEach((f, i) => {
      const sid = studyIdOfField(f);
      if (i > 0 && sid !== prevStudy) {
        g.append('line')
          .attr('class', 'exprviz-hm-study-sep')
          .attr('x1', i * cellW).attr('x2', i * cellW)
          .attr('y1', 0).attr('y2', innerH)
          .attr('stroke', '#fff').attr('stroke-width', 2);
      }
      prevStudy = sid;
    });

    // ---- cells ----
    const cellsGroup = g.append('g').attr('class', 'exprviz-hm-cells');
    // Hover outline lives in its own <g> so cell event handlers can update
    // it imperatively without re-running this effect.
    const overlayGroup = g.append('g').attr('class', 'exprviz-hm-overlay');
    const showHover = (row, field, mx, my, value) => {
      const ax = axisLabels && axisLabels[field] && axisLabels[field].structured;
      const info = fieldInfo && fieldInfo[field];
      setTooltip({
        x: mx + 12,
        y: my + 12,
        gene: { id: row.id, name: row.name },
        value,
        study: (ax && ax.studyTitle) || (info && info.studyDescription) || '',
        group: (ax && ax.group) || (info && info.group) || '',
        replicates: info && info.replicates,
        factors: (ax && ax.factors) || (info && info.factors ? Object.entries(info.factors).map(([name, value]) => ({ name, value })) : []),
        characteristics: (ax && ax.characteristics) || (info && info.characteristics ? Object.entries(info.characteristics).map(([name, value]) => ({ name, value })) : [])
      });
      if (onHoverRow) onHoverRow(row.id);
    };
    const clearHover = () => {
      overlayGroup.selectAll('*').remove();
      setTooltip(null);
      if (onHoverRow) onHoverRow(null);
    };

    const cellInnerW = Math.max(0.5, cellW - CELL_GAP);
    const cellInnerH = Math.max(0.5, cellH - CELL_GAP);
    rows.forEach((row, ri) => {
      const rg = cellsGroup.append('g')
        .attr('class', 'exprviz-hm-row')
        .attr('data-id', row.id)
        .attr('transform', `translate(0, ${ri * cellH})`);
      fields.forEach((f, ci) => {
        const v = row[f];
        const numeric = isNumeric(v);
        const fill = colorOfValue(v);
        const rect = rg.append('rect')
          .attr('x', ci * cellW).attr('y', 0)
          .attr('width', cellInnerW).attr('height', cellInnerH)
          .attr('fill', fill).attr('stroke', 'none');
        rect.on('pointerenter pointermove', (event) => {
          overlayGroup.selectAll('*').remove();
          overlayGroup.append('rect')
            .attr('x', ci * cellW).attr('y', ri * cellH)
            .attr('width', cellInnerW).attr('height', cellInnerH)
            .attr('fill', 'none')
            .attr('stroke', '#d62728').attr('stroke-width', 1.5)
            .attr('pointer-events', 'none');
          showHover(row, f, event.clientX, event.clientY, numeric ? +v : null);
        });
        rect.on('pointerleave', clearHover);
      });
    });

    // ---- row labels (always rendered: cellH >= MIN_CELL_H = 20) ----
    const labels = g.append('g').attr('class', 'exprviz-hm-rowlabels');
    rows.forEach((row, ri) => {
      labels.append('text')
        .attr('x', -6)
        .attr('y', ri * cellH + cellH / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', Math.min(LABEL_FONT_SIZE, cellH - 2))
        .text(row.name || row.id);
    });
  }, [rows, fields, axisLabels, fieldInfo, layout, colorOfValue, onHoverRow]);

  // Inner block width matches the SVG width so when content is wider than
  // the container, the outer container scrolls horizontally and both
  // header + body translate together (col labels stay aligned with cells).
  const innerStyle = { width: layout.totalW || '100%' };

  return (
    <div className="exprviz-hm-container" ref={containerRef}>
      <div className="exprviz-hm-inner" ref={innerRef} style={innerStyle}>
        <div className="exprviz-hm-header">
          <svg ref={headerSvgRef}/>
        </div>
        <div className="exprviz-hm-body" ref={bodyScrollRef}>
          <svg ref={bodySvgRef}/>
        </div>
      </div>
      <Legend/>
      {tooltip && (
        <div
          className="exprviz-pc-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div>
            <span className="exprviz-pc-tip-key">{tooltip.gene.id}</span>
            {tooltip.gene.name ? <> · {tooltip.gene.name}</> : null}
          </div>
          <div>
            <span className="exprviz-pc-tip-key">Value:</span> {tooltip.value == null ? '—' : fmt(tooltip.value)}
          </div>
          {tooltip.study && (
            <>
              <div className="exprviz-pc-tip-section">Study</div>
              <div className="exprviz-pc-tip-row">{tooltip.study}</div>
              {tooltip.group && (
                <div className="exprviz-pc-tip-row">
                  <span className="exprviz-pc-tip-key">Group:</span> {tooltip.group}
                  {tooltip.replicates ? ` (${tooltip.replicates} rep${tooltip.replicates === 1 ? '' : 's'})` : ''}
                </div>
              )}
            </>
          )}
          {tooltip.factors && tooltip.factors.length > 0 && (
            <>
              <div className="exprviz-pc-tip-section">Factors</div>
              {tooltip.factors.map((p, i) => (
                <div key={`f${i}`} className="exprviz-pc-tip-row">
                  <span className="exprviz-pc-tip-key">{p.name}:</span> {p.value}
                </div>
              ))}
            </>
          )}
          {tooltip.characteristics && tooltip.characteristics.length > 0 && (
            <>
              <div className="exprviz-pc-tip-section">Characteristics</div>
              {tooltip.characteristics.map((p, i) => (
                <div key={`c${i}`} className="exprviz-pc-tip-row">
                  <span className="exprviz-pc-tip-key">{p.name}:</span> {p.value}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// 5-bin discrete legend, positioned in the top-right of the heatmap pane.
// Lives outside the scroll container so it's always visible regardless of
// where the user has scrolled.
const Legend = () => (
  <div className="exprviz-hm-legend" title="Expression bins. Edit BIN_CUTOFFS / BIN_COLORS in HeatmapPlot.js to retune.">
    {BIN_COLORS.map((color, i) => {
      const lo = i === 0 ? null : BIN_CUTOFFS[i - 1];
      const hi = i === BIN_CUTOFFS.length ? null : BIN_CUTOFFS[i];
      let label;
      if (lo == null) label = `< ${hi}`;
      else if (hi == null) label = `≥ ${lo}`;
      else label = `${lo}–${hi}`;
      return (
        <div className="exprviz-hm-legend-bin" key={i}>
          <span className="exprviz-hm-legend-swatch" style={{ background: color }}/>
          <span className="exprviz-hm-legend-label">{label}</span>
        </div>
      );
    })}
  </div>
);

export default HeatmapPlot;
