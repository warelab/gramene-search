import React, { useState, useMemo } from 'react';
import { connect } from 'redux-bundler-react';
import { BsChevronDown, BsChevronRight } from 'react-icons/bs';

const MAX_VISIBLE_PER_GROUP = 200;

function collectFieldNames(group) {
  const names = [...(group.fields || [])];
  for (const s of group.subgroups || []) names.push(...collectFieldNames(s));
  return names;
}

function collectMatchingFieldNames(group) {
  const names = [...(group.matchingFields || [])];
  for (const s of group.subgroups || []) names.push(...collectMatchingFieldNames(s));
  return names;
}

function filterGroup(group, q, catalog) {
  const matchingFields = (group.fields || []).filter(name => {
    if (!q) return true;
    const f = catalog.fields[name];
    return name.toLowerCase().includes(q) || (f && f.label.toLowerCase().includes(q));
  });
  const groupLabelMatches = q && group.label && group.label.toLowerCase().includes(q);
  const subgroups = (group.subgroups || [])
    .map(s => filterGroup(s, groupLabelMatches ? '' : q, catalog))
    .filter(s => s);
  if (!q) return { ...group, matchingFields, subgroups };
  if (groupLabelMatches) {
    return {
      ...group,
      matchingFields: group.fields || [],
      subgroups: (group.subgroups || []).map(s => filterGroup(s, '', catalog))
    };
  }
  if (matchingFields.length === 0 && subgroups.length === 0) return null;
  return { ...group, matchingFields, subgroups };
}

const FieldRow = ({ name, catalog, selectedSet, onToggle }) => {
  const f = catalog.fields[name];
  if (!f) return null;
  return (
    <li>
      <label title={name + (f.description ? '\n' + f.description : '')}>
        <input
          type="checkbox"
          checked={selectedSet.has(name)}
          onChange={() => onToggle(name)}
        />
        <span className="exporter-field-label">{f.label}</span>
        {f.multiValued && <span className="exporter-field-badge">[]</span>}
      </label>
    </li>
  );
};

const GroupNode = ({ group, depth, catalog, selectedSet, onToggle, onBulkSet, openMap, setOpen, forceOpen }) => {
  const matchingNames = collectMatchingFieldNames(group);
  const total = matchingNames.length;
  const selectedCount = matchingNames.reduce((n, name) => n + (selectedSet.has(name) ? 1 : 0), 0);
  const allSelected = total > 0 && selectedCount === total;
  const noneSelected = selectedCount === 0;
  const isOpen = forceOpen || openMap[group.id] || false;
  const visible = (group.matchingFields || []).slice(0, MAX_VISIBLE_PER_GROUP);
  const truncated = (group.matchingFields || []).length - visible.length;

  const handleBulk = (e, selected) => {
    e.stopPropagation();
    if (matchingNames.length === 0) return;
    onBulkSet(matchingNames, selected);
  };

  return (
    <div className="exporter-group" style={{ marginLeft: depth > 0 ? '0.75rem' : 0 }}>
      <div className="exporter-group-header" onClick={() => setOpen(group.id, !isOpen)}>
        <span className="exporter-group-chevron">
          {isOpen ? <BsChevronDown/> : <BsChevronRight/>}
        </span>
        <b>{group.label}</b>
        <span className="exporter-group-actions">
          <button
            type="button"
            className="exporter-group-action"
            disabled={allSelected || total === 0}
            onClick={e => handleBulk(e, true)}
            title="Select all fields in this group"
          >All</button>
          <button
            type="button"
            className="exporter-group-action"
            disabled={noneSelected}
            onClick={e => handleBulk(e, false)}
            title="Deselect all fields in this group"
          >None</button>
        </span>
        <span className="exporter-group-count">{selectedCount}/{total}</span>
      </div>
      {isOpen && (
        <>
          {(group.subgroups || []).map(sub => (
            <GroupNode
              key={sub.id}
              group={sub}
              depth={depth + 1}
              catalog={catalog}
              selectedSet={selectedSet}
              onToggle={onToggle}
              onBulkSet={onBulkSet}
              openMap={openMap}
              setOpen={setOpen}
              forceOpen={forceOpen}
            />
          ))}
          {visible.length > 0 && (
            <ul className="exporter-group-fields">
              {visible.map(name => (
                <FieldRow
                  key={name}
                  name={name}
                  catalog={catalog}
                  selectedSet={selectedSet}
                  onToggle={onToggle}
                />
              ))}
              {truncated > 0 && (
                <li className="exporter-group-truncated">
                  <em>… {truncated} more. Refine search to see.</em>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

const FieldTreeCmp = props => {
  const { fieldCatalog: catalog, exporterSelectedFields, doToggleExporterField, doBulkSetExporterFields } = props;
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState({});

  const selectedSet = useMemo(() => new Set(exporterSelectedFields), [exporterSelectedFields]);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!catalog || !catalog.groups) return [];
    return catalog.groups
      .map(g => filterGroup(g, q, catalog))
      .filter(g => g && ((g.matchingFields && g.matchingFields.length) || (g.subgroups && g.subgroups.length)));
  }, [catalog, q]);

  if (!catalog || !catalog.groups) {
    return <div className="exporter-panel-empty">Loading field catalog…</div>;
  }

  const setOpen = (id, val) => setOpenMap(s => ({ ...s, [id]: val }));
  const forceOpen = !!q;

  return (
    <div className="exporter-field-tree">
      <input
        type="search"
        className="form-control exporter-field-search"
        placeholder="Search fields…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="exporter-field-tree-body">
        {filtered.map(group => (
          <GroupNode
            key={group.id}
            group={group}
            depth={0}
            catalog={catalog}
            selectedSet={selectedSet}
            onToggle={doToggleExporterField}
            onBulkSet={doBulkSetExporterFields}
            openMap={openMap}
            setOpen={setOpen}
            forceOpen={forceOpen}
          />
        ))}
        {filtered.length === 0 && (
          <div className="exporter-panel-empty">No fields match "{query}".</div>
        )}
      </div>
    </div>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectExporterSelectedFields',
  'doToggleExporterField',
  'doBulkSetExporterFields',
  FieldTreeCmp
);
