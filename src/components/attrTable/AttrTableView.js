import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  tpmBackground, fmtTpm,
} from '../exprAttrs/exprAttrCommon';
import { ATTR_TABLE_LIMITS } from '../../bundles/attrTable';
import './styles.css';

const { MAX_GENES } = ATTR_TABLE_LIMITS;

// expr_organ_level expands into one column per organ (the heatmap block).
const ORGAN_FIELD = 'expr_organ_level__attr_ss';
// The two stress fields render as a single merged column.
const STRESS_UP = 'expr_activated_by__attr_ss';
const STRESS_DOWN = 'expr_repressed_by__attr_ss';
const STRESS_COL = 'stress';

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
  expr_specific_to__attr_ss: 150, expr_enhanced_in__attr_ss: 150, expr_high_in__attr_ss: 150
};

const joinValues = p => (Array.isArray(p.value) ? p.value.map(v => String(v).replace(/_/g, ' ')).join(', ') : (p.value ?? ''));

const StressChip = ({ c, dir }) => (
  <span style={{
    fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 2,
    marginRight: 3, whiteSpace: 'nowrap', background: STRESS[dir].bg, color: STRESS[dir].fg
  }}>{(dir === 'up' ? '↑' : '↓') + c}</span>
);

// Merged ↑activated / ↓repressed renderer; the two directions are shown per the
// picker (a column exists if either field is selected).
const stressRenderer = (showUp, showDown) => ({ data }) => {
  const up = showUp && Array.isArray(data && data[STRESS_UP]) ? data[STRESS_UP] : [];
  const down = showDown && Array.isArray(data && data[STRESS_DOWN]) ? data[STRESS_DOWN] : [];
  if (!up.length && !down.length) return null;
  return (
    <span>
      {up.map((c, i) => <StressChip key={`u${i}`} c={c} dir="up" />)}
      {down.map((c, i) => <StressChip key={`d${i}`} c={c} dir="down" />)}
    </span>
  );
};

// Vertical header for the narrow organ columns, so full tissue names stay
// legible without widening the heatmap. Clicking still sorts the column, and a
// rotated sort arrow is drawn before the label (the default ag-grid sort UI is
// replaced by this custom header, so we render our own indicator). The arrow
// sits in the -90°-rotated span, so a → (asc) renders pointing up and a
// ← (desc) pointing down.
const RotatedHeader = props => {
  const [sort, setSort] = useState(props.column.getSort ? props.column.getSort() : null);
  useEffect(() => {
    const col = props.column;
    const onSort = () => setSort(col.getSort ? col.getSort() : null);
    col.addEventListener('sortChanged', onSort);
    onSort();
    return () => col.removeEventListener('sortChanged', onSort);
  }, [props.column]);
  const onClick = e => props.progressSort && props.progressSort(e.shiftKey);
  const arrow = sort === 'asc' ? '→ ' : sort === 'desc' ? '← ' : '';
  return (
    <div className="attrtable-rot-header" title={props.displayName} onClick={onClick}>
      <span>{arrow}{props.displayName}</span>
    </div>
  );
};

