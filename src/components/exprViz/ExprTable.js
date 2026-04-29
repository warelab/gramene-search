import React, { useCallback, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

const baseColDefs = [
  { field: 'id', headerName: 'Gene ID', pinned: 'left', width: 160, suppressMovable: true },
  { field: 'name', headerName: 'Name', pinned: 'left', width: 140, suppressMovable: true }
];

// Hoisted so the reference is stable across renders. ag-grid otherwise sees a
// "new" defaultColDef on every parent re-render (e.g. when hovering a row
// triggers setHoveredId in the parent) and re-applies column state, which
// snaps any user-resized columns back to their original widths.
const DEFAULT_COL_DEF = {
  resizable: true,
  sortable: true,
  filter: false,
  suppressMenu: true,
  // Click cycle: input order → descending → ascending → input order. The
  // ag-grid default is asc → desc → null; for expression data the
  // top-of-column user usually wants is "highest first," so we hit that on
  // the first click.
  sortingOrder: ['desc', 'asc', null]
};

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function buildFieldInfo(fields, studies, expressionSamples) {
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

// Plain right-aligned label cell for the metadata header rows above the
// Gene ID / Name columns. Rendered as a React component (instead of
// relying on ag-grid's default group label) so the alignment is controlled
// by our own DOM and isn't fighting the quartz theme's CSS.
const LabelHeaderGroup = (props) => {
  const { displayName } = props;
  return <div className="exprviz-label-header">{displayName}</div>;
};

// Same idea, but for the cells that toggle a section between expanded and
// collapsed. The caret + label sit at the right edge.
const ToggleHeaderGroup = (props) => {
  const { displayName, onToggle, expanded, suffix } = props;
  return (
    <div
      className="exprviz-toggle-header"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle && onToggle(); } }}
      title={expanded ? 'Click to collapse' : 'Click to expand'}
    >
      <span className="exprviz-toggle-caret">{expanded ? '▼' : '▶'}</span>
      {' '}{displayName}{suffix ? ` ${suffix}` : ''}
    </div>
  );
};

function exprValueFormatter(p) {
  const v = p.value;
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Discover every distinct factor and characteristic type across the loaded
// fields. Each becomes one header row (with adjacent equal-value cells
// merged). Order is alphabetical for stability across reloads.
function collectMetadataTypes(fields, fieldInfo) {
  const factorTypes = new Set();
  const charTypes = new Set();
  for (const f of fields || []) {
    const info = fieldInfo[f];
    if (!info) continue;
    Object.keys(info.factors || {}).forEach(t => factorTypes.add(t));
    Object.keys(info.characteristics || {}).forEach(t => charTypes.add(t));
  }
  return {
    factorTypes: Array.from(factorTypes).sort(),
    charTypes: Array.from(charTypes).sort()
  };
}

// Wrap a leaf column in N nested column groups so it participates at every
// header row, with a custom label per level. Lets the Gene ID / Name columns
// carry the row labels ("Study"/"Factor"/"Characteristic" and the type name).
function wrapLeafWithLabels(leaf, labels) {
  let wrapped = leaf;
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i];
    const cls = label.headerClass
      ? `${label.headerClass} exprviz-hg-labels`
      : 'exprviz-hg-labels';
    wrapped = {
      headerName: label.headerName,
      headerClass: cls,
      // Always render through one of our components so the alignment and
      // spacing are controlled by our own DOM, not ag-grid's defaults.
      headerGroupComponent: label.headerGroupComponent || LabelHeaderGroup,
      headerGroupComponentParams: label.headerGroupComponentParams,
      children: [wrapped]
    };
  }
  return wrapped;
}

