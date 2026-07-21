import React, { useMemo, useState } from 'react';
import { connect } from 'redux-bundler-react';
import { Button, Alert, Spinner } from 'react-bootstrap';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { FieldTree } from '../exporter/FieldTree';
import '../exporter/styles.css';
import {
  abbrOrgan, organLabel, orderOrgans, extractExprAttrs,
  LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER, LEVEL_RANK, MARKER, STRESS,
  tpmBackground, fmtTpm, fmtClass,
} from '../exprAttrs/exprAttrCommon';
import { ATTR_TABLE_LIMITS } from '../../bundles/attrTable';
import './styles.css';

const { MAX_GENES } = ATTR_TABLE_LIMITS;

const DEFAULT_COL_DEF = {
  resizable: true,
  sortable: true,
  filter: false,
  suppressHeaderMenuButton: true
};

// ↑activated / ↓repressed condition chips, matching the tbrowse Expression zone.
const StressCell = ({ value }) => {
  const { up = [], down = [] } = value || {};
  if (!up.length && !down.length) return null;
  const chip = (c, dir, key) => (
    <span
      key={key}
      style={{
        fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 2,
        marginRight: 3, whiteSpace: 'nowrap',
        background: STRESS[dir].bg, color: STRESS[dir].fg
      }}
    >{(dir === 'up' ? '↑' : '↓') + c}</span>
  );
  return (
    <span>
      {up.map((c, i) => chip(c, 'up', `u${i}`))}
      {down.map((c, i) => chip(c, 'down', `d${i}`))}
    </span>
  );
};

