import React, { useEffect, useMemo, useRef, useState } from 'react';
import { connect } from 'redux-bundler-react';
import { Tabs, Tab, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import FieldsModal from './FieldsModal';
import ExprTable, { buildFieldInfo } from './ExprTable';
import ParallelCoordsPlot from './ParallelCoordsPlot';
import HeatmapPlot from './HeatmapPlot';
import './styles.css';

function speciesTaxonId(tid) {
  const n = +tid;
  return n > 1000000 ? Math.floor(n / 1000) : n;
}

function genomeName(grameneMaps, tid) {
  if (!grameneMaps) return tid;
  const direct = grameneMaps[tid];
  if (direct && direct.display_name) return direct.display_name;
  const sp = grameneMaps[speciesTaxonId(tid)];
  if (sp && sp.display_name) return sp.display_name;
  return tid;
}

const ExprVizViewCmp = props => {
  const {
    exprVizPivot: pivot,
    exprViz,
    exprVizActiveTaxon: activeTaxon,
    grameneMaps,
    expressionStudies,
    expressionSamples,
    doSetExprVizActiveTaxon,
    doToggleExprVizFieldsModal,
    doFetchExprVizData
  } = props;

  const studiesFor = tid => {
    if (!expressionStudies) return [];
    return expressionStudies[tid] || expressionStudies[speciesTaxonId(tid)] || [];
  };

  const taxa = useMemo(() => {
    const ids = Object.keys(pivot.data || {});
    if (!grameneMaps) return ids;
    return ids.sort((a, b) => {
      const ma = grameneMaps[a] || grameneMaps[speciesTaxonId(a)];
      const mb = grameneMaps[b] || grameneMaps[speciesTaxonId(b)];
      return ((ma && ma.left_index) || 0) - ((mb && mb.left_index) || 0);
    });
  }, [pivot.data, grameneMaps]);

  useEffect(() => {
    if (taxa.length === 0) return;
    if (!activeTaxon || !taxa.includes(String(activeTaxon))) {
      doSetExprVizActiveTaxon(taxa[0]);
    }
  }, [taxa, activeTaxon, doSetExprVizActiveTaxon]);

  if (pivot.status === 'loading') {
    return <div className="exprviz-view"><em>Loading studies…</em></div>;
  }
  if (pivot.status === 'error') {
    return <div className="exprviz-view"><em>Error: {pivot.error}</em></div>;
  }
  if (taxa.length === 0) {
    return <div className="exprviz-view"><em>No expression studies for current results.</em></div>;
  }

  return (
    <div className="exprviz-view">
      <Tabs
        activeKey={activeTaxon || taxa[0]}
        onSelect={k => doSetExprVizActiveTaxon(k)}
        className="exprviz-tabs"
      >
        {taxa.map(tid => {
          const studies = studiesFor(tid);
          const taxName = genomeName(grameneMaps, tid);
          const geneCount = pivot.data[tid] || 0;
          return (
            <Tab
              key={tid}
              eventKey={tid}
              title={`${taxName} (${studies.length} studies · ${geneCount} genes)`}
            >
              <TaxonPanel
                taxon={tid}
                studies={studies}
                expressionSamples={expressionSamples}
                tabState={exprViz.byTaxon[tid]}
                onOpenFields={() => doToggleExprVizFieldsModal(tid, true)}
                onLoad={() => doFetchExprVizData(tid)}
                onReorder={(next) => props.doReorderExprVizFields(tid, next)}
                onAddRangeQuery={props.doAddGrameneRangeQuery}
              />
            </Tab>
          );
        })}
      </Tabs>
      <FieldsModal/>
    </div>
  );
};

// Compact axis labels for the parallel-coords plot. The raw Solr field name
// (e.g. "E_CURD_148_g5__expr") is uninformative; we prefer the assay's
// factor labels, falling back to "organism part" then to the group id.
// `full` is exposed via an SVG <title> so the user can hover to see study,
// group, and every factor/characteristic.
const AXIS_LABEL_MAX = 22;

function truncateLabel(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function compactAssayLabel(assay, group) {
  if (!assay) return group || '';
  const factorVals = (assay.factor || []).map(f => f && f.label).filter(Boolean);
  if (factorVals.length) return factorVals.join('; ');
  const chars = assay.characteristic || [];
  const organ = chars.find(c => c && c.type === 'organism part');
  if (organ && organ.label) return organ.label;
  const firstChar = chars.find(c => c && c.label);
  if (firstChar) return firstChar.label;
  return group || '';
}

function assayPairs(list) {
  return (list || [])
    .filter(x => x && x.label)
    .map(x => ({ name: x.type || '', value: x.label }));
}

function buildAxisLabels(fields, studies, expressionSamples) {
  const labels = {};
  if (!fields) return labels;
  const studyById = {};
  (studies || []).forEach(s => { if (s && s._id) studyById[s._id] = s; });
  const findAssay = (studyId, group) => {
    const arr = expressionSamples && expressionSamples[studyId];
    return arr ? arr.find(a => a.group === group) : null;
  };
  for (const f of fields) {
    const m = f.match(/^(.+?)_g(\d+)__expr$/);
    if (!m) {
      labels[f] = {
        short: truncateLabel(f.replace(/__expr$/, ''), AXIS_LABEL_MAX),
        structured: { studyTitle: f, group: '', factors: [], characteristics: [] }
      };
      continue;
    }
    const expId = m[1].replace(/_/g, '-');
    const group = 'g' + m[2];
    const assay = findAssay(expId, group);
    const study = studyById[expId];
    const studyName = (study && study.description) || expId;
    labels[f] = {
      short: truncateLabel(compactAssayLabel(assay, group), AXIS_LABEL_MAX),
      structured: {
        studyTitle: studyName,
        group,
        factors: assayPairs(assay && assay.factor),
        characteristics: assayPairs(assay && assay.characteristic)
      }
    };
  }
  return labels;
}

function rowMatchesSelections(row, selections) {
  for (const f of Object.keys(selections)) {
    const v = row[f];
    if (v == null || Array.isArray(v)) return false;
    const n = +v;
    if (!Number.isFinite(n)) return false;
    const [lo, hi] = selections[f];
    if (n < lo || n > hi) return false;
  }
  return true;
}

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a < 0.001 || a >= 1e6)) return n.toExponential(3);
  return Number(n.toFixed(4)).toString();
}