// Build the column tree:
//   row 1            — Study           |  Title           |  <study description>…
//   row 2..(2+F-1)   — Factor          |  <factor type>   |  <value or blank>…
//   row 2+F..end-1   — Characteristic  |  <char type>     |  <value or blank>…
//   leaf row         — Gene ID         |  Name            |  g3, g4, …
// Adjacent expression cells sharing the same value at a given level merge
// (because they're children of one group definition). Blank values for a
// type that's defined only in other studies render as empty cells, and
// adjacent blanks under the same parent merge automatically.
function buildColumnDefs(fields, fieldInfo, expanded, toggles) {
  if (!fields || fields.length === 0) return baseColDefs;
  const { factorTypes, charTypes } = collectMetadataTypes(fields, fieldInfo);

  const levels = [{ kind: 'study', getValue: (info) => (info && info.studyDescription) || '' }];
  if (expanded.factors) {
    for (const t of factorTypes) {
      levels.push({
        kind: 'factor', type: t,
        getValue: (info) => (info && info.factors && info.factors[t]) || '',
        headerClass: 'exprviz-hg-factors'
      });
    }
  } else if (factorTypes.length > 0) {
    // One placeholder level standing in for the collapsed factor rows.
    levels.push({
      kind: 'factors-collapsed',
      getValue: () => '',
      headerClass: 'exprviz-hg-factors exprviz-hg-collapsed'
    });
  }
  if (expanded.chars) {
    for (const t of charTypes) {
      levels.push({
        kind: 'char', type: t,
        getValue: (info) => (info && info.characteristics && info.characteristics[t]) || '',
        headerClass: 'exprviz-hg-chars'
      });
    }
  } else if (charTypes.length > 0) {
    levels.push({
      kind: 'chars-collapsed',
      getValue: () => '',
      headerClass: 'exprviz-hg-chars exprviz-hg-collapsed'
    });
  }

  // Walk fields, opening a new group at level i (and resetting all levels
  // below) the first time the value at level i differs from the previous
  // field's. Same value → same parent group → ag-grid merges the cells.
  const exprTopGroups = [];
  const currentGroups = new Array(levels.length).fill(null);
  const currentKeys = new Array(levels.length).fill(undefined);

  for (const f of fields) {
    const info = fieldInfo[f] || {};
    let firstChange = levels.length;
    for (let i = 0; i < levels.length; i++) {
      const key = levels[i].getValue(info);
      if (currentGroups[i] === null || currentKeys[i] !== key) {
        firstChange = i;
        break;
      }
    }
    for (let i = firstChange; i < levels.length; i++) {
      const key = levels[i].getValue(info);
      const group = {
        headerName: key,
        headerClass: levels[i].headerClass,
        children: []
      };
      currentGroups[i] = group;
      currentKeys[i] = key;
      if (i === 0) exprTopGroups.push(group);
      else currentGroups[i - 1].children.push(group);
    }

    const leaf = {
      field: f,
      headerName: info.group || f.replace(/__expr$/, ''),
      width: 160,
      suppressMovable: false,
      valueFormatter: exprValueFormatter
    };
    currentGroups[levels.length - 1].children.push(leaf);
  }

  // Labels for the two pinned columns. The leftmost column carries the row
  // category ("Study" / "Factor" / "Characteristic"); the next column shows
  // the specific row name (the literal "Title" for the study row, then each
  // factor/characteristic type name). The first row of each
  // factor/characteristic section gets a clickable caret that toggles the
  // section between expanded (one row per type) and collapsed (one
  // placeholder row).
  const studyLabels = [{ headerName: 'Study' }];
  const titleLabels = [{ headerName: 'Title' }];

  if (expanded.factors) {
    factorTypes.forEach((t, i) => {
      studyLabels.push({
        headerName: 'Factor',
        headerClass: 'exprviz-hg-factors',
        ...(i === 0 ? {
          headerGroupComponent: ToggleHeaderGroup,
          headerGroupComponentParams: { onToggle: toggles.toggleFactors, expanded: true }
        } : {})
      });
      titleLabels.push({ headerName: t, headerClass: 'exprviz-hg-factors' });
    });
  } else if (factorTypes.length > 0) {
    studyLabels.push({
      headerName: 'Factors',
      headerClass: 'exprviz-hg-factors exprviz-hg-collapsed',
      headerGroupComponent: ToggleHeaderGroup,
      headerGroupComponentParams: {
        onToggle: toggles.toggleFactors,
        expanded: false,
        suffix: `(${factorTypes.length})`
      }
    });
    titleLabels.push({ headerName: '', headerClass: 'exprviz-hg-factors exprviz-hg-collapsed' });
  }

  if (expanded.chars) {
    charTypes.forEach((t, i) => {
      studyLabels.push({
        headerName: 'Characteristic',
        headerClass: 'exprviz-hg-chars',
        ...(i === 0 ? {
          headerGroupComponent: ToggleHeaderGroup,
          headerGroupComponentParams: { onToggle: toggles.toggleChars, expanded: true }
        } : {})
      });
      titleLabels.push({ headerName: t, headerClass: 'exprviz-hg-chars' });
    });
  } else if (charTypes.length > 0) {
    studyLabels.push({
      headerName: 'Characteristics',
      headerClass: 'exprviz-hg-chars exprviz-hg-collapsed',
      headerGroupComponent: ToggleHeaderGroup,
      headerGroupComponentParams: {
        onToggle: toggles.toggleChars,
        expanded: false,
        suffix: `(${charTypes.length})`
      }
    });
    titleLabels.push({ headerName: '', headerClass: 'exprviz-hg-chars exprviz-hg-collapsed' });
  }

  const idCol = wrapLeafWithLabels(baseColDefs[0], studyLabels);
  const nameCol = wrapLeafWithLabels(baseColDefs[1], titleLabels);

  return [idCol, nameCol, ...exprTopGroups];
}

