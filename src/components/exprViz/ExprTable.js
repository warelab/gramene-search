import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

const baseColDefs = [
  { field: 'id', headerName: 'Gene ID', pinned: 'left', width: 160, suppressMovable: true },
  { field: 'name', headerName: 'Name', width: 140, suppressMovable: true }
];

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function buildFieldInfo(fields, studies, expressionSamples) {
  const info = {};
  if (!fields || !studies || !expressionSamples) return info;
  const wanted = new Set(fields);
  for (const study of studies) {
    const studyId = study._id;
    const samples = expressionSamples[studyId];
    if (!samples) continue;
    const byGroup = {};
    for (const s of samples) if (!byGroup[s.group]) byGroup[s.group] = s;
    for (const group of Object.keys(byGroup)) {
      const fieldName = `${studyId.replace(/-/g, '_')}_${group}__expr`;
      if (!wanted.has(fieldName)) continue;
      const sample = byGroup[group];
      const factors = {};
      (sample.factor || []).forEach(f => { factors[f.type] = f.label; });
      const characteristics = {};
      (sample.characteristic || []).forEach(c => {
        if (factors[c.type] != null) return;
        characteristics[c.type] = c.label;
      });
      info[fieldName] = {
        studyId,
        studyDescription: study.description || studyId,
        group,
        replicates: samples.filter(s => s.group === group).length,
        factors,
        characteristics
      };
    }
  }
  return info;
}

// Custom header: re-implements sort click + menu button so ag-grid's column
// drag/menu/filter still work, with an info icon as the popover trigger.
const HeaderWithInfo = (props) => {
  const { displayName, enableSorting, enableMenu, showColumnMenu, progressSort, column, info } = props;
  const [sort, setSort] = useState(column && column.getSort ? column.getSort() : null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!column || !column.addEventListener) return;
    const handler = () => setSort(column.getSort());
    column.addEventListener('sortChanged', handler);
    return () => column.removeEventListener('sortChanged', handler);
  }, [column]);

  const onSortClick = (event) => {
    if (enableSorting && progressSort) progressSort(event.shiftKey);
  };

  const onMenuClick = (event) => {
    event.stopPropagation();
    if (showColumnMenu && menuRef.current) showColumnMenu(menuRef.current);
  };

  const factorEntries = info ? Object.entries(info.factors || {}) : [];
  const charEntries = info ? Object.entries(info.characteristics || {}) : [];
  const popover = info ? (
    <Popover id={`exprviz-header-${info.studyId}-${info.group}`} className="exprviz-header-popover">
      <Popover.Header as="h6">{info.studyDescription}</Popover.Header>
      <Popover.Body>
        <div><strong>Study:</strong> {info.studyId}</div>
        <div><strong>Group:</strong> {info.group} ({info.replicates} {info.replicates === 1 ? 'rep' : 'reps'})</div>
        {factorEntries.length > 0 && (
          <div className="exprviz-header-section">
            <strong>Factors</strong>
            <ul>{factorEntries.map(([t, v]) => <li key={t}><em>{t}:</em> {v}</li>)}</ul>
          </div>
        )}
        {charEntries.length > 0 && (
          <div className="exprviz-header-section">
            <strong>Characteristics</strong>
            <ul>{charEntries.map(([t, v]) => <li key={t}><em>{t}:</em> {v}</li>)}</ul>
          </div>
        )}
      </Popover.Body>
    </Popover>
  ) : null;

  return (
    <div className="exprviz-header">
      <span
        className="exprviz-header-text"
        onClick={onSortClick}
        style={{ cursor: enableSorting ? 'pointer' : 'default' }}
      >
        {displayName}
        {sort === 'asc' && <span className="exprviz-header-sort"> ▲</span>}
        {sort === 'desc' && <span className="exprviz-header-sort"> ▼</span>}
      </span>
      {info && (
        <OverlayTrigger
          trigger={['hover', 'focus']}
          placement="bottom"
          overlay={popover}
          delay={{ show: 200, hide: 100 }}
        >
          <span
            className="exprviz-header-info"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            aria-label="More info"
          >ⓘ</span>
        </OverlayTrigger>
      )}
      {enableMenu && (
        <span
          ref={menuRef}
          className="exprviz-header-menu ag-icon ag-icon-menu"
          onClick={onMenuClick}
        />
      )}
    </div>
  );
};

const ExprTable = ({ rows, fields, onReorder, studies, expressionSamples }) => {
  const fieldInfo = useMemo(
    () => buildFieldInfo(fields, studies, expressionSamples),
    [fields, studies, expressionSamples]
  );

  const columnDefs = useMemo(() => {
    const expressionCols = (fields || []).map(f => ({
      field: f,
      headerName: f.replace(/__expr$/, ''),
      width: 160,
      suppressMovable: false,
      headerComponent: HeaderWithInfo,
      headerComponentParams: { info: fieldInfo[f] },
      valueFormatter: p => {
        const v = p.value;
        if (v == null) return '';
        if (Array.isArray(v)) return v.join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }
    }));
    return [...baseColDefs, ...expressionCols];
  }, [fields, fieldInfo]);

  const onColumnMoved = (e) => {
    if (!onReorder || !e.finished) return;
    const allCols = e.api.getAllGridColumns ? e.api.getAllGridColumns() : (e.columnApi && e.columnApi.getAllGridColumns && e.columnApi.getAllGridColumns());
    if (!allCols) return;
    const next = allCols
      .map(c => c.getColId())
      .filter(id => fields.includes(id));
    if (!arraysEqual(next, fields)) {
      onReorder(next);
    }
  };

  if (!rows || rows.length === 0) {
    return <div className="exprviz-table-empty"><em>No data loaded.</em></div>;
  }

  return (
    <div className="ag-theme-quartz exprviz-aggrid">
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ resizable: true, sortable: true, filter: true }}
        animateRows={false}
        suppressFieldDotNotation={true}
        suppressDragLeaveHidesColumns={true}
        onColumnMoved={onColumnMoved}
      />
    </div>
  );
};

export default ExprTable;
