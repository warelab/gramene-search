import React from 'react';
import { connect } from 'redux-bundler-react';
import { BsArrowUp, BsArrowDown, BsX } from 'react-icons/bs';

const SelectedFieldsCmp = props => {
  const {
    fieldCatalog: catalog,
    exporterSelectedFields,
    doToggleExporterField,
    doReorderExporterFields,
    doClearExporterFields
  } = props;

  const fields = catalog && catalog.fields ? catalog.fields : {};

  const move = (idx, delta) => {
    const next = [...exporterSelectedFields];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    doReorderExporterFields(next);
  };

  return (
    <div className="exporter-selected">
      <div className="exporter-selected-header">
        <b>Selected fields</b>
        <span className="exporter-selected-count">{exporterSelectedFields.length}</span>
        {exporterSelectedFields.length > 0 && (
          <button
            className="btn btn-sm btn-link exporter-clear-btn"
            onClick={doClearExporterFields}
          >clear</button>
        )}
      </div>
      {exporterSelectedFields.length === 0 ? (
        <div className="exporter-panel-empty">
          <em>Pick fields from the catalog on the left.</em>
        </div>
      ) : (
        <ol className="exporter-selected-list">
          {exporterSelectedFields.map((name, idx) => {
            const f = fields[name];
            const label = f ? f.label : name;
            return (
              <li key={name}>
                <span className="exporter-selected-index">{idx + 1}.</span>
                <span className="exporter-selected-label" title={name}>
                  {label}
                  {f && f.group && <small className="exporter-selected-group"> · {f.group}</small>}
                </span>
                <span className="exporter-selected-actions">
                  <button
                    className="btn btn-sm btn-light"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                    title="Move up"
                  ><BsArrowUp/></button>
                  <button
                    className="btn btn-sm btn-light"
                    disabled={idx === exporterSelectedFields.length - 1}
                    onClick={() => move(idx, 1)}
                    title="Move down"
                  ><BsArrowDown/></button>
                  <button
                    className="btn btn-sm btn-light"
                    onClick={() => doToggleExporterField(name)}
                    title="Remove"
                  ><BsX/></button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectExporterSelectedFields',
  'doToggleExporterField',
  'doReorderExporterFields',
  'doClearExporterFields',
  SelectedFieldsCmp
);
