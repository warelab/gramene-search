import React, { useState, useRef, useCallback, useEffect } from 'react';
import { connect } from 'redux-bundler-react';
import FieldTree from './FieldTree';
import Preview from './Preview';
import ExportFooter from './ExportFooter';
import './styles.css';

const MIN_LEFT_PCT = 15;
const MAX_LEFT_PCT = 85;

const ExporterViewCmp = props => {
  const {
    fieldCatalog: catalog,
    grameneFieldCatalogIsLoading: isLoading,
    grameneFieldCatalogRaw: raw,
    grameneFieldCatalogShouldUpdate: shouldUpdate,
    doFetchGrameneFieldCatalog
  } = props;
  const [fieldQuery, setFieldQuery] = useState('');
  const [leftPct, setLeftPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (shouldUpdate) doFetchGrameneFieldCatalog();
  }, [shouldUpdate, doFetchGrameneFieldCatalog]);

  const onPointerMove = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    if (!Number.isFinite(pct)) return;
    setLeftPct(Math.max(MIN_LEFT_PCT, Math.min(MAX_LEFT_PCT, pct)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = prev;
    };
  }, [dragging, onPointerMove]);

  if (!catalog || !catalog.groups) {
    const msg = isLoading ? 'Loading…' : (raw && raw.error) ? `error: ${String(raw.error)}` : 'init';
    return (
      <div className="exporter-view">
        <em style={{padding: '1rem'}}>Loading field catalog… ({msg})</em>
      </div>
    );
  }

  const gridStyle = {
    gridTemplateColumns: `${leftPct}% 8px ${100 - leftPct}%`
  };

  return (
    <div className="exporter-view" ref={containerRef} style={gridStyle}>
      <div className="exporter-pane">
        <div className="exporter-pane-header exporter-pane-header-row">
          <b>Available fields</b>
          <small style={{color: '#888', marginLeft: '0.5rem'}}>
            {Object.keys(catalog.fields).length} total
          </small>
          <input
            type="search"
            className="form-control exporter-field-search exporter-field-search-inline"
            placeholder="Search fields…"
            value={fieldQuery}
            onChange={e => setFieldQuery(e.target.value)}
          />
        </div>
        <div className="exporter-pane-body">
          <FieldTree query={fieldQuery}/>
        </div>
      </div>

      <div
        className={'exporter-divider' + (dragging ? ' dragging' : '')}
        onPointerDown={e => { e.preventDefault(); setDragging(true); }}
        onDoubleClick={() => setLeftPct(50)}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
      />

      <div className="exporter-pane exporter-right-pane">
        <div className="exporter-right-split">
          <div className="exporter-preview-section">
            <Preview/>
          </div>
          <ExportFooter/>
        </div>
      </div>
    </div>
  );
};

export default connect(
  'selectFieldCatalog',
  'selectGrameneFieldCatalogIsLoading',
  'selectGrameneFieldCatalogRaw',
  'selectGrameneFieldCatalogShouldUpdate',
  'doFetchGrameneFieldCatalog',
  ExporterViewCmp
);