const ExprTable = ({ rows, fields, onReorder, studies, expressionSamples, onHoverRow, onDisplayedOrderChange }) => {
  const fieldInfo = useMemo(
    () => buildFieldInfo(fields, studies, expressionSamples),
    [fields, studies, expressionSamples]
  );

  // Default: factor rows expanded, characteristic rows collapsed (per spec).
  const [expanded, setExpanded] = useState({ factors: true, chars: false });
  const toggleFactors = useCallback(
    () => setExpanded(e => ({ ...e, factors: !e.factors })),
    []
  );
  const toggleChars = useCallback(
    () => setExpanded(e => ({ ...e, chars: !e.chars })),
    []
  );

  const columnDefs = useMemo(
    () => buildColumnDefs(fields, fieldInfo, expanded, { toggleFactors, toggleChars }),
    [fields, fieldInfo, expanded, toggleFactors, toggleChars]
  );

  // ag-grid emits modelUpdated after the rowData/sort/filter pipeline runs,
  // so this single hook covers user-driven sort changes AND the auto-resort
  // that ag-grid performs whenever the rowData prop is replaced (e.g. when
  // the parallel-coords brush narrows filteredRows). Walking
  // forEachNodeAfterFilterAndSort gives us the rows in their current
  // displayed order; we pass that up so the heatmap can mirror the table.
  const handleModelUpdated = useCallback((e) => {
    if (!onDisplayedOrderChange || !e.api) return;
    const out = [];
    e.api.forEachNodeAfterFilterAndSort(node => {
      if (node.data) out.push(node.data);
    });
    onDisplayedOrderChange(out);
  }, [onDisplayedOrderChange]);

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
        defaultColDef={DEFAULT_COL_DEF}
        animateRows={false}
        suppressFieldDotNotation={true}
        suppressDragLeaveHidesColumns={true}
        suppressColumnVirtualisation={true}
        groupHeaderHeight={24}
        onColumnMoved={onColumnMoved}
        onModelUpdated={handleModelUpdated}
        onCellMouseOver={e => onHoverRow && onHoverRow(e.data && e.data.id)}
        onCellMouseOut={() => onHoverRow && onHoverRow(null)}
      />
    </div>
  );
};

export default ExprTable;