function tsvCell(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(',');
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/[\t\r\n]+/g, ' ');
}

// Mirror the on-screen table header in the TSV: one row per metadata level
// the table is showing (Study, then one row per distinct factor type, then
// one row per distinct characteristic type), followed by the leaf header
// (Gene ID / Name / per-sample group). The first two columns are repurposed
// to carry the row category and the row's specific name, matching the
// pinned-column labels in ExprTable.
function downloadTsv(filename, rows, fields, studies, expressionSamples) {
  const cols = ['id', 'name', ...fields];
  const fieldInfo = buildFieldInfo(fields, studies, expressionSamples);

  const factorTypes = new Set();
  const charTypes = new Set();
  for (const f of fields) {
    const info = fieldInfo[f];
    if (!info) continue;
    Object.keys(info.factors || {}).forEach(t => factorTypes.add(t));
    Object.keys(info.characteristics || {}).forEach(t => charTypes.add(t));
  }
  const factorTypeList = Array.from(factorTypes).sort();
  const charTypeList = Array.from(charTypes).sort();

  const metaRow = (cat, label, getValue) => {
    const cells = [cat, label];
    for (const f of fields) cells.push(tsvCell(getValue(fieldInfo[f] || {})));
    return cells.join('\t');
  };

  const lines = [];
  lines.push(metaRow('Study', 'Title', info => info.studyDescription || ''));
  for (const t of factorTypeList) {
    lines.push(metaRow('Factor', t, info => (info.factors && info.factors[t]) || ''));
  }
  for (const t of charTypeList) {
    lines.push(metaRow('Characteristic', t, info => (info.characteristics && info.characteristics[t]) || ''));
  }
  // Leaf header — column ids for the data rows.
  lines.push(['Gene ID', 'Name', ...fields.map(f => {
    const info = fieldInfo[f];
    return (info && info.group) || f.replace(/__expr$/, '');
  })].join('\t'));

  for (const r of rows) lines.push(cols.map(c => tsvCell(r[c])).join('\t'));

  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TaxonPanel = ({ taxon, studies, expressionSamples, tabState, onOpenFields, onLoad, onReorder, onAddRangeQuery }) => {
  const selected = (tabState && tabState.selectedFields) || [];
  const rows = (tabState && tabState.rows) || [];
  const fetchInfo = (tabState && tabState.fetch) || { status: 'idle', total: 0 };
  const [scale, setScale] = useState('linear');
  const [vizMode, setVizMode] = useState('heatmap'); // 'parallel' | 'heatmap'
  const [selections, setSelections] = useState({});
  const [clearVersion, setClearVersion] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [plotHeight, setPlotHeight] = useState(320);
  // Mirror of the table's currently displayed (post-sort, post-filter) rows.
  // When the user clicks a column header to sort, ag-grid resorts and emits
  // modelUpdated; we capture that order here so the heatmap below renders
  // in the same order. Null until the table has emitted at least once.
  const [tableOrder, setTableOrder] = useState(null);
  const resizeStateRef = useRef(null);

  // Drag the horizontal separator between the plot and the table to retune
  // their relative sizes. Bounded so neither pane disappears entirely.
  const startResize = (e) => {
    e.preventDefault();
    resizeStateRef.current = { startY: e.clientY, startHeight: plotHeight };
    const onMove = (ev) => {
      const s = resizeStateRef.current;
      if (!s) return;
      const next = Math.max(120, Math.min(1200, s.startHeight + (ev.clientY - s.startY)));
      setPlotHeight(next);
    };
    const onUp = () => {
      resizeStateRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const hasBrush = Object.keys(selections).length > 0;
  const filteredRows = useMemo(() => {
    if (!hasBrush) return rows;
    return rows.filter(r => rowMatchesSelections(r, selections));
  }, [rows, selections, hasBrush]);

  // Drop fields with no numeric data in the loaded rows so empty axes/columns
  // don't clutter the visualization. Selected-but-empty fields stay in the
  // underlying selection so a future load can repopulate them.
  const visibleFields = useMemo(() => {
    if (rows.length === 0 || selected.length === 0) return selected;
    return selected.filter(f => rows.some(r => {
      const v = r[f];
      return v != null && !Array.isArray(v) && Number.isFinite(+v);
    }));
  }, [rows, selected]);

  const handleReorder = onReorder
    ? (newVisibleOrder) => {
        const visibleSet = new Set(newVisibleOrder);
        const hidden = selected.filter(f => !visibleSet.has(f));
        onReorder([...newVisibleOrder, ...hidden]);
      }
    : undefined;

  const axisLabels = useMemo(
    () => buildAxisLabels(visibleFields, studies, expressionSamples),
    [visibleFields, studies, expressionSamples]
  );

  const fieldInfo = useMemo(
    () => buildFieldInfo(visibleFields, studies, expressionSamples),
    [visibleFields, studies, expressionSamples]
  );

  useEffect(() => {
    if (rows.length === 0 && hasBrush) {
      setSelections({});
      setClearVersion(v => v + 1);
    }
  }, [rows.length, hasBrush]);

  return (
    <div className="exprviz-tab-panel">
      <div className="exprviz-toolbar">
        <Button size="sm" onClick={onOpenFields}>
          Select fields ({selected.length} selected, {studies.length} studies)
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={selected.length === 0 || fetchInfo.status === 'loading'}
          onClick={onLoad}
        >
          {fetchInfo.status === 'loading' ? 'Loading…' : 'Load data'}
        </Button>
        <ToggleButtonGroup
          type="radio"
          name={`exprviz-viz-${taxon}`}
          size="sm"
          value={vizMode}
          onChange={setVizMode}
        >
          <ToggleButton id={`exprviz-viz-${taxon}-hm`} value="heatmap" variant="outline-secondary" title="Heatmap: cell color encodes expression level; hover for sample metadata">Heatmap</ToggleButton>
          <ToggleButton id={`exprviz-viz-${taxon}-pc`} value="parallel" variant="outline-secondary" title="Parallel coordinates: one polyline per gene with brushable axes">Parallel</ToggleButton>
        </ToggleButtonGroup>
        {vizMode === 'parallel' && (
          <>
            <ToggleButtonGroup
              type="radio"
              name={`exprviz-scale-${taxon}`}
              size="sm"
              value={scale}
              onChange={setScale}
            >
              <ToggleButton id={`exprviz-scale-${taxon}-lin`} value="linear" variant="outline-secondary">Linear</ToggleButton>
              <ToggleButton id={`exprviz-scale-${taxon}-log`} value="log" variant="outline-secondary">Log</ToggleButton>
            </ToggleButtonGroup>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={!hasBrush}
              onClick={() => { setClearVersion(v => v + 1); setSelections({}); }}
            >
              Clear brushes
            </Button>
            <Button
              size="sm"
              variant="success"
              disabled={!hasBrush || !onAddRangeQuery}
              onClick={() => {
                const terms = Object.keys(selections).map(field => {
                  const [lo, hi] = selections[field];
                  return {
                    category: 'Expression',
                    name: `${field}: ${fmt(lo)}–${fmt(hi)}`,
                    fq_field: field,
                    fq_value: `[${lo} TO ${hi}]`
                  };
                });
                onAddRangeQuery(terms);
              }}
              title="Add brush ranges as an AND-conjunction filter on the search"
            >
              Apply as filter
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={filteredRows.length === 0 || visibleFields.length === 0}
          onClick={() => downloadTsv(`expression_${taxon}.tsv`, filteredRows, visibleFields, studies, expressionSamples)}
          title="Download the visible rows and columns as tab-delimited text"
        >
          Download TSV
        </Button>
        <span className="exprviz-status">
          {hasBrush ? `${filteredRows.length} of ${rows.length}` : rows.length}
          {fetchInfo.total ? ` / ${fetchInfo.total}` : ''} genes
          {hasBrush ? ' (brushed)' : ' loaded'}
        </span>
      </div>
      <div className="exprviz-body">
        <div className="exprviz-plot" style={{ height: plotHeight }}>
          {vizMode === 'heatmap' ? (
            <HeatmapPlot
              rows={tableOrder || filteredRows}
              fields={visibleFields}
              scale={scale}
              axisLabels={axisLabels}
              fieldInfo={fieldInfo}
              hoveredId={hoveredId}
              onHoverRow={setHoveredId}
            />
          ) : (
            <ParallelCoordsPlot
              rows={rows}
              fields={visibleFields}
              scale={scale}
              onBrushChange={setSelections}
              onReorder={handleReorder}
              clearVersion={clearVersion}
              hoveredId={hoveredId}
              axisLabels={axisLabels}
            />
          )}
        </div>
        <div
          className="exprviz-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize plot"
          onMouseDown={startResize}
          title="Drag to resize"
        />
        <div className="exprviz-table">
          <ExprTable
            rows={filteredRows}
            fields={visibleFields}
            onReorder={handleReorder}
            studies={studies}
            expressionSamples={expressionSamples}
            onHoverRow={setHoveredId}
            onDisplayedOrderChange={setTableOrder}
          />
        </div>
      </div>
    </div>
  );
};

export default connect(
  'selectExprViz',
  'selectExprVizPivot',
  'selectExprVizActiveTaxon',
  'selectGrameneMaps',
  'selectExpressionStudies',
  'selectExpressionSamples',
  'doSetExprVizActiveTaxon',
  'doToggleExprVizFieldsModal',
  'doFetchExprVizData',
  'doReorderExprVizFields',
  'doAddGrameneRangeQuery',
  ExprVizViewCmp
);
