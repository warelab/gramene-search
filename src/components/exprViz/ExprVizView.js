import React, { useEffect, useMemo, useState } from 'react';
import { connect } from 'redux-bundler-react';
import { Tabs, Tab, Button, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import FieldsModal from './FieldsModal';
import ExprTable from './ExprTable';
import ParallelCoordsPlot from './ParallelCoordsPlot';
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

const TaxonPanel = ({ taxon, studies, expressionSamples, tabState, onOpenFields, onLoad, onReorder, onAddRangeQuery }) => {
  const selected = (tabState && tabState.selectedFields) || [];
  const rows = (tabState && tabState.rows) || [];
  const fetchInfo = (tabState && tabState.fetch) || { status: 'idle', total: 0 };
  const [scale, setScale] = useState('linear');
  const [selections, setSelections] = useState({});
  const [clearVersion, setClearVersion] = useState(0);

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
        <span className="exprviz-status">
          {hasBrush ? `${filteredRows.length} of ${rows.length}` : rows.length}
          {fetchInfo.total ? ` / ${fetchInfo.total}` : ''} genes
          {hasBrush ? ' (brushed)' : ' loaded'}
        </span>
      </div>
      <div className="exprviz-body">
        <div className="exprviz-plot">
          <ParallelCoordsPlot
            rows={rows}
            fields={visibleFields}
            scale={scale}
            onBrushChange={setSelections}
            onReorder={handleReorder}
            clearVersion={clearVersion}
          />
        </div>
        <div className="exprviz-table">
          <ExprTable
            rows={filteredRows}
            fields={visibleFields}
            onReorder={handleReorder}
            studies={studies}
            expressionSamples={expressionSamples}
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
