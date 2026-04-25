import React, { useEffect, useMemo } from 'react';
import { connect } from 'redux-bundler-react';
import { Tabs, Tab, Button } from 'react-bootstrap';
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
    doSetExprVizActiveTaxon,
    doToggleExprVizFieldsModal,
    doFetchExprVizData
  } = props;

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
          const studies = pivot.data[tid] || [];
          const taxName = genomeName(grameneMaps, tid);
          return (
            <Tab
              key={tid}
              eventKey={tid}
              title={`${taxName} (${studies.length})`}
            >
              <TaxonPanel
                taxon={tid}
                studies={studies}
                tabState={exprViz.byTaxon[tid]}
                onOpenFields={() => doToggleExprVizFieldsModal(tid, true)}
                onLoad={() => doFetchExprVizData(tid)}
              />
            </Tab>
          );
        })}
      </Tabs>
      <FieldsModal/>
    </div>
  );
};

const TaxonPanel = ({ taxon, studies, tabState, onOpenFields, onLoad }) => {
  const selected = (tabState && tabState.selectedFields) || [];
  const rows = (tabState && tabState.rows) || [];
  const fetchInfo = (tabState && tabState.fetch) || { status: 'idle', total: 0 };

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
        <span className="exprviz-status">
          {rows.length}{fetchInfo.total ? ` / ${fetchInfo.total}` : ''} genes loaded
        </span>
      </div>
      <div className="exprviz-body">
        <div className="exprviz-plot">
          <ParallelCoordsPlot rows={rows} fields={selected}/>
        </div>
        <div className="exprviz-table">
          <ExprTable rows={rows} fields={selected}/>
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
  'doSetExprVizActiveTaxon',
  'doToggleExprVizFieldsModal',
  'doFetchExprVizData',
  ExprVizViewCmp
);
