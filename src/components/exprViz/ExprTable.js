import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

const baseColDefs = [
  { field: 'id', headerName: 'Gene ID', pinned: 'left', width: 160 },
  { field: 'name', headerName: 'Name', width: 140 },
  { field: 'system_name', headerName: 'System', width: 140 }
];

const ExprTable = ({ rows, fields }) => {
  const columnDefs = useMemo(() => {
    const expressionCols = (fields || []).map(f => ({
      field: f,
      headerName: f,
      width: 160,
      valueFormatter: p => {
        const v = p.value;
        if (v == null) return '';
        if (Array.isArray(v)) return v.join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }
    }));
    return [...baseColDefs, ...expressionCols];
  }, [fields]);

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
      />
    </div>
  );
};

export default ExprTable;
