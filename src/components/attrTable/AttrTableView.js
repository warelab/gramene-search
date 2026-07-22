import React, { useMemo, useState } from 'react';
import { connect } from 'redux-bundler-react';
import { Button, Alert, Spinner } from 'react-bootstrap';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { FieldTree } from '../exporter/FieldTree';
import '../exporter/styles.css';
import {
  organLabel, orderOrgans, extractExprAttrs,
  LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER, LEVEL_RANK, MARKER, STRESS,
  tpmBackground, fmtTpm, EXPR_ATTR_FIELDS,
} from '../exprAttrs/exprAttrCommon';
import { ATTR_TABLE_LIMITS, OFFERED_GROUPS, CORE_FIELDS } from '../../bundles/attrTable';
import './styles.css';

const { MAX_GENES } = ATTR_TABLE_LIMITS;

// expr_organ_level expands into one column per organ (the heatmap block); every
// other offered field maps to exactly one column.
const ORGAN_FIELD = 'expr_organ_level__attr_ss';

const DEFAULT_COL_DEF = {
  resizable: true,
  sortable: true,
  filter: false,
  suppressHeaderMenuButton: true
};

const WIDTHS = {
  id: 190, name: 130, system_name: 150, biotype: 120, taxon_id: 100, db_type: 100,
  alt_id: 180, synonyms: 160, description: 260, summary: 260,
  expr_class__attr_ss: 150, expr_tau__attr_f: 80, expr_max_tpm__attr_f: 100,
  expr_n_organs_detected__attr_i: 90,
  expr_activated_by__attr_ss: 190, expr_repressed_by__attr_ss: 190,
  expr_specific_to__attr_ss: 150, expr_enhanced_in__attr_ss: 150, expr_high_in__attr_ss: 150
};

const joinValues = p => (Array.isArray(p.value) ? p.value.map(v => String(v).replace(/_/g, ' ')).join(', ') : (p.value ?? ''));

// ↑activated / ↓repressed condition chips.
const chipRenderer = dir => ({ value }) => {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  if (!list.length) return null;
  return (
    <span>
      {list.map((c, i) => (
        <span
          key={i}
          style={{
            fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 2,
            marginRight: 3, whiteSpace: 'nowrap',
            background: STRESS[dir].bg, color: STRESS[dir].fg
          }}
        >{(dir === 'up' ? '↑' : '↓') + c}</span>
      ))}
    </span>
  );
};

// Slanted header for the narrow organ columns, so full tissue names stay
// legible without widening the heatmap. Clicking still sorts the column.
const RotatedHeader = props => {
  const onClick = e => props.progressSort && props.progressSort(e.shiftKey);
  return (
    <div className="attrtable-rot-header" title={props.displayName} onClick={onClick}>
      <span>{props.displayName}</span>
    </div>
  );
};

