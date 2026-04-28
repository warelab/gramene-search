import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Parallel-coordinates plot with per-axis brushing and drag-to-reorder axes.
// - Axis labels are draggable horizontally; on drop, onReorder(newOrder) fires.
// - Brushes on axes intersect (AND): a row is "in" only when every active brush contains it.
// - Numeric fields use a linear or symlog scale; non-numeric values are skipped.

const MARGIN = { top: 100, right: 24, bottom: 24, left: 32 };
const LABEL_ROTATION = -40;
const BRUSH_WIDTH = 16;

function isNumeric(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return false;
  const n = +v;
  return Number.isFinite(n);
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Powers-of-10 tick values spanning [lo, hi]; includes 0 if the range crosses zero.
// Clamped to |v| >= 0.1 to keep low-magnitude tick labels from overlapping near 0.
const MIN_LOG_TICK = 0.1;
function logTickValues([lo, hi]) {
  const ticks = new Set();
  if (lo <= 0 && hi >= 0) ticks.add(0);
  if (hi >= MIN_LOG_TICK) {
    const start = Math.max(-1, Math.floor(Math.log10(lo > 0 ? lo : MIN_LOG_TICK)));
    const end = Math.ceil(Math.log10(hi));
    for (let p = start; p <= end; p++) {
      const v = Math.pow(10, p);
      if (v >= MIN_LOG_TICK && v <= hi) ticks.add(v);
    }
  }
  if (lo <= -MIN_LOG_TICK) {
    const start = Math.max(-1, Math.floor(Math.log10(hi < 0 ? -hi : MIN_LOG_TICK)));
    const end = Math.ceil(Math.log10(-lo));
    for (let p = start; p <= end; p++) {
      const v = -Math.pow(10, p);
      if (-v >= MIN_LOG_TICK && v >= lo) ticks.add(v);
    }
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

function logTickFormat(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 0.01 && a < 10000) return d3.format('~g')(v);
  return d3.format('.0e')(v);
}

const ParallelCoordsPlot = ({
  rows,
  fields,
  scale = 'linear',
  onBrushChange,
  onReorder,
  clearVersion = 0,
  hoveredId = null,
  axisLabels = null
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  // selections in data domain: { [field]: [lo, hi] }
  const selectionsRef = useRef({});
  const lastClearRef = useRef(0);
  // Track container size so the d3 render reruns when the user drags the
  // pane resizer (or when the window is resized). The values themselves
  // aren't read inside the effect — the effect always reads clientWidth/
  // clientHeight — but listing them in the deps array is what triggers it.
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Custom HTML tooltip for axis labels — gives us bold labels and structured
  // sections, which the native SVG <title> can't do.
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize((prev) => {
          if (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) return prev;
          return { w: width, h: height };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (clearVersion !== lastClearRef.current) {
      selectionsRef.current = {};
      lastClearRef.current = clearVersion;
      if (onBrushChange) onBrushChange({});
    }
    Object.keys(selectionsRef.current).forEach(f => {
      if (!fields || !fields.includes(f)) delete selectionsRef.current[f];
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!fields || fields.length === 0 || !rows || rows.length === 0) return;

    const el = containerRef.current;
    const width = (el && el.clientWidth) || 600;
    const height = (el && el.clientHeight) || 300;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Mutable order during drag — starts as a copy of fields.
    let order = fields.slice();
    const x = d3.scalePoint().range([0, innerW]).padding(0.5).domain(order);

    const yByField = {};
    let globalExt = null;
    if (scale === 'log') {
      const all = [];
      fields.forEach(f => {
        rows.forEach(r => {
          const v = r[f];
          if (isNumeric(v)) all.push(+v);
        });
      });
      globalExt = all.length ? d3.extent(all) : [0, 1];
    }
    fields.forEach(f => {
      if (scale === 'log') {
        yByField[f] = d3.scaleSymlog().domain(globalExt).range([innerH, 0]).nice();
      } else {
        const vals = rows.map(r => r[f]).filter(isNumeric).map(Number);
        const ext = vals.length ? d3.extent(vals) : [0, 1];
        yByField[f] = d3.scaleLinear().domain(ext).range([innerH, 0]).nice();
      }
    });

    function pathForRow(row, posOf) {
      const pts = order.map(f => {
        const v = row[f];
        if (!isNumeric(v)) return null;
        return [posOf(f), yByField[f](Number(v))];
      });
      return line(pts);
    }

    const line = d3.line()
      .defined(d => d != null && Number.isFinite(d[1]))
      .x(d => d[0])
      .y(d => d[1]);

    const linesG = g.append('g').attr('class', 'exprviz-pc-lines');
    const paths = linesG
      .selectAll('path')
      .data(rows)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-width', 1)
      .attr('data-id', d => d && d.id != null ? String(d.id) : null)
      .attr('d', row => pathForRow(row, f => x(f)));

    function isBrushedIn(row) {
      for (const f of order) {
        const sel = selectionsRef.current[f];
        if (!sel) continue;
        const v = row[f];
        if (!isNumeric(v)) return false;
        const n = Number(v);
        const [lo, hi] = sel;
        if (n < lo || n > hi) return false;
      }
      return true;
    }

    function applyBrushStyles() {
      const anyActive = Object.keys(selectionsRef.current).length > 0;
      paths
        .classed('exprviz-pc-line-in', d => !anyActive || isBrushedIn(d))
        .classed('exprviz-pc-line-out', d => anyActive && !isBrushedIn(d));
    }
    applyBrushStyles();

    // axis groups, keyed by field name so D3 can match them across reorders
    const axisG = g.selectAll('.exprviz-pc-axis')
      .data(order, d => d)
      .enter()
      .append('g')
      .attr('class', 'exprviz-pc-axis')
      .attr('transform', d => `translate(${x(d)},0)`);

    axisG.each(function(f) {
      const ax = d3.select(this);
      const axisGen = d3.axisLeft(yByField[f]);
      if (scale === 'log') {
        axisGen.tickValues(logTickValues(yByField[f].domain())).tickFormat(logTickFormat);
      } else {
        axisGen.ticks(5);
      }
      ax.call(axisGen);

      // Compact axis label. Hovering the label or its drag-handle rect shows
      // a custom HTML tooltip (rendered outside the SVG by React) that can
      // include bold labels and section headings.
      const labelInfo = (axisLabels && axisLabels[f])
        || { short: f.replace(/__expr$/, ''), structured: { studyTitle: f, group: '', factors: [], characteristics: [] } };
      const showTip = (event) => setTooltip({
        x: event.clientX,
        y: event.clientY,
        info: labelInfo.structured
      });
      const moveTip = (event) => setTooltip(t =>
        t ? { ...t, x: event.clientX, y: event.clientY } : null
      );
      const hideTip = () => setTooltip(null);

      ax.append('text')
        .attr('class', 'exprviz-pc-axis-label')
        .attr('x', 4).attr('y', -4)
        .attr('text-anchor', 'start')
        .attr('transform', `rotate(${LABEL_ROTATION}, 0, -4)`)
        .attr('fill', '#333')
        .style('font-size', '10px')
        .style('cursor', 'grab')
        .text(labelInfo.short)
        .on('mouseenter', showTip)
        .on('mousemove', moveTip)
        .on('mouseleave', hideTip);

      // hit area for grabbing — sits along the rotated label
      ax.append('rect')
        .attr('class', 'exprviz-pc-axis-handle')
        .attr('x', 0).attr('y', -11)
        .attr('width', 140).attr('height', 14)
        .attr('transform', `rotate(${LABEL_ROTATION}, 0, -4)`)
        .attr('fill', 'transparent')
        .style('cursor', 'grab')
        .on('mouseenter', showTip)
        .on('mousemove', moveTip)
        .on('mouseleave', hideTip);

      const brush = d3.brushY()
        .extent([[-BRUSH_WIDTH / 2, 0], [BRUSH_WIDTH / 2, innerH]])
        .on('brush end', (event) => {
          const s = event.selection;
          if (!s) {
            delete selectionsRef.current[f];
          } else {
            const y = yByField[f];
            const a = y.invert(s[0]);
            const b = y.invert(s[1]);
            selectionsRef.current[f] = [Math.min(a, b), Math.max(a, b)];
          }
          applyBrushStyles();
          // event.sourceEvent is null when brush.move is called programmatically
          // (e.g. when this effect re-runs and we restore prior selections).
          // Skipping that case avoids a re-render loop with the parent.
          if (event.type === 'end' && event.sourceEvent && onBrushChange) {
            onBrushChange({ ...selectionsRef.current });
          }
        });

      const brushG = ax.append('g').attr('class', 'exprviz-pc-brush').call(brush);

      const prior = selectionsRef.current[f];
      if (prior) {
        const y = yByField[f];
        const py0 = y(prior[1]);
        const py1 = y(prior[0]);
        if (Number.isFinite(py0) && Number.isFinite(py1)) {
          brushG.call(brush.move, [py0, py1]);
        }
      }
    });

    // Drag-to-reorder: while dragging, only the dragged axis moves and the
    // line segments connecting to it are recomputed. Other axes stay put.
    // The new order is computed once at drag end and emitted via onReorder.
    const drag = d3.drag()
      .container(function() { return g.node(); })
      .subject(function(event, d) { return { x: x(d), y: 0 }; })
      .on('start', function(event, d) {
        const axNode = this.parentNode;
        d3.select(axNode).raise().classed('exprviz-pc-axis-dragging', true);
        d3.select(axNode).select('.exprviz-pc-axis-label').style('cursor', 'grabbing');
        linesG.classed('exprviz-pc-lines-dragging', true);
      })
      .on('drag', function(event, d) {
        const axNode = this.parentNode;
        const newX = Math.max(0, Math.min(innerW, event.x));
        d3.select(axNode).attr('transform', `translate(${newX},0)`);
        paths.attr('d', row => pathForRow(row, f => f === d ? newX : x(f)));
      })
      .on('end', function(event, d) {
        const axNode = this.parentNode;
        const newX = Math.max(0, Math.min(innerW, event.x));
        d3.select(axNode).classed('exprviz-pc-axis-dragging', false);
        d3.select(axNode).select('.exprviz-pc-axis-label').style('cursor', 'grab');
        linesG.classed('exprviz-pc-lines-dragging', false);

        const newOrder = order.slice().sort((a, b) => {
          const xa = a === d ? newX : x(a);
          const xb = b === d ? newX : x(b);
          return xa - xb;
        });

        if (onReorder && !arraysEqual(newOrder, fields)) {
          // Snap the dragged axis to its target slot for the brief moment
          // before the parent re-renders with the new order.
          x.domain(newOrder);
          d3.select(axNode).attr('transform', `translate(${x(d)},0)`);
          paths.attr('d', row => pathForRow(row, f => x(f)));
          onReorder(newOrder);
        } else {
          // No order change — restore the dragged axis to its original slot.
          d3.select(axNode).attr('transform', `translate(${x(d)},0)`);
          paths.attr('d', row => pathForRow(row, f => x(f)));
        }
      });

    axisG.selectAll('.exprviz-pc-axis-label, .exprviz-pc-axis-handle').call(drag);
  }, [rows, fields, scale, onBrushChange, onReorder, clearVersion, axisLabels, size.w, size.h]);

  // Highlight the polyline matching the hovered row id without rebuilding the
  // SVG. Raises the highlighted path so it draws above its neighbors.
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (svg.empty()) return;
    const paths = svg.selectAll('.exprviz-pc-lines path');
    paths.classed('exprviz-pc-line-hover', false);
    if (hoveredId == null) return;
    const target = paths.filter(function() {
      return this.getAttribute('data-id') === String(hoveredId);
    });
    target.classed('exprviz-pc-line-hover', true).raise();
  }, [hoveredId, rows, fields, scale]);

  if (!fields || fields.length === 0) {
    return <div className="exprviz-plot-empty"><em>Select fields to plot.</em></div>;
  }

  return (
    <div ref={containerRef} className="exprviz-pc-container">
      <svg ref={svgRef} width="100%" height="100%" preserveAspectRatio="none"/>
      {tooltip && <AxisTooltip x={tooltip.x} y={tooltip.y} info={tooltip.info}/>}
    </div>
  );
};

// Position-fixed so it can escape the plot pane's clipping. Offset slightly
// from the cursor and clamped to the viewport so it never spills off-screen.
const AxisTooltip = ({ x, y, info }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x + 12, top: y + 12 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 12;
    let top = y + 12;
    if (left + w > vw - 4) left = Math.max(4, x - 12 - w);
    if (top + h > vh - 4) top = Math.max(4, y - 12 - h);
    setPos({ left, top });
  }, [x, y, info]);
  const { studyTitle, group, factors, characteristics } = info;
  return (
    <div ref={ref} className="exprviz-pc-tooltip" style={pos}>
      <div><span className="exprviz-pc-tip-key">Study:</span> {studyTitle}{group ? ` (${group})` : ''}</div>
      {factors.length > 0 && (
        <>
          <div className="exprviz-pc-tip-section">Factors</div>
          {factors.map((p, i) => (
            <div key={`f-${i}`} className="exprviz-pc-tip-row">
              <span className="exprviz-pc-tip-key">{p.name}:</span> {p.value}
            </div>
          ))}
        </>
      )}
      {characteristics.length > 0 && (
        <>
          <div className="exprviz-pc-tip-section">Characteristics</div>
          {characteristics.map((p, i) => (
            <div key={`c-${i}`} className="exprviz-pc-tip-row">
              <span className="exprviz-pc-tip-key">{p.name}:</span> {p.value}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default ParallelCoordsPlot;
