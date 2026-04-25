import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

// Minimal parallel-coordinates skeleton.
// Each selected field becomes one vertical axis. Each gene becomes one polyline.
// Numeric fields use a linear scale; non-numeric values are skipped for now.

const MARGIN = { top: 24, right: 24, bottom: 24, left: 32 };

function isNumeric(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return false;
  const n = +v;
  return Number.isFinite(n);
}

const ParallelCoordsPlot = ({ rows, fields }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
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

    const x = d3.scalePoint().range([0, innerW]).padding(0.5).domain(fields);

    const yByField = {};
    fields.forEach(f => {
      const vals = rows.map(r => r[f]).filter(isNumeric).map(Number);
      const ext = vals.length ? d3.extent(vals) : [0, 1];
      yByField[f] = d3.scaleLinear().domain(ext).range([innerH, 0]).nice();
    });

    const line = d3.line()
      .defined(d => d != null && Number.isFinite(d[1]))
      .x(d => d[0])
      .y(d => d[1]);

    g.append('g')
      .attr('class', 'exprviz-pc-lines')
      .selectAll('path')
      .data(rows)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-opacity', 0.25)
      .attr('stroke-width', 1)
      .attr('d', row => {
        const pts = fields.map(f => {
          const v = row[f];
          if (!isNumeric(v)) return null;
          return [x(f), yByField[f](Number(v))];
        });
        return line(pts);
      });

    fields.forEach(f => {
      const ax = g.append('g').attr('transform', `translate(${x(f)},0)`);
      ax.call(d3.axisLeft(yByField[f]).ticks(5));
      ax.append('text')
        .attr('y', -8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#333')
        .style('font-size', '10px')
        .text(f);
    });
  }, [rows, fields]);

  if (!fields || fields.length === 0) {
    return <div className="exprviz-plot-empty"><em>Select fields to plot.</em></div>;
  }

  return (
    <div ref={containerRef} className="exprviz-pc-container">
      <svg ref={svgRef} width="100%" height="100%" preserveAspectRatio="none"/>
    </div>
  );
};

export default ParallelCoordsPlot;