const AttrTableViewCmp = props => {
  const {
    attrTable, fieldCatalog, fieldCatalogByName,
    doToggleAttrTableField, doBulkSetAttrTableFields, doResetAttrTableFields
  } = props;
  const [showColumns, setShowColumns] = useState(false);
  const [fieldQuery, setFieldQuery] = useState('');

  const { docs, total, truncated, status, error, visibleFields } = attrTable;
  const visibleSet = useMemo(() => new Set(visibleFields), [visibleFields]);

  // Rows + the organ union and TPM range the heatmap needs.
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
      return { ...d, _organ: a.organLevels, _specific: a.specificTo, _enhanced: a.enhancedIn };
    });
    return {
      rows: out,
      organs: orderOrgans(organSet),
      tpmRange: { min: tpmMin === Infinity ? 0 : tpmMin, max: tpmMax === -Infinity ? 0 : tpmMax }
    };
  }, [docs]);

  // Only the Core identifiers + Expression attributes groups are offered, in
  // catalog order. Falls back to the built-in lists until the catalog loads.
  const orderedFields = useMemo(() => {
    const groups = (fieldCatalog && fieldCatalog.groups) || [];
    const out = [];
    OFFERED_GROUPS.forEach(gid => {
      const g = groups.find(x => x.id === gid);
      if (g && g.fields) out.push(...g.fields);
    });
    return out.length ? out : [...CORE_FIELDS, ...EXPR_ATTR_FIELDS];
  }, [fieldCatalog]);

  const pickerCatalog = useMemo(() => {
    if (!fieldCatalog || !fieldCatalog.groups) return null;
    return { ...fieldCatalog, groups: fieldCatalog.groups.filter(g => OFFERED_GROUPS.includes(g.id)) };
  }, [fieldCatalog]);

  const columnDefs = useMemo(() => {
    const labelOf = f => ((fieldCatalogByName && fieldCatalogByName[f] && fieldCatalogByName[f].label) || f);
    const cols = [];

    orderedFields.forEach(f => {
      if (!visibleSet.has(f)) return;
      const headerName = labelOf(f);
      const width = WIDTHS[f] || 150;

      if (f === ORGAN_FIELD) {
        organs.forEach(o => cols.push({
          // No ':' in colId — ag-grid uses colId in internal CSS selectors, where
          // a colon is a metacharacter and silently breaks the column.
          colId: `organ_${o}`,
          headerName: organLabel(o),
          headerComponent: RotatedHeader,
          headerClass: 'attrtable-organ-header',
          cellClass: 'attrtable-organ-cell',
          headerTooltip: organLabel(o),
          width: 22,
          minWidth: 18,
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
            const style = { background: p.value ? (LEVEL_COLOR[p.value] || 'transparent') : 'transparent' };
            if (p.data && p.data._specific.has(o)) style.boxShadow = `inset 0 0 0 2px ${MARKER}`;
            else if (p.data && p.data._enhanced.has(o)) style.boxShadow = `inset 0 0 0 1px ${MARKER}`;
            return style;
          }
        }));
        return;
      }

      if (f === 'expr_max_tpm__attr_f') {
        cols.push({
          colId: f, field: f, headerName, width, type: 'numericColumn',
          valueFormatter: p => fmtTpm(p.value),
          cellStyle: p => ({ background: tpmBackground(p.value, tpmRange) })
        });
        return;
      }
      if (f === 'expr_tau__attr_f') {
        cols.push({
          colId: f, field: f, headerName, width, type: 'numericColumn',
          valueFormatter: p => (Number.isFinite(p.value) ? p.value.toFixed(3) : '')
        });
        return;
      }
      if (f === 'expr_activated_by__attr_ss' || f === 'expr_repressed_by__attr_ss') {
        cols.push({
          colId: f, field: f, headerName, width, sortable: false,
          valueFormatter: () => '',
          cellRenderer: chipRenderer(f === 'expr_activated_by__attr_ss' ? 'up' : 'down')
        });
        return;
      }

      cols.push({
        colId: f, field: f, headerName, headerTooltip: f, width,
        pinned: (f === 'id' || f === 'name') ? 'left' : undefined,
        valueFormatter: joinValues
      });
    });

    return cols;
  }, [orderedFields, visibleSet, organs, tpmRange, fieldCatalogByName]);

  const shown = rows.length;
  const loading = status === 'loading';
  const organShown = visibleSet.has(ORGAN_FIELD);

  return (
    <div className="attrtable-view">
      <div className="attrtable-toolbar">
        <div className="attrtable-status">
          {loading && <Spinner animation="border" size="sm" className="mr-2" />}
          <strong>{shown.toLocaleString()}</strong> gene{shown === 1 ? '' : 's'}
          {total > 0 && <> of <strong>{total.toLocaleString()}</strong></>}
          {loading && ' — loading…'}
        </div>
        {organShown && (
          <div className="attrtable-legend" title="expression level">
            {LEVEL_ORDER.map(lv => (
              <span key={lv} title={LEVEL_LABEL[lv]} style={{ background: LEVEL_COLOR[lv] }} />
            ))}
          </div>
        )}
        <Button size="sm" variant={showColumns ? 'primary' : 'outline-secondary'}
                onClick={() => setShowColumns(v => !v)}>
          Columns ({columnDefs.length})
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
          <div className="attrtable-columns-head">
            <input
              type="search"
              className="form-control form-control-sm attrtable-field-search"
              placeholder="Search fields…"
              value={fieldQuery}
              onChange={e => setFieldQuery(e.target.value)}
            />
            <Button size="sm" variant="link" onClick={doResetAttrTableFields}>Reset</Button>
          </div>
          {pickerCatalog
            ? (
              <FieldTree
                catalog={pickerCatalog}
                selectedFields={visibleFields}
                onToggle={doToggleAttrTableField}
                onBulkSet={doBulkSetAttrTableFields}
                query={fieldQuery}
              />
            )
            : <div className="exporter-panel-empty">Loading field catalog…</div>}
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <div className="attrtable-empty"><em>No genes to show.</em></div>
      ) : columnDefs.length === 0 ? (
        <div className="attrtable-empty"><em>No columns selected — pick some under “Columns”.</em></div>
      ) : (
        <div className={`ag-theme-quartz attrtable-aggrid${organShown ? ' attrtable-tall-header' : ''}`}>
          <AgGridReact
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            animateRows={false}
            suppressFieldDotNotation={true}
            suppressDragLeaveHidesColumns={true}
            tooltipShowDelay={300}
            rowHeight={22}
            headerHeight={organShown ? 92 : 28}
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
  'doResetAttrTableFields',
  AttrTableViewCmp
);