const AttrTableViewCmp = props => {
  const {
    attrTable, fieldCatalog, fieldCatalogByName,
    doToggleAttrTableField, doBulkSetAttrTableFields
  } = props;
  const [showColumns, setShowColumns] = useState(false);
  const [fieldQuery, setFieldQuery] = useState('');

  const { docs, total, truncated, status, error, selectedFields } = attrTable;

  // Row objects + the organ union and TPM range needed to build the heatmap.
  const { rows, organs, tpmRange } = useMemo(() => {
    const organSet = new Set();
    let tpmMin = Infinity;
    let tpmMax = -Infinity;
    const out = (docs || []).map(d => {
      const a = extractExprAttrs(d);
      Object.keys(a.organLevels).forEach(o => organSet.add(o));
      if (a.maxTpm !== null) {
        if (a.maxTpm < tpmMin) tpmMin = a.maxTpm;
        if (a.maxTpm > tpmMax) tpmMax = a.maxTpm;
      }
      const row = {
        id: d.id,
        name: d.name,
        system_name: d.system_name,
        biotype: d.biotype,
        location: d.region ? `${d.region}:${d.start}-${d.end}` : '',
        _cls: fmtClass(a.cls) || '',
        _tau: a.tau,
        _maxTpm: a.maxTpm,
        _stress: { up: a.activatedBy, down: a.repressedBy },
        _organ: a.organLevels,
        _specific: a.specificTo,
        _enhanced: a.enhancedIn
      };
      (selectedFields || []).forEach(f => { row[f] = d[f]; });
      return row;
    });
    return {
      rows: out,
      organs: orderOrgans(organSet),
      tpmRange: { min: tpmMin === Infinity ? 0 : tpmMin, max: tpmMax === -Infinity ? 0 : tpmMax }
    };
  }, [docs, selectedFields]);

  const columnDefs = useMemo(() => {
    const cols = [
      { colId: 'id', field: 'id', headerName: 'Gene ID', pinned: 'left', width: 190 },
      { colId: 'name', field: 'name', headerName: 'Name', pinned: 'left', width: 130 },
      { colId: 'system_name', field: 'system_name', headerName: 'Species', width: 150 },
      { colId: 'biotype', field: 'biotype', headerName: 'Biotype', width: 120 },
      { colId: 'location', field: 'location', headerName: 'Location', width: 150 },
      { colId: '_cls', field: '_cls', headerName: 'Expression class', width: 150 },
      {
        colId: '_tau',
        field: '_tau',
        headerName: 'Tau',
        width: 80,
        type: 'numericColumn',
        valueFormatter: p => (Number.isFinite(p.value) ? p.value.toFixed(3) : '')
      },
      {
        colId: '_maxTpm',
        field: '_maxTpm',
        headerName: 'Max TPM',
        width: 100,
        type: 'numericColumn',
        valueFormatter: p => fmtTpm(p.value),
        cellStyle: p => ({ background: tpmBackground(p.value, tpmRange) })
      },
      {
        colId: '_stress',
        field: '_stress',
        headerName: 'Stress',
        width: 220,
        sortable: false,
        // The renderer draws the chips; the formatter just keeps ag-grid from
        // warning about an object-valued cell with no formatter.
        valueFormatter: () => '',
        cellRenderer: StressCell
      }
    ];

    // Per-organ heatmap: one narrow, colour-only column per organ.
    organs.forEach(o => {
      cols.push({
        // No ':' in colId — ag-grid uses colId in internal CSS selectors, where a
        // colon is a metacharacter and silently breaks rendering of the column.
        colId: `organ_${o}`,
        headerName: abbrOrgan(o),
        headerTooltip: organLabel(o),
        width: 46,
        valueGetter: p => (p.data && p.data._organ[o]) || '',
        valueFormatter: () => '', // colour carries the value
        tooltipValueGetter: p => {
          const lvl = p.data && p.data._organ[o];
          if (!lvl) return `${organLabel(o)}: not assayed`;
          const sp = p.data._specific.has(o) ? ' · specific' : (p.data._enhanced.has(o) ? ' · enhanced' : '');
          return `${organLabel(o)}: ${LEVEL_LABEL[lvl] || lvl}${sp}`;
        },
        comparator: (a, b) => (LEVEL_RANK[a] ?? -1) - (LEVEL_RANK[b] ?? -1),
        cellStyle: p => {
          const lvl = p.value;
          const style = { background: lvl ? (LEVEL_COLOR[lvl] || 'transparent') : 'transparent' };
          if (p.data && p.data._specific.has(o)) style.boxShadow = `inset 0 0 0 2px ${MARKER}`;
          else if (p.data && p.data._enhanced.has(o)) style.boxShadow = `inset 0 0 0 1px ${MARKER}`;
          return style;
        }
      });
    });

    // Extra attribute columns chosen from the field catalog.
    (selectedFields || []).forEach(f => {
      const meta = (fieldCatalogByName && fieldCatalogByName[f]) || {};
      cols.push({
        colId: f,
        field: f,
        headerName: meta.label || f,
        headerTooltip: f,
        width: 170,
        valueFormatter: p => (Array.isArray(p.value) ? p.value.join(', ') : (p.value ?? ''))
      });
    });

    return cols;
  }, [organs, selectedFields, fieldCatalogByName, tpmRange]);

  const shown = rows.length;
  const loading = status === 'loading';

  return (
    <div className="attrtable-view">
      <div className="attrtable-toolbar">
        <div className="attrtable-status">
          {loading && <Spinner animation="border" size="sm" className="mr-2" />}
          <strong>{shown.toLocaleString()}</strong> gene{shown === 1 ? '' : 's'}
          {total > 0 && <> of <strong>{total.toLocaleString()}</strong></>}
          {loading && ' — loading…'}
        </div>
        <div className="attrtable-legend" title="expression level">
          {LEVEL_ORDER.map(lv => (
            <span key={lv} title={LEVEL_LABEL[lv]} style={{ background: LEVEL_COLOR[lv] }} />
          ))}
        </div>
        <Button size="sm" variant={showColumns ? 'primary' : 'outline-secondary'}
                onClick={() => setShowColumns(v => !v)}>
          Columns{selectedFields.length ? ` (${selectedFields.length})` : ''}
        </Button>
      </div>

      {truncated && (
        <Alert variant="info" className="attrtable-notice">
          Showing the first {MAX_GENES.toLocaleString()} of {total.toLocaleString()} genes.
          Narrow your search to see the rest.
        </Alert>
      )}
      {error && <Alert variant="danger" className="attrtable-notice">Failed to load genes: {error}</Alert>}

      {showColumns && (
        <div className="attrtable-columns-panel">
          <input
            type="search"
            className="form-control form-control-sm attrtable-field-search"
            placeholder="Search fields…"
            value={fieldQuery}
            onChange={e => setFieldQuery(e.target.value)}
          />
          <FieldTree
            catalog={fieldCatalog}
            selectedFields={selectedFields}
            onToggle={doToggleAttrTableField}
            onBulkSet={doBulkSetAttrTableFields}
            query={fieldQuery}
          />
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <div className="attrtable-empty"><em>No genes to show.</em></div>
      ) : (
        <div className="ag-theme-quartz attrtable-aggrid">
          <AgGridReact
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            animateRows={false}
            suppressFieldDotNotation={true}
            suppressDragLeaveHidesColumns={true}
            tooltipShowDelay={300}
            rowHeight={22}
            headerHeight={26}
          />
        </div>
      )}
    </div>
  );
};

export default connect(
  'selectAttrTable',
  'selectFieldCatalog',
  'selectFieldCatalogByName',
  'doToggleAttrTableField',
  'doBulkSetAttrTableFields',
  AttrTableViewCmp
);