const AttrTableViewCmp = props => {
  const {
    attrTable, fieldCatalog, fieldCatalogByName,
    doToggleAttrTableField, doBulkSetAttrTableFields, doResetAttrTableFields,
    doAcceptGrameneSuggestion
  } = props;
  const [showColumns, setShowColumns] = useState(false);
  const [fieldQuery, setFieldQuery] = useState('');
  const [popover, setPopover] = useState(null);
  const popRef = useRef(null);

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

  // Only the Core identifiers + Expression attributes groups are offered.
  const pickerCatalog = useMemo(() => {
    if (!fieldCatalog || !fieldCatalog.groups) return null;
    return { ...fieldCatalog, groups: fieldCatalog.groups.filter(g => ['core', 'exprattrs'].includes(g.id)) };
  }, [fieldCatalog]);

  const labelOf = f => ((fieldCatalogByName && fieldCatalogByName[f] && fieldCatalogByName[f].label) || f);

  // Columns follow the selected-field order (so the default order is honoured),
  // expanding organ_level into the heatmap block and merging the two stress
  // fields into one column.
  const columnDefs = useMemo(() => {
    const cols = [];
    let stressDone = false;

    visibleFields.forEach(f => {
      if (f === ORGAN_FIELD) {
        organs.forEach((o, i) => {
          const last = i === organs.length - 1 ? ' attrtable-organ-last' : '';
          cols.push({
            // No ':' in colId — ag-grid uses colId in internal CSS selectors,
            // where a colon is a metacharacter and silently breaks the column.
            colId: `organ_${o}`,
            headerName: organLabel(o),
            headerComponent: RotatedHeader,
            headerClass: `attrtable-organ-header${last}`,
            cellClass: `attrtable-organ-cell${last}`,
            headerTooltip: organLabel(o),
            width: 22,
            minWidth: 18,
            valueGetter: p => (p.data && p.data._organ[o]) || '',
            valueFormatter: () => '',
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
          });
        });
        return;
      }

      if (f === STRESS_UP || f === STRESS_DOWN) {
        if (stressDone) return;
        stressDone = true;
        cols.push({
          colId: STRESS_COL,
          headerName: 'Activated/Repressed by condition',
          width: 240,
          sortable: false,
          valueGetter: () => '',
          cellRenderer: stressRenderer(visibleSet.has(STRESS_UP), visibleSet.has(STRESS_DOWN))
        });
        return;
      }

      if (f === 'expr_max_tpm__attr_f') {
        cols.push({
          colId: f, field: f, headerName: labelOf(f), width: WIDTHS[f] || 100, type: 'numericColumn',
          valueFormatter: p => fmtTpm(p.value),
          cellStyle: p => ({ background: tpmBackground(p.value, tpmRange) })
        });
        return;
      }
      if (f === 'expr_tau__attr_f') {
        cols.push({
          colId: f, field: f, headerName: labelOf(f), width: WIDTHS[f] || 80, type: 'numericColumn',
          valueFormatter: p => (Number.isFinite(p.value) ? p.value.toFixed(3) : '')
        });
        return;
      }

      cols.push({
        colId: f, field: f, headerName: labelOf(f), headerTooltip: f, width: WIDTHS[f] || 150,
        pinned: (f === 'id' || f === 'name') ? 'left' : undefined,
        valueFormatter: joinValues
      });
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFields, visibleSet, organs, tpmRange, fieldCatalogByName]);

  // Build the click-popover for a cell: a title (the column meaning) and one
  // filterable item per value. Each item carries the fq_field / fq_value the
  // "add filter" button hands to doAcceptGrameneSuggestion.
  const buildCellPopover = (colId, data) => {
    if (!data) return null;
    const mk = (text, fqField, fqValue, category, name) => ({ text, fqField, fqValue, category, name: name || text });

    if (colId === 'id') {
      return { title: 'Gene ID', items: [mk(data.id, 'id', data.id, 'Gene', data.id)] };
    }
    if (colId === STRESS_COL) {
      const items = [];
      (data[STRESS_UP] || []).forEach(c => items.push(mk('↑ ' + c, STRESS_UP, c, 'Activated by', 'activated by ' + c)));
      (data[STRESS_DOWN] || []).forEach(c => items.push(mk('↓ ' + c, STRESS_DOWN, c, 'Repressed by', 'repressed by ' + c)));
      return { title: 'Activated/Repressed by condition', items };
    }
    if (colId.startsWith('organ_')) {
      const organ = colId.slice(6);
      const lvl = data._organ && data._organ[organ];
      if (!lvl) return { title: 'Expression level by organ', items: [] };
      const label = `${organLabel(organ)}: ${LEVEL_LABEL[lvl] || lvl}`;
      return { title: 'Expression level by organ', items: [mk(label, ORGAN_FIELD, `${organ}:${lvl}`, 'Expression', label)] };
    }
    if (colId === 'expr_max_tpm__attr_f') {
      const v = data.expr_max_tpm__attr_f;
      if (!Number.isFinite(+v)) return { title: labelOf(colId), items: [] };
      return { title: labelOf(colId), items: [mk(`≥ ${fmtTpm(+v)} TPM`, colId, `[${v} TO *]`, 'Max TPM', `Max TPM ≥ ${fmtTpm(+v)}`)] };
    }
    if (colId === 'expr_tau__attr_f') {
      const v = data.expr_tau__attr_f;
      if (!Number.isFinite(+v)) return { title: labelOf(colId), items: [] };
      return { title: labelOf(colId), items: [mk(`≥ ${(+v).toFixed(3)}`, colId, `[${v} TO *]`, 'Tau', `tau ≥ ${(+v).toFixed(3)}`)] };
    }
    // Generic (Expression class, and any core / added attribute).
    const label = labelOf(colId);
    const raw = data[colId];
    const vals = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : []);
    return { title: label, items: vals.map(v => mk(String(v).replace(/_/g, ' '), colId, v, label, String(v).replace(/_/g, ' '))) };
  };

  const onCellClicked = e => {
    const desc = buildCellPopover(e.column.getColId(), e.data);
    if (!desc || !desc.items.length) { setPopover(null); return; }
    const ev = e.event || {};
    setPopover({ x: ev.clientX || 0, y: ev.clientY || 0, title: desc.title, items: desc.items });
  };

  const addFilter = it => {
    doAcceptGrameneSuggestion({ fq_field: it.fqField, fq_value: it.fqValue, name: it.name, category: it.category });
    setPopover(null);
  };

  // Close the popover on outside-click or Escape. Registered after the opening
  // click, so that click can't immediately dismiss it.
  useEffect(() => {
    if (!popover) return;
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPopover(null); };
    const onKey = e => { if (e.key === 'Escape') setPopover(null); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover]);

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
            onCellClicked={onCellClicked}
          />
        </div>
      )}

      {popover && (
        <div
          ref={popRef}
          className="attrtable-popover"
          style={{
            left: Math.min(popover.x, window.innerWidth - 280),
            top: Math.min(popover.y, window.innerHeight - 32 - popover.items.length * 30)
          }}
        >
          <div className="attrtable-popover-title">{popover.title}</div>
          {popover.items.map((it, i) => (
            <div key={i} className="attrtable-popover-row">
              <span className="attrtable-popover-val">{it.text}</span>
              <button type="button" className="btn btn-sm btn-outline-primary attrtable-popover-btn"
                      onClick={() => addFilter(it)}>add filter</button>
            </div>
          ))}
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
  'doAcceptGrameneSuggestion',
  AttrTableViewCmp
);
